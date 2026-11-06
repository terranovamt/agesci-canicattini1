const assert = require('node:assert/strict');
const { test } = require('node:test');
const M = require('../assets/js/calendar-model.js');
const sources = require('../calendars/sources.json');
const event = { id: 'one', calendar: 'eg', title: 'Riunione', location: '', allDay: false,
  start: '2027-03-27T23:30:00Z', end: '2027-03-28T01:30:00Z' };

test('five public sources map to the requested names and colors with no holiday calendar', () => {
  assert.deepEqual(sources.map(source => [source.name, source.color]), [
    ['Gruppo Canicattini 1', 'sky'], ['Branca E/G', 'green'], ['Branca L/C', 'yellow'],
    ['Branca R/S', 'red'], ['Zona Aretusea', 'violet']
  ]);
  assert.match(sources[1].feed, /4801ea6d.*\/public\/basic\.ics$/);
  assert.match(sources[2].feed, /92f7e68e/);
  assert.match(sources[3].feed, /5b317e01/);
  assert.match(sources[4].feed, /70048520/);
  assert.ok(sources.every(source => !source.feed.includes('holiday') && !source.feed.includes('/private-')));
});

test('calendar days use Rome time across daylight saving and exclusive event ends', () => {
  assert.equal(M.onDay(event, '2027-03-28'), true);
  assert.equal(M.onDay(event, '2027-03-27'), false);
  const midnight = { ...event, start: '2027-06-01T18:00:00Z', end: '2027-06-01T22:00:00Z' };
  assert.equal(M.onDay(midnight, '2027-06-01'), true);
  assert.equal(M.onDay(midnight, '2027-06-02'), false);
  const allDay = { ...event, allDay: true, start: '2027-06-01', end: '2027-06-03' };
  assert.equal(M.onDay(allDay, '2027-06-02'), true);
  assert.equal(M.onDay(allDay, '2027-06-03'), false);
  assert.equal(M.upcoming([allDay], new Date('2027-06-02T18:00:00Z')).length, 1);
  assert.equal(M.upcoming([allDay], new Date('2027-06-03T08:00:00Z')).length, 0);
});

test('upcoming list includes ongoing events but not finished events', () => {
  assert.equal(M.upcoming([event], new Date('2027-03-28T00:00:00Z')).length, 1);
  assert.equal(M.upcoming([event], new Date('2027-03-28T02:00:00Z')).length, 0);
});

test('bad snapshots fail explicitly instead of rendering an empty success state', () => {
  assert.throws(() => M.validate({}), /non validi/);
  const data = { generatedAt: '2027-01-01T00:00:00Z', rangeStart: '2026-01-01T00:00:00Z',
    rangeEnd: '2028-01-01T00:00:00Z', calendars: sources.map(source => ({ ...source, status: 'ok' })), events: [event] };
  assert.equal(M.validate(data), data);
  assert.throws(() => M.validate({ ...data, events: [{ ...event, calendar: 'unknown' }] }), /non valido/);
  assert.throws(() => M.validate({ ...data, events: [{ ...event, end: 'invalid' }] }), /non valido/);
});

test('assembly notice is limited to a fresh group event strictly within 30 days', () => {
  const now = new Date('2027-06-01T10:00:00Z');
  const assembly = { ...event, calendar: 'gruppo', title: 'Assemblea di Gruppo',
    start: '2027-06-20T18:00:00Z', end: '2027-06-20T20:00:00Z' };
  const data = { generatedAt: now.toISOString(), calendars: [{ id: 'gruppo', status: 'ok' }], events: [assembly] };
  assert.equal(M.nextAssembly(data, now).event, assembly);
  for (const start of ['2027-06-01T09:00:00Z', '2027-07-01T10:00:00Z', '2027-07-02T10:00:00Z']) {
    assert.equal(M.nextAssembly({ ...data, events: [{ ...assembly, start }] }, now), null);
  }
  assert.ok(M.nextAssembly({ ...data, events: [{ ...assembly, start: '2027-07-01T09:59:59Z' }] }, now));
  assert.equal(M.nextAssembly({ ...data, events: [{ ...assembly, calendar: 'zona' }] }, now), null);
  assert.equal(M.nextAssembly({ ...data, events: [{ ...assembly, title: 'Riunione' }] }, now), null);
  assert.equal(M.nextAssembly({ ...data, calendars: [{ id: 'gruppo', status: 'error' }] }, now), null);
  assert.equal(M.nextAssembly({ ...data, generatedAt: '2027-05-30T00:00:00Z' }, now), null);
  assert.ok(M.nextAssembly({ ...data, events: [{ ...assembly, allDay: true, start: '2027-06-01', end: '2027-06-02' }] }, now));
});

test('preparatory documents open 15 Rome calendar days before the assembly and close when it ends', () => {
  const assembly = { ...event, calendar: 'gruppo', title: 'Assemblea di gruppo',
    start: '2027-06-20T18:30:00Z', end: '2027-06-20T21:00:00Z' };
  const data = { generatedAt: '2020-01-01T00:00:00Z', calendars: [{ id: 'gruppo', status: 'error' }], events: [assembly] };
  assert.equal(M.PREPARATORY_DAYS, 15);
  assert.equal(M.preparatoryAssembly(data, new Date('2027-06-04T21:59:59Z')), null);
  assert.equal(M.preparatoryAssembly(data, new Date('2027-06-04T22:00:00Z')).remaining, 15);
  assert.equal(M.preparatoryAssembly(data, new Date('2027-06-20T20:59:59Z')).remaining, 0);
  assert.equal(M.preparatoryAssembly(data, new Date('2027-06-20T21:00:00Z')), null);
  const now = new Date('2027-06-10T10:00:00Z');
  assert.equal(M.preparatoryAssembly({ ...data, events: [{ ...assembly, calendar: 'zona' }] }, now), null);
  assert.equal(M.preparatoryAssembly({ ...data, events: [{ ...assembly, title: 'Riunione capi' }] }, now), null);
  assert.equal(M.preparatoryAssembly({ ...data, events: [{ ...assembly, title: 'Preparazione assemblea' }] }, now), null);
  const allDay = { ...assembly, allDay: true, start: '2027-06-20', end: '2027-06-21' };
  assert.equal(M.preparatoryAssembly({ ...data, events: [allDay] }, new Date('2027-06-20T21:59:59Z')).remaining, 0);
  assert.equal(M.preparatoryAssembly({ ...data, events: [allDay] }, new Date('2027-06-20T22:00:00Z')), null);
  const later = { ...assembly, start: '2027-06-25T18:30:00Z', end: '2027-06-25T21:00:00Z' };
  assert.equal(M.preparatoryAssembly({ ...data, events: [later, assembly] }, now).event, assembly);
  assert.equal(M.calendarDaysUntil(assembly, new Date('2027-06-18T21:59:59Z')), 2);
  assert.equal(M.calendarDaysUntil(assembly, new Date('2027-06-18T22:00:00Z')), 1);
});
