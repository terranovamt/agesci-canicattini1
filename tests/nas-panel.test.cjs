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
      people: 2,
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
    window: { LIVE: { nas: true }, NAS: { user: { admin: false } }, addEventListener() {}, removeEventListener() {} },
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
  assert.equal(get("nas-statistics-link").hidden, true);
  assert.equal(get("nas-online").textContent, "3");
  assert.equal(get("nas-devices").textContent, "2");
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

test("statistics page is guarded and renders tracking separately from the live regia", async () => {
  const statistics = fs.readFileSync(path.join(__dirname, "../assets/js/statistiche.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/statistiche.html"), "utf8");
  assert.equal((html.match(/id="statistics-content"/g) || []).length, 1);
  assert.match(html, /<main id="statistics-content"/);
  assert.match(html, /<div id="statistics-data" hidden>/);
  let redirected;
  vm.runInNewContext(statistics, {
    window: { ACCESSO: { verificata: () => false } },
    location: {
      replace: (value) => {
        redirected = value;
      },
    },
  });
  assert.equal(redirected, "./");
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        textContent: "",
        hidden: false,
        children: [],
        attributes: {},
        dataset: {},
        style: {},
        append(...values) {
          this.children.push(...values);
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        addEventListener() {},
        removeAttribute(name) {
          delete this.attributes[name];
        },
        replaceChildren() {
          this.children = [];
        },
      });
    return elements.get(id);
  };
  get("statistics-data").hidden = true;
  const rangeButtons = [7, 30, 90, 365].map((days) => ({
    attributes: { "data-history-days": String(days) },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    addEventListener(_name, listener) {
      this.listener = listener;
    },
  }));
  const hourly = Array.from({ length: 60 }, (_, index) => ({
    sampledAt: Date.now() - (59 - index) * 60000,
    online: index === 59 ? 4 : 2,
    p95Ms: index === 59 ? 27.6 : 20,
    cpuPercent: index === 59 ? 33 : 15,
    memoryPercent: index === 59 ? 70 : 60,
  }));
  let subscriber, resize;
  let historyWidth = 720;
  get("stats-history-chart").getBoundingClientRect = () => ({ width: historyWidth });
  vm.runInNewContext(statistics, {
    window: {
      ACCESSO: { verificata: () => true },
      LIVE: { nas: true },
      NAS: { user: { admin: true } },
      addEventListener(name, listener) {
        if (name === "resize") resize = listener;
      },
      NAS_METRICS: {
        watch(options) {
          subscriber = options;
        },
      },
    },
    document: {
      getElementById: get,
      createElement: () => get(Symbol()),
      createElementNS: (_namespace, tagName) => Object.assign(get(Symbol()), { tagName }),
      querySelectorAll: () => rangeButtons,
    },
    fetch: async () => ({ ok: true, json: async () => ({ sha: "a".repeat(40) }) }),
  });
  assert.equal(get("statistics-data").hidden, false);
  const statisticsData = {
    enabled: true,
    sampledAt: Date.now(),
    traffic: {
      today: { visits: 2, views: 21, people: 5, liveUnique: 4, connections: 4, errors: 0 },
      totals: { visits: 5, views: 6, connections: 7, started: "2026-11-06" },
      people: 2,
      online: 1,
      visible: 1,
      liveStreams: 2,
      presentationDevices: 3,
      daily: [{ day: "2026-11-06", visits: 2, views: 3, people: 5, liveUnique: 4, connections: 4 }],
      pages: [
        { page: "home", views: 9 },
        { page: "assemblea", views: 6 },
        { page: "statistiche", views: 3 },
        { page: "peg", views: 3 },
      ],
      sessions: [],
    },
    service: { release: "a".repeat(40) },
    api: { p95Ms: 14.451, errors5xx: 0, limited: 0 },
    performance: { hourly },
    events: [],
  };
  subscriber.render(statisticsData);
  await new Promise(setImmediate);
  assert.equal(get("stats-visits").textContent, "2");
  assert.equal(get("stats-live-unique").textContent, "4");
  assert.equal(get("stats-online").textContent, "2");
  assert.equal(get("stats-people").textContent, "5");
  assert.equal(get("stats-site-tabs").textContent, "1");
  assert.equal(get("stats-site-visible").textContent, "1");
  assert.equal(get("stats-presentation").textContent, "3");
  assert.equal(get("stats-errors").textContent, "0");
  assert.equal(get("stats-errors").dataset.state, "measured");
  assert.equal(get("stats-latency").textContent, "14\u00a0ms");
  assert.equal(get("stats-streams").textContent, "2");
  assert.equal(get("stats-days").children[0].children.length, 5);
  assert.equal(get("stats-days").children[0].children[0].textContent, "06/11/2026");
  assert.equal(get("stats-days").children[0].children[1].textContent, "5");
  assert.equal(get("stats-totals").textContent, "Dal 06/11/2026 · 5 visite al sito · 6 pagine viste.");
  assert.match(get("statistics-status").textContent, /^Dati attuali delle \d{2}:\d{2} \(ora italiana\)/);
  assert.equal(get("stats-distribution-title").textContent, "Home e Presentazione raccolgono il 71% delle pagine viste.");
  assert.equal(get("stats-release-commit").textContent, "a".repeat(12));
  assert.equal(get("stats-release-revision").hidden, true);
  assert.match(get("stats-release-status").textContent, /^Il NAS è all’ultimo commit del branch NAS\. Verificato alle \d{2}:\d{2}\.$/);
  assert.equal(get("stats-release-check").disabled, false);
  assert.equal(get("stats-release-check-reason").hidden, true);
  assert.equal(get("stats-hour-online-current").textContent, "4");
  assert.equal(get("stats-hour-online-peak").textContent, "Picco 60 min: 4");
  assert.match(get("stats-hour-online-sample").textContent, /^Ultimo campione \d{2}:\d{2} · 60\/60 minuti con dati$/);
  assert.equal(get("stats-hour-latency-current").textContent, "28\u00a0ms");
  assert.equal(get("stats-hour-cpu-current").textContent, "33%");
  const axisLabels = (id) =>
    get(id).children.filter((child) => child.attributes.class === "chart-axis-label").map((child) => child.textContent);
  const yLabels = (id) =>
    get(id).children.filter((child) => child.attributes.class === "chart-axis-label").map((child) => child.textContent).filter((label) => !/[:/]/.test(label));
  assert.deepEqual(yLabels("stats-hour-cpu"), ["40%", "20%", "0%"]);
  assert.deepEqual(yLabels("stats-hour-ram"), ["75%", "50%", "25%", "0%"]);
  assert.deepEqual(yLabels("stats-hour-latency"), ["30\u00a0ms", "20\u00a0ms", "10\u00a0ms", "0\u00a0ms"]);
  assert.deepEqual(yLabels("stats-hour-online"), ["4", "2", "0"]);
  const timeLabels = axisLabels("stats-hour-online").filter((label) => /^\d{2}:\d{2}$/.test(label));
  assert.equal(timeLabels.length, 3);
  assert.equal(new Set(timeLabels).size, timeLabels.length);
  for (const id of ["stats-hour-online", "stats-hour-latency", "stats-hour-cpu", "stats-hour-ram"])
    assert.equal(new Set(yLabels(id)).size, yLabels(id).length, id + " has duplicate ticks");
  const historyTicks = (side) => get("stats-history-chart").children
    .filter((child) => child.attributes["data-axis"] === side).map((child) => child.textContent);
  assert.deepEqual(historyTicks("left"), ["6", "4", "2", "0"]);
  assert.deepEqual(historyTicks("right"), ["3", "2", "1", "0"]);
  const seriesPoints = (id, color) => get(id).children
    .filter((child) => child.attributes.class === "chart-point chart-" + color);
  const seriesPaths = (color) => get("stats-history-chart").children
    .filter((child) => child.attributes.class === "chart-series chart-" + color);
  const originalDaily = statisticsData.traffic.daily;
  statisticsData.traffic.daily = [
    { day: "2026-11-06", visits: 6, views: 6000, people: 3 },
    { day: "2026-11-05", visits: 3, views: 3000, people: null },
    { day: "2026-11-04", visits: 0, views: 0, people: 0 },
  ];
  subscriber.render(statisticsData);
  assert.deepEqual(historyTicks("left"), ["6", "4", "2", "0"]);
  assert.deepEqual(historyTicks("right"), [6000, 4000, 2000, 0].map((value) => value.toLocaleString("it-IT")));
  assert.deepEqual(get("stats-history-chart").children.filter((child) => child.attributes.class === "chart-axis-title")
    .map((child) => child.textContent), ["Visite / persone uniche", "Pagine viste"]);
  const desc = get("stats-history-chart").children.find((child) => child.tagName === "desc").textContent;
  assert.match(desc, /Asse sinistro: visite e persone uniche\. Asse destro: pagine viste\. Scale indipendenti/);
  assert.match(desc, /non sono confrontabili direttamente/);
  assert.ok(desc.includes("Pagine viste: 3 valori su 3, ultimo " + (6000).toLocaleString("it-IT")));
  assert.match(desc, /Persone uniche: 2 valori su 3/);
  assert.match(get("stats-history-description").textContent, /Asse sinistro: visite e persone uniche; asse destro: pagine viste/);
  const verifyHistoryGeometry = (width, height) => {
    const svg = get("stats-history-chart");
    assert.equal(svg.attributes.viewBox, `0 0 ${width} ${height}`);
    const left = 21, right = width - 14 - (6000).toLocaleString("it-IT").length * 7, top = 40, bottom = height - 32;
    const midX = (left + right) / 2, midY = (top + bottom) / 2;
    for (const color of ["visits", "views"]) {
      const points = seriesPoints("stats-history-chart", color);
      assert.deepEqual(points.map((point) => Number(point.attributes.cx)), [left, midX, right]);
      assert.deepEqual(points.map((point) => Number(point.attributes.cy)), [bottom, midY, top]);
      assert.equal(seriesPaths(color)[0].attributes.d,
        `M${left.toFixed(1)},${bottom.toFixed(1)} L${midX.toFixed(1)},${midY.toFixed(1)} L${right.toFixed(1)},${top.toFixed(1)}`);
    }
    assert.deepEqual(seriesPoints("stats-history-chart", "connections").map((point) => Number(point.attributes.cy)), [bottom, midY]);
    assert.equal(seriesPaths("connections").length, 2, "missing people data must break the line");
    assert.equal(svg.children.find((child) => child.attributes.class === "chart-area chart-visits-area").attributes.d,
      seriesPaths("visits")[0].attributes.d + ` L${right.toFixed(1)},${bottom} L${left.toFixed(1)},${bottom} Z`);
  };
  verifyHistoryGeometry(720, 280);
  historyWidth = 320;
  resize();
  verifyHistoryGeometry(320, 230);
  for (const [id, color, expectedY] of [["online", "online", 14], ["latency", "latency", 24.72], ["cpu", "cpu", 37.45], ["ram", "ram", 22.933333333333337]]) {
    const svgId = "stats-hour-" + id;
    assert.equal(get(svgId).children.some((child) => child.attributes["data-axis"] === "right"), false);
    assert.ok(Math.abs(Number(seriesPoints(svgId, color).at(-1).attributes.cy) - expectedY) < 1e-8, svgId);
  }
  statisticsData.traffic.daily = originalDaily;
  subscriber.render(statisticsData);
  statisticsData.performance.hourly = hourly.map((sample, index) => ({
    ...sample,
    online: index % 2 ? 0 : null,
    cpuPercent: index === 58 ? 2.456 : null,
    memoryPercent: index === 59 ? 97 : null,
    p95Ms: null,
  }));
  subscriber.render(statisticsData);
  assert.deepEqual(yLabels("stats-hour-cpu"), ["10%", "5%", "0%"]);
  assert.equal(get("stats-hour-cpu-current").textContent, "2,5%");
  assert.match(get("stats-hour-cpu-sample").textContent, / 1\/60 minuti con dati$/);
  assert.deepEqual(yLabels("stats-hour-ram"), ["100%", "50%", "0%"]);
  assert.equal(get("stats-hour-ram").dataset.peak, "97");
  assert.deepEqual(yLabels("stats-hour-online"), ["1", "0"]);
  assert.equal(get("stats-hour-online-current").textContent, "0");
  assert.equal(get("stats-hour-online-current").dataset.state, "measured");
  assert.match(get("stats-hour-online-sample").textContent, / 30\/60 minuti con dati$/);
  assert.equal(get("stats-hour-latency-current").textContent, "n.d.");
  assert.equal(get("stats-hour-latency-current").dataset.state, "missing");
  assert.match(get("stats-hour-latency-sample").textContent, /^0\/60 minuti con dati/);
  assert.match(get("stats-hour-note").textContent, /Persone collegate 30, Tempo di risposta API p95 0, Utilizzo CPU 1, Utilizzo RAM 1/);
  assert.match(get("stats-hour-note").textContent, /uno zero nel grafico è un valore misurato/);
  const point = get("stats-hour-online").children.find((child) => child.attributes.class?.includes("chart-point"));
  assert.doesNotMatch(point.attributes["aria-label"], /Invalid Date/);
  assert.match(point.attributes["aria-label"], /^\d{2}\/\d{2} \d{2}:\d{2}: /);
  assert.equal(
    get("stats-history-chart").children.filter((child) => child.attributes.class?.includes("chart-series")).length,
    3,
  );
  statisticsData.enabled = false;
  statisticsData.api.p95Ms = null;
  subscriber.render(statisticsData);
  assert.equal(get("stats-online").textContent, "n.d.");
  assert.equal(get("stats-online").dataset.state, "missing");
  assert.equal(get("stats-latency").textContent, "n.d.");
  assert.match(get("statistics-status").textContent, /^Raccolta dal browser disattivata/);
  statisticsData.service.release = "sviluppo-locale";
  subscriber.render(statisticsData);
  assert.equal(get("stats-release-commit").hidden, true);
  assert.equal(get("stats-release-revision").hidden, false);
  assert.match(get("stats-release-revision").textContent, /sviluppo-locale.*versione locale/);
  assert.match(get("stats-release-status").textContent, /non confrontabile/);
  assert.equal(get("stats-release-check").disabled, true);
  assert.equal(get("stats-release-check-reason").hidden, false);
  assert.match(get("stats-release-check-reason").textContent, /commit deployato/);
  delete statisticsData.service.release;
  subscriber.render(statisticsData);
  assert.equal(get("stats-release-revision").textContent, "non comunicato dal server");
  assert.equal(get("stats-release-check").disabled, true);
  rangeButtons[0].listener();
  assert.equal(rangeButtons[0].attributes["aria-pressed"], "true");
  assert.match(get("stats-history-description").textContent, /ultimi 7 giorni/);
  subscriber.error("Offline");
  assert.equal(get("statistics-data").dataset.state, "stale");
  assert.match(get("statistics-status").textContent, /^Offline\. .*non indica di per sé un guasto del NAS/);
  assert.equal(get("stats-online").textContent, "—");
  assert.equal(get("stats-online").dataset.state, "error");
  assert.equal(get("stats-live-unique").textContent, "4");
  assert.equal(get("stats-live-unique").dataset.state, "stale");
  assert.equal(get("stats-hour-online-current").textContent, "0");
});

test("statistics without any successful sample shows an error, not a NAS failure or fake zeros", () => {
  const statistics = fs.readFileSync(path.join(__dirname, "../assets/js/statistiche.js"), "utf8");
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        textContent: "",
        hidden: false,
        children: [],
        attributes: {},
        dataset: {},
        style: {},
        append(...values) {
          this.children.push(...values);
        },
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        addEventListener() {},
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
      NAS: { user: { admin: true } },
      NAS_METRICS: { watch: (options) => (subscriber = options) },
    },
    document: {
      getElementById: get,
      createElement: () => get(Symbol()),
      createElementNS: () => get(Symbol()),
      querySelectorAll: () => [],
    },
  });
  assert.equal(get("stats-release-check").disabled, undefined);
  subscriber.error("Monitoraggio: tempo di risposta scaduto");
  assert.equal(get("statistics-data").dataset.state, "error");
  assert.match(get("statistics-status").textContent, /non indica di per sé un guasto del NAS\. Nessun dato ricevuto finora\.$/);
  for (const id of ["stats-visits", "stats-online", "stats-live-unique", "stats-hour-cpu-current"]) {
    assert.equal(get(id).textContent, "—", id);
    assert.equal(get(id).dataset.state, "error", id);
  }
  assert.equal(get("stats-no-events").textContent, "Segnalazioni non disponibili.");
  const empty = get("stats-hour-cpu").children.find((child) => child.attributes.class === "statistics-chart-empty");
  assert.equal(empty.textContent, "Dati non disponibili");
});

const chrome = ["google-chrome", "chromium", "chromium-browser"].find(
  (command) => require("node:child_process").spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0,
);

test("statistics page adapts to six viewports keeping every section visible, readable and touch-friendly", { skip: !chrome }, () => {
  const { spawnSync } = require("node:child_process");
  const { renderHtml } = require("../tools/site-layout.cjs");
  const root = path.join(__dirname, "..");
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const page = "area-riservata/statistiche.html";
  const css = [];
  const now = Date.UTC(2026, 10, 9, 16, 10);
  const hourly = Array.from({ length: 60 }, (_, index) => ({
    sampledAt: now - (59 - index) * 60000,
    online: index < 58 ? null : index - 57,
    p95Ms: index < 58 ? null : 14.451,
    cpuPercent: null,
    memoryPercent: null,
  }));
  const data = {
    enabled: true,
    sampledAt: now,
    service: { release: "sviluppo-locale" },
    traffic: {
      today: { visits: 1, views: 11, people: 1, liveUnique: 0, errors: 0 },
      totals: { visits: 1, views: 11, started: "2026-11-09" },
      people: 1,
      online: 11,
      visible: 0,
      liveStreams: 0,
      liveLimit: 500,
      presentationDevices: 0,
      daily: Array.from({ length: 365 }, (_, offset) => ({
        day: new Date(now - offset * 86400000).toISOString().slice(0, 10),
        visits: offset ? null : 1,
        views: offset ? null : 11,
        people: offset ? null : 1,
        liveUnique: offset ? null : 0,
      })),
      pages: [
        { page: "area", views: 4 },
        { page: "gestione-documenti", views: 2 },
        { page: "assemblea", views: 1 },
        { page: "guida", views: 1 },
        { page: "regia", views: 1 },
      ],
      sessions: [{ page: "statistiche", visible: true, latencyMs: 12.7, lastSeen: now }],
    },
    api: { p95Ms: 17.2, errors5xx: 0, limited: 0, sampleCount: 4 },
    performance: { hourly },
    events: [{ time: now - 120000, kind: "http-error", page: "area", status: 404 }],
  };
  const fixture = renderHtml(read(page), page)
    .replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g, (tag, href) => {
      if (tag.includes("stylesheet") && !/^https?:/.test(href))
        css.push(read(path.normalize(path.join(path.dirname(page), href.split("?")[0]))));
      return "";
    })
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<img\b[^>]*>/g, (tag) => tag.replace(/src="[^"]*"/, 'src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22460%22 height=%22526%22/%3E"'))
    .replace("</head>", `<style>${css.join("\n")}</style></head>`)
    .replace(
      "</body>",
      `<script>
        window.errors = [];
        addEventListener("error", (event) => errors.push(event.message));
        window.ACCESSO = { verificata: () => true };
        window.LIVE = { nas: true, basePath: "" };
        window.NAS = { user: { admin: true } };
        window.NAS_METRICS = { watch: (options) => options.render(${JSON.stringify(data)}) };
        window.fetch = () => Promise.reject(new Error("offline"));
        ${read("assets/js/statistiche.js")}
      </script></body>`,
    );
  const html = `<!doctype html><body><script>
    const results = [];
    (async () => {
      for (const [width, height] of [[1920, 1080], [1366, 768], [1180, 820], [820, 1180], [844, 390], [390, 844]]) {
        const frame = document.createElement("iframe");
        frame.style.cssText = "border:0;width:" + width + "px;height:" + height + "px";
        document.body.append(frame);
        const loaded = new Promise((resolve) => (frame.onload = resolve));
        frame.srcdoc = ${JSON.stringify(fixture).replace(/</g, "\\u003c")};
        await loaded;
        await new Promise((resolve) => setTimeout(resolve, 300));
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        const visible = (node) => node.getClientRects().length > 0 && win.getComputedStyle(node).visibility !== "hidden";
        const small = [...doc.querySelectorAll("a[href], button, summary, input, select, [tabindex]")]
          .filter((node) => !node.closest("svg") && visible(node))
          .map((node) => ({ node, box: node.getBoundingClientRect() }))
          .filter(({ box }) => box.height < 44 || box.width < 44)
          .map(({ node, box }) => (node.id || node.textContent.trim().slice(0, 30)) + " " + Math.round(box.width) + "x" + Math.round(box.height));
        const wrapped = [...doc.querySelectorAll(".statistics-page dd, .statistics-hour-values strong")]
          .filter((node) => visible(node) && node.textContent.trim())
          .filter((node) => node.getClientRects().length > 1 || node.getBoundingClientRect().height > parseFloat(win.getComputedStyle(node).fontSize) * 1.9)
          .map((node) => node.id + "=" + node.textContent);
        const charts = [...doc.querySelectorAll(".statistics-chart")].filter(visible);
        const tinyText = [...doc.querySelectorAll(".statistics-chart text")]
          .filter((node) => visible(node) && node.textContent.trim())
          .filter((node) => node.getBoundingClientRect().height < 11)
          .map((node) => node.closest("svg").id + ":" + node.textContent + ":" + node.getBoundingClientRect().height.toFixed(1));
        const scaled = charts.map((svg) => ({ id: svg.id, ratio: svg.getBoundingClientRect().width / svg.viewBox.baseVal.width }))
          .filter(({ ratio }) => ratio < 0.97 || ratio > 1.03).map(({ id, ratio }) => id + ":" + ratio.toFixed(2));
        const clipped = charts.flatMap((svg) => {
          const frameBox = svg.getBoundingClientRect();
          return [...svg.querySelectorAll("text")].filter((node) => node.textContent.trim()).filter((node) => {
            const box = node.getBoundingClientRect();
            return box.left < frameBox.left - 0.5 || box.right > frameBox.right + 0.5 || box.top < frameBox.top - 0.5 || box.bottom > frameBox.bottom + 0.5;
          }).map((node) => svg.id + ":" + node.textContent);
        });
        const hourWidth = Math.min(...["online", "latency", "cpu", "ram"].map((id) => doc.getElementById("stats-hour-" + id).getBoundingClientRect().width));
        const historyWidth = doc.getElementById("stats-history-chart").getBoundingClientRect().width;
        const mainBox = doc.getElementById("statistics-content").getBoundingClientRect();
        const contentBox = doc.querySelector(".metrics-heading").getBoundingClientRect();
        const edges = (node) => {
          const style = win.getComputedStyle(node);
          const box = node.getBoundingClientRect();
          return [box.left + parseFloat(style.paddingLeft), box.right - parseFloat(style.paddingRight)];
        };
        const brand = doc.querySelector(".reserved-header .brand").getBoundingClientRect();
        const headerNav = doc.querySelector(".reserved-header nav").getBoundingClientRect();
        const footerBrand = doc.querySelector(".site-footer .footer-brand").getBoundingClientRect();
        const near = (left, right) => Math.abs(left - right) <= 1;
        const aligned = [doc.querySelector(".reserved-header"), doc.querySelector(".site-footer")].every((node) => {
          const [left, right] = edges(node);
          return near(left, contentBox.left) && near(right, contentBox.right);
        }) && near(brand.left, contentBox.left) && near(headerNav.right, contentBox.right) && near(footerBrand.left, contentBox.left);
        const overlapping = [...doc.querySelectorAll(".statistics-chart")].filter((svg) => {
          const boxes = [...svg.querySelectorAll("text.chart-axis-label")].map((node) => node.getBoundingClientRect());
          return boxes.some((box, i) => boxes.slice(i + 1).some((next) =>
            box.left < next.right - 1 && next.left < box.right - 1 && box.top < next.bottom - 1 && next.top < box.bottom - 1));
        }).map((svg) => svg.id);
        const columns = win.getComputedStyle(doc.querySelector(".statistics-hourly-grid")).gridTemplateColumns.split(" ").length;
        const expectedColumns = width <= 600 ? 1 : width >= 1280 ? 4 : 2;
        const button = doc.getElementById("stats-release-check");
        results.push({
          width,
          noOverflow: doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
          allSections: !doc.querySelector("[data-section-nav], [data-section-panel]") &&
            ["statistics-version", "statistics-traffic", "statistics-server", "statistics-diagnostic-panel"].every((id) => visible(doc.getElementById(id))),
          serverColumns: columns === expectedColumns,
          readableHourCharts: hourWidth >= 240,
          readableHistory: historyWidth >= Math.min(560, doc.documentElement.clientWidth * 0.8),
          noWastedMargin: mainBox.width >= Math.min(doc.documentElement.clientWidth, 1560) - 1 &&
            mainBox.left <= Math.max(1, (doc.documentElement.clientWidth - 1560) / 2 + 1),
          headerFooterAligned: aligned,
          missingVsZero: doc.getElementById("stats-hour-cpu-current").textContent === "n.d." &&
            doc.getElementById("stats-errors").textContent === "0" && doc.getElementById("stats-errors").dataset.state === "measured",
          releaseExplained: button.disabled && visible(doc.getElementById("stats-release-check-reason")) &&
            /sviluppo-locale/.test(doc.getElementById("stats-release-revision").textContent),
          noHealthDot: !doc.querySelector(".metrics-live-badge i"),
          noErrors: win.errors.length === 0,
          small, wrapped, tinyText, overlapping, scaled, clipped, columns, hourWidth, historyWidth,
        });
        frame.remove();
      }
      const out = document.createElement("pre"); out.id = "result";
      out.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(results)))); document.body.append(out);
    })().catch((error) => { const out = document.createElement("pre"); out.id = "failure"; out.textContent = error.message; document.body.append(out); });
  </script>`;
  const dir = path.join(__dirname, ".nas-panel-chrome-" + process.pid);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const file = path.join(dir, "fixture.html");
    fs.writeFileSync(file, html);
    const run = spawnSync(
      chrome,
      ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-proxy-server",
        "--no-first-run", "--user-data-dir=" + path.join(dir, "profile"), "--virtual-time-budget=15000",
        "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 90000, maxBuffer: 20 * 1024 * 1024 },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /<pre id="failure">/, run.stdout.slice(-500));
    const output = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
    assert.ok(output, run.stdout.slice(-2000));
    const results = JSON.parse(decodeURIComponent(escape(Buffer.from(output[1], "base64").toString("binary"))));
    assert.equal(results.length, 6);
    for (const result of results) {
      for (const [key, value] of Object.entries(result))
        if (typeof value === "boolean") assert.equal(value, true, key + " @" + result.width + ": " + JSON.stringify(result));
      assert.deepEqual(result.small, [], "controls below 44px @" + result.width);
      assert.deepEqual(result.wrapped, [], "values split from units @" + result.width);
      assert.deepEqual(result.tinyText, [], "unreadable chart text @" + result.width);
      assert.deepEqual(result.overlapping, [], "overlapping axis labels @" + result.width);
      assert.deepEqual(result.scaled, [], "charts not drawn at their rendered width @" + result.width);
      assert.deepEqual(result.clipped, [], "chart text outside the chart @" + result.width);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
