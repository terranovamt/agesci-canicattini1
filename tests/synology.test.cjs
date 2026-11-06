const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("NAS redirects retired pages without requiring HTML files", () => {
  const nginx = read("deploy/synology/nginx.conf");
  const redirects = {
    "/setup": "/area-riservata/assemblea/setup.html",
    "/setup.html": "/area-riservata/assemblea/setup.html",
    "/area-riservata.html": "/area-riservata/index.html",
    "/gestione-documenti.html": "/area-riservata/documenti.html",
    "/PEG.html": "/peg/index.html",
    "/PEG/PEG2628.html": "/peg/edizioni/2026-2028.html",
  };
  for (const [source, target] of Object.entries(redirects)) {
    const block = nginx.split("location = " + source + " {")[1]?.split("}")[0];
    assert.ok(block, source);
    assert.ok(block.includes("return 308 " + target + "$is_args$args;"), source);
    assert.ok(fs.existsSync(path.join(root, target.slice(1))), target);
  }
});

test("NAS redirects removed directories and manifests to canonical sections", () => {
  const nginx = read("deploy/synology/nginx.conf");
  const rules = [...nginx.matchAll(/location ~ ([^\s]+) \{\s*return 308 ([^;]+);/g)];
  const redirects = {
    "/Assemblea-di-Gruppo": "/area-riservata/assemblea/index.html",
    "/Assemblea-di-Gruppo/": "/area-riservata/assemblea/index.html",
    "/Assemblea-di-Gruppo/index.html": "/area-riservata/assemblea/index.html",
    "/PEG": "/peg/index.html",
    "/PEG/": "/peg/index.html",
    "/PEG/index.html": "/peg/index.html",
  };
  for (const directory of ["Assemblea-di-Gruppo", "assemblea"]) {
    for (const page of ["setup.html", "regia.html", "guida.html", "manifest.webmanifest"]) {
      redirects['/' + directory + '/' + page] = '/area-riservata/assemblea/' + page;
    }
  }
  for (const [source, target] of Object.entries(redirects)) {
    const rule = rules.find(([, pattern]) => new RegExp(pattern).test(source));
    assert.ok(rule, source);
    const match = source.match(new RegExp(rule[1]));
    assert.ok(rule[2].endsWith('$is_args$args'), source);
    const destination = rule[2].replace(/\$(\d+)/g, (_, group) => match[Number(group)])
      .replace('$is_args$args', '');
    assert.equal(destination, target, source);
    assert.ok(fs.existsSync(path.join(root, target.slice(1))), target);
  }
});

test("NAS image copies only public site directories, not development tools or secrets", () => {
  const dockerfile = read("deploy/synology/Dockerfile");
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s|USER\s+root/);
  for (const [, directory] of dockerfile.matchAll(/^COPY ([\w/-]+)\/ \/usr\/share\/nginx\/html\//gm)) {
    assert.ok(fs.statSync(path.join(root, directory)).isDirectory(), directory);
    assert.ok(!["deploy", "tools", "tests", ".github", "firebase", "PEG", "Assemblea-di-Gruppo"].includes(directory), directory);
  }
  assert.match(dockerfile, /nginx-unprivileged:/);
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
