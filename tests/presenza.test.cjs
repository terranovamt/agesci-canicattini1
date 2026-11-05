const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assemblea/core/presenza.js'), 'utf8');
function load(fetch, ruolo = 'regia') {
  const session = new Map(), timers = [], listeners = {};
  const c = {
    window: { LIVE: { url: 'https://firebase.test/', ruolo } }, fetch,
    sessionStorage: { getItem: k => session.get(k) || null, setItem: (k, v) => session.set(k, v) },
    document: { visibilityState: 'visible', addEventListener: () => { } },
    addEventListener: (e, f) => { listeners[e] = f }, setInterval: (f, ms) => timers.push([f, ms]), Date, Math, JSON
  };
  vm.runInNewContext(source, c);
  return { P: c.window.PRESENZA, session, timers, listeners };
}
test('counts devices seen in the last minute by role and lists stale ones', () => {
  const { P } = load(() => Promise.resolve());
  const now = 1_000_000;
  const c = P.conta({ a: { t: now, r: 'p' }, b: { t: now - 30000, r: 'p' }, c: { t: now - 5000, r: 'r' }, d: { t: now - 90000, r: 'p' }, e: { t: now - 200000, r: 's' }, f: null }, now);
  assert.equal(c.totale, 3);
  assert.deepEqual({ ...c.ruoli }, { p: 2, r: 1 });
  assert.deepEqual([...c.scaduti], ['e']);
  assert.equal(P.conta(null).totale, 0);
});
test('heartbeat writes server timestamp and role, reuses id and deletes on close', async () => {
  const calls = [];
  const { P, session, timers, listeners } = load((url, o) => { calls.push([url, o]); return Promise.resolve() });
  P.avvia('r'); P.avvia('r');
  assert.equal(calls.length, 1);
  const [url, o] = calls[0];
  assert.match(url, /^https:\/\/firebase\.test\/presenza\/[a-z0-9]{1,24}\.json$/);
  assert.deepEqual(JSON.parse(o.body), { t: { '.sv': 'timestamp' }, r: 'r' });
  assert.equal(o.method, 'PUT');
  assert.equal(timers[0][1], 25000);
  assert.ok(url.includes(session.get('assemblea-presenza-r')));
  listeners.pagehide();
  assert.equal(calls[1][1].method, 'DELETE');
  assert.equal(calls[1][0], url);
});
test('spectators of the presentation start automatically, other pages do not', () => {
  const calls = [];
  load(u => { calls.push(u); return Promise.resolve() }, 'pubblico');
  assert.equal(calls.length, 0, 'senza motore (start) non parte');
});
