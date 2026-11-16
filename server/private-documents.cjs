"use strict";

const crypto = require("node:crypto");

const SERVICE_BRANCHES = new Set(["L/C", "E/G", "R/S"]);
const PRIVATE_CATEGORIES = new Set([...SERVICE_BRANCHES, "group"]);
const PDF_LIMIT = 20 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function metadata(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    year: row.year,
    publishedAt: row.published_at,
    category: row.category,
    visibility: "private",
    revision: row.revision,
  };
}

function validateDocument(document) {
  if (!object(document)) fail(400, "Documento riservato non valido");
  if (typeof document.title !== "string" || !document.title.trim() || document.title.length > 160)
    fail(400, "Inserisci un titolo valido");
  if (typeof document.description !== "string" || !document.description.trim() || document.description.length > 500)
    fail(400, "Inserisci una descrizione valida");
  if (!Number.isInteger(document.year) || document.year < 1900 || document.year > 9999)
    fail(400, "Anno del documento non valido");
  if (typeof document.publishedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(document.publishedAt) ||
      !Number.isFinite(Date.parse(document.publishedAt)) ||
      new Date(document.publishedAt).toISOString().slice(0, 10) !== document.publishedAt)
    fail(400, "Data di pubblicazione non valida");
  if (!PRIVATE_CATEGORIES.has(document.category))
    fail(400, "Categoria privata del documento non valida");
  if (document.visibility !== undefined && document.visibility !== "private")
    fail(400, "Un documento nell'archivio privato deve essere privato");
  return {
    title: document.title.trim(),
    description: document.description.trim(),
    year: document.year,
    publishedAt: document.publishedAt,
    category: document.category,
  };
}

function decodePdf(content) {
  if (typeof content !== "string" || content.length > Math.ceil(PDF_LIMIT / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))
    fail(400, "PDF non valido");
  const pdf = Buffer.from(content, "base64");
  if (pdf.length >= PDF_LIMIT || pdf.subarray(0, 5).toString() !== "%PDF-")
    fail(400, "PDF non valido o oltre 20 MiB");
  return pdf;
}

function createPrivateDocuments(database) {
  const createTable = () => database.exec(`
    CREATE TABLE IF NOT EXISTS private_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      year INTEGER NOT NULL,
      published_at TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('L/C','E/G','R/S','group')),
      revision INTEGER NOT NULL,
      pdf BLOB NOT NULL
    );
  `);
  createTable();
  const columns = new Set(database.prepare("PRAGMA table_info(private_documents)").all().map((column) => column.name));
  if (columns.has("audience") && !columns.has("category")) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec("ALTER TABLE private_documents RENAME TO private_documents_legacy");
      createTable();
      database.exec(`INSERT INTO private_documents
        (id,title,description,year,published_at,category,revision,pdf)
        SELECT id,title,description,year,published_at,
          CASE WHEN audience='branch' THEN branch ELSE 'group' END,revision,pdf
        FROM private_documents_legacy`);
      database.exec("DROP TABLE private_documents_legacy; COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  const find = (id) => database.prepare("SELECT * FROM private_documents WHERE id=?").get(id);

  function list(user) {
    if (!user) fail(401, "Sessione scaduta: accedi di nuovo");
    const rows = database.prepare(`SELECT id,title,description,year,published_at,category,revision
      FROM private_documents ORDER BY published_at DESC,title COLLATE NOCASE`).all();
    return rows.map(metadata);
  }

  function pdf(user, id) {
    if (!user) fail(401, "Sessione scaduta: accedi di nuovo");
    if (!UUID.test(id)) fail(404, "Documento riservato non trovato");
    const row = find(id);
    if (!row) fail(404, "Documento privato non trovato");
    return Buffer.from(row.pdf);
  }

  function save(user, change) {
    if (!user) fail(401, "Sessione scaduta: accedi di nuovo");
    if (!object(change) || !["save", "delete"].includes(change.operation))
      fail(400, "Operazione documenti non valida");

    if (change.operation === "delete") {
      if (!object(change.previous) || typeof change.previous.id !== "string" ||
          !UUID.test(change.previous.id) || !Number.isSafeInteger(change.previous.revision))
        fail(400, "Documento da eliminare non valido");
      const current = find(change.previous.id);
      if (!current) fail(404, "Documento privato non trovato");
      if (current.revision !== change.previous.revision) fail(409, "Documento cambiato: ricarica prima di eliminare");
      const result = database.prepare("DELETE FROM private_documents WHERE id=? AND revision=?")
        .run(current.id, current.revision);
      if (!result.changes) fail(409, "Documento cambiato: ricarica prima di eliminare");
      return null;
    }

    const previous = change.previous;
    let current = null;
    if (previous !== undefined) {
      if (!object(previous) || typeof previous.id !== "string" || !UUID.test(previous.id) ||
          !Number.isSafeInteger(previous.revision))
        fail(400, "Versione precedente del documento non valida");
      current = find(previous.id);
      if (!current) fail(404, "Documento privato non trovato");
      if (current.revision !== previous.revision) fail(409, "Documento cambiato: ricarica prima di salvarlo");
      if (change.document?.id !== undefined && change.document.id !== current.id)
        fail(400, "Identificativo documento non valido");
    } else if (change.document?.id !== undefined) {
      fail(400, "Non puoi scegliere l’identificativo del documento");
    }

    const next = validateDocument(change.document);
    const pdf = change.content === undefined ? current?.pdf : decodePdf(change.content);
    if (!pdf) fail(400, "Seleziona un PDF da caricare");
    const id = current?.id || crypto.randomUUID();
    const revision = current ? current.revision + 1 : 1;
    if (current) {
      const result = database.prepare(`UPDATE private_documents SET
        title=?,description=?,year=?,published_at=?,category=?,revision=?,pdf=?
        WHERE id=? AND revision=?`)
        .run(next.title, next.description, next.year, next.publishedAt, next.category,
          revision, pdf, id, current.revision);
      if (!result.changes) fail(409, "Documento cambiato: ricarica prima di salvarlo");
    } else {
      database.prepare(`INSERT INTO private_documents
        (id,title,description,year,published_at,category,revision,pdf)
        VALUES(?,?,?,?,?,?,?,?)`)
        .run(id, next.title, next.description, next.year, next.publishedAt, next.category, revision, pdf);
    }
    return metadata(find(id));
  }

  return { list, pdf, save };
}

module.exports = { createPrivateDocuments };
