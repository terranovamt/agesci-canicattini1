const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const model = require('../Assemblea-di-Gruppo/common/nuovo-anno-model.js');
const prepare = (source, next, present) => model.prepare(source, next, present,
  (source.anno_esercizio + 1) + '-11-20T20:30');
const clone = value => JSON.parse(JSON.stringify(value));
function initial() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../Assemblea-di-Gruppo/dati.js'), 'utf8'), context);
  return clone(context.window.DATI);
}
function completed(source) {
  const next = model.draft(source);
  next.assemblea.data = '20 Novembre 2027';
  next.assemblea.titolo = 'Assemblea 2027';
  next.censimenti.censiti_attuali = 110;
  next.entrate.forEach((item, i) => { item.importo = 100 + i });
  next.uscite.forEach((item, i) => { item.importo = 10 + i });
  next.patrimonio.voci.forEach((item, i) => { item.importo_anno_corrente = 500 + i });
  next.slide.filter(item => item.tipo === 'slide_qr_live').forEach(item => { item.data_ora = '2027-11-20T20:30' });
  return next;
}
test('annual draft never mutates current data and requires explicit new amounts', () => {
  const source = initial(), original = clone(source);
  const next = model.draft(source);
  assert.equal(next.anno_esercizio, 2027);
  assert.equal(next.anno_scout, '2027/2028');
  assert.equal(next.censimenti.censiti_attuali, null);
  assert.equal(next.censimenti.presenti_attuali, null);
  assert.ok(next.entrate.every(item => item.importo === null));
  assert.ok(next.uscite.every(item => item.importo === null));
  assert.ok(next.patrimonio.voci.every(item => item.importo_anno_corrente === null));
  assert.deepEqual(source, original);
});
test('confirmation rolls current values to previous, preserves history and updates linked slide data', () => {
  const source = initial(), original = clone(source), proposed = completed(source);
  proposed.assemblea.prima_convocazione = '19:30';
  proposed.assemblea.seconda_convocazione = '20:00';
  const originalDraft = clone(proposed);
  const next = prepare(source, proposed, 32);
  assert.equal(next.assemblea.data, '20 Novembre 2027');
  assert.ok(next.slide.filter(slide => slide.tipo === 'slide_qr_live').every(slide => slide.data_ora === '2027-11-20T20:30'));
  assert.deepEqual(source, original);
  assert.deepEqual(proposed, originalDraft);
  for (const key of ['entrate', 'uscite']) {
    next[key].forEach((item, i) => {
      assert.equal(item.importo_anno_precedente, source[key][i].importo);
      assert.equal(item.importo, proposed[key][i].importo);
    });
  }
  assert.equal(next.patrimonio.anno_precedente, 2026);
  assert.equal(next.patrimonio.anno_corrente, 2027);
  next.patrimonio.voci.forEach((item, i) => {
    assert.equal(item.importo_anno_precedente, source.patrimonio.voci[i].importo_anno_corrente);
    assert.equal(item.nome, source.patrimonio.voci[i].nome);
  });
  assert.deepEqual(next.censimenti.storico_per_anno['2026'], { censiti: 100, presenti: 32 });
  assert.equal(next.censimenti.censiti_attuali, 110);
  assert.equal(next.censimenti.presenti_attuali, null);
  assert.equal(next.storico_avanzo_per_anno['2026'], 1342.84);
  assert.equal(next.storico_avanzo_per_anno['2020'], source.storico_avanzo_per_anno['2020']);
  const quorum = next.slide.find(item => item.tipo === 'slide_quorum_convocazioni');
  assert.equal(quorum.convocazioni[0].orario, '19:30');
  assert.equal(quorum.convocazioni[1].orario, '20:00');
  assert.deepEqual(next.slide.filter(item => item.tipo === 'slide_testo_articoli'),
    source.slide.filter(item => item.tipo === 'slide_testo_articoli'), 'regulations are never replaced automatically');
  assert.deepEqual(next.slide.map(item => item.id), source.slide.map(item => item.id));
});
test('rollover blocks missing or invalid values, skipped years and overwritten history', () => {
  const source = initial();
  for (const mutate of [
    next => { next.anno_esercizio = 2028 },
    next => { next.anno_scout = '2027/2029' },
    next => { next.assemblea.prima_convocazione = '25:60' },
    next => { next.entrate[0].importo = null },
    next => { next.entrate[0].importo = -1 },
    next => { next.uscite[0].importo = 1.001 },
    next => { next.patrimonio.voci[0].importo_anno_corrente = NaN },
    next => { next.censimenti.censiti_attuali = 1.5 }
  ]) {
    const next = completed(source); mutate(next);
    assert.throws(() => prepare(source, next, null));
  }
  assert.throws(() => prepare(source, completed(source), 101), /superano/);
  source.storico_avanzo_per_anno['2026'] = 999;
  assert.throws(() => prepare(source, completed(source), null), /sovrascritto/);
  delete source.storico_avanzo_per_anno['2026'];
  source.censimenti.storico_per_anno['2026'] = { censiti: 1, presenti: 1 };
  assert.throws(() => prepare(source, completed(source), null), /sovrascritto/);
});
test('the next rollover preserves the history from the prior one and handles unknown attendance', () => {
  const source = initial();
  const year2027 = prepare(source, completed(source), null);
  const proposed = completed(year2027);
  proposed.assemblea.data = '20 Novembre 2028';
  proposed.slide.filter(item => item.tipo === 'slide_qr_live').forEach(item => { item.data_ora = '2028-11-20T20:30' });
  const year2028 = prepare(year2027, proposed, 40);
  assert.equal(year2028.anno_esercizio, 2028);
  assert.deepEqual(year2028.censimenti.storico_per_anno['2026'], { censiti: 100, presenti: null });
  assert.deepEqual(year2028.censimenti.storico_per_anno['2027'], { censiti: 110, presenti: 40 });
  assert.equal(year2028.storico_avanzo_per_anno['2027'], 450);
});

test('annual data serializes with the existing GitHub save helper, retaining comments and new scout year', () => {
  const source = initial(), next = prepare(source, completed(source), null);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../Assemblea-di-Gruppo/common/salva-dati.js'), 'utf8'), context);
  const original = fs.readFileSync(path.join(__dirname, '../Assemblea-di-Gruppo/dati.js'), 'utf8');
  const output = context.window.SALVA_DATI.genera(original, next);
  assert.ok(output.includes('// 3. CENSIMENTI: dati usati dalla slide quorum.'));
  assert.deepEqual(clone(context.window.SALVA_DATI.valuta(output)), next);
});

test('one local date/time formats the written date without timezone shifts and feeds every QR', () => {
  assert.equal(model.assemblyDate('2028-02-29T00:15'), '29 Febbraio 2028');
  for (const value of ['', '2027-02-29T20:30', '2027-04-31T12:00', '2027-11-20T25:30', '20/11/2027']) {
    assert.throws(() => model.assemblyDate(value), /[Dd]ata/);
  }
  const source = initial();
  source.slide.push({ tipo: 'slide_qr_live', data_ora: '2026-01-01T10:00' });
  const next = model.prepare(source, completed(source), null, '2027-03-01T00:15');
  assert.equal(next.assemblea.data, '1 Marzo 2027');
  assert.equal(next.slide.filter(slide => slide.tipo === 'slide_qr_live' && slide.data_ora === '2027-03-01T00:15').length, 2);
  const noQR = initial();
  noQR.slide = noQR.slide.filter(slide => slide.tipo !== 'slide_qr_live');
  assert.equal(prepare(noQR, completed(noQR), null).assemblea.data, '20 Novembre 2027');
});
