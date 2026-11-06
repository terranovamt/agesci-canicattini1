const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const files = (directory) =>
  fs
    .readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
    );
const pages = [
  ...fs.readdirSync(root).filter((file) => file.endsWith(".html")),
  ...["area-riservata", "assemblea", "documenti", "peg"].flatMap((directory) =>
    files(directory).filter((file) => file.endsWith(".html")),
  ),
];
const aliases = {
  "peg/index.html": "peg/edizioni/2026-2028.html",
};
const retiredPages = [
  "area-riservata.html",
  "gestione-documenti.html",
  "PEG.html",
  "setup.html",
  "PEG/PEG2628.html",
  "assemblea/setup.html",
  "assemblea/regia.html",
  "assemblea/guida.html",
  "Assemblea-di-Gruppo/index.html",
  "Assemblea-di-Gruppo/setup.html",
  "Assemblea-di-Gruppo/regia.html",
  "Assemblea-di-Gruppo/guida.html",
];

test("the root contains only the home HTML page", () => {
  assert.deepEqual(
    fs.readdirSync(root).filter((file) => file.endsWith(".html")),
    ["index.html"],
  );
});

test("public assembly contains only its document page, not legacy tools", () => {
  assert.deepEqual(fs.readdirSync(path.join(root, "assemblea")), ["index.html"]);
  for (const page of retiredPages) assert.ok(!fs.existsSync(path.join(root, page)), page);
});

test("canonical directories have no obsolete or case-duplicate entries", () => {
  const directories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.ok(directories.includes("peg"));
  assert.ok(!directories.includes("PEG"));
  assert.ok(!directories.includes("Assemblea-di-Gruppo"));
});

function localTarget(page, reference) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) return null;
  assert.ok(!reference.startsWith("/"), `${page}: ${reference} must work under a Pages project prefix`);
  const url = new URL(reference, "https://example.test/agesci-canicattini1/" + page);
  assert.ok(url.pathname.startsWith("/agesci-canicattini1/"), `${page}: ${reference} escapes the site`);
  let file = decodeURIComponent(url.pathname.slice("/agesci-canicattini1/".length));
  if (file.endsWith("/") || !file) file += "index.html";
  return file;
}

test("all pages, stylesheets and manifests resolve local references under a Pages project prefix", () => {
  for (const page of pages) {
    for (const [, reference] of read(page).matchAll(/\b(?:href|src|data-documents-url)=["']([^"']+)["']/g)) {
      const file = localTarget(page, reference);
      if (file !== null) assert.ok(fs.existsSync(path.join(root, file)), `${page}: ${reference}`);
    }
  }
  for (const stylesheet of [...files("assets"), ...files("area-riservata/assemblea")].filter((file) =>
    file.endsWith(".css"),
  )) {
    for (const [, reference] of read(stylesheet).matchAll(/url\(["']?([^)"']+)["']?\)/g)) {
      const file = localTarget(stylesheet, reference);
      if (file !== null) assert.ok(fs.existsSync(path.join(root, file)), `${stylesheet}: ${reference}`);
    }
  }
  for (const file of ["manifest.webmanifest", "area-riservata/assemblea/manifest.webmanifest"]) {
    const manifest = JSON.parse(read(file));
    for (const reference of [manifest.start_url, ...manifest.icons.map((icon) => icon.src)]) {
      assert.ok(fs.existsSync(path.join(root, localTarget(file, reference))), `${file}: ${reference}`);
    }
    const base = "https://example.test/agesci-canicattini1/" + file;
    assert.ok(new URL(manifest.start_url, base).pathname.startsWith(new URL(manifest.scope, base).pathname));
  }
});

test("current PEG entry selects its edition preserving query and section hash", () => {
  for (const [page, destination] of Object.entries(aliases)) {
    const html = read(page);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const search of ["", "?regia=example&vista=schermo", "?embed&solo=limiti"]) {
      let actual;
      vm.runInNewContext(script, {
        location: {
          search,
          hash: "#3.2",
          replace: (value) => {
            actual = value;
          },
        },
      });
      assert.equal(localTarget(page, actual), destination, page);
      const url = new URL(actual, "https://example.test/agesci-canicattini1/" + page);
      assert.equal(url.search, search, page);
      assert.equal(url.hash, "#3.2", page);
    }
    const fallback = html.match(/http-equiv="refresh" content="0;url=([^"]+)"/)[1];
    assert.equal(localTarget(page, fallback), destination, page);
    assert.ok(html.includes('href="' + fallback + '"'), `${page}: fallback link`);
  }
});

test("canonical navigation avoids legacy entry pages and home links point outside their section", () => {
  const legacy = new Set([...retiredPages, ...Object.keys(aliases).filter((page) => page !== "peg/index.html")]);
  for (const page of pages.filter((page) => !legacy.has(page))) {
    for (const [, reference] of read(page).matchAll(/\bhref="([^"]+)"/g)) {
      const target = localTarget(page, reference);
      assert.ok(target === null || !legacy.has(target), `${page}: ${reference} uses a legacy entry`);
    }
  }
  assert.match(read("area-riservata/index.html"), /class="brand" href="\.\.\/"/);
  assert.match(read("peg/edizioni/2026-2028.html"), /class="brand" href="\.\.\/\.\.\/"/);
  assert.match(read("peg/edizioni/2026-2028.html"), /href="\.\.\/\.\.\/#eventi"/);
});

test("shared configuration publishes assembly edits into the migrated data directory", () => {
  const context = {
    window: {},
    location: { search: "" },
    URLSearchParams,
    document: { getElementById: () => null },
  };
  vm.runInNewContext(read("config/site.js"), context);
  assert.equal(context.window.LIVE.github.cartella, "area-riservata/assemblea");
  assert.ok(fs.existsSync(path.join(root, context.window.LIVE.github.cartella, "dati.js")));
  for (const page of [
    "index.html",
    "area-riservata/index.html",
    "area-riservata/documenti.html",
    "area-riservata/assemblea/index.html",
    "area-riservata/assemblea/regia.html",
    "area-riservata/assemblea/setup.html",
  ]) {
    const scripts = [...read(page).matchAll(/<script src="([^"]+)"/g)].map(([, src]) => localTarget(page, src));
    assert.equal(scripts[0], "config/site.js", page);
  }
});

test("public assembly documents and PEG stay independent of restricted tools and Firebase", () => {
  const html = read("assemblea/index.html");
  assert.match(html, /data-documents-url="\.\.\/documents\/index.json"/);
  assert.match(html, /data-site-root="\.\.\/"/);
  assert.doesNotMatch(html, /(?:config\/site|shared\/accesso|shared\/assemblea)\.js/);
  assert.match(read("index.html"), /href="assemblea\/index.html"/);
  assert.match(read("area-riservata/index.html"), /href="assemblea\/setup.html"/);
  assert.match(read("area-riservata/index.html"), /href="assemblea\/regia.html"/);
  assert.match(read("area-riservata/assemblea/setup.html"), /href="\.\.\/index.html"/);
});

test("public archive has year and text search and the home limits recent documents to four", () => {
  const archive = read("documenti/index.html");
  assert.match(archive, /id="documents-year"/);
  assert.match(archive, /id="documents-search"/);
  assert.match(archive, /data-order="latest"/);
  assert.doesNotMatch(archive, /(?:config\/site|shared\/accesso|shared\/assemblea)\.js|data-limit=/);
  assert.match(read("index.html"), /data-order="latest" data-limit="4"/);
  assert.match(read("index.html"), /href="documenti\/index.html"/);
});
