const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { renderHtml } = require('../tools/site-layout.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);
const pages = ['index.html', 'documenti/index.html', 'assemblea/index.html', 'peg/edizioni/2026-2028.html',
  '404.html', 'area-riservata/index.html', 'area-riservata/documenti.html', 'area-riservata/persone.html',
  'area-riservata/soci.html', 'area-riservata/statistiche.html', 'area-riservata/assemblea/setup.html',
  'area-riservata/assemblea/regia.html', 'area-riservata/assemblea/guida.html', 'area-riservata/assemblea/index.html'];

function fixture(file) {
  const css = [];
  return renderHtml(read(file), file)
    .replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g, (tag, href) => {
      if (tag.includes('stylesheet') && !/^https?:/.test(href))
        css.push(read(path.normalize(path.join(path.dirname(file), href.split('?')[0]))));
      return '';
    })
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/g, '')
    .replace(/<img\b[^>]*>/g, tag => tag.replace(/src="[^"]*"/, 'src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22460%22 height=%22526%22/%3E"'))
    .replace('</head>', `<style>${css.join('\n')}</style></head>`)
    .replace('</body>', `<script>
      window.errors = [];
      addEventListener('error', event => errors.push(event.message));
      window.LIVE = { nas: ${file.startsWith('area-riservata/')}, basePath: '' };
      ${read('assets/js/nas-nav.js')}
      ${read('assets/js/shared/section-nav.js')}
      ${file === 'area-riservata/assemblea/index.html' ? read('area-riservata/assemblea/core/base.js') : ''}
      const allowed = ['riservata', 'members-app', 'people-app', 'statistics-data', 'app'];
      allowed.forEach(id => { const node = document.getElementById(id); if (node) node.hidden = false; });
      for (const id of ['login', 'accesso', 'avviso']) {
        const node = document.getElementById(id); if (node) node.hidden = true;
      }
    </script></body>`);
}

test('all screens fit four viewports and section navigation preserves panels and drafts', { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'section-navigation-'));
  try {
    const html = `<!doctype html><body><script>
      const pages = ${JSON.stringify(pages.map(fixture)).replace(/</g, '\\u003c')};
      const results = [];
      (async () => {
        for (let page = 0; page < pages.length; page++) {
          const frame = document.createElement('iframe');
          frame.style.cssText = 'border:0;height:900px';
          document.body.append(frame);
          const loaded = new Promise(resolve => frame.onload = resolve);
          frame.srcdoc = pages[page]; await loaded;
          const doc = frame.contentDocument;
          for (const width of [375, 768, 1024, 1440]) {
            frame.style.width = width + 'px';
            await new Promise(resolve => setTimeout(resolve, 25));
            const navs = [...doc.querySelectorAll('[data-section-nav]')];
            for (const nav of navs) {
              const buttons = [...nav.querySelectorAll('[data-section-target]')];
              const panels = buttons.map(button => doc.getElementById(button.dataset.sectionTarget));
              if (panels.some(panel => !panel || panels.some(other => other !== panel && other.contains(panel))))
                throw new Error('Nested or missing section: ' + page);
              const input = panels[0].querySelector('input:not([type=file])');
              if (input) input.value = 'draft-preserved';
              for (let index = 0; index < buttons.length; index++) {
                buttons[index].click();
                const exclusive = !nav.hasAttribute('data-section-mobile') || width <= 760;
                results.push({ page, width, section: buttons[index].textContent, visible:
                  panels.every((panel, i) => panel.hidden === (exclusive && i !== index)),
                  selected: buttons[index].getAttribute('aria-pressed') === 'true',
                  retained: !input || input.value === 'draft-preserved',
                  fits: doc.documentElement.scrollWidth <= doc.documentElement.clientWidth });
                if (nav.getClientRects().length) {
                  const boxes = buttons.map(button => button.getBoundingClientRect());
                  results.push({ page, width, touch: boxes.every(box => box.height >= 44 && box.width >= 44),
                    separate: boxes.every((box, i) => boxes.slice(i + 1).every(next =>
                      box.right <= next.left + 1 || next.right <= box.left + 1 ||
                      box.bottom <= next.top + 1 || next.bottom <= box.top + 1)) });
                }
              }
              nav.dispatchEvent(new frame.contentWindow.CustomEvent('section-select', { detail: panels[0].id }));
              results.push({ page, width, programmatic: buttons[0].getAttribute('aria-pressed') === 'true' });
            }
            const stage = doc.getElementById('stage')?.getBoundingClientRect();
            results.push({ page, width, fits: stage ? stage.left >= -1 && stage.right <= width + 1 &&
                stage.top >= -1 && stage.bottom <= frame.contentWindow.innerHeight + 1 :
                doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
              noErrors: frame.contentWindow.errors.length === 0,
              noDuplicateHeader: doc.querySelectorAll('header').length <= 1 });
          }
          frame.remove();
        }
        const out = document.createElement('pre'); out.id = 'result';
        out.textContent = btoa(JSON.stringify(results)); document.body.append(out);
      })().catch(error => { const out = document.createElement('pre'); out.id = 'failure'; out.textContent = error.message; document.body.append(out); });
    </script>`;
    const file = path.join(dir, 'fixture.html');
    fs.writeFileSync(file, html);
    const run = spawnSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-proxy-server', '--virtual-time-budget=15000', '--dump-dom', 'file://' + file],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /<pre id="failure">/);
    const output = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
    assert.ok(output, run.stdout.slice(-2000));
    const results = JSON.parse(Buffer.from(output[1], 'base64').toString());
    for (const result of results) {
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'boolean') assert.equal(value, true, pages[result.page] + ': ' + JSON.stringify(result));
      }
    }
    assert.equal(new Set(results.map(result => result.page)).size, pages.length);
    assert.match(read('peg/index.html'), /2026-2028/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
