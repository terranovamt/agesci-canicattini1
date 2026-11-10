(function () {
  'use strict';
  const $ = id => document.getElementById(id), A = window.ACCESSO, M = window.SOCI_MODEL,
    AM = window.ACTIVITIES_MODEL, TM = window.TOURNAMENT_MODEL;
  const eventForm = $('event-form'), pathForm = $('path-form');
  const kinds = { 'L/C': ['riunione', 'caccia'], 'E/G': ['riunione', 'uscita'], 'R/S': ['riunione', 'route'] };
  const pathLabels = { hunt: 'Stagione di caccia', specialty: 'Specialità', badge: 'Brevetto' };
  const pathDrafts = new Map();
  const materialOptions = new Map();
  const linkedMemberId = new URLSearchParams(location.search).get('member');
  let activityPlaceChanged = false;
  let attendanceUnits = [];
  let materialFilter = 'all';
  let pathSaving = false, pathSaveError = '', tournamentSort = 'total', tournamentAscending = false;
  const tournamentFields = [
    ['loyalty', 'Lealtà'], ['balooRules', 'Regole di Baloo'], ['huntNotebook', 'Quaderno di caccia'],
    ['style', 'Stile'], ['behavior', 'Comportamento'], ['eye', 'Occhio'],
  ];
  let data, editingEvent, editingPath, busy = false, originalForm = '', previousStartDate = '';
  let programIndex = 0, eventView = 'programma';
  const eventViews = new Map();
  const branch = () => $('activities-branch').value;
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function updateProgramTimeline() {
    if (!eventForm.elements.date.value) return;
    const live = AM.liveProgram({ date: eventForm.elements.date.value,
      endDate: eventForm.elements.endDate.value, program: readProgram() });
    const today = AM.clock().date;
    for (const row of $('event-program').querySelectorAll('.activity-program-item')) {
      const date = row.querySelector('input[name^="program-date-"]').value;
      const time = row.querySelector('input[name^="program-time-"]').value;
      const current = date === today && live.active && live.current &&
        live.current.time === time && live.current.title === row.querySelector('input[name^="program-title-"]').value;
      const past = date < today || date === today && live.active && time && time < live.time &&
        !current;
      row.dataset.timeState = current ? 'current' : past ? 'past' : 'upcoming';
    }
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
  function pathMember() {
    return roster().find(member => String(member.id) === linkedMemberId);
  }
  function attendanceColors(unit) {
    const saved = attendanceUnits.find(item => item.branch === branch() && M.unitKey(item.name) === M.unitKey(unit));
    const identity = branch() === 'E/G' ? M.patrolIdentity(unit) : null;
    const color = saved?.color || (branch() === 'L/C'
      ? Object.entries(M.sestigliaColors).find(([name]) => M.unitKey(name) === M.unitKey(unit))?.[1]
      : identity?.color);
    return [color || M.branchColors[branch()], saved?.color2 || identity?.color2 || color || M.branchColors[branch()]];
  }
  function memberLink(person) {
    const link = node('a', person.name);
    link.href = 'soci.html?member=' + person.personId;
    return link;
  }
  function dateLabel(date) {
    return new Date(date + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function materialKey(title, unit = '') {
    return `${title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it')}\u0000${unit.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it')}`;
  }
  function dateShort(date) {
    const label = new Date(date + 'T12:00:00Z').toLocaleDateString('it-IT', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome',
    });
    const today = AM.clock().date === date;
    return label[0].toLocaleUpperCase('it') + label.slice(1) + (today ? ' · Oggi' : '');
  }
  function dateRange(item) {
    return item.endDate && item.endDate !== item.date
      ? dateLabel(item.date) + ' – ' + dateLabel(item.endDate) : dateLabel(item.date);
  }
  function totals(target, event) {
    const sums = AM.totals(event);
    target.replaceChildren(...[
      ['Totale atteso', sums.expected], ['Incassato', sums.paid],
      ['Da ricevere', sums.remaining], ['In eccesso', sums.excess],
    ].map(([label, amount]) => {
      const item = node('p', label + ': ');
      item.append(node('strong', AM.money(amount))); return item;
    }));
  }
  function render() {
    const lc = branch() === 'L/C', rs = branch() === 'R/S';
    const search = $('activities-search');
    search.closest('label').hidden = !search.value && roster().length <= 12 &&
      data.events.filter(item => item.branch === branch()).length <= 12 &&
      data.paths.filter(item => item.branch === branch()).length <= 12;
    document.querySelector('.activities-context').hidden =
      [...document.querySelectorAll('.activities-context > label')].every(label => label.hidden);
    $('paths-tab').hidden = rs;
    $('tournament-tab').hidden = !lc;
    $('new-winter-camp').hidden = branch() !== 'E/G';
    const activeTab = document.querySelector('[data-section-target="tournament-panel"]');
    if ((!lc && activeTab.getAttribute('aria-pressed') === 'true') ||
        (rs && document.querySelector('[data-section-target="paths-panel"]').getAttribute('aria-pressed') === 'true'))
      document.querySelector('[data-section-target="events-panel"]').click();
    const selectedMember = pathMember();
    $('paths-heading').textContent = selectedMember ? 'Percorso di ' + selectedMember.name : 'Percorso';
    $('paths-member-back').hidden = !selectedMember;
    $('paths-member-back').href = selectedMember
      ? `soci.html?member=${selectedMember.id}&section=education` : 'soci.html';
    document.querySelector('.path-filters').hidden = !selectedMember;
    $('new-path').hidden = !selectedMember;
    $('paths-hint').hidden = false;
    $('paths-hint').textContent = lc
      ? 'Segna le prede completate; concludi la caccia quando sono tutte conquistate.'
      : 'Spunta le tappe completate, poi salva i percorsi.';
    if (!selectedMember) $('paths-hint').textContent = linkedMemberId
      ? 'Socio non disponibile nella branca selezionata. Scegli un socio della branca.'
      : 'Scegli un socio per aprire i suoi percorsi individuali. Puoi cercarlo per nome.';
    $('events-hint').textContent = 'Prima l’attività in corso o la prossima. Scegli cosa fare.';
    const query = $('activities-search').value.trim().toLocaleLowerCase('it');
    const matches = text => text.toLocaleLowerCase('it').includes(query);
    const events = data.events.filter(item => item.branch === branch() &&
      matches(item.title + ' ' + item.attendance.map(person => person.name).join(' ')));
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const eventOrder = item => (item.endDate || item.date) >= today ? 0 : 1;
    $('events-list').replaceChildren(...events.sort((a, b) => eventOrder(a) - eventOrder(b) ||
      (eventOrder(a) ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))).map(item => {
      const card = node('article', undefined, 'activity-card activity-event-row');
      card.style.setProperty('--branch-color', M.branchColors[branch()]);
      card.append(node('p', dateRange(item), 'eyebrow'), node('h3', item.title));
      const actions = node('div', undefined, 'activity-event-actions');
      actions.append(button('Presenze', () => openEvent(item, true)),
        button('Programma', () => { openEvent(item); setEventView('programma'); }));
      if (item.feeCents > 0 || item.attendance.some(person => person.paidCents > 0))
        actions.append(button('Quote', () => { openEvent(item); setEventView('quote'); }));
      card.append(actions);
      return card;
    }));
    if (!events.length) $('events-list').append(node('p', 'Nessuna attività trovata. Crea il primo incontro di branca.', 'members-note'));
    $('paths-members').hidden = !!selectedMember;
    if (!selectedMember) {
      const grouped = roster().filter(member => matches(member.name)).reduce((groups, member) => {
        const unit = member.unit || (branch() === 'L/C' ? 'Senza sestiglia' : 'Senza squadriglia');
        if (!groups.has(unit)) groups.set(unit, []);
        groups.get(unit).push(member);
        return groups;
      }, new Map());
      const groups = [...grouped].sort(([a], [b]) => a.localeCompare(b, 'it'));
      $('paths-members').replaceChildren(...groups.map(([unit, members], index) => {
        const group = node('details', undefined, 'activity-path-unit');
        const [color, color2] = attendanceColors(unit);
        group.style.setProperty('--unit-color', color);
        group.style.setProperty('--unit-color-secondary', color2);
        group.open = index === 0;
        group.append(node('summary', `${unit} · ${members.length}`));
        const list = node('div', undefined, 'activity-path-unit-members');
        list.append(...members.map(member => {
          const link = node('a', member.name, 'path-member-link');
          link.href = `soci.html?member=${member.id}&section=education`;
          return link;
        }));
        group.append(list);
        return group;
      }));
      if (!groups.length) $('paths-members').append(node('p',
        'Nessun socio trovato nella branca.', 'members-note'));
    } else {
      $('paths-members').replaceChildren();
    }
    const paths = data.paths.map(item => pathDrafts.get(item.id) || item)
      .filter(item => selectedMember && item.branch === branch() && item.personId === selectedMember.id &&
        matches(item.title + ' ' + item.memberName));
    const progressionCounts = [
      ['Definito', paths.filter(item => state(item) === 'Definito').length],
      ['In lavorazione', paths.filter(item => state(item) === 'In lavorazione').length],
      ['Conquistato', paths.filter(item => ['Conquistato', 'Conclusa'].includes(state(item))).length],
      ...(lc ? [['Stagione conclusa', paths.filter(item => state(item) === 'Conclusa').length]] : []),
    ];
    $('paths-counts').textContent = progressionCounts.map(([label, count]) => label + ': ' + count).join(' · ');
    const selectedState = $('paths-state').value;
    const filtered = paths.filter(item => !selectedState || state(item) === selectedState ||
      (selectedState === 'Conquistato' && state(item) === 'Conclusa'));
    $('paths-list').replaceChildren(...filtered.map(item => {
      const card = node('article', undefined, 'activity-card path-card'), status = state(item);
      card.style.setProperty('--branch-color', M.branchColors[branch()]);
      const badge = node('span', status, 'activity-state'); badge.dataset.state = status;
      const progress = node('progress'); progress.max = item.steps.length || 1;
      progress.value = item.steps.filter(step => step.done).length;
      progress.setAttribute('aria-label', `${progress.value} di ${item.steps.length} ${item.kind === 'hunt' ? 'prede conquistate' : 'tappe completate'}`);
      card.append(node('p', pathLabels[item.kind], 'eyebrow'), node('h3', item.title),
        node('p', item.memberName), badge, progress,
        node('p', `${progress.value}/${item.steps.length} ${item.kind === 'hunt' ? 'prede conquistate' : 'tappe completate'}`),
        ...(status === 'Conclusa' ? [node('p', 'Stagione di caccia conclusa.', 'activity-path-closure')] : []));
      const steps = node('div', undefined, 'path-inline-steps');
      item.steps.forEach((step, index) => {
        const label = node('label'), tick = node('input');
        tick.type = 'checkbox'; tick.checked = step.done;
        tick.disabled = item.closed || pathSaving;
        tick.dataset.pathTick = `${item.id}-${index}`;
        tick.onchange = () => {
          const draft = { ...item, steps: item.steps.map((value, i) => i === index ? { ...value, done: tick.checked } : value) };
          retainPathDraft(draft); render();
          document.querySelector(`[data-path-tick="${item.id}-${index}"]`)?.focus();
        };
        label.append(tick, node('span', step.title)); steps.append(label);
      });
      card.append(steps);
      if (item.kind === 'hunt' && !item.closed && item.steps.length && item.steps.every(step => step.done)) {
        const close = button('Concludi stagione di caccia', () => { retainPathDraft({ ...item, closed: true }); render(); });
        close.disabled = pathSaving; card.append(close);
      }
      const more = node('details', undefined, 'path-more');
      const edit = button('Modifica percorso', () => openPath(item)); edit.disabled = pathSaving;
      more.append(node('summary', 'Altro'), edit);
      card.append(more);
      if (pathDrafts.has(item.id)) card.append(node('p', 'Modifiche da salvare', 'path-draft-label'));
      return card;
    }));
    if (selectedMember && !filtered.length) $('paths-list').append(node('p', 'Nessun percorso trovato per questo socio. Aggiungi il suo primo percorso.', 'members-note'));
    $('new-path').disabled = pathSaving || !roster().length;
    updatePathSaveBar();
    renderTournament();
  }
  function retainPathDraft(item) {
    const saved = data.paths.find(path => path.id === item.id);
    const payload = path => JSON.stringify([path.kind, path.personId, path.title, path.steps, path.closed]);
    if (saved && payload(saved) === payload(item)) pathDrafts.delete(item.id);
    else pathDrafts.set(item.id, item);
    pathSaveError = '';
  }
  function updatePathSaveBar() {
    $('paths-save-bar').hidden = !pathDrafts.size;
    $('save-paths').disabled = pathSaving;
    $('paths-save-status').textContent = pathSaveError || (pathSaving ? 'Salvataggio…' :
      `Modifiche non salvate · ${pathDrafts.size} percorsi`);
  }
  async function persistPath(item, payload) {
    return A.request('activities/paths' + (item ? '/' + item.id : ''), item ? 'PATCH' : 'POST',
      { ...payload, branch: item?.branch || branch(), ...(item ? { revision: item.revision } : {}) });
  }
  function pathPayload(item) {
    return { kind: item.kind, personId: item.personId, title: item.title, steps: item.steps, closed: !!item.closed };
  }
  $('save-paths').onclick = async () => {
    if (pathSaving) return;
    pathSaving = true; pathSaveError = ''; render();
    for (const [id, draft] of pathDrafts) {
      try {
        const saved = await persistPath(draft, pathPayload(draft));
        data.paths = [saved, ...data.paths.filter(item => item.id !== id)];
        pathDrafts.delete(id);
      } catch (error) {
        pathSaveError = error.message + ' · Modifiche non salvate conservate. Riprova; in caso di conflitto copia le modifiche prima di ricaricare.';
        break;
      }
    }
    pathSaving = false; render();
    if (!pathDrafts.size) $('activities-status').textContent = 'Percorsi salvati.';
  };
  window.addEventListener('beforeunload', event => {
    if (pathDrafts.size) { event.preventDefault(); event.returnValue = ''; }
  });
  function snapshot(form) {
    return JSON.stringify([[...new FormData(form)],
      ...(form === eventForm ? [readProgram(), [...materialOptions.values()]] : [])]);
  }
  function setEventView(view) {
    const tournamentEnabled = branch() === 'L/C' && eventForm.elements.kind.value === 'riunione';
    if (!['presenze', 'quote', 'programma', 'torneo', 'ora'].includes(view) ||
        (view === 'torneo' && !tournamentEnabled)) view = 'programma';
    eventView = view;
    if (editingEvent) eventViews.set(editingEvent.id, view);
    eventForm.dataset.view = view;
    $('event-program-view').hidden = view !== 'programma';
    $('event-people-view').hidden = !['presenze', 'quote'].includes(view);
    $('event-totals').hidden = view !== 'quote';
    $('event-tournament').hidden = view !== 'torneo' || !tournamentEnabled;
    if (view === 'torneo') $('event-tournament').open = true;
    $('event-people-heading').textContent = view === 'quote' ? 'Quote' : 'Presenze';
    for (const control of $('event-view-nav').querySelectorAll('[data-event-view]')) {
      control.setAttribute('aria-pressed', String(control.dataset.eventView === view));
      if (control.dataset.eventView === 'torneo') control.hidden = !tournamentEnabled;
    }
    renderLiveProgram();
    updateAttendance();
  }
  function updateEventSaveState() {
    const state = $('event-save-state');
    if (!$('event-dialog').open) return;
    const changed = snapshot(eventForm) !== originalForm;
    state.dataset.state = changed ? 'draft' : 'saved';
    state.textContent = changed
      ? editingEvent ? 'Modifiche non salvate' : 'Bozza · modifiche non salvate'
      : editingEvent ? 'Attività salvata' : 'Bozza non registrata';
  }
  function openDialog(id, form) {
    $(id).showModal(); originalForm = snapshot(form);
    if (id === 'event-dialog') updateEventSaveState();
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
  function programDay(date) {
    let group = [...$('event-program').children].find(day => day.dataset.date === date);
    if (group) return group;
    group = node('details', undefined, 'activity-program-day'); group.dataset.date = date;
    const summary = node('summary', dateShort(date));
    const rows = node('div', undefined, 'activity-program-day-rows');
    const add = button('+ Aggiungi momento', () => {
      group.open = true; appendProgram({ date }).querySelector('input[name^="program-time-"]').focus();
    });
    add.classList.add('activity-program-day-add');
    group.append(summary, rows, add);
    const next = [...$('event-program').children].find(day => day.dataset.date > date);
    $('event-program').insertBefore(group, next || null);
    return group;
  }
  function prepareProgramDays() {
    const start = eventForm.elements.date.value, end = eventForm.elements.endDate.value;
    if (!start || !end || end < start) return;
    const day = new Date(start + 'T12:00:00Z'), last = new Date(end + 'T12:00:00Z');
    let count = 0;
    while (day <= last && count++ < 366) {
      programDay(day.toISOString().slice(0, 10));
      day.setUTCDate(day.getUTCDate() + 1);
    }
    if (day <= last) programDay(end);
    for (const row of $('event-program').querySelectorAll('.activity-program-item')) {
      const date = row.querySelector('input[name^="program-date-"]').value;
      if (date) programDay(date).querySelector('.activity-program-day-rows').append(row);
    }
    for (const group of $('event-program').children) {
      group.querySelector('summary').textContent = dateShort(group.dataset.date);
      sortProgramDay(group);
    }
    for (const group of [...$('event-program').children])
      if ((group.dataset.date < start || group.dataset.date > end) && !group.querySelector('.activity-program-item')) group.remove();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const groups = [...$('event-program').children];
    if (!groups.some(group => group.open))
      (groups.find(group => group.dataset.date === today) || groups.at(-1))?.setAttribute('open', '');
  }
  function appendProgram(item = {}) {
    const row = node('fieldset', undefined, 'activity-program-item');
    const index = ++programIndex;
    const label = (name, control) => { const wrapper = node('label', name); wrapper.append(control); return wrapper; };
    const activeDay = [...$('event-program').children].findLast(group => group.open);
    const day = node('input'); day.type = 'hidden';
    day.value = item.date || activeDay?.dataset.date || eventForm.elements.endDate.value || eventForm.elements.date.value;
    day.name = `program-date-${index}`;
    const time = node('input'); time.type = 'text'; time.inputMode = 'numeric'; time.maxLength = 5;
    time.pattern = '([01][0-9]|2[0-3]):[0-5][0-9]'; time.placeholder = '08:00'; time.value = item.time || '';
    time.name = `program-time-${index}`;
    const title = node('input'); title.type = 'text'; title.maxLength = 200; title.required = true; title.value = item.title || '';
    title.name = `program-title-${index}`;
    title.placeholder = 'es. Lancio o gioco uno';
    const place = node('input'); place.type = 'hidden';
    place.value = activityPlaceChanged || !Object.hasOwn(item, 'place') ? $('event-place').value : item.place || '';
    place.name = `program-place-${index}`;
    const description = node('textarea'); description.rows = 2; description.maxLength = 2000;
    description.name = `program-description-${index}`;
    description.value = item.description || ''; description.placeholder = 'Descrivi cosa fare';
    const note = node('textarea'); note.rows = 2; note.maxLength = 1000;
    note.name = `program-material-note-${index}`;
    note.value = item.materialNote || (typeof item.materials === 'string' ? item.materials : '');
    if (typeof item.materials === 'string') row.dataset.legacyMaterials = item.materials;
    note.placeholder = 'Nota materiali esistente';
    note.dataset.legacyMaterialNote = '';
    const materialList = node('div', undefined, 'program-materials');
    for (const material of Array.isArray(item.materials) ? item.materials : []) appendProgramMaterial(materialList, material);
    const addMaterial = button('+ Materiale', () => {
      const row = appendProgramMaterial(materialList);
      row.querySelector('[data-material-name]').focus();
    });
    const remove = button('Rimuovi momento', () => row.remove());
    const extra = node('details', undefined, 'activity-program-extra');
    const noteDetails = node('details', undefined, 'program-material-note');
    noteDetails.open = !!note.value.trim();
    noteDetails.append(node('summary', 'Nota materiali'), label('Nota aggiuntiva', note));
    const descriptionColumn = node('div', undefined, 'program-description-column');
    descriptionColumn.append(label('Cosa si fa', description));
    const materialsColumn = node('div', undefined, 'program-materials-column');
    materialsColumn.append(node('h4', 'Materiali'), materialList, addMaterial);
    const content = node('div', undefined, 'program-extra-content');
    content.append(descriptionColumn, materialsColumn);
    extra.append(node('summary', 'Descrizione e materiali'), content, noteDetails, remove);
    const legacyPlace = node('p', place.value ? 'Luogo: ' + place.value : 'Luogo non indicato', 'program-legacy-place members-note');
    legacyPlace.hidden = !$('event-place-note').dataset.mixed;
    row.append(day, place, label('Ora', time), label('Momento', title), legacyPlace, extra);
    time.addEventListener('change', () => {
      sortProgramDay(row.closest('.activity-program-day'));
      updateProgramTimeline();
    });
    programDay(day.value).querySelector('.activity-program-day-rows').append(row);
    sortProgramDay(programDay(day.value));
    return row;
  }
  function appendProgramMaterial(container, item = {}) {
    const row = node('div', undefined, 'program-material-row');
    const name = node('input'); name.type = 'text'; name.required = true; name.maxLength = 200;
    name.value = item.title || ''; name.placeholder = 'Materiale'; name.setAttribute('list', 'material-suggestions');
    name.dataset.materialName = '';
    const quantity = node('input'); quantity.type = 'number'; quantity.min = '0'; quantity.max = '1000000'; quantity.step = 'any';
    quantity.inputMode = 'decimal'; quantity.value = item.quantity ?? ''; quantity.placeholder = 'Quantità';
    quantity.dataset.materialQuantity = '';
    const unit = node('input'); unit.type = 'text'; unit.maxLength = 32; unit.value = item.unit || '';
    unit.placeholder = 'Unità'; unit.dataset.materialUnit = '';
    const remove = button('×', () => { row.remove(); renderMaterialsSummary(); });
    remove.setAttribute('aria-label', 'Rimuovi materiale del momento');
    name.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); quantity.focus(); }
    });
    const field = (text, control) => {
      const label = node('label', text); label.append(control); return label;
    };
    row.append(field('Nome', name), field('Quantità', quantity), field('Unità', unit), remove); container.append(row);
    return row;
  }
  function sortProgramDay(group) {
    if (!group) return;
    const rows = [...group.querySelector('.activity-program-day-rows').children];
    rows.sort((a, b) => {
      const first = a.querySelector('input[name^="program-time-"]').value || '99:99';
      const second = b.querySelector('input[name^="program-time-"]').value || '99:99';
      return first.localeCompare(second) ||
        a.querySelector('input[name^="program-title-"]').value.localeCompare(
          b.querySelector('input[name^="program-title-"]').value, 'it');
    }).forEach(row => group.querySelector('.activity-program-day-rows').append(row));
  }
  function readProgram() {
    return [...$('event-program').querySelectorAll('.activity-program-item')].map(row => {
      const field = name => row.querySelector(`[name^="program-${name}-"]`).value;
      const note = field('material-note');
      const materials = row.dataset.legacyMaterials !== undefined ? row.dataset.legacyMaterials :
        [...row.querySelectorAll('.program-material-row')].map(material => ({
          title: material.querySelector('[data-material-name]').value,
          quantity: material.querySelector('[data-material-quantity]').value === '' ? null :
            Number(material.querySelector('[data-material-quantity]').value),
          unit: material.querySelector('[data-material-unit]').value,
        }));
      return { date: field('date'), time: field('time'), title: field('title'),
        place: field('place'), description: field('description'),
        materials, materialNote: row.dataset.legacyMaterials !== undefined && note === row.dataset.legacyMaterials ? '' : note };
    });
  }
  function renderMaterialsSummary() {
    const items = AM.materialSummary(readProgram(), [...materialOptions.values()], editingEvent?.shopping || []);
    const list = $('event-materials');
    const suggestions = new Map(items.map(item => [item.title.toLocaleLowerCase('it'), item.title]));
    $('material-suggestions').replaceChildren(...[...suggestions.values()].map(title => {
      const option = node('option'); option.value = title; return option;
    }));
    const visible = items.filter(item => materialFilter === 'all' ||
      materialFilter === 'shopping' && item.shopping || materialFilter === 'prepare' && !item.shopping);
    list.replaceChildren(...visible.map(item => {
      const row = node('li', undefined, 'event-material-summary-row');
      const details = item.details.map(detail => {
        const quantity = detail.quantity === null ? 'quantità da definire' :
          `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(detail.quantity)}${detail.unit ? ' ' + detail.unit : ''}`;
        return `${detail.moment}: ${detail.note ? 'nota · ' + detail.note : quantity}`;
      });
      const total = item.quantity === null ? 'quantità da definire' :
        `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(item.quantity)}${item.unit ? ' ' + item.unit : ''}`;
      row.append(node('strong', `${item.title} — ${total} (${details.join(' · ')})`));
      const controls = node('div', undefined, 'event-material-summary-controls');
      const ready = button(item.done ? 'Pronto' : 'Segna pronto', () => {
        setMaterialOption(item, { done: !item.done });
        renderMaterialsSummary();
        [...list.querySelectorAll('[data-material-ready]')].find(button => button.dataset.materialReady === item.key)?.focus();
      });
      ready.dataset.materialReady = item.key;
      const shopping = button(item.shopping ? 'Da comprare' : 'Da preparare', () => {
        setMaterialOption(item, { shopping: !item.shopping });
        renderMaterialsSummary();
        [...list.querySelectorAll('[data-material-shopping]')].find(button => button.dataset.materialShopping === item.key)?.focus();
      });
      shopping.dataset.materialShopping = item.key;
      const reusedLabel = node('label', 'Totale necessario', 'material-reused');
      const reused = node('select');
      options(reused, [['true', 'Riutilizzo gli stessi · massimo tra i momenti'],
        ['false', 'Occorrono per ogni momento · somma']]);
      reused.value = String(item.reused);
      reused.setAttribute('aria-label', `Totale necessario: ${item.title}`);
      reused.dataset.materialReuse = item.key;
      reused.onchange = () => {
        setMaterialOption(item, { reused: reused.value === 'true' }); renderMaterialsSummary();
        [...list.querySelectorAll('[data-material-reuse]')].find(control => control.dataset.materialReuse === item.key)?.focus();
      };
      reusedLabel.append(reused);
      controls.append(ready, shopping, reusedLabel); row.append(controls); return row;
    }));
    $('event-materials-empty').hidden = visible.length > 0;
    $('event-materials-empty').textContent = items.length
      ? 'Nessun materiale in questa vista.' : 'Nessun materiale nel programma.';
  }
  function setMaterialOption(item, changes) {
    const key = materialKey(item.title, item.unit);
    const current = materialOptions.get(key) || { title: item.title, unit: item.unit, reused: true, done: false, shopping: false };
    materialOptions.set(key, { ...current, ...changes });
  }
  function addActivityMaterial() {
    const name = $('activity-material-name'), title = name.value.trim().replace(/\s+/g, ' ');
    if (!title) { name.focus(); return; }
    const quantityInput = $('activity-material-quantity');
    if (!quantityInput.checkValidity()) { quantityInput.reportValidity(); quantityInput.focus(); return; }
    const quantity = quantityInput.value;
    const unit = $('activity-material-unit').value.trim().replace(/\s+/g, ' ');
    const key = materialKey(title, unit);
    materialOptions.set(key, { ...(materialOptions.get(key) || {}), title, unit,
      quantity: quantity === '' ? null : Number(quantity),
      reused: $('activity-material-reused').value === 'true',
      shopping: $('activity-material-shopping').checked, done: false });
    name.value = $('activity-material-quantity').value = $('activity-material-unit').value = '';
    $('activity-material-reused').value = 'true';
    $('activity-material-shopping').checked = false;
    renderMaterialsSummary(); name.focus();
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
      const row = node('label', undefined, 'tournament-presentation');
      row.dataset.unit = unit;
      row.append(node('strong', unit + ' · presentazione'));
      const score = node('input'); score.type = 'number'; score.min = '0'; score.max = '5'; score.step = '1';
      score.name = 'presentation-' + unit;
      score.inputMode = 'numeric'; score.placeholder = '0–5'; score.dataset.presentation = '';
      score.setAttribute('aria-label', 'Punteggio della presentazione per la sestiglia ' + unit);
      if (presentationScores.has(unit) && presentationScores.get(unit) !== null)
        score.value = String(presentationScores.get(unit));
      row.append(score);
      return row;
    }));
    const table = node('table', undefined, 'tournament-judging-table');
    const head = node('thead'), header = node('tr');
    for (const text of ['Componente', 'Puntualità', ...tournamentFields.map(([, label]) => label)]) {
      const cell = node('th', text); cell.scope = 'col'; header.append(cell);
    }
    head.append(header); table.append(head);
    for (const [unit, group] of [...groups].sort(([a], [b]) => a.localeCompare(b, 'it'))) {
      const body = node('tbody'), groupRow = node('tr'), groupCell = node('th', unit);
      groupCell.colSpan = 2 + tournamentFields.length; groupCell.scope = 'rowgroup'; groupRow.append(groupCell); body.append(groupRow);
      const records = group.map(person => {
        const row = node('tr', undefined, 'tournament-person');
        row.dataset.personId = person.personId; row.dataset.unit = person.unit || '';
        const record = prior.get(person.personId) || {};
        const title = node('th'); title.scope = 'row';
        title.append(memberLink(person), node('small', '', 'tournament-presence-state')); row.append(title);
        const punctualCell = node('td');
        const punctual = node('select'); punctual.dataset.tournamentField = 'punctuality';
        punctual.name = `tournament-punctuality-${person.personId}`;
        punctual.setAttribute('aria-label', person.name + ' · Puntualità');
        options(punctual, [['', '—'], ['true', 'Puntuale'], ['false', 'In ritardo']]);
        if (typeof record.punctuality === 'boolean') punctual.value = String(record.punctuality);
        punctualCell.append(punctual); row.append(punctualCell);
        for (const [key, labelText] of tournamentFields) {
          const cell = node('td');
          const score = node('input'); score.type = 'number'; score.min = '0'; score.max = '5'; score.step = '1';
          score.name = `tournament-${key}-${person.personId}`;
          score.inputMode = 'numeric'; score.placeholder = '0–5'; score.dataset.tournamentField = key;
          score.setAttribute('aria-label', person.name + ' · ' + labelText);
          score.value = Number.isInteger(record[key]) ? String(record[key]) : '';
          cell.append(score); row.append(cell);
        }
        return row;
      });
      body.append(...records); table.append(body);
    }
    $('tournament-members').replaceChildren(table);
    updateTournamentAvailability();
  }
  function updateTournamentAvailability() {
    for (const row of $('tournament-members').querySelectorAll('.tournament-person')) {
      const attendance = [...$('event-attendance').querySelectorAll('.activity-person')]
        .find(person => Number(person.dataset.personId) === Number(row.dataset.personId));
      const present = attendance?.querySelector('select').value === 'presente';
      row.classList.toggle('is-absent', !present);
      row.querySelector('.tournament-presence-state').textContent = present ? '' : 'Non presente';
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
          unit: score.unit,
          values: Object.fromEntries([...TM.categories.map(item => [item.key, []]), ['total', []]]),
        });
        const total = rows.get(score.unit);
        for (const item of TM.categories) if (score.values[item.key] !== null) total.values[item.key].push(score.values[item.key]);
        if (score.values.total !== null) total.values.total.push(score.values.total);
      }
    }
    const category = tournamentSort;
    const scores = [...rows.values()].map(item => {
      const counts = Object.fromEntries(Object.entries(item.values).map(([key, values]) => [key, values.length]));
      const values = Object.fromEntries(Object.entries(item.values).map(([key, values]) =>
        [key, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null]));
      return { ...item, counts, values };
    }).sort((a, b) => {
      if (category === 'unit') return a.unit.localeCompare(b.unit, 'it') * (tournamentAscending ? 1 : -1);
      if (a.values[category] === null) return b.values[category] === null ? a.unit.localeCompare(b.unit, 'it') : 1;
      if (b.values[category] === null) return -1;
      return (a.values[category] - b.values[category]) * (tournamentAscending ? 1 : -1) ||
        (b.values.total ?? -1) - (a.values.total ?? -1) || a.unit.localeCompare(b.unit, 'it');
    });
    const table = node('table', undefined, 'tournament-table');
    const caption = node('caption', '% · — non valutato · scorri per le categorie');
    table.append(caption);
    const head = node('thead'), header = node('tr');
    const columns = [{ key: 'unit', label: 'Sestiglia' }, ...TM.categories, { key: 'total', label: 'Totale' }];
    header.append(node('th', '#'));
    for (const { key, label } of columns) {
      const cell = node('th'); cell.scope = 'col';
      cell.setAttribute('aria-sort', category === key ? tournamentAscending ? 'ascending' : 'descending' : 'none');
      const sort = button(label + (category === key ? tournamentAscending ? ' ↑' : ' ↓' : ''), () => {
        tournamentAscending = tournamentSort === key ? !tournamentAscending : key === 'unit';
        tournamentSort = key; renderTournament();
        $('tournament-rankings').querySelector(`[data-sort="${key}"]`)?.focus();
      });
      sort.dataset.sort = key; cell.append(sort); header.append(cell);
    }
    head.append(header); const body = node('tbody');
    scores.forEach(item => {
      const row = node('tr');
      const rankKey = category === 'unit' ? 'total' : category;
      const rank = item.values[rankKey] === null ? '—' :
        String(scores.filter(other => other.values[rankKey] !== null &&
          ((other.values[rankKey] ?? -1) > item.values[rankKey] ||
            (other.values[rankKey] === item.values[rankKey] &&
              (other.values.total ?? -1) > (item.values.total ?? -1)))).length + 1);
      const name = node('th', item.unit); name.scope = 'row';
      row.append(node('td', rank), name);
      for (const { key } of columns.slice(1)) {
        const cell = node('td', item.values[key] === null ? '—' : item.values[key].toFixed(1) + '%');
        cell.title = item.counts[key] + ' riunioni valutate'; row.append(cell);
      }
      body.append(row);
    });
    table.append(head, body);
    $('tournament-rankings').replaceChildren(...(scores.length ? [table] : [node('p', 'La classifica comparirà quando saranno salvati i primi punteggi.', 'members-note')]));
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const current = events.find(event => event.date <= today && (event.endDate || event.date) >= today) ||
      events.filter(event => event.date > today).at(-1) || events[0];
    const meeting = (event, primary) => {
      const card = node(primary ? 'article' : 'details', undefined, primary ? 'tournament-current' : 'tournament-previous');
      const hasScores = !!event.tournament && event.tournament.members.some(person =>
        person.punctuality !== null || tournamentFields.some(([key]) => person[key] !== null)) ||
        !!event.tournament?.presentations.some(item => item.score !== null);
      card.append(node(primary ? 'h4' : 'summary', event.title + ' · ' + dateRange(event)),
        node('p', hasScores ? 'Punteggi registrati' : 'Da valutare'));
      const action = button(primary ? 'Valuta riunione' : 'Apri valutazioni', () => openEvent(event, false, true));
      if (primary) action.className = 'button button-primary';
      card.append(action);
      return card;
    };
    $('tournament-events').replaceChildren(...(current ? [meeting(current, true),
      ...events.filter(event => event !== current).map(event => meeting(event, false))] : []));
    if (!events.length) $('tournament-events').append(node('p', 'Crea una riunione L/C per registrare i punteggi.', 'members-note'));
  }
  function readAttendance() {
    return [...$('event-attendance').querySelectorAll('.activity-person')].map(row => ({
      personId: Number(row.dataset.personId), status: row.querySelector('select').value,
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
    $('event-view-nav').querySelector('[data-event-view="quote"]').hidden =
      !(feeCents > 0 || attendance.some(person => person.paidCents > 0));
    const query = $('event-member-search').value.trim().toLocaleLowerCase('it');
    const filter = $('event-member-filter').value;
    let visible = 0;
    [...$('event-attendance').querySelectorAll('.activity-person')].forEach((row, index) => {
      const person = attendance[index], expected = feeCents;
      const remaining = Math.max(0, expected - person.paidCents);
      const excess = Math.max(0, person.paidCents - expected);
      row.dataset.status = person.status;
      row.dataset.balanceState = remaining ? 'unpaid' : excess ? 'excess' : 'paid';
      row.querySelector('[data-person-status]').textContent = eventView === 'quote'
        ? remaining ? AM.money(remaining) + ' da ricevere' : excess ? AM.money(excess) + ' in più'
          : 'Saldato'
        : person.status ? (person.status === 'presente' ? '✓ ' : person.status === 'assente' ? '− ' : '') +
          person.status[0].toUpperCase() + person.status.slice(1) : '○ Da registrare';
      const action = row.querySelector('[data-person-action]');
      if (eventView === 'quote') {
        action.removeAttribute('aria-pressed');
        action.setAttribute('aria-expanded', String(row.querySelector('.activity-payment').open));
        action.setAttribute('aria-controls', row.querySelector('.activity-payment').id);
      } else {
        action.setAttribute('aria-pressed', String(person.status === 'presente'));
        action.removeAttribute('aria-expanded'); action.removeAttribute('aria-controls');
      }
      row.querySelector('[data-balance]').replaceChildren(
        ...[['Atteso', expected], ['Ricevuto', person.paidCents], ['Da ricevere', remaining], ['Versato in più', excess]]
          .map(([label, amount]) => {
            const value = node('span', label + ': ');
            value.append(node('strong', AM.money(amount)));
            return value;
          }));
      row.hidden = !row.dataset.name.includes(query) ||
        (filter === 'presente' && person.status !== 'presente') ||
        (filter === 'unpaid' && !remaining && !(eventView === 'quote' && row.querySelector('.activity-payment').open)) ||
        (filter === 'paid' && !person.paidCents);
      if (!row.hidden) visible++;
    });
    for (const group of $('event-attendance').querySelectorAll('.activity-attendance-group')) {
      const rows = [...group.querySelectorAll('.activity-person')];
      group.hidden = rows.every(row => row.hidden);
      group.querySelector('summary').textContent = `${group.dataset.unit} · ${rows.filter(row => row.dataset.status === 'presente').length}/${rows.length} presenti`;
    }
    $('event-attendance-count').textContent = `${visible}/${attendance.length} soci · ${attendance.filter(person => person.status === 'presente').length} presenti`;
    updateTournamentAvailability();
  }
  function filterAttendance() {
    updateAttendance();
    for (const group of $('event-attendance').querySelectorAll('.activity-attendance-group'))
      if (!group.hidden) group.open = true;
  }
  function renderLiveProgram() {
    const panel = $('event-live');
    panel.dataset.branch = branch();
    const live = AM.liveProgram({ date: eventForm.elements.date.value,
      endDate: eventForm.elements.endDate.value, program: readProgram() });
    panel.hidden = eventView !== 'ora';
    const nowButton = $('event-view-nav').querySelector('[data-event-view="ora"]');
    nowButton.hidden = !live.active;
    updateProgramTimeline();
    if (eventView !== 'ora') return;
    if (!live.active) {
      $('event-live-clock').textContent = 'Fuori dai giorni dell’attività';
      $('event-live-moment').replaceChildren(node('p', 'Il programma di oggi non è attivo. Apri Programma per preparare i prossimi momenti.'));
      return;
    }
    $('event-live-clock').textContent = 'Oggi · ' + dateLabel(live.date) + ' · ' + live.time + ' · ora italiana';
    const content = $('event-live-moment'), moment = live.current || live.next;
    content.replaceChildren(node('h4', live.current ? `${moment.time} · ${moment.title}`
      : live.next ? `Si comincia alle ${moment.time} · ${moment.title}` : 'Nessun momento con orario per oggi'));
    if (moment) {
      if (moment.place) content.append(node('p', 'Dove: ' + moment.place));
      if (moment.description) content.append(node('p', moment.description));
      if (Array.isArray(moment.materials) && moment.materials.length)
        content.append(node('p', 'Materiali: ' + moment.materials.map(item =>
          `${item.title}${item.quantity === null ? '' : ` · ${item.quantity}${item.unit ? ' ' + item.unit : ''}`}`).join(', ')));
      if (moment.materialNote || typeof moment.materials === 'string' && moment.materials)
        content.append(node('p', 'Nota materiali: ' + (moment.materialNote || moment.materials)));
    } else content.append(node('p', 'Completa il programma indicando giorno e ora: non viene ipotizzata un’attività in corso.'));
    if (live.current) content.append(node('p', live.next
      ? `A seguire · ${live.next.time} · ${live.next.title}` : 'Ultimo momento con orario previsto per oggi.'));
    for (const item of live.unscheduled) content.append(node('p', 'Oggi, senza orario · ' + item.title));
  }
  $('event-live-attendance').onclick = () => {
    setEventView('presenze'); $('event-attendance').querySelector('[data-person-action]')?.focus();
  };
  window.setInterval(() => { if ($('event-dialog').open) renderLiveProgram(); }, 30000);
  window.addEventListener('focus', () => { if ($('event-dialog').open) renderLiveProgram(); });
  function openEvent(item, focusAttendance = false, focusTournament = false, starter = '') {
    editingEvent = item || null; eventForm.reset(); $('event-error').textContent = '';
    activityPlaceChanged = false;
    const places = [...new Set((item?.program || []).map(moment => moment.place || ''))];
    const mixedPlaces = places.length > 1;
    $('event-place').value = mixedPlaces ? '' : places[0] || '';
    $('event-place').placeholder = mixedPlaces ? 'Più luoghi esistenti · lascia vuoto per conservarli' : 'Luogo o punto di ritrovo';
    $('event-place-note').hidden = !mixedPlaces;
    $('event-place-note').dataset.mixed = mixedPlaces ? 'true' : '';
    $('event-place-note').textContent = mixedPlaces
      ? 'Luoghi esistenti: ' + places.map(place => place || 'non indicato').join(' · ') +
        '. Sono conservati per ogni momento. Modificando questo campo imposti un luogo unico per tutti.' : '';
    materialOptions.clear(); materialFilter = 'all';
    for (const material of item?.materials || []) {
      const saved = { ...material, reused: material.reused !== false, shopping: !!material.shopping };
      materialOptions.set(materialKey(saved.title, saved.unit || ''), saved);
    }
    $('event-heading').textContent = item ? item.title : 'Nuova attività';
    $('event-draft-banner').hidden = !!item;
    $('event-settings').open = !item;
    $('event-filters').open = false;
    $('event-program-section').open = true;
    programIndex = 0;
    options(eventForm.elements.kind, kinds[branch()].map(value => [value, value[0].toUpperCase() + value.slice(1)]));
    const winterCamp = starter === 'winter-camp';
    eventForm.elements.kind.value = item?.kind || (winterCamp ? 'uscita' : 'riunione');
    eventForm.elements.kind.disabled = !!item?.tournament;
    eventForm.elements.title.value = item?.title || '';
    eventForm.elements.fee.value = ((item?.feeCents || 0) / 100).toFixed(2);
    $('event-member-search').value = $('event-member-filter').value = '';
    const todayText = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    eventForm.elements.date.value = item?.date || (winterCamp ? '2027-01-02' : todayText);
    eventForm.elements.endDate.value = item?.endDate || item?.date || (winterCamp ? '2027-01-05' : todayText);
    previousStartDate = eventForm.elements.date.value;
    $('event-context').textContent = (item?.kind || (winterCamp ? 'uscita' : 'riunione')) + ' · ' +
      dateRange({ date: eventForm.elements.date.value, endDate: eventForm.elements.endDate.value });
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
    $('event-search-label').hidden = persons.length <= 12;
    $('event-attendance').replaceChildren(...grouped.map(([unit, group]) => {
      const container = node('details', undefined, 'activity-attendance-group');
      container.dataset.unit = unit || 'Soci'; container.open = true;
      const [color, color2] = attendanceColors(unit);
      container.style.setProperty('--unit-color', color);
      container.style.setProperty('--unit-color-secondary', color2);
      container.append(node('summary', unit || 'Soci'));
      const rows = group.map(person => {
      const row = node('section', undefined, 'activity-person');
      row.dataset.personId = person.personId; row.dataset.name = person.name.toLocaleLowerCase('it');
      row.dataset.unit = person.unit || '';
      const action = button('', () => {
        if (eventView === 'quote') {
          payment.open = !payment.open;
          action.setAttribute('aria-expanded', String(payment.open));
          if (payment.open) {
            try {
              const previous = AM.cents(paid.value), expected = AM.cents(eventForm.elements.fee.value);
              if (!paid.dataset.edited && expected > previous) {
                paid.value = ((previous + Math.max(0, expected - previous)) / 100).toFixed(2);
                paid.dataset.edited = 'suggested';
              }
            } catch (error) { $('event-error').textContent = error.message; }
            updateAttendance(); paid.focus(); paid.select();
          }
        } else {
          select.value = select.value === 'presente' ? 'assente' : 'presente';
          select.onchange();
        }
        updateEventSaveState();
      });
      action.className = 'activity-person-action'; action.dataset.personAction = '';
      const status = node('span', undefined, 'activity-person-status'); status.dataset.personStatus = '';
      action.append(node('span', person.name), status);
      const label = node('label', 'Presenza'), select = node('select');
      select.name = 'attendance-' + person.personId; select.dataset.personId = person.personId;
      options(select, [['', 'Da registrare'], ['presente', 'Presente'], ['assente', 'Assente'], ['giustificato', 'Giustificato']]);
      select.value = person.status; label.append(select);
      select.onchange = updateAttendance;
      const paidLabel = node('label', 'Versato totale (€)'), paid = node('input');
      paid.type = 'number'; paid.name = 'paid-' + person.personId; paid.dataset.paid = '';
      paid.min = '0'; paid.max = String(AM.maxCents / 100); paid.step = '0.01'; paid.inputMode = 'decimal'; paid.required = true;
      paid.value = ((person.paidCents || 0) / 100).toFixed(2);
      paid.oninput = () => { paid.dataset.edited = 'manual'; updateAttendance(); };
      paidLabel.append(paid);
      const controls = node('details', undefined, 'activity-presence-options');
      const more = node('summary', '⋯'); more.setAttribute('aria-label', 'Assenza o altra presenza: ' + person.name);
      const profile = memberLink(person); profile.textContent = 'Scheda socio →';
      profile.className = 'activity-person-profile';
      controls.append(more, label, profile);
      const payment = node('details', undefined, 'activity-payment');
      payment.id = 'activity-payment-' + person.personId;
      payment.append(node('summary', 'Dettagli del versamento'));
      payment.addEventListener('toggle', () => {
        action.setAttribute('aria-expanded', String(payment.open)); updateAttendance();
      });
      const paymentControls = node('div', undefined, 'activity-person-controls');
      paymentControls.append(paidLabel);
      const balance = node('div', undefined, 'activity-fee-balance'); balance.dataset.balance = '';
      payment.append(paymentControls, balance, node('p', 'Il versato è il totale ricevuto, acconti inclusi.', 'members-note'));
      row.append(action, controls, payment); return row;
      });
      container.append(...rows); return container;
    }));
    if (!persons.length) $('event-attendance').append(node('p', 'Nessun socio disponibile: aggiungilo dal Libro soci.', 'members-note'));
    $('event-tasks').replaceChildren();
    for (const task of item?.tasks || []) appendStep($('event-tasks'), task);
    $('event-program').replaceChildren();
    for (const programItem of item?.program || []) appendProgram(programItem);
    prepareProgramDays();
    renderMaterialsSummary();
    for (const filter of $('event-program-view').querySelectorAll('[data-material-filter]'))
      filter.setAttribute('aria-pressed', String(filter.dataset.materialFilter === materialFilter));
    const tournamentEnabled = branch() === 'L/C' && eventForm.elements.kind.value === 'riunione';
    $('event-tournament').hidden = !tournamentEnabled;
    $('event-tournament').open = focusTournament;
    if (tournamentEnabled) renderTournamentControls(persons.map(person), item);
    setEventView(focusTournament ? 'torneo' : focusAttendance ? 'presenze' : eventViews.get(item?.id) || 'programma');
    updateAttendance();
    openDialog('event-dialog', eventForm);
    if (focusAttendance) queueMicrotask(() => $('event-attendance').querySelector('[data-person-action]')?.focus());
    if (focusTournament) queueMicrotask(() => $('tournament-presentations').querySelector('input')?.focus());
  }
  function guidance() {
    const kind = pathForm.elements.kind.value, hunt = kind === 'hunt';
    $('path-steps-title').textContent = hunt ? 'Prede scelte dal lupetto' : 'Tappe concordate con i capi';
    $('add-path-step').textContent = hunt ? '+ Aggiungi preda' : '+ Aggiungi tappa';
    $('path-closure').hidden = !hunt;
    $('path-guidance').textContent = hunt
      ? 'La caccia si conclude solo dopo tutte le prede, con una scelta esplicita.'
      : 'Le tappe si possono spuntare anche dalla scheda del percorso.';
    const catalog = kind === 'badge' ? M.competencyBadges : kind === 'specialty' ? M.specialtyCatalogs[branch()] || [] : [];
    $('path-catalog').replaceChildren(...catalog.map(value => { const option = node('option'); option.value = value; return option; }));
    closure();
  }
  function closure() {
    const steps = readSteps($('path-steps')), closed = pathForm.elements.closed;
    const complete = steps.length > 0 && steps.every(step => step.done);
    $('path-closure').hidden = pathForm.elements.kind.value !== 'hunt' || (!complete && !closed.checked);
    closed.disabled = !complete && !closed.checked;
    closed.setCustomValidity(closed.checked && !complete ? 'Conquista tutte le prede o riapri la stagione togliendo la spunta.' : '');
  }
  function openPath(item) {
    const selectedMember = pathMember();
    if (!selectedMember || item && (item.personId !== selectedMember.id || item.branch !== branch())) return;
    item = item && (pathDrafts.get(item.id) || item);
    editingPath = item || null; pathForm.reset(); $('path-error').textContent = '';
    $('path-heading').textContent = item ? 'Gestisci percorso' : 'Nuovo percorso';
    const types = branch() === 'L/C' ? ['hunt', 'specialty'] : ['specialty', 'badge'];
    options(pathForm.elements.kind, types.map(value => [value, pathLabels[value]]));
    pathForm.elements.kind.value = item?.kind || types[0];
    pathForm.elements.kind.disabled = !!item;
    const members = [[String(selectedMember.id), selectedMember.name]];
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
    if (dialogId === 'event-dialog') {
      $('event-save-state').dataset.state = 'saving';
      $('event-save-state').textContent = 'Salvataggio in corso…';
    }
    try {
      const saved = await A.request('activities/' + category + (existing ? '/' + existing.id : ''),
        existing ? 'PATCH' : 'POST', { ...payload, branch: branch(), ...(existing ? { revision: existing.revision } : {}) });
      data[category] = [saved, ...data[category].filter(item => item.id !== saved.id)];
      if (dialogId === 'event-dialog') {
        editingEvent = saved;
        originalForm = snapshot(form);
      }
      $(dialogId).close(); render();
      $('activities-status').textContent = dialogId === 'event-dialog' ? 'Attività salvata.' : 'Salvato.';
      $('activities-status').dataset.tone = 'success';
    } catch (error) {
      $(errorId).textContent = error.message;
      if (!window.NAS?.user) {
        $(dialogId).close(); $('activities-app').hidden = true; $('activities-login').hidden = false;
        $('activities-status').textContent = error.message; data = null;
        $('events-list').replaceChildren(); $('paths-list').replaceChildren();
      }
    } finally {
      busy = false; form.inert = false; form.setAttribute('aria-busy', 'false');
      if (dialogId === 'event-dialog') updateEventSaveState();
    }
  }
  eventForm.onsubmit = event => {
    event.preventDefault();
    if ($('event-place').value.trim() && !$('event-program').querySelector('.activity-program-item')) {
      $('event-error').textContent = 'Aggiungi un momento al programma per salvare il luogo.';
      setEventView('programma');
      $('event-program-section').open = true;
      document.querySelector('#event-program .activity-program-day-add')?.focus();
      return;
    }
    let feeCents, attendance;
    try { feeCents = AM.cents(eventForm.elements.fee.value); attendance = readAttendance(); }
    catch (error) { $('event-error').textContent = error.message; return; }
    save('events', eventForm, editingEvent, {
      kind: eventForm.elements.kind.value, title: eventForm.elements.title.value, date: eventForm.elements.date.value,
      endDate: eventForm.elements.endDate.value, feeCents, attendance,
      tasks: readSteps($('event-tasks')),
      program: readProgram(), materials: [...materialOptions.values()],
      shopping: editingEvent?.shopping || [],
      ...(branch() === 'L/C' && eventForm.elements.kind.value === 'riunione' ? { tournament: readTournament() } : {}),
    }, 'event-error', 'event-dialog');
  };
  pathForm.onsubmit = async event => {
    event.preventDefault();
    if (busy || pathSaving) return;
    const personId = Number(pathForm.elements.personId.value);
    if (!pathMember() || personId !== pathMember().id) {
      $('path-error').textContent = 'Scegli un socio della branca visibile.'; return;
    }
    const payload = {
      kind: pathForm.elements.kind.value, personId: Number(pathForm.elements.personId.value),
      title: pathForm.elements.title.value, steps: readSteps($('path-steps')),
      closed: pathForm.elements.kind.value === 'hunt' && pathForm.elements.closed.checked,
    };
    if (payload.closed && (!payload.steps.length || !payload.steps.every(step => step.done))) {
      $('path-error').textContent = 'Completa tutte le prede prima di concludere la stagione.'; return;
    }
    if (editingPath) retainPathDraft({ ...editingPath, ...payload });
    busy = pathSaving = true; pathForm.inert = true;
    $('path-error').textContent = 'Salvataggio…'; pathForm.setAttribute('aria-busy', 'true');
    try {
      const saved = await persistPath(editingPath, payload);
      data.paths = [saved, ...data.paths.filter(item => item.id !== saved.id)];
      pathDrafts.delete(saved.id); pathSaveError = '';
      $('path-dialog').close();
      $('activities-status').textContent = 'Percorso salvato.';
    } catch (error) {
      pathSaveError = error.message + ' · Modifiche conservate; riprova senza chiudere la pagina.';
      $('path-error').textContent = pathSaveError;
    } finally {
      busy = pathSaving = false; pathForm.inert = false; pathForm.setAttribute('aria-busy', 'false'); render();
    }
  };
  $('new-event').onclick = () => openEvent();
  $('new-winter-camp').onclick = () => openEvent(null, false, false, 'winter-camp');
  $('new-path').onclick = () => openPath();
  $('add-event-task').onclick = () => appendStep($('event-tasks')).focus();
  $('add-event-material').onclick = addActivityMaterial;
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
    setEventView(eventView);
  };
  eventForm.elements.date.oninput = () => {
    if (!eventForm.elements.endDate.value || eventForm.elements.endDate.value === previousStartDate ||
        eventForm.elements.endDate.value < eventForm.elements.date.value)
      eventForm.elements.endDate.value = eventForm.elements.date.value;
    previousStartDate = eventForm.elements.date.value;
    for (const date of $('event-program').querySelectorAll('input[name^="program-date-"]'))
      if (date.value < eventForm.elements.date.value || date.value > eventForm.elements.endDate.value)
        date.value = eventForm.elements.date.value;
    prepareProgramDays();
  };
  eventForm.elements.endDate.oninput = () => {
    for (const date of $('event-program').querySelectorAll('input[name^="program-date-"]'))
      if (date.value < eventForm.elements.date.value || date.value > eventForm.elements.endDate.value)
        date.value = eventForm.elements.endDate.value;
    prepareProgramDays();
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
    if (event.target.closest('#event-program-view')) setEventView('programma');
    else if (event.target.closest('#event-tournament')) setEventView('torneo');
    else if (event.target.closest('#event-people-view')) {
      $('event-member-search').value = $('event-member-filter').value = '';
      setEventView('quote');
    }
    let parent = event.target.parentElement;
    while (parent && parent !== eventForm) {
      if (parent.tagName === 'DETAILS') parent.open = true;
      parent = parent.parentElement;
    }
  }, true);
  for (const control of $('event-view-nav').querySelectorAll('[data-event-view]'))
    control.onclick = () => setEventView(control.dataset.eventView);
  eventForm.elements.fee.oninput = updateAttendance;
  $('event-place').oninput = () => {
    activityPlaceChanged = true;
    for (const place of $('event-program').querySelectorAll('input[name^="program-place-"]'))
      place.value = $('event-place').value;
    for (const label of $('event-program').querySelectorAll('.program-legacy-place')) label.hidden = true;
    $('event-place-note').hidden = true; $('event-place-note').dataset.mixed = '';
  };
  eventForm.addEventListener('input', updateEventSaveState);
  eventForm.addEventListener('input', event => {
    updateProgramTimeline();
    if (event.target.matches('[data-material-name], [data-material-quantity], [data-material-unit]'))
      renderMaterialsSummary();
  });
  eventForm.addEventListener('change', updateEventSaveState);
  eventForm.addEventListener('click', () => queueMicrotask(updateEventSaveState));
  $('event-member-search').oninput = filterAttendance;
  $('event-member-filter').onchange = filterAttendance;
  $('activity-material-name').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); $('activity-material-quantity').focus(); }
  });
  $('activity-material-quantity').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); $('activity-material-unit').focus(); }
  });
  for (const filter of $('event-program-view').querySelectorAll('[data-material-filter]'))
    filter.onclick = () => {
      materialFilter = filter.dataset.materialFilter;
      for (const option of $('event-program-view').querySelectorAll('[data-material-filter]'))
        option.setAttribute('aria-pressed', String(option === filter));
      renderMaterialsSummary();
      filter.focus();
    };
  $('paths-state').onchange = render;
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
      const [activities, members] = await Promise.all([
        A.request('activities'), A.request('members'),
      ]);
      data = activities; attendanceUnits = members?.units || [];
      options($('activities-branch'), data.branches.map(branch => [branch, branch]));
      const linkedMember = data.members.find(member => String(member.id) === linkedMemberId &&
        data.branches.includes(member.branch));
      if (linkedMember) $('activities-branch').value = linkedMember.branch;
      $('activities-branch').closest('label').hidden = data.branches.length === 1;
      $('activities-app').hidden = false; render(); $('activities-status').textContent = '';
      const params = new URLSearchParams(location.search), eventId = params.get('event');
      selectLinkedSection();
      if (eventId) {
        const event = data.events.find(item => String(item.id) === eventId);
        if (event) {
          $('activities-branch').value = event.branch; render();
          openEvent(event, params.get('presenze') === '1', params.get('vista') === 'torneo');
          const view = params.get('ora') === '1' ? 'ora' : params.get('vista') ||
            (params.get('presenze') === '1' ? 'presenze' : 'programma');
          setEventView(view);
          if (view === 'ora') queueMicrotask(() => $('event-live').focus());
          if (params.get('filtro') === 'unpaid') {
            $('event-member-filter').value = 'unpaid'; $('event-filters').open = true; filterAttendance();
          }
        }
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
