const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../docs/Assemblea-di-Gruppo/common/regia.js'), 'utf8');

function dashboard(attiva, count = 4, failed = false) {
  const elements = new Map();
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
      PRESENZA: { conta: () => ({ totale: count, ruoli: { p: count - 1, r: 1 }, scaduti: [] }) } },
    document: { querySelector: $ }, addEventListener() {}, URL, Date,
    performance: { now: () => 0 },
    fetch: async url => ({ ok: !failed, status: failed ? 403 : 200,
      text: async () => JSON.stringify(url.includes('assemblea') ? { attiva } : {}) })
  };
  vm.runInNewContext(source.replace(
    'if (key) accedi(key); else mostraLogin();',
    'window.TEST = { controlla, meter };'
  ), context);
  return { api: context.window.TEST, $ };
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
});
