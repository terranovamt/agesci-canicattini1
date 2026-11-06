const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/core/monitoraggio.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("NAS panel displays measured values and clears live values when monitoring fails", async () => {
  const elements = new Map();
  const element = () => ({
    hidden: false,
    textContent: "",
    children: [],
    append(child) {
      this.children.push(child);
    },
    replaceChildren() {
      this.children = [];
    },
  });
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let failed = false,
    requested;
  const data = {
    enabled: true,
    sampledAt: Date.now(),
    service: { release: "test", startedAt: Date.now() },
    warnings: [],
    events: [],
    traffic: {
      online: 3,
      liveStreams: 6,
      liveLimit: 500,
      presentationDevices: 3,
    },
    api: { p95Ms: 25, errors5xx: 0, limited: 0 },
    resources: {
      process: { cpuCorePercent: 12, rssBytes: 1024 ** 2, heapBytes: 1024, eventLoopP95Ms: null },
      container: { memoryBytes: null, memoryLimitBytes: null },
      host: null,
      disk: null,
    },
  };
  const context = {
    window: { LIVE: { nas: true }, addEventListener() {}, removeEventListener() {} },
    document: {
      visibilityState: "visible",
      getElementById: get,
      querySelectorAll: () => [],
      createElement: element,
      addEventListener() {},
      removeEventListener() {},
    },
    fetch: async (url) => {
      requested = url;
      return { ok: !failed, status: failed ? 401 : 200, json: async () => data };
    },
    AbortController,
    setInterval() {},
    clearInterval() {},
    setTimeout() {},
    clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/shared/nas-metrics.js"), "utf8"), context);
  vm.runInContext(source, context);
  context.window.NAS_MONITOR.start();
  await flush();
  assert.equal(requested, "/api/metrics?view=live");
  assert.equal(elements.has("nas-visits"), false);
  assert.equal(elements.has("nas-refresh"), false);
  assert.equal(get("nas-online").textContent, "3");
  assert.equal(get("nas-host-cpu").textContent, "-");
  assert.equal(get("nas-streams").textContent, "6 / 500");
  assert.equal(get("legacy-service-metrics").hidden, true);
  failed = true;
  await context.window.NAS_MONITOR.refresh();
  assert.equal(get("nas-online").textContent, "-");
  assert.equal(get("nas-streams").textContent, "-");
  assert.match(get("nas-status").textContent, /Sessione scaduta/);
});

test("metrics polling never overlaps and resumes automatically after returning to a cached page", async () => {
  const documentEvents = new Map(),
    windowEvents = new Map(),
    intervals = [];
  let release,
    calls = 0,
    renders = 0;
  const reply = { ok: true, json: async () => ({}) };
  const context = {
    window: {
      addEventListener: (name, handler) => windowEvents.set(name, handler),
      removeEventListener: (name) => windowEvents.delete(name),
    },
    document: {
      visibilityState: "visible",
      addEventListener: (name, handler) => documentEvents.set(name, handler),
      removeEventListener: (name) => documentEvents.delete(name),
    },
    fetch: async () => {
      calls++;
      return calls === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : reply;
    },
    AbortController,
    setTimeout() {},
    clearTimeout() {},
    setInterval: (handler) => intervals.push(handler),
    clearInterval() {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/shared/nas-metrics.js"), "utf8"), context);
  const watcher = context.window.NAS_METRICS.watch({
    render() {
      renders++;
    },
    error() {
      throw new Error("Unexpected monitoring error");
    },
  });
  intervals[0]();
  assert.equal(calls, 1);
  release(reply);
  await flush();
  assert.equal(renders, 1);
  context.document.visibilityState = "hidden";
  intervals[0]();
  assert.equal(calls, 1);
  context.document.visibilityState = "visible";
  documentEvents.get("visibilitychange")();
  await flush();
  assert.equal(calls, 2);
  windowEvents.get("pagehide")({ persisted: true });
  windowEvents.get("pageshow")();
  await flush();
  assert.equal(calls, 3);
  watcher.stop();
  intervals[0]();
  assert.equal(calls, 3);
});

test("statistics page is guarded and renders tracking separately from the live regia", () => {
  const statistics = fs.readFileSync(path.join(__dirname, "../assets/js/statistiche.js"), "utf8");
  let redirected;
  vm.runInNewContext(statistics, {
    window: { ACCESSO: { verificata: () => false } },
    location: {
      replace: (value) => {
        redirected = value;
      },
    },
  });
  assert.equal(redirected, "index.html");
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        textContent: "",
        hidden: false,
        children: [],
        append(value) {
          this.children.push(value);
        },
        replaceChildren() {
          this.children = [];
        },
      });
    return elements.get(id);
  };
  let subscriber;
  vm.runInNewContext(statistics, {
    window: {
      ACCESSO: { verificata: () => true },
      LIVE: { nas: true },
      NAS_METRICS: {
        watch(options) {
          subscriber = options;
        },
      },
    },
    document: { getElementById: get, createElement: () => get(Symbol()) },
  });
  subscriber.render({
    enabled: true,
    sampledAt: Date.now(),
    traffic: {
      today: { visits: 2, views: 3, connections: 4, errors: 0 },
      totals: { visits: 5, views: 6, connections: 7, started: "2026-11-06" },
      online: 1,
      liveStreams: 2,
      daily: [{ day: "2026-11-06", visits: 2, views: 3, connections: 4 }],
      pages: [{ page: "statistiche", views: 1 }],
      sessions: [],
    },
    api: { p95Ms: 20, errors5xx: 0, limited: 0 },
    events: [],
  });
  assert.equal(get("stats-visits").textContent, "2");
  assert.equal(get("stats-connections").textContent, "4");
  assert.equal(get("stats-days").children[0].children.length, 4);
  assert.equal(get("stats-pages").children[0].children[0].textContent, "Statistiche");
  subscriber.error("Offline");
  assert.equal(get("stats-connections").textContent, "-");
});
