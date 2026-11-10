const assert = require("node:assert/strict");
const { test } = require("node:test");
const M = require("../assets/js/activities-model.js");

test("euro input uses exact cents and rejects negative, fractional or non-finite amounts", () => {
  for (const [input, expected] of [["0", 0], ["0,10", 10], ["10.25", 1025], ["123.4", 12340], ["1000000", 100000000]])
    assert.equal(M.cents(input), expected);
  for (const input of ["", "-1", "1.001", "1,002", "NaN", "Infinity", "1e2", "1000000.01", "12 34"])
    assert.throws(() => M.cents(input), Error, input);
});

test("the activity fee applies to everyone, keeping advances and excess payments separate from others' debts", () => {
  assert.deepEqual(M.totals({ feeCents: 1025, attendance: [
    { due: true, paidCents: 500 }, { due: true, paidCents: 1500 }, { due: false, paidCents: 100 },
    { due: true, paidCents: 0 }, { due: false, paidCents: 0 },
  ] }), { expected: 5125, paid: 2100, remaining: 3500, excess: 475 });
  assert.deepEqual(M.totals({ feeCents: 0, attendance: [{ due: true, paidCents: 250 }] }),
    { expected: 0, paid: 250, remaining: 0, excess: 250 });
});

test("material totals normalize names, use the maximum for reused items and the sum otherwise", () => {
  const result = M.materialSummary([
    { title: "Gioco 1", materials: [{ title: "  Cerchi ", quantity: 6, unit: "pezzi" }] },
    { title: "Gioco 2", materials: [{ title: "CERCHI", quantity: 4, unit: "PEZZI" }] },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Cerchi");
  assert.equal(result[0].quantity, 6);
  assert.deepEqual(result[0].details.map(detail => detail.moment), ["Gioco 1", "Gioco 2"]);

  const notReused = M.materialSummary([
    { title: "Gioco 1", materials: [{ title: "Cerchi", quantity: 6, unit: "pezzi" }] },
    { title: "Gioco 2", materials: [{ title: "cerchi", quantity: 4, unit: "pezzi" }] },
  ], [{ title: "CERCHI", unit: "PEZZI", reused: false }]);
  assert.equal(notReused[0].quantity, 10);
});

test("material totals stay undefined when a moment quantity is missing", () => {
  const result = M.materialSummary([
    { title: "Gioco 1", materials: [{ title: "Corde" }] },
    { title: "Gioco 2", materials: [{ title: " corde ", quantity: 3 }] },
  ]);
  assert.equal(result[0].quantity, null);
  assert.deepEqual(result[0].details.map(detail => detail.quantity), [null, 3]);
});

test("live program uses Rome time, includes the last camp day and switches at exact start times", () => {
  const event = { id: 1, date: "2027-01-02", endDate: "2027-01-05", program: [
    { date: "2027-01-04", time: "22:00", title: "Veglia di ieri" },
    { date: "2027-01-05", time: "12:00", title: "Pranzo" },
    { date: "2027-01-05", time: "08:00", title: "Lancio" },
    { date: "2027-01-05", title: "Riordino senza orario" },
  ] };
  const before = M.liveProgram(event, new Date("2027-01-05T06:59:00Z"));
  assert.equal(before.active, true);
  assert.equal(before.current, null);
  assert.equal(before.next.title, "Lancio");
  assert.equal(before.unscheduled.length, 1);
  const during = M.liveProgram(event, new Date("2027-01-05T07:00:00Z"));
  assert.equal(during.time, "08:00");
  assert.equal(during.current.title, "Lancio");
  assert.equal(during.next.title, "Pranzo");
  const last = M.liveProgram(event, new Date("2027-01-05T11:00:00Z"));
  assert.equal(last.current.title, "Pranzo");
  assert.equal(last.next, null);
  const after = M.liveProgram(event, new Date("2027-01-05T23:00:00Z"));
  assert.equal(after.active, false);
  assert.equal(after.current, null);
  assert.equal(after.next, null);
  assert.equal(M.clock(new Date("2027-07-05T08:00:00Z")).time, "10:00", "summer time");
});

test("agenda excludes expired events and prioritizes ongoing camps over future meetings", () => {
  const now = new Date("2027-01-05T09:00:00Z");
  const events = [
    { id: 1, date: "2027-01-01" },
    { id: 2, date: "2027-01-06" },
    { id: 3, date: "2027-01-02", endDate: "2027-01-05" },
  ];
  assert.equal(M.nextEvent(events, now).id, 3);
  assert.equal(M.nextEvent(events, new Date("2027-01-06T09:00:00Z")).id, 2);
  assert.equal(M.nextEvent(events, new Date("2027-01-07T09:00:00Z")), null);
  const untimed = M.liveProgram({ date: "2027-01-05", program: [
    { date: "2027-01-04", time: "08:00", title: "Ieri" }, { date: "2027-01-05", title: "Senza orario" },
  ] }, now);
  assert.equal(untimed.current, null);
  assert.equal(untimed.next, null);
  assert.equal(untimed.unscheduled.length, 1);
});

test("several activities today prioritize the most recently started program, not the first record", () => {
  const events = [
    { id: 1, date: "2027-01-05", program: [{ date: "2027-01-05", time: "09:00", title: "Mattina" }] },
    { id: 2, date: "2027-01-05", program: [{ date: "2027-01-05", time: "14:00", title: "Pomeriggio" }] },
    { id: 3, date: "2027-01-05", program: [] },
  ];
  assert.equal(M.nextEvent(events, new Date("2027-01-05T07:00:00Z")).id, 1, "nearest start before the day begins");
  assert.equal(M.nextEvent(events, new Date("2027-01-05T09:00:00Z")).id, 1);
  assert.equal(M.nextEvent(events, new Date("2027-01-05T13:00:00Z")).id, 2, "switch at the afternoon start");
});
