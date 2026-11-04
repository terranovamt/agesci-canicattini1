(function () {
  const calendars = [
    { id: '92f7e68e280fb41aefbf65c2d02e8ed0f51d7b33c331e0fdba746d7892ffa586@group.calendar.google.com', color: '#176B46' },
    { id: '5b317e0106e0517891d95fa2b1fa3007d4a577db103764e2ac396f083fe68c04@group.calendar.google.com', color: '#A64B00' },
    { id: '700485200aca9eeaf5b28d44a59e4969ad9a2683af866b4de32e7454a141c05c@group.calendar.google.com', color: '#B02A1F' }
  ];
  const frame = document.getElementById('calendar-view');
  const open = document.getElementById('calendar-open');
  const outlook = frame.getAttribute('src');
  const buttons = document.querySelectorAll('[data-calendar]');
  buttons.forEach(button => {
    const calendar = calendars[Number(button.dataset.calendar)];
    if (calendar) {
      button.title = calendar.id;
      button.setAttribute('aria-label', 'Calendario Google ' + calendar.id);
    }
    button.onclick = () => {
      const selected = button.dataset.calendar;
      let url = outlook, title = 'Gruppo Canicattini 1';
      if (selected !== 'outlook') {
        const entries = selected === 'google' ? calendars : [calendars[Number(selected)]];
        const google = new URL('https://calendar.google.com/calendar/embed');
        google.searchParams.set('ctz', 'Europe/Rome');
        google.searchParams.set('hl', 'it');
        google.searchParams.set('mode', 'MONTH');
        google.searchParams.set('wkst', '2');
        google.searchParams.set('showPrint', '0');
        google.searchParams.set('showCalendars', '0');
        entries.forEach(entry => {
          google.searchParams.append('src', entry.id);
          google.searchParams.append('color', entry.color);
        });
        url = google.href;
        title = selected === 'google' ? 'Tre calendari Google' : entries[0].id;
      }
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.getElementById('calendar-view-title').textContent = title;
      document.getElementById('calendar-help').textContent = selected === 'outlook'
        ? 'Il calendario deve essere pubblico con i dettagli visibili. Se non appare, aprilo in una nuova scheda.'
        : 'Calendari Google senza festività italiane. Per vederli senza accesso devono essere pubblici; altrimenti serve un account autorizzato. Se la vista è bloccata, aprila in una nuova scheda.';
      frame.title = title;
      if (frame.getAttribute('src') !== url) frame.src = url;
      open.href = url;
    };
  });
})();
