const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const model = require("../assets/js/documents-model.js");

test("preparatory slots always follow the five categories across filenames, years and publication dates", () => {
  const document = (file, title, assemblyType, publishedAt = "2026-01-01") => ({
    file, title, description: "Test", assemblyYear: 2026, publishedAt, ...(assemblyType ? { assemblyType } : {}),
  });
  const items = [
    document("minutes.pdf", "Documento finale", "verbale"),
    document("PEG27.pdf", "PEG 2027", undefined),
    document("account.pdf", "Rendiconto per cassa", undefined),
    document("rules.pdf", "Regolamento assembleare", undefined),
    document("invite.pdf", "Convocazione", undefined),
    document("new-invite.pdf", "Nuova convocazione", "convocazione", "2026-11-01"),
    { ...document("old-minutes.pdf", "Verbale precedente", "verbale"), assemblyYear: 2025 },
  ];
  const original = JSON.stringify(items);
  const slots = model.preparatorySlots(items, 2026);
  assert.deepEqual(slots.map(slot => slot.label), ["Convocazione", "Regolamento", "PEG", "Bilancio", "Verbale"]);
  assert.deepEqual(slots.map(slot => slot.document.file), ["new-invite.pdf", "rules.pdf", "PEG27.pdf", "account.pdf", "minutes.pdf"]);
  assert.equal(model.preparatory(items, 2026).length, 6);
  assert.equal(JSON.stringify(items), original);
  assert.equal(model.preparatorySlots([], 2027).length, 5);
  assert.equal(model.preparatorySlots([], 2027).every(slot => slot.document === null), true);
  assert.throws(() => model.validate([document("bad.pdf", "Bad", "unknown")]), /non valido/);
});
const source = fs.readFileSync(path.join(__dirname, "../assets/js/documents-store.js"), "utf8");
const document = { file: "Progetto.pdf", title: "Progetto educativo", description: "Il progetto del gruppo." };
const base64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64");

function store(fetch, nas = false) {
  const removed = [];
  const context = {
    window: { LIVE: { nas, github: { repo: "test/repo", ramo: "feature/docs" } }, DOCUMENTS_MODEL: model },
    fetch,
    TextDecoder,
    Uint8Array,
    atob,
    localStorage: { removeItem: (key) => removed.push(key) },
  };
  vm.runInNewContext(source, context);
  return { api: context.window.DOCUMENTS, removed };
}

test("NAS document operations use local endpoints and never require a GitHub token", async () => {
  const calls = [];
  const { api } = store(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => [document] };
  }, true);
  await api.load("");
  await api.save({ operation: "save", document }, "");
  assert.deepEqual(
    calls.map((call) => call.url),
    ["/documents/index.json", "/api/documents"],
  );
  assert.equal(calls[1].options.headers.Authorization, undefined);
});

test("document model accepts PDF metadata and rejects duplicates, invalid paths and stale writes", () => {
  assert.equal(model.apply([], { operation: "save", document }).length, 1);
  for (const file of ["../test.pdf", "test.txt", ".secret.pdf", "x\\test.pdf", "x\n.pdf"]) {
    assert.throws(() => model.validate([{ ...document, file }]), /non valido/);
  }
  assert.throws(() => model.validate([document, document]), /non valido/);
  assert.throws(() => model.apply([document], { operation: "save", document }), /cambiato/);
  assert.throws(
    () =>
      model.apply([document], {
        operation: "save",
        previous: document,
        document: { ...document, file: "renamed.pdf" },
      }),
    /nome del file/,
  );
  const changed = model.apply([document], {
    operation: "save",
    previous: document,
    document: { ...document, title: "Nuovo titolo" },
  });
  assert.equal(changed[0].title, "Nuovo titolo");
  assert.equal(document.title, "Progetto educativo");
  assert.deepEqual(model.apply([document], { operation: "delete", previous: document }), []);
});

test("document years and publication dates are validated and preserved on save", () => {
  const dated = { ...document, year: 2026, publishedAt: "2026-11-05" };
  assert.deepEqual(model.apply([], { operation: "save", document: dated }), [dated]);
  const updated = { ...dated, title: "Titolo aggiornato", year: 2027, publishedAt: "2027-01-03" };
  assert.deepEqual(model.apply([dated], { operation: "save", previous: dated, document: updated }), [updated]);
  for (const year of [0, 1899, 10000, 2026.5, "2026", null]) {
    assert.throws(() => model.validate([{ ...dated, year }]), /Anno/);
  }
  for (const publishedAt of ["", "05/11/2026", "2026-02-30", "2026-13-01", null]) {
    assert.throws(() => model.validate([{ ...dated, publishedAt }]), /Data/);
  }
});

test("preparatory documents are an annual subset of the full archive", () => {
  const current = { ...document, assemblyYear: 2026 };
  const older = { ...document, file: "Precedente.pdf", assemblyYear: 2025 };
  const general = { ...document, file: "Generale.pdf" };
  const items = [current, older, general];
  assert.deepEqual(model.preparatory(items, 2026), [current]);
  assert.deepEqual(model.preparatory(items, 2025), [older]);
  assert.deepEqual(model.preparatory(items, 2027), []);
  assert.equal(model.validate(items).length, 3);
  for (const assemblyYear of [null, "2026", 1999, 10000, 2026.5]) {
    assert.throws(() => model.validate([{ ...document, assemblyYear }]), /non valido/);
  }
  const updated = model.apply([current], { operation: "save", previous: current, document });
  assert.equal(updated[0].assemblyYear, undefined);
});

test("GitHub save writes PDF and metadata atomically and updates the configured branch without force", async () => {
  const calls = [];
  const replies = [
    { object: { sha: "parent" } },
    { tree: { sha: "old-tree" } },
    { content: base64([]) },
    { sha: "pdf-blob" },
    { sha: "new-tree" },
    { sha: "new-commit" },
    {},
  ];
  const { api } = store(async (url, options) => {
    calls.push({ url, ...options, body: options.body && JSON.parse(options.body) });
    return { ok: true, json: async () => replies.shift() };
  });
  const result = await api.save({ operation: "save", document, content: "JVBERi0=" }, "test-token");
  assert.equal(result[0].title, document.title);
  assert.match(calls[0].url, /\/git\/ref\/heads\/feature%2Fdocs$/);
  assert.match(calls[2].url, /\?ref=parent$/);
  assert.equal(calls[3].body.encoding, "base64");
  assert.equal(calls[4].body.base_tree, "old-tree");
  assert.equal(calls[4].body.tree[0].path, "documents/index.json");
  assert.equal(JSON.parse(calls[4].body.tree[0].content)[0].title, document.title);
  assert.equal(calls[4].body.tree[1].path, "documents/pdf/Progetto.pdf");
  assert.equal(calls[5].body.parents[0], "parent");
  assert.deepEqual(calls[6].body, { sha: "new-commit", force: false });
  assert.equal(calls[6].method, "PATCH");
  assert.equal(calls[6].headers.Authorization, "Bearer test-token");
});

test("document deletion removes metadata and the PDF in the same commit", async () => {
  const calls = [];
  const replies = [
    { object: { sha: "parent" } },
    { tree: { sha: "old-tree" } },
    { content: base64([document]) },
    { sha: "new-tree" },
    { sha: "new-commit" },
    {},
  ];
  const { api } = store(async (url, options) => {
    calls.push({ url, body: options.body && JSON.parse(options.body) });
    return { ok: true, json: async () => replies.shift() };
  });
  await api.save({ operation: "delete", previous: document }, "test-token");
  const tree = calls[3].body.tree;
  assert.deepEqual(JSON.parse(tree[0].content), []);
  assert.equal(tree[1].sha, null);
  assert.equal(tree[1].path, "documents/pdf/Progetto.pdf");
});

test("token and concurrency errors are visible and never return successful saves", async () => {
  for (const status of [401, 403, 409, 422, 500]) {
    const { api, removed } = store(async () => ({ ok: false, status }));
    await assert.rejects(api.save({ operation: "save", document }, "bad-token"), /Token|HTTP|Conflitto/);
    assert.equal(removed.length, status === 401 ? 1 : 0);
  }
  const { api } = store(() => {
    throw new Error("must not fetch");
  });
  await assert.rejects(api.load(""), /token/);
});

test("the supplied PDF files match the public manifest", () => {
  const index = model.validate(JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/index.json"), "utf8")));
  assert.equal(index.length, 4);
  assert.deepEqual(
    index.map((item) => item.file),
    [
      "PEG26-28.pdf",
      "Rendiconto_per_cassa_-_ModelloD.pdf",
      "ConvocaAssemblea26.pdf",
      "RegolamentoAssembleaCanicattini1.pdf",
    ],
  );
  assert.match(index[1].title, /2026.*Modello D/);
  for (const item of index) {
    const pdf = fs.readFileSync(path.join(__dirname, "../documents/pdf", item.file));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 1000);
  }
});
