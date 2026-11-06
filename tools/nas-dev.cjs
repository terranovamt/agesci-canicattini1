"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { once } = require("node:events");
const { createNasServer } = require("../server/nas.cjs");

const root = path.resolve(__dirname, "..");
const password = "Nas-local-test-password1-only";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

async function startNasDev({ basePath = "" } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agesci-nas-dev-"));
  let backend;
  const gateway = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (!backend) {
        response.writeHead(503);
        response.end();
        return;
      }
      if (basePath && url.pathname === basePath) {
        response.writeHead(308, { Location: basePath + "/" + url.search });
        response.end();
        return;
      }
      if (basePath) {
        if (!url.pathname.startsWith(basePath + "/")) {
          response.writeHead(404);
          response.end();
          return;
        }
        url.pathname = url.pathname.slice(basePath.length);
      }
      if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/documents/") ||
        ["/healthz", "/config/site.js", "/calendars/events.json", "/area-riservata/assemblea/dati.js"].includes(
          url.pathname,
        )
      ) {
        const upstream = http.request(
          {
            hostname: "127.0.0.1",
            port: backend.address().port,
            path: request.url,
            method: request.method,
            headers: request.headers,
          },
          (reply) => {
            response.writeHead(reply.statusCode, reply.headers);
            reply.pipe(response);
          },
        );
        upstream.on("error", () => {
          if (!response.headersSent) response.writeHead(502);
          response.end();
        });
        response.on("close", () => upstream.destroy());
        request.pipe(upstream);
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405);
        response.end();
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      const allowed =
        pathname === "/" ||
        ["/index.html", "/manifest.webmanifest"].includes(pathname) ||
        /^\/(?:assets|area-riservata|assemblea|documenti|peg|calendars)\//.test(pathname);
      let file = path.resolve(root, "." + pathname);
      if (!allowed || (!file.startsWith(root + path.sep) && file !== root)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const top = path.relative(root, file).split(path.sep)[0];
      if (
        file !== root &&
        ![
          "index.html",
          "manifest.webmanifest",
          "assets",
          "area-riservata",
          "assemblea",
          "documenti",
          "peg",
          "calendars",
        ].includes(top)
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      const stats = await fs.promises.stat(file);
      if (stats.isDirectory()) {
        if (!pathname.endsWith("/")) {
          response.writeHead(308, { Location: basePath + pathname + "/" + url.search });
          response.end();
          return;
        }
        file = path.join(file, "index.html");
      }
      const content = await fs.promises.readFile(file);
      response.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  try {
    backend = await createNasServer({
      dataDir,
      siteRoot: root,
      password,
      publicOrigin: origin,
      basePath,
      secureCookie: false,
      release: "sviluppo-locale",
    });
    backend.listen(0, "127.0.0.1");
    await once(backend, "listening");
  } catch (error) {
    gateway.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw error;
  }
  return {
    origin,
    password,
    async stop() {
      backend.stop();
      gateway.close();
      gateway.closeAllConnections();
      await once(backend, "close");
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

module.exports = { startNasDev };
if (require.main === module)
  startNasDev({ basePath: "/agesci-canicattini1" })
    .then((app) => {
      console.log("Anteprima NAS locale: " + app.origin + "/agesci-canicattini1/");
      console.log("Password di test (solo locale): " + app.password);
      console.log("Database temporaneo; nessun servizio reale modificato.");
      const stop = () => app.stop().then(() => process.exit(0));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
