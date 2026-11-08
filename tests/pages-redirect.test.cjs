const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('home stays on the group page until the assembly is active', () => {
  for (const search of ['', '?regia=test']) {
    let destination, state, error;
    const elements = { 'assembly-connection-status': {} };
    vm.runInNewContext(read('assets/js/home.js'), {
      document: { getElementById: id => elements[id] },
      location: { search, hash: '#3.2', replace: url => { destination = url } },
      window: { ASSEMBLEA: { osserva: (s, e) => { state = s; error = e } } },
      console: { error() {} },
    });
    state(null);
    state({ attiva: false });
    assert.equal(elements['assembly-connection-status'].hidden, true);
    assert.equal(destination, undefined);
    error(new Error('Offline'));
    assert.match(elements['assembly-connection-status'].textContent, /Offline/);
    assert.equal(elements['assembly-connection-status'].hidden, false);
    state({ attiva: true });
    assert.equal(destination, 'area-riservata/assemblea/' + search + '#3.2');
  }
  assert.ok(!read('index.html').includes('http-equiv="refresh"'));
  assert.ok(read('index.html').includes('href="area-riservata/">Area riservata'));
});
