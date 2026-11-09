const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.join(__dirname, "../area-riservata/assemblea");
const source = fs.readFileSync(path.join(root, "core/setup.js"), "utf8");
const html = fs.readFileSync(path.join(root, "setup.html"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const initial = { anno_esercizio: 2026, assemblea: { titolo: "Assemblea", data: "20 Novembre" }, slide: [] };
const serialize = (data) => "// commento da conservare\nwindow.DATI = " + JSON.stringify(data, null, 2) + ";\n";

function setup(options = {}) {
  const elements = new Map(),
    created = [],
    requests = [],
    listeners = {},
    scripts = [],
    redirects = [];
  const tabs = [];
  const store = new Map(options.noToken ? [] : [["assemblea-gh-token", "test-token"]]);
  let context,
    remote = serialize(options.remote || initial),
    writes = 0;
  const element = (tag) => {
    const e = {
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      value: "",
      children: [],
      hidden: false,
      attributes: {},
      classList: { toggle() {}, add() {}, remove() {} },
      append(...children) {
        this.children.push(...children);
      },
      remove() {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name] ?? this[name];
      },
      scrollIntoView() {},
      querySelector() {
        return element("legend");
      },
      showModal() {
        this.open = true;
        if (options.cancelToken && this === $("#gh")) {
          this.returnValue = "no";
          this.onclose();
        }
      },
      close() {
        this.open = false;
        if (this.onclose) this.onclose();
      },
    };
    created.push(e);
    return e;
  };
  const $ = (s) => {
    const match = created.findLast((e) => s === "#" + e.id);
    if (match) return match;
    if (!elements.has(s)) elements.set(s, element("div"));
    return elements.get(s);
  };
  for (const name of ["generale", "ordine", "json"]) {
    const tab = element("button");
    tab.dataset.tab = name;
    tabs.push(tab);
  }
  context = {
    window: {
      ACCESSO: { verificata: () => !options.unauthenticated, esci() {} },
      LIVE: {
        nas: !!options.nas,
        url: "https://firebase.test/",
        github: { repo: "test/repo", ramo: "main", cartella: "area-riservata/assemblea" },
      },
    },
    document: {
      querySelector: $,
      querySelectorAll: (s) => (s === ".tabs button" ? tabs : []),
      createElement: element,
      createElementNS: (_namespace, tag) => element(tag),
      body: element("body"),
      head: {
        append(s) {
          scripts.push(s.src);
          if (options.loadFailure) s.onerror();
          else {
            vm.runInContext(serialize(initial), context);
            s.onload();
          }
        },
      },
    },
    history: { replaceState() {} },
    location: {
      pathname: "/setup",
      hash: "",
      replace(url) {
        redirects.push(url);
      },
    },
    localStorage: {
      getItem: (k) => store.get(k),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    TextDecoder,
    TextEncoder,
    Uint8Array,
    atob,
    btoa,
    scrollY: 0,
    scrollTo() {},
    setTimeout() {},
    confirm: () => options.confirm !== false,
    setInterval() {
      throw new Error("setup must not poll in the background");
    },
    EventSource: class {
      constructor() {
        throw new Error("setup must not open streams");
      }
    },
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
    fetch: async (url, opts) => {
      requests.push({ url, opts });
      assert.match(
        url,
        options.nas ? /^\/api\/content\/dati\.js$/ : /^https:\/\/api\.github\.com\//,
        "expected content service only",
      );
      if (options.denied) return { status: 401, ok: false };
      if (opts.method === "PUT") {
        writes++;
        if (options.duringSave) {
          const fn = options.duringSave;
          options.duringSave = null;
          fn($);
        }
        if (writes <= (options.conflicts || 0)) return { status: 409, ok: false };
        remote = Buffer.from(JSON.parse(opts.body).content, "base64").toString("utf8");
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ content: Buffer.from(remote).toString("base64"), sha: "sha-" + writes }),
      };
    },
  };
  vm.createContext(context);
  for (const file of ["modifiche.js", "salva-dati.js"])
    vm.runInContext(fs.readFileSync(path.join(root, "core", file), "utf8"), context);
  vm.runInContext(source, context);
  return {
    $,
    requests,
    scripts,
    store,
    listeners,
    redirects,
    tabs,
    tab: (name) => tabs.find((t) => t.dataset.tab === name).onclick(),
    setSlides(slide) {
      $("#json-text").value = JSON.stringify({ ...initial, slide });
      $("#json-apply").onclick();
    },
    data() {
      tabs.find((t) => t.dataset.tab === "json").onclick();
      return JSON.parse($("#json-text").value);
    },
    saved: () => context.window.SALVA_DATI.valuta(remote),
    editTitle(value) {
      const input = $("#fassemblea_titolo");
      input.value = value;
      input.oninput();
    },
    save: () => $("#salva-gh").onclick(),
  };
}

test("setup loads without Firebase login, streams, polling or presence", async () => {
  for (const script of ["assemblea.js", "presenza.js"]) assert.equal(html.includes('src="core/' + script + '"'), false);
  assert.ok(html.includes('src="../../assets/js/shared/accesso.js"'));
  for (const id of ["login-form", "pubblica", "inizia", "ripristina"])
    assert.equal(html.includes('id="' + id + '"'), false);
  const t = setup();
  await flush();
  assert.equal(t.requests.length, 0);
  assert.equal(t.scripts.length, 1);
  assert.equal(t.$("#app").hidden, false);
  assert.equal(t.$("#fassemblea_titolo").value, "Assemblea");
  assert.equal(t.$("#salva-gh").disabled, true);
});

test("NAS setup saves through the local content API without a GitHub token", async () => {
  const t = setup({ nas: true, noToken: true });
  await flush();
  t.editTitle("Titolo NAS");
  await t.save();
  assert.equal(t.saved().assemblea.titolo, "Titolo NAS");
  assert.equal(t.requests.length, 2);
  assert.ok(t.requests.every((request) => request.url === "/api/content/dati.js"));
  assert.equal(t.store.size, 0);
  assert.equal(t.$("#salva-gh").textContent, "Pubblica");
});

test("setup section navigation keeps its title and accessible selected state in sync", async () => {
  const t = setup();
  await flush();
  t.tab("ordine");
  assert.equal(t.$("#workspace-title").textContent, "Slide e sezioni");
  t.tab("json");
  assert.equal(t.$("#workspace-title").textContent, "Editor JSON");
  for (const tab of t.tabs) assert.equal(tab.getAttribute("aria-pressed"), String(tab.dataset.tab === "json"));
  assert.equal(t.$("#dirty").style.color, "var(--g-strong)");
  t.editTitle("Nuovo titolo");
  assert.equal(t.$("#dirty").style.color, "var(--r-strong)");
});

function orderRows(t) {
  return t.$("#campi").children.at(-1).children;
}
function button(row, title) {
  return row.children.find((c) => c.title === title);
}
const sampleSlides = () => [
  { tipo: "slide_titolo", titolo: "Intro" },
  { tipo: "slide_divisore_sezione", titolo: "A" },
  { tipo: "slide_titolo", titolo: "A1", id: "a1" },
  { tipo: "slide_titolo", titolo: "A2" },
  { tipo: "slide_divisore_sezione", titolo: "B" },
  { tipo: "slide_titolo", titolo: "B1" },
];

test("adding a slide creates a valid template and copies without duplicating ids", async () => {
  const t = setup();
  await flush();
  t.setSlides(sampleSlides());
  t.tab("ordine");
  let toolbar = t.$("#campi").children.at(-2);
  toolbar.children[0].value = toolbar.children[0].children.find((o) => o.textContent === "Copia slide 3: A1").value;
  toolbar.children[1].onclick();
  let data = t.data();
  assert.equal(data.slide.at(-1).titolo, "A1");
  assert.equal("id" in data.slide.at(-1), false);
  t.tab("ordine");
  toolbar = t.$("#campi").children.at(-2);
  toolbar.children[0].value = "2";
  toolbar.children[1].onclick();
  data = t.data();
  assert.equal(data.slide.at(-1).tipo, "slide_testo_articoli");
  assert.equal(data.slide.at(-1).articoli[0].paragrafi[0], "Testo");
});

test("slide order controls use accessible SVG icons", async () => {
  const t = setup();
  await flush();
  t.setSlides(sampleSlides());
  t.tab("ordine");
  const row = orderRows(t)[0];
  for (const title of [
    "Visibile: clic per nasconderla",
    "Sposta su",
    "Sposta giù",
    "Modifica i contenuti",
    "Elimina solo questa slide",
  ]) {
    const control = button(row, title);
    assert.ok(control, title);
    assert.equal(control.getAttribute("aria-label"), title);
    assert.equal(control.children[0].tagName, "SVG");
    assert.equal(control.children[0].getAttribute("aria-hidden"), "true");
  }
});

test("editing one slide opens its own dialog and changing type replaces specific fields", async () => {
  const t = setup();
  await flush();
  t.setSlides(sampleSlides());
  t.tab("ordine");
  button(orderRows(t)[2], "Modifica i contenuti").onclick();
  assert.equal(t.$("#slide-editor").open, true);
  assert.equal(t.$("#slide-editor-titolo").textContent, "Modifica slide 3");
  const type = t.$("#slide-editor-tipo");
  type.value = "slide_testo_articoli";
  type.onchange();
  const input = t.$("#fslide_2_articoli_0_titolo");
  assert.equal(input.value, "Titolo");
  input.value = "Articolo nuovo";
  input.oninput();
  t.$("#slide-editor-chiudi").onclick();
  const data = t.data();
  assert.equal(data.slide[2].tipo, "slide_testo_articoli");
  assert.equal(data.slide[2].articoli[0].titolo, "Articolo nuovo");
  assert.equal(data.slide[2].id, "a1");
  assert.equal("sottotitolo" in data.slide[2], false);
  assert.equal(data.slide[0].titolo, "Intro");
});

test("cancelling type change keeps the original slide and selection", async () => {
  const t = setup({ confirm: false });
  await flush();
  t.setSlides(sampleSlides());
  t.tab("ordine");
  button(orderRows(t)[0], "Modifica i contenuti").onclick();
  const type = t.$("#slide-editor-tipo");
  type.value = "slide_quorum_convocazioni";
  type.onchange();
  assert.equal(type.value, "slide_titolo");
  assert.equal(t.data().slide[0].tipo, "slide_titolo");
});

test("new slide type selector covers every supported renderer", async () => {
  const t = setup();
  await flush();
  t.tab("ordine");
  const select = t.$("#campi").children.at(-2).children[0];
  const files = fs.readdirSync(path.join(root, "slides/landscape")).filter((f) => f.endsWith(".js"));
  const types = files.flatMap((file) => {
    const text = fs.readFileSync(path.join(root, "slides/landscape", file), "utf8");
    return [...text.matchAll(/LANDSCAPE\.(slide_\w+)\s*=/g)].map((m) => m[1].slice(6).replace(/_/g, " "));
  });
  for (const type of types)
    assert.ok(
      select.children.some((o) => o.textContent === type),
      type,
    );
  assert.equal(html.includes('data-tab="contenuti"'), false);
});

test("collapsed sections move down and up as intact blocks", async () => {
  const t = setup();
  await flush();
  t.setSlides(sampleSlides());
  t.tab("ordine");
  button(orderRows(t)[1], "Collassa sezione").onclick();
  assert.deepEqual(
    orderRows(t).map((r) => r.dataset.i),
    [0, 1, 4, 5],
  );
  button(orderRows(t)[2], "Collassa sezione").onclick();
  button(orderRows(t)[1], "Sposta sezione giù").onclick();
  assert.deepEqual(
    t.data().slide.map((s) => s.titolo),
    ["Intro", "B", "B1", "A", "A1", "A2"],
  );
  t.tab("ordine");
  button(orderRows(t)[2], "Sposta sezione su").onclick();
  assert.deepEqual(
    t.data().slide.map((s) => s.titolo),
    ["Intro", "A", "A1", "A2", "B", "B1"],
  );
});

test("invisible groups collapse and move like sections without hiding their contents", async () => {
  const t = setup();
  await flush();
  const slides = sampleSlides();
  slides[1] = { tipo: "slide_gruppo_invisibile", titolo: "Gruppo A" };
  t.setSlides(slides);
  t.tab("ordine");
  const row = orderRows(t)[1];
  assert.equal(button(row, "Visibile: clic per nasconderla"), undefined);
  button(row, "Collassa sezione").onclick();
  assert.deepEqual(
    orderRows(t).map((r) => r.dataset.i),
    [0, 1, 4, 5],
  );
  button(orderRows(t)[2], "Collassa sezione").onclick();
  button(orderRows(t)[1], "Sposta sezione giù").onclick();
  const result = t.data().slide;
  assert.deepEqual(
    result.map((s) => s.titolo),
    ["Intro", "B", "B1", "Gruppo A", "A1", "A2"],
  );
  assert.equal(
    result.some((s) => s.nascosta),
    false,
  );
});

test("dragging a collapsed section moves all its slides and expansion restores rows", async () => {
  const t = setup();
  await flush();
  t.setSlides(sampleSlides());
  t.tab("ordine");
  button(orderRows(t)[1], "Collassa sezione").onclick();
  const rows = orderRows(t);
  rows[1].ondragstart({ dataTransfer: { setData() {} } });
  rows.at(-1).ondrop({ preventDefault() {} });
  assert.deepEqual(
    t.data().slide.map((s) => s.titolo),
    ["Intro", "B", "B1", "A", "A1", "A2"],
  );
  t.tab("ordine");
  button(orderRows(t).at(-1), "Espandi sezione").onclick();
  assert.equal(orderRows(t).length, 6);
});

test("deleting a collapsed divider retains its slides and requires confirmation", async () => {
  const t = setup();
  await flush();
  t.setSlides(sampleSlides());
  t.tab("ordine");
  button(orderRows(t)[1], "Collassa sezione").onclick();
  button(orderRows(t)[1], "Elimina solo questa slide").onclick();
  assert.deepEqual(
    t.data().slide.map((s) => s.titolo),
    ["Intro", "A1", "A2", "B", "B1"],
  );
  const cancelled = setup({ confirm: false });
  await flush();
  cancelled.setSlides(sampleSlides());
  cancelled.tab("ordine");
  button(orderRows(cancelled)[0], "Elimina solo questa slide").onclick();
  assert.equal(cancelled.data().slide.length, 6);
});

test("setup requires an already verified session before loading any data", async () => {
  const t = setup({ unauthenticated: true });
  await flush();
  assert.deepEqual(t.redirects, ["../"]);
  assert.equal(t.scripts.length, 0);
  assert.equal(t.requests.length, 0);
});

test("saving commits only local differences to GitHub and preserves remote edits and comments", async () => {
  const remote = { ...initial, assemblea: { ...initial.assemblea, data: "Nuova data" } };
  const t = setup({ remote });
  await flush();
  t.editTitle("Nuovo titolo");
  assert.equal(t.$("#salva-gh").disabled, false);
  await t.save();
  assert.equal(t.requests.length, 2);
  assert.equal(t.saved().assemblea.titolo, "Nuovo titolo");
  assert.equal(t.saved().assemblea.data, "Nuova data");
  const body = JSON.parse(t.requests[1].opts.body);
  assert.equal(body.branch, "main");
  assert.match(Buffer.from(body.content, "base64").toString(), /commento da conservare/);
  assert.equal(t.$("#salva-gh").disabled, true);
  let prevented = false;
  t.listeners.beforeunload({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
});

test("edits made during commit stay dirty and can be saved separately", async () => {
  const t = setup({
    duringSave($) {
      const input = $("#fassemblea_titolo");
      input.value = "Ancora diverso";
      input.oninput();
    },
  });
  await flush();
  t.editTitle("Primo titolo");
  await t.save();
  assert.equal(t.saved().assemblea.titolo, "Primo titolo");
  assert.equal(t.$("#fassemblea_titolo").value, "Ancora diverso");
  assert.equal(t.$("#salva-gh").disabled, false);
  await t.save();
  assert.equal(t.saved().assemblea.titolo, "Ancora diverso");
});

test("GitHub conflicts retry the read and commit without Firebase writes", async () => {
  const t = setup({ conflicts: 1 });
  await flush();
  t.editTitle("Titolo ritentato");
  await t.save();
  assert.equal(t.requests.length, 4);
  assert.equal(t.saved().assemblea.titolo, "Titolo ritentato");
});

test("failed GitHub authentication retains edits and forgets invalid tokens", async () => {
  const t = setup({ denied: true });
  await flush();
  t.editTitle("Da conservare");
  await t.save();
  assert.equal(t.$("#stato").textContent, "Errore");
  assert.equal(t.store.has("assemblea-gh-token"), false);
  assert.equal(t.$("#fassemblea_titolo").value, "Da conservare");
  assert.equal(t.$("#salva-gh").disabled, false);
});

test("cancelled token prompt makes no requests and restores the save button", async () => {
  const t = setup({ noToken: true, cancelToken: true });
  await flush();
  t.editTitle("Modifica");
  await t.save();
  assert.equal(t.requests.length, 0);
  assert.equal(t.$("#salva-gh").disabled, false);
});

test("static loading failures are visible and do not enable saving", async () => {
  const t = setup({ loadFailure: true });
  await flush();
  assert.equal(t.$("#stato").textContent, "Errore");
  assert.match(t.$("#campi").textContent, /Impossibile caricare/);
  assert.equal(t.requests.length, 0);
});
