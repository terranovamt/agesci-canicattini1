const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/core/regia.js"), "utf8");

function dashboard(attiva, count = 4, failed = false, options = {}) {
  const elements = new Map();
  const saves = [],
    alerts = [], redirects = [], requests = [];
  let keydown;
  const $ = (selector) => {
    if (selector === "dialog[open]") return options.dialogOpen ? {} : null;
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {
        style: {},
        textContent: "",
        hidden: false,
        classList: { toggle: (name, enabled) => (enabled ? classes.add(name) : classes.delete(name)) },
        classes,
      });
    }
    return elements.get(selector);
  };
  const context = {
    window: {
      LIVE: { url: "/api/state" },
      ACCESSO: { verificata: () => true, esci: async () => {} },
      PRESENZA: { avvia() {}, conta: () => ({ totale: count, ruoli: { p: count - 1, r: 1 }, scaduti: [] }) },
      ASSEMBLEA: {
        async salva(...args) {
          if (options.waitSave) await options.waitSave;
          if (options.saveFailure) throw new Error("NAS 403");
          saves.push(args);
          attiva = args[0];
        },
      },
    },
    document: { querySelector: $ },
    addEventListener(type, handler) { if (type === "keydown") keydown = handler },
    URL,
    Date,
    location: { replace: url => redirects.push(url) },
    confirm: () => options.confirm !== false,
    alert: (s) => alerts.push(s),
    setTimeout() {},
    setInterval() {},
    performance: { now: () => 0 },
    fetch: async (url) => {
      requests.push(url);
      if (options.checkFailure) throw new Error("offline");
      const body = JSON.stringify(
        url.includes("assemblea")
          ? options.empty
            ? null
            : { attiva }
          : url.includes("modifiche")
            ? options.patch === undefined
              ? null
              : options.patch
            : {},
      );
      return {
        ok: !failed,
        status: failed ? 403 : 200,
        text: async () => {
          if (url.includes("presenza") && options.waitPresence) await options.waitPresence;
          return body;
        },
      };
    },
  };
  vm.runInNewContext(
    source.replace(
      /\r?\n  avvia\(\);\r?\n\}\)\(\);/,
      "\n  V = { avviaLive: salva => salva(), next: () => window.advanced = true };\n  window.TEST = { controlla, avviaLive };\n})();",
    ),
    context,
  );
  return { api: context.window.TEST, $, saves, alerts, redirects, requests, context, keydown: e => keydown(e) };
}

test("regia embeds the main presentation without a query-string credential", () => {
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/regia.html"), "utf8");
  assert.match(source, /\.\/\?vista=principale/);
  assert.doesNotMatch(source, /regia=|firebase/i);
  assert.doesNotMatch(html, /id="b-fb"|firebase/i);
});

test("inactive or unknown assembly has no in-onda styling", async () => {
  for (const attiva of [false, undefined, true]) {
    const { api, $ } = dashboard(attiva);
    await api.controlla();
    assert.equal($("#onda-label").textContent, attiva === true ? "In onda" : attiva === false ? "Anteprima" : "Stato non verificato");
    assert.equal($("#onda-frame").classes.has("big"), !!attiva);
    assert.equal($("#onda-dot").hidden, !attiva);
    assert.equal($("#avviso").hidden, !!attiva);
    if (!attiva) {
      assert.equal($("#b-live").textContent, attiva === false ? "Non live" : "Stato live non verificato");
      assert.equal($("#b-assemblea").textContent, attiva === false ? "Assemblea non iniziata" : "Assemblea non verificata");
    }
  }
});

test("a failed check revokes in-onda certainty and critical actions, then recovers", async () => {
  const options = {};
  const t = dashboard(true, 4, false, options);
  await t.api.controlla();
  assert.equal(t.$("#onda-label").textContent, "In onda");
  assert.doesNotMatch(t.$("#b-live").textContent, /Pubblico allineato/, "no viewer acknowledgement");
  options.checkFailure = true;
  await t.api.controlla();
  assert.equal(t.$("#onda-label").textContent, "Stato non verificato");
  assert.equal(t.$("#onda-frame").classes.has("big"), false);
  assert.equal(t.$("#onda-dot").hidden, true);
  assert.equal(t.$("#inizia").disabled, true);
  assert.equal(t.$("#termina").disabled, true);
  options.checkFailure = false;
  await t.api.controlla();
  assert.equal(t.$("#onda-label").textContent, "In onda");
});

test("global clicker keys cannot advance inside a modal dialog or native control", () => {
  const options = { dialogOpen: true };
  const t = dashboard(true, 4, false, options);
  const event = { key: " ", target: { closest: () => false }, preventDefault() {} };
  t.keydown(event);
  assert.equal(t.context.window.advanced, undefined);
  options.dialogOpen = false;
  t.keydown({ ...event, target: { closest: () => true } });
  assert.equal(t.context.window.advanced, undefined);
  t.keydown(event);
  assert.equal(t.context.window.advanced, true);
});

test("lifecycle actions keep confirmation and one pending save", async () => {
  let release;
  const options = { waitSave: new Promise(resolve => { release = resolve }) };
  const t = dashboard(false, 4, false, options);
  await t.api.controlla();
  const first = t.api.avviaLive();
  await new Promise(resolve => setImmediate(resolve));
  await t.api.avviaLive();
  assert.equal(t.$("#inizia").disabled, true);
  release();
  await first;
  assert.equal(t.saves.length, 1);
});

test("ending requires confirmation, preserves state on failure and sends only one pending save", async () => {
  const options = { confirm: false };
  const t = dashboard(true, 4, false, options);
  await t.api.controlla();
  await t.$("#termina").onclick();
  assert.equal(t.saves.length, 0);
  options.confirm = true;
  options.saveFailure = true;
  await t.$("#termina").onclick();
  assert.equal(t.redirects.length, 0);
  assert.equal(t.$("#termina").disabled, false);
  assert.equal(t.$("#onda-label").textContent, "In onda");
  options.saveFailure = false;
  let release;
  options.waitSave = new Promise(resolve => { release = resolve });
  const first = t.$("#termina").onclick();
  await t.$("#termina").onclick();
  assert.equal(t.$("#termina").disabled, true);
  release();
  await first;
  assert.equal(t.saves.length, 1);
  assert.equal(t.saves[0][0], false);
  assert.equal(t.redirects.length, 1);
});

test("overlapping status checks issue one batch of requests", async () => {
  let release;
  const options = { waitPresence: new Promise(resolve => { release = resolve }) };
  const t = dashboard(true, 4, false, options);
  const first = t.api.controlla();
  await t.api.controlla();
  assert.equal(t.requests.length, 2);
  release();
  await first;
});

test("lifecycle controls follow NAS state, independent of slide number", async () => {
  for (const active of [false, true, undefined]) {
    const t = dashboard(active);
    await t.api.controlla();
    assert.equal(t.$("#inizia").disabled, active !== false);
    assert.equal(t.$("#termina").hidden, active !== true);
    assert.equal(t.$("#termina").disabled, active !== true);
  }
});

test("starting in regia preserves the patch and updates immediately without reloading the publisher", async () => {
  const patch = { censimenti: { presenti_attuali: 42 } };
  const t = dashboard(false, 4, false, { patch: JSON.stringify(patch) });
  await t.api.controlla();
  await t.$("#inizia").onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(t.saves)), [[true, patch]]);
  assert.equal(t.$("#principale").src, undefined, "no iframe reload");
  assert.equal(t.$("#onda-label").textContent, "In onda");
  assert.equal(t.$("#avviso").hidden, true);
  assert.match(t.$("#avvio-stato").textContent, /Live avviato/);
  assert.equal(t.$("#inizia").hidden, true);
  assert.equal(t.$("#termina").disabled, false);
});

test("the large start control sits before the slide previews", () => {
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/regia.html"), "utf8");
  assert.equal((html.match(/id="inizia"/g) || []).length, 1);
  assert.ok(html.indexOf('id="inizia"') < html.indexOf('class="onda"'));
});

test("a stale dashboard check cannot undo a confirmed live activation", async () => {
  const options = {};
  const t = dashboard(false, 4, false, options);
  await t.api.controlla();
  let release;
  options.waitPresence = new Promise((resolve) => {
    release = resolve;
  });
  const stale = t.api.controlla();
  await t.api.avviaLive();
  assert.equal(t.$("#onda-label").textContent, "In onda");
  release();
  await stale;
  assert.equal(t.$("#onda-label").textContent, "In onda");
  assert.equal(t.$("#inizia").hidden, true);
});

test("a new empty database can be started without a patch", async () => {
  const t = dashboard(false, 4, false, { empty: true });
  await t.api.controlla();
  assert.equal(t.$("#inizia").disabled, false);
  await t.api.avviaLive();
  assert.equal(t.saves.length, 1);
  assert.equal(t.saves[0][2], undefined);
});

test("failed or cancelled starts do not reload the presentation", async () => {
  for (const options of [{ confirm: false }, { saveFailure: true }, { patch: "{invalid" }]) {
    const t = dashboard(false, 4, false, options);
    await t.api.controlla();
    await t.api.avviaLive();
    assert.equal(t.saves.length, 0);
    assert.equal(t.$("#principale").src, undefined);
    assert.equal(t.$("#inizia").disabled, false);
    if (options.confirm !== false) assert.match(t.alerts[0], /Avvio non riuscito/);
  }
});
