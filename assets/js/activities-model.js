(function (root) {
  'use strict';
  const maxCents = 100000000;
  const money = cents => (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  function cents(value) {
    const text = String(value).trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Indica un importo positivo o zero, con massimo due decimali.');
    const [whole, fraction = ''] = text.split('.');
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(amount) || amount > maxCents) throw new Error('Importo troppo grande.');
    return amount;
  }
  function totals(event) {
    return event.attendance.reduce((result, person) => {
      const expected = person.due ? event.feeCents || 0 : 0;
      const paid = person.paidCents || 0;
      result.expected += expected;
      result.paid += paid;
      result.remaining += Math.max(0, expected - paid);
      result.excess += Math.max(0, paid - expected);
      return result;
    }, { expected: 0, paid: 0, remaining: 0, excess: 0 });
  }
  function clock(now = new Date()) {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
  }
  function liveProgram(event, now = new Date()) {
    const local = clock(now);
    const active = event.date <= local.date && (event.endDate || event.date) >= local.date;
    const moments = (event.program || []).filter(item => item.date === local.date && item.time)
      .slice().sort((a, b) => a.time.localeCompare(b.time));
    const current = active ? moments.filter(item => item.time <= local.time).at(-1) || null : null;
    const next = active ? moments.find(item => item.time > local.time) || null : null;
    return { ...local, active, current, next,
      unscheduled: active ? (event.program || []).filter(item => item.date === local.date && !item.time) : [] };
  }
  function nextEvent(events, now = new Date()) {
    const today = clock(now).date;
    return events.filter(event => event.date && (event.endDate || event.date) >= today)
      .slice().sort((a, b) => {
        const activeOrder = Number(b.date <= today) - Number(a.date <= today);
        if (activeOrder) return activeOrder;
        if (a.date <= today) {
          const first = liveProgram(a, now), second = liveProgram(b, now);
          const currentOrder = Number(!!second.current) - Number(!!first.current) ||
            (second.current?.time || '').localeCompare(first.current?.time || '');
          if (currentOrder) return currentOrder;
          const nextOrder = (first.next?.time || '24:00').localeCompare(second.next?.time || '24:00');
          if (nextOrder) return nextOrder;
        }
        return a.date.localeCompare(b.date) || a.id - b.id;
      })[0] || null;
  }
  const model = { maxCents, money, cents, totals, clock, liveProgram, nextEvent };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.ACTIVITIES_MODEL = model;
})(typeof window !== 'undefined' ? window : globalThis);
