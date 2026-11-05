const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '../assemblea');
const config = fs.readFileSync(path.join(__dirname, '../config/site.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'core', 'live.js'), 'utf8');

function role(search, page = 'setup') {
  const session = new Map(), replaced = [];
  const context = {
    window: {}, location: { search, replace: u => replaced.push(u) }, URLSearchParams,
    localStorage: { getItem: () => 'old-key' },
    sessionStorage: { setItem: (k, v) => session.set(k, v) },
    document: { getElementById: id => id === 'stage' && page === 'presentazione' ? {} : null },
  };
  vm.runInNewContext(config, context);
  return Object.assign(context.window.LIVE, { replaced, session });
}

test('dashboard views: preview and screen never publish, old regia link opens the dashboard', () => {
  const p = role('?vista=principale&regia=k', 'presentazione');
  assert.equal(p.ruolo, 'regia'); assert.equal(p.chiave, 'k'); assert.deepEqual(p.replaced, []);
  for (const v of ['anteprima', 'schermo']) {
    const r = role('?vista=' + v + '&regia=k', 'presentazione');
    assert.equal(r.ruolo, 'locale'); assert.equal(r.chiave, null); assert.equal(r.vista, v);
  }
  assert.equal(role('?vista=altro').vista, null);
  const old = role('?regia=k', 'presentazione');
  assert.deepEqual(old.replaced, ['regia.html']);
  assert.equal(old.session.get('canicattini-area-chiave'), 'k');
  assert.equal(old.ruolo, 'locale', 'non pubblica mentre reindirizza');
  assert.deepEqual(role('?regia=k').replaced, [], 'setup e regia.html non reindirizzano');
});

test('only an explicit, nonempty regia parameter selects the presenter', () => {
  for (const search of ['', '?regia=', '?foo=bar']) {
    assert.equal(role(search).ruolo, 'pubblico');
    assert.equal(role(search).chiave, null);
  }
  assert.equal(role('?regia=test-key').ruolo, 'regia');
  assert.equal(role('?regia=test-key').chiave, 'test-key');
});

function viewer(isMobile, read) {
  const elements = {};
  const listeners = {};
  const streams = {};
  const writes = [];
  const rotations = [];
  const navigations = [];
  const intervals = [];
  const reads = [];
  const element = () => { const el = ({
    classes: new Set(),
    classList: { toggle(name, on) { on ? this.owner.classes.add(name) : this.owner.classes.delete(name) } },
    style: {}, append() {}, addEventListener() {}, setAttribute() {},
    contains: target => Object.values(elements).includes(target),
    querySelector: selector => elements[selector] ||= element(),
  }); el.classList.owner = el; return el; };
  const context = {
    window: { LIVE: role(''), mobileLayout: { rotate(value) { rotations.push(value) } } },
    document: { head: element(), body: element(), createElement: element, querySelectorAll: () => [] },
    scenes: [{}, {}, {}], si: 0, sk: 0, cur: {},
    st: element(), innerWidth: isMobile ? 390 : 1440, innerHeight: 900,
    matchMedia: () => ({ matches: isMobile, addEventListener() {} }),
    odgIdx: () => 0, menu() {},
    addEventListener: (name, handler) => { listeners[name] = handler },
    setInterval(fn, ms) { intervals.push({ fn, ms }) }, setTimeout() {},
    fetch: async (url, options) => {
      if (options?.method) writes.push(options);
      else reads.push(url);
      return read ? read() : { ok: true, json: async () => ({ pos: 1001, max: 2000 }) };
    },
    EventSource: class {
      addEventListener(name, handler) { streams[name] = handler }
    },
  };
  context.go = (i, k) => { navigations.push([i, k]); context.si = i; context.sk = k };
  context.next = () => context.go(context.si, context.sk + 1);
  context.prev = () => context.go(context.si, context.sk - 1);
  vm.runInNewContext(sync, context);
  streams.put({ data: JSON.stringify({ path: '/', data: { pos: 1001, max: 2000 } }) });
  return { context, elements, listeners, writes, rotations, navigations, streams, intervals, reads };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('healthy SSE uses no initial or periodic REST reads, fallback stops on recovery', async () => {
  const v = viewer(false);
  const poll = v.intervals.find(t => t.ms === 8000).fn;
  for (let i = 0; i < 450; i++) poll();
  assert.equal(v.reads.length, 0);
  v.streams.error();
  assert.equal(v.reads.length, 1);
  await flush();
  poll();
  await flush();
  assert.equal(v.reads.length, 2);
  v.streams.put({ data: JSON.stringify({ path: '/', data: { pos: 1002, max: 1002 } }) });
  poll();
  assert.equal(v.reads.length, 2);
  assert.equal(v.context.sk, 2);
});

test('pending fallback cannot overwrite a newer SSE state and reads never overlap', async () => {
  let resolve;
  const v = viewer(false, () => new Promise(r => { resolve = r }));
  const poll = v.intervals.find(t => t.ms === 8000).fn;
  v.streams.error();
  poll(); poll();
  assert.equal(v.reads.length, 1);
  v.streams.put({ data: JSON.stringify({ path: '/', data: { pos: 2000, max: 2000 } }) });
  resolve({ ok: true, json: async () => ({ pos: 0, max: 0 }) });
  await flush();
  assert.equal(v.context.si, 2);
  assert.equal(v.context.sk, 0);
});

test('denied fallback responses never change the live state', async () => {
  const v = viewer(false, () => ({ ok: false, status: 403 }));
  v.streams.error();
  await flush();
  assert.equal(v.context.si, 1);
  assert.match(v.elements['#lv-n'].title, /non disponibile/);
});

function presenter(write) {
  const intervals = [], timeouts = [], requests = [], dot = { style: {} };
  const c = {
    window: { LIVE: { url: 'https://firebase.test', ruolo: 'regia', chiave: 'key' } },
    document: { title: '', createElement: () => dot, body: { append() {} } },
    scenes: [{}, {}, {}], si: 0, sk: 0,
    go(i, k) { c.si = i; c.sk = k },
    setInterval(fn) { intervals.push(fn) },
    setTimeout(fn) { timeouts.push(fn) }, clearTimeout() {},
    fetch: async (_, o) => { requests.push(JSON.parse(o.body)); return write ? write() : { ok: true } },
  };
  vm.runInNewContext(sync, c);
  return { c, intervals, timeouts, requests, dot };
}

test('presenter does not republish unchanged positions but preserves max when going back', async () => {
  const p = presenter();
  await p.intervals[0]();
  for (let i = 0; i < 360; i++) await p.intervals[0]();
  assert.equal(p.requests.length, 1);
  p.c.go(2, 0);
  await p.timeouts.at(-1)();
  p.c.go(1, 0);
  await p.timeouts.at(-1)();
  assert.deepEqual(p.requests.at(-1).stato, { pos: 1000, max: 2000 });
});

test('failed presenter writes are retried instead of remembered as successful', async () => {
  let ok = false;
  const p = presenter(() => ({ ok, status: 503 }));
  await p.intervals[0]();
  assert.equal(p.dot.style.background, '#E74030');
  ok = true;
  await p.intervals[0]();
  await p.intervals[0]();
  assert.equal(p.requests.length, 2);
  assert.equal(p.dot.style.background, '#21A067');
});

test('presenter serializes writes and publishes navigation made during an in-flight write', async () => {
  const pending = [];
  const p = presenter(() => new Promise(resolve => pending.push(resolve)));
  const first = p.intervals[0]();
  p.c.go(2, 0);
  await p.timeouts.at(-1)();
  assert.equal(p.requests.length, 1);
  pending[0]({ ok: true });
  await first;
  assert.equal(p.requests.length, 2);
  assert.deepEqual(p.requests[1].stato, { pos: 2000, max: 2000 });
  pending[1]({ ok: true });
  await flush();
  await p.intervals[0]();
  assert.equal(p.requests.length, 2);
});

test('live activation resets position and max without reloading or a redundant write', async () => {
  const p = presenter();
  p.c.go(2, 0);
  await p.timeouts.at(-1)();
  let commits = 0;
  await p.c.window.LIVE.avviaLive(async () => { commits++ });
  assert.equal(commits, 1);
  assert.equal(p.c.si, 0);
  assert.equal(p.c.sk, 0);
  await p.timeouts.at(-1)();
  assert.equal(p.requests.length, 1, 'the activation commit already saved the zero position');
  p.c.go(1, 0);
  await p.timeouts.at(-1)();
  assert.deepEqual(p.requests.at(-1).stato, { pos: 1000, max: 1000 });
});

test('activation waits for the old write before committing and suspends periodic publishing', async () => {
  let resolve;
  const p = presenter(() => new Promise(r => { resolve = r }));
  p.c.go(2, 0);
  const pendingWrite = p.timeouts.at(-1)();
  let commits = 0;
  const activation = p.c.window.LIVE.avviaLive(async () => { commits++ });
  await p.intervals[0]();
  assert.equal(commits, 0);
  assert.equal(p.requests.length, 1);
  resolve({ ok: true });
  await pendingWrite;
  await activation;
  assert.equal(commits, 1);
  assert.equal(p.c.si, 0);
});

test('failed activation keeps the current slide and resumes normal publishing', async () => {
  const p = presenter();
  p.c.go(2, 0);
  await p.timeouts.at(-1)();
  await assert.rejects(p.c.window.LIVE.avviaLive(async () => { throw new Error('Firebase 403') }), /403/);
  assert.equal(p.c.si, 2);
  p.c.go(1, 0);
  await p.timeouts.at(-1)();
  assert.deepEqual(p.requests.at(-1).stato, { pos: 1000, max: 2000 });
});

test('spectators follow regia and cannot move beyond its current position', () => {
  const { context, writes } = viewer(false);
  assert.equal(context.si, 1);
  assert.equal(context.sk, 1);
  context.go(2, 0);
  assert.equal(context.si, 1);
  assert.equal(context.sk, 1);
  context.go(0, 0);
  assert.equal(context.si, 0);
  assert.equal(writes.length, 0);
});

test('viewer events stop original handlers and wait for data before navigating', () => {
  const { context, listeners } = viewer(false);
  let stopped = 0;
  const event = {
    target: {}, key: 'ArrowLeft', preventDefault() {},
    stopImmediatePropagation() { stopped++ },
  };
  listeners.keydown(event);
  assert.equal(context.sk, 0);
  assert.equal(stopped, 1);
  context.cur = null;
  context.next = () => { throw new Error('navigation before data loaded') };
  listeners.keydown({ ...event, key: 'ArrowRight' });
  assert.equal(stopped, 2);
});

test('rotation control is limited to mobile touch devices', () => {
  assert.equal(viewer(false).elements['#lv-r'].hidden, true);
  assert.equal(viewer(true).elements['#lv-r'].hidden, false);
});

test('mobile selectors reach their own handlers without running original navigation', () => {
  const { listeners } = viewer(true);
  listeners.click({
    target: { closest: selector => selector === '[data-live-control]' },
    stopImmediatePropagation() { throw new Error('selector was intercepted') },
  });
});

test('rotation delegates layout and preserves the current slide position', () => {
  const { context, elements, rotations } = viewer(true);
  elements['#lv-r'].onclick();
  assert.equal(rotations.at(-1), true);
  assert.equal(context.document.body.classes.has('lv-rot'), true);
  assert.equal(context.si, 1);
  assert.equal(context.sk, 1);
  elements['#lv-r'].onclick();
  assert.equal(rotations.at(-1), false);
  assert.equal(context.document.body.classes.has('lv-rot'), false);
});

test('ODG button and topic links follow the live limit', () => {
  const { context, elements } = viewer(true);
  const link = {
    dataset: { slideLink: 'future' },
    setAttribute(name, value) { this[name] = value; },
  };
  context.scenes[2].id = 'future';
  context.document.querySelectorAll = () => [link];
  context.go(0, 0);
  assert.equal(link['aria-disabled'], 'true');
  let menus = 0;
  context.menu = () => { menus++; };
  elements['#lv-m'].onclick();
  assert.equal(menus, 1);
  context.odgIdx = () => 2;
  context.go(0, 0);
  assert.equal(elements['#lv-m'].disabled, true);
  elements['#lv-m'].onclick();
  assert.equal(menus, 1);
  context.go(1, 0);
});

test('unchanged live updates do not replay the current slide animation', () => {
  const { context, navigations, streams } = viewer(true);
  context.cur = { i: context.si };
  const before = navigations.length;
  const update = pos => streams.put({ data: JSON.stringify({ path: '/', data: { pos, max: pos } }) });
  update(1001);
  update(1001);
  context.go(1, 1);
  assert.equal(navigations.length, before);
  assert.equal(context.si, 1);
  assert.equal(context.sk, 1);
  update(1002);
  assert.equal(navigations.length, before + 1);
  assert.equal(context.sk, 2);
});

test('rotated swipe follows the vertical screen axis', () => {
  const { context, elements, listeners } = viewer(true);
  elements['#lv-r'].onclick();
  context.go(1, 1);
  const touch = (name, x, y) => listeners[name]({
    target: {}, preventDefault() {}, stopImmediatePropagation() {},
    touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }],
  });
  touch('touchstart', 200, 300);
  touch('touchend', 50, 400);
  assert.equal(context.sk, 0);
  touch('touchstart', 200, 300);
  touch('touchend', 350, 200);
  assert.equal(context.sk, 1);
});
