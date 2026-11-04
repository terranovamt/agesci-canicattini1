const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '../Assemblea-di-Gruppo');
const source = fs.readFileSync(path.join(root, 'common/setup.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'setup.html'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const initial = { anno_esercizio: 2026, assemblea: { titolo: 'Assemblea', data: '20 Novembre' }, slide: [] };
const serialize = data => '// commento da conservare\nwindow.DATI = ' + JSON.stringify(data, null, 2) + ';\n';

function setup(options = {}) {
  const elements = new Map(), created = [], requests = [], listeners = {}, scripts = [], redirects = [];
  const store = new Map(options.noToken ? [] : [['assemblea-gh-token', 'test-token']]);
  let context, remote = serialize(options.remote || initial), writes = 0;
  const element = tag => {
    const e = { tagName: tag.toUpperCase(), style: {}, dataset: {}, value: '', children: [], hidden: false,
      classList: { toggle() {}, add() {}, remove() {} },
      append(...children) { this.children.push(...children) },
      remove() {}, getAttribute(name) { return this[name] },
      querySelector() { return element('legend') },
      showModal() { if (options.cancelToken) { this.returnValue = 'no'; this.onclose() } },
    };
    created.push(e);
    return e;
  };
  const $ = s => {
    const match = created.findLast(e => s === '#' + e.id);
    if (match) return match;
    if (!elements.has(s)) elements.set(s, element('div'));
    return elements.get(s);
  };
  context = {
    window: { ACCESSO: { verificata: () => !options.unauthenticated, esci() {} },
      LIVE: { url: 'https://firebase.test/', github: { repo: 'test/repo', ramo: 'main', cartella: 'Assemblea-di-Gruppo' } } },
    document: {
      querySelector: $, querySelectorAll: () => [], createElement: element,
      body: element('body'),
      head: { append(s) {
        scripts.push(s.src);
        if (options.loadFailure) s.onerror();
        else { vm.runInContext(serialize(initial), context); s.onload() }
      } }
    },
    history: { replaceState() {} }, location: { pathname: '/setup', hash: '', replace(url) { redirects.push(url) } },
    localStorage: { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    TextDecoder, TextEncoder, Uint8Array, atob, btoa,
    scrollY: 0, scrollTo() {}, setTimeout() {}, confirm: () => true,
    setInterval() { throw new Error('setup must not poll in the background') },
    EventSource: class { constructor() { throw new Error('setup must not open streams') } },
    addEventListener(name, fn) { listeners[name] = fn },
    fetch: async (url, opts) => {
      requests.push({ url, opts });
      assert.match(url, /^https:\/\/api\.github\.com\//, 'no Firebase requests');
      if (options.denied) return { status: 401, ok: false };
      if (opts.method === 'PUT') {
        writes++;
        if (options.duringSave) { const fn = options.duringSave; options.duringSave = null; fn($) }
        if (writes <= (options.conflicts || 0)) return { status: 409, ok: false };
        remote = Buffer.from(JSON.parse(opts.body).content, 'base64').toString('utf8');
      }
      return { status: 200, ok: true, json: async () => ({ content: Buffer.from(remote).toString('base64'), sha: 'sha-' + writes }) };
    }
  };
  vm.createContext(context);
  for (const file of ['modifiche.js', 'salva-dati.js'])
    vm.runInContext(fs.readFileSync(path.join(root, 'common', file), 'utf8'), context);
  vm.runInContext(source, context);
  return {
    $, requests, scripts, store, listeners, redirects,
    saved: () => context.window.SALVA_DATI.valuta(remote),
    editTitle(value) { const input = $('#fassemblea_titolo'); input.value = value; input.oninput() },
    save: () => $('#salva-gh').onclick()
  };
}

test('setup loads without Firebase login, streams, polling or presence', async () => {
  for (const script of ['assemblea.js', 'presenza.js']) assert.equal(html.includes('src="common/' + script + '"'), false);
  assert.ok(html.includes('src="common/accesso.js"'));
  for (const id of ['login-form', 'pubblica', 'inizia', 'ripristina']) assert.equal(html.includes('id="' + id + '"'), false);
  const t = setup();
  await flush();
  assert.equal(t.requests.length, 0);
  assert.equal(t.scripts.length, 1);
  assert.equal(t.$('#app').hidden, false);
  assert.equal(t.$('#fassemblea_titolo').value, 'Assemblea');
  assert.equal(t.$('#salva-gh').disabled, true);
});

test('setup requires an already verified session before loading any data', async () => {
  const t = setup({ unauthenticated: true });
  await flush();
  assert.deepEqual(t.redirects, ['../area-riservata.html']);
  assert.equal(t.scripts.length, 0);
  assert.equal(t.requests.length, 0);
});

test('saving commits only local differences to GitHub and preserves remote edits and comments', async () => {
  const remote = { ...initial, assemblea: { ...initial.assemblea, data: 'Nuova data' } };
  const t = setup({ remote });
  await flush();
  t.editTitle('Nuovo titolo');
  assert.equal(t.$('#salva-gh').disabled, false);
  await t.save();
  assert.equal(t.requests.length, 2);
  assert.equal(t.saved().assemblea.titolo, 'Nuovo titolo');
  assert.equal(t.saved().assemblea.data, 'Nuova data');
  const body = JSON.parse(t.requests[1].opts.body);
  assert.equal(body.branch, 'main');
  assert.match(Buffer.from(body.content, 'base64').toString(), /commento da conservare/);
  assert.equal(t.$('#salva-gh').disabled, true);
  let prevented = false;
  t.listeners.beforeunload({ preventDefault() { prevented = true } });
  assert.equal(prevented, false);
});

test('edits made during commit stay dirty and can be saved separately', async () => {
  const t = setup({ duringSave($) {
    const input = $('#fassemblea_titolo'); input.value = 'Ancora diverso'; input.oninput();
  } });
  await flush();
  t.editTitle('Primo titolo');
  await t.save();
  assert.equal(t.saved().assemblea.titolo, 'Primo titolo');
  assert.equal(t.$('#fassemblea_titolo').value, 'Ancora diverso');
  assert.equal(t.$('#salva-gh').disabled, false);
  await t.save();
  assert.equal(t.saved().assemblea.titolo, 'Ancora diverso');
});

test('GitHub conflicts retry the read and commit without Firebase writes', async () => {
  const t = setup({ conflicts: 1 });
  await flush();
  t.editTitle('Titolo ritentato');
  await t.save();
  assert.equal(t.requests.length, 4);
  assert.equal(t.saved().assemblea.titolo, 'Titolo ritentato');
});

test('failed GitHub authentication retains edits and forgets invalid tokens', async () => {
  const t = setup({ denied: true });
  await flush();
  t.editTitle('Da conservare');
  await t.save();
  assert.equal(t.$('#stato').textContent, 'Errore');
  assert.equal(t.store.has('assemblea-gh-token'), false);
  assert.equal(t.$('#fassemblea_titolo').value, 'Da conservare');
  assert.equal(t.$('#salva-gh').disabled, false);
});

test('cancelled token prompt makes no requests and restores the save button', async () => {
  const t = setup({ noToken: true, cancelToken: true });
  await flush();
  t.editTitle('Modifica');
  await t.save();
  assert.equal(t.requests.length, 0);
  assert.equal(t.$('#salva-gh').disabled, false);
});

test('static loading failures are visible and do not enable saving', async () => {
  const t = setup({ loadFailure: true });
  await flush();
  assert.equal(t.$('#stato').textContent, 'Errore');
  assert.match(t.$('#campi').textContent, /Impossibile caricare/);
  assert.equal(t.requests.length, 0);
});
