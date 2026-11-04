const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const path = require('node:path');
const { test } = require('node:test');
const { createPreviewServer, transformConfig } = require('../tools/preview.cjs');

async function withServer(run) {
  const server = createPreviewServer({ watch: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`) }
  finally {
    server.close();
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
    assert.ok(html.indexOf('window.fetch') < html.indexOf('src="Assemblea-di-Gruppo/config.js"'));
    const area = await (await fetch(origin + '/area-riservata.html')).text();
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
    assert.equal(initial.length, 2);
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
    assert.equal((await read()).length, 3);
    assert.equal(await (await fetch(origin + '/documents/pdf/prova.pdf')).text(), '%PDF-1.7\nanteprima');
    const edited = { ...document, title: 'Titolo aggiornato' };
    response = await post({ operation: 'save', previous: document, document: edited });
    assert.equal(response.status, 200);
    assert.equal((await read()).at(-1).title, edited.title);
    response = await post({ operation: 'delete', previous: document });
    assert.equal(response.status, 400, 'stale changes must not overwrite remote edits');
    response = await post({ operation: 'delete', previous: edited });
    assert.equal(response.status, 200);
    assert.equal((await read()).length, 2);
    assert.equal((await fetch(origin + '/documents/pdf/prova.pdf')).status, 404);
    assert.equal(await fs.readFile(path.join(__dirname, '../documents/index.json'), 'utf8'), original);
    assert.equal(await fs.stat(path.join(__dirname, '../documents/pdf/prova.pdf')).then(() => true, () => false), false);
  });
});

test('local preview redirects Firebase reads and writes to its in-memory database', async () => {
  await withServer(async origin => {
    const config = await (await fetch(origin + '/Assemblea-di-Gruppo/config.js')).text();
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
