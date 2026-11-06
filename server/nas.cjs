"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");
const { createMonitor } = require("./monitor.cjs");
const documents = require("../assets/js/documents-model.js");

const scrypt = promisify(crypto.scrypt);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const SESSION_SECONDS = 8 * 60 * 60;
const PDF_LIMIT = 20 * 1024 * 1024;
const PUBLIC_STATE = new Set(["/assemblea/stato", "/live/stato", "/modifiche/patch", "/modifiche/t", "/presenza"]);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function body(request, limit = 1024 * 1024) {
  if (Number(request.headers["content-length"]) > limit) fail(413, "Richiesta troppo grande");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) fail(413, "Richiesta troppo grande");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "JSON non valido");
  }
}

async function createNasServer({
  dataDir,
  siteRoot = path.resolve(__dirname, ".."),
  password,
  publicOrigin,
  secureCookie = true,
  telemetryEnabled = true,
  hostProc = "",
  release = "manual",
} = {}) {
  if (!password || password.length < 16) throw new Error("La password NAS deve contenere almeno 16 caratteri");
  if (!publicOrigin || new URL(publicOrigin).origin !== publicOrigin)
    throw new Error("NAS_PUBLIC_ORIGIN deve essere una origine senza percorso");
  if (secureCookie && !publicOrigin.startsWith("https://")) throw new Error("In produzione serve una origine HTTPS");
  fs.mkdirSync(dataDir, { recursive: true });
  const database = new DatabaseSync(path.join(dataDir, "site.sqlite"));
  database.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS content (name TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS pdf (name TEXT PRIMARY KEY, value BLOB NOT NULL); CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);",
  );
  const read = (name) => database.prepare("SELECT value FROM content WHERE name = ?").get(name)?.value;
  const write = (name, value) =>
    database
      .prepare("INSERT INTO content(name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value=excluded.value")
      .run(name, value);
  const transaction = (run) => {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
  transaction(() => {
    if (!read("state"))
      write(
        "state",
        JSON.stringify({
          assemblea: { stato: { attiva: false } },
          live: { stato: { pos: 0, max: 0 } },
          modifiche: { patch: null, t: null },
        }),
      );
    if (!read("dati.js"))
      write("dati.js", fs.readFileSync(path.join(siteRoot, "area-riservata/assemblea/dati.js"), "utf8"));
    if (!read("documents")) {
      const items = documents.validate(
        JSON.parse(fs.readFileSync(path.join(siteRoot, "documents/index.json"), "utf8")),
      );
      for (const item of items) {
        database
          .prepare("INSERT INTO pdf(name, value) VALUES (?, ?)")
          .run(item.file, fs.readFileSync(path.join(siteRoot, "documents/pdf", item.file)));
      }
      write("documents", JSON.stringify(items));
    }
  });
  database.exec("DELETE FROM sessions");
  const salt = crypto.randomBytes(32);
  const passwordHash = await scrypt(password, salt, 64);
  const sessions = database.prepare("SELECT expires FROM sessions WHERE id = ?");
  const streams = new Map();
  const presence = new Map();
  const attempts = new Map();
  const monitor = createMonitor(database, { dataDir, telemetryEnabled, hostProc, release });
  const rateLimit = (key, limit, period) => {
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.until < now) attempts.set(key, { count: 1, until: now + period });
    else if (++current.count > limit) fail(429, "Troppe richieste: riprova piu tardi");
  };
  const sessionId = (request) => {
    const token = /(?:^|;\s*)nas-session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || "")?.[1];
    return token ? hash(token) : "";
  };
  const authorized = (request) => (sessions.get(sessionId(request))?.expires || 0) > Date.now();
  const cookie = (token, seconds) =>
    `nas-session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secureCookie ? "; Secure" : ""}`;
  const state = () => JSON.parse(read("state"));
  const stateValue = (route) => {
    if (route === "/presenza") return Object.fromEntries(presence);
    return (
      route
        .split("/")
        .filter(Boolean)
        .reduce((value, key) => value?.[key], state()) ?? null
    );
  };
  const broadcast = () => {
    for (const [response, route] of streams)
      response.write(`event: put\ndata: ${JSON.stringify({ path: "/", data: stateValue(route) })}\n\n`);
  };
  const send = (response, status, value, type = "application/json; charset=utf-8", headers = {}) => {
    response.writeHead(status, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    response.end(type.startsWith("application/json") ? JSON.stringify(value) : value);
  };
  const updateState = (route, value) => {
    if (!object(value)) fail(400, "Stato non valido");
    const next = state();
    const updates = route === "/" ? value : { [route.slice(1)]: value };
    if (Object.keys(updates).some((key) => !["assemblea", "live", "modifiche"].includes(key)))
      fail(400, "Nodo non consentito");
    for (const [key, update] of Object.entries(updates)) {
      if (!object(update)) fail(400, "Nodo non valido");
      if (key === "assemblea") {
        if (!object(update.stato) || typeof update.stato.attiva !== "boolean") fail(400, "Stato assemblea non valido");
        next.assemblea = { stato: { attiva: update.stato.attiva } };
      } else if (key === "live") {
        const { pos, max } = update.stato || {};
        if (
          ![pos, max].every((number) => Number.isSafeInteger(number) && number >= 0 && number <= 100000000) ||
          max < pos
        )
          fail(400, "Posizione live non valida");
        next.live = { stato: { pos, max } };
      } else {
        if (update.patch !== null && (typeof update.patch !== "string" || update.patch.length >= 1000000))
          fail(400, "Modifiche non valide");
        if (update.patch !== null) {
          try {
            if (!object(JSON.parse(update.patch))) fail(400, "Patch non valida");
          } catch {
            fail(400, "Patch non valida");
          }
        }
        next.modifiche = { patch: update.patch, t: Date.now() };
      }
    }
    write("state", JSON.stringify(next));
    broadcast();
  };
  const server = http.createServer(async (request, response) => {
    const requestStart = process.hrtime.bigint();
    let requestPath = "";
    response.once("finish", () => {
      try {
        monitor.request(
          requestPath,
          response.statusCode,
          Number(process.hrtime.bigint() - requestStart) / 1e6,
          String(response.getHeader("Content-Type") || "").startsWith("text/event-stream"),
        );
      } catch {}
    });
    try {
      const url = new URL(request.url, publicOrigin);
      requestPath = url.pathname;
      const method = request.method;
      const forwardedIp = request.headers["x-real-ip"] || "";
      const ip = /^[a-f0-9:.]{3,45}$/i.test(forwardedIp) ? forwardedIp : request.socket.remoteAddress;
      if (!["GET", "HEAD"].includes(method)) {
        if (request.headers.origin !== publicOrigin) fail(403, "Origine non consentita");
        rateLimit("write:" + ip, 3000, 60000);
      }
      if (url.pathname === "/healthz") return send(response, 200, { ok: true });
      if (url.pathname === "/api/telemetry/config" && method === "GET")
        return send(response, 200, { enabled: monitor.enabled });
      if (url.pathname === "/api/telemetry" && method === "POST") {
        rateLimit("telemetry:" + ip, 1200, 60000);
        monitor.telemetry(await body(request, 8192));
        return send(response, 200, { ok: true });
      }
      if (url.pathname === "/api/metrics" && method === "GET") {
        if (!authorized(request)) fail(401, "Sessione scaduta: accedi di nuovo");
        const devices = [...presence.values()].filter((value) => value.t > Date.now() - 60000).length;
        return send(response, 200, monitor.snapshot(streams.size, devices));
      }
      if (url.pathname === "/config/site.js" && ["GET", "HEAD"].includes(method)) {
        return send(
          response,
          200,
          fs.readFileSync(path.join(siteRoot, "config/site.js"), "utf8"),
          "application/javascript; charset=utf-8",
        );
      }
      if (url.pathname === "/api/session" && method === "GET")
        return send(response, 200, { authenticated: authorized(request) });
      if (url.pathname === "/calendars/events.json" && ["GET", "HEAD"].includes(method)) {
        const snapshot = path.join(dataDir, "calendars/events.json");
        return send(
          response,
          200,
          JSON.parse(
            fs.readFileSync(fs.existsSync(snapshot) ? snapshot : path.join(siteRoot, "calendars/events.json"), "utf8"),
          ),
        );
      }
      if (url.pathname === "/api/logout" && method === "POST") {
        database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId(request));
        return send(response, 200, { ok: true }, undefined, { "Set-Cookie": cookie("", 0) });
      }
      if (url.pathname === "/api/state/modifiche/k.json" && method === "PUT") {
        rateLimit("login:" + ip, 5, 60000);
        const supplied = await body(request, 4096);
        if (typeof supplied !== "string" || supplied.length > 1024) fail(400, "Password non valida");
        const suppliedHash = await scrypt(supplied, salt, 64);
        if (!crypto.timingSafeEqual(suppliedHash, passwordHash)) fail(401, "Password non valida");
        const token = crypto.randomBytes(32).toString("hex");
        database
          .prepare("INSERT INTO sessions(id, expires) VALUES (?, ?)")
          .run(hash(token), Date.now() + SESSION_SECONDS * 1000);
        return send(response, 200, { ok: true }, undefined, { "Set-Cookie": cookie(token, SESSION_SECONDS) });
      }
      if (url.pathname.startsWith("/api/state/")) {
        const route =
          url.pathname
            .slice("/api/state".length)
            .replace(/\.json$/, "")
            .replace(/\/$/, "") || "/";
        if (method === "GET" && PUBLIC_STATE.has(route)) {
          if (
            request.headers.accept?.includes("text/event-stream") &&
            ["/live/stato", "/modifiche/patch"].includes(route)
          ) {
            if (streams.size >= 500) fail(503, "Limite connessioni live raggiunto");
            response.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-store, no-transform",
              "X-Accel-Buffering": "no",
            });
            response.write(
              `retry: 3000\nevent: put\ndata: ${JSON.stringify({ path: "/", data: stateValue(route) })}\n\n`,
            );
            streams.set(response, route);
            response.on("close", () => streams.delete(response));
            return;
          }
          return send(response, 200, stateValue(route));
        }
        const match = /^\/presenza\/([a-zA-Z0-9_-]{1,24})$/.exec(route);
        if (route === "/presenza" && method === "PATCH") {
          if (!authorized(request)) fail(401, "Sessione scaduta");
          const cleanup = await body(request);
          if (
            !object(cleanup) ||
            Object.entries(cleanup).some(([id, value]) => !/^[a-zA-Z0-9_-]{1,24}$/.test(id) || value !== null)
          )
            fail(400, "Pulizia presenze non valida");
          for (const id of Object.keys(cleanup)) presence.delete(id);
          return send(response, 200, { ok: true });
        }
        if (match && ["PUT", "DELETE"].includes(method)) {
          rateLimit("presence:" + ip, 1200, 60000);
          if (method === "DELETE") presence.delete(match[1]);
          else {
            const value = await body(request, 4096);
            if (!object(value) || typeof value.r !== "string" || value.r.length >= 12) fail(400, "Presenza non valida");
            if (!presence.has(match[1]) && presence.size >= 2000) fail(503, "Limite presenze raggiunto");
            presence.set(match[1], { t: Date.now(), r: value.r });
          }
          return send(response, 200, { ok: true });
        }
        if (["PUT", "PATCH"].includes(method) && ["/", "/assemblea", "/live", "/modifiche"].includes(route)) {
          if (!authorized(request)) fail(401, "Sessione scaduta: accedi di nuovo");
          updateState(route, await body(request));
          return send(response, 200, { ok: true });
        }
        fail(404, "Nodo non disponibile");
      }
      if (url.pathname === "/documents/index.json" && ["GET", "HEAD"].includes(method))
        return send(response, 200, JSON.parse(read("documents")));
      if (url.pathname.startsWith("/documents/pdf/") && ["GET", "HEAD"].includes(method)) {
        const name = decodeURIComponent(url.pathname.slice("/documents/pdf/".length));
        if (!documents.safeName(name)) fail(400, "Nome PDF non valido");
        const pdf = database.prepare("SELECT value FROM pdf WHERE name = ?").get(name)?.value;
        if (!pdf) fail(404, "PDF non trovato");
        return send(response, 200, method === "HEAD" ? "" : Buffer.from(pdf), "application/pdf");
      }
      if (url.pathname === "/area-riservata/assemblea/dati.js" && ["GET", "HEAD"].includes(method))
        return send(response, 200, read("dati.js"), "application/javascript; charset=utf-8");
      if (url.pathname === "/api/documents" && method === "POST") {
        if (!authorized(request)) fail(401, "Sessione scaduta: accedi di nuovo");
        const change = await body(request, 28 * 1024 * 1024);
        const next = transaction(() => {
          let items;
          try {
            items = documents.apply(JSON.parse(read("documents")), change);
          } catch (error) {
            fail(409, error.message.replace(/su GitHub/g, "sul NAS"));
          }
          if (change.operation === "delete")
            database.prepare("DELETE FROM pdf WHERE name = ?").run(change.previous.file);
          else if (change.content) {
            if (typeof change.content !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(change.content))
              fail(400, "PDF non valido");
            const pdf = Buffer.from(change.content, "base64");
            if (pdf.length >= PDF_LIMIT || pdf.subarray(0, 5).toString() !== "%PDF-")
              fail(400, "PDF non valido o oltre 20 MiB");
            database
              .prepare(
                "INSERT INTO pdf(name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
              )
              .run(change.document.file, pdf);
          } else if (!change.previous) fail(400, "PDF mancante");
          write("documents", JSON.stringify(items));
          return items;
        });
        return send(response, 200, next);
      }
      if (url.pathname === "/api/content/dati.js") {
        if (!authorized(request)) fail(401, "Sessione scaduta: accedi di nuovo");
        if (method === "GET") {
          const source = read("dati.js");
          return send(response, 200, { content: Buffer.from(source).toString("base64"), sha: hash(source) });
        }
        if (method === "PUT") {
          const change = await body(request, 2 * 1024 * 1024);
          if (typeof change?.content !== "string") fail(400, "Contenuto mancante");
          const source = Buffer.from(change.content, "base64").toString("utf8");
          if (Buffer.byteLength(source) > 1000000 || !source.includes("window.DATI"))
            fail(400, "Contenuto assemblea non valido");
          if (change.sha !== hash(read("dati.js"))) fail(409, "Contenuti cambiati: ricarica prima di salvare");
          write("dati.js", source);
          return send(response, 200, { sha: hash(source) });
        }
      }
      fail(404, "Risorsa non disponibile");
    } catch (error) {
      if (!response.headersSent)
        send(
          response,
          error.status || 500,
          error.status ? error.message : "Errore interno NAS",
          "text/plain; charset=utf-8",
        );
      else response.destroy();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, value] of presence) if (value.t < now - 90000) presence.delete(id);
    for (const [id, value] of attempts) if (value.until < now) attempts.delete(id);
    database.prepare("DELETE FROM sessions WHERE expires < ?").run(now);
    for (const response of streams.keys()) response.write(": heartbeat\n\n");
  }, 15000);
  cleanup.unref();
  server.on("close", () => {
    clearInterval(cleanup);
    monitor.stop();
    database.close();
  });
  server.stop = () => {
    for (const response of streams.keys()) response.end();
    server.close();
    server.closeIdleConnections();
  };
  return server;
}

module.exports = { createNasServer };

if (require.main === module) {
  const passwordFile = process.env.NAS_ADMIN_PASSWORD_FILE || "/run/secrets/admin_password";
  createNasServer({
    dataDir: process.env.NAS_DATA_DIR || "/data",
    password: fs.readFileSync(passwordFile, "utf8").replace(/[\r\n]+$/, ""),
    publicOrigin: process.env.NAS_PUBLIC_ORIGIN,
    telemetryEnabled: process.env.NAS_TELEMETRY_ENABLED !== "false",
    hostProc: process.env.NAS_HOST_PROC || "",
    release: process.env.NAS_RELEASE_REVISION || "manual",
  })
    .then((server) => {
      server.listen(Number(process.env.PORT || 3000), "0.0.0.0");
      process.on("SIGTERM", () => server.stop());
      process.on("SIGINT", () => server.stop());
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
