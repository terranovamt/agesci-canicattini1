const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);

test('home introduces the dedicated PEG page and the original PDF stays available', () => {
  assert.match(read('index.html'), /class="peg-home-link" href="PEG.html">Consulta il PEG 26-28/);
  assert.match(read('PEG.html'), /href="documents\/pdf\/PEG26-28.pdf" download/);
  assert.ok(fs.existsSync(path.join(root, 'documents/pdf/PEG26-28.pdf')));
  assert.doesNotMatch(read('PEG.html'), /home.js|assemblea.js|iframe/);
  assert.equal((read('PEG.html').match(/<dt>/g) || []).length, 8);
  for (const file of ['index.html', 'PEG.html']) assert.match(read(file), /src="site-menu.js"/);
});

test('PEG and home fit mobile, tablet, laptop and desktop, with usable navigation', { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peg-layout-'));
  const pages = ['PEG.html', 'index.html'].map(file => read(file)
    .replace(/<link\b[^>]*>/g, '')
    .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, '')
    .replace('</head>', '<style>' + read('Assemblea-di-Gruppo/common/theme.css') +
      read('home.css') + (file === 'PEG.html' ? read('peg.css') : '') +
      '</style></head>')
    .replace('</body>', '<script>' + read('site-menu.js') + '</script></body>'));
  const html = `<!doctype html><meta charset="utf-8"><body><script>
    const pages = ${JSON.stringify(pages).replace(/</g, '\\u003c')};
    const results = [];
    (async () => {
      for (let page = 0; page < pages.length; page++) {
        const frame = document.createElement('iframe');
        document.body.append(frame);
        const loaded = new Promise(resolve => frame.onload = resolve);
        frame.srcdoc = pages[page];
        await loaded;
        const doc = frame.contentDocument, win = frame.contentWindow;
        doc.querySelectorAll('a').forEach(link => link.addEventListener('click', event => event.preventDefault()));
        for (const width of [320, 375, 390, 640, 768, 820, 1024, 1280, 1440, 1920]) {
          frame.style.width = width + 'px';
          frame.style.height = (width <= 640 ? 740 : 1000) + 'px';
          await new Promise(resolve => setTimeout(resolve, 20));
          const toggle = doc.getElementById('menu-toggle');
          const menu = doc.getElementById('main-nav');
          const result = {
            page, width,
            overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
            clipped: [...doc.querySelectorAll('h1,h2,h3,p,dt,dd,.peg-directions a')].some(el => el.scrollWidth > el.clientWidth + 1),
            anchors: [...doc.querySelectorAll('a[href^="#"]')].every(a => doc.getElementById(a.hash.slice(1))),
            headings: doc.querySelectorAll('h1').length,
            areas: doc.querySelectorAll('.peg-area').length,
            heroColumns: win.getComputedStyle(doc.querySelector(page === 0 ? '.peg-hero' : '.hero')).gridTemplateColumns.split(' ').length,
            goalColumns: page === 0 ? win.getComputedStyle(doc.querySelector('.peg-goals > div')).gridTemplateColumns.split(' ').length : 0,
            indexPosition: page === 0 ? win.getComputedStyle(doc.querySelector('.peg-index')).position : ''
          };
          if (width <= 640) {
            toggle.click();
            result.menuOpen = toggle.getAttribute('aria-expanded') === 'true' && win.getComputedStyle(menu).display === 'grid';
            menu.querySelector('a').click();
            result.menuClosed = toggle.getAttribute('aria-expanded') === 'false';
            toggle.click();
            doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
            result.escapeCloses = toggle.getAttribute('aria-expanded') === 'false';
          }
          results.push(result);
        }
        frame.remove();
      }
      const out = document.createElement('pre'); out.id = 'results';
      out.textContent = JSON.stringify(results); document.body.append(out);
    })().catch(error => {
      const out = document.createElement('pre'); out.id = 'error';
      out.textContent = error.stack; document.body.append(out);
    });
    </script></body>`;
  try {
    const file = path.join(dir, 'layout.html');
    fs.writeFileSync(file, html);
    const result = spawnSync(chrome, [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
      '--user-data-dir=' + path.join(dir, 'profile'), '--virtual-time-budget=15000',
      '--dump-dom', 'file://' + file
    ], { encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
    assert.ok(match, result.stdout.slice(-3000));
    const results = JSON.parse(match[1]);
    assert.equal(results.length, 20);
    for (const row of results) {
      const label = JSON.stringify(row);
      assert.equal(row.overflow, false, label);
      assert.equal(row.clipped, false, label);
      assert.equal(row.anchors, true, label);
      assert.equal(row.headings, 1, label);
      assert.equal(row.heroColumns, row.width <= 640 ? 1 : 2, label);
      if (row.page === 0) {
        assert.equal(row.areas, 3, label);
        assert.equal(row.goalColumns, row.width <= 640 ? 1 : 2, label);
        assert.equal(row.indexPosition, row.width <= 900 ? 'static' : 'sticky', label);
      }
      if (row.width <= 640) {
        assert.equal(row.menuOpen, true, label);
        assert.equal(row.menuClosed, true, label);
        assert.equal(row.escapeCloses, true, label);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
