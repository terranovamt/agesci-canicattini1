(function () {
  const stato = document.getElementById('stato');
  window.ASSEMBLEA.osserva(s => {
    if (s?.attiva) location.replace('Assemblea-di-Gruppo/index.html' + location.search + location.hash);
    else if (stato) stato.textContent = 'Assemblea non in corso. Consulta gli eventi e i documenti del gruppo.';
  }, e => {
    if (stato) stato.textContent = e.message + '. Riprovo automaticamente; l’area riservata resta disponibile.';
    console.error(e);
  });

  const title = document.getElementById('calendar-month');
  const grid = document.getElementById('calendar-days');
  const list = document.getElementById('event-list');
  const calendarStatus = document.getElementById('calendar-status');
  if (!title || !grid || !list || !calendarStatus) return;

  const calendarUrl = 'https://outlook.office365.com/owa/calendar/0d573ac91db14040adc5ae0838ff79b5@sicilia.agesci.it/378e146548034028aac391df52b2307d9166140046071851244/calendar.ics';
  const today = new Date();
  const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const selected = dateKey(today);
  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let events = [];

  function parseDate(value, params = '') {
    if (/^\d{8}$/.test(value)) {
      return { date: new Date(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8)), allDay: true };
    }
    const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second = '0', utc] = match;
    const date = utc
      ? new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second))
      : new Date(+year, +month - 1, +day, +hour, +minute, +second);
    return { date, allDay: /(?:^|;)VALUE=DATE(?:;|$)/i.test(params) };
  }

  function decodeText(value) {
    return value.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1').trim();
  }

  function parseEvents(ics) {
    const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const result = [];
    let current = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { current = {}; continue }
      if (line === 'END:VEVENT') {
        if (current?.start && current.title) result.push(current);
        current = null;
        continue;
      }
      if (!current) continue;
      const colon = line.indexOf(':');
      if (colon < 1) continue;
      const descriptor = line.slice(0, colon).split(';');
      const name = descriptor.shift().toUpperCase();
      const params = descriptor.join(';');
      const value = line.slice(colon + 1);
      if (name === 'DTSTART') current.start = parseDate(value, params);
      else if (name === 'SUMMARY') current.title = decodeText(value);
      else if (name === 'DESCRIPTION') current.description = decodeText(value);
      else if (name === 'URL') current.url = value.trim();
      else if (name === 'RRULE') current.rule = Object.fromEntries(value.split(';').map(part => part.split('=')));
    }
    return result.flatMap(event => expandEvent(event, today));
  }

  function expandEvent(event, from) {
    const start = event.start.date;
    const rule = event.rule;
    if (!rule?.FREQ) return start >= new Date(from.getFullYear(), from.getMonth(), from.getDate()) ? [event] : [];
    const until = rule.UNTIL ? parseDate(rule.UNTIL)?.date : null;
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    const count = Math.max(0, Number(rule.COUNT) || Infinity);
    const byDay = (rule.BYDAY || '').split(',').map(day => ({ SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 })[day.slice(-2)]).filter(Number.isInteger);
    const end = new Date(from.getFullYear(), from.getMonth() + 6, 1);
    const results = [];
    let generated = 0;
    for (let date = new Date(start); date <= end && (!until || date <= until) && generated < count; date.setDate(date.getDate() + 1)) {
      const ordinal = value => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000;
      const days = ordinal(date) - ordinal(start);
      const weeks = Math.floor(days / 7);
      const months = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
      const years = date.getFullYear() - start.getFullYear();
      let matches = false;
      if (rule.FREQ === 'DAILY') matches = days % interval === 0;
      else if (rule.FREQ === 'WEEKLY') matches = weeks % interval === 0 && (byDay.length ? byDay.includes(date.getDay()) : date.getDay() === start.getDay());
      else if (rule.FREQ === 'MONTHLY') matches = months % interval === 0 && date.getDate() === start.getDate();
      else if (rule.FREQ === 'YEARLY') matches = years % interval === 0 && date.getMonth() === start.getMonth() && date.getDate() === start.getDate();
      if (!matches) continue;
      generated++;
      if (date >= new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
        results.push({ ...event, start: { ...event.start, date: new Date(date) } });
      }
    }
    return results;
  }

  function formatDate(date, options) {
    return new Intl.DateTimeFormat('it-IT', options).format(date);
  }

  function renderEvents(day) {
    list.replaceChildren();
    const sameDay = day && events.filter(event => dateKey(event.start.date) === day);
    const upcoming = events.filter(event => dateKey(event.start.date) >= selected).slice(0, 3);
    const shown = sameDay?.length ? sameDay : day === selected ? upcoming : [];
    if (!shown.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-events';
      empty.textContent = day === selected && upcoming.length
        ? 'Nessun evento oggi. Ecco i prossimi appuntamenti.'
        : 'Nessun evento in questa data.';
      list.append(empty);
      return;
    }
    shown.forEach(event => {
      const article = document.createElement('article');
      article.className = 'event-item';
      const time = document.createElement('time');
      time.dateTime = event.start.date.toISOString();
      time.textContent = formatDate(event.start.date, event.start.allDay
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      let eventUrl = '';
      if (event.url) {
        try {
          const parsed = new URL(event.url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') eventUrl = parsed.href;
          else console.warn('Link evento ignorato: è consentito solo HTTP o HTTPS.');
        } catch (error) {
          console.warn('Link evento non valido, viene mostrato solo il titolo.', error);
        }
      }
      const heading = document.createElement(eventUrl ? 'a' : 'h3');
      heading.textContent = event.title;
      if (eventUrl) { heading.href = eventUrl; heading.target = '_blank'; heading.rel = 'noopener' }
      article.append(time, heading);
      if (event.description) {
        const description = document.createElement('p');
        description.textContent = event.description;
        article.append(description);
      }
      list.append(article);
    });
  }

  function renderCalendar(day = selected) {
    title.textContent = formatDate(visibleMonth, { month: 'long', year: 'numeric' });
    grid.replaceChildren();
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const cells = Math.ceil((offset + count) / 7) * 7;
    const eventDays = new Set(events.map(event => dateKey(event.start.date)));
    for (let cell = 0; cell < cells; cell++) {
      const dayNumber = cell - offset + 1;
      if (dayNumber < 1 || dayNumber > count) {
        const blank = document.createElement('span');
        blank.setAttribute('aria-hidden', 'true');
        grid.append(blank);
        continue;
      }
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), dayNumber);
      const key = dateKey(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(dayNumber);
      button.setAttribute('aria-label', formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) + (eventDays.has(key) ? ', con eventi' : ''));
      button.setAttribute('aria-pressed', String(key === day));
      button.className = [
        key === selected ? 'today' : '',
        key === day ? 'selected' : '',
        eventDays.has(key) ? 'has-event' : ''
      ].filter(Boolean).join(' ');
      button.onclick = () => { renderCalendar(key); renderEvents(key) };
      grid.append(button);
    }
  }

  document.getElementById('calendar-prev').onclick = () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    renderCalendar();
  };
  document.getElementById('calendar-next').onclick = () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  };

  renderCalendar();
  renderEvents(selected);
  fetch(calendarUrl, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Calendario non disponibile (' + response.status + ')');
      return response.text();
    })
    .then(contents => {
      events = parseEvents(contents).sort((a, b) => a.start.date - b.start.date);
      calendarStatus.textContent = events.length
        ? 'Calendario aggiornato.'
        : 'Nessun appuntamento trovato nel calendario.';
      renderCalendar();
      renderEvents(selected);
    })
    .catch(error => {
      calendarStatus.textContent = 'Non riesco a caricare la vista del calendario: apri o aggiungi il calendario completo qui sotto.';
      console.warn('Impossibile caricare il calendario eventi', error);
    });
})();
