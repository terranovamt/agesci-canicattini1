const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/shared/assemblea.js"), "utf8");
function load(fetch) {
  const c = { window: { LIVE: { nas: true, url: "https://nas.test/api/state/" } }, fetch, setInterval, clearInterval };
  vm.runInNewContext(source, c);
  return c.window.ASSEMBLEA;
}
test("starting saves content, resets live and activates in one atomic request", async () => {
  const requests = [];
  const a = load(async (url, opts) => {
    requests.push([url, opts]);
    return { ok: true };
  });
  await a.salva(true, { anno_esercizio: 2027 });
  assert.equal(requests.length, 1);
  const [url, opts] = requests[0],
    body = JSON.parse(opts.body);
  assert.equal(url, "https://nas.test/api/state/.json");
  assert.equal(opts.method, "PATCH");
  assert.deepEqual(body.assemblea, { stato: { attiva: true } });
  assert.deepEqual(body.live, { stato: { pos: 0, max: 0 } });
  assert.equal(body.modifiche.patch, '{"anno_esercizio":2027}');
  assert.deepEqual(body.modifiche.t, { ".sv": "timestamp" });
});
test("ending changes only lifecycle state, not content or live position", async () => {
  let body;
  const a = load(async (_, o) => {
    body = JSON.parse(o.body);
    return { ok: true };
  });
  await a.salva(false);
  assert.deepEqual(body, { assemblea: { stato: { attiva: false } } });
});
test("financial slide icons use the existing WebP assets", () => {
  const data = fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/dati.js"), "utf8");
  const icons = [...data.matchAll(/"icona":\s*"([^"]+\.webp)"/g)].map((match) => match[1]);
  assert.equal(icons.length, 6);
  for (const icon of icons)
    assert.ok(fs.existsSync(path.resolve(__dirname, "../area-riservata/assemblea", icon)), icon);
});
test("read and write failures are explicit, not inactive or success fallbacks", async () => {
  const denied = load(async () => ({ ok: false, status: 403, text: async () => "Sessione scaduta" }));
  await assert.rejects(denied.salva(true), /Sessione scaduta/);
  await assert.rejects(denied.leggi(), /403/);
  const invalid = load(async () => ({ ok: true, json: async () => ({ attiva: "yes" }) }));
  await assert.rejects(invalid.leggi(), /non valido/);
});

test("group photo is loaded only by photographic slides and selects modern formats", () => {
  const background = { backgroundImage: "" };
  const context = { LANDSCAPE: {}, cnt: {}, ph: { style: background }, CSS: { supports: () => true } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/slides/landscape/foto_gruppo.js"), "utf8"),
    context,
  );
  assert.equal(background.backgroundImage, "");
  context.LANDSCAPE.slide_foto_gruppo({})({ classList: { add() {} } });
  assert.match(background.backgroundImage, /foto-gruppo.avif/);
  assert.match(background.backgroundImage, /foto-gruppo.webp/);
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

test("setup heading summarises date, convocations, agenda points and slides", () => {
  const setup = fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/core/setup.js"), "utf8");
  assert.match(setup, /function riepilogo\(\)/);
  assert.match(setup, /view === "generale" \|\| view === "ordine"\) \$\("#intro"\)\.textContent = riepilogo\(\)/);
  assert.match(setup, / all'ordine del giorno/);
});

async function codePdf(rows) {
  const context = { window: {}, Blob, Uint8Array };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/core/pdf-codici.js"), "utf8"),
    context,
  );
  const blob = context.window.PDF_CODICI.crea("Codici di voto - Censiti 2025", rows);
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

test("voting-code PDF labels the adult branch CO.CA. without changing other branches", async () => {
  const pdf = await codePdf(["Adulti", "Branca Adulti", "E/G"].map((branca, index) => ({
    nome: "Socio", codice: String(index), branca, personale: "123456",
  })));
  assert.ok(pdf.includes("(Socio 0  -  CO.CA.)"));
  assert.ok(pdf.includes("(Socio 1  -  CO.CA.)"));
  assert.ok(pdf.includes("(Socio 2  -  E/G)"));
  assert.ok(!pdf.includes("Adulti"));
});

test("voting-code PDF places twenty cards in five columns and four rows before starting a new page", async () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({
    nome: "Socio " + i, codice: String(i), branca: "E/G", personale: "123456",
  }));
  const pdf = await codePdf(rows);
  const streams = [...pdf.matchAll(/\nstream\n([\s\S]*?)endstream/g)].map(match => match[1]);
  assert.equal(streams.length, 2);
  assert.match(pdf, /\/MediaBox \[0 0 842 595\]/);
  const cards = stream => [...stream.matchAll(/ RG ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re S/g)]
    .map(match => match.slice(1).map(Number));
  assert.deepEqual(cards(streams[0]), rows.slice(0, 20).map((_, i) => [
    21 + i % 5 * 160, 575 - (Math.floor(i / 5) + 1) * 138.75, 160, 138.75,
  ]));
  assert.deepEqual(cards(streams[1]), [[21, 436.25, 160, 138.75]]);
});

test("voting-code names wrap into at most two complete lines and wide glyphs stay inside the card", async () => {
  const names = [
    "i".repeat(30),
    "W".repeat(30),
    "WWWWWWWW WWWWWWWW",
    "Massimiliano D'Àngelo Castelluccio",
    "WWWWW (WWWWW) \\ WWWWW",
  ];
  const pdf = await codePdf(names.map(nome => ({ nome, codice: "1234567", branca: "E/G", personale: "987654" })));
  const cards = [...pdf.matchAll(/q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re W n\n([\s\S]*?)Q\n/g)];
  assert.equal(cards.length, names.length);
  for (const [index, card] of cards.entries()) {
    const [x, y, width, height] = card.slice(1, 5).map(Number);
    const lines = [...card[5].matchAll(/BT \/F2 ([\d.]+) Tf 0 Tc ([\d.]+) ([\d.]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g)]
      .map(match => ({
        size: Number(match[1]), x: Number(match[2]), y: Number(match[3]),
        text: match[4].replace(/\\([\\()])/g, "$1"),
      }))
      .filter(line => line.y > y + 56 && line.y < y + height - 30);
    assert.ok(lines.length >= 1 && lines.length <= 2);
    assert.equal(lines.map(line => line.text).join(names[index].includes(" ") ? " " : ""), names[index]);
    if (index === 0) {
      assert.equal(lines.length, 1, "narrow letters do not wrap unnecessarily");
      assert.equal(lines[0].size, 13);
    } else {
      assert.equal(lines.length, 2);
    }
    for (const line of lines) {
      assert.equal(line.x, x + 10);
      assert.ok(line.y - line.size * .25 > y + 56, "name stays above the vote-code box");
      if (index === 1 || index === 2) {
        const textWidth = line.text.length * .944 * line.size;
        assert.ok(line.x + textWidth <= x + width - 10, "wide letters stay within the right padding");
      }
    }
  }
});
