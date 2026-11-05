const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../assemblea/core/modifiche.js'), 'utf8');
const load = () => { const context = { window: {} }; vm.runInNewContext(source, context); return context.window.MODIFICHE };

const base = {
  assemblea: { data: '20 Novembre', prima_convocazione: '20:30', seconda_convocazione: '21:00' },
  slide: [
    { tipo: 'slide_titolo', titolo: 'Ciao' },
    { tipo: 'slide_composizione_organo', persone: [{ ruolo: 'Presidente', nome: '[NOME]' }, { ruolo: 'Segretario', nome: 'Matteo' }] },
  ],
  extra: 1,
};

test('a patch built from an edit reproduces exactly the edit', () => {
  const { applyPatch, diffPatch } = load();
  const edit = JSON.parse(JSON.stringify(base));
  edit.assemblea.prima_convocazione = '20:45';
  edit.slide[1].persone[0].nome = 'Mario Rossi';
  edit.slide[0].nascosta = true;
  delete edit.extra;
  const patch = diffPatch(base, edit);
  assert.deepEqual(JSON.parse(JSON.stringify(applyPatch(base, patch))), edit);
  assert.deepEqual(JSON.parse(JSON.stringify(patch.slide.$i[1])), { persone: { $i: { 0: { nome: 'Mario Rossi' } } } });
  assert.equal(patch.extra, null);
  assert.equal(JSON.stringify(patch).includes('Matteo'), false, 'only changed fields are stored');
});

test('patches survive later dati.js edits and list length changes replace the list', () => {
  const { applyPatch, diffPatch } = load();
  const edit = JSON.parse(JSON.stringify(base));
  edit.slide[1].persone.push({ ruolo: 'Scrutatore', nome: 'Anna' });
  edit.assemblea.seconda_convocazione = '21:15';
  const patch = diffPatch(base, edit);
  const newer = JSON.parse(JSON.stringify(base));
  newer.slide[0].titolo = 'Titolo nuovo da GitHub';
  const out = applyPatch(newer, patch);
  assert.equal(out.slide[0].titolo, 'Titolo nuovo da GitHub');
  assert.equal(out.slide[1].persone.length, 3);
  assert.equal(out.assemblea.seconda_convocazione, '21:15');
  assert.equal(out.assemblea.prima_convocazione, '20:30');
  assert.equal(diffPatch(base, base), undefined);
  assert.equal(applyPatch(base, undefined), base);
});
