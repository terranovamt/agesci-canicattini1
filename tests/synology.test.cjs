const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const prefix = "/agesci-canicattini1";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

test("NAS redirects retired pages without requiring HTML files", () => {
  const nginx = read("deploy/synology/nginx.conf");
  assert.match(nginx, /absolute_redirect off;/);
  const redirects = {
    "/area-riservata.html": "/area-riservata/",
    "/gestione-documenti.html": "/area-riservata/documenti.html",
    "/PEG.html": "/peg/",
    "/PEG/PEG2628.html": "/peg/edizioni/2026-2028.html",
  };
  for (const [source, target] of Object.entries(redirects)) {
    const block = nginx.split("location = " + prefix + source + " {")[1]?.split("}")[0];
    assert.ok(block, source);
    assert.ok(block.includes("return 308 " + prefix + target + "$is_args$args;"), source);
    assert.ok(fs.existsSync(path.join(root, target.slice(1))), target);
  }
});

test("NAS redirects removed directories and manifests to canonical sections", () => {
  const nginx = read("deploy/synology/nginx.conf");
  const rules = [...nginx.matchAll(/location ~ ([^\s]+) \{\s*return 308 ([^;]+);/g)];
  const redirects = {
    "/setup": "/area-riservata/assemblea/setup.html",
    "/setup.html": "/area-riservata/assemblea/setup.html",
    "/Assemblea-di-Gruppo": "/area-riservata/assemblea/",
    "/Assemblea-di-Gruppo/": "/area-riservata/assemblea/",
    "/Assemblea-di-Gruppo/index.html": "/area-riservata/assemblea/",
    "/PEG": "/peg/",
    "/PEG/": "/peg/",
    "/PEG/index.html": "/peg/",
  };
  for (const directory of ["Assemblea-di-Gruppo", "assemblea"]) {
    for (const page of ["setup.html", "regia.html", "guida.html", "manifest.webmanifest"]) {
      redirects["/" + directory + "/" + page] = "/area-riservata/assemblea/" + page;
    }
  }
  for (const [source, target] of Object.entries(redirects)) {
    const rule = rules.find(([, pattern]) => new RegExp(pattern).test(prefix + source));
    assert.ok(rule, source);
    const match = (prefix + source).match(new RegExp(rule[1]));
    assert.ok(rule[2].endsWith("$is_args$args"), source);
    const destination = rule[2].replace(/\$(\d+)/g, (_, group) => match[Number(group)]).replace("$is_args$args", "");
    assert.equal(destination, prefix + target, source);
    assert.ok(fs.existsSync(path.join(root, target.slice(1))), target);
  }
});

test("NAS redirects every direct index.html URL to its clean directory URL", () => {
  const nginx = read("deploy/synology/nginx.conf");
  const rule = nginx.match(/location ~ (.+) \{\s*if \(\$request_uri ~ "([^"]+)"\) \{\s*return 308 \$1\$is_args\$args;/);
  assert.ok(rule);
  const matcher = new RegExp(rule[1]);
  const directRequest = new RegExp(rule[2]);
  for (const pathname of [
    prefix + "/index.html",
    prefix + "/area-riservata/index.html",
    prefix + "/area-riservata/assemblea/index.html",
    prefix + "/documenti/index.html",
    prefix + "/peg/index.html",
  ]) {
    const match = pathname.match(matcher);
    assert.ok(match, pathname);
    assert.equal(match[1], pathname.replace(/index\.html$/, ""));
    assert.equal(pathname.match(directRequest)[1], match[1]);
  }
  assert.equal(directRequest.test(prefix + "/"), false);
  assert.equal(directRequest.test(prefix + "/area-riservata/"), false);
  assert.match(nginx, /try_files \$uri =404;/);
});

test("NAS image copies only public site directories, not development tools or secrets", () => {
  const dockerfile = read("deploy/synology/Dockerfile");
  assert.match(dockerfile, /RUN node tools\/build-site.cjs \/site/);
  assert.match(dockerfile, /COPY --from=static-site \/site\//);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s|USER\s+root/);
  for (const [, directory] of dockerfile.matchAll(/^COPY ([\w/-]+)\/ \/usr\/share\/nginx\/html\//gm)) {
    assert.ok(fs.statSync(path.join(root, directory)).isDirectory(), directory);
    assert.ok(
      !["deploy", "tools", "tests", ".github", "PEG", "Assemblea-di-Gruppo"].includes(directory),
      directory,
    );
  }
  assert.match(dockerfile, /nginx-unprivileged:/);
});

test("NAS app image includes every local runtime module required by the server", () => {
  const dockerfile = read("server/Dockerfile");
  const copied = new Set([...dockerfile.matchAll(/^COPY (\S+) \/app\/\S+$/gm)].map(([, source]) => source));
  const visited = new Set();
  function check(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.ok(copied.has(file), `${file} is missing from server/Dockerfile`);
    for (const [, dependency] of read(file).matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
      check(path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency)));
    }
  }
  check("server/nas.cjs");
});

test("NAS app starts with only the files copied into its runtime image", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nas-image-"));
  const app = path.join(directory, "app");
  let server;
  try {
    for (const [, source, target] of read("server/Dockerfile").matchAll(/^COPY (\S+) \/app\/(\S+)$/gm)) {
      const destination = path.join(app, target);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(path.join(root, source), destination, { recursive: true });
    }
    const { createNasServer } = require(path.join(app, "server/nas.cjs"));
    server = await createNasServer({
      dataDir: path.join(directory, "data"),
      password: "Image-test-only-password1!",
      publicOrigin: "https://nas-test.invalid",
      basePath: prefix,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const route of ["/healthz", prefix + "/healthz"]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    }
  } finally {
    if (server) {
      const closed = once(server, "close");
      server.stop();
      await closed;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("NAS does not publish a public listener or embed a tunnel token", () => {
  const compose = read("deploy/synology/compose.yaml");
  assert.match(compose, /127\.0\.0\.1:8080:8080/);
  assert.match(compose, /profiles: \["tunnel"\]/);
  assert.match(compose, /"--token-file", "\/run\/secrets\/tunnel_token"/);
  assert.doesNotMatch(compose, /--token["\s:]|latest|"(?:3000:3000|80:80|443:443)"/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /mem_limit: 128m/);
});

test("Synology deployment avoids unsupported CFS CPU quotas while retaining memory limits", () => {
  const compose = read("deploy/synology/compose.yaml");
  assert.doesNotMatch(compose, /^\s*(?:cpus|cpu_quota|cpu_period):/m);
  for (const limit of ["512m", "128m", "256m"]) assert.ok(compose.includes("mem_limit: " + limit));
});

test("NAS stores runtime data outside images and proxies dynamic content without SSE buffering", () => {
  const compose = read("deploy/synology/compose.yaml");
  const nginx = read("deploy/synology/nginx.conf");
  assert.match(compose, /\$\{NAS_DATA_DIR:-\.\/data\}:\/data/);
  assert.match(compose, /NAS_ADMIN_PASSWORD: \$\{NAS_ADMIN_PASSWORD:\?Configure NAS_ADMIN_PASSWORD in nas.env\}/);
  assert.doesNotMatch(compose, /admin_password|NAS_ADMIN_PASSWORD_FILE/);
  assert.match(compose, /profiles: \["maintenance"\]/);
  assert.match(
    nginx,
    /location \^~ \/agesci-canicattini1\/api\/ \{\s*proxy_pass http:\/\/app:3000;\s*proxy_buffering off;/,
  );
  for (const resource of ["/config/site.js", "/calendars/events.json", "/area-riservata/assemblea/dati.js"]) {
    assert.ok(nginx.includes("location = " + prefix + resource + " {\n        proxy_pass http://app:3000;"), resource);
  }
  assert.match(nginx, /proxy_set_header X-Real-IP \$nas_client_ip/);
  assert.match(nginx, /map \$http_x_real_ip \$nas_client_ip/);
  assert.doesNotMatch(nginx, /\$http_cf_connecting_ip/);
  assert.ok(read(".dockerignore").includes("**/admin-password.txt"));
  assert.ok(read(".dockerignore").includes("**/nas.env"));
});

test("NAS revalidates mutable content before generic static asset caching", () => {
  const nginx = read("deploy/synology/nginx.conf");
  const mutable = nginx.indexOf("location ~* /(?:config/site|dati)");
  const assets = nginx.indexOf("location ~* \\.(css|js|");
  assert.ok(mutable >= 0 && assets >= 0 && mutable < assets);
  assert.match(nginx.slice(mutable, assets), /Cache-Control "no-cache" always/);
  assert.match(nginx, /gzip on;/);
  assert.match(nginx, /gzip_vary on;/);
  assert.doesNotMatch(nginx, /immutable|expires 1y|brotli on/);
  assert.match(nginx, /try_files \$uri \$uri\/ \$uri\.html =404;/);
});

test("NAS serves the branded 404 page while preserving the not-found status", () => {
  const nginx = read("deploy/synology/nginx.conf");
  const staticLocation = nginx.split("location /agesci-canicattini1/ {")[1]?.split("}")[0];
  assert.ok(staticLocation);
  assert.match(staticLocation, /error_page 404 \/agesci-canicattini1\/404\.html;/);
  assert.match(staticLocation, /try_files \$uri \$uri\/ \$uri\.html =404;/);
  assert.match(read("404.html"), /<title>Pagina non trovata/);
  assert.match(read("404.html"), /<meta name="robots" content="noindex,follow"/);
  assert.match(read("deploy/synology/Dockerfile"), /COPY 404\.html index\.html manifest\.webmanifest/);
});
