const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("dashboard does not load data or make requests before verified access", () => {
  const context = {
    window: { ACCESSO: { verificata: () => false } },
    document: {
      getElementById() {
        throw new Error("must not render before login");
      },
    },
    fetch() {
      throw new Error("must not request before login");
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), context);
  context.window.AREA_DASHBOARD.load();
});

test("NAS dashboard subscribes to an automatic summary and clears stale counters", async () => {
  const elements = new Map();
  const element = () => ({
    hidden: true,
    textContent: "",
    children: [],
    append(child) {
      this.children.push(child);
    },
    replaceChildren() {
      this.children = [];
    },
    remove() {},
    setAttribute() {},
  });
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let subscriber;
  const window = {
    LIVE: { nas: true },
    NAS: { user: { admin: true } },
    ACCESSO: { verificata: () => true },
    DATI: { anno_esercizio: 2026, assemblea: { titolo: "Assemblea" }, slide: [] },
    NAS_METRICS: {
      watch(options) {
        subscriber = options;
      },
    },
  };
  const context = {
    window,
    document: {
      getElementById: get,
      createElement: element,
      head: {
        append(script) {
          script.onload();
        },
      },
    },
    fetch: async () => ({ ok: true, json: async () => [] }),
    Date,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), context);
  window.AREA_DASHBOARD.load();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(subscriber.view, "summary");
  subscriber.render({
    enabled: true,
    sampledAt: Date.now(),
    traffic: { today: { visits: 4, connections: 8, errors: 0 }, liveStreams: 2 },
    resources: { host: null },
  });

  assert.equal(get("dashboard-visits").textContent, "4");
  assert.equal(get("dashboard-streams").textContent, "2");
  assert.equal(get("dashboard-cpu").textContent, "-");
  subscriber.error("Offline");
  assert.equal(get("dashboard-streams").textContent, "-");
});

test("non-admin dashboard does not request or show server statistics", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8");
  const element = () => ({ hidden: true, replaceChildren() {}, append() {} });
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const window = {
    LIVE: { nas: true }, NAS: { user: { admin: false } },
    ACCESSO: { verificata: () => true },
    NAS_METRICS: { watch() { throw new Error("Non-admin must not request summary"); } },
  };
  vm.runInNewContext(source, {
    window, document: { getElementById: get, createElement: element, head: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => [] }), Date,
  });
  window.AREA_DASHBOARD.load();
  assert.equal(get("dashboard-metrics").hidden, true);
});

test("dashboard introduces the workflow before the three tools", () => {
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/index.html"), "utf8");
  assert.ok(html.indexOf('class="dashboard-workflow"') < html.indexOf('class="dashboard-tools"'));
  assert.match(html, /<strong>Pubblica<\/strong><span>Pubblica le modifiche/);
  assert.doesNotMatch(html, /Salva sul NAS/);
});
