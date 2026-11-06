const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/shared/assemblea.js"), "utf8");
function load(fetch) {
  const c = { window: { LIVE: { url: "https://firebase.test/" } }, fetch, setInterval, clearInterval };
  vm.runInNewContext(source, c);
  return c.window.ASSEMBLEA;
}
test("starting saves content, resets live and activates in one atomic request", async () => {
  const requests = [];
  const a = load(async (url, opts) => {
    requests.push([url, opts]);
    return { ok: true };
  });
  await a.salva(true, "key", { anno_esercizio: 2027 });
  assert.equal(requests.length, 1);
  const [url, opts] = requests[0],
    body = JSON.parse(opts.body);
  assert.equal(url, "https://firebase.test/.json");
  assert.equal(opts.method, "PATCH");
  assert.deepEqual(body.assemblea, { k: "key", stato: { attiva: true } });
  assert.deepEqual(body.live, { k: "key", stato: { pos: 0, max: 0 } });
  assert.equal(body.modifiche.patch, '{"anno_esercizio":2027}');
  assert.deepEqual(body.modifiche.t, { ".sv": "timestamp" });
});
test("ending changes only lifecycle state, not content or live position", async () => {
  let body;
  const a = load(async (_, o) => {
    body = JSON.parse(o.body);
    return { ok: true };
  });
  await a.salva(false, "key");
  assert.deepEqual(body, { assemblea: { k: "key", stato: { attiva: false } } });
});
test("read and write failures are explicit, not inactive or success fallbacks", async () => {
  const denied = load(async () => ({ ok: false, status: 403 }));
  await assert.rejects(denied.salva(true, "bad"), /Chiave non valida/);
  await assert.rejects(denied.leggi(), /403/);
  const invalid = load(async () => ({ ok: true, json: async () => ({ attiva: "yes" }) }));
  await assert.rejects(invalid.leggi(), /non valido/);
});

test("QR slide uses the compact image for defaults and existing saved defaults, preserving custom images", () => {
  const renderer = fs.readFileSync(
    path.join(__dirname, "../area-riservata/assemblea/slides/landscape/qr_live.js"),
    "utf8",
  );
  const image = fs.readFileSync(path.join(__dirname, "../assets/img/qr-live.png"));
  assert.equal(image.readUInt32BE(16), 990);
  assert.equal(image.readUInt32BE(20), 990);
  assert.ok(image.length < 50000);
  const context = { LANDSCAPE: {}, cnt: {}, setInterval() {}, clearInterval() {}, Date };
  vm.runInNewContext(renderer, context);
  for (const [source, expected] of [
    [undefined, "../../assets/img/qr-live.png"],
    ["../../assets/img/qr.svg", "../../assets/img/qr-live.png"],
    ["custom.png", "custom.png"],
  ]) {
    const root = { isConnected: false, classList: { add() {} }, querySelector() {} };
    context.LANDSCAPE.slide_qr_live({ immagine: source })(root, { assemblea: { titolo: "Test" } });
    assert.ok(root.innerHTML.includes('src="' + expected + '"'));
    assert.ok(root.innerHTML.includes('width="990" height="990"'));
  }
});
