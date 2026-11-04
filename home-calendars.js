(function () {
  const $ = id => document.getElementById(id);
  const M = window.CALENDAR_MODEL;
  const now = new Date();
  let data, selected = new Set(), chosenDay = null;
  let month = new Date(M.dateKey(now).slice(0, 7) + '-01T12:00:00Z');
  const format = (date, options) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', ...options }).format(date);
  const element = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const filtered = () => data.events.filter(event => selected.has(event.calendar));
  const stale = () => Date.now() - Date.parse(data.generatedAt) > 3 * 60 * 60 * 1000;
  function warning(visible) {
    $('calendar-info-warning').hidden = !visible;
    $('calendar-info').querySelector('summary').setAttribute('aria-label',
      visible ? 'Informazioni calendari: dati non aggiornati o non disponibili' : 'Informazioni e stato dei calendari');
  }
  function renderAssembly() {
    const banner = $('stato');
    if (!banner) return;
    const upcoming = M.nextAssembly(data, new Date());
    banner.hidden = !upcoming;
    banner.textContent = '';
    if (upcoming) {
      const { event, remaining } = upcoming;
      const date = event.allDay ? new Date(event.start + 'T12:00:00Z') : new Date(event.start);
      const days = Math.ceil(remaining);
      banner.textContent = event.title + ' · ' + format(date, { day: 'numeric', month: 'long', year: 'numeric' })
        + (M.dateKey(date) === M.dateKey(new Date()) ? ' · Oggi' : ' · Tra ' + days + (days === 1 ? ' giorno' : ' giorni'));
    }
  }
  function renderStatus() {
    const messages = data.calendars.filter(calendar => calendar.status !== 'ok').map(calendar =>
      calendar.name + ': sincronizzazione non riuscita.' + (calendar.lastSuccess
        ? ' Ultimi dati disponibili del ' + format(new Date(calendar.lastSuccess), { dateStyle: 'short', timeStyle: 'short' }) + '.'
        : ' Nessun evento ancora scaricato.'));
    if (stale()) messages.push('Aggiornamento in ritardo: gli eventi potrebbero essere cambiati.');
    messages.push('Ultimo tentativo: ' + format(new Date(data.generatedAt), { dateStyle: 'short', timeStyle: 'short' }) + '. Orari Europe/Rome.');
    messages.push('Periodo sincronizzato: ' + format(new Date(data.rangeStart), { dateStyle: 'short' }) + ' – '
      + format(new Date(data.rangeEnd), { dateStyle: 'short' }) + ' (fine esclusa).');
    $('calendar-status').textContent = messages.join(' ');
    $('calendar-retry').hidden = !data.calendars.some(calendar => calendar.status !== 'ok');
    warning(stale() || data.calendars.some(calendar => calendar.status !== 'ok'));
  }
  function renderList() {
    const list = $('calendar-agenda');
    list.replaceChildren();
    $('calendar-agenda-title').textContent = chosenDay
      ? format(new Date(chosenDay + 'T12:00:00Z'), { weekday: 'long', day: 'numeric', month: 'long' })
      : 'Prossimi appuntamenti';
    $('calendar-upcoming').hidden = !chosenDay;
    const events = chosenDay ? filtered().filter(event => M.onDay(event, chosenDay))
      : M.upcoming(filtered(), new Date()).slice(0, 12);
    if (!events.length) {
      const failed = data.calendars.some(calendar => selected.has(calendar.id) && calendar.status !== 'ok');
      list.append(element('p', !selected.size ? 'Seleziona almeno un calendario.'
        : failed ? 'Eventi non disponibili. Dettagli in ⓘ.'
          : chosenDay ? 'Nessun appuntamento in questo giorno.' : 'Nessun prossimo appuntamento nel periodo sincronizzato.'));
    }
    events.forEach(event => {
      const calendar = data.calendars.find(item => item.id === event.calendar);
      const card = element('article', undefined, 'agenda-event calendar-' + calendar.color);
      const badge = element('span', calendar.name, 'event-source');
      const time = element('time');
      time.dateTime = event.start;
      if (event.allDay) {
        const final = new Date(event.end + 'T12:00:00Z');
        final.setUTCDate(final.getUTCDate() - 1);
        time.textContent = format(new Date(event.start + 'T12:00:00Z'), { day: 'numeric', month: 'long' })
          + (M.dateKey(final) !== event.start ? ' – ' + format(final, { day: 'numeric', month: 'long' }) : '') + ' · Tutto il giorno';
      } else {
        time.textContent = format(new Date(event.start), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          + ' – ' + format(new Date(event.end), M.dateKey(new Date(event.start)) === M.dateKey(new Date(event.end))
            ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      }
      card.append(badge, element('h4', event.title), time);
      if (event.location) card.append(element('p', event.location));
      list.append(card);
    });
  }
  function renderMonth(focusDay) {
    $('calendar-month').textContent = format(month, { month: 'long', year: 'numeric' });
    const grid = $('calendar-days');
    grid.replaceChildren();
    const year = month.getUTCFullYear(), index = month.getUTCMonth();
    const first = new Date(Date.UTC(year, index, 1, 12));
    const offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const events = filtered();
    for (let i = 0; i < offset; i++) grid.append(element('span', '', 'calendar-spacer'));
    for (let day = 1; day <= days; day++) {
      const date = new Date(Date.UTC(year, index, day, 12));
      const key = M.dateKey(date);
      const matches = events.filter(event => M.onDay(event, key));
      const button = element('button', undefined, 'calendar-day');
      button.type = 'button';
      button.dataset.day = key;
      button.append(element('span', String(day)));
      const markers = element('span', undefined, 'day-markers');
      new Set(matches.map(event => event.calendar)).forEach(id => {
        const calendar = data.calendars.find(item => item.id === id);
        const dot = element('i', undefined, 'day-marker calendar-' + calendar.color);
        dot.setAttribute('aria-hidden', 'true');
        markers.append(dot);
      });
      button.append(markers);
      button.setAttribute('aria-label', format(date, { dateStyle: 'full' }) + ': ' + matches.length + ' appuntamenti');
      button.setAttribute('aria-pressed', String(chosenDay === key));
      if (key === M.dateKey(new Date())) button.setAttribute('aria-current', 'date');
      button.onclick = () => { chosenDay = key; renderMonth(key); renderList() };
      grid.append(button);
    }
    const rangeStart = M.dateKey(new Date(data.rangeStart)).slice(0, 7);
    const rangeEnd = M.dateKey(new Date(data.rangeEnd)).slice(0, 7);
    $('calendar-prev').disabled = M.dateKey(month).slice(0, 7) <= rangeStart;
    const following = new Date(Date.UTC(year, index + 1, 1, 12));
    $('calendar-next').disabled = M.dateKey(following).slice(0, 7) >= rangeEnd;
    if (focusDay) grid.querySelector('[data-day="' + focusDay + '"]')?.focus();
  }
  function refresh() {
    renderMonth(); renderList();
    $('calendar-selection').textContent = selected.size + ' calendari selezionati su ' + data.calendars.length + '.';
  }
  function renderFilters() {
    $('calendar-filters').replaceChildren();
    $('calendar-links').replaceChildren();
    data.calendars.forEach(calendar => {
      const unavailable = calendar.status !== 'ok' || stale();
      const label = element('label', undefined, 'calendar-filter calendar-' + calendar.color + (unavailable ? ' is-unavailable' : ''));
      const input = document.createElement('input');
      input.type = 'checkbox'; input.checked = selected.has(calendar.id);
      input.setAttribute('aria-label', calendar.name + (unavailable ? ' · dati non aggiornati o non disponibili' : ''));
      label.title = calendar.name + (unavailable ? ' · dati non aggiornati o non disponibili' : '');
      input.onchange = () => {
        if (input.checked) selected.add(calendar.id); else selected.delete(calendar.id);
        refresh();
      };
      const shortNames = { gruppo: 'Canicattini 1', eg: 'E/G', lc: 'L/C', rs: 'R/S', zona: 'Zona' };
      label.append(input, element('span', shortNames[calendar.id] || calendar.name, 'calendar-filter-name'));
      if (unavailable) {
        const mark = element('span', '!', 'calendar-filter-warning');
        mark.setAttribute('aria-hidden', 'true');
        label.append(mark);
      }
      $('calendar-filters').append(label);
      const li = element('li');
      const link = element('a', 'Apri ' + calendar.name + ' ↗');
      if (typeof calendar.url !== 'string' || !/^https:\/\/(calendar\.google\.com|outlook\.office365\.com)\//.test(calendar.url)) {
        throw new Error('Collegamento calendario non valido');
      }
      link.href = calendar.url; link.target = '_blank'; link.rel = 'noopener';
      li.append(link); $('calendar-links').append(li);
    });
  }
  async function load() {
    $('calendar-all').disabled = true;
    $('calendar-retry').hidden = true;
    $('calendar-status').textContent = 'Caricamento degli appuntamenti…';
    $('calendar-app').hidden = true;
    try {
      const response = await fetch('calendars/events.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Calendari non disponibili (HTTP ' + response.status + ')');
      data = M.validate(await response.json());
      selected = new Set(data.calendars.map(calendar => calendar.id));
      renderFilters(); renderStatus(); refresh(); renderAssembly();
      $('calendar-app').hidden = false;
      $('calendar-all').disabled = false;
    } catch (error) {
      $('calendar-status').textContent = error.message + '. Riprova oppure usa il calendario Outlook.';
      $('calendar-retry').hidden = false;
      warning(true);
      if ($('stato')) { $('stato').hidden = true; $('stato').textContent = '' }
      console.error('Caricamento calendari', error);
    }
  }
  $('calendar-retry').onclick = load;
  $('calendar-all').onclick = () => { selected = new Set(data.calendars.map(calendar => calendar.id)); renderFilters(); refresh() };
  $('calendar-prev').onclick = () => { month.setUTCMonth(month.getUTCMonth() - 1); chosenDay = null; refresh() };
  $('calendar-next').onclick = () => { month.setUTCMonth(month.getUTCMonth() + 1); chosenDay = null; refresh() };
  $('calendar-today').onclick = () => {
    month = new Date(M.dateKey(new Date()).slice(0, 7) + '-01T12:00:00Z'); chosenDay = null; refresh();
  };
  $('calendar-upcoming').onclick = () => { chosenDay = null; refresh() };
  load();
})();
