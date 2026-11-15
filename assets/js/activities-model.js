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
      const fee = event.feeCents || 0;
      const present = Object.hasOwn(person, 'status') ? person.status === 'presente' : person.due === true;
      const expected = present ? fee : 0;
      const paid = present ? person.paidCents || 0 : 0;
      result.expected += expected;
      result.paid += paid;
      result.remaining += Math.max(0, expected - paid);
      result.excess += Math.max(0, paid - expected);
      return result;
    }, { expected: 0, paid: 0, remaining: 0, excess: 0, advance: 0 });
  }
  function materialSummary(program = [], materials = [], shopping = []) {
    const groups = new Map();
    const keyOf = item => `${String(item?.title || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it')}\u0000${String(item?.unit || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it')}`;
    const programItems = program.flatMap(moment => Array.isArray(moment.materials) ? moment.materials : []);
    const add = (item, moment = 'Attività', legacyNote = false) => {
      const title = String(item?.title || '').trim().replace(/\s+/g, ' ');
      if (!title) return;
      const unit = String(item?.unit || '').trim().replace(/\s+/g, ' ');
      const key = `${title.toLocaleLowerCase('it')}\u0000${unit.toLocaleLowerCase('it')}`;
      if (!groups.has(key)) groups.set(key, {
        key, title, unit, reused: item.reused !== false, done: !!item.done,
        shopping: !!item.shopping, details: [],
      });
      const group = groups.get(key);
      if (item.reused === false) group.reused = false;
      group.done ||= !!item.done;
      group.shopping ||= !!item.shopping;
      const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity >= 0
        ? item.quantity : null;
      group.details.push({ moment, quantity, unit, ...(legacyNote ? { note: String(item.note || '') } : {}) });
    };
    for (const item of materials) {
      const optionOnly = item.quantity === undefined && programItems.some(material => keyOf(material) === keyOf(item));
      if (!optionOnly) add(item, item.moment || 'Attività', !!item.note);
    }
    for (const item of shopping) add({
      ...item, shopping: true,
      note: item.note || (typeof item.quantity === 'string' ? item.quantity : ''),
    }, item.moment || 'Spesa', !!item.note || typeof item.quantity === 'string');
    for (const moment of program) {
      if (Array.isArray(moment.materials))
        for (const item of moment.materials) add(item, moment.title || 'Momento');
      else if (typeof moment.materials === 'string' && moment.materials.trim())
        add({ title: moment.materials.trim(), note: moment.materials }, moment.title || 'Momento', true);
      if (typeof moment.materialNote === 'string' && moment.materialNote.trim() &&
          moment.materialNote !== moment.materials)
        add({ title: moment.materialNote.trim(), note: moment.materialNote }, moment.title || 'Momento', true);
    }
    for (const item of materials) {
      const group = groups.get(keyOf(item));
      if (!group) continue;
      group.done = !!item.done;
      if (typeof item.shopping === 'boolean') group.shopping = item.shopping;
      if (typeof item.reused === 'boolean') group.reused = item.reused;
    }
    return [...groups.values()].map(group => {
      const quantities = group.details.map(item => item.quantity).filter(value => value !== null);
      return { ...group, quantity: quantities.length && quantities.length === group.details.length
        ? group.reused ? Math.max(...quantities) : quantities.reduce((sum, value) => sum + value, 0)
        : null };
    }).sort((a, b) => a.title.localeCompare(b.title, 'it'));
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
    const inDateRange = event.date <= local.date && (event.endDate || event.date) >= local.date;
    const finished = event.kind === 'riunione' && event.date === local.date &&
      event.endTime && local.time >= event.endTime;
    const active = inDateRange && !finished;
    const moments = (event.program || []).filter(item => item.date && item.time)
      .slice().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const timedMoments = moments.map((item, index) => {
      const next = moments[index + 1];
      const endDate = next?.date || (event.kind === 'riunione' && item.date === event.date ? event.date : '');
      const endTime = next?.time || (event.kind === 'riunione' && item.date === event.date ? event.endTime || '' : '');
      return { ...item, endDate, endTime };
    });
    const todayMoments = timedMoments.filter(item => item.date === local.date);
    const current = active ? todayMoments.filter(item => item.time <= local.time &&
      (!item.endDate || item.endDate > local.date ||
        item.endDate === local.date && (!item.endTime || local.time < item.endTime))).at(-1) || null : null;
    const next = active ? todayMoments.find(item => item.time > local.time) || null : null;
    return { ...local, active, finished: !!finished, current, next,
      unscheduled: active ? (event.program || []).filter(item => item.date === local.date && !item.time) : [] };
  }
  function nextEvent(events, now = new Date()) {
    const today = clock(now).date;
    return events.filter(event => event.date && (event.endDate || event.date) >= today &&
      !liveProgram(event, now).finished)
      .slice().sort((a, b) => {
        const activeOrder = Number(liveProgram(b, now).active) - Number(liveProgram(a, now).active);
        if (activeOrder) return activeOrder;
        if (a.date <= today && (a.endDate || a.date) >= today) {
          const first = liveProgram(a, now), second = liveProgram(b, now);
          const currentOrder = Number(!!second.current) - Number(!!first.current) ||
            (second.current?.time || '').localeCompare(first.current?.time || '');
          if (currentOrder) return currentOrder;
          const firstNext = first.next?.time || first.current?.time || a.startTime || '24:00';
          const secondNext = second.next?.time || second.current?.time || b.startTime || '24:00';
          const nextOrder = firstNext.localeCompare(secondNext);
          if (nextOrder) return nextOrder;
        }
        return a.date.localeCompare(b.date) || a.id - b.id;
      })[0] || null;
  }
  const model = { maxCents, money, cents, totals, materialSummary, clock, liveProgram, nextEvent };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.ACTIVITIES_MODEL = model;
})(typeof window !== 'undefined' ? window : globalThis);
