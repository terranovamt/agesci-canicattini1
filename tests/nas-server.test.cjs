const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");
const { createNasServer } = require("../server/nas.cjs");
const { startNasDev } = require("../tools/nas-dev.cjs");

const password = "Nas-test-password1-not-for-production";
const publicOrigin = "http://localhost";

async function start(dataDir, options = {}) {
  const server = await createNasServer({ dataDir, password, publicOrigin, secureCookie: false, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = async (route, method = "GET", value, authenticated = true, originHeader = publicOrigin) => {
    const response = await fetch(origin + route, {
      method,
      headers: {
        Origin: originHeader,
        ...(authenticated ? { Cookie: cookie } : {}),
        "Content-Type": "application/json",
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
    if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  };
  return {
    request,
    origin,
    async login() {
      const response = await request("/api/state/modifiche/k.json", "PUT", options.password ?? password);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    },
    async close() {
      server.stop();
      await once(server, "close");
    },
  };
}

test("NAS password requires at least eight characters with uppercase, lowercase and a digit", async () => {
  for (const invalid of [undefined, null, "Abc1234", "abcdefgh1", "ABCDEFGH1", "Abcdefgh", "12345678"]) {
    await assert.rejects(
      createNasServer({ password: invalid, publicOrigin, secureCookie: false }),
      /almeno 8 caratteri/,
    );
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-password-"));
  const app = await start(directory, { password: "Abcdefg1" });
  try {
    await app.login();
    assert.equal((await (await app.request("/api/session")).json()).authenticated, true);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS subpath scopes APIs and session cookies without exposing root routes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-subpath-"));
  const basePath = "/agesci-canicattini1";
  const app = await start(directory, { basePath });
  try {
    assert.equal((await app.request("/healthz")).status, 200);
    assert.equal((await app.request("/api/session")).status, 404);
    assert.equal((await app.request(basePath + "-other/api/session")).status, 404);
    assert.equal((await app.request(basePath + "/api/metrics")).status, 401);
    const login = await app.request(basePath + "/api/state/modifiche/k.json", "PUT", password);
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /Path=\/agesci-canicattini1\/;/);
    assert.equal((await (await app.request(basePath + "/api/session")).json()).authenticated, true);
    assert.equal((await app.request(basePath + "/documents/index.json")).status, 200);
    assert.equal((await app.request(basePath + "/api/metrics?view=live")).status, 200);
    const logout = await app.request(basePath + "/api/logout", "POST");
    assert.match(logout.headers.get("set-cookie"), /Path=\/agesci-canicattini1\/;/);
    assert.equal((await (await app.request(basePath + "/api/session")).json()).authenticated, false);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS gateway serves pages, config, QR and PDFs only under the site prefix", async () => {
  const app = await startNasDev({ basePath: "/agesci-canicattini1" });
  try {
    const root = app.origin + "/agesci-canicattini1";
    assert.equal((await fetch(app.origin + "/index.html")).status, 404);
    assert.equal((await fetch(app.origin + "/api/session")).status, 404);
    const redirect = await fetch(root, { redirect: "manual" });
    assert.equal(redirect.headers.get("location"), "/agesci-canicattini1/");
    const legacy = await fetch(root + "/index.html?from=old-link", { redirect: "manual" });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), "/agesci-canicattini1/?from=old-link");
    const legacyArea = await fetch(root + "/area-riservata/index.html", { redirect: "manual" });
    assert.equal(legacyArea.status, 308);
    assert.equal(legacyArea.headers.get("location"), "/agesci-canicattini1/area-riservata/");
    for (const resource of [
      "/",
      "/config/site.js",
      "/assets/img/qr-live.png",
      "/area-riservata/statistiche.html",
      "/documents/index.json",
      "/healthz",
    ])
      assert.equal((await fetch(root + resource)).status, 200, resource);
    const manifest = await (await fetch(root + "/documents/index.json")).json();
    const entries = Array.isArray(manifest) ? manifest : manifest.documents;
    if (entries?.length)
      assert.equal((await fetch(root + "/documents/pdf/" + encodeURIComponent(entries[0].file))).status, 200);
  } finally {
    await app.stop();
  }
});

test("NAS requires session and same-origin writes, hides secrets and preserves state across restarts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-state-"));
  let app;
  try {
    app = await start(directory);
    for (const resource of ["/config/site.js", "/area-riservata/assemblea/dati.js", "/calendars/events.json"]) {
      const response = await app.request(resource, "HEAD");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const update = { stato: { pos: 1001, max: 1001 }, k: password };
    assert.equal((await app.request("/api/state/live.json", "PUT", update)).status, 401);
    assert.equal((await app.request("/api/state/modifiche/k.json", "PUT", "wrong-password")).status, 401);
    await app.login();
    assert.equal((await app.request("/api/state/live.json", "PUT", update, true, "https://evil.test")).status, 403);
    assert.equal((await app.request("/api/state/live.json", "PUT", update)).status, 200);
    assert.deepEqual(await (await app.request("/api/state/live/stato.json")).json(), update.stato);
    assert.equal((await app.request("/api/state/live.json")).status, 404);
    assert.equal((await app.request("/api/state/modifiche/k.json")).status, 404);
    assert.equal((await app.request("/api/state/.json", "PATCH", { unexpected: {} })).status, 400);
    await app.close();
    app = await start(directory);
    assert.deepEqual(await (await app.request("/api/state/live/stato.json")).json(), update.stato);
    assert.equal((await app.request("/api/state/live.json", "PUT", update)).status, 401);
  } finally {
    if (app) await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS atomically persists document metadata, PDFs and optimistic content revisions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-documents-"));
  let app;
  try {
    app = await start(directory);
    await app.login();
    const document = { file: "nas-test.pdf", title: "PDF NAS", description: "Persistente" };
    const change = { operation: "save", document, content: Buffer.from("%PDF-1.7\nNAS").toString("base64") };
    assert.equal((await app.request("/api/documents", "POST", change, false)).status, 401);
    assert.equal((await app.request("/api/documents", "POST", change)).status, 200);
    assert.equal((await app.request("/api/documents", "POST", change)).status, 409);
    const before = await (await app.request("/api/content/dati.js")).json();
    const source = 'window.DATI = {"slide":[]};\n';
    const content = Buffer.from(source).toString("base64");
    assert.equal((await app.request("/api/content/dati.js", "PUT", { content, sha: before.sha })).status, 200);
    assert.equal((await app.request("/api/content/dati.js", "PUT", { content, sha: before.sha })).status, 409);
    await app.close();
    app = await start(directory);
    assert.equal(await (await app.request("/documents/pdf/nas-test.pdf")).text(), "%PDF-1.7\nNAS");
    assert.equal(await (await app.request("/area-riservata/assemblea/dati.js")).text(), source);
    assert.ok((await (await app.request("/documents/index.json")).json()).some((item) => item.file === document.file));
    await app.login();
    assert.equal(
      (await app.request("/api/documents", "POST", { operation: "delete", previous: document })).status,
      200,
    );
    assert.equal((await app.request("/documents/pdf/nas-test.pdf")).status, 404);
  } finally {
    if (app) await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS streams live state in the event format expected by the presentation", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-stream-"));
  let app = await start(directory);
  const abort = new AbortController(),
    sameVisitorAbort = new AbortController(),
    anotherVisitorAbort = new AbortController();
  try {
    const visitor = "12345678-1234-1234-1234-123456789abc";
    const response = await fetch(app.origin + "/api/state/live/stato.json?visitor=" + visitor, {
      headers: { Accept: "text/event-stream" },
      signal: abort.signal,
    });
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: put\ndata: .*"pos":0/);
    await fetch(app.origin + "/api/state/live/stato.json?visitor=" + visitor, {
      headers: { Accept: "text/event-stream" },
      signal: sameVisitorAbort.signal,
    });
    await fetch(app.origin + "/api/state/live/stato.json?visitor=aaaaaaaa-1234-1234-1234-123456789abc", {
      headers: { Accept: "text/event-stream" },
      signal: anotherVisitorAbort.signal,
    });
    await app.login();
    await app.request("/api/state/live.json", "PUT", { stato: { pos: 2000, max: 2000 } });
    const complete = await (await app.request("/api/metrics")).json();
    assert.equal(complete.traffic.liveStreams, 3);
    assert.equal(complete.traffic.today.connections, 3);
    assert.equal(complete.traffic.today.liveUnique, 2);
    assert.equal(complete.traffic.daily[0].liveUnique, 2);
    assert.equal(complete.performance.hourly.length, 60);
    assert.ok(complete.performance.hourly.at(-1).sampledAt);
    const live = await (await app.request("/api/metrics?view=live")).json();
    assert.equal(live.traffic.liveStreams, 3);
    for (const field of ["today", "daily", "pages", "totals", "sessions"]) assert.equal(live.traffic[field], undefined);
    assert.equal(live.events, undefined);
    assert.equal(live.api, undefined);
    const summary = await (await app.request("/api/metrics?view=summary")).json();
    assert.equal(summary.traffic.today.connections, 3);
    assert.equal(summary.traffic.daily, undefined);
    assert.equal((await app.request("/api/metrics?view=unknown")).status, 400);
    assert.match(new TextDecoder().decode((await reader.read()).value), /"pos":2000/);
    abort.abort();
    await app.close();
    app = await start(directory);
    await app.login();
    const restored = await (await app.request("/api/metrics")).json();
    assert.equal(restored.traffic.liveStreams, 0);
    assert.equal(restored.traffic.today.connections, 3);
    assert.equal(restored.traffic.totals.connections, 3);
    assert.equal(restored.traffic.today.liveUnique, 2);
  } finally {
    abort.abort();
    sameVisitorAbort.abort();
    anotherVisitorAbort.abort();
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS metrics are private, count visits separately from views, redact reports and persist totals", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-monitor-"));
  let app;
  try {
    app = await start(directory);
    assert.equal((await app.request("/api/metrics")).status, 401);
    const visit = { id: "12345678-1234-1234-1234-123456789abc", type: "view", page: "home", visible: true, events: [] };
    assert.equal((await app.request("/api/telemetry", "POST", visit, false)).status, 200);
    assert.equal((await app.request("/api/telemetry", "POST", { ...visit, page: "documenti" }, false)).status, 200);
    assert.equal(
      (await app.request("/api/telemetry", "POST", { ...visit, page: "/setup?token=secret" }, false)).status,
      400,
    );
    assert.equal((await app.request("/api/telemetry", "POST", { ...visit, events: [null] }, false)).status, 400);
    await app.request(
      "/api/telemetry",
      "POST",
      {
        ...visit,
        type: "heartbeat",
        events: [{ kind: "network-error", page: "home", message: "secret-must-not-be-stored" }],
      },
      false,
    );
    await app.login();
    const metrics = await (await app.request("/api/metrics")).json();
    assert.equal(metrics.traffic.today.visits, 1);
    assert.equal(metrics.traffic.today.views, 2);
    assert.equal(metrics.traffic.daily.length, 365);
    assert.equal(
      metrics.traffic.daily[0].day,
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date()),
    );
    assert.equal(metrics.traffic.daily[0].visits, 1);
    assert.equal(metrics.traffic.daily.at(-1).visits, null);
    assert.equal(metrics.service.release, "manual");
    assert.equal(metrics.traffic.online, 1);
    assert.equal(metrics.traffic.today.errors, 1);
    assert.equal(metrics.resources.host, null);
    assert.ok(metrics.resources.process.rssBytes > 0);
    assert.ok(!JSON.stringify(metrics).includes("secret-must-not-be-stored"));
    await app.request("/api/telemetry", "POST", { ...visit, type: "leave" }, false);
    assert.equal((await (await app.request("/api/metrics")).json()).traffic.online, 0);
    await app.close();
    app = await start(directory);
    await app.login();
    assert.equal((await (await app.request("/api/metrics")).json()).traffic.totals.views, 2);
  } finally {
    if (app) await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS can disable browser telemetry without disabling private resource monitoring", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-private-monitor-"));
  const app = await start(directory, { telemetryEnabled: false });
  try {
    assert.equal((await (await app.request("/api/telemetry/config")).json()).enabled, false);
    await app.request(
      "/api/telemetry",
      "POST",
      { id: "12345678-1234-1234-1234-123456789abc", page: "home", type: "view", visible: true, events: [] },
      false,
    );
    await app.login();
    const metrics = await (await app.request("/api/metrics")).json();
    assert.equal(metrics.enabled, false);
    assert.equal(metrics.traffic.totals.views, 0);
    assert.ok(metrics.resources.process.rssBytes > 0);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS counts active tabs separately and deduplicates retried page views", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-tabs-"));
  const app = await start(directory);
  try {
    const first = {
      id: "12345678-1234-1234-1234-123456789abc",
      tab: "aaaaaaaa-1234-1234-1234-123456789abc",
      type: "view",
      page: "home",
      visible: true,
      events: [],
    };
    const second = { ...first, tab: "bbbbbbbb-1234-1234-1234-123456789abc" };
    for (const payload of [first, first, second]) await app.request("/api/telemetry", "POST", payload, false);
    await app.request("/api/telemetry", "POST", { ...second, type: "heartbeat", visible: false }, false);
    await app.login();
    const metrics = await (await app.request("/api/metrics")).json();
    assert.equal(metrics.traffic.online, 2);
    assert.equal(metrics.traffic.people, 1);
    assert.equal(metrics.traffic.today.people, 1);
    assert.equal(metrics.traffic.visible, 1);
    assert.equal(metrics.traffic.today.visits, 1);
    assert.equal(metrics.traffic.today.views, 2);
    await app.request("/api/telemetry", "POST", { ...first, type: "leave" }, false);
    assert.equal((await (await app.request("/api/metrics")).json()).traffic.online, 1);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS accepts telemetry from multiple viewers behind the same public IP", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-shared-network-"));
  const app = await start(directory);
  try {
    for (let index = 1; index <= 40; index++) {
      const id = index.toString(16).padStart(8, "0") + "-1234-1234-1234-123456789abc";
      assert.equal(
        (
          await app.request(
            "/api/telemetry",
            "POST",
            { id, tab: id, page: "assemblea", type: "view", visible: true, events: [] },
            false,
          )
        ).status,
        200,
      );
    }
    await app.login();
    assert.equal((await (await app.request("/api/metrics")).json()).traffic.online, 40);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
