const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const M = require("../assets/js/canzoniere-model.js");

class EventTarget {
  constructor() {
    this.listeners = new Map();
    this.attributes = {};
    this.textContent = "";
    this.value = "";
    this.scrollTop = 0;
  }
  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
}

function harness(onEnd = async () => false, reducedMotion = true, scrollFractions = [1, 1]) {
  const score = new EventTarget();
  const button = new EventTarget();
  const speedControl = new EventTarget();
  speedControl.value = "100";
  const reducedMotionControl = new EventTarget();
  reducedMotionControl.checked = reducedMotion;
  const speedLabel = new EventTarget();
  const status = new EventTarget();
  const scrollCalls = [];
  const lines = scrollFractions.map((scrollFraction, index) => ({
    dataset: { scrollFraction: String(scrollFraction) },
    getBoundingClientRect: () => ({ top: index * 100 - score.scrollTop }),
  }));
  score.getBoundingClientRect = () => ({ top: 0 });
  score.querySelectorAll = () => lines;
  score.scrollTo = (options) => {
    score.scrollTop = options.top;
    scrollCalls.push(options);
  };
  const timeouts = new Map();
  const intervals = new Map();
  const frames = new Map();
  let nextId = 0;
  const window = {
    CANZONIERE_MODEL: M,
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: (callback, delay) => {
      const id = ++nextId;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (callback, delay) => {
      const id = ++nextId;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    requestAnimationFrame: (callback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const source = fs.readFileSync(require.resolve("../assets/js/canzoniere-scroll.js"), "utf8");
  vm.runInNewContext(source, { window, Set, Object, console });
  const player = window.CANZONIERE_SCROLL.createScrollPlayer({
    score,
    button,
    speedControl,
    speedLabel,
    status,
    reducedMotionControl,
    getSong: () => ({ bpm: 120, meter: "4/4", barsPerLine: 2 }),
    onEnd,
  });
  return {
    button, frames, intervals, player, score, scrollCalls, speedControl, speedLabel, status,
    reducedMotionControl, timeouts,
  };
}

test("autoscroll counts down three seconds, follows BPM timing, and stops at the last line", async () => {
  const app = harness();
  app.button.listeners.get("click")();
  assert.equal(app.button.getAttribute("aria-pressed"), "true");
  assert.equal(app.button.getAttribute("aria-label"), "Metti in pausa lo scorrimento automatico");
  assert.equal(app.status.textContent, "Partenza tra 3 secondi.");
  assert.equal(app.intervals.size, 1);
  const countdown = app.intervals.values().next().value;
  countdown.callback();
  countdown.callback();
  countdown.callback();
  assert.equal(app.status.textContent, "Scorrimento attivo.");
  assert.equal(app.speedLabel.textContent, "Una riga musicale ogni 4.0 s");
  assert.equal(app.timeouts.values().next().value.delay, 4000);

  const firstLine = app.timeouts.entries().next().value;
  app.timeouts.delete(firstLine[0]);
  await firstLine[1].callback();
  assert.equal(app.scrollCalls[0].top, 92);
  assert.equal(app.scrollCalls[0].behavior, "auto");
  const secondLine = app.timeouts.entries().next().value;
  app.timeouts.delete(secondLine[0]);
  await secondLine[1].callback();
  assert.equal(app.status.textContent, "Fine della canzone.");
  assert.equal(app.button.getAttribute("aria-pressed"), "false");
  assert.equal(app.button.getAttribute("aria-label"), "Avvia lo scorrimento automatico");
});

test("wrapped visual rows share the BPM duration of their musical line", async () => {
  const app = harness(undefined, true, [0.5, 0.5, 1, 1]);
  app.button.listeners.get("click")();
  const countdown = app.intervals.values().next().value;
  countdown.callback();
  countdown.callback();
  countdown.callback();

  const advanceOneRow = async () => {
    const [id, timeout] = app.timeouts.entries().next().value;
    app.timeouts.delete(id);
    await timeout.callback();
  };

  assert.equal(app.timeouts.values().next().value.delay, 2000);
  await advanceOneRow();
  assert.equal(app.timeouts.values().next().value.delay, 2000);
  await advanceOneRow();
  assert.equal(app.timeouts.values().next().value.delay, 4000);
});

test("autoscroll moves gradually over each line interval", () => {
  const app = harness(undefined, false);
  app.button.listeners.get("click")();
  const countdown = app.intervals.values().next().value;
  countdown.callback();
  countdown.callback();
  countdown.callback();
  const frame = (timestamp) => {
    const [id, callback] = app.frames.entries().next().value;
    app.frames.delete(id);
    callback(timestamp);
  };

  frame(0);
  frame(2000);
  assert.equal(app.score.scrollTop, 46);
  frame(4000);
  assert.equal(app.score.scrollTop, 92);
  assert.equal(app.frames.size, 0);
  assert.equal(app.timeouts.values().next().value.delay, 4000);
});

test("reduced-motion control can switch to fluid scrolling during playback", () => {
  const app = harness(undefined, true);
  app.button.listeners.get("click")();
  const countdown = app.intervals.values().next().value;
  countdown.callback();
  countdown.callback();
  countdown.callback();
  assert.equal(app.timeouts.size, 1);

  app.reducedMotionControl.checked = false;
  app.reducedMotionControl.listeners.get("change")();

  assert.equal(app.timeouts.size, 0);
  assert.equal(app.frames.size, 1);
  app.player.pause();
});

test("changing motion mode while a playlist advance is loading cannot advance twice", async () => {
  let releaseEnd;
  let endCalls = 0;
  const pendingEnd = new Promise((resolve) => {
    releaseEnd = resolve;
  });
  const app = harness(() => {
    endCalls++;
    return pendingEnd;
  });
  app.button.listeners.get("click")();
  const countdown = app.intervals.values().next().value;
  countdown.callback();
  countdown.callback();
  countdown.callback();

  const [lineId, lineTimeout] = app.timeouts.entries().next().value;
  app.timeouts.delete(lineId);
  lineTimeout.callback();
  const [endId, endTimeout] = app.timeouts.entries().next().value;
  app.timeouts.delete(endId);
  const firstAdvance = endTimeout.callback();
  await Promise.resolve();
  assert.equal(endCalls, 1);

  app.reducedMotionControl.checked = false;
  app.reducedMotionControl.listeners.get("change")();
  const retry = app.timeouts.entries().next().value;
  if (retry) {
    app.timeouts.delete(retry[0]);
    retry[1].callback();
    await Promise.resolve();
  }
  assert.equal(app.timeouts.size, 0);
  assert.equal(endCalls, 1);

  releaseEnd(false);
  await firstAdvance;
});

test("pausing and restarting while a playlist advance is loading does not schedule another advance", async () => {
  let releaseEnd;
  let endCalls = 0;
  const pendingEnd = new Promise((resolve) => {
    releaseEnd = resolve;
  });
  const app = harness(() => {
    endCalls++;
    return pendingEnd;
  });
  app.button.listeners.get("click")();
  const countdown = app.intervals.values().next().value;
  countdown.callback();
  countdown.callback();
  countdown.callback();

  const advanceOneRow = () => {
    const [id, timeout] = app.timeouts.entries().next().value;
    app.timeouts.delete(id);
    return timeout.callback();
  };
  advanceOneRow();
  advanceOneRow();
  await Promise.resolve();
  assert.equal(endCalls, 1);

  app.button.listeners.get("click")();
  app.button.listeners.get("click")();
  const restartCountdown = app.intervals.values().next().value;
  restartCountdown.callback();
  restartCountdown.callback();
  restartCountdown.callback();
  assert.equal(app.timeouts.size, 0);

  releaseEnd(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(endCalls, 1);
  assert.equal(app.status.textContent, "La prossima canzone inizia tra 3 secondi.");
  assert.equal(app.intervals.size, 1);
});

test("manual touch pauses countdown and the correction slider updates the interval", () => {
  const app = harness();
  app.button.listeners.get("click")();
  app.score.listeners.get("pointerdown")({ type: "pointerdown" });
  assert.equal(app.status.textContent, "Pausa al tocco o allo scorrimento manuale.");
  assert.equal(app.button.getAttribute("aria-pressed"), "false");
  app.speedControl.value = "150";
  app.speedControl.listeners.get("input")();
  assert.equal(app.speedLabel.textContent, "Una riga musicale ogni 2.7 s");
});
