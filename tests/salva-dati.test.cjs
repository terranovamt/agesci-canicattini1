const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const dir = path.join(__dirname, '../docs/Assemblea-di-Gruppo');
const load = () => { const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(dir, 'common/salva-dati.js'), 'utf8'), context); return context.window.SALVA_DATI };
const testo = fs.readFileSync(path.join(dir, 'dati.js'), 'utf8');
const lines = t => t.split('\n');
const changed = (a, b) => { const A = new Set(lines(a)); return lines(b).filter(l => !A.has(l)) };

test('unchanged data leaves dati.js byte for byte identical', () => {
  const { genera, valuta } = load();
  assert.equal(genera(testo, valuta(testo)), testo);
});

test('a field edit changes only its own line and keeps comments', () => {
  const { genera, valuta, deq } = load();
  const d = valuta(testo);
  d.assemblea.prima_convocazione = '20:45';
  d.entrate[1].importo = 4600;
  const out = genera(testo, d);
  assert.ok(deq(valuta(out), d));
  assert.equal(lines(out).length, lines(testo).length);
  assert.deepEqual(changed(testo, out).map(l => l.trim()), [
    '"prima_convocazione": "20:45",',
    '{ "descrizione": "Quote associative", "importo": 4600, "importo_anno_precedente": 4315.00 },',
  ]);
  assert.ok(out.includes('// 3. CENSIMENTI'));
});

test('moving, hiding, adding and deleting are written correctly', () => {
  const { genera, valuta, deq } = load();
  const d = valuta(testo);
  const [titolo] = d.slide.splice(1, 1);
  d.slide.splice(2, 0, titolo);
  d.slide[1].nascosta = true;
  d.slide.push({ tipo: 'slide_grazie', testo: 'Ciao' });
  d.slide[5].persone.pop();
  delete d.nota_beni_durevoli;
  d.nuovo = { a: [1, 2] };
  const out = genera(testo, d);
  assert.ok(deq(valuta(out), d));
  assert.ok(out.includes('// Progetto Educativo di Gruppo 2026-2028'));
});
