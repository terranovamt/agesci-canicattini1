const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../docs/Assemblea-di-Gruppo/common/accesso.js'), 'utf8');
function load(fetch) {
  const session = new Map(), local = new Map();
  const storage = map => ({ getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) });
  const c = { window: { LIVE: { url: 'https://firebase.test/' } }, fetch, sessionStorage: storage(session), localStorage: storage(local) };
  vm.runInNewContext(source, c);
  return { a: c.window.ACCESSO, session, local };
}
test('access is confirmed by Firebase without changing content or lifecycle', async () => {
  let release, request;
  const { a } = load((url, opts) => { request = [url, opts]; return new Promise(r => { release = r }) });
  const pending = a.entra('test-key');
  assert.equal(a.chiave(), '');
  release({ ok: true });
  await pending;
  assert.equal(a.chiave(), 'test-key');
  assert.equal(request[0], 'https://firebase.test/modifiche/k.json');
  assert.equal(request[1].method, 'PUT');
  assert.equal(request[1].body, '"test-key"');
});
test('wrong or revoked keys are rejected and forgotten', async () => {
  let ok = true;
  const { a } = load(async () => ({ ok, status: 403 }));
  await a.entra('old-key');
  ok = false;
  await assert.rejects(a.entra('bad-key'), /Chiave non valida/);
  assert.equal(a.chiave(), '');
});
test('offline login does not authenticate and logout also forgets the GitHub token', async () => {
  const { a, local } = load(async () => { throw new Error('Offline') });
  await assert.rejects(a.entra('key'), /Offline/);
  assert.equal(a.chiave(), '');
  local.set('assemblea-gh-token', 'token');
  a.esci();
  assert.equal(local.size, 0);
});
