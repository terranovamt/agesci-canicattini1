const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('invisible groups never enter presentation scenes or trigger unknown-type warnings', () => {
  const source = fs.readFileSync(path.join(__dirname, '../area-riservata/assemblea/core/motore.js'), 'utf8');
  const start = source.slice(source.indexOf('function start(data)'), source.indexOf('/* carica dati.js'));
  const warnings = [];
  const context = {
    started: false, ALIAS: {}, T: { slide_titolo: () => () => ({}) },
    document: { getElementById: () => ({ style: {} }) },
    st: { querySelectorAll: () => [] }, pm: {}, location: { hash: '' },
    go() {}, console: { warn: (...args) => warnings.push(args) },
  };
  vm.createContext(context);
  vm.runInContext(start, context);
  const slide = [
    { tipo: 'slide_gruppo_invisibile', titolo: 'Gruppo' },
    { tipo: 'slide_titolo', titolo: 'Visibile' },
    { tipo: 'slide_gruppo_invisibile', titolo: 'Vuoto' }
  ];
  context.start({ slide });
  assert.equal(context.scenes.length, 1);
  assert.equal(context.scenes[0].x.titolo, 'Visibile');
  assert.equal(context.D.slide.length, 1);
  assert.equal(slide.length, 3, 'source data is preserved for setup');
  assert.equal(warnings.length, 0);
});
