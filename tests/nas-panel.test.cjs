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
  let failed = false;
  const data = {
    enabled: true,
    sampledAt: Date.now(),
    service: { release: "test", startedAt: Date.now() },
    warnings: [],
    events: [],
    traffic: {
      today: { visits: 10, errors: 0 },
      totals: { visits: 20, views: 40, started: "2026-11-06" },
      online: 3,
      liveStreams: 6,
      liveLimit: 500,
      presentationDevices: 3,
      daily: [],
      pages: [],
      sessions: [],
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
    window: { LIVE: { nas: true } },
    document: { visibilityState: "visible", getElementById: get, querySelectorAll: () => [], createElement: element },
    fetch: async () => ({ ok: !failed, status: failed ? 401 : 200, json: async () => data }),
    AbortController,
    setInterval() {},
    clearInterval() {},
    setTimeout() {},
    clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  context.window.NAS_MONITOR.start();
  await flush();
  assert.equal(get("nas-visits").textContent, "10");
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
