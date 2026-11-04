const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../area-riservata.js'), 'utf8');

function load(verified, key = '') {
  const elements = new Map(), calls = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: id === 'riservata', querySelector() { return {} } });
    return elements.get(id);
  };
  vm.runInNewContext(source, {
    document: { getElementById: get }, location: { replace() {} },
    window: { AREA_DASHBOARD: { load() {} }, ACCESSO: {
      verificata: () => verified, chiave: () => key,
      async entra(k) { calls.push(k) }, esci() {}
    } }
  });
  return { get, calls };
}

test('returning to the reserved area reuses a verified session without Firebase login', () => {
  const t = load(true, 'key');
  assert.equal(t.calls.length, 0);
  assert.equal(t.get('login').hidden, true);
  assert.equal(t.get('riservata').hidden, false);
});

test('a new session requires login before showing setup and regia', async () => {
  const t = load(false);
  assert.equal(t.get('riservata').hidden, true);
  assert.equal(t.calls.length, 0);
  t.get('chiave').value = 'key';
  t.get('login-form').onsubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(t.calls, ['key']);
  assert.equal(t.get('riservata').hidden, false);
});

test('an unverified legacy key is verified before showing tools', async () => {
  const t = load(false, 'legacy-key');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(t.calls, ['legacy-key']);
  assert.equal(t.get('riservata').hidden, false);
});
