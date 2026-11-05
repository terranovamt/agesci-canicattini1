const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createPreviewServer, transformConfig } = require('../tools/preview.cjs');

async function withServer(run) {
  const server = createPreviewServer({ watch: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`) }
  finally {
    server.stop();
    await once(server, 'close');
  }
}

test('local preview serves the redesigned home with local access and hot reload', async () => {
  await withServer(async origin => {
    const response = await fetch(origin);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(html, /La Zona e i Settori/);
    assert.match(html, /id="eventi"/);
    assert.match(html, /id="documenti"/);
    assert.match(html, /calendar\.html/);
    assert.match(html, /data-documents-url="documents\/index.json"/);
    assert.match(html, /ANTEPRIMA LOCALE/);
    assert.match(html, /__preview\/events/);
    assert.ok(html.indexOf('window.fetch') < html.indexOf('src="config/site.js"'));
    for (const resource of [
      '/assets/css/home.css', '/assets/css/gestione-documenti.css', '/assets/css/peg.css',
      '/assets/js/home.js', '/assets/js/documents-model.js', '/assets/js/area-riservata.js'
    ]) {
      assert.equal((await fetch(origin + resource)).status, 200, resource);
    }
    const area = await (await fetch(origin + '/area-riservata/index.html')).text();
    assert.match(area, /window\.ACCESSO=\{chiave:\(\)=>"preview-locale",verificata:\(\)=>true/);
    const doc = await fetch(origin + '/docs/assemblea.md');
    assert.match(await doc.text(), /assemblea/i);
    assert.equal((await fetch(origin + '/index.html', { method: 'POST' })).status, 405);
  });
});

test('preview uploads, edits and deletes PDFs only in its in-memory document library', async () => {
  await withServer(async origin => {
    const read = async () => (await fetch(origin + '/documents/index.json')).json();
    const initial = await read();
    assert.equal(initial.length, 4);
    const existing = await fetch(origin + '/documents/pdf/PEG26-28.pdf');
    assert.equal(existing.headers.get('content-type'), 'application/pdf');
    assert.ok((await existing.arrayBuffer()).byteLength > 1000);
    const original = await fs.readFile(path.join(__dirname, '../documents/index.json'), 'utf8');
    const document = { file: 'prova.pdf', title: 'Un PDF di prova', description: 'Solo locale' };
    const post = change => fetch(origin + '/__preview/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change)
    });
    const content = Buffer.from('%PDF-1.7\nanteprima').toString('base64');
    let response = await post({ operation: 'save', document, content });
    assert.equal(response.status, 200);
    assert.equal((await read()).length, 5);
    assert.equal(await (await fetch(origin + '/documents/pdf/prova.pdf')).text(), '%PDF-1.7\nanteprima');
    const edited = { ...document, title: 'Titolo aggiornato' };
    response = await post({ operation: 'save', previous: document, document: edited });
    assert.equal(response.status, 200);
    assert.equal((await read()).at(-1).title, edited.title);
    response = await post({ operation: 'delete', previous: document });
    assert.equal(response.status, 400, 'stale changes must not overwrite remote edits');
    response = await post({ operation: 'delete', previous: edited });
    assert.equal(response.status, 200);
    assert.equal((await read()).length, 4);
    assert.equal((await fetch(origin + '/documents/pdf/prova.pdf')).status, 404);
    assert.equal(await fs.readFile(path.join(__dirname, '../documents/index.json'), 'utf8'), original);
    assert.equal(await fs.stat(path.join(__dirname, '../documents/pdf/prova.pdf')).then(() => true, () => false), false);
  });
});

test('local preview redirects Firebase reads and writes to its in-memory database', async () => {
  await withServer(async origin => {
    const config = await (await fetch(origin + '/config/site.js')).text();
    assert.match(config, /location\.origin \+ '\/__preview\/firebase\/'/);
    assert.doesNotMatch(config, /assemblea-canicattini1-default-rtdb/);

    let response = await fetch(origin + '/__preview/firebase/assemblea/stato.json');
    assert.deepEqual(await response.json(), { attiva: false });
    response = await fetch(origin + '/__preview/firebase/.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assemblea: { stato: { attiva: true } } })
    });
    assert.equal(response.status, 200);
    response = await fetch(origin + '/__preview/firebase/assemblea/stato.json');
    assert.deepEqual(await response.json(), { attiva: true });
  });
});

test('preview refuses an unknown Firebase endpoint instead of serving it live', () => {
  assert.throws(() => transformConfig('window.LIVE = { url: "https://unknown.example/" };'), /anteprima bloccata/);
});

test('section directories redirect before resolving relative resources', async () => {
  await withServer(async origin => {
    for (const section of ['area-riservata', 'area-riservata/assemblea', 'assemblea', 'peg']) {
      const response = await fetch(origin + '/' + section + '?test=1', { redirect: 'manual' });
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('location'), '/' + section + '/?test=1');
      assert.equal((await fetch(origin + '/' + section + '/')).status, 200);
    }
    const setup = await fetch(origin + '/setup');
    assert.equal(setup.status, 200);
    assert.match(await setup.text(), /location\.replace\('area-riservata\/assemblea\/setup\.html'/);
  });
});

test('migrated pages load dynamic data and legacy links in a real browser', { timeout: 60000 }, async t => {
  const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
    spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);
  if (!chrome) { t.skip('Chromium non disponibile'); return }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'site-migration-'));
  const browser = spawn(chrome, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--no-proxy-server', '--remote-debugging-pipe', '--user-data-dir=' + directory
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '';
  const exceptions = [];
  const failedResponses = [];
  const requests = [];
  const pending = new Map();
  browser.stdio[4].on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
      if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
        failedResponses.push(message.params.response.url);
      }
      if (!pending.has(message.id)) continue;
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Browser command timed out: ' + method));
    }, 5000);
    pending.set(id, { resolve, reject, timer });
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  try {
    await withServer(async origin => {
      await fetch(origin + '/__preview/firebase/.json', {
        method: 'PATCH', body: JSON.stringify({ assemblea: { stato: { attiva: true } } })
      });
      const cases = [
        ['/area-riservata/', /id="dashboard-assembly-title">[^<]+<\/h3>/, /id="dashboard-document-links"><li>/],
        ['/area-riservata/documenti.html', /class="managed-document"/, /Documenti aggiornati|Anteprima: modifiche simulate/],
        ['/area-riservata/assemblea/setup.html', /dati\.js caricato/, /id="apri-regia"[^>]+href="regia\.html"/],
        ['/assemblea/', /Documenti preparatori/, /class="document-card document-project"/, /href="\.\.\/peg\/index.html"/],
        ['/area-riservata/assemblea/', /id="msg" style="display: none;"/, /class="qrq"/],
        ['/assemblea/setup.html', /dati\.js caricato/, /id="apri-regia"[^>]+href="regia\.html"/],
        ['/area-riservata/assemblea/regia.html', /id="principale"[^>]+src="index\.html\?vista=principale/, /id="b-assemblea"[^>]*>Assemblea attiva/],
        ['/PEG/PEG2628.html#scelta', /id="scelta"/, /class="peg-page"/],
        ['/area-riservata.html', /id="dashboard-document-links"><li>/, /id="riservata">/],
        ['/setup', /dati\.js caricato/, /id="apri-regia"[^>]+href="regia\.html"/]
      ];
      const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
      await command('Runtime.enable', {}, sessionId);
      await command('Network.enable', {}, sessionId);
      for (const [page, ...patterns] of cases) {
        const requestStart = requests.length;
        await command('Page.navigate', { url: origin + page }, sessionId);
        const deadline = Date.now() + 5000;
        let html = '';
        do {
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            const { result } = await command('Runtime.evaluate', {
              expression: 'document.documentElement.outerHTML', returnByValue: true
            }, sessionId);
            html = result.value || '';
          } catch (error) {
            if (error.message !== 'Inspected target navigated or closed') throw error;
          }
        } while (patterns.some(pattern => !pattern.test(html)) && Date.now() < deadline);
        for (const pattern of patterns) assert.match(html, pattern, page);
        if (page === '/assemblea/') {
          assert.equal(requests.slice(requestStart).some(url => url.includes('/__preview/firebase/')), false,
            'public preparatory documents must not contact Firebase');
          const { result } = await command('Runtime.evaluate', {
            expression: `JSON.stringify({
              cards: document.querySelectorAll('.document-card').length,
              downloads: [...document.querySelectorAll('.document-card a[download]')].map(link => link.href)
            })`, returnByValue: true
          }, sessionId);
          const documents = JSON.parse(result.value);
          assert.equal(documents.cards, 4);
          for (const pdf of documents.downloads) {
            const response = await fetch(pdf);
            assert.equal(response.status, 200, pdf);
            assert.equal(response.headers.get('content-type'), 'application/pdf', pdf);
          }
        }
        assert.deepEqual(exceptions, [], page);
        assert.deepEqual(failedResponses, [], page);
      }
    });
  } finally {
    for (const { timer } of pending.values()) clearTimeout(timer);
    if (browser.exitCode === null) {
      const closed = once(browser, 'exit');
      browser.kill();
      await closed;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('local preview reloads connected browsers when a project file changes', { timeout: 5000 }, async () => {
  const server = createPreviewServer();
  const probe = path.join(__dirname, '../tools/.preview-hot-' + process.pid + '.tmp');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let reader;
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/__preview/events`);
    reader = response.body.getReader();
    await reader.read();
    await fs.writeFile(probe, 'hot reload');
    let timeout;
    const next = await Promise.race([
      reader.read(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Hot reload timeout')), 3000) })
    ]);
    clearTimeout(timeout);
    assert.match(new TextDecoder().decode(next.value), /data: reload/);
  } finally {
    await reader?.cancel();
    await fs.rm(probe, { force: true });
    server.close();
    await once(server, 'close');
  }
});
