const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'area-riservata/assemblea/guida.html'), 'utf8');
const ids = ['link', 'ciclo', 'regia', 'pubblico', 'setup', 'problemi', 'dati', 'firebase', 'limiti'];
const viewports = [[1920, 1080], [1366, 768], [820, 1180], [390, 844], [1180, 820], [844, 390]];
const section = id => guide.match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`))[1];
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);

test('guide preserves all anchors, operational order and NAS/static/live distinctions', () => {
  assert.deepEqual([...guide.matchAll(/<section id="([^"]+)"/g)].map(match => match[1]), ids);
  const index = guide.match(/<nav id="guide-toc"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...index.matchAll(/href="#([^"]+)"/g)].map(match => match[1]), ids);
  assert.doesNotMatch(guide, /data-section-panel|<details\b|<iframe\b/);
  assert.match(text(section('setup')), /bozza locale.*salvarla\/pubblicarla/);
  assert.match(text(section('setup')), /Sul NAS.*senza token GitHub/);
  assert.match(text(section('setup')), /GitHub Pages.*token.*pubblicazione/);
  assert.match(text(section('setup')), /non legge né cancella le patch live/);
  assert.match(text(section('regia')), /patch live.*non sono il salvataggio della bozza/);
  assert.match(text(section('dati')), /Solo modalità GitHub Pages.*non equivale a pubblicare la base sul NAS/);
  for (const id of ['firebase', 'limiti']) assert.match(text(section(id)), /non.*NAS/);
  assert.match(text(section('problemi')), /Sul NAS.*sessione e permessi.*Su GitHub.*token/);
  for (const id of ['setup', 'problemi']) {
    const table = section(id).match(/<table[\s\S]*?<\/table>/)[0];
    assert.match(table, /<caption>/);
    assert.match(table, /scope="col"/);
    assert.match(table, /scope="row"/);
    assert.equal([...table.matchAll(/<td\b/g)].length, [...table.matchAll(/<td data-label=/g)].length);
  }
  // Verify the provider distinction against behavior, not UI labels being revised elsewhere.
  const setup = fs.readFileSync(path.join(root, 'area-riservata/assemblea/core/setup.js'), 'utf8');
  assert.match(setup, /nas\s*=\s*L\.nas\s*===\s*true/);
  assert.match(setup, /\/api\/content\//);
  assert.match(setup, /nas\s*\?\s*null\s*:\s*await token\(\)/);
});

test('guide browser: complete sticky index, readable tables, anchors and embed at six viewports',
  { skip: !chrome, timeout: 90000 }, async () => {
    const dir = fs.mkdtempSync(path.join(root, '.guide-browser-'));
    let browser, socket;
    try {
      const fixture = guide
        .replace('<head>', `<head><script>
          window.guideErrors = [];
          addEventListener('error', event => guideErrors.push(event.message));
        </script>`)
        .replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g, (tag, href) =>
          tag.includes('stylesheet') ? '<style>' + fs.readFileSync(path.resolve(root,
            'area-riservata/assemblea', href), 'utf8') + '</style>' : '')
        .replace(/<script\b[^>]*src=[\s\S]*?<\/script>/g, '')
        .replace(/<img\b[^>]*>/g, '<img alt="" width="38" height="44" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">');
      fs.writeFileSync(path.join(dir, 'guide.html'), fixture);
      fs.writeFileSync(path.join(dir, 'no-script.html'), fixture.replace(/<script\b[\s\S]*?<\/script>/g, ''));
      const runner = `<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{display:block}</style><body><script>
        const ids = ${JSON.stringify(ids)}, results = [];
        function check(value, label) { if (!value) throw new Error(label); results.push(label); }
        // A timer is not a rendering barrier: scroll events and the guide's rAF
        // can still be queued when several headless browsers share the machine.
        const rendered = win => new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Guide rendering frames timed out')), 8000);
          setTimeout(() => win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
            clearTimeout(timeout);
            resolve();
          })), 0);
        });
        (async () => {
          for (const [width, height] of ${JSON.stringify(viewports)}) {
            for (const mode of ['', '?embed', '?embed&solo=limiti', '?solo=limiti']) {
              const label = width + 'x' + height + mode;
              const frame = document.createElement('iframe');
              frame.style.cssText = 'border:0;width:' + width + 'px;height:' + height + 'px';
              document.body.append(frame);
              const load = new Promise(resolve => frame.onload = resolve);
              frame.src = 'guide.html' + mode + '#ciclo'; await load;
              const win = frame.contentWindow, doc = frame.contentDocument;
              await rendered(win);
              const visible = node => !!node.getClientRects().length;
              const index = doc.querySelector('.guide-index'), toggle = index.querySelector('button');
              const nav = doc.querySelector('#guide-toc');
              const solo = mode.includes('solo=limiti'), embed = mode.includes('embed');
              check(doc.documentElement.scrollWidth <= width, label + ': no horizontal overflow');
              check(visible(doc.querySelector('.hd')) === !embed, label + ': embed header');
              check(visible(index) === !solo, label + ': solo index');
              for (const id of ids)
                check(visible(doc.getElementById(id)) === (!solo || ['firebase','limiti'].includes(id)),
                  label + ': searchable content ' + id);
              if (!solo) {
                check(visible(toggle) === (width < 800), label + ': responsive index mode');
                const content = doc.querySelector('.guide-content').getBoundingClientRect();
                if (width >= 800) {
                  const sidebar = index.getBoundingClientRect();
                  check(sidebar.right < content.left && sidebar.width >= 180,
                    label + ': sidebar beside content');
                  check(sidebar.top >= (embed ? 0 : 64) && sidebar.bottom <= height,
                    label + ': sidebar constrained to viewport');
                }
                const prose = doc.querySelector('#ciclo > p');
                const proseStyle = win.getComputedStyle(prose);
                const measure = doc.createElement('canvas').getContext('2d');
                measure.font = proseStyle.font;
                check(prose.getBoundingClientRect().width <= measure.measureText('0').width * 76 + 1,
                  label + ': bounded reading measure');
                check(parseFloat(proseStyle.fontSize) >= 16, label + ': readable body type');
                check(doc.getElementById('ciclo').getBoundingClientRect().top >=
                  (embed ? 0 : 64), label + ': initial deep link uncovered');
                for (const id of ids) {
                  if (width < 800) {
                    check(toggle.getAttribute('aria-expanded') === 'false', label + ': collapsed index');
                    check(toggle.getBoundingClientRect().height >= 44, label + ': toggle touch target');
                    toggle.click();
                    check(toggle.getAttribute('aria-expanded') === 'true', label + ': expanded index');
                  }
                  const link = nav.querySelector('[href="#' + id + '"]');
                  link.scrollIntoView({block:'nearest'});
                  const box = link.getBoundingClientRect();
                  check(box.height >= 44 && box.width >= 44, label + ': touch target ' + id);
                  check(box.top >= (embed ? 0 : 64) && box.bottom <= height,
                    label + ': index reachable ' + id);
                  link.focus();
                  check(win.getComputedStyle(link).outlineStyle !== 'none', label + ': keyboard focus ' + id);
                  link.click(); await rendered(win);
                  const top = doc.getElementById(id).getBoundingClientRect().top;
                  const headerBottom = embed ? 0 : 64;
                  const occlusion = width < 800 ? index.getBoundingClientRect().bottom : headerBottom;
                  check(top >= occlusion - 1 && top < height, label + ': uncovered anchor ' + id);
                  check(link.getAttribute('aria-current') === 'location', label + ': active anchor ' + id);
                  check(doc.documentElement.scrollWidth <= width, label + ': anchor fits ' + id);
                  check(visible(doc.getElementById('ciclo')), label + ': content not hidden by navigation');
                }
                if (width < 800) toggle.click();
                win.location.hash = '#setup'; await rendered(win);
                check(nav.querySelector('[href="#setup"]').getAttribute('aria-current') === 'location',
                  label + ': hash history');
                check(doc.getElementById('setup').getBoundingClientRect().top >=
                  (width < 800 ? index.getBoundingClientRect().bottom : embed ? 0 : 64) - 1,
                  label + ': history anchor uncovered after open index');
                const scrolled = new Promise(resolve => win.addEventListener('scroll', resolve, {once:true}));
                check(win.scrollY > 0, label + ': history anchor is scrolled');
                win.scrollTo(0, 0);
                await scrolled;
                await rendered(win);
                check(win.scrollY === 0, label + ': scroll reaches page start');
                check(nav.querySelector('[href="#link"]').getAttribute('aria-current') === 'location',
                  label + ': scroll updates active: ' + win.scrollY + ' / ' +
                  nav.querySelector('[aria-current]')?.hash);
                if (width < 800) {
                  toggle.click();
                  nav.querySelector('a').focus();
                  nav.dispatchEvent(new win.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
                  check(toggle.getAttribute('aria-expanded') === 'false' && doc.activeElement === toggle,
                    label + ': Escape restores focus');
                }
              }
              for (const id of ['setup', 'problemi', 'firebase']) {
                if (solo && id !== 'firebase') continue;
                const table = doc.querySelector('#' + id + ' table');
                check(table.getBoundingClientRect().right <= width &&
                  table.getBoundingClientRect().left >= 0, label + ': table fits ' + id);
                check([...table.querySelectorAll('td')].every(cell =>
                  parseFloat(win.getComputedStyle(cell).fontSize) >= 15), label + ': readable table ' + id);
                if (width === 390)
                  check([...table.querySelectorAll('td')].every(cell =>
                    win.getComputedStyle(cell, '::before').content.includes(cell.dataset.label)),
                    label + ': mobile table labels ' + id);
              }
              if (embed) {
                const external = doc.querySelector('#firebase a[href^="https:"]');
                doc.addEventListener('click', event => event.preventDefault(), {once:true});
                external.click();
                check(external.target === '_blank', label + ': embedded external link');
              }
              if (solo) {
                win.location.hash = '#limiti'; await rendered(win);
                check(doc.getElementById('limiti').getBoundingClientRect().top >= (embed ? 0 : 64),
                  label + ': solo deep link uncovered');
              }
              check(win.guideErrors.length === 0, label + ': no browser errors');
              frame.remove();
            }
          }
          const frame = document.createElement('iframe');
          frame.style.cssText = 'width:390px;height:844px'; document.body.append(frame);
          const loaded = new Promise(resolve => frame.onload = resolve);
          frame.src = 'no-script.html'; await loaded;
          check(ids.every(id => frame.contentDocument.getElementById(id).getClientRects().length),
            'no JavaScript: all content available');
          check([...frame.contentDocument.querySelectorAll('#guide-toc a')].every(a => a.getClientRects().length),
            'no JavaScript: complete index');
          const out = document.createElement('pre'); out.id = 'result';
          out.textContent = btoa(JSON.stringify(results)); document.body.append(out);
        })().catch(error => {
          const out = document.createElement('pre'); out.id = 'failure';
          out.textContent = error.stack; document.body.append(out);
        });
      </script>`;
      const file = path.join(dir, 'runner.html');
      fs.writeFileSync(file, runner);
      const profile = path.join(dir, 'profile');
      browser = spawn(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--no-proxy-server', '--allow-file-access-from-files', '--user-data-dir=' + profile,
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=2100,1400',
        '--remote-debugging-port=0', 'file://' + file], { stdio: 'ignore' });
      // Real browser time avoids virtual-time/rAF races when other suites also run Chrome.
      const deadline = Date.now() + 20000;
      const portFile = path.join(profile, 'DevToolsActivePort');
      while (!fs.existsSync(portFile) && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(fs.existsSync(portFile), 'Chrome did not expose its isolated debugging port');
      const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      let nextId = 0;
      function command(method, params) {
        const id = ++nextId;
        const response = new Promise((resolve, reject) => {
          const receive = event => {
            const message = JSON.parse(event.data);
            if (message.id !== id) return;
            socket.removeEventListener('message', receive);
            if (message.error) reject(new Error(JSON.stringify(message.error)));
            else resolve(message.result);
          };
          socket.addEventListener('message', receive);
        });
        socket.send(JSON.stringify({ id, method, params }));
        return response;
      }
      let ready = false;
      while (!ready && Date.now() < deadline) {
        try {
          const state = await command('Runtime.evaluate', {
            expression: "document.readyState === 'complete' && location.pathname.endsWith('/runner.html')",
            returnByValue: true,
          });
          ready = state.result.value === true;
        } catch (error) {
          if (!/context was destroyed/i.test(error.message)) throw error;
        }
        if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.ok(ready, 'Guide runner did not finish loading');
      const result = await command('Runtime.evaluate', {
        expression: `new Promise((resolve, reject) => {
          const deadline = Date.now() + 60000;
          const poll = () => {
            if (document.querySelector('#result, #failure')) resolve(document.documentElement.outerHTML);
            else if (Date.now() > deadline) reject(new Error('Guide browser runner timed out'));
            else setTimeout(poll, 50);
          }; poll();
        })`,
        awaitPromise: true, returnByValue: true,
      });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      const html = result.result.value;
      const failure = html.match(/<pre id="failure">([\s\S]*?)<\/pre>/);
      assert.ok(!failure, failure?.[1]);
      const output = html.match(/<pre id="result">([^<]+)<\/pre>/);
      assert.ok(output, html.slice(-2000));
      const results = JSON.parse(Buffer.from(output[1], 'base64').toString());
      assert.ok(results.length > 900);
      for (const [width, height] of viewports)
        for (const mode of ['', '?embed', '?embed&solo=limiti', '?solo=limiti'])
          assert.ok(results.includes(width + 'x' + height + mode + ': no browser errors'));
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
