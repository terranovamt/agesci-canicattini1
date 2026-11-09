const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const assemblea = path.join(root, 'area-riservata/assemblea');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);

test('regia fits landscape screens and navigation scrolls only the slide list', { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regia-layout-'));
  const css = ['assets/css/theme.css', 'area-riservata/assemblea/core/regia.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const logo = fs.readFileSync(path.join(root, 'assets/img/logo-grande.webp')).toString('base64');
  const source = fs.readFileSync(path.join(assemblea, 'core/regia.js'), 'utf8').replace(
    /if \(key\) accedi\(key\);\s*else mostraLogin\(\);/,
    'window.TEST = { disegna, mostraStato, collega: v => { V = v } };'
  );
  const html = fs.readFileSync(path.join(assemblea, 'regia.html'), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '')
    .replace('../../assets/img/logo-grande.webp', `data:image/webp;base64,${logo}`)
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('</body>', `<script>
      window.LIVE = { url: 'https://firebase.test' };
      window.ACCESSO = { chiave: () => '' };
      ${source}
      const state = { i: 0, k: 0, n: 40, steps: 2,
        titoli: Array.from({ length: 40 }, (_, i) => 'Slide ' + (i + 1)) };
      const draw = () => TEST.disegna(state);
      TEST.collega({
        next() { if (state.k < state.steps) state.k++; else { state.i++; state.k = 0 } draw() },
        prev() { if (state.k) state.k--; else { state.i--; state.k = state.steps } draw() },
        vai(i, k) { state.i = i; state.k = k; draw() }
      });
      document.querySelector('#anteprima').contentWindow.VISTA = { vai() {} };
      document.querySelector('#app').hidden = false;
      TEST.mostraStato(true);
      draw();
      const results = [];
      const list = document.querySelector('#slide');
      for (const pageTop of [0, 240]) {
        state.i = 0; state.k = 0; draw();
        window.scrollTo(0, pageTop);
        const next = document.querySelector('#next');
        next.focus({ preventScroll: true });
        const initial = window.scrollY;
        const check = () => {
          const item = list.children[state.i], box = item.getBoundingClientRect();
          const top = list.getBoundingClientRect().top + list.clientTop;
          const logo = document.querySelector('header img');
          const logoBox = logo.getBoundingClientRect();
          results.push({ initial, pageTop: window.scrollY,
            fits: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth, listTop: list.scrollTop,
            noOverflow: document.documentElement.scrollWidth <= innerWidth,
            logoRatio: (logo.naturalWidth / logo.naturalHeight) / (logoBox.width / logoBox.height),
            visible: box.top >= top - 1 && box.bottom <= top + list.clientHeight + 1,
            current: item.querySelector('button').getAttribute('aria-current'),
            focus: document.activeElement === next });
        };
        check();
        for (let i = 0; i < state.n * (state.steps + 1) - 1; i++) { next.click(); check() }
        for (let i = 0; i < state.n * (state.steps + 1) - 1; i++) {
          document.querySelector('#prev').click(); check();
        }
        list.children[30].querySelector('button').click(); check();
      }
      const out = document.createElement('pre');
      out.id = 'results'; out.textContent = JSON.stringify(results); document.body.append(out);
    </script></body>`);
  try {
    const file = path.join(dir, 'regia.html');
    fs.writeFileSync(file, html);
    for (const viewport of ['2560,1440', '1920,1080', '1366,768', '1280,720', '1024,768', '800,700',
      '375,812', '768,1024', '1024,768', '1440,900']) {
      const result = spawnSync(chrome, [
        '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
        '--user-data-dir=' + path.join(dir, 'profile'), '--window-size=' + viewport,
        '--dump-dom', 'file://' + file
      ], { encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr);
      const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
      assert.ok(match, 'browser must return measured layout results at ' + viewport + ': ' +
        result.stderr + result.stdout.slice(-3000));
      const results = JSON.parse(match[1]);
      assert.ok(results.some(row => row.listTop > 0), 'the slide list must follow the active slide');
      for (const row of results) {
        assert.equal(row.pageTop, row.initial, 'page must stay still at ' + viewport);
        if (!['800,700', '375,812', '768,1024'].includes(viewport))
          assert.equal(row.fits, true, 'dashboard must fit the window at ' + viewport);
        assert.equal(row.noOverflow, true, 'dashboard must not overflow horizontally at ' + viewport);
        assert.ok(Math.abs(row.logoRatio - 1) < 0.03, 'group logo must preserve its aspect ratio at ' + viewport);
        assert.equal(row.visible, true, 'active slide must stay inside the list at ' + viewport);
        assert.equal(row.current, 'step');
        assert.equal(row.focus, true, 'navigation must not move keyboard focus');
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
