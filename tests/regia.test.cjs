const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../Assemblea-di-Gruppo/common/regia.js'), 'utf8');

function dashboard(attiva, count = 4, failed = false, options = {}) {
  const elements = new Map();
  const saves = [], alerts = [];
  const $ = selector => {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, { style: {}, textContent: '', hidden: false,
        classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
        classes });
    }
    return elements.get(selector);
  };
  const context = {
    window: { LIVE: { url: 'https://firebase.test/' }, ACCESSO: { chiave: () => '' },
      PRESENZA: { conta: () => ({ totale: count, ruoli: { p: count - 1, r: 1 }, scaduti: [] }) },
      ASSEMBLEA: { async salva(...args) {
        if (options.saveFailure) throw new Error('Firebase 403');
        saves.push(args); attiva = args[0];
      } } },
    document: { querySelector: $ }, addEventListener() {}, URL, Date,
    confirm: () => options.confirm !== false, alert: s => alerts.push(s), setTimeout() {},
    performance: { now: () => 0 },
    fetch: async url => {
      const body = JSON.stringify(url.includes('assemblea') ? options.empty ? null : { attiva }
        : url.includes('modifiche') ? options.patch === undefined ? null : options.patch : {});
      return { ok: !failed, status: failed ? 403 : 200, text: async () => {
        if (url.includes('presenza') && options.waitPresence) await options.waitPresence;
        return body;
      } };
    }
  };
  vm.runInNewContext(source.replace(
    'if (key) accedi(key); else mostraLogin();',
    'V = { avviaLive: salva => salva() }; window.TEST = { controlla, meter, avviaLive };'
  ), context);
  return { api: context.window.TEST, $, saves, alerts };
}

test('connection estimates show true percentages and warning thresholds', async () => {
  for (const [count, cls] of [[4, ''], [70, 'warn'], [90, 'ko'], [120, 'ko']]) {
    const { api, $ } = dashboard(true, count);
    await api.controlla();
    assert.equal($('#m-conn-t').textContent, `≈ ${count} / 100 · ${count}%`);
    assert.equal($('#m-conn').style.width, Math.min(100, count) + '%');
    assert.equal($('#m-conn').className, cls);
    assert.equal($('#m-down-t').textContent, '', 'no fictional download calculation');
    assert.equal($('#m-spazio-t').textContent, '', 'no partial data presented as total storage');
  }
});

test('inactive or unknown assembly has no in-onda styling', async () => {
  for (const attiva of [false, undefined, true]) {
    const { api, $ } = dashboard(attiva);
    await api.controlla();
    assert.equal($('#onda-label').textContent, attiva ? 'In onda' : 'Anteprima');
    assert.equal($('#onda-frame').classes.has('big'), !!attiva);
    assert.equal($('#onda-dot').hidden, !attiva);
    assert.equal($('#avviso').hidden, !!attiva);
    if (!attiva) {
      assert.equal($('#b-live').textContent, 'Non live');
      assert.equal($('#b-assemblea').textContent, 'Assemblea non iniziata');
    }
  }
});

test('unavailable metrics are explicit, not stale or zero usage', async () => {
  const { api, $ } = dashboard(true, 4, true);
  await api.controlla();
  assert.equal($('#m-conn-t').textContent, 'Non disponibile');
  assert.equal($('#k-ruoli').textContent, 'Presenze non verificabili');
  assert.equal($('#b-live').textContent, 'Stato live non verificato');
  assert.equal($('#inizia').disabled, true);
  assert.equal($('#termina').disabled, true);
});

test('lifecycle controls follow Firebase state, independent of slide number', async () => {
  for (const active of [false, true, undefined]) {
    const t = dashboard(active);
    await t.api.controlla();
    assert.equal(t.$('#inizia').disabled, active !== false);
    assert.equal(t.$('#termina').hidden, active !== true);
    assert.equal(t.$('#termina').disabled, active !== true);
  }
});

test('starting in regia preserves the patch and updates immediately without reloading the publisher', async () => {
  const patch = { censimenti: { presenti_attuali: 42 } };
  const t = dashboard(false, 4, false, { patch: JSON.stringify(patch) });
  await t.api.controlla();
  await t.$('#inizia').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(t.saves)), [[true, '', patch]]);
  assert.equal(t.$('#principale').src, undefined, 'no iframe reload');
  assert.equal(t.$('#onda-label').textContent, 'In onda');
  assert.equal(t.$('#avviso').hidden, true);
  assert.match(t.$('#avvio-stato').textContent, /Live avviato/);
  assert.equal(t.$('#inizia').hidden, true);
  assert.equal(t.$('#termina').disabled, false);
});

test('the large start control sits before the slide previews', () => {
  const html = fs.readFileSync(path.join(__dirname, '../Assemblea-di-Gruppo/regia.html'), 'utf8');
  assert.equal((html.match(/id="inizia"/g) || []).length, 1);
  assert.ok(html.indexOf('id="inizia"') < html.indexOf('class="onda"'));
});

test('a stale dashboard check cannot undo a confirmed live activation', async () => {
  const options = {};
  const t = dashboard(false, 4, false, options);
  await t.api.controlla();
  let release;
  options.waitPresence = new Promise(resolve => { release = resolve });
  const stale = t.api.controlla();
  await t.api.avviaLive();
  assert.equal(t.$('#onda-label').textContent, 'In onda');
  release();
  await stale;
  assert.equal(t.$('#onda-label').textContent, 'In onda');
  assert.equal(t.$('#inizia').hidden, true);
});

test('a new empty database can be started without a patch', async () => {
  const t = dashboard(false, 4, false, { empty: true });
  await t.api.controlla();
  assert.equal(t.$('#inizia').disabled, false);
  await t.api.avviaLive();
  assert.equal(t.saves.length, 1);
  assert.equal(t.saves[0][2], undefined);
});

test('failed or cancelled starts do not reload the presentation', async () => {
  for (const options of [{ confirm: false }, { saveFailure: true }, { patch: '{invalid' }]) {
    const t = dashboard(false, 4, false, options);
    await t.api.controlla();
    await t.api.avviaLive();
    assert.equal(t.saves.length, 0);
    assert.equal(t.$('#principale').src, undefined);
    assert.equal(t.$('#inizia').disabled, false);
    if (options.confirm !== false) assert.match(t.alerts[0], /Avvio non riuscito/);
  }
});
