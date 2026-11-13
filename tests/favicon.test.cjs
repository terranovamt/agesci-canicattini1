const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("all site pages use the home favicon", () => {
  const docs = path.join(__dirname, "..");
  const pages = [
    "404.html",
    "index.html",
    "area-riservata/index.html",
    "area-riservata/assemblea/index.html",
    "area-riservata/assemblea/setup.html",
    "area-riservata/assemblea/regia.html",
    "area-riservata/assemblea/guida.html",
  ];
  const icons = pages.map((page) => {
    const html = fs.readFileSync(path.join(docs, page), "utf8");
    const icon = html.match(/<link rel="icon" href="([^"]+)"[^>]*\/?>/);
    assert.ok(icon, page + " has a favicon");
    return path.resolve(docs, path.dirname(page), icon[1]);
  });
  icons.forEach((icon) => assert.equal(icon, icons[0]));
  assert.equal(icons[0], path.join(docs, "assets", "img", "emblema-2colori-noname.svg"));
  assert.ok(fs.existsSync(icons[0]));
});
