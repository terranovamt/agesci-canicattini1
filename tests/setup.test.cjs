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
  const balanceButtons = [];
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
      set innerHTML(value) {
        this._innerHTML = value;
        this.children = [];
      },
      get innerHTML() {
        return this._innerHTML || "";
      },
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
  for (const name of ["generale", "ordine", "bilancio", "json", "guida", "limiti"]) {
    const tab = element("button");
    tab.dataset.tab = name;
    tabs.push(tab);
  }
  for (const name of ["entrate", "uscite", "soglie_percentuali_esito", "storico_avanzo_per_anno", "censimenti", "patrimonio", "altri"]) {
    const button = element("button");
    button.dataset.balance = name;
    balanceButtons.push(button);
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
      querySelectorAll: (s) => s === ".tabs button" ? tabs : s === "[data-balance]" ? balanceButtons : [],
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
    balanceButtons,
    tab: (name) => tabs.find((t) => t.dataset.tab === name).onclick(),
    balance: (name) => balanceButtons.find((button) => button.dataset.balance === name).onclick(),
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
  assert.equal(t.$("#salva-gh").textContent, "Salva dati base");
  assert.equal(t.$("#save-destination").textContent, "Destinazione: NAS · dati.js");
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
function fieldsetAt(t, selector) {
  const pending = [...t.$("#campi").children];
  while (pending.length) {
    const child = pending.shift();
    if (child.tagName === "FIELDSET" && child.children[0]?.textContent?.startsWith(selector)) return child;
    pending.push(...child.children);
  }
  return undefined;
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

test("array controls stay available after deleting the last item and restore its schema", async () => {
  const t = setup();
  await flush();
  t.setSlides(sampleSlides());
  t.tab("json");
  const data = t.data();
  data.soglie_percentuali_esito = [10, 20];
  t.$("#json-text").value = JSON.stringify(data);
  t.$("#json-apply").onclick();
  t.tab("bilancio");

  let list = fieldsetAt(t, "soglie percentuali esito");
  assert.ok(list, "percentage list is rendered as an editable fieldset");
  assert.equal(list.children.filter((child) => child.className === "field").length, 2);
  const remove = (index) => {
    list = fieldsetAt(t, "soglie percentuali esito");
    const row = list.children.find((child) => child.className === "field" &&
      child.children.some((item) => item.title === "Rimuovi elemento " + index));
    const control = row.children.find((item) => item.title === "Rimuovi elemento " + index);
    assert.ok(control);
    assert.match(control.getAttribute("aria-label"), /soglie percentuali esito/);
    control.onclick();
  };
  remove(1);
  remove(1);
  list = fieldsetAt(t, "soglie percentuali esito");
  assert.equal(list.children.length, 2, "empty list still has legend and add action");
  const add = list.children[1];
  assert.equal(add.textContent, "+ Aggiungi elemento");
  assert.equal(add.getAttribute("aria-label"), "Aggiungi elemento a soglie percentuali esito");
  add.onclick();
  assert.deepEqual(t.data().soglie_percentuali_esito, [0]);
  t.tab("bilancio");
  list = fieldsetAt(t, "soglie percentuali esito");
  const input = list.children.find((child) => child.className === "field").children[1];
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.type, "number");
  assert.equal(input.step, "1");
});

test("setup gives dates, times and prose fields suitable controls and labels", async () => {
  const t = setup();
  await flush();
  t.setSlides([{ tipo: "slide_qr_live", data_ora: "2026-11-20T20:30" }]);
  t.tab("ordine");
  button(orderRows(t)[0], "Modifica i contenuti").onclick();
  assert.equal(t.$("#fslide_0_data_ora").type, "datetime-local");

  t.$("#slide-editor-chiudi").onclick();
  const data = t.data();
  data.assemblea.prima_convocazione = "20:30";
  data.slide = [{ tipo: "slide_testo_articoli", articoli: [{ titolo: "Titolo breve", paragrafi: ["Paragrafo"] }] }];
  t.$("#json-text").value = JSON.stringify(data);
  t.$("#json-apply").onclick();
  t.tab("generale");
  const time = t.$("#fassemblea_prima_convocazione");
  assert.equal(time.type, "time");
  assert.equal(time.getAttribute("aria-label"), "Orario prima convocazione");
  t.tab("ordine");
  button(orderRows(t)[0], "Modifica i contenuti").onclick();
  assert.equal(t.$("#fslide_0_articoli_0_paragrafi_0").tagName, "TEXTAREA");
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
      select.children.some((o) => o.textContent.toLowerCase() === type),
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

test("pending JSON text survives navigation and render without changing the draft", async () => {
  const t = setup();
  await flush();
  t.tab("json");
  const text = '{ "unfinished": ';
  t.$("#json-text").value = text;
  t.$("#json-text").oninput();
  assert.equal(t.$("#dirty").textContent, "Testo JSON non applicato");
  assert.equal(t.$("#annulla").disabled, false);
  t.tab("generale");
  t.editTitle("Bozza da conservare");
  t.tab("ordine");
  t.tab("json");
  assert.equal(t.$("#json-text").value, text);
  t.$("#json-apply").onclick();
  assert.match(t.$("#json-err").textContent, /JSON non valido/);
  await t.save();
  assert.equal(t.requests.length, 0);
  let prevented = false;
  t.listeners.beforeunload({ preventDefault() { prevented = true } });
  assert.equal(prevented, true);
  t.$("#json-discard").onclick();
  assert.equal(t.data().assemblea.titolo, "Bozza da conservare");
  assert.equal(t.$("#salva-gh").disabled, false);
});

test("cancelling JSON discard, stale application and draft discard never overwrites either buffer", async () => {
  const t = setup({ confirm: false });
  await flush();
  t.tab("json");
  const text = JSON.stringify({ ...initial, assemblea: { ...initial.assemblea, titolo: "Dal JSON" } });
  t.$("#json-text").value = text;
  t.$("#json-text").oninput();
  t.tab("generale");
  t.editTitle("Bozza più recente");
  t.$("#json-discard").onclick();
  t.$("#annulla").onclick();
  t.tab("json");
  t.$("#json-apply").onclick();
  assert.equal(t.$("#json-text").value, text);
  assert.equal(t.$("#fassemblea_titolo").value, "Bozza più recente");
  assert.match(t.$("#dirty").textContent, /Bozza modificata.*Testo JSON non applicato/);
  t.$("#esci-area").onclick();
  assert.deepEqual(t.redirects, []);
});

test("JSON application and confirmed discard affect only the intended draft", async () => {
  const t = setup();
  await flush();
  t.tab("json");
  t.$("#json-text").value = JSON.stringify({ ...initial, anno_esercizio: 2027 });
  t.$("#json-text").oninput();
  t.$("#json-apply").onclick();
  assert.equal(t.requests.length, 0);
  assert.equal(t.data().anno_esercizio, 2027);
  assert.equal(t.$("#dirty").textContent, "● Bozza non salvata");
  t.$("#annulla").onclick();
  assert.equal(t.data().anno_esercizio, 2026);
  assert.equal(t.$("#dirty").textContent, "✓ Nessuna modifica locale");
});

test("exhausted conflicts retain the draft and JSON typed during an in-flight save", async () => {
  let t;
  t = setup({ conflicts: 3, duringSave() {
    t.tab("json");
    t.$("#json-text").value = '{"pending":';
    t.$("#json-text").oninput();
  } });
  await flush();
  t.editTitle("Non perdere");
  await t.save();
  assert.equal(t.requests.length, 6);
  assert.equal(t.$("#stato").textContent, "Errore");
  assert.equal(t.$("#json-text").value, '{"pending":');
  t.$("#json-discard").onclick();
  assert.equal(t.data().assemblea.titolo, "Non perdere");
  assert.equal(t.$("#salva-gh").disabled, false);
  assert.equal(t.saved().assemblea.titolo, initial.assemblea.titolo);
});

test("bilancio lists every section one after the other, with no selector", async () => {
  const t = setup();
  await flush();
  t.tab("bilancio");
  assert.doesNotMatch(html, /balance-select|data-balance/);
  assert.ok(t.$("#campi").children.length >= 1);
});

test("documentation embeds and full-page links open their contextual guide anchors", async () => {
  const t = setup();
  await flush();
  t.tab("guida");
  assert.equal(t.$("#doc").src, "guida.html?embed#setup");
  assert.equal(t.$("#doc-link").href, "guida.html#setup");
  t.tab("limiti");
  assert.equal(t.$("#doc").src, "guida.html?embed&solo=limiti#limiti");
  assert.equal(t.$("#doc-link").href, "guida.html#limiti");
});

test("saving never announces success before the write response", async () => {
  let t;
  t = setup({ duringSave() {
    assert.equal(t.$("#stato").textContent, "Salvo su GitHub…");
    assert.equal(t.$("#salva-gh").disabled, true);
    assert.equal(t.$("#salva-gh").textContent, "Salvataggio in corso…");
  } });
  await flush();
  t.editTitle("Salvataggio verificato");
  assert.equal(t.$("#save-destination").textContent, "Destinazione: GitHub · dati.js");
  await t.save();
  assert.match(t.$("#stato").textContent, /^Salvato su GitHub/);
});

const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);

test("setup tabs, seven balance panels and wizard steps fit all six viewports", { skip: !chrome }, () => {
  const project = path.join(__dirname, "..");
  const dir = path.join(project, "dist", "setup-ux-test-" + process.pid);
  fs.mkdirSync(dir, { recursive: true });
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const css = ["../../assets/css/nas.css", "../../assets/css/theme.css", "core/setup.css"].map(read).join("\n");
  const fixture = html.replace(/<link\b[^>]*>/g, "").replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace("</head>", "<style>" + css + "</style></head>")
    .replace("</body>", `<script>
      window.errors = [];
      addEventListener('error', event => errors.push(event.message));
      window.ACCESSO = { verificata: () => true };
      window.LIVE = { nas: true };
      history.replaceState = () => {};
      window.confirmResult = true;
      window.confirm = () => window.confirmResult;
      window.requests = [];
      window.fetch = (...args) => { requests.push(args); return Promise.reject(new Error('Unexpected request')); };
      ${read("dati.js")}
      const initialData = window.initialData = window.DATI;
      const append = document.head.append.bind(document.head);
      document.head.append = (...nodes) => {
        for (const node of nodes) {
          if (node.tagName === 'SCRIPT' && node.src.includes('dati.js')) {
            window.DATI = JSON.parse(JSON.stringify(initialData)); node.onload();
          } else append(node);
        }
      };
      ${["modifiche.js", "salva-dati.js", "nuovo-anno-model.js", "nuovo-anno.js", "setup.js"].map(file => read("core/" + file)).join("\n")}
    </script></body>`);
  const harness = `<!doctype html><meta charset="utf-8"><body><pre id="result">running</pre><script>
    const fixture = ${JSON.stringify(fixture).replace(/</g, "\\u003c")};
    const checks = [];
    function check(condition, name) { if (!condition) throw new Error(name); checks.push(name); }
    (async () => {
      for (const [width, height] of [[1920,1080],[1366,768],[820,1180],[390,844],[1180,820],[844,390]]) {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'border:0;width:' + width + 'px;height:' + height + 'px';
        document.body.append(frame);
        const loaded = new Promise(resolve => frame.onload = resolve);
        frame.srcdoc = fixture; await loaded;
        const w = frame.contentWindow, d = frame.contentDocument;
        const $ = selector => d.querySelector(selector);
        const click = selector => $(selector).click();
        const fill = (selector, value) => {
          const input = $(selector); input.value = value;
          input.dispatchEvent(new w.Event('input', { bubbles:true }));
        };
        const fits = name => {
          check(d.documentElement.scrollWidth <= width, width + ': ' + name + ' overflow');
          for (const element of d.querySelectorAll('dialog[open], #year-scroll, #slide-editor-campi')) {
            if (element.getClientRects().length)
              check(element.scrollWidth <= element.clientWidth + 1, width + ': ' + name + ' inner overflow ' + element.id);
          }
        };
        const shown = selector => {
          const r = $(selector).getBoundingClientRect();
          return r.width >= 44 && r.height >= 44 && r.top >= 0 && r.bottom <= height;
        };
        fits('generale');
        const workspaceWidth = $('.workspace').getBoundingClientRect().width;
        check(workspaceWidth >= Math.min(width - 64, width * .78), width + ': useful workspace width');
        if (width >= 700) {
          const assembly = $('.form-section[data-id="assemblea"]').getBoundingClientRect();
          check(assembly.width >= workspaceWidth * .6, width + ': assembly form uses workspace');
        }
        check(d.querySelectorAll('.primary-tabs button').length === 4, 'four primary tabs');
        for (const selector of ['[data-tab="generale"]','[data-tab="ordine"]','[data-tab="bilancio"]','[data-tab="soci"]','#salva-gh','#annulla']) {
          const r = $(selector).getBoundingClientRect();
          check(r.width >= 44 && r.height >= 44, selector + ' touch target ' + r.width + '×' + r.height + ' errors=' + w.errors.join(','));
        }
        click('#setup-tools summary');
        for (const tab of ['guida', 'limiti']) {
          click('[data-tab="' + tab + '"]');
          fits(tab);
          check(!$('#doc').hidden && !$('#doc-link').hidden, tab + ' embedded and full guide available');
          check($('#doc-link').getAttribute('href').endsWith('#' + (tab === 'guida' ? 'setup' : 'limiti')), 'contextual guide ' + tab);
          check($('[data-tab="' + tab + '"]').getAttribute('aria-pressed') === 'true', 'selected tool ' + tab);
        }
        click('[data-tab="bilancio"]');
        fits('bilancio');
        check($('#campi').textContent.trim().length > 0, 'nonempty balance');
        if (width >= 1100) {
          const rows = [...d.querySelectorAll('[data-id="entrate"] .financial-row')].slice(0, 2).map(row => row.getBoundingClientRect());
          check(Math.abs(rows[0].top - rows[1].top) < 1 && rows[0].right < rows[1].left, width + ': dense financial columns');
        }
        click('[data-tab="ordine"]');
        fits('slides');
        click('.slide-edit');
        check(shown('#slide-editor-chiudi'), 'editor footer visible');
        check($('#slide-editor-campi').clientHeight >= 120, 'useful editor viewport');
        fits('editor');
        click('#slide-editor-chiudi');
        click('[data-tab="json"]');
        fits('json');
        check($('#json-text').getBoundingClientRect().width >= workspaceWidth * .9, width + ': useful JSON width');
        if (width >= 700) check($('#json-text').clientHeight >= 195 && $('#json-text').clientHeight <= height * .7, width + ': bounded JSON height');
        fill('#json-text', '{"unfinished":');
        click('[data-tab="generale"]');
        click('[data-tab="json"]');
        check($('#json-text').value === '{"unfinished":', 'pending text retained');
        w.confirmResult = false;
        click('#json-discard');
        check($('#json-text').value === '{"unfinished":', 'cancel discard retained text');
        click('#nuovo-anno');
        check(!$('#year-dialog').open && $('#json-text').value === '{"unfinished":', 'pending text blocks wizard without loss');
        w.confirmResult = true;
        click('#json-discard');
        $('#gh').showModal();
        fits('token dialog');
        $('#gh').close();
        click('#nuovo-anno');
        click('#year-cancel');
        check(!$('#year-dialog').open && $('#dirty').textContent.includes('Nessuna modifica'), 'confirmed wizard cancel preserves setup');
        click('#nuovo-anno');
        check($('#year-dialog').open, 'wizard opens');
        check(!w.dispatchEvent(new w.Event('beforeunload', { cancelable:true })), 'wizard protects beforeunload');
        w.confirmResult = false;
        click('#year-cancel');
        check($('#year-dialog').open, 'cancel rejection retains wizard');
        $('#year-dialog').dispatchEvent(new w.Event('cancel', { cancelable:true }));
        check($('#year-dialog').open, 'escape rejection retains wizard');
        for (let step = 0; step < 3; step++) {
          check($('#year-progress').textContent === 'Passaggio ' + (step + 1) + ' di 3', 'wizard step ' + step);
          fits('wizard ' + step);
          check(shown('#year-next') && shown('#year-cancel'), 'wizard actions visible ' + step);
          check($('#year-scroll').clientHeight >= 120, 'useful wizard viewport ' + step);
          check(shown('#year-summary') === (width >= 1100), width + ': side summary only on desktop');
          if (width >= 1100) check($('#year-dialog').getBoundingClientRect().width >= 1000, width + ': useful wizard width');
          if (step === 0) {
            click('#year-next');
            check($('#year-progress').textContent === 'Passaggio 1 di 3', 'missing date blocks progress');
            fill('#year-fields input[type="datetime-local"]', '2027-11-20T20:30');
          }
          if (step === 1) {
            const amounts = [...d.querySelectorAll('#year-fields input[type="number"]')];
            check(amounts.every((input, i) => i === 0 || input.value !== ''), 'amounts default to previous year');
            if (width >= 700) {
              const fields = [...d.querySelectorAll('#year-fields .year-field')].slice(2, 4).map(field => field.getBoundingClientRect());
              check(Math.abs(fields[0].top - fields[1].top) < 1, width + ': dense wizard amounts');
            }
            const last = amounts.at(-1), kept = last.value;
            last.value = ''; last.dispatchEvent(new w.Event('input', { bubbles:true }));
            click('#year-next');
            check($('#year-progress').textContent === 'Passaggio 2 di 3', 'missing amount blocks progress');
            last.value = kept; last.dispatchEvent(new w.Event('input', { bubbles:true }));
          }
          if (step === 2) {
            check(d.querySelectorAll('.year-slide').length === w.initialData.slide.length + 1, 'all content slides retained');
            check($('#year-next').textContent === 'Applica alla bozza', 'final draft action');
          }
          click('#year-next');
        }
        check(!$('#year-dialog').open, 'wizard closes after application');
        check($('#dirty').textContent.includes('Bozza non salvata'), 'applied year remains draft');
        check(w.requests.length === 0, 'no premature save or network');
        check(w.errors.length === 0, 'no browser errors: ' + w.errors.join(','));
        frame.remove();
      }
      document.getElementById('result').textContent = JSON.stringify({ ok:true, checks:checks.length });
    })().catch(error => document.getElementById('result').textContent = JSON.stringify({ error:error.message, checks }));
  </script>`;
  try {
    fs.writeFileSync(path.join(dir, "index.html"), harness);
    const result = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu",
      "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check",
      "--user-data-dir=" + path.join(dir, "profile"), "--allow-file-access-from-files",
      "--virtual-time-budget=12000", "--dump-dom", pathToFileURL(path.join(dir, "index.html")).href],
    { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const output = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    assert.ok(output, "browser result missing");
    const report = JSON.parse(output.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    assert.equal(report.ok, true, report.error || JSON.stringify(report));
    assert.ok(report.checks > 300, String(report.checks));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
