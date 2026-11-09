const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '../area-riservata/assemblea');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);

test('reserved footers match the public footer and brand links are white on purple navigation', { skip: !chrome }, () => {
  const site = path.join(__dirname, '..');
  const read = file => fs.readFileSync(path.join(site, file), 'utf8');
  const footer = file => read(file).match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0];
  const normalize = markup => markup.replace(/href="[^"]+"/g, 'href=""').replace(/\s+/g, ' ');
  const publicFooter = footer('index.html');
  for (const file of ['area-riservata/index.html', 'area-riservata/statistiche.html', 'area-riservata/persone.html']) {
    const markup = footer(file);
    assert.equal(normalize(markup), normalize(publicFooter));
    const target = markup.match(/href="#([^"]+)"/)[1];
    assert.ok(read(file).includes('id="' + target + '"'));
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-chrome-'));
  const css = ['assets/css/theme.css', 'assets/css/home.css', 'assets/css/nas.css'].map(read).join('\n');
  try {
    const html = `<!doctype html><html><head><style>${css}</style></head><body>
      ${publicFooter}
      <script>
        const publicFooter = document.querySelector('footer');
        const reserved = publicFooter.cloneNode(true);
        document.body.append(reserved);
        const properties = ['display', 'flexDirection', 'padding', 'backgroundColor', 'color', 'fontSize'];
        const styles = element => Object.fromEntries(properties.map(key => [key, getComputedStyle(element)[key]]));
        const before = styles(publicFooter);
        publicFooter.remove();
        document.body.className = 'reserved-page';
        const after = styles(reserved);
        const header = document.createElement('header');
        header.className = 'reserved-header';
        header.innerHTML = '<a class="brand" href="../"><span><b>AGESCI</b><small>Canicattini 1</small></span></a>';
        document.body.prepend(header);
        const out = document.createElement('pre');
        out.id = 'results';
        out.textContent = JSON.stringify({ before, after, header: getComputedStyle(header).backgroundColor,
          brand: getComputedStyle(header.querySelector('.brand')).backgroundColor,
          text: getComputedStyle(header.querySelector('.brand')).color });
        document.body.append(out);
      </script></body></html>`;
    const file = path.join(dir, 'layout.html');
    fs.writeFileSync(file, html);
    for (const width of [390, 1280]) {
      const result = spawnSync(chrome, [
        '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-proxy-server',
        '--user-data-dir=' + path.join(dir, 'profile-' + width), '--window-size=' + width + ',900',
        '--dump-dom', 'file://' + file
      ], { encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr);
      const measured = JSON.parse(result.stdout.match(/<pre id="results">([^<]+)<\/pre>/)[1]);
      assert.deepEqual(measured.after, measured.before);
      assert.equal(measured.header, 'rgb(70, 38, 120)');
      assert.equal(measured.brand, 'rgb(255, 255, 255)');
      assert.equal(measured.text, 'rgb(33, 22, 56)');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('mobile QR background stays square and role notes follow their reveal step', { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemblea-mobile-'));
  const css = ['slides/landscape/qr_live.css', 'slides/portrait/base.css', 'slides/portrait/composizione_organo.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const organo = fs.readFileSync(path.join(root, 'slides/portrait/composizione_organo.js'), 'utf8');
  const html = `<!DOCTYPE html><html><head><style>
    :root { --w: #fff; --v: #462678; --y: #FDC500; --bt: 24px }
    * { box-sizing: border-box } body { margin: 0 }
    .qrl { width: 720px } .rv > * { transition: none !important }
    ${css}
    </style></head><body class="pm">
    <div class="qrl"><div class="qra"><h1>Scansiona il QR code</h1><div class="qrs">Assemblea</div></div>
    <div class="qrq"><img alt="QR" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3C/svg%3E"></div>
    <div class="qrc"><div class="qrl2">Inizia tra</div><div class="qrt"><div><b>10</b><span>giorni</span></div></div></div></div>
    <div id="organo"></div>
    <script>
    const results = { qr: [], notes: [] };
    const qrl = document.querySelector('.qrl'), qr = qrl.querySelector('img');
    for (const height of [650, 900, 1400, 1800]) {
      qrl.style.height = height + 'px';
      const box = qr.getBoundingClientRect(), area = qrl.querySelector('.qrq').getBoundingClientRect();
      results.qr.push({ height, width: box.width, qrHeight: box.height,
        fits: box.width <= area.width + 1 && box.height <= area.height + 1,
        background: getComputedStyle(qr).backgroundColor });
    }
    const PORTRAIT = {}, PORTRAIT_UTIL = {
      HEAD() {}, mkFl(r) { const e = document.createElement('div'); r.append(e); return e },
      fitBox() {}
    };
    const h = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild };
    ${organo}
    const data = { persone: [
      { ruolo: 'Presidente', nome: 'Anna', icona: 'P' },
      { ruolo: 'Scrutatore', nome: 'Mario', icona: 'S' },
      { ruolo: 'Scrutatore', nome: 'Luca', icona: 'S' },
      { ruolo: 'Segretario', nome: 'Matteo', icona: 'S', nota: 'Proposto dai Capi Gruppo' }
    ] };
    const slide = PORTRAIT.slide_composizione_organo(data)(document.querySelector('#organo'), {});
    const note = document.querySelector('.nt3');
    for (const step of [0, 1, 2, 3, 4, 3, 0]) {
      slide.show(step);
      results.notes.push({ step, opacity: getComputedStyle(note).opacity });
    }
    const out = document.createElement('pre'); out.id = 'results'; out.textContent = JSON.stringify(results); document.body.append(out);
    </script></body></html>`;
  try {
    const file = path.join(dir, 'layout.html');
    fs.writeFileSync(file, html);
    const result = spawnSync(chrome, [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
      '--user-data-dir=' + path.join(dir, 'profile'), '--dump-dom', 'file://' + file
    ], { encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
    assert.ok(match, 'browser must return measured layout results');
    const results = JSON.parse(match[1]);
    for (const qr of results.qr) {
      assert.ok(qr.width > 0, 'QR must be visible at height ' + qr.height);
      assert.ok(Math.abs(qr.width - qr.qrHeight) <= 1, 'QR background must be square at height ' + qr.height);
      assert.ok(qr.fits, 'QR must fit available space at height ' + qr.height);
      assert.equal(qr.background, 'rgb(255, 255, 255)');
    }
    for (const note of results.notes)
      assert.equal(Number(note.opacity), note.step === 4 ? 0.75 : 0, 'note opacity at step ' + note.step);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
