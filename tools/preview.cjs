#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const documents = require("../assets/js/documents-model.js");

const ROOT = path.resolve(__dirname, "..");
const IGNORED_DIRS = new Set([".git", ".github", "node_modules", ".venv-calendar", "__pycache__"]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function createLocalDatabase() {
  const data = {
    assemblea: { stato: { attiva: false } },
    live: { stato: { pos: 0, max: 0 } },
    modifiche: { k: null, patch: null, t: null },
    presenza: {},
  };
  const listeners = new Set();
  const parts = (pathname) =>
    pathname
      .replace(/\.json$/, "")
      .split("/")
      .filter(Boolean);
  const read = (segments) => segments.reduce((value, part) => (value == null ? undefined : value[part]), data);
  const write = (segments, value, merge = false) => {
    if (!segments.length) {
      if (merge && value && typeof value === "object") Object.assign(data, value);
      else return false;
      return true;
    }
    let node = data;
    for (const part of segments.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== "object") node[part] = {};
      node = node[part];
    }
    const key = segments.at(-1);
    if (value === null) delete node[key];
    else if (merge && value && typeof value === "object" && !Array.isArray(value)) {
      node[key] = { ...(node[key] || {}), ...value };
    } else node[key] = value;
    return true;
  };
  return {
    data,
    read(pathname) {
      const value = read(parts(pathname));
      return value === undefined ? null : value;
    },
    write(pathname, value, merge) {
      const updated = write(parts(pathname), value, merge);
      if (updated) listeners.forEach((listener) => listener(this.read("/live/stato.json")));
      return updated;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function transformConfig(source) {
  const transformed = source.replace(
    /url:\s*'https:\/\/[^']+firebaseio\.com\/'|url:\s*'https:\/\/[^']+firebasedatabase\.app\/'|url:\s*location\.origin\s*\+\s*(?:\([^;\n]*\)\s*\+\s*)?["']\/api\/state\/["']/,
    "url: location.origin + '/__preview/firebase/'",
  );
  if (transformed === source) throw new Error("URL Firebase non riconosciuto: anteprima bloccata per sicurezza.");
  return transformed.replace(/nas:\s*true/, "nas: false");
}

function transformHtml(source) {
  let html = source.replace(/<link\b(?=[^>]*\bhref=["']https?:\/\/)[^>]*>/gi, "");
  html = html.replace(
    /(<script\b[^>]*\bsrc=["'](?:\.\.\/)*assets\/js\/shared\/accesso\.js["'][^>]*><\/script>)/gi,
    '$1<script>window.ACCESSO={chiave:()=>\"preview-locale\",verificata:()=>true,entra:async()=>{},esci:()=>{}};</script>',
  );
  const networkGuard = `<script>
    (() => {
      const fetchLocale = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const address = typeof input === 'string' || input instanceof URL ? input : input.url;
        const url = new URL(address, location.href);
        if (url.origin !== location.origin) {
          return Promise.reject(new Error('Richieste esterne disattivate nell’anteprima locale.'));
        }
        return fetchLocale(input, options);
      };

      const EventSourceLocale = window.EventSource;
      window.EventSource = class extends EventSourceLocale {
        constructor(address, options) {
          const url = new URL(address, location.href);
          if (url.origin !== location.origin) throw new Error('EventSource esterni disattivati nell’anteprima locale.');
          super(url.href, options);
        }
      };
      window.DOCUMENTS_PREVIEW = true;
    })();
  </script>`;
  html = html.replace(/<\/head\s*>/i, `${networkGuard}</head>`);
  const reload = `<script>
    (() => {
      const events = new EventSource('/__preview/events');
      events.onmessage = event => { if (event.data === 'reload') location.reload() };
      const badge = document.createElement('div');
      badge.textContent = 'ANTEPRIMA LOCALE · ACCESSO APERTO · FIREBASE SIMULATO';
      badge.setAttribute('role', 'status');
      badge.style.cssText = 'position:sticky;top:0;z-index:2147483647;width:100%;padding:5px 12px;background:#fdc500;color:#211638;font:700 10px/1.4 system-ui,sans-serif;text-align:center;letter-spacing:.04em';
      document.addEventListener('DOMContentLoaded', () => document.body.prepend(badge), { once: true });
    })();
  </script>`;
  html = html.replace(/<\/body\s*>/i, `${reload}</body>`);
  return html;
}

function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const file = path.resolve(ROOT, "." + decoded);
  return file === ROOT || file.startsWith(ROOT + path.sep) ? file : null;
}

function readBody(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload troppo grande"));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null);
      } catch {
        reject(new Error("JSON non valido"));
      }
    });
    request.on("error", reject);
  });
}

function createPreviewServer({ watch = true } = {}) {
  const database = createLocalDatabase();
  let documentIndex = null;
  const documentFiles = new Map();
  const streams = new Set();
  const firebaseStreams = new Set();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__preview/documents" || url.pathname === "/documents/index.json") {
      try {
        if (!documentIndex)
          documentIndex = documents.validate(
            JSON.parse(await fs.promises.readFile(path.join(ROOT, "documents/index.json"), "utf8")),
          );
        if (url.pathname === "/__preview/documents" && request.method === "POST") {
          if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)
            throw new Error("Origine non consentita");
          const change = await readBody(request, 140 * 1024 * 1024);
          const next = documents.apply(documentIndex, change);
          if (change.operation === "delete") documentFiles.set(change.previous.file, null);
          else if (change.content) {
            const pdf = Buffer.from(change.content, "base64");
            if (pdf.length >= 100 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== "%PDF-")
              throw new Error("PDF non valido o troppo grande");
            documentFiles.set(change.document.file, pdf);
          } else if (!change.previous) throw new Error("File PDF mancante");
          documentIndex = next;
        } else if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" });
          response.end();
          return;
        }
        response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
        response.end(request.method === "HEAD" ? undefined : JSON.stringify(documentIndex));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(error.message);
      }
      return;
    }
    if (url.pathname.startsWith("/documents/pdf/") && (request.method === "GET" || request.method === "HEAD")) {
      let name;
      try {
        name = decodeURIComponent(url.pathname.slice("/documents/pdf/".length));
      } catch {
        response.writeHead(400);
        response.end("Percorso non valido");
        return;
      }
      if (documentFiles.has(name)) {
        const pdf = documentFiles.get(name);
        response.writeHead(pdf ? 200 : 404, { "Cache-Control": "no-store", "Content-Type": "application/pdf" });
        response.end(request.method === "HEAD" ? undefined : pdf);
        return;
      }
    }
    if (url.pathname === "/__preview/events") {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      });
      response.write("retry: 1000\n\n");
      streams.add(response);
      request.on("close", () => streams.delete(response));
      return;
    }

    if (url.pathname.startsWith("/__preview/firebase/")) {
      const databasePath = url.pathname.slice("/__preview/firebase".length);
      if (databasePath.endsWith("/live/stato.json") && request.headers.accept?.includes("text/event-stream")) {
        response.writeHead(200, {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
        });
        const sendState = (state) =>
          response.write(`event: put\ndata: ${JSON.stringify({ path: "/", data: state || {} })}\n\n`);
        sendState(database.read("/live/stato.json"));
        const unsubscribe = database.subscribe(sendState);
        firebaseStreams.add(response);
        request.on("close", () => {
          unsubscribe();
          firebaseStreams.delete(response);
        });
        return;
      }
      if (request.method === "GET") {
        response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(database.read(databasePath)));
        return;
      }
      if (request.method === "PUT" || request.method === "PATCH") {
        try {
          const value = await readBody(request);
          database.write(databasePath, value, request.method === "PATCH");
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(value));
        } catch (error) {
          response.writeHead(error.message === "Payload troppo grande" ? 413 : 400);
          response.end(error.message);
        }
        return;
      }
      response.writeHead(405, { Allow: "GET, PUT, PATCH" });
      response.end();
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    if (/\/index\.html$/.test(url.pathname)) {
      response.writeHead(308, { Location: url.pathname.replace(/index\.html$/, "") + url.search });
      response.end();
      return;
    }

    const file = resolveFile(url.pathname === "/" ? "/index.html" : url.pathname);
    if (!file) {
      response.writeHead(400);
      response.end("Percorso non valido");
      return;
    }
    let target = file;
    try {
      try {
        target = await fs.promises.realpath(target);
      } catch (error) {
        if (error.code !== "ENOENT" || path.extname(target)) throw error;
        target = await fs.promises.realpath(target + ".html");
      }
      if (!target.startsWith(ROOT + path.sep)) {
        response.writeHead(403);
        response.end("Percorso non consentito");
        return;
      }
      if ((await fs.promises.stat(target)).isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          response.writeHead(308, { Location: url.pathname + "/" + url.search });
          response.end();
          return;
        }
        target = await fs.promises.realpath(path.join(target, "index.html"));
      }
      if (!target.startsWith(ROOT + path.sep)) {
        response.writeHead(403);
        response.end("Percorso non consentito");
        return;
      }
      const content = await fs.promises.readFile(target);
      const extension = path.extname(target).toLowerCase();
      let output = content;
      if (extension === ".html") output = Buffer.from(transformHtml(content.toString("utf8")));
      else if (target === path.join(ROOT, "config", "site.js")) {
        output = Buffer.from(transformConfig(content.toString("utf8")));
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": output.length,
        "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : output);
    } catch (error) {
      const status = error.code === "ENOENT" ? 404 : error.code === "EACCES" ? 403 : 500;
      response.writeHead(status);
      response.end(status === 404 ? "Not found" : status === 403 ? "Percorso non consentito" : "Preview server error");
    }
  });

  let watchers = [];
  let reloadTimer;
  function watchTree() {
    watchers.forEach((watcher) => watcher.close());
    watchers = [];
    const directories = [];
    function collect(directory) {
      directories.push(directory);
      let entries;
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch (error) {
        console.warn(`Hot reload: impossibile leggere ${path.relative(ROOT, directory)}: ${error.message}`);
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) collect(path.join(directory, entry.name));
      }
    }
    collect(ROOT);
    for (const directory of directories) {
      try {
        watchers.push(
          fs.watch(directory, () => {
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
              streams.forEach((stream) => stream.write("data: reload\n\n"));
              watchTree();
            }, 120);
          }),
        );
      } catch (error) {
        console.warn(`Hot reload: impossibile osservare ${path.relative(ROOT, directory)}: ${error.message}`);
      }
    }
  }
  if (watch) watchTree();
  server.on("close", () => {
    clearTimeout(reloadTimer);
    watchers.forEach((watcher) => watcher.close());
    streams.forEach((stream) => stream.end());
    firebaseStreams.forEach((stream) => stream.end());
    streams.clear();
    firebaseStreams.clear();
  });
  server.database = database;
  server.stop = (callback) => {
    streams.forEach((stream) => stream.end());
    firebaseStreams.forEach((stream) => stream.end());
    server.close(callback);
  };
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("PORT deve essere un numero tra 0 e 65535.");
    process.exitCode = 1;
  } else {
    const server = createPreviewServer();
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      console.log(`Anteprima locale: http://127.0.0.1:${address.port}`);
      console.log("Firebase è simulato in memoria; login aperto solo in questa anteprima.");
      console.log("Firebase e gestione PDF sono simulati in memoria; nessuna scrittura sui servizi reali.");
    });
    const close = () => {
      server.stop(() => process.exit(0));
    };
    process.on("SIGINT", close);
    process.on("SIGTERM", close);
  }
}

module.exports = { createLocalDatabase, createPreviewServer, transformConfig, transformHtml };
