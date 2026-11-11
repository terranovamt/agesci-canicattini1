const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/nas-telemetry.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function browser(enabled = true, preview = false, storage = new Map(), route = "/") {
  const calls = [],
    events = new Map(),
    intervals = [];
  const window = {
    DOCUMENTS_PREVIEW: preview,
    crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789abc" },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return {
        ok: !String(url).includes("broken"),
        status: String(url).includes("broken") ? 404 : 200,
        json: async () => ({ enabled }),
      };
    },
  };
  window.top = window.self = window;
  const context = {
    window,
    crypto: window.crypto,
    URL,
    location: { pathname: route, origin: "https://site.test", href: "https://site.test" + route },
    document: { readyState: "complete", visibilityState: "visible" },
    performance: { now: () => 1 },
    localStorage: { getItem: (name) => storage.get(name), setItem: (name, value) => storage.set(name, value) },
    addEventListener: (name, handler) => events.set(name, handler),
    setInterval: (handler) => intervals.push(handler),
    AbortController,
    setTimeout() {},
    clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  return { window, calls, storage, events, intervals, context };
}

test("browser telemetry counts a view and heartbeat and never includes query strings or error messages", async () => {
  const app = browser();
  await flush();
  let payload = JSON.parse(app.calls[1].options.body);
  assert.equal(payload.type, "view");
  assert.equal(payload.page, "home");
  assert.equal(payload.visitor, app.storage.get("nas-live-visitor-id"));
  await app.window.fetch("/broken?token=secret-value");
  app.events.get("error")({
    message: "secret-message",
    filename: "/setup?password=secret",
    target: { tagName: "IMG" },
  });
  app.intervals[0]();
  await flush();
  payload = JSON.parse(app.calls.at(-1).options.body);
  assert.equal(payload.type, "heartbeat");
  assert.deepEqual(
    payload.events.map((event) => event.kind),
    ["http-error", "resource-error"],
  );
  assert.ok(!JSON.stringify(payload).includes("secret"));
  app.context.document.visibilityState = "hidden";
  app.events.get("visibilitychange")();
  await flush();
  let hidden = app.calls.at(-1);
  assert.equal(JSON.parse(hidden.options.body).type, "heartbeat");
  assert.equal(JSON.parse(hidden.options.body).visible, false);
  assert.equal(hidden.options.keepalive, true);
  app.intervals[0]();
  await flush();
  hidden = JSON.parse(app.calls.at(-1).options.body);
  assert.equal(hidden.type, "heartbeat");
  assert.equal(hidden.visible, false);
  app.events.get("pagehide")({ persisted: true });
  await flush();
  assert.equal(JSON.parse(app.calls.at(-1).options.body).type, "leave");
  app.context.document.visibilityState = "visible";
  app.events.get("pageshow")({ persisted: true });
  await flush();
  assert.equal(JSON.parse(app.calls.at(-1).options.body).type, "heartbeat");
});

test("disabled telemetry and preview do not create visitor IDs or periodic beacons", async () => {
  for (const app of [browser(false), browser(true, true)]) {
    await flush();
    assert.equal(app.storage.size, 0);
    assert.equal(app.intervals.length, 0);
    assert.ok(app.calls.every((call) => call.url === "/api/telemetry/config"));
  }
});

test("tracking distinguishes statistics, document management, preparatory documents and slides", async () => {
  for (const [route, category] of [
    ["/area-riservata/statistiche.html", "statistiche"],
    ["/area-riservata/documenti.html", "gestione-documenti"],
    ["/assemblea/", "assemblea-documenti"],
    ["/area-riservata/assemblea/", "assemblea"],
  ]) {
    const app = browser(true, false, new Map(), route);
    await flush();
    assert.equal(JSON.parse(app.calls[1].options.body).page, category);
  }
});

test("telemetry stays under the NAS site prefix", async () => {
  const app = browser(true, false, new Map(), "/agesci-canicattini1/area-riservata/statistiche.html");
  await flush();
  assert.equal(app.calls[0].url, "/agesci-canicattini1/api/telemetry/config");
  assert.equal(app.calls[1].url, "/agesci-canicattini1/api/telemetry");
  assert.equal(JSON.parse(app.calls[1].options.body).page, "statistiche");
});

test("another tab shares a recent visit ID but renews one after inactivity", async () => {
  const storage = new Map([
    ["nas-visit-id", "aaaaaaaa-1234-1234-1234-123456789abc"],
    ["nas-visit-time", String(Date.now())],
  ]);
  const recent = browser(true, false, storage);
  await flush();
  assert.equal(JSON.parse(recent.calls[1].options.body).id, "aaaaaaaa-1234-1234-1234-123456789abc");
  storage.set("nas-visit-time", String(Date.now() - 1800001));
  const expired = browser(true, false, storage);
  await flush();
  assert.notEqual(JSON.parse(expired.calls[1].options.body).id, "aaaaaaaa-1234-1234-1234-123456789abc");
});

test("live visitor ID remains anonymous and stable across tabs", () => {
  const storage = new Map();
  const first = browser(false, false, storage);
  const visitor = first.window.NAS_VISITOR.id();
  assert.match(visitor, /^[a-f0-9-]{36}$/i);
  assert.equal(storage.get("nas-live-visitor-id"), visitor);
  const anotherTab = browser(false, false, storage);
  assert.equal(anotherTab.window.NAS_VISITOR.id(), visitor);
});

test("clicks on known controls are sent as anonymous action names, never text or ids of members", async () => {
  const app = browser();
  await flush();
  const control = (matches, dataset = {}) => ({ closest: (selector) => (matches.includes(selector) ? { dataset } : null) });
  const click = app.events.get("click");
  click({ target: control(["#open-documents"]) });
  click({ target: control([".member-name"]) });
  click({ target: control(["[data-section-target]"], { sectionTarget: "members-units-panel" }) });
  click({ target: control([]) });
  app.intervals[0]();
  await flush();
  const payload = JSON.parse(app.calls.at(-1).options.body);
  assert.deepEqual(payload.actions, ["soci.genera-documenti", "soci.apri-scheda", "sezione.members-units"]);
  const off = browser(false);
  await flush();
  off.events.get("click")?.({ target: control(["#open-documents"]) });
  assert.ok(!off.calls.some((call) => String(call.options.body || "").includes("actions")));
});
