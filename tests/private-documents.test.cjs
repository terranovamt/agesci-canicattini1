const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { startNasDev } = require("../tools/nas-dev.cjs");
const { createPrivateDocuments } = require("../server/private-documents.cjs");

const basePath = "/agesci-canicattini1";
const branches = [
  ["7654321", "L/C"],
  ["7654322", "E/G"],
];
const pdf = Buffer.from("%PDF-1.4\nprivate document\n%%EOF\n");
const document = (title, category) => ({
  title,
  description: "Documento di prova",
  year: 2026,
  publishedAt: "2026-01-15",
  category,
  visibility: "private",
});

test("private documents require a chief session while branch categories remain a filter, not an ACL", async () => {
  const app = await startNasDev({ basePath, censusCodes: branches.map(([code]) => code).join(",") });
  let cookie = "";
  const request = async (route, method = "GET", data, authenticated = true) => {
    const response = await fetch(app.origin + basePath + route, {
      method,
      headers: {
        Origin: app.origin,
        "Content-Type": "application/json",
        ...(authenticated && cookie ? { Cookie: cookie } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  };
  const login = async (code, first = false) => {
    const response = await request("/api/auth/login", "POST", first
      ? { code, password: app.password, confirmation: app.password, temporary: "Canicattini1" }
      : { code, password: app.password });
    if (response.status !== 200) throw new Error(await response.text());
  };

  try {
    assert.equal((await request("/api/private-documents", "GET", undefined, false)).status, 401);
    await login("23816938");
    const configured = await (await request("/api/people")).json();
    for (const [code, branch] of branches) {
      const person = configured.people.find((item) => item.code === code);
      assert.ok(person);
      const update = await request("/api/people/" + person.id, "PATCH", { serviceBranch: branch });
      if (update.status !== 200) throw new Error(await update.text());
    }

    const save = async (item) => {
      const response = await request("/api/private-documents", "POST", {
        operation: "save",
        document: item,
        content: pdf.toString("base64"),
      });
      if (response.status !== 200) throw new Error(await response.text());
      return response.json();
    };
    const group = await save(document("Privato Gruppo", "group"));
    const lc = await save(document("Privato L/C", "L/C"));
    const eg = await save(document("Privato E/G", "E/G"));

    const publicIndex = await (await request("/documents/index.json")).json();
    assert.equal(publicIndex.some((item) => ["Privato Gruppo", "Privato L/C", "Privato E/G"].includes(item.title)), false);
    assert.equal((await request("/api/private-documents/" + lc.id + "/pdf", "GET", undefined, false)).status, 401);

    const lcPerson = configured.people.find((person) => person.code === "7654321");
    const viewAsResponse = await request("/api/auth/view-as", "POST", { personId: lcPerson.id });
    assert.equal(viewAsResponse.status, 200);
    const viewAsDocumentsResponse = await request("/api/private-documents");
    assert.equal(viewAsDocumentsResponse.status, 200);
    const viewAsDocuments = await viewAsDocumentsResponse.json();
    assert.deepEqual(viewAsDocuments.map((item) => item.id).sort(), [group.id, lc.id, eg.id].sort());
    const returnAdmin = await request("/api/auth/view-as", "DELETE");
    assert.equal(returnAdmin.status, 200);

    await login("7654321", true);
    let response = await request("/api/private-documents");
    assert.equal(response.status, 200);
    let visible = await response.json();
    assert.deepEqual(visible.map((item) => item.id).sort(), [group.id, lc.id, eg.id].sort());
    response = await request("/api/documents", "POST", {
      operation: "save",
      document: {
        file: "public-lc.pdf",
        title: "Pubblico L/C",
        description: "Documento pubblico della branca L/C",
        year: 2026,
        publishedAt: "2026-02-01",
        category: "L/C",
        visibility: "public",
      },
      content: pdf.toString("base64"),
    });
    if (response.status !== 200) throw new Error(await response.text());
    response = await request("/api/documents", "POST", {
      operation: "save",
      document: {
        file: "public-eg.pdf",
        title: "Pubblico E/G",
        description: "Documento di un'altra branca",
        year: 2026,
        publishedAt: "2026-02-01",
        category: "E/G",
        visibility: "public",
      },
      content: pdf.toString("base64"),
    });
    if (response.status !== 200) throw new Error(await response.text());
    const publicRowsResponse = await request("/documents/index.json", "GET", undefined, false);
    assert.equal(publicRowsResponse.status, 200);
    const publicRows = await publicRowsResponse.json();
    assert.ok(publicRows.some((item) => item.title === "Pubblico L/C" && item.category === "L/C"));
    assert.ok(publicRows.some((item) => item.title === "Pubblico E/G" && item.category === "E/G"));
    assert.equal(publicRows.some((item) => item.title === "Privato Gruppo"), false);
    assert.equal((await request("/documents/pdf/public-lc.pdf", "GET", undefined, false)).status, 200);
    assert.equal((await request("/documents/pdf/public-eg.pdf", "GET", undefined, false)).status, 200);
    response = await request("/api/private-documents/" + lc.id + "/pdf");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    response = await request("/api/private-documents/" + eg.id + "/pdf");
    assert.equal(response.status, 200);

    await login("7654322", true);
    response = await request("/api/private-documents");
    assert.equal(response.status, 200);
    visible = await response.json();
    assert.deepEqual(visible.map((item) => item.id).sort(), [group.id, lc.id, eg.id].sort());
    assert.equal((await request("/api/private-documents/" + lc.id + "/pdf")).status, 200);

    await login("23816938");
    response = await request("/api/private-documents");
    assert.equal(response.status, 200);
    visible = await response.json();
    assert.deepEqual(visible.map((item) => item.id).sort(), [group.id, lc.id, eg.id].sort());
  } finally {
    await app.stop();
  }
});

test("document visibility transfers the same PDF atomically between public and private archives", async () => {
  const app = await startNasDev({ basePath });
  let cookie = "";
  const request = async (route, method = "GET", data, authenticated = true) => {
    const response = await fetch(app.origin + basePath + route, {
      method,
      headers: {
        Origin: app.origin,
        "Content-Type": "application/json",
        ...(authenticated && cookie ? { Cookie: cookie } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  };
  const login = async () => {
    const response = await request("/api/auth/login", "POST", { code: "23816938", password: app.password });
    if (response.status !== 200) throw new Error(await response.text());
  };

  try {
    assert.equal((await request("/api/documents/visibility", "POST", {}, false)).status, 401);
    await login();
    const content = Buffer.from("%PDF-1.4\nvisibility transfer\n%%EOF\n");
    const initial = {
      file: "visibility-transfer.pdf",
      title: "Documento da rendere privato",
      description: "PDF di prova",
      year: 2026,
      publishedAt: "2026-03-10",
      category: "L/C",
      visibility: "public",
    };
    let response = await request("/api/documents", "POST", {
      operation: "save",
      document: initial,
      content: content.toString("base64"),
    });
    assert.equal(response.status, 200);
    let rows = await response.json();
    let publicDocument = rows.find((item) => item.file === initial.file);
    assert.ok(publicDocument);

    response = await request("/api/documents/visibility", "POST", {
      source: "public",
      previous: publicDocument,
      document: { ...initial, visibility: "private", category: "public" },
    });
    assert.equal(response.status, 400);
    assert.equal((await request("/documents/pdf/" + initial.file, "GET", undefined, false)).status, 200);
    assert.equal((await (await request("/api/private-documents")).json()).length, 0);

    response = await request("/api/documents", "POST", {
      operation: "save",
      previous: publicDocument,
      document: { ...publicDocument, title: "Documento aggiornato" },
    });
    assert.equal(response.status, 200);
    rows = await response.json();
    response = await request("/api/documents/visibility", "POST", {
      source: "public",
      previous: publicDocument,
      document: { ...initial, visibility: "private" },
    });
    assert.equal(response.status, 409);
    publicDocument = rows.find((item) => item.file === initial.file);

    response = await request("/api/documents/visibility", "POST", {
      source: "public",
      previous: publicDocument,
      document: { ...initial, file: undefined, visibility: "private" },
    });
    assert.equal(response.status, 200);
    let moved = await response.json();
    assert.equal(moved.visibility, "private");
    assert.equal(moved.document.visibility, "private");
    assert.equal(moved.document.category, "L/C");
    assert.equal((await (await request("/documents/index.json", "GET", undefined, false)).json())
      .some((item) => item.file === initial.file), false);
    assert.equal((await request("/documents/pdf/" + initial.file, "GET", undefined, false)).status, 404);
    const privateId = moved.document.id;
    assert.ok((await (await request("/api/private-documents")).json())
      .some((item) => item.id === privateId));
    assert.deepEqual(Buffer.from(await (await request("/api/private-documents/" + moved.document.id + "/pdf"))
      .arrayBuffer()), content);

    response = await request("/api/documents/visibility", "POST", {
      source: "private",
      previous: moved.document,
      document: {
        title: moved.document.title,
        description: moved.document.description,
        year: moved.document.year,
        publishedAt: moved.document.publishedAt,
        category: moved.document.category,
        visibility: "public",
      },
    });
    assert.equal(response.status, 200);
    moved = await response.json();
    assert.equal(moved.visibility, "public");
    assert.equal(moved.document.visibility, "public");
    assert.match(moved.document.file, /\.pdf$/);
    assert.equal((await (await request("/api/private-documents")).json())
      .some((item) => item.id === publicDocument.id), false);
    rows = await (await request("/documents/index.json", "GET", undefined, false)).json();
    assert.ok(rows.some((item) => item.file === moved.document.file && item.category === "L/C"));
    assert.deepEqual(Buffer.from(await (await request("/documents/pdf/" + moved.document.file, "GET", undefined, false))
      .arrayBuffer()), content);
    assert.equal((await request("/api/private-documents/" + privateId + "/pdf")).status, 404);

    const preparatory = {
      ...initial,
      file: "always-public.pdf",
      title: "Preparatorio sempre pubblico",
      category: "preparatory",
      assemblyYear: 2026,
      assemblyType: "convocazione",
    };
    response = await request("/api/documents", "POST", {
      operation: "save",
      document: preparatory,
      content: content.toString("base64"),
    });
    assert.equal(response.status, 200);
    rows = await response.json();
    const preparatoryDocument = rows.find((item) => item.file === preparatory.file);
    response = await request("/api/documents/visibility", "POST", {
      source: "public",
      previous: preparatoryDocument,
      document: { ...preparatory, file: undefined, category: "group", visibility: "private" },
    });
    assert.equal(response.status, 400);
    assert.ok((await (await request("/documents/index.json", "GET", undefined, false)).json())
      .some((item) => item.file === preparatory.file));
    assert.equal((await (await request("/api/private-documents")).json())
      .some((item) => item.title === preparatory.title), false);
  } finally {
    await app.stop();
  }
});

test("migrates prior private audience records into branch and Gruppo categories", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE private_documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, year INTEGER NOT NULL,
        published_at TEXT NOT NULL, audience TEXT NOT NULL, branch TEXT, revision INTEGER NOT NULL,
        pdf BLOB NOT NULL
      );
    `);
    const insert = database.prepare(`INSERT INTO private_documents
      (id,title,description,year,published_at,audience,branch,revision,pdf)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    const content = Buffer.from("%PDF-1.4\nfixture\n");
    insert.run("00000000-0000-4000-8000-000000000011", "Solo capi", "Condiviso", 2026,
      "2026-01-15", "leaders", null, 2, content);
    insert.run("00000000-0000-4000-8000-000000000012", "L/C", "Branca", 2026,
      "2026-01-15", "branch", "L/C", 1, content);
    const documents = createPrivateDocuments(database);
    assert.deepEqual(documents.list({ admin: false, serviceBranch: "L/C" })
      .map((item) => item.category).sort(), ["L/C", "group"]);
    assert.deepEqual(documents.list({ admin: false, serviceBranch: "E/G" })
      .map((item) => item.category).sort(), ["L/C", "group"]);
  } finally {
    database.close();
  }
});
