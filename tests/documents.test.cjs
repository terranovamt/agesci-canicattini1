const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const model = require("../assets/js/documents-model.js");

test("preparatory slots follow the five categories across filenames, years and publication dates", () => {
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

function store(fetch, basePath = "", request = async () => []) {
  const context = {
    window: {
      LIVE: { basePath },
      NAS: { basePath },
      ACCESSO: { request },
      DOCUMENTS_MODEL: model,
    },
    fetch,
    TextDecoder,
    Uint8Array,
    atob,
  };
  vm.runInNewContext(source, context);
  return { api: context.window.DOCUMENTS };
}

test("document operations use only the NAS API and send metadata without credentials", async () => {
  const calls = [];
  const { api } = store(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => [document] };
  });
  await api.load("");
  await api.save({ operation: "save", document }, "");
  assert.deepEqual(calls.map(call => call.url), ["/documents/index.json", "/api/documents"]);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), { operation: "save", document });
});

test("private document operations use the authenticated NAS API and private PDF route", async () => {
  const calls = [];
  const items = [{ id: "private-id", category: "L/C", visibility: "private" }];
  const change = { operation: "delete", previous: items[0] };
  const { api } = store(() => {}, "/agesci-canicattini1", async (...args) => {
    calls.push(args);
    return args[0] === "private-documents" && args.length === 1 ? items : null;
  });
  assert.deepEqual(await api.loadPrivate(), items);
  assert.equal(await api.savePrivate(change), null);
  assert.deepEqual(calls, [["private-documents"], ["private-documents", "POST", change]]);
  assert.equal(api.privatePdfHref("private-id"), "/agesci-canicattini1/api/private-documents/private-id/pdf");
});

test("document API respects the site prefix", async () => {
  const calls = [];
  const { api } = store(async url => {
    calls.push(url);
    return { ok: true, json: async () => [document] };
  }, "/agesci-canicattini1");
  await api.load();
  await api.save({ operation: "delete", previous: document });
  assert.deepEqual(calls, [
    "/agesci-canicattini1/documents/index.json",
    "/agesci-canicattini1/api/documents",
  ]);
});

test("document model accepts PDF metadata and rejects duplicates, invalid paths and stale writes", () => {
  assert.equal(model.apply([], { operation: "save", document }).length, 1);
  for (const file of ["../test.pdf", "test.txt", ".secret.pdf", "x\\test.pdf", "x\n.pdf"])
    assert.throws(() => model.validate([{ ...document, file }]), /non valido/);
  assert.throws(() => model.validate([document, document]), /non valido/);
  assert.throws(() => model.apply([document], { operation: "save", document }), /cambiato/);
  assert.throws(() => model.apply([document], {
    operation: "save",
    previous: document,
    document: { ...document, file: "renamed.pdf" },
  }), /nome del file/);
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
  for (const year of [0, 1899, 10000, 2026.5, "2026", null])
    assert.throws(() => model.validate([{ ...dated, year }]), /Anno/);
  for (const publishedAt of ["", "05/11/2026", "2026-02-30", "2026-13-01", null])
    assert.throws(() => model.validate([{ ...dated, publishedAt }]), /Data/);
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
  for (const assemblyYear of [null, "2026", 1999, 10000, 2026.5])
    assert.throws(() => model.validate([{ ...document, assemblyYear }]), /non valido/);
  const updated = model.apply([current], { operation: "save", previous: current, document });
  assert.equal(updated[0].assemblyYear, undefined);
});

test("document categories default to the chief's branch and distinguish public from private storage", () => {
  const doc = (file, category, extra = {}) => ({
    file, title: file, description: "Test", year: 2026, publishedAt: "2026-01-01",
    category, visibility: "public", ...extra,
  });
  const items = [
    doc("public.pdf", "public"),
    doc("preparatory.pdf", "preparatory", { assemblyYear: 2026, assemblyType: "convocazione" }),
    doc("lc.pdf", "L/C"),
    doc("eg.pdf", "E/G"),
    doc("rs.pdf", "R/S"),
    doc("group.pdf", "group"),
  ];
  assert.equal(model.defaultCategory({ admin: false, serviceBranch: "E/G" }), "E/G");
  assert.equal(model.defaultCategory({ admin: false, serviceBranch: "" }), "all");
  assert.equal(model.defaultCategory({ admin: true }), "all");
  assert.deepEqual(model.filterCategory(items, "E/G").map(item => item.file), ["eg.pdf"]);
  assert.deepEqual(model.filterCategory(items, "all"), items);
  assert.equal(model.categoryOf({ assemblyYear: 2026 }), "preparatory");
  assert.equal(model.categoryOf({}), "public");
  assert.deepEqual(model.editableCategories({ admin: false, serviceBranch: "E/G" }).map(([value]) => value),
    ["public", "preparatory", "L/C", "E/G", "R/S", "group"]);
  assert.deepEqual(model.editableCategories({ admin: true }).map(([value]) => value),
    ["public", "preparatory", "L/C", "E/G", "R/S", "group"]);
  assert.throws(() => model.validate([doc("private.pdf", "E/G", { visibility: "private" })]), /Indice documenti non valido/);
});

test("document API reports load and save failures", async () => {
  const { api } = store(async (_url, options = {}) => ({
    ok: false,
    status: options.method === "POST" ? 403 : 503,
    text: async () => options.method === "POST" ? "Permesso negato" : "Indice non disponibile",
  }));
  await assert.rejects(api.load(), /Indice documenti NAS non disponibile/);
  await assert.rejects(api.save({ operation: "save", document }), /Permesso negato/);
});

test("the supplied PDF files match the public manifest", () => {
  const index = model.validate(JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/index.json"), "utf8")));
  assert.equal(index.length, 4);
  assert.deepEqual(index.map(item => item.file), [
    "PEG26-28.pdf",
    "Rendiconto_per_cassa_-_ModelloD.pdf",
    "ConvocaAssemblea26.pdf",
    "RegolamentoAssembleaCanicattini1.pdf",
  ]);
  assert.match(index[1].title, /2026.*Modello D/);
  for (const item of index) {
    const pdf = fs.readFileSync(path.join(__dirname, "../documents/pdf", item.file));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 1000);
  }
});
