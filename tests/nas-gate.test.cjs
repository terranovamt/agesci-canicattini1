const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawn, execFileSync } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("deploy/synology/maintenance.html");
const config = read("deploy/synology/gate.nginx.conf");

function waitingPage(hour = 12, search = "") {
  const browser = {
    health: { ok: false },
    deployment: { previous: "a".repeat(40), next: "b".repeat(40) },
    deploymentOk: true,
    revisions: { textContent: "" },
    document: { body: { dataset: {} } },
    reloads: 0,
  };
  browser.document.getElementById = id => {
    assert.equal(id, "deployment-revisions");
    return browser.revisions;
  };
  vm.runInNewContext(html.match(/<script>([\s\S]+?)<\/script>/)[1], {
    document: browser.document, URLSearchParams, Date,
    Intl: { DateTimeFormat: function () { return { format: () => String(hour) }; } },
    location: { search, reload() { browser.reloads++; } },
    setInterval(callback, milliseconds) {
      assert.equal(milliseconds, 5000);
      browser.tick = callback;
    },
    async fetch(url, options) {
      assert.equal(options.cache, "no-store");
      if (url === "/agesci-canicattini1/deployment.json") {
        if (browser.deployment instanceof Error) throw browser.deployment;
        return { ok: browser.deploymentOk, json: async () => browser.deployment };
      }
      assert.equal(url, "/agesci-canicattini1/healthz");
      if (browser.health instanceof Error) throw browser.health;
      return browser.health;
    },
  });
  return browser;
}

test("NAS gate owns the public port independently of app and web", () => {
  const compose = read("deploy/synology/compose.yaml");
  const web = compose.split("\n  web:")[1].split("\n  gate:")[0];
  const gate = compose.split("\n  gate:")[1].split("\n  cloudflared:")[0];
  assert.doesNotMatch(web, /ports:/);
  assert.match(gate, /127\.0\.0\.1:8080:8080/);
  assert.doesNotMatch(gate, /depends_on:/);
  assert.match(gate, /\/gate-healthz/);
  assert.ok(gate.includes("${NAS_ROOT:-/volume1/docker/agesci-nas}/deployment:/usr/share/nginx/deployment:ro"));
  assert.doesNotMatch(gate, /\/data|nas\.env/);
  assert.match(config, /resolver 127\.0\.0\.11 valid=2s ipv6=off;/);
  assert.match(config, /proxy_pass \$web_upstream;/);
  assert.match(config, /proxy_buffering off;/);
  assert.match(config, /error_page 502 503 504 =503 /);
  assert.match(config, /Cache-Control "no-store" always;/);
  assert.match(config, /Retry-After "30" always;/);
  assert.match(read("deploy/synology/gate.Dockerfile"), /COPY deploy\/synology\/maintenance\.html /);
});

test("NAS waiting page is self-contained and reloads only when the backend recovers", async () => {
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)=/i);
  assert.match(html, /prefers-reduced-motion/);
  for (const [hour, search, theme] of [
    [8, "", "giorno"], [19, "", "giorno"], [20, "", "notte"], [5, "", "notte"],
    [12, "?tema=notte", "notte"], [0, "?tema=giorno", "giorno"],
  ]) {
    const browser = waitingPage(hour, search);
    assert.equal(browser.document.body.dataset.t, theme);
    await delay(0);
    assert.equal(browser.revisions.textContent, "aaaaaaa \u2192 bbbbbbb");
    for (const next of [{ ok: false }, new Error("backend restarting"), { ok: true }]) {
      browser.health = next;
      browser.tick();
      await delay(0);
      assert.equal(browser.reloads, next.ok ? 1 : 0);
    }
  }
});

test("NAS waiting page updates short commits for rollback and reports missing or invalid metadata", async () => {
  const browser = waitingPage();
  await delay(0);
  browser.deployment = { previous: "b".repeat(40), next: "a".repeat(40) };
  browser.tick();
  await delay(0);
  assert.equal(browser.revisions.textContent, "bbbbbbb \u2192 aaaaaaa");
  browser.deployment = { previous: "", next: "a".repeat(40) };
  browser.tick();
  await delay(0);
  assert.equal(browser.revisions.textContent, "\u2014 \u2192 aaaaaaa");
  for (const deployment of [
    new Error("network unavailable"), null, {},
    { previous: "short", next: "a".repeat(40) },
    { previous: "", next: "too-short" },
    { previous: "", next: ["a".repeat(40)] },
  ]) {
    browser.deployment = deployment;
    browser.tick();
    await delay(0);
    assert.equal(browser.revisions.textContent, "Versioni non disponibili");
  }
  browser.deployment = { previous: "a".repeat(40), next: "b".repeat(40) };
  browser.deploymentOk = false;
  browser.tick();
  await delay(0);
  assert.equal(browser.revisions.textContent, "Versioni non disponibili");
  browser.deploymentOk = true;
  browser.tick();
  await delay(0);
  assert.equal(browser.revisions.textContent, "aaaaaaa \u2192 bbbbbbb");
  browser.deploymentOk = false;
  browser.health = { ok: true };
  browser.tick();
  await delay(0);
  assert.equal(browser.reloads, 1, "Missing commit metadata must not prevent the page from recovering");
});

test("NAS gate serves real HTTP 503 during outages and resumes proxying after recovery", {
  skip: !process.env.NGINX_BINARY && "Set NGINX_BINARY to run the Nginx integration test",
  timeout: 30000,
}, async () => {
  const binary = process.env.NGINX_BINARY;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nas-gate-"));
  const prefix = directory.replace(/\\/g, "/") + "/";
  const upstream = http.createServer((request, response) => {
    const status = request.url.endsWith("/missing") ? 404 : request.url.endsWith("/private") ? 401 : 200;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: status === 200, url: request.url }));
  });
  let nginx;
  const listen = async (server, port = 0) => {
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    return server.address().port;
  };
  const close = async server => {
    if (!server.listening) return;
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  };
  try {
    const upstreamPort = await listen(upstream);
    await close(upstream);
    const reservation = http.createServer();
    const port = await listen(reservation);
    await close(reservation);
    fs.mkdirSync(path.join(directory, "logs"));
    fs.mkdirSync(path.join(directory, "temp"));
    fs.writeFileSync(path.join(directory, "index.html"), html);
    const statusPath = path.join(directory, "status.json");
    const deployment = { previous: "a".repeat(40), next: "b".repeat(40) };
    fs.writeFileSync(statusPath, JSON.stringify(deployment));
    const serverConfig = config.replace("listen 8080;", `listen 127.0.0.1:${port};`)
      .replace("http://web:8080", `http://127.0.0.1:${upstreamPort}`)
      .replace("/usr/share/nginx/waiting/index.html", JSON.stringify(prefix + "index.html"))
      .replace("/usr/share/nginx/deployment/status.json", JSON.stringify(prefix + "status.json"));
    fs.writeFileSync(path.join(directory, "nginx.conf"), `
worker_processes 1;
daemon off;
pid logs/nginx.pid;
error_log logs/error.log;
events { worker_connections 64; }
http {
    types { text/html html; }
    client_body_temp_path temp/client_body;
    proxy_temp_path temp/proxy;
    fastcgi_temp_path temp/fastcgi;
    uwsgi_temp_path temp/uwsgi;
    scgi_temp_path temp/scgi;
    ${serverConfig}
}
`);
    const args = ["-p", prefix, "-c", "nginx.conf"];
    execFileSync(binary, [...args, "-t"], { stdio: "pipe" });
    nginx = spawn(binary, args, { stdio: "ignore" });
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(nginx.exitCode, null, "Nginx exited before becoming ready");
      try {
        ready = (await fetch(origin + "/gate-healthz")).ok;
      } catch (error) {
        if (error.cause?.code !== "ECONNREFUSED") throw error;
      }
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, "Nginx did not become ready");
    assert.equal((await fetch(origin + "/_nas_waiting.html")).status, 404);
    const statusUrl = origin + "/agesci-canicattini1/deployment.json";
    const metadata = await fetch(statusUrl);
    assert.equal(metadata.status, 200);
    assert.match(metadata.headers.get("content-type"), /application\/json/);
    assert.equal(metadata.headers.get("cache-control"), "no-store");
    assert.deepEqual(await metadata.json(), deployment);
    const rollback = { previous: deployment.next, next: deployment.previous };
    fs.writeFileSync(statusPath + ".tmp", JSON.stringify(rollback));
    fs.renameSync(statusPath + ".tmp", statusPath);
    assert.deepEqual(await (await fetch(statusUrl)).json(), rollback);
    fs.unlinkSync(statusPath);
    assert.equal((await fetch(statusUrl)).status, 404);
    fs.writeFileSync(statusPath, JSON.stringify(deployment));
    const route = "/agesci-canicattini1/area-riservata/assemblea/?from=update";
    for (const method of ["GET", "HEAD", "POST"]) {
      const response = await fetch(origin + route, { method });
      assert.equal(response.status, 503, method);
      assert.equal(response.headers.get("retry-after"), "30");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-robots-tag"), "noindex");
      const body = await response.text();
      if (method === "HEAD") assert.equal(body, "");
      else assert.match(body, /Stiamo montando le tende!/);
    }
    assert.equal((await fetch(origin + "/agesci-canicattini1/healthz")).status, 503);
    await listen(upstream, upstreamPort);
    const recovered = await fetch(origin + route);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).url, route);
    assert.equal((await fetch(origin + "/agesci-canicattini1/healthz")).status, 200);
    for (const [route, status] of [["missing", 404], ["private", 401]]) {
      const response = await fetch(origin + "/agesci-canicattini1/" + route);
      assert.equal(response.status, status);
      assert.match(response.headers.get("content-type"), /application\/json/);
    }
    await close(upstream);
    assert.equal((await fetch(origin + route)).status, 503);
    assert.equal((await fetch(origin + "/gate-healthz")).status, 200);
  } finally {
    await close(upstream);
    if (nginx && nginx.exitCode === null) {
      const exited = once(nginx, "exit");
      execFileSync(binary, ["-p", prefix, "-c", "nginx.conf", "-s", "quit"], { stdio: "pipe" });
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
