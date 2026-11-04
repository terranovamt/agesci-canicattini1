const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const read = file => fs.readFileSync(path.join(__dirname, '../docs', file), 'utf8');

test('home stays on the group page until the assembly is active', () => {
  for (const search of ['', '?regia=test']) {
    let destination, state, error;
    const elements = { stato: {}, assemblea: {} };
    vm.runInNewContext(read('home.js'), {
      document: { getElementById: id => elements[id] },
      location: { search, hash: '#3.2', replace: url => { destination = url } },
      window: { ASSEMBLEA: { osserva: (s, e) => { state = s; error = e } } },
      console: { error() {} },
    });
    assert.equal(elements.assemblea.href, 'setup.html' + search);
    state(null);
    state({ attiva: false });
    assert.equal(destination, undefined);
    error(new Error('Offline'));
    assert.match(elements.stato.textContent, /Offline/);
    state({ attiva: true });
    assert.equal(destination, 'Assemblea-di-Gruppo/index.html' + search + '#3.2');
  }
  assert.ok(!read('index.html').includes('http-equiv="refresh"'));
});
