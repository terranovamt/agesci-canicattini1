(function () {
  const dateKey = date => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  function onDay(event, day) {
    if (event.allDay) return event.start <= day && event.end > day;
    const first = dateKey(new Date(event.start));
    const end = new Date(event.end);
    const last = dateKey(new Date(Math.max(new Date(event.start).getTime(), end.getTime() - 1)));
    return first <= day && day <= last;
  }
  function upcoming(events, now) {
    const today = dateKey(now);
    return events.filter(event => event.allDay ? event.end > today
      : new Date(event.end) > now || new Date(event.start) >= now)
      .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'it'));
  }
  function validate(data) {
    if (!Array.isArray(data?.calendars) || !Array.isArray(data.events)
      || !Number.isFinite(Date.parse(data.generatedAt)) || !Number.isFinite(Date.parse(data.rangeStart))
      || !Number.isFinite(Date.parse(data.rangeEnd)) || Date.parse(data.rangeEnd) <= Date.parse(data.rangeStart)) {
      throw new Error('Dati del calendario non validi');
    }
    const ids = new Set();
    data.calendars.forEach(calendar => {
      if (!calendar || typeof calendar.id !== 'string' || ids.has(calendar.id) || typeof calendar.name !== 'string'
        || !['sky', 'green', 'yellow', 'red', 'violet'].includes(calendar.color)
        || !['ok', 'error'].includes(calendar.status)) throw new Error('Elenco calendari non valido');
      ids.add(calendar.id);
    });
    data.events.forEach(event => {
      if (!event || !ids.has(event.calendar) || typeof event.title !== 'string' || typeof event.location !== 'string'
        || typeof event.allDay !== 'boolean' || !Number.isFinite(Date.parse(event.start))
        || !Number.isFinite(Date.parse(event.end)) || Date.parse(event.end) < Date.parse(event.start)
        || (event.allDay && (!/^\d{4}-\d{2}-\d{2}$/.test(event.start) || !/^\d{4}-\d{2}-\d{2}$/.test(event.end)))) {
        throw new Error('Evento del calendario non valido');
      }
    });
    return data;
  }
  const isAssembly = event => event.calendar === 'gruppo' && /\bassemblea\b/i.test(event.title);
  const calendarDaysUntil = (event, now) =>
    (Date.parse(event.allDay ? event.start : dateKey(new Date(event.start))) - Date.parse(dateKey(now))) / 86400000;
  function nextAssembly(data, now) {
    const group = data.calendars.find(calendar => calendar.id === 'gruppo');
    if (group?.status !== 'ok' || now - new Date(data.generatedAt) > 3 * 60 * 60 * 1000) return null;
    const day = 86400000;
    return data.events.filter(isAssembly)
      .map(event => {
        const remaining = event.allDay
          ? (Date.parse(event.start) - Date.parse(dateKey(now))) / day
          : (Date.parse(event.start) - now.getTime()) / day;
        return { event, remaining };
      }).filter(item => item.remaining >= 0 && item.remaining < 30)
      .sort((a, b) => a.remaining - b.remaining)[0] || null;
  }
  const PREPARATORY_DAYS = 15;
  // Open from 15 calendar days (Europe/Rome) before the assembly until it ends.
  function preparatoryAssembly(data, now) {
    const today = dateKey(now);
    return data.events.filter(event => isAssembly(event) && /\bassemblea\s+di\s+gruppo\b/i.test(event.title)
      && (event.allDay ? event.end > today : new Date(event.end) > now))
      .map(event => ({ event, remaining: calendarDaysUntil(event, now) }))
      .filter(item => item.remaining <= PREPARATORY_DAYS)
      .sort((a, b) => a.remaining - b.remaining)[0] || null;
  }
  const model = { dateKey, onDay, upcoming, validate, nextAssembly, calendarDaysUntil, preparatoryAssembly, PREPARATORY_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else window.CALENDAR_MODEL = model;
})();
