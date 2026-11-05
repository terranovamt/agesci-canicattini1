const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function animations() {
  const source = fs.readFileSync(path.join(__dirname, '../area-riservata/assemblea/core/base.js'), 'utf8');
  const timers = new Map();
  let id = 0, now = 0;
  const context = {
    INST: false,
    setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout(key) { timers.delete(key); },
  };
  vm.runInNewContext(source.slice(source.indexOf('function pieTransition('), source.indexOf('function donut(')), context);
  return {
    context,
    advance(ms) {
      now += ms;
      for (const [key, timer] of timers) {
        if (timer.at <= now) { timers.delete(key); timer.fn(); }
      }
    },
  };
}

function timing(transition) {
  const match = transition.match(/^stroke-dasharray ([\d.e+-]+)s linear ([\d.e+-]+)s$/);
  assert.ok(match, transition);
  return { duration: Number(match[1]), delay: Number(match[2]) };
}

test('pie slices shrink sequentially, then the deficit grows', () => {
  const { context } = animations();
  const intervals = [[0, 30], [30, 60], [60, 100], [-1e9, 0]];
  const times = intervals.map(([start, end]) => {
    const el = { style: {} };
    context.pieTransition(100, -20, start, end, el);
    return timing(el.style.transition);
  });
  assert.equal(times[2].delay, 0);
  for (const [a, b] of [[2, 1], [1, 0], [0, 3]]) {
    assert.ok(Math.abs(times[a].delay + times[a].duration - times[b].delay) < 1e-9);
  }
  assert.ok(Math.abs(times[3].delay + times[3].duration - 1.2) < 1e-9);
});

test('pie restoration follows the reverse order and instant mode has no delay', () => {
  const { context } = animations();
  const a = { style: {} }, b = { style: {} };
  context.pieTransition(20, 100, 0, 30, a);
  context.pieTransition(20, 100, 30, 100, b);
  const first = timing(a.style.transition), second = timing(b.style.transition);
  assert.equal(first.delay, 0);
  assert.ok(Math.abs(first.duration - second.delay) < 1e-9);
  context.pieTransition(100, 100, 0, 30, a);
  assert.equal(a.style.transition, 'none');
  context.INST = true;
  context.pieTransition(100, 0, 0, 30, a);
  assert.equal(a.style.transition, 'none');
});

test('receipt reveals stamp after total, then percentage card; reversing cancels pending reveals', () => {
  const { context, advance } = animations();
  let stamp = false, panel = false;
  const reveal = context.receiptReveal(on => { stamp = on; }, on => { panel = on; });
  reveal(true);
  assert.equal(stamp, false);
  assert.equal(panel, false);
  advance(999);
  assert.equal(stamp, false);
  advance(1);
  assert.equal(stamp, true);
  assert.equal(panel, false);
  advance(500);
  assert.equal(panel, true);
  reveal(true);
  advance(500);
  reveal(false);
  advance(2000);
  assert.equal(stamp, false);
  assert.equal(panel, false);
  context.INST = true;
  reveal(true);
  assert.equal(stamp, true);
  assert.equal(panel, true);
});
