const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/nas-telemetry.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function browser(enabled = true, preview = false, storage = new Map()) {
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
    URL,
    location: { pathname: "/", origin: "https://site.test", href: "https://site.test/" },
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
  assert.equal(JSON.parse(app.calls.at(-1).options.body).type, "leave");
});

test("disabled telemetry and preview do not create visitor IDs or periodic beacons", async () => {
  for (const app of [browser(false), browser(true, true)]) {
    await flush();
    assert.equal(app.storage.size, 0);
    assert.equal(app.intervals.length, 0);
    assert.ok(app.calls.every((call) => call.url === "/api/telemetry/config"));
  }
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
