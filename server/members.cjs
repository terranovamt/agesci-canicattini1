"use strict";

const crypto = require("node:crypto");
const M = require("../assets/js/soci-model.js");
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 500) => {
  if (typeof value !== "string" || value.length > max || value.includes("\0")) fail(400, "Testo non valido o troppo lungo");
  return value.trim();
};
const branchValue = value => {
  if (!M.branches.includes(value)) fail(400, "Branca non valida");
  return value;
};
const dateValue = value => {
  try { return M.date(value); } catch { fail(400, "Data non valida"); }
};
function createMembers(db, people) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_profiles (
      person_id INTEGER PRIMARY KEY REFERENCES people(id), branch TEXT NOT NULL,
      data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS member_censuses (
      person_id INTEGER NOT NULL REFERENCES people(id), year TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(person_id,year)
    );
    CREATE TABLE IF NOT EXISTS member_fields (
      branch TEXT NOT NULL, key TEXT NOT NULL, definition TEXT NOT NULL, PRIMARY KEY(branch,key)
    );
    CREATE TABLE IF NOT EXISTS member_values (
      person_id INTEGER NOT NULL REFERENCES people(id), branch TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(person_id,branch)
    );
    CREATE TABLE IF NOT EXISTS member_group (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, year TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS member_templates (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL);
  `);
  for (const field of M.defaultFields)
    db.prepare("INSERT OR IGNORE INTO member_fields VALUES(?,?,?)").run(field.branch, field.key, JSON.stringify(field));
  if (!db.prepare("SELECT id FROM member_templates LIMIT 1").get())
    db.prepare("INSERT INTO member_templates(title,body) VALUES(?,?)").run("Scheda interna socio",
      "Scheda interna - non sostituisce documenti ufficiali AGESCI\n\n{{nome}} {{cognome}}\nCodice socio: {{codice}}\nBranca: {{branca}}\nAnno scout: {{anno}}\nEmail: {{email}}\nTelefono: {{cellulare}}\n\nPercorso educativo:\n{{percorso}}\n\nData: {{data}}");
  const transaction = action => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = action(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const fields = () => db.prepare("SELECT definition FROM member_fields ORDER BY branch,key").all().map(row => JSON.parse(row.definition));
  const templates = () => db.prepare("SELECT * FROM member_templates ORDER BY title").all();
  const get = id => {
    const row = db.prepare("SELECT id,census_code,name,kind FROM people WHERE id=?").get(id);
    if (!row) fail(404, "Socio non trovato");
    const profile = db.prepare("SELECT * FROM member_profiles WHERE person_id=?").get(id);
    return {
      id: row.id, code: row.census_code, name: row.name, kind: row.kind,
      branch: profile?.branch || (row.kind === "capo" ? "Adulti" : ""),
      revision: profile?.revision || 0, profile: profile ? JSON.parse(profile.data) : {},
      censuses: db.prepare("SELECT year,data FROM member_censuses WHERE person_id=? ORDER BY year DESC").all(id)
        .map(row => ({ year: row.year, ...JSON.parse(row.data) })),
      values: Object.fromEntries(db.prepare("SELECT branch,data FROM member_values WHERE person_id=?").all(id)
        .map(row => [row.branch, JSON.parse(row.data)])),
    };
  };
  const requireRevision = (member, revision) => {
    if (revision !== member.revision) fail(409, "Scheda modificata da un'altra operazione: ricarica prima di salvare");
  };
  const writeProfile = (member, branch, profile) => {
    db.prepare(`INSERT INTO member_profiles VALUES(?,?,?,1) ON CONFLICT(person_id)
      DO UPDATE SET branch=excluded.branch,data=excluded.data,revision=member_profiles.revision+1`)
      .run(member.id, branch, JSON.stringify(profile));
  };
  const validateProfile = value => {
    if (!object(value) || Object.keys(value).some(key => !Object.hasOwn(M.profileFields, key))) fail(400, "Campi anagrafici non validi");
    const profile = Object.fromEntries(Object.entries(value).map(([key, value]) => [key, text(value, key === "guardians" ? 12000 : 500)]));
    if (Object.hasOwn(profile, "birthDate")) profile.birthDate = dateValue(profile.birthDate);
    if (!(profile.givenName || profile.surname)) fail(400, "Inserire nome o cognome");
    if ([profile.givenName, profile.surname].filter(Boolean).join(" ").length > 120) fail(400, "Nome e cognome troppo lunghi");
    if (profile.sex && !["M", "F"].includes(profile.sex)) fail(400, "Sesso non valido");
    for (const key of ["consent2a", "consent2b", "consent2c", "magazines"])
      if (profile[key] && !["SI", "NO"].includes(profile[key])) fail(400, "Consenso non valido");
    if (profile.digital && !["True", "False"].includes(profile.digital)) fail(400, "Gestione digitale non valida");
    return profile;
  };
  const writeValues = (member, branch, value) => {
    const definitions = fields().filter(field => field.branch === branch);
    if (!object(value) || Object.keys(value).some(key => !definitions.some(field => field.key === key))) fail(400, "Campi di branca non validi");
    const validated = {};
    for (const [key, valueText] of Object.entries(value)) {
      const definition = definitions.find(field => field.key === key);
      validated[key] = text(valueText, 2000);
      if (definition.type === "date") validated[key] = dateValue(validated[key]);
      if (definition.type === "select" && validated[key] && !definition.options.includes(validated[key])) fail(400, "Opzione di branca non valida");
    }
    db.prepare("INSERT INTO member_values VALUES(?,?,?) ON CONFLICT(person_id,branch) DO UPDATE SET data=excluded.data")
      .run(member.id, branch, JSON.stringify(validated));
  };
  const snapshot = () => ({
    members: db.prepare("SELECT id FROM people ORDER BY name,census_code").all().map(row => get(row.id)),
    fields: fields(), templates: templates(),
    group: JSON.parse(db.prepare("SELECT data FROM member_group WHERE id=1").get()?.data || "{}"),
  });
  const importPlan = csv => {
    let result;
    try { result = M.parseImport(csv); } catch (error) { fail(400, error.message); }
    for (const member of result.members) member.profile = validateProfile(member.profile);
    const existing = new Set(db.prepare("SELECT census_code FROM people").all().map(row => row.census_code));
    const unique = [...new Set(result.members.map(member => member.code))];
    return { ...result, newCount: unique.filter(code => !existing.has(code)).length,
      updatedCount: unique.filter(code => existing.has(code)).length };
  };
  const importVersion = csv => crypto.createHash("sha256").update(csv)
    .update(JSON.stringify(snapshot())).digest("hex");
  return {
    async handle(route, request, response, { body, send, sessionId }) {
      if (!route.startsWith("/api/members")) return false;
      const current = people.user(sessionId(request));
      if (!current) fail(401, "Sessione scaduta: accedi di nuovo");
      if (!current.admin) fail(403, "Gestione soci riservata all'amministratore");
      const method = request.method;
      if (route === "/api/members" && method === "GET") {
        send(response, 200, snapshot()); return true;
      }
      if (route === "/api/members" && method === "POST") {
        const value = await body(request, 64000);
        const branch = branchValue(value?.branch), profile = validateProfile(value.profile);
        if (typeof value.code !== "string" || !/^\d{5,9}$/.test(value.code)) fail(400, "Codice socio non valido");
        if (db.prepare("SELECT id FROM people WHERE census_code=?").get(value.code)) fail(409, "Codice socio gia' presente");
        const id = transaction(() => {
          const result = db.prepare("INSERT INTO people(census_code,name,kind) VALUES(?,?,?)")
            .run(value.code, [profile.givenName, profile.surname].filter(Boolean).join(" "), branch === "Adulti" ? "capo" : "ragazzo");
          const member = get(Number(result.lastInsertRowid));
          writeValues(member, branch, value.values || {});
          writeProfile(member, branch, profile);
          return member.id;
        });
        send(response, 201, { member: get(id) }); return true;
      }
      if (route === "/api/members/import" && method === "POST") {
        // JSON escaping can expand the 4 MiB CSV by up to six times.
        const value = await body(request, 25 * 1024 * 1024);
        const result = importPlan(value?.csv);
        if (value.confirm !== true) {
          send(response, 200, { newCount: result.newCount, updatedCount: result.updatedCount,
            rows: result.members.length, warnings: result.warnings, ignoredColumns: result.ignoredColumns,
            version: importVersion(value.csv) }); return true;
        }
        if (value.version !== importVersion(value.csv)) fail(409, "Dati cambiati dopo l'anteprima: analizza di nuovo il CSV");
        transaction(() => {
          // The newest census supplies the anagraphic snapshot; local branch and education stay untouched.
          result.members.sort((a, b) => a.year.localeCompare(b.year));
          for (const imported of result.members) {
            let row = db.prepare("SELECT * FROM people WHERE census_code=?").get(imported.code);
            if (!row) {
              const inserted = db.prepare("INSERT INTO people(census_code,name,kind) VALUES(?,?,?)")
                .run(imported.code, [imported.profile.givenName, imported.profile.surname].filter(Boolean).join(" "),
                  imported.branch === "Adulti" ? "capo" : "ragazzo");
              row = { id: Number(inserted.lastInsertRowid) };
            }
            const member = get(row.id);
            const previousCensus = member.censuses.find(census => census.year === imported.year);
            const previousData = { ...previousCensus };
            delete previousData.year;
            db.prepare(`INSERT INTO member_censuses VALUES(?,?,?) ON CONFLICT(person_id,year) DO UPDATE SET data=excluded.data`)
              .run(row.id, imported.year, JSON.stringify({ ...previousData, ...imported.census }));
            if (!member.censuses.length || imported.year >= member.censuses[0].year) {
              writeProfile(member, member.revision ? member.branch : imported.branch, { ...member.profile, ...imported.profile });
              db.prepare("UPDATE people SET name=? WHERE id=?")
                .run([imported.profile.givenName, imported.profile.surname].filter(Boolean).join(" "), row.id);
            }
          }
          const year = result.members.at(-1).year;
          const previousGroup = JSON.parse(db.prepare("SELECT data FROM member_group WHERE id=1").get()?.data || "{}");
          db.prepare(`INSERT INTO member_group VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET
            data=excluded.data,year=excluded.year WHERE excluded.year>=member_group.year`)
            .run(JSON.stringify({ ...previousGroup, ...result.group }), year);
        });
        send(response, 200, { ok: true, newCount: result.newCount, updatedCount: result.updatedCount }); return true;
      }
      if (route === "/api/members/fields" && method === "POST") {
        const value = await body(request, 8192);
        const branch = branchValue(value?.branch), key = text(value.key, 40), label = text(value.label, 100);
        if (!/^[a-z][a-z0-9-]{0,39}$/.test(key) || !label || !["text", "date", "select"].includes(value.type)) fail(400, "Definizione campo non valida");
        const options = value.type === "select" && Array.isArray(value.options) ? value.options.map(v => text(v, 100)) : [];
        if (value.type === "select" && (!options.length || options.length > 30 || options.some(v => !v) || new Set(options).size !== options.length))
          fail(400, "Inserire da 1 a 30 opzioni diverse");
        if (fields().some(field => field.branch === branch && field.key === key)) fail(409, "Campo gia' esistente");
        db.prepare("INSERT INTO member_fields VALUES(?,?,?)").run(branch, key, JSON.stringify({ branch, key, label, type: value.type, options }));
        send(response, 201, { ok: true }); return true;
      }
      if (route === "/api/members/templates" && method === "POST") {
        const value = await body(request, 20000);
        const title = text(value?.title, 120), templateBody = text(value.body, 12000);
        if (!title || !templateBody) fail(400, "Titolo e testo del modello obbligatori");
        const allowed = ["nome", "cognome", "codice", "branca", "anno", "email", "cellulare", "data", "percorso"];
        for (const match of templateBody.matchAll(/\{\{([^{}]+)\}\}/g))
          if (!allowed.includes(match[1])) fail(400, "Segnaposto sconosciuto: " + match[1]);
        db.prepare("INSERT INTO member_templates(title,body) VALUES(?,?)").run(title, templateBody);
        send(response, 201, { ok: true }); return true;
      }
      if (route === "/api/members/macro" && method === "POST") {
        const value = await body(request, 256 * 1024);
        if (!Array.isArray(value?.members) || !value.members.length || value.members.length > 5000 ||
            new Set(value.members.map(row => row?.id)).size !== value.members.length) fail(400, "Selezione soci non valida");
        const targetBranch = branchValue(value.branch);
        if (!["branch", "field"].includes(value.action)) fail(400, "Macro non valida");
        transaction(() => {
          for (const selected of value.members) {
            if (!Number.isSafeInteger(selected?.id)) fail(400, "Socio non valido");
            const member = get(selected.id);
            requireRevision(member, selected.revision);
            if (!member.revision) fail(400, "Completare prima la scheda anagrafica del socio");
            if (value.action === "field") {
              if (member.branch !== targetBranch) fail(400, "Selezionare solo soci della stessa branca");
              writeValues(member, targetBranch, { ...(member.values[targetBranch] || {}), [text(value.key, 40)]: value.value });
            }
            writeProfile(member, value.action === "branch" ? targetBranch : member.branch, member.profile);
          }
        });
        send(response, 200, { ok: true }); return true;
      }
      const match = /^\/api\/members\/(\d+)$/.exec(route);
      if (match && method === "PATCH") {
        const value = await body(request, 64 * 1024), member = get(Number(match[1]));
        requireRevision(member, value?.revision);
        const branch = branchValue(value.branch), profile = validateProfile(value.profile);
        transaction(() => {
          writeValues(member, branch, value.values);
          writeProfile(member, branch, profile);
          db.prepare("UPDATE people SET name=? WHERE id=?")
            .run([profile.givenName, profile.surname].filter(Boolean).join(" "), member.id);
        });
        send(response, 200, { member: get(member.id) }); return true;
      }
      fail(404, "Operazione soci non trovata");
    },
  };
}
module.exports = { createMembers };
