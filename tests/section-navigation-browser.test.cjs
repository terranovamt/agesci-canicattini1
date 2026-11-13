const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const { renderHtml } = require('../tools/site-layout.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const chrome = require('./helpers/chrome.cjs');
const pages = ['index.html', 'documenti/index.html', 'assemblea/index.html', 'canzoniere/index.html',
  'canzoniere/canzone.html', 'peg/edizioni/2026-2028.html',
  '404.html', 'area-riservata/index.html', 'area-riservata/documenti.html', 'area-riservata/persone.html',
  'area-riservata/soci.html', 'area-riservata/attivita.html', 'area-riservata/statistiche.html', 'area-riservata/assemblea/setup.html',
  'area-riservata/assemblea/regia.html', 'area-riservata/assemblea/guida.html', 'area-riservata/assemblea/index.html'];
const viewports = [
  [1920, 1080], [1366, 768], [820, 1180], [390, 844], [1180, 820], [844, 390],
  [320, 568], [375, 900], [768, 900], [1024, 900], [1025, 900], [1440, 900],
];
const statisticsSections = ['statistics-version', 'statistics-traffic', 'statistics-server', 'statistics-diagnostic-panel'];
const applicationRoots = {
  'area-riservata/index.html': '#riservata',
  'area-riservata/documenti.html': '#documents-app',
  'area-riservata/persone.html': '#people-app',
  'area-riservata/soci.html': '#members-app',
  'area-riservata/attivita.html': '#activities-app',
  'area-riservata/statistiche.html': '#statistics-data',
  'area-riservata/assemblea/setup.html': '#app',
  'area-riservata/assemblea/regia.html': '#app',
  'area-riservata/assemblea/guida.html': 'main',
  'area-riservata/assemblea/index.html': '#stage',
};

test('statistics displays all sections together without tabs', () => {
  const html = read('area-riservata/statistiche.html');
  assert.doesNotMatch(html, /data-section-nav|data-section-panel|section-nav\.(?:js|css)/);
  for (const id of statisticsSections) {
    assert.match(html, new RegExp(`<div[^>]*id="${id}"[^>]*>`));
    assert.doesNotMatch(html.match(new RegExp(`<div[^>]*id="${id}"[^>]*>`))[0], /\bhidden\b/);
  }
});

function fixture(file) {
  const css = [];
  return renderHtml(read(file), file)
    .replace('<head>', '<head><base href="http://127.0.0.1/' + file + '">')
    .replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g, (tag, href) => {
      if (tag.includes('stylesheet') && !/^https?:/.test(href))
        css.push(read(path.normalize(path.join(path.dirname(file), href.split('?')[0]))));
      return '';
    })
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<iframe\b([^>]*)>[\s\S]*?<\/iframe>/g, (_, attributes) =>
      `<iframe${attributes.replace(/\s(?:src|srcdoc)="[^"]*"/g, '')} srcdoc="<!doctype html><title>Anteprima locale</title>"></iframe>`)
    .replace(/<img\b[^>]*>/g, tag => tag.replace(/src="[^"]*"/, 'src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22460%22 height=%22526%22/%3E"'))
    .replace('</head>', `<style>${css.join('\n')}</style></head>`)
    .replace('</body>', `<script>
      window.errors = [];
      addEventListener('error', event => errors.push(event.message));
      window.LIVE = { nas: ${file.startsWith('area-riservata/')}, basePath: '' };
      ${read('assets/js/nas-nav.js')}
      ${read('assets/js/shared/section-nav.js')}
      ${file === 'area-riservata/assemblea/index.html' ? read('area-riservata/assemblea/core/base.js') : ''}
      const allowed = ['riservata', 'documents-app', 'members-app', 'activities-app', 'people-app', 'statistics-data', 'app'];
      allowed.forEach(id => { const node = document.getElementById(id); if (node) node.hidden = false; });
      document.querySelectorAll('header [hidden], #esci').forEach(node => { node.hidden = false; });
      for (const id of ['login', 'accesso', 'avviso']) {
        const node = document.getElementById(id); if (node) node.hidden = true;
      }
    </script></body>`);
}

test('all screens fit real responsive viewports and section navigation preserves panels and drafts',
  { skip: !chrome, timeout: 120000 }, async t => {
  const dir = fs.mkdtempSync(path.join(__dirname, '.section-navigation-'));
  let browser, socket;
  try {
    const html = `<!doctype html><body style="margin:0"><script>
      window.runResponsive = async () => {
        const pages = ${JSON.stringify(pages.map(fixture)).replace(/</g, '\\u003c')};
        const names = ${JSON.stringify(pages)};
        const results = [];
        for (let page = 0; page < pages.length; page++) {
          const frame = document.createElement('iframe');
          frame.style.cssText = 'display:block;border:0;width:1920px;height:1080px';
          document.body.append(frame);
          const loaded = new Promise(resolve => frame.onload = resolve);
          frame.srcdoc = pages[page]; await loaded;
          const doc = frame.contentDocument;
          const win = frame.contentWindow;
          const visible = node => !!node && node.checkVisibility() &&
            win.getComputedStyle(node).visibility !== 'hidden';
          for (const [width, height] of ${JSON.stringify(viewports)}) {
            frame.style.width = width + 'px';
            frame.style.height = height + 'px';
            // Real time lets resize/media-query events settle without virtual-time/rAF races.
            await new Promise(resolve => setTimeout(resolve, 40));
            const record = values => results.push({ page: names[page], width, height, ...values });
            const measureOverflow = scope => {
              const client = doc.documentElement.clientWidth;
              const fits = doc.documentElement.scrollWidth <= client + 1;
              record({ scope, fits, overflow: doc.documentElement.scrollWidth - client,
                offenders: fits ? [] : [...doc.body.querySelectorAll('*')].filter(visible)
                  .filter(node => { const box = node.getBoundingClientRect(); return box.left < -1 || box.right > client + 1; })
                  .slice(0, 6).map(node => node.tagName.toLowerCase() + (node.id ? '#' + node.id : '')) });
            };
            record({ dimensions: win.innerWidth === width && win.innerHeight === height });
            const applicationRoot = ${JSON.stringify(applicationRoots)}[names[page]];
            if (applicationRoot) record({ applicationVisible: visible(doc.querySelector(applicationRoot)) });
            if (names[page].startsWith('area-riservata/') && !names[page].endsWith('assemblea/index.html')) {
              const header = doc.querySelector('.reserved-navbar');
              const brand = header?.querySelector('.reserved-brand');
              const toggle = doc.getElementById('reserved-menu-toggle');
              const menu = doc.getElementById('reserved-menu');
              const compact = width <= 1024;
              record({ wayfinding: visible(brand) && !!header.querySelector('.reserved-title')?.textContent &&
                brand.getAttribute('href') === '/area-riservata/' &&
                brand.getBoundingClientRect().height >= 44,
                commonLinks: header.querySelector('.reserved-links').textContent === 'Home capiAttivitàSoci',
                compactHeader: !compact || header.getBoundingClientRect().height <= 76,
                menuBreakpoint: visible(toggle) === compact && visible(menu) === !compact,
                menuAria: toggle.getAttribute('aria-controls') === menu.id && toggle.getAttribute('aria-expanded') === 'false' });
              if (compact) {
                record({ hiddenCommands: ![...menu.querySelectorAll('a, button, summary')].some(visible) });
                toggle.click();
                record({ openedMenu: visible(menu) && toggle.getAttribute('aria-expanded') === 'true' });
              }
              const menuBox = menu.getBoundingClientRect();
              record({ menuFits: menuBox.left >= 0 && menuBox.right <= width + 1 &&
                (!compact || menuBox.bottom <= height + 1),
                menuTouchTargets: [...menu.querySelectorAll('a, button, summary')].filter(visible)
                  .every(node => node.getBoundingClientRect().height >= 44) });
              if (compact) {
                const home = menu.querySelector('a');
                home.focus();
                home.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                record({ escapeCloses: !visible(menu) && doc.activeElement === toggle });
                toggle.click();
                doc.body.click();
                record({ outsideCloses: !visible(menu) });
                toggle.click();
                home.addEventListener('click', event => event.preventDefault(), { once: true });
                home.click();
                record({ linkCloses: !visible(menu) });
                toggle.click();
                // Leaving the navigation by keyboard must not leave an overlay over the page.
                const next = doc.createElement('button');
                doc.body.append(next);
                home.focus(); next.focus();
                record({ tabAwayCloses: !visible(menu) && doc.activeElement === next });
                next.remove();
                toggle.click();
                frame.style.width = '1366px';
                await new Promise(resolve => setTimeout(resolve, 40));
                record({ resizeDesktop: visible(menu) && !visible(toggle) && toggle.getAttribute('aria-expanded') === 'false' });
                frame.style.width = width + 'px';
                await new Promise(resolve => setTimeout(resolve, 40));
                record({ resizeMobile: !visible(menu) && visible(toggle) && toggle.getAttribute('aria-expanded') === 'false' });
              }
            }
            const navs = [...doc.querySelectorAll('[data-section-nav]')];
            if (names[page] === 'area-riservata/index.html') {
              // This fixture represents an admin; runtime permission tests cover other roles.
              for (const id of ['dashboard-group-overview', 'dashboard-metrics'])
                doc.getElementById(id).hidden = false;
              record({ unifiedDashboard: !navs.length && !doc.querySelector('[role="tab"], [role="tablist"]') &&
                ['dashboard-overview', 'documents-tool', 'dashboard-assembly-panel', 'dashboard-documents-title',
                  'dashboard-metrics', 'dashboard-group-overview']
                  .every(id => visible(doc.getElementById(id))) &&
                !doc.querySelector('#dashboard-overview details') });
            }
            if (names[page] === 'area-riservata/statistiche.html') {
              record({ allStatisticsVisible: !navs.length && !doc.querySelector('[role="tab"], [role="tablist"]') &&
                ${JSON.stringify(statisticsSections)}.every(id => visible(doc.getElementById(id))) });
            }
            for (const nav of navs) {
              const dialog = nav.closest('dialog');
              const openDialog = dialog && !dialog.open;
              if (openDialog) dialog.showModal();
              const buttons = [...nav.querySelectorAll('[data-section-target]')];
              const panels = buttons.map(button => doc.getElementById(button.dataset.sectionTarget));
              if (!buttons.length || new Set(panels).size !== buttons.length ||
                  panels.some(panel => !panel || panels.some(other => other !== panel && other.contains(panel))))
                throw new Error('Nested, duplicate or missing section: ' + names[page]);
              const drafts = panels.map(panel => panel.querySelector(
                'textarea:not([disabled]), input:not([type]):not([disabled]), input[type=text]:not([disabled]), input[type=search]:not([disabled])'
              )).filter(Boolean);
              drafts.forEach((input, i) => { input.value = 'draft-preserved-' + i; });
              for (let index = 0; index < buttons.length; index++) {
                buttons[index].click();
                const exclusive = !nav.hasAttribute('data-section-mobile') || win.matchMedia(nav.getAttribute('data-section-mobile') || '(max-width: 760px)').matches;
                record({ section: buttons[index].dataset.sectionTarget,
                  visible: panels.every((panel, i) => panel.hidden === (exclusive && i !== index)),
                  panelVisibility: panels.every((panel, i) => visible(panel) === (!exclusive || i === index)),
                  selected: buttons[index].getAttribute('aria-pressed') === 'true',
                  aria: buttons.every((button, i) => button.getAttribute('aria-controls') === panels[i].id &&
                    button.getAttribute('aria-pressed') === String(i === index)),
                  retained: drafts.every((input, i) => input.value === 'draft-preserved-' + i),
                  drafts: drafts.length });
                measureOverflow(buttons[index].dataset.sectionTarget);
                if (exclusive)
                  record({ section: buttons[index].dataset.sectionTarget, navigationVisible: visible(nav) });
                if (visible(nav)) {
                  const boxes = buttons.filter(visible).map(button => button.getBoundingClientRect());
                  record({ section: buttons[index].dataset.sectionTarget,
                    touch: boxes.every(box => box.height >= 44 && box.width >= 44),
                    separate: boxes.every((box, i) => boxes.slice(i + 1).every(next =>
                      box.right <= next.left + 1 || next.right <= box.left + 1 ||
                      box.bottom <= next.top + 1 || next.bottom <= box.top + 1)),
                    navWithinViewport: boxes.every(box => box.left >= -1 && box.right <= width + 1) });
                }
              }
              nav.dispatchEvent(new win.CustomEvent('section-select', { detail: panels[0].id }));
              record({ programmatic: buttons[0].getAttribute('aria-pressed') === 'true',
                programmaticPanel: visible(panels[0]),
                retainedAfterReturn: drafts.every((input, i) => input.value === 'draft-preserved-' + i) });
              if (openDialog) dialog.close();
            }
            measureOverflow('page');
            const stage = doc.getElementById('stage')?.getBoundingClientRect();
            if (stage) record({ stageWithinViewport: stage.width > 0 && stage.height > 0 &&
              stage.left >= -1 && stage.right <= width + 1 && stage.top >= -1 && stage.bottom <= height + 1,
              stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom } });
            record({ noErrors: win.errors.length === 0, errors: win.errors,
              noDuplicateHeader: doc.querySelectorAll('body > header').length <= 1 });
          }
          frame.remove();
        }
        return results;
      };
    </script>`;
    const file = path.join(dir, 'fixture.html');
    fs.writeFileSync(file, html);
    const profile = path.join(dir, 'profile');
    browser = spawn(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-proxy-server', '--user-data-dir=' + profile, '--remote-debugging-port=0',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--window-size=2100,1400', pathToFileURL(file).href], { stdio: 'ignore', cwd: dir, env: { ...process.env, TMPDIR: "." } });
    const deadline = Date.now() + 20000;
    const portFile = path.join(profile, 'DevToolsActivePort');
    while (!fs.existsSync(portFile) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(fs.existsSync(portFile), 'Chrome did not expose its isolated debugging port');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let nextId = 0;
    function command(method, params) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.removeEventListener('message', receive);
          reject(new Error('Chrome command timed out: ' + method));
        }, 90000);
        const receive = event => {
          const message = JSON.parse(event.data);
          if (message.id !== id) return;
          clearTimeout(timer);
          socket.removeEventListener('message', receive);
          if (message.error) reject(new Error(JSON.stringify(message.error)));
          else resolve(message.result);
        };
        socket.addEventListener('message', receive);
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    let ready = false;
    while (!ready && Date.now() < deadline) {
      const state = await command('Runtime.evaluate', {
        expression: "document.readyState === 'complete' && typeof runResponsive === 'function'", returnByValue: true,
      });
      ready = state.result.value === true;
      if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, 'Responsive browser fixture did not load');
    const output = await command('Runtime.evaluate', {
      expression: 'runResponsive()', awaitPromise: true, returnByValue: true,
    });
    assert.ok(!output.exceptionDetails, JSON.stringify(output.exceptionDetails));
    const results = output.result.value;
    const failures = [];
    for (const result of results) {
      for (const [key, value] of Object.entries(result)) {
        if (value === false) failures.push(key + ': ' + JSON.stringify(result));
      }
    }
    assert.equal(failures.length, 0, failures.join('\n'));
    for (const page of pages)
      for (const [width, height] of viewports)
        assert.ok(results.some(result => result.page === page && result.width === width &&
          result.height === height && result.dimensions), page + ': missing viewport ' + width + 'x' + height);
    assert.ok(results.some(result => result.drafts > 0), 'Draft retention must exercise real form controls');
    t.diagnostic(pages.length + ' screens × ' + viewports.length + ' real width/height viewports; ' +
      results.filter(result => 'selected' in result).length + ' section selections; ' +
      results.filter(result => result.drafts > 0).length + ' draft-retention checks');
    assert.match(read('peg/index.html'), /2026-2028/);
  } finally {
    socket?.close();
    if (browser && browser.exitCode === null) {
      const closed = new Promise(resolve => browser.once('exit', resolve));
      browser.kill('SIGTERM');
      await closed;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
