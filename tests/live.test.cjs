const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '../docs/Assemblea-di-Gruppo');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'common', 'live.js'), 'utf8');

function role(search) {
  const context = {
    window: {}, location: { search }, URLSearchParams,
    localStorage: { getItem: () => 'old-key' },
  };
  vm.runInNewContext(config, context);
  return context.window.LIVE;
}

test('only an explicit, nonempty regia parameter selects the presenter', () => {
  for (const search of ['', '?regia=', '?foo=bar']) {
    assert.equal(role(search).ruolo, 'pubblico');
    assert.equal(role(search).chiave, null);
  }
  assert.equal(role('?regia=test-key').ruolo, 'regia');
  assert.equal(role('?regia=test-key').chiave, 'test-key');
});

function viewer(isMobile) {
  const elements = {};
  const listeners = {};
  const streams = {};
  const writes = [];
  const rotations = [];
  const navigations = [];
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
    setInterval() {}, setTimeout() {},
    fetch: async (url, options) => {
      if (options) writes.push(options);
      return { json: async () => ({ pos: 1001, max: 2000 }) };
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
  return { context, elements, listeners, writes, rotations, navigations, streams };
}

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
