const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '../area-riservata/assemblea');
const source = fs.readFileSync(path.join(root, 'core/regia-dati.js'), 'utf8');
const patchSource = fs.readFileSync(path.join(root, 'core/modifiche.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const base = {
  censimenti: { censiti_attuali: 100, presenti_attuali: null },
  slide: [{ tipo: 'slide_composizione_organo', persone: [
    { ruolo: 'Presidente', nome: '[NOME]' },
    { ruolo: 'Scrutatore', nome: '[NOME 1]' },
    { ruolo: 'Scrutatore', nome: '[NOME 2]' },
    { ruolo: 'Segretario', nome: 'Nome<br>Cognome' }
  ] }],
  assemblea: { data: '20 Novembre' }
};
test('dashboard loads patch helpers and live editor before starting regia', () => {
  const html = fs.readFileSync(path.join(root, 'regia.html'), 'utf8');
  assert.ok(html.indexOf('src="core/modifiche.js"') < html.indexOf('src="core/regia-dati.js"'));
  assert.ok(html.indexOf('src="core/regia-dati.js"') < html.indexOf('src="core/regia.js"'));
  for (const id of ['dati-live-form', 'dati-live-campi', 'dati-live-pubblica', 'dati-live-ricarica', 'dati-live-stato'])
    assert.ok(html.includes(`id="${id}"`));
});
function load(options = {}) {
  const elements = new Map(), requests = [], rendered = [];
  const element = () => ({
    value: '', textContent: '', disabled: false, children: [],
    append(...children) { this.children.push(...children) },
    replaceChildren(...children) { this.children = children }
  });
  const $ = s => {
    if (!elements.has(s)) elements.set(s, element());
    return elements.get(s);
  };
  let remote = options.patch;
  const c = {
    window: { LIVE: { url: 'https://firebase.test/' } },
    document: { querySelector: $, createElement: element },
    confirm: () => options.confirm !== false,
    fetch: async (url, opts) => {
      requests.push({ url, opts });
      if (opts?.method) {
        if (options.denied) return { ok: false, status: 403 };
        remote = JSON.parse(opts.body).patch;
        remote = remote === null ? undefined : JSON.parse(remote);
        return { ok: true };
      }
      if (options.readFailure) return { ok: false, status: 503 };
      return { ok: true, json: async () => options.malformed ? '{invalid' : remote === undefined ? null : JSON.stringify(remote) };
    }
  };
  vm.runInNewContext(patchSource, c);
  vm.runInNewContext(source, c);
  const vista = {
    DATI_BASE: JSON.parse(JSON.stringify(options.base || base)), MODIFICHE: {},
    refreshDati() { rendered.push(this.MODIFICHE.patch) }
  };
  return {
    $, requests, rendered, vista, c,
    setRemote: p => { remote = p },
    start: async () => { c.window.REGIA_DATI.avvia(vista, 'key'); await flush() },
    inputs: () => $('#dati-live-campi').children.map(l => l.children[0]),
    submit: () => $('#dati-live-form').onsubmit({ preventDefault() {} })
  };
}

test('regia loads effective values and only the requested roles, preserving setup changes', async () => {
  const t = load({ patch: { censimenti: { presenti_attuali: 42 }, assemblea: { data: 'Nuova data' } } });
  await t.start();
  const inputs = t.inputs();
  assert.equal(inputs.length, 4);
  assert.equal(inputs[0].value, '42');
  assert.equal(inputs[1].value, '[NOME]');
  inputs[0].value = '60';
  inputs[1].value = 'Anna';
  inputs[2].value = 'Mario';
  inputs[3].value = 'Luca';
  await t.submit();
  const write = t.requests.find(r => r.opts?.method);
  const body = JSON.parse(write.opts.body);
  assert.equal(body.k, 'key');
  assert.deepEqual(body.t, { '.sv': 'timestamp' });
  const out = t.c.window.MODIFICHE.applyPatch(base, JSON.parse(body.patch));
  assert.equal(out.censimenti.presenti_attuali, 60);
  assert.deepEqual(out.slide[0].persone.map(p => p.nome), ['Anna', 'Mario', 'Luca', 'Nome<br>Cognome']);
  assert.equal(out.assemblea.data, 'Nuova data');
  assert.equal(t.rendered.length, 1);
  assert.match(t.$('#dati-live-stato').textContent, /Pubblicato live/);
});

test('unchanged fields do not overwrite newer setup edits', async () => {
  const t = load();
  await t.start();
  t.inputs()[0].value = '50';
  t.setRemote({ slide: { $i: { 0: { persone: { $i: { 1: { nome: 'Nuovo scrutatore' } } } } } } });
  await t.submit();
  const body = JSON.parse(t.requests.find(r => r.opts?.method).opts.body);
  const out = t.c.window.MODIFICHE.applyPatch(base, JSON.parse(body.patch));
  assert.equal(out.slide[0].persone[1].nome, 'Nuovo scrutatore');
  assert.equal(out.censimenti.presenti_attuali, 50);
});

test('same-field and reordered-role conflicts require reload without writing', async () => {
  for (const patch of [
    { censimenti: { presenti_attuali: 80 } },
    { slide: { $i: { 0: { persone: { $i: { 0: { ruolo: 'Segretario' }, 3: { ruolo: 'Presidente' } } } } } } }
  ]) {
    const t = load();
    await t.start();
    t.inputs()[0].value = '50';
    t.inputs()[1].value = 'Anna';
    t.setRemote(patch);
    await t.submit();
    assert.equal(t.requests.filter(r => r.opts?.method).length, 0);
    assert.match(t.$('#dati-live-stato').textContent, /Ricarica/);
    assert.equal(t.inputs()[1].value, 'Anna');
  }
});

test('present counts reject negative, fractional and unsafe integers without writing', async () => {
  for (const value of ['-1', '1.5', '9007199254740992', 'invalid']) {
    const t = load();
    await t.start();
    t.inputs()[0].value = value;
    await t.submit();
    assert.equal(t.requests.filter(r => r.opts?.method).length, 0);
    assert.match(t.$('#dati-live-stato').textContent, /numero intero/);
  }
});

test('zero and unknown counts remain editable after publishing and reloading', async () => {
  const t = load();
  await t.start();
  t.inputs()[0].value = '0';
  await t.submit();
  assert.equal(t.inputs()[0].value, '0');
  t.inputs()[0].value = '';
  await t.submit();
  await t.$('#dati-live-ricarica').onclick();
  await flush();
  assert.equal(t.inputs().length, 4);
  assert.equal(t.inputs()[0].value, '');
});

test('names are plain text rather than executable slide markup and round-trip correctly', async () => {
  const t = load();
  await t.start();
  t.inputs()[1].value = '<img src=x onerror=alert(1)> & "Anna"';
  await t.submit();
  const body = JSON.parse(t.requests.find(r => r.opts?.method).opts.body);
  assert.match(body.patch, /&lt;img/);
  assert.equal(t.inputs()[1].value, '<img src=x onerror=alert(1)> & "Anna"');
  await t.submit();
  assert.equal(t.requests.filter(r => r.opts?.method).length, 1, 'unchanged names are not encoded twice');
});

test('failed writes retain edits, do not refresh screens and show errors', async () => {
  const t = load({ denied: true });
  await t.start();
  t.inputs()[0].value = '50';
  await t.submit();
  assert.equal(t.inputs()[0].value, '50');
  assert.equal(t.rendered.length, 0);
  assert.match(t.$('#dati-live-stato').textContent, /Chiave non valida/);
  assert.equal(t.$('#dati-live-pubblica').disabled, false);
});

test('read failures and malformed patches are explicit, not editable defaults', async () => {
  for (const opts of [{ readFailure: true }, { malformed: true }]) {
    const t = load(opts);
    await t.start();
    assert.equal(t.$('#dati-live-stato').className, 'err');
    assert.equal(t.$('#dati-live-pubblica').disabled, true);
    assert.equal(t.inputs().length, 0);
  }
});

test('reloading prompts before discarding edits and no changes cause no writes', async () => {
  const t = load({ confirm: false });
  await t.start();
  await t.submit();
  assert.equal(t.requests.filter(r => r.opts?.method).length, 0);
  t.inputs()[1].value = 'Anna';
  t.$('#dati-live-ricarica').onclick();
  await flush();
  assert.equal(t.requests.length, 1);
  assert.equal(t.inputs()[1].value, 'Anna');
});
