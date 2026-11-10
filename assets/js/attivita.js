(function () {
  'use strict';
  const $ = id => document.getElementById(id), A = window.ACCESSO, M = window.SOCI_MODEL,
    AM = window.ACTIVITIES_MODEL, TM = window.TOURNAMENT_MODEL;
  const eventForm = $('event-form'), pathForm = $('path-form');
  const kinds = { 'L/C': ['riunione', 'caccia'], 'E/G': ['riunione', 'uscita'], 'R/S': ['riunione', 'route'] };
  const pathLabels = { hunt: 'Stagione di caccia', specialty: 'Specialità', badge: 'Brevetto' };
  const tournamentFields = [
    ['loyalty', 'Lealtà'], ['balooRules', 'Regole di Baloo'], ['huntNotebook', 'Quaderno di caccia'],
    ['style', 'Stile e comportamento'], ['eye', 'Occhio'],
  ];
  let data, editingEvent, editingPath, busy = false, originalForm = '', previousStartDate = '';
  let programIndex = 0, checklistIndex = 0;
  const branch = () => $('activities-branch').value;
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function options(select, values) {
    select.replaceChildren(...values.map(([value, label]) => {
      const option = node('option', label); option.value = value; return option;
    }));
  }
  function state(path) {
    if (path.closed) return 'Conclusa';
    const count = path.steps.filter(step => step.done).length;
    return !count ? 'Definito' : count === path.steps.length ? 'Conquistato' : 'In lavorazione';
  }
  function button(label, action) {
    const element = node('button', label, 'button button-secondary');
    element.type = 'button'; element.onclick = action; return element;
  }
  function roster() { return data.members.filter(member => member.branch === branch()); }
  function memberLink(person) {
    const link = node('a', person.name);
    link.href = 'soci.html?member=' + person.personId;
    return link;
  }
  function dateLabel(date) {
    return new Date(date + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function dateRange(item) {
    return item.endDate && item.endDate !== item.date
      ? dateLabel(item.date) + ' – ' + dateLabel(item.endDate) : dateLabel(item.date);
  }
  function totals(target, event) {
    const sums = AM.totals(event);
    target.replaceChildren(...[
      ['Totale atteso', sums.expected], ['Incassato', sums.paid],
      ['Da ricevere', sums.remaining], ...(sums.excess ? [['Versato in più / da verificare', sums.excess]] : []),
    ].map(([label, amount]) => {
      const item = node('p', label + ': ');
      item.append(node('strong', AM.money(amount))); return item;
    }));
  }
  function render() {
    const lc = branch() === 'L/C', rs = branch() === 'R/S';
    $('paths-tab').hidden = rs;
    $('tournament-tab').hidden = !lc;
    $('new-winter-camp').hidden = branch() !== 'E/G';
    const activeTab = document.querySelector('[data-section-target="tournament-panel"]');
    if ((!lc && activeTab.getAttribute('aria-pressed') === 'true') ||
        (rs && document.querySelector('[data-section-target="paths-panel"]').getAttribute('aria-pressed') === 'true'))
      document.querySelector('[data-section-target="events-panel"]').click();
    $('paths-heading').textContent = lc ? 'Stagione di caccia e specialità' : 'Specialità e brevetti';
    $('paths-hint').textContent = lc
      ? 'Prima le prede: completa e concludi la stagione di caccia di ogni lupetto, poi avvia le specialità.'
      : 'Definito: nessuna tappa completata. In lavorazione: almeno una. Conquistato: tutte le tappe completate.';
    $('events-hint').textContent = 'Crea una ' + kinds[branch()].join(' o una ') + ', registra le presenze e prepara le cose da fare.';
    const query = $('activities-search').value.trim().toLocaleLowerCase('it');
    const matches = text => text.toLocaleLowerCase('it').includes(query);
    const events = data.events.filter(item => item.branch === branch() &&
      matches(item.title + ' ' + item.attendance.map(person => person.name).join(' ')));
    $('events-list').replaceChildren(...events.sort((a, b) => b.date.localeCompare(a.date)).map(item => {
      const card = node('article', undefined, 'activity-card');
      card.style.setProperty('--branch-color', M.branchColors[branch()]);
      card.append(node('p', item.kind + ' · ' + dateRange(item), 'eyebrow'), node('h3', item.title),
        node('p', `${item.attendance.filter(person => person.status === 'presente').length} presenti · ${item.attendance.filter(person => !person.status).length} da registrare`),
        node('p', `${item.tasks.filter(task => task.done).length}/${item.tasks.length} cose da fare completate`));
      if (item.program?.length) card.append(node('p', `${item.program.length} momenti in programma`));
      const needs = [...(item.materials || []), ...(item.shopping || [])].filter(part => !part.done).length;
      if (needs) card.append(node('p', `${needs} materiali o acquisti da preparare`));
      const participants = node('details', undefined, 'activity-participants');
      participants.open = true;
      participants.append(node('summary', 'Soci presenti'));
      const list = node('ul');
      const present = item.attendance.filter(person => person.status === 'presente');
      if (branch() !== 'R/S') {
        const groups = new Map();
        for (const person of present) {
          const unit = person.unit || (branch() === 'L/C' ? 'Senza sestiglia' : 'Senza squadriglia');
          if (!groups.has(unit)) groups.set(unit, []);
          groups.get(unit).push(person);
        }
        for (const [unit, people] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'it'))) {
          const label = node('li'); label.append(node('strong', unit)); list.append(label);
          for (const person of people) { const entry = node('li'); entry.append(memberLink(person)); list.append(entry); }
        }
      } else for (const person of present) {
        const entry = node('li'); entry.append(memberLink(person)); list.append(entry);
      }
      if (!list.children.length) participants.append(node('p', 'Nessuna presenza registrata.', 'members-note'));
      else participants.append(list);
      card.append(participants);
      if (item.feeCents || item.attendance.some(person => person.paidCents)) {
        card.append(node('p', 'Quota per socio: ' + AM.money(item.feeCents)));
        const summary = node('div', undefined, 'activity-totals'); totals(summary, item); card.append(summary);
      }
      card.append(button('Apri e prendi le presenze', () => openEvent(item, true)));
      return card;
    }));
    if (!events.length) $('events-list').append(node('p', 'Nessuna attività trovata. Crea il primo incontro di branca.', 'members-note'));
    const paths = data.paths.filter(item => item.branch === branch() && matches(item.title + ' ' + item.memberName));
    $('paths-counts').textContent = ['Definito', 'In lavorazione', 'Conquistato', 'Conclusa']
      .map(label => label + ': ' + paths.filter(item => state(item) === label).length).join(' · ');
    const filtered = paths.filter(item => !$('paths-state').value || state(item) === $('paths-state').value);
    $('paths-list').replaceChildren(...filtered.map(item => {
      const card = node('article', undefined, 'activity-card'), status = state(item);
      card.style.setProperty('--branch-color', M.branchColors[branch()]);
      const badge = node('span', status, 'activity-state'); badge.dataset.state = status;
      const progress = node('progress'); progress.max = item.steps.length || 1;
      progress.value = item.steps.filter(step => step.done).length;
      progress.setAttribute('aria-label', `${progress.value} di ${item.steps.length} ${item.kind === 'hunt' ? 'prede conquistate' : 'tappe completate'}`);
      card.append(node('p', pathLabels[item.kind], 'eyebrow'), node('h3', item.title),
        node('p', item.memberName), badge, progress,
        node('p', `${progress.value}/${item.steps.length} ${item.kind === 'hunt' ? 'prede conquistate' : 'tappe completate'}`),
        button('Gestisci percorso', () => openPath(item)));
      return card;
    }));
    if (!filtered.length) $('paths-list').append(node('p', 'Nessun percorso trovato. Aggiungi un percorso per un socio.', 'members-note'));
    $('new-path').disabled = !roster().length;
    renderTournament();
  }
  function snapshot(form) { return JSON.stringify([...new FormData(form)]); }
  function openDialog(id, form) {
    $(id).showModal(); originalForm = snapshot(form);
  }
  function closeDialog(dialog) {
    if (busy) return;
    if (snapshot(dialog.querySelector('form')) !== originalForm && !confirm('Chiudere senza salvare le modifiche?')) return;
    dialog.close();
  }
  for (const dialog of document.querySelectorAll('.activities-dialog')) {
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.querySelector('[data-close]').onclick = () => closeDialog(dialog);
  }
  window.addEventListener('beforeunload', event => {
    const dialog = document.querySelector('.activities-dialog[open]');
    if (dialog && snapshot(dialog.querySelector('form')) !== originalForm) { event.preventDefault(); event.returnValue = ''; }
  });
  let stepIndex = 0;
  function appendStep(container, item = { title: '', done: false }) {
    const row = node('div', undefined, 'activity-step'), index = ++stepIndex;
    const label = node('label', undefined, 'activities-check'), done = node('input');
    done.type = 'checkbox'; done.checked = item.done; done.name = 'done-' + index;
    done.setAttribute('aria-label', 'Completato: ' + (item.title || 'nuova tappa'));
    label.append(done);
    const title = node('textarea'); title.rows = 2; title.value = item.title; title.name = 'step-' + index;
    title.required = true; title.maxLength = 500; title.placeholder = 'Descrivi il passo da compiere';
    title.setAttribute('aria-label', container === $('event-tasks') ? 'Cosa da fare' : 'Tappa o preda');
    title.oninput = () => done.setAttribute('aria-label', 'Completato: ' + title.value);
    const remove = button('×', () => { row.remove(); closure(); });
    remove.setAttribute('aria-label', 'Rimuovi questo passo');
    done.onchange = closure;
    row.append(label, title, remove); container.append(row);
    return title;
  }
  const readSteps = container => [...container.children].map(row => ({
    title: row.querySelector('textarea').value,
    done: row.querySelector('input[type="checkbox"]').checked,
  }));
  function appendProgram(item = {}) {
    const row = node('fieldset', undefined, 'activity-program-item');
    const index = ++programIndex;
    const label = (name, control) => { const wrapper = node('label', name); wrapper.append(control); return wrapper; };
    const day = node('input'); day.type = 'date'; day.required = true; day.value = item.date || eventForm.elements.date.value;
    day.name = `program-date-${index}`;
    const time = node('input'); time.type = 'time'; time.value = item.time || '';
    time.name = `program-time-${index}`;
    const title = node('input'); title.type = 'text'; title.maxLength = 200; title.required = true; title.value = item.title || '';
    title.name = `program-title-${index}`;
    title.placeholder = 'es. Lancio o gioco uno';
    const place = node('input'); place.type = 'text'; place.maxLength = 200; place.value = item.place || '';
    place.name = `program-place-${index}`;
    place.placeholder = 'Luogo o punto di ritrovo';
    const description = node('textarea'); description.rows = 2; description.maxLength = 2000;
    description.name = `program-description-${index}`;
    description.value = item.description || ''; description.placeholder = 'Descrivi cosa fare';
    const materials = node('textarea'); materials.rows = 2; materials.maxLength = 1000;
    materials.name = `program-materials-${index}`;
    materials.value = item.materials || ''; materials.placeholder = 'Materiali per questo momento';
    const remove = button('Rimuovi momento', () => row.remove());
    row.append(label('Giorno', day), label('Ora', time), label('Momento', title),
      label('Luogo', place), label('Cosa si fa', description), label('Materiali', materials), remove);
    $('event-program').append(row);
  }
  function appendChecklist(container, item = {}, shopping = false) {
    const row = node('div', undefined, 'activity-checklist-row');
    const index = ++checklistIndex;
    row.dataset.shopping = String(shopping);
    const title = node('input'); title.type = 'text'; title.required = true; title.maxLength = 500;
    title.name = `checklist-title-${index}`;
    title.value = item.title || ''; title.placeholder = shopping ? 'es. Frutta per la colazione' : 'es. Kit pronto soccorso';
    const fields = [title];
    if (shopping) {
      const quantity = node('input'); quantity.type = 'text'; quantity.maxLength = 100;
      quantity.name = `checklist-quantity-${index}`;
      quantity.value = item.quantity || ''; quantity.placeholder = 'Quantità / note';
      fields.push(quantity);
    }
    const readyLabel = node('label', undefined, 'activities-check');
    const ready = node('input'); ready.type = 'checkbox'; ready.checked = !!item.done;
    ready.name = `checklist-ready-${index}`;
    ready.setAttribute('aria-label', shopping ? 'Acquisto fatto' : 'Materiale pronto');
    readyLabel.append(ready, shopping ? 'Comprato' : 'Pronto');
    const remove = button('×', () => row.remove()); remove.setAttribute('aria-label', 'Rimuovi voce');
    row.append(...fields, readyLabel, remove);
    container.append(row);
  }
  function readProgram() {
    return [...$('event-program').children].map(row => {
      const fields = row.querySelectorAll('input, textarea');
      return { date: fields[0].value, time: fields[1].value, title: fields[2].value,
        place: fields[3].value, description: fields[4].value, materials: fields[5].value };
    });
  }
  function readChecklist(container, shopping = false) {
    return [...container.children].map(row => {
      const fields = row.querySelectorAll('input');
      return { title: fields[0].value, ...(shopping ? { quantity: fields[1].value } : {}),
        done: fields[shopping ? 2 : 1].checked };
    });
  }
  function renderTournamentControls(persons, item) {
    const prior = new Map((item?.tournament?.members || []).map(person => [person.personId, person]));
    const groups = new Map();
    for (const person of persons) {
      const unit = person.unit || 'Senza sestiglia';
      if (!groups.has(unit)) groups.set(unit, []);
      groups.get(unit).push(person);
    }
    const presentationScores = new Map((item?.tournament?.presentations || []).map(value => [value.unit, value.score]));
    $('tournament-presentations').replaceChildren(...[...groups.keys()].sort((a, b) => a.localeCompare(b, 'it')).map(unit => {
      const row = node('div', undefined, 'activity-checklist-row tournament-presentation');
      row.dataset.unit = unit;
      row.append(node('strong', unit));
      const score = node('input'); score.type = 'number'; score.min = '0'; score.max = '5'; score.step = '1';
      score.name = 'presentation-' + unit;
      score.inputMode = 'numeric'; score.placeholder = '0–5'; score.dataset.presentation = '';
      score.setAttribute('aria-label', 'Presentazione ' + unit);
      if (presentationScores.has(unit) && presentationScores.get(unit) !== null)
        score.value = String(presentationScores.get(unit));
      row.append(score);
      return row;
    }));
    $('tournament-members').replaceChildren(...[...groups].flatMap(([unit, group]) => {
      const heading = node('h4', unit, 'activity-unit-heading');
      const records = group.map(person => {
        const row = node('section', undefined, 'activity-person tournament-person');
        row.dataset.personId = person.personId; row.dataset.unit = person.unit || '';
        const record = prior.get(person.personId) || {};
        const title = node('h4'); title.append(memberLink(person)); row.append(title);
        const controls = node('div', undefined, 'tournament-score-controls');
        const punctualLabel = node('label', 'Puntualità');
        const punctual = node('select'); punctual.dataset.tournamentField = 'punctuality';
        punctual.name = `tournament-punctuality-${person.personId}`;
        options(punctual, [['', 'Da valutare'], ['true', 'Puntuale'], ['false', 'In ritardo']]);
        if (typeof record.punctuality === 'boolean') punctual.value = String(record.punctuality);
        punctualLabel.append(punctual); controls.append(punctualLabel);
        for (const [key, labelText] of tournamentFields) {
          const label = node('label', labelText);
          const score = node('input'); score.type = 'number'; score.min = '0'; score.max = '5'; score.step = '1';
          score.name = `tournament-${key}-${person.personId}`;
          score.inputMode = 'numeric'; score.placeholder = '0–5'; score.dataset.tournamentField = key;
          score.value = Number.isInteger(record[key]) ? String(record[key]) : '';
          label.append(score); controls.append(label);
        }
        row.append(controls); return row;
      });
      return [heading, ...records];
    }));
    updateTournamentAvailability();
  }
  function updateTournamentAvailability() {
    for (const row of $('tournament-members').querySelectorAll('.tournament-person')) {
      const attendance = [...$('event-attendance').querySelectorAll('.activity-person')]
        .find(person => Number(person.dataset.personId) === Number(row.dataset.personId));
      const present = attendance?.querySelector('select').value === 'presente';
      row.classList.toggle('is-absent', !present);
      row.querySelectorAll('select, input').forEach(control => { control.disabled = !present; });
    }
  }
  function readTournament() {
    const memberRows = [...$('tournament-members').querySelectorAll('.tournament-person')];
    const members = memberRows.map(row => {
      const values = Object.fromEntries([...row.querySelectorAll('[data-tournament-field]')].map(control => {
        const key = control.dataset.tournamentField;
        return [key, key === 'punctuality' ? (control.value === '' ? null : control.value === 'true') :
          control.value === '' ? null : Number(control.value)];
      }));
      return { personId: Number(row.dataset.personId), unit: row.dataset.unit, ...values };
    });
    const presentations = [...$('tournament-presentations').querySelectorAll('[data-presentation]')].map(control => ({
      unit: control.closest('[data-unit]').dataset.unit, score: control.value === '' ? null : Number(control.value),
    }));
    return { members, presentations };
  }
  function renderTournament() {
    if (branch() !== 'L/C') return;
    const events = data.events.filter(item => item.branch === 'L/C' && item.kind === 'riunione')
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const rows = new Map();
    for (const event of events) {
      if (!event.tournament) continue;
      for (const score of TM.standings(event.tournament.members, event.attendance, event.tournament.presentations)) {
        if (!rows.has(score.unit)) rows.set(score.unit, {
          unit: score.unit, meetings: 0,
          values: Object.fromEntries([...TM.categories.map(item => [item.key, []]), ['total', []]]),
        });
        const total = rows.get(score.unit); total.meetings++;
        for (const item of TM.categories) if (score.values[item.key] !== null) total.values[item.key].push(score.values[item.key]);
        if (score.values.total !== null) total.values.total.push(score.values.total);
      }
    }
    const category = $('tournament-category').value || 'total';
    const label = key => key === 'total' ? 'Punteggio complessivo' : TM.categories.find(item => item.key === key)?.label || key;
    const scores = [...rows.values()].map(item => {
      const values = Object.fromEntries(Object.entries(item.values).map(([key, values]) =>
        [key, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null]));
      return { ...item, values };
    }).sort((a, b) => (b.values[category] ?? -1) - (a.values[category] ?? -1) || (b.values.total ?? -1) - (a.values.total ?? -1) || a.unit.localeCompare(b.unit, 'it'));
    const table = node('table', undefined, 'tournament-table');
    const head = node('thead'), header = node('tr');
    for (const value of ['#', 'Sestiglia', 'Riunioni', label(category), 'Totale']) header.append(node('th', value));
    head.append(header); const body = node('tbody');
    scores.forEach((item, index) => {
      const row = node('tr');
      row.append(node('td', String(index + 1)), node('th', item.unit), node('td', String(item.meetings)),
        node('td', item.values[category] === null ? '—' : item.values[category].toFixed(1) + '%'),
        node('td', item.values.total === null ? '—' : item.values.total.toFixed(1) + '%'));
      body.append(row);
    });
    table.append(head, body);
    $('tournament-rankings').replaceChildren(scores.length ? table : node('p', 'La classifica comparirà quando saranno salvati i primi punteggi.', 'members-note'));
    $('tournament-events').replaceChildren(...events.map(event => {
      const card = node('article', undefined, 'activity-card');
      card.style.setProperty('--branch-color', M.branchColors['L/C']);
      const hasScores = !!event.tournament && event.tournament.members.some(person =>
        person.punctuality !== null || tournamentFields.some(([key]) => person[key] !== null)) ||
        !!event.tournament?.presentations.some(item => item.score !== null);
      card.append(node('p', dateRange(event), 'eyebrow'), node('h4', event.title),
        node('p', hasScores ? 'Punteggi registrati' : 'Punteggi da inserire'),
        button('Registra i punteggi', () => openEvent(event, false, true)));
      return card;
    }));
    if (!events.length) $('tournament-events').append(node('p', 'Crea una riunione L/C per registrare i punteggi.', 'members-note'));
  }
  function readAttendance() {
    return [...$('event-attendance').querySelectorAll('.activity-person')].map(row => ({
      personId: Number(row.dataset.personId), status: row.querySelector('select').value,
      due: row.querySelector('[data-due]').checked,
      paidCents: AM.cents(row.querySelector('[data-paid]').value),
    }));
  }
  function updateAttendance() {
    let attendance, feeCents;
    try {
      feeCents = AM.cents(eventForm.elements.fee.value);
      attendance = readAttendance();
    } catch (error) {
      $('event-totals').textContent = error.message;
      return;
    }
    totals($('event-totals'), { feeCents, attendance });
    const query = $('event-member-search').value.trim().toLocaleLowerCase('it');
    const filter = $('event-member-filter').value;
    let visible = 0;
    [...$('event-attendance').querySelectorAll('.activity-person')].forEach((row, index) => {
      const person = attendance[index], expected = person.due ? feeCents : 0;
      const remaining = Math.max(0, expected - person.paidCents);
      row.querySelector('[data-balance]').textContent = 'Atteso: ' + AM.money(expected) +
        ' · Da ricevere: ' + AM.money(remaining) +
        (person.paidCents > expected ? ' · Versato in più: ' + AM.money(person.paidCents - expected) : '');
      row.hidden = !row.dataset.name.includes(query) ||
        (filter === 'presente' && person.status !== 'presente') ||
        (filter === 'unpaid' && !remaining) || (filter === 'paid' && !person.paidCents);
      if (!row.hidden) visible++;
    });
    $('event-attendance-count').textContent = `${visible}/${attendance.length} soci · ${attendance.filter(person => person.status === 'presente').length} presenti`;
    updateTournamentAvailability();
  }
  function renderLiveProgram() {
    const panel = $('event-live');
    panel.dataset.branch = branch();
    const live = editingEvent && AM.liveProgram(editingEvent);
    panel.hidden = !live?.active;
    if (!live?.active) return;
    $('event-live-clock').textContent = 'Oggi · ' + dateLabel(live.date) + ' · ' + live.time + ' · ora italiana';
    const content = $('event-live-moment'), moment = live.current || live.next;
    content.replaceChildren(node('h4', live.current ? `${moment.time} · ${moment.title}`
      : live.next ? `Si comincia alle ${moment.time} · ${moment.title}` : 'Nessun momento con orario per oggi'));
    if (moment) {
      if (moment.place) content.append(node('p', 'Dove: ' + moment.place));
      if (moment.description) content.append(node('p', moment.description));
      if (moment.materials) content.append(node('p', 'Materiali: ' + moment.materials));
    } else content.append(node('p', 'Completa il programma indicando giorno e ora: non viene ipotizzata un’attività in corso.'));
    if (live.current) content.append(node('p', live.next
      ? `A seguire · ${live.next.time} · ${live.next.title}` : 'Ultimo momento con orario previsto per oggi.'));
    for (const item of live.unscheduled) content.append(node('p', 'Oggi, senza orario · ' + item.title));
  }
  $('event-live-attendance').onclick = () => $('event-attendance').querySelector('select')?.focus();
  window.setInterval(() => { if ($('event-dialog').open) renderLiveProgram(); }, 30000);
  window.addEventListener('focus', () => { if ($('event-dialog').open) renderLiveProgram(); });
  function openEvent(item, focusAttendance = false, focusTournament = false, starter = '') {
    editingEvent = item || null; eventForm.reset(); $('event-error').textContent = '';
    $('event-heading').textContent = item ? item.title : 'Nuova attività';
    $('event-settings').open = !item;
    $('event-filters').open = window.innerWidth > 760;
    $('event-program-section').open = !item;
    programIndex = checklistIndex = 0;
    options(eventForm.elements.kind, kinds[branch()].map(value => [value, value[0].toUpperCase() + value.slice(1)]));
    const winterCamp = starter === 'winter-camp';
    eventForm.elements.kind.value = item?.kind || (winterCamp ? 'uscita' : 'riunione');
    eventForm.elements.kind.disabled = !!item?.tournament;
    eventForm.elements.title.value = item?.title || '';
    eventForm.elements.fee.value = ((item?.feeCents || 0) / 100).toFixed(2);
    $('event-member-search').value = $('event-member-filter').value = '';
    const today = new Date();
    const todayText = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    eventForm.elements.date.value = item?.date || (winterCamp ? '2027-01-02' : todayText);
    eventForm.elements.endDate.value = item?.endDate || item?.date || (winterCamp ? '2027-01-05' : todayText);
    previousStartDate = eventForm.elements.date.value;
    if (winterCamp) eventForm.elements.title.value = 'Campo invernale';
    const attendance = item?.attendance || [];
    const savedUnits = new Map((item?.tournament?.members || []).map(person => [person.personId, person.unit]));
    const person = entry => {
      const current = data.members.find(member => member.id === entry.personId);
      return { ...entry, unit: savedUnits.get(entry.personId) ?? entry.unit ?? current?.unit ?? '' };
    };
    const persons = [...attendance.map(person), ...roster().filter(member => !attendance.some(entry => entry.personId === member.id))
      .map(member => ({ personId: member.id, name: member.name, status: '', unit: member.unit }))];
    const grouped = branch() === 'R/S' ? [['', persons]] : [...persons.reduce((groups, person) => {
      const unit = person.unit || (branch() === 'L/C' ? 'Senza sestiglia' : 'Senza squadriglia');
      if (!groups.has(unit)) groups.set(unit, []);
      groups.get(unit).push(person);
      return groups;
    }, new Map()).entries()].sort(([a], [b]) => a.localeCompare(b, 'it'));
    $('event-attendance').replaceChildren(...grouped.flatMap(([unit, group]) => {
      const heading = unit ? node('h4', unit, 'activity-unit-heading') : null;
      const rows = group.map(person => {
      const row = node('section', undefined, 'activity-person');
      row.dataset.personId = person.personId; row.dataset.name = person.name.toLocaleLowerCase('it');
      row.dataset.unit = person.unit || '';
      const heading = node('h4'); heading.append(memberLink(person));
      const label = node('label', 'Presenza'), select = node('select');
      select.name = 'attendance-' + person.personId; select.dataset.personId = person.personId;
      options(select, [['', 'Da registrare'], ['presente', 'Presente'], ['assente', 'Assente'], ['giustificato', 'Giustificato']]);
      select.value = person.status; label.append(select);
      const dueLabel = node('label', undefined, 'activities-check'), due = node('input');
      due.type = 'checkbox'; due.name = 'due-' + person.personId; due.dataset.due = '';
      due.checked = person.due ?? person.status === 'presente';
      dueLabel.append(due, 'Quota dovuta');
      let manualDue = !!item;
      due.onchange = () => { manualDue = true; updateAttendance(); };
      select.onchange = () => {
        if (!manualDue) due.checked = select.value === 'presente';
        updateAttendance();
      };
      const paidLabel = node('label', 'Versato totale (€)'), paid = node('input');
      paid.type = 'number'; paid.name = 'paid-' + person.personId; paid.dataset.paid = '';
      paid.min = '0'; paid.max = String(AM.maxCents / 100); paid.step = '0.01'; paid.inputMode = 'decimal'; paid.required = true;
      paid.value = ((person.paidCents || 0) / 100).toFixed(2); paid.oninput = updateAttendance;
      paidLabel.append(paid);
      const controls = node('div', undefined, 'activity-person-controls');
      controls.append(label, dueLabel, paidLabel);
      const balance = node('p', undefined, 'members-note'); balance.dataset.balance = '';
      row.append(heading, controls, balance); return row;
      });
      return heading ? [heading, ...rows] : rows;
    }));
    if (!persons.length) $('event-attendance').append(node('p', 'Nessun socio disponibile: aggiungilo dal Libro soci.', 'members-note'));
    $('event-tasks').replaceChildren();
    for (const task of item?.tasks || []) appendStep($('event-tasks'), task);
    $('event-program').replaceChildren();
    for (const programItem of item?.program || []) appendProgram(programItem);
    $('event-materials').replaceChildren();
    for (const material of item?.materials || []) appendChecklist($('event-materials'), material);
    $('event-shopping').replaceChildren();
    for (const purchase of item?.shopping || []) appendChecklist($('event-shopping'), purchase, true);
    const tournamentEnabled = branch() === 'L/C' && eventForm.elements.kind.value === 'riunione';
    $('event-tournament').hidden = !tournamentEnabled;
    $('event-tournament').open = focusTournament;
    if (tournamentEnabled) renderTournamentControls(persons.map(person), item);
    updateAttendance();
    renderLiveProgram();
    openDialog('event-dialog', eventForm);
    if (item && AM.liveProgram(item).active && !focusAttendance && !focusTournament)
      queueMicrotask(() => { $('event-live').focus(); $('event-dialog').scrollTop = 0; });
    if (focusAttendance) queueMicrotask(() => $('event-attendance').querySelector('select')?.focus());
    if (focusTournament) queueMicrotask(() => $('tournament-presentations').querySelector('input')?.focus());
  }
  function guidance() {
    const kind = pathForm.elements.kind.value, hunt = kind === 'hunt';
    $('path-steps-title').textContent = hunt ? 'Prede scelte dal lupetto' : 'Tappe concordate con i capi';
    $('add-path-step').textContent = hunt ? '+ Aggiungi preda' : '+ Aggiungi tappa';
    $('path-closure').hidden = !hunt;
    const personId = Number(pathForm.elements.personId.value);
    $('path-guidance').textContent = hunt
      ? 'Conquista tutte le prede, poi segna esplicitamente la stagione come conclusa per passare alle specialità.'
      : branch() === 'L/C' && !data.paths.some(item => item.personId === personId && item.kind === 'hunt' && item.closed)
        ? 'Per avviare le specialità, questo lupetto deve prima concludere una stagione di caccia.'
        : 'Aggiungi le tappe e spuntale quando sono completate. Lo stato si aggiorna automaticamente.';
    const catalog = kind === 'badge' ? M.competencyBadges : kind === 'specialty' ? M.specialtyCatalogs[branch()] || [] : [];
    $('path-catalog').replaceChildren(...catalog.map(value => { const option = node('option'); option.value = value; return option; }));
    closure();
  }
  function closure() {
    const steps = readSteps($('path-steps')), closed = pathForm.elements.closed;
    const complete = steps.length > 0 && steps.every(step => step.done);
    closed.disabled = !complete && !closed.checked;
    closed.setCustomValidity(closed.checked && !complete ? 'Conquista tutte le prede o riapri la stagione togliendo la spunta.' : '');
  }
  function openPath(item) {
    editingPath = item || null; pathForm.reset(); $('path-error').textContent = '';
    $('path-heading').textContent = item ? 'Gestisci percorso' : 'Nuovo percorso';
    const types = branch() === 'L/C' ? ['hunt', 'specialty'] : ['specialty', 'badge'];
    options(pathForm.elements.kind, types.map(value => [value, pathLabels[value]]));
    pathForm.elements.kind.value = item?.kind || types[0];
    pathForm.elements.kind.disabled = !!item;
    const members = roster().map(member => [String(member.id), member.name]);
    if (item && !members.some(([id]) => id === String(item.personId))) members.push([String(item.personId), item.memberName + ' (branca precedente)']);
    options(pathForm.elements.personId, members);
    if (item) pathForm.elements.personId.value = String(item.personId);
    pathForm.elements.personId.disabled = !!item;
    pathForm.elements.title.value = item?.title || (branch() === 'L/C' ? 'Stagione di caccia ' + new Date().getFullYear() : '');
    $('path-steps').replaceChildren();
    for (const step of item?.steps || []) appendStep($('path-steps'), step);
    pathForm.elements.closed.checked = !!item?.closed;
    guidance(); openDialog('path-dialog', pathForm);
  }
  async function save(category, form, existing, payload, errorId, dialogId) {
    if (busy) return;
    busy = true; form.inert = true; form.setAttribute('aria-busy', 'true');
    $(errorId).textContent = 'Salvataggio in corso…';
    try {
      const saved = await A.request('activities/' + category + (existing ? '/' + existing.id : ''),
        existing ? 'PATCH' : 'POST', { ...payload, branch: branch(), ...(existing ? { revision: existing.revision } : {}) });
      data[category] = [saved, ...data[category].filter(item => item.id !== saved.id)];
      $(dialogId).close(); render();
      $('activities-status').textContent = 'Salvato.'; $('activities-status').dataset.tone = 'success';
    } catch (error) {
      $(errorId).textContent = error.message;
      if (!window.NAS?.user) {
        $(dialogId).close(); $('activities-app').hidden = true; $('activities-login').hidden = false;
        $('activities-status').textContent = error.message; data = null;
        $('events-list').replaceChildren(); $('paths-list').replaceChildren();
      }
    } finally { busy = false; form.inert = false; form.setAttribute('aria-busy', 'false'); }
  }
  eventForm.onsubmit = event => {
    event.preventDefault();
    let feeCents, attendance;
    try { feeCents = AM.cents(eventForm.elements.fee.value); attendance = readAttendance(); }
    catch (error) { $('event-error').textContent = error.message; return; }
    save('events', eventForm, editingEvent, {
      kind: eventForm.elements.kind.value, title: eventForm.elements.title.value, date: eventForm.elements.date.value,
      endDate: eventForm.elements.endDate.value, feeCents, attendance,
      tasks: readSteps($('event-tasks')),
      program: readProgram(), materials: readChecklist($('event-materials')),
      shopping: readChecklist($('event-shopping'), true),
      ...(branch() === 'L/C' && eventForm.elements.kind.value === 'riunione' ? { tournament: readTournament() } : {}),
    }, 'event-error', 'event-dialog');
  };
  pathForm.onsubmit = event => {
    event.preventDefault();
    save('paths', pathForm, editingPath, {
      kind: pathForm.elements.kind.value, personId: Number(pathForm.elements.personId.value),
      title: pathForm.elements.title.value, steps: readSteps($('path-steps')),
      closed: pathForm.elements.kind.value === 'hunt' && pathForm.elements.closed.checked,
    }, 'path-error', 'path-dialog');
  };
  $('new-event').onclick = () => openEvent();
  $('new-winter-camp').onclick = () => openEvent(null, false, false, 'winter-camp');
  $('new-path').onclick = () => openPath();
  $('add-event-task').onclick = () => appendStep($('event-tasks')).focus();
  $('add-program-item').onclick = () => {
    $('event-program-section').open = true; appendProgram(); $('event-program').lastElementChild.querySelector('input[type="text"]')?.focus();
  };
  $('add-event-material').onclick = () => appendChecklist($('event-materials'));
  $('add-event-shopping').onclick = () => appendChecklist($('event-shopping'), {}, true);
  $('add-path-step').onclick = () => { appendStep($('path-steps')).focus(); closure(); };
  eventForm.elements.kind.onchange = () => {
    const enabled = branch() === 'L/C' && eventForm.elements.kind.value === 'riunione';
    $('event-tournament').hidden = !enabled;
    if (enabled && !$('event-tournament').querySelector('.tournament-person')) {
      const attendance = readAttendance().map(person => {
        const member = data.members.find(item => item.id === person.personId);
        return { ...person, name: member?.name || '', unit: member?.unit || '' };
      });
      renderTournamentControls(attendance, null);
    }
  };
  eventForm.elements.date.oninput = () => {
    if (!eventForm.elements.endDate.value || eventForm.elements.endDate.value === previousStartDate ||
        eventForm.elements.endDate.value < eventForm.elements.date.value)
      eventForm.elements.endDate.value = eventForm.elements.date.value;
    previousStartDate = eventForm.elements.date.value;
    for (const date of $('event-program').querySelectorAll('input[type="date"]'))
      if (date.value < eventForm.elements.date.value || date.value > eventForm.elements.endDate.value)
        date.value = eventForm.elements.date.value;
  };
  eventForm.elements.endDate.oninput = () => {
    for (const date of $('event-program').querySelectorAll('input[type="date"]'))
      if (date.value < eventForm.elements.date.value || date.value > eventForm.elements.endDate.value)
        date.value = eventForm.elements.endDate.value;
  };
  pathForm.elements.kind.onchange = () => {
    pathForm.elements.closed.checked = false;
    pathForm.elements.title.value = pathForm.elements.kind.value === 'hunt' ? 'Stagione di caccia ' + new Date().getFullYear() : '';
    guidance();
  };
  pathForm.elements.personId.onchange = guidance;
  pathForm.elements.closed.onchange = closure;
  $('activities-branch').onchange = () => { $('paths-state').value = ''; render(); };
  $('activities-search').oninput = render;
  eventForm.addEventListener('invalid', event => {
    const section = event.target.closest('details');
    if (section) section.open = true;
  }, true);
  eventForm.elements.fee.oninput = updateAttendance;
  $('event-member-search').oninput = updateAttendance;
  $('event-member-filter').onchange = updateAttendance;
  $('paths-state').onchange = render;
  options($('tournament-category'), [['total', 'Punteggio complessivo'], ...TM.categories.map(item => [item.key, item.label])]);
  $('tournament-category').onchange = renderTournament;
  function selectLinkedSection() {
    if (!data) return;
    const section = location.hash.slice(1);
    if (!['events-panel', 'paths-panel', 'tournament-panel'].includes(section)) return;
    const tab = document.querySelector(`[data-section-target="${section}"]`);
    if (!tab.hidden) tab.click();
  }
  window.addEventListener('hashchange', selectLinkedSection);
  async function load() {
    $('activities-retry').hidden = true;
    $('activities-status').textContent = 'Caricamento…';
    try {
      data = await A.request('activities');
      options($('activities-branch'), data.branches.map(branch => [branch, branch]));
      $('activities-branch').closest('label').hidden = data.branches.length === 1;
      $('activities-app').hidden = false; render(); $('activities-status').textContent = '';
      const eventId = new URLSearchParams(location.search).get('event');
      selectLinkedSection();
      if (eventId) {
        const event = data.events.find(item => String(item.id) === eventId);
        if (event) { $('activities-branch').value = event.branch; render(); openEvent(event, new URLSearchParams(location.search).get('presenze') === '1'); }
        else {
          $('activities-status').textContent = 'Attività non disponibile o fuori dalla tua branca.';
          $('activities-status').dataset.tone = 'error';
        }
      } else if (new URLSearchParams(location.search).get('new') === 'campo-invernale' &&
          data.branches.includes('E/G')) {
        $('activities-branch').value = 'E/G'; render(); openEvent(null, false, false, 'winter-camp');
      }
    } catch (error) {
      $('activities-status').textContent = error.message; $('activities-status').dataset.tone = 'error';
      $('activities-retry').hidden = !window.NAS?.user; $('activities-login').hidden = !!window.NAS?.user;
    }
  }
  $('activities-retry').onclick = load;
  if (window.NAS?.user && (window.NAS.user.admin || kinds[window.NAS.user.serviceBranch])) load();
  else $('activities-login').hidden = false;
})();
