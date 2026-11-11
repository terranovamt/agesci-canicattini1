const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const model = require("../assets/js/documents-model.js");
const source = fs.readFileSync(require.resolve("../assets/js/home-documents.js"), "utf8");

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.textContent = "";
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren() {
    this.children = [];
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  cloneNode() {
    const clone = Object.assign(new Element(), this);
    clone.children = this.children.map((child) => child.cloneNode());
    return clone;
  }
}

test("archive shows skeletons before the response and loads long lists in blocks without redundant rendering", async () => {
  const elements = Object.fromEntries(
    ["documents-list", "documents-status", "documents-retry", "documents-search", "documents-more"].map((id) => [
      id,
      new Element(),
    ]),
  );
  elements["documents-search"].value = "";
  let resolveResponse;
  const items = Array.from({ length: 120 }, (_, index) => ({
    file: "document-" + index + ".pdf",
    title: "Document " + index,
    description: "Archivio",
  }));
  vm.runInNewContext(source, {
    document: {
      getElementById: (id) => elements[id],
      createElement: () => new Element(),
      createElementNS: () => new Element(),
    },
    window: { DOCUMENTS_MODEL: model },
    fetch: () =>
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    console,
    Intl,
    Date,
  });
  assert.equal(elements["documents-list"].children.length, 3);
  assert.equal(elements["documents-list"]["aria-busy"], "true");
  resolveResponse({ ok: true, json: async () => items });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements["documents-list"].children.length, 48);
  assert.equal(elements["documents-list"]["aria-busy"], "false");
  const first = elements["documents-list"].children[0];
  elements["documents-search"].oninput();
  assert.equal(elements["documents-list"].children[0], first);
  elements["documents-more"].onclick();
  assert.equal(elements["documents-list"].children.length, 96);
  assert.equal(elements["documents-more"].hidden, false);
  elements["documents-more"].onclick();
  assert.equal(elements["documents-list"].children.length, 120);
  assert.equal(elements["documents-more"].hidden, true);
});

test("home renders only current assembly preparatory PDFs in addition to the complete archive", async () => {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric" }).format(new Date()));
  const items = [
    { file: "generale.pdf", title: "Generale", description: "Archivio" },
    { file: "corrente.pdf", title: "Corrente", description: "Preparatorio", assemblyYear: year, assemblyType: "convocazione" },
    { file: "vecchio.pdf", title: "Precedente", description: "Storico", assemblyYear: year - 1 },
  ];
  const ids = [
    "documents-list",
    "documents-status",
    "documents-retry",
    "preparatory-list",
    "preparatory-status",
    "preparatory-retry",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  let fails = false;
  const errors = [];
  vm.runInNewContext(source, {
    document: {
      getElementById: (id) => elements[id],
      createElement: () => new Element(),
      createElementNS: () => new Element(),
    },
    window: { DOCUMENTS_MODEL: model },
    fetch: async () => ({ ok: !fails, status: 503, json: async () => items }),
    console: { error: (...args) => errors.push(args) },
    Intl,
    Date,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements["documents-list"].children.length, 3);
  assert.equal(elements["preparatory-list"].children.length, 5);
  const prep = elements["preparatory-list"].children[0];
  assert.equal(prep.children[2].textContent, "Corrente");
  assert.equal(prep.children[4].children[0].href, "documents/pdf/corrente.pdf");
  assert.match(elements["preparatory-status"].textContent, new RegExp(String(year)));
  assert.deepEqual(elements["preparatory-list"].children.slice(1).map(card => card.children[2].textContent),
    ["Regolamento", "PEG", "Bilancio", "Verbale"]);
  assert.equal(elements["preparatory-list"].children[4].children[4].children.length, 0);
  items[1].assemblyYear = year - 1;
  await elements["preparatory-retry"].onclick();
  assert.equal(elements["preparatory-list"].children.length, 5);
  assert.match(elements["preparatory-status"].textContent, /0 di 5/);
  fails = true;
  await elements["documents-retry"].onclick();
  assert.equal(elements["documents-retry"].hidden, false);
  assert.equal(elements["preparatory-retry"].hidden, false);
  assert.match(elements["preparatory-status"].textContent, /503/);
  assert.equal(errors.length, 1);
});

test("archive and assembly pages use a responsive card grid, documents before the explainer", () => {
  const read = (file) => fs.readFileSync(require.resolve("../" + file), "utf8");
  for (const page of ["documenti/index.html", "assemblea/index.html"]) assert.match(read(page), /<body class="docs-page">/);
  const assembly = read("assemblea/index.html");
  assert.ok(assembly.indexOf('id="documents-list"') < assembly.indexOf('class="assembly-explainer"'));
  assert.match(read("assets/css/home.css"), /body\.docs-page \.document-grid \{ grid-template-columns: repeat\(auto-fill/);
  assert.match(source, /pubblicato il/);
});
