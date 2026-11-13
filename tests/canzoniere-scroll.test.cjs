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

function harness(onEnd = async () => false) {
  const score = new EventTarget();
  const button = new EventTarget();
  const correction = new EventTarget();
  correction.value = "100";
  const speedLabel = new EventTarget();
  const status = new EventTarget();
  const scrollCalls = [];
  const lines = [0, 100].map((top) => ({
    getBoundingClientRect: () => ({ top: top - score.scrollTop }),
  }));
  score.getBoundingClientRect = () => ({ top: 0 });
  score.querySelectorAll = () => lines;
  score.scrollTo = (options) => {
    score.scrollTop = options.top;
    scrollCalls.push(options);
  };
  const timeouts = new Map();
  const intervals = new Map();
  let nextId = 0;
  const window = {
    CANZONIERE_MODEL: M,
    matchMedia: () => ({ matches: true }),
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
  };
  const source = fs.readFileSync(require.resolve("../assets/js/canzoniere-scroll.js"), "utf8");
  vm.runInNewContext(source, { window, Set, Object, console });
  const player = window.CANZONIERE_SCROLL.createScrollPlayer({
    score,
    button,
    correction,
    speedLabel,
    status,
    getSong: () => ({ bpm: 120, meter: "4/4", barsPerLine: 2 }),
    onEnd,
  });
  return { button, correction, intervals, player, score, scrollCalls, speedLabel, status, timeouts };
}

test("autoscroll counts down three seconds, follows BPM timing, and stops at the last line", async () => {
  const app = harness();
  app.button.listeners.get("click")();
  assert.equal(app.button.getAttribute("aria-pressed"), "true");
  assert.equal(app.status.textContent, "Partenza tra 3 secondi.");
  assert.equal(app.intervals.size, 1);
  const countdown = app.intervals.values().next().value;
  countdown.callback();
  countdown.callback();
  countdown.callback();
  assert.equal(app.status.textContent, "Scorrimento attivo.");
  assert.equal(app.speedLabel.textContent, "Una riga ogni 4.0 s");
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
});

test("manual touch pauses countdown and the correction slider updates the interval", () => {
  const app = harness();
  app.button.listeners.get("click")();
  app.score.listeners.get("pointerdown")({ type: "pointerdown" });
  assert.equal(app.status.textContent, "Pausa al tocco o allo scorrimento manuale.");
  assert.equal(app.button.getAttribute("aria-pressed"), "false");
  app.correction.value = "150";
  app.correction.listeners.get("input")();
  assert.equal(app.speedLabel.textContent, "Una riga ogni 6.0 s");
});
