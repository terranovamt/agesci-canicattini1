const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const assemblea = path.join(root, 'area-riservata/assemblea');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);

test('regia adapts desktop, laptop, tablet and mobile without obscuring controls or tools', { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(root, '.regia-layout-'));
  const css = ['assets/css/theme.css', 'area-riservata/assemblea/core/regia.css', 'assets/css/section-nav.css']
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
      document.querySelectorAll('header [hidden]').forEach(el => el.hidden = false);
      ${fs.readFileSync(path.join(root, 'assets/js/shared/section-nav.js'), 'utf8')}
      TEST.mostraStato(true);
      draw();
      const phone = matchMedia('(max-width: 699px) and (orientation: portrait)').matches;
      const menu = document.querySelector('#menu-regia');
      const extras = ['.header-status', '#schermo', '#setup', '#esci'].map(s => document.querySelector(s));
      const shown = el => el.checkVisibility();
      const navbar = { height: document.querySelector('header').getBoundingClientRect().height,
        menu: shown(menu), allShown: extras.every(shown), noneShown: !extras.some(shown) };
      if (phone) {
        menu.click();
        navbar.opened = menu.getAttribute('aria-expanded') === 'true' && extras.every(el => {
          const box = el.getBoundingClientRect();
          return shown(el) && box.left >= 0 && box.right <= innerWidth + 1;
        });
        menu.click();
        navbar.closed = menu.getAttribute('aria-expanded') === 'false' && !extras.some(shown);
      }
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
            fits: document.documentElement.scrollWidth <= innerWidth &&
              (phone || document.documentElement.scrollHeight <= innerHeight), listTop: list.scrollTop,
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
      const measurements = [];
      const wide = matchMedia('(min-width: 1000px) and (min-height: 560px) and (orientation: landscape)').matches;
      const draft = document.createElement('input');
      draft.value = 'Bozza da conservare';
      const fields = document.querySelector('#dati-live-campi');
      fields.disabled = false;
      for (let i = 0; i < 4; i++) {
        const label = document.createElement('label');
        label.textContent = ['Presenti attuali', 'Nome presidente (slide 7)', 'Nome scrutatore 1', 'Nome scrutatore 2'][i];
        const input = i === 0 ? draft : document.createElement('input');
        const error = document.createElement('span');
        error.className = 'err';
        error.textContent = 'Campo cambiato in un’altra regia. Ricarica i valori prima di pubblicare.';
        label.append(input, error);
        fields.append(label);
      }
      document.querySelector('#dati-live-stato').textContent = 'Pubblicazione non riuscita: connessione non disponibile. Bozza conservata.';
      document.querySelector('#dati-live-pending').textContent = '4 modifiche in attesa';
      window.LIVE.nas = true;
      window.NAS_METRICS = { watch(config) {
        config.render({
          sampledAt: '2026-11-09T12:00:00Z', traffic: { presentationDevices: 125, liveStreams: 251, liveLimit: 500, people: 140 },
          resources: { process: { cpuCorePercent: 12.5, rssBytes: 134217728, eventLoopP95Ms: 21 },
            host: { cpuPercent: 32, memoryPercent: 48 }, disk: { availableBytes: 9985798963 } },
          warnings: ['Una metrica non è disponibile: verifica lo stato del NAS senza interrompere la presentazione.']
        });
        return {};
      } };
      ${fs.readFileSync(path.join(assemblea, 'core/monitoraggio.js'), 'utf8')}
      NAS_MONITOR.start();
      const visible = el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.height >= 44 && r.width >= 44;
      };
      // Sui telefoni la pagina scorre: tutto deve restare raggiungibile sopra la barra fissa Indietro/Avanti.
      const bar = document.querySelector('.cmd');
      const clear = el => visible(el) && (!phone || bar.contains(el) ||
        el.getBoundingClientRect().bottom <= bar.getBoundingClientRect().top + 1);
      const reach = el => { if (phone) el.scrollIntoView({ block: 'center' }); return clear(el); };
      for (const [active, expanded] of [[false, false], [false, true], [true, false], [null, false]]) {
        TEST.mostraStato(active);
        document.querySelector('#avviso').open = expanded;
        for (const tool of document.querySelectorAll('[data-section-target]')) {
          tool.click();
          if (phone) window.scrollTo(0, document.documentElement.scrollHeight);
          const panels = [...document.querySelectorAll('[data-section-panel]')].filter(el => !el.hidden);
          const current = document.querySelector('#onda-frame').getBoundingClientRect();
          const next = document.querySelector('#anteprima').getBoundingClientRect();
          const panel = panels[0];
          const controls = [...document.querySelectorAll('.comandi button:not([hidden]), [data-section-target]')];
          const boxes = controls.map(el => el.getBoundingClientRect());
          panel.scrollTop = panel.scrollHeight;
          measurements.push({
            active, expanded, tool: tool.textContent, onePanel: wide ? panels.length === 3 : panels.length === 1,
            reachable: ['prev', 'next', 'home', 'odg'].every(id => clear(document.getElementById(id))),
            tools: wide || [...document.querySelectorAll('[data-section-target]')].every(visible),
            panelFits: panels[0].getBoundingClientRect().bottom <= (phone ? bar.getBoundingClientRect().top : innerHeight) + 1,
            panelWidth: panels[0].scrollWidth <= panels[0].clientWidth + 1,
            draftRetained: draft.value === 'Bozza da conservare',
            currentSize: [current.width, current.height],
            nextSize: [next.width, next.height],
            panelSize: [panel.clientWidth, panel.clientHeight],
            dataActions: panel.id !== 'regia-data-panel' ||
              ['dati-live-pubblica', 'dati-live-ricarica'].every(id => reach(document.getElementById(id))),
            expandReachable: panel.id !== 'regia-server-panel' || (() => {
              panel.scrollTop = 0;
              return reach(document.querySelector('#nas-expand'));
            })(),
            noOverlap: boxes.every((box, i) => boxes.slice(i + 1).every(other =>
              box.right <= other.left + 1 || other.right <= box.left + 1 ||
              box.bottom <= other.top + 1 || other.bottom <= box.top + 1)),
            fits: document.documentElement.scrollWidth <= innerWidth &&
              (phone || document.documentElement.scrollHeight <= innerHeight)
          });
          panel.scrollTop = 0;
          window.scrollTo(0, 0);
        }
      }
      document.querySelector('[data-section-target="regia-server-panel"]').click();
      document.querySelector('#nas-expand').click();
      const before = JSON.stringify(state);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      const modal = {
        open: document.querySelector('#nas-monitor-dialog').open,
        closeReachable: visible(document.querySelector('#nas-close')),
        keysBlocked: before === JSON.stringify(state)
      };
      document.querySelector('#nas-monitor-dialog').scrollTop = 10000;
      modal.closeAfterScroll = visible(document.querySelector('#nas-close'));
      document.querySelector('#nas-close').click();
      // L'evento close è asincrono: il ripristino viene verificato dal contenitore.
      const out = document.createElement('pre');
      out.id = 'results'; out.textContent = JSON.stringify({ results, measurements, modal, phone, navbar, viewport: [innerWidth, innerHeight] }); document.body.append(out);
    </script></body>`);
  try {
    const file = path.join(dir, 'regia.html');
    fs.writeFileSync(file, html);
    for (const viewport of ['2560,1440', '1920,1080', '1366,768', '1280,720', '1024,768', '800,700',
      '375,812', '390,844', '390,664', '844,390', '768,1024', '820,1180', '1180,820', '1440,900']) {
      const [width, height] = viewport.split(',').map(Number);
      const wrapper = path.join(dir, 'viewport.html');
      fs.writeFileSync(wrapper, `<!doctype html><iframe src="regia.html" style="border:0;width:${width}px;height:${height}px"
        onload="const out = document.createElement('pre'); out.id = 'results';
          const result = JSON.parse(this.contentDocument.querySelector('#results').textContent);
          result.focusRestored = this.contentDocument.activeElement.id === 'nas-expand';
          out.textContent = JSON.stringify(result); document.body.append(out)"></iframe>`);
      const result = spawnSync(chrome, [
        '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote', '--allow-file-access-from-files',
        '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
        '--user-data-dir=' + path.join(dir, 'profile'), '--window-size=' + viewport,
        '--dump-dom', 'file://' + wrapper
      ], { encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr);
      const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
      assert.ok(match, 'browser must return measured layout results at ' + viewport + ': ' +
        result.stderr + result.stdout.slice(-3000));
      const { results, measurements, modal, phone, navbar, viewport: measured, focusRestored } = JSON.parse(match[1]);
      assert.deepEqual(measured, [width, height], 'fixture uses the exact viewport');
      assert.equal(phone, width < 700 && height >= width, 'phone layout only in portrait below 700px at ' + viewport);
      if (phone) {
        assert.ok(navbar.height <= 56, 'phone navbar stays on one slim row at ' + viewport + ': ' + navbar.height);
        for (const key of ['menu', 'noneShown', 'opened', 'closed'])
          assert.equal(navbar[key], true, 'phone menu ' + key + ' at ' + viewport);
      } else {
        assert.equal(navbar.menu, false, 'menu button only on phones at ' + viewport);
        assert.equal(navbar.allShown, true, 'header commands stay visible at ' + viewport);
      }
      if (height < 800 || width < 1000) assert.ok(results.some(row => row.listTop > 0), 'the slide list must follow the active slide');
      for (const row of results) {
        assert.equal(row.pageTop, row.initial, 'page must stay still at ' + viewport);
        assert.equal(row.fits, true, 'dashboard must fit the window at ' + viewport);
        assert.equal(row.noOverflow, true, 'dashboard must not overflow horizontally at ' + viewport);
        assert.ok(Math.abs(row.logoRatio - 1) < 0.03, 'group logo must preserve its aspect ratio at ' + viewport);
        assert.equal(row.visible, true, 'active slide must stay inside the list at ' + viewport);
        assert.equal(row.current, 'step');
        assert.equal(row.focus, true, 'navigation must not move keyboard focus');
      }
      for (const row of measurements) {
        for (const key of ['onePanel', 'reachable', 'tools', 'panelFits', 'panelWidth', 'fits', 'draftRetained', 'dataActions', 'expandReachable', 'noOverlap'])
          assert.equal(row[key], true, key + ' at ' + viewport + ': ' + JSON.stringify(row));
        for (const key of ['currentSize', 'nextSize'])
          assert.ok(Math.abs(row[key][0] / row[key][1] - 16 / 9) < .02, key + ' preserves 16:9 at ' + viewport);
        if (['1920,1080', '1366,768', '1180,820'].includes(viewport) && !row.expanded) {
          assert.ok(row.currentSize[0] >= (width >= 1366 ? 500 : 350), 'main preview is not tiny at ' + viewport);
          assert.ok(row.nextSize[0] >= 240, 'next preview remains legible at ' + viewport);
          
        }
        if (viewport === '820,1180' && !row.expanded) {
          assert.ok(row.currentSize[0] >= 560, 'portrait tablet prioritizes the current preview');
          assert.ok(row.nextSize[0] >= 300, 'portrait tablet keeps the next preview legible');
        }
      }
      for (const key of ['open', 'closeReachable', 'keysBlocked', 'closeAfterScroll'])
        assert.equal(modal[key], true, key + ' at ' + viewport);
      assert.equal(focusRestored, true, 'monitor restores focus at ' + viewport);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
