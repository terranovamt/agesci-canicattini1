(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const M = window.SOCI_MODEL, A = window.ACCESSO, filters = $('members-filters');
  const profileForm = $('member-form');
  let data, busy = false, editing = null, drafts = {}, educationBranch = '', preview = null, formSnapshot = '';
  let memberSection = 0;
  const allMemberSections = ['activities', 'education', 'profile', 'contacts', 'guardians', 'censuses'];
  let memberSections = allMemberSections;
  let pathLoadToken = 0;
  let memberPaths = [], memberPathSaving = false;
  let guardianNextIndex = 0;
  const selected = new Set();
  let sortKey = '', sortDirection = 0;
  const sortButtons = [...document.querySelectorAll('[data-sort]')];
  for (const button of sortButtons) {
    const label = button.textContent;
    button.dataset.label = label;
    button.onclick = () => {
      sortDirection = sortKey === button.dataset.sort ? (sortDirection + 1) % 3 : 1;
      sortKey = sortDirection ? button.dataset.sort : '';
      render();
    };
  }
  const unitBoard = window.SOCI_UNITS({ perform: run, reload: load, openMember });
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function options(select, items, first) {
    select.replaceChildren();
    for (const [value, label] of [...(first ? [first] : []), ...items]) {
      const option = node('option', label); option.value = value; select.append(option);
    }
  }
  function branchOptions(select, first) {
    const branches = window.NAS?.user?.admin ? M.branches : [window.NAS?.user?.serviceBranch].filter(Boolean);
    options(select, branches.map(branch => [branch, M.branchLabel(branch)]), first);
  }
  function input(labelText, name, value, definition = {}) {
    if (definition.type === 'multiselect') {
      const group = node('fieldset', undefined, 'members-choice-field members-wide');
      const selected = M.selectedChoices(value);
      const selectedList = node('div', undefined, 'members-selected-choices');
      const details = node('details');
      const summary = node('summary');
      const summaryAction = node('span');
      const summaryCount = node('span', undefined, 'members-choice-count');
      const choiceLabel = labelText.toLocaleLowerCase('it').replace('specialita', 'specialità');
      summary.append(summaryAction, summaryCount);
      const updateCount = () => {
        const values = [...group.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
        summaryAction.textContent = values.length ? 'Modifica' : 'Scegli ' + choiceLabel;
        summaryCount.textContent = values.length
          ? ` · ${values.length} ${values.length === 1 ? 'selezionata' : 'selezionate'}` : '';
        selectedList.replaceChildren(...values.map(value => {
          const item = node('span', undefined, 'members-selected-choice');
          const remove = node('button', '×');
          remove.type = 'button'; remove.setAttribute('aria-label', 'Rimuovi ' + value);
          remove.onclick = () => {
            const checkbox = [...choices.querySelectorAll('input')].find(input => input.value === value);
            checkbox.checked = false; updateCount();
            (selectedList.querySelectorAll('button')[values.indexOf(value)] || summary).focus();
          };
          item.append(node('span', value), remove); return item;
        }));
        if (!values.length) selectedList.append(node('span', 'Nessuna assegnata', 'members-note'));
      };
      group.append(node('legend', labelText));
      group.append(selectedList);
      details.append(summary);
      const searchLabel = node('label', 'Cerca ' + labelText.toLocaleLowerCase('it'));
      const search = node('input'); search.type = 'search'; search.placeholder = 'Scrivi per filtrare'; search.setAttribute('aria-label', 'Cerca ' + labelText.toLocaleLowerCase('it'));
      searchLabel.append(search); details.append(searchLabel);
      const choices = node('div', undefined, 'members-choice-list');
      const empty = node('p', 'Nessuna voce corrisponde alla ricerca.', 'members-note');
      empty.hidden = true;
      for (const item of [...definition.options, ...selected.filter(item => !definition.options.includes(item))]) {
        const label = node('label', item + (definition.options.includes(item) ? '' : ' (valore precedente)'));
        const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.name = name;
        checkbox.value = item; checkbox.checked = selected.includes(item);
        checkbox.onchange = updateCount;
        label.prepend(checkbox); choices.append(label);
      }
      search.oninput = () => {
        const query = search.value.trim().toLocaleLowerCase('it');
        for (const label of choices.children) label.hidden = !label.textContent.toLocaleLowerCase('it').includes(query);
        empty.hidden = [...choices.children].some(label => !label.hidden);
      };
      details.append(choices, empty); group.append(details); updateCount();
      details.addEventListener('toggle', () => { if (details.open) search.focus(); });
      return group;
    }
    const label = node('label', labelText);
    const el = node(definition.type === 'select' ? 'select' : definition.long ? 'textarea' : 'input');
    el.name = name;
    if (definition.type === 'select') {
      const items = definition.options.map(v => [v, v]);
      if (value && !definition.options.includes(value)) items.push([value, value + ' (valore precedente)']);
      options(el, items, ['', 'Non indicato']);
    }
    else {
      if (!definition.long) el.type = definition.type || 'text';
      el.maxLength = definition.max || 500;
    }
    if (definition.long) { el.rows = 4; label.className = 'members-wide'; }
    el.value = value || '';
    label.append(el);
    return label;
  }
  function census(member) {
    const year = filters.elements.year.value;
    return year ? member.censuses.find(item => item.year === year) : member.censuses[0];
  }
  function age(member) {
    if (!member.profile.birthDate) return null;
    const birth = new Date(member.profile.birthDate), today = new Date();
    return today.getFullYear() - birth.getUTCFullYear() -
      (today.getMonth() < birth.getUTCMonth() || (today.getMonth() === birth.getUTCMonth() && today.getDate() < birth.getUTCDate()) ? 1 : 0);
  }
  function results() {
    const f = filters.elements, query = f.search.value.trim().toLocaleLowerCase('it');
    return data.members.filter(member => {
      const current = census(member), years = age(member);
      if (!f.showSuspended.checked && M.longSuspended(member, data.currentYear)) return false;
      if (f.birthYear.value && member.profile.birthDate?.slice(0, 4) !== f.birthYear.value) return false;
      if (query && ![member.name, member.code, ...Object.values(member.profile).filter(v => typeof v === 'string'),
        ...(member.profile.guardianContacts || []).flatMap(contact => Object.values(contact))]
        .join(' ').toLocaleLowerCase('it').includes(query)) return false;
      if (f.branch.value && member.branch !== f.branch.value) return false;
      if (f.year.value && !current) return false;
      if (f.status.value && current?.status !== f.status.value) return false;
      if (f.minAge.value && (years === null || years < Number(f.minAge.value))) return false;
      if (f.maxAge.value && (years === null || years > Number(f.maxAge.value))) return false;
      if (f.quality.value === 'contacts' && (member.profile.email || member.profile.phone)) return false;
      if (f.quality.value === 'incomplete' && member.profile.givenName && member.profile.surname && member.profile.birthDate) return false;
      if (f.field.value) {
        const [branch, key] = f.field.value.split(':');
        if (member.branch !== branch) return false;
        const stored = member.values[branch]?.[key];
        const value = Array.isArray(stored) ? stored.join('; ') : stored || '';
        if (f.missing.checked ? !!value : !value.toLocaleLowerCase('it').includes(f.value.value.toLocaleLowerCase('it'))) return false;
      }
      return true;
    });
  }
  function chosen() { return data.members.filter(member => selected.has(member.id)); }
  function updateSelection() {
    $('members-count').textContent = `${results().length} risultati · ${selected.size} selezionati`;
    $('open-macro').disabled = !selected.size;
    $('members-selection').hidden = !selected.size;
    const passage = passageSelection();
    $('open-macro').textContent = passage.error ? 'Proponi passaggio' : `Proponi passaggio ${M.branchLabel(passage.source)} → ${M.branchLabel(passage.target)}`;
    $('macro-error').hidden = true;
  }
  function render() {
    const visible = results(), rows = [];
    if (!filters.elements.showSuspended.checked)
      data.members.filter(member => M.longSuspended(member, data.currentYear)).forEach(member => selected.delete(member.id));
    const countable = data.members.filter(member => filters.elements.showSuspended.checked || !M.longSuspended(member, data.currentYear));
    $('members-summary').replaceChildren(...M.branches.filter(branch => window.NAS.user.admin || branch === window.NAS.user.serviceBranch).map(branch => {
      const card = node('button'); card.type = 'button';
      card.style.setProperty('--branch-color', M.branchColors[branch]);
      card.setAttribute('aria-pressed', String(filters.elements.branch.value === branch));
      card.dataset.branch = branch;
      card.title = M.branchLabel(branch, true);
      card.append(node('span', M.branchLabel(branch)), node('strong', String(countable.filter(m => m.branch === branch).length)));
      card.setAttribute('aria-label', `Filtra ${M.branchLabel(branch)} · ${countable.filter(m => m.branch === branch).length} soci`);
      card.onclick = () => {
        filters.elements.branch.value = filters.elements.branch.value === branch ? '' : branch;
        render();
        [...$('members-summary').children].find(button => button.dataset.branch === branch)?.focus();
      };
      return card;
    }));
    renderQuickFilters();
    for (const chip of document.querySelectorAll('[data-quality]'))
      chip.setAttribute('aria-pressed', String(filters.elements.quality.value === chip.dataset.quality));
    const visibilityNotes = [];
    const visibilities = window.NAS.user.admin ? M.branches.map(branch => {
      const scoped = data.members.filter(member => member.branch === branch);
      const visible = scoped.filter(member => member.kind === 'ragazzo' || !M.pendingCoca(member.profile));
      return { branch, total: scoped.length, excludedPendingCoca: scoped.length - visible.length,
        excludedLongSuspended: visible.filter(member => M.longSuspended(member, data.currentYear)).length };
    }) : data.visibility ? [data.visibility] : [];
    for (const visibility of visibilities) {
      visibilityNotes.push(`${M.branchLabel(visibility.branch)}: ${visibility.total} soci assegnati alla branca.`);
      if (visibility.excludedPendingCoca)
        visibilityNotes.push(`${visibility.excludedPendingCoca} esclusi dalla vista capo: FoCa valorizzato e ingresso Co.Ca. assente o No. L’amministratore puo verificarne le schede.`);
      if (visibility.excludedLongSuspended && !filters.elements.showSuspended.checked)
        visibilityNotes.push(`${visibility.excludedLongSuspended} sospesi da oltre un anno nascosti; puoi includerli dalla ricerca avanzata.`);
      visibilityNotes.push('I passaggi in ingresso non sono ancora soci della branca: compaiono dopo la conferma.');
    }
    $('members-visibility-note').textContent = visibilityNotes.join(' ');
    $('members-diagnostics').hidden = !window.NAS.user.admin;
    $('suspension-note').textContent = `Anno di riferimento: ${data.currentYear}. Esclusi di default i codici D (gia indicati da AGESCI come sospesi da oltre un anno) e i codici S dell'ultimo censimento precedente a questo anno.`;
    const sortValue = member => {
      switch (sortKey) {
        case 'age': return member.profile.birthDate ? -Number(member.profile.birthDate.slice(0, 4)) : null;
        case 'branch': return M.branchLabel(member.branch) || '';
        case 'census': return census(member) ? `${census(member).year} ${census(member).status || ''}` : '';
        case 'contacts': return [member.profile.email, member.profile.phone].filter(Boolean).join(' ');
        default: return member.name;
      }
    };
    if (sortKey) visible.sort((a, b) => {
      const left = sortValue(a), right = sortValue(b);
      if (left === null || left === '') return right === null || right === '' ? 0 : 1;
      if (right === null || right === '') return -1;
      return (typeof left === 'number' ? left - right : left.localeCompare(right, 'it', { numeric: true })) * (sortDirection === 1 ? 1 : -1);
    });
    if (filters.elements.groupBirthYear.checked) visible.sort((a, b) =>
      (a.profile.birthDate?.slice(0, 4) || '9999').localeCompare(b.profile.birthDate?.slice(0, 4) || '9999') ||
      (sortKey ? 0 : a.name.localeCompare(b.name)));
    for (const button of sortButtons) {
      const active = sortKey === button.dataset.sort;
      button.parentElement.setAttribute('aria-sort', active ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none');
      button.textContent = button.dataset.label + (active ? (sortDirection === 1 ? ' ↑' : ' ↓') : '');
      button.setAttribute('aria-label', button.dataset.label + ': ' +
        (active ? sortDirection === 1 ? 'crescente; clicca per decrescente' : 'decrescente; clicca per eliminare l’ordinamento' : 'clicca per ordinare crescente'));
    }
    let group = null;
    for (const member of visible) {
      const birthYear = member.profile.birthDate?.slice(0, 4) || '';
      if (filters.elements.groupBirthYear.checked && birthYear !== group) {
        group = birthYear;
        const row = node('tr'), cell = node('td');
        cell.colSpan = 6;
        const button = node('button', (birthYear ? 'Nati nel ' + birthYear : 'Nascita non indicata') + ' · Seleziona questo gruppo', 'member-name');
        button.type = 'button';
        button.onclick = () => { visible.filter(m => (m.profile.birthDate?.slice(0, 4) || '') === birthYear).forEach(m => selected.add(m.id)); render(); };
        cell.append(button); row.append(cell); rows.push(row);
      }
      const row = node('tr'), checkCell = node('td'), checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.checked = selected.has(member.id);
      checkbox.setAttribute('aria-label', 'Seleziona ' + member.name);
      checkbox.onchange = () => { checkbox.checked ? selected.add(member.id) : selected.delete(member.id); updateSelection(); };
      const checkLabel = node('label', undefined, 'members-row-select');
      checkLabel.append(checkbox); checkCell.append(checkLabel);
      const nameCell = node('td'), name = node('button', member.name, 'member-name');
      name.type = 'button'; name.onclick = () => openMember(member);
      row.onclick = event => { if (!event.target.closest('button, label, input, a')) openMember(member); };
      nameCell.append(name, node('span', member.code, 'member-code'));
      const branchCell = node('td'), branchBadge = node('span', M.branchLabel(member.branch) || 'Da assegnare', 'member-badge');
      if (M.branchColors[member.branch]) branchBadge.style.setProperty('--branch-color', M.branchColors[member.branch]);
      branchCell.append(branchBadge);
      const current = census(member);
      const censusCell = node('td', current ? `${current.year} · ${current.status || 'Status non indicato'}` : 'Nessun censimento');
      if (current) censusCell.append(node('span', M.branchLabel(current.branch), 'member-code'));
      row.append(checkCell, nameCell, branchCell, node('td', `${age(member) ?? '—'}${birthYear ? ' · ' + birthYear : ''}`), censusCell,
        node('td', [member.profile.email, member.profile.phone].filter(Boolean).join(' · ') || 'Non indicati'));
      if (member.kind === 'ragazzo' && !(member.profile.guardianContacts || M.parseGuardians(member.profile.guardians).contacts).some(guardian => guardian.phone || guardian.email))
        row.lastElementChild.append(node('span', 'Genitori senza contatti', 'member-code member-missing'));
      else if (member.kind !== 'ragazzo' && (!member.profile.email || !member.profile.phone) && (member.profile.email || member.profile.phone))
        row.lastElementChild.append(node('span', 'Manca ' + (member.profile.email ? 'telefono' : 'email'), 'member-code member-missing'));
      rows.push(row);
    }
    if (!rows.length) {
      const row = node('tr'), cell = node('td', 'Nessun socio corrisponde ai filtri.'); cell.colSpan = 6; row.append(cell); rows.push(row);
    }
    $('members-list').replaceChildren(...rows);
    updateSelection();
  }
  function renderQuickFilters() {
    const container = $('members-quick-filters');
    container.replaceChildren();
    for (const [key, label] of Object.entries({
      search: 'Ricerca', branch: 'Branca', year: 'Anno censimento', status: 'Stato AGESCI',
      showSuspended: 'Sospesi inclusi', minAge: 'Età minima', maxAge: 'Età massima',
      birthYear: 'Anno di nascita', groupBirthYear: 'Raggruppati per nascita', quality: 'Verifica',
      field: 'Campo educativo', value: 'Valore', missing: 'Campo educativo vuoto',
    })) {
      const control = filters.elements[key], checked = control.type === 'checkbox';
      if (checked ? !control.checked : !control.value) continue;
      const value = control.tagName === 'SELECT' ? control.selectedOptions[0].textContent : control.value;
      const text = checked ? label : `${label}: ${value}`;
      const button = node('button', text + ' ×', 'members-filter-chip');
      button.type = 'button'; button.dataset.filterKey = key;
      button.setAttribute('aria-label', 'Rimuovi filtro ' + text);
      button.onclick = () => {
        if (checked) control.checked = false;
        else control.value = '';
        if (key === 'field') { filters.elements.value.value = ''; filters.elements.missing.checked = false; }
        render();
        (container.querySelector('button') || filters.elements.search).focus();
      };
      container.append(button);
    }
    container.hidden = !container.children.length;
    $('members-active-filters').hidden = container.hidden;
  }
  function renderTransfers() {
    const reviewable = data.transfers.filter(transfer => transfer.canConfirm).length;
    const transfersTab = $('transfers-tab');
    if (!data.transfers.length && transfersTab.getAttribute('aria-pressed') === 'true') {
      transfersTab.closest('[data-section-nav]').dispatchEvent(
        new CustomEvent('section-select', { detail: 'members-search-panel' }));
    }
    transfersTab.hidden = !data.transfers.length;
    $('transfers-tab').textContent = 'Passaggi' + (data.transfers.length ? ` · ${data.transfers.length}` : '');
    $('members-incoming').hidden = !reviewable;
    $('members-incoming').textContent = `${reviewable} passaggi da accettare o rifiutare →`;
    $('members-incoming').onclick = () => $('transfers-tab').click();
    $('members-transfers').replaceChildren(...data.transfers.map(transfer => {
      const card = node('article', undefined, 'members-census');
      card.append(node('p', `${transfer.name} · ${transfer.code} · ${transfer.birthYear || 'Nascita non indicata'} · ${M.branchLabel(transfer.source)} → ${M.branchLabel(transfer.target)}`));
      if (!transfer.canConfirm)
        card.append(node('p', 'In attesa di un altro capo della destinazione o dell’amministratore.', 'members-note'));
      for (const [action, label, allowed] of [['confirm', 'Conferma ingresso', transfer.canConfirm],
        ['reject', 'Rifiuta passaggio', transfer.canConfirm], ['cancel', 'Annulla proposta', transfer.canCancel]]) {
        if (!allowed) continue;
        const button = node('button', label, 'button button-secondary');
        button.type = 'button';
        button.onclick = () => {
          if (action !== 'confirm' && !confirm(`${label} per ${transfer.name}?`)) return;
          run(async () => { await A.request('members/transfers/' + transfer.id, 'PATCH', { action, revision: transfer.revision }); await load(); });
        };
        card.append(button);
      }
      return card;
    }));
    if (!data.transfers.length) $('members-transfers').append(node('p', 'Nessun passaggio in attesa.'));
  }
  async function load() {
    data = await A.request('members');
    selected.clear();
    const oldYear = filters.elements.year.value, oldStatus = filters.elements.status.value, oldField = filters.elements.field.value;
    const oldBirthYear = filters.elements.birthYear.value;
    options(filters.elements.birthYear, [...new Set(data.members.map(m => m.profile.birthDate?.slice(0, 4)).filter(Boolean))].sort().map(v => [v, v]), ['', 'Tutti gli anni']);
    if ([...filters.elements.birthYear.options].some(o => o.value === oldBirthYear)) filters.elements.birthYear.value = oldBirthYear;
    options(filters.elements.year, [...new Set(data.members.flatMap(m => m.censuses.map(c => c.year)))].sort().reverse().map(v => [v, v]), ['', 'Ultimo disponibile per socio']);
    options(filters.elements.status, [...new Set(data.members.flatMap(m => m.censuses.map(c => c.status)).filter(Boolean))].sort().map(v => [v, v]), ['', 'Tutti gli status']);
    options(filters.elements.field, data.fields.map(field => [field.branch + ':' + field.key, M.branchLabel(field.branch) + ' · ' + field.label]), ['', 'Tutti i campi']);
    for (const [key, value] of [['year', oldYear], ['status', oldStatus], ['field', oldField]])
      if ([...filters.elements[key].options].some(o => o.value === value)) filters.elements[key].value = value;
    options($('document-template'), data.templates.map(template => [String(template.id), template.title]));
    const firstShow = $('members-app').hidden;
    $('members-app').hidden = false;
    renderTransfers();
    render();
    if (firstShow && innerHeight > 500) filters.elements.search.focus({ preventScroll: true });
    unitBoard.update(data);
  }
  async function run(action, errorTarget = $('members-status'), successMessage = 'Operazione completata.') {
    if (busy) return;
    busy = true;
    $('members-app').inert = true;
    document.querySelectorAll('dialog button').forEach(button => { button.disabled = true; });
    errorTarget.textContent = 'Operazione in corso...'; errorTarget.dataset.tone = 'progress';
    try {
      await action(); errorTarget.textContent = '';
      $('members-status').textContent = successMessage;
      $('members-status').dataset.tone = 'success';
    }
    catch (error) {
      errorTarget.textContent = error.message; errorTarget.dataset.tone = 'error';
      if (!window.NAS.user) {
        data = null; selected.clear(); preview = null;
        $('members-app').hidden = true;
        $('members-list').replaceChildren(); $('members-print').replaceChildren();
        document.querySelectorAll('dialog').forEach(dialog => dialog.close());
        $('members-status').textContent = error.message; $('members-status').dataset.tone = 'error';
      }
    }
    finally {
      busy = false; $('members-app').inert = false;
      document.querySelectorAll('dialog button').forEach(button => { button.disabled = false; });
      if ($('member-dialog').open) configureMemberSections();
      $('confirm-import').disabled = !preview;
      if (data) updateSelection();
    }
  }
  const excludedProfileKeys = ['guardianType', 'guardians', 'foca', 'coca', ...M.ignoredProfileFields];
  const contactKeys = ['address', 'streetNumber', 'town', 'province', 'postalCode', 'email', 'phone'];
  const assignmentField = field => ['L/C', 'E/G'].includes(field.branch) && [M.unitField(field.branch), 'ruolo'].includes(field.key);
  const legacyPista = field => field.branch === 'L/C' && field.key === 'pista' && field.type === 'text' &&
    ['Pista / sentiero', 'Pista', 'Sentiero'].includes(field.label);
  const editableEducation = field => !assignmentField(field) && !legacyPista(field);
  function educationDraft() {
    if (educationBranch && memberSections.includes('education')) {
      const formData = new FormData(profileForm);
      drafts[educationBranch] = { ...drafts[educationBranch], ...Object.fromEntries(data.fields.filter(field => field.branch === educationBranch && editableEducation(field))
        .map(field => [field.key, field.type === 'multiselect' ? formData.getAll('extra:' + field.key) : formData.get('extra:' + field.key) || ''])) };
    }
  }
  function appendGuardian(contact = {}) {
    const index = guardianNextIndex++;
    const card = node('section', undefined, 'guardian-card');
    card.dataset.guardianIndex = index;
    card.append(node('h4', 'Responsabile ' + ($('member-guardians').children.length + 1)));
    const grid = node('div', undefined, 'members-form-grid');
    for (const key of ['fullName', 'taxCode', 'phone', 'birthTown', 'birthDate', 'email']) {
      const label = M.guardianFields[key];
      const value = key === 'fullName' ? [contact.givenName, contact.surname].filter(Boolean).join(' ') || contact.fullName : contact[key];
      const field = input(label, 'guardian:' + index + ':' + key, value, key === 'birthDate' ? { type: 'date' } : {});
      const control = field.querySelector('input');
      if (key === 'fullName') { control.required = true; field.classList.add('members-wide'); }
      if (key === 'taxCode') { control.maxLength = 16; control.pattern = '[A-Za-z0-9]{16}'; }
      if (key === 'phone') control.type = 'tel';
      if (key === 'email') { control.type = 'email'; field.classList.add('members-wide'); }
      grid.append(field);
    }
    const remove = node('button', 'Rimuovi responsabile', 'button button-secondary');
    remove.type = 'button';
    remove.onclick = () => { if (confirm('Rimuovere questo responsabile dalla scheda? Il testo originale AGESCI resta conservato.')) card.remove(); };
    card.append(grid, remove); $('member-guardians').append(card);
  }
  function guardianPayload() {
    const formData = new FormData(profileForm);
    return [...$('member-guardians').children].map(card => Object.fromEntries(Object.keys(M.guardianFields).filter(key => !['givenName', 'surname'].includes(key))
      .map(key => [key, formData.get('guardian:' + card.dataset.guardianIndex + ':' + key) || ''])));
  }
  $('add-guardian').onclick = () => {
    if ($('member-guardians').children.length >= 20) {
      $('member-guardian-warning').textContent = 'Massimo 20 responsabili per scheda.';
      return;
    }
    appendGuardian();
    $('member-guardians').lastElementChild.querySelector('input:not([readonly])').focus();
  };
  function renderEducation() {
    educationBranch = profileForm.elements.branch.value;
    const assignment = $('member-assignment');
    const order = ['promessa', 'anno', 'tappa', 'progressione', 'specialita', 'brevetti'];
    const fields = data.fields.filter(field => field.branch === educationBranch && editableEducation(field))
      .sort((a, b) => (order.includes(a.key) ? order.indexOf(a.key) : order.length) -
        (order.includes(b.key) ? order.indexOf(b.key) : order.length));
    const controls = fields.map(field => {
      const control = input(field.label, 'extra:' + field.key, drafts[educationBranch]?.[field.key], { ...educationDefinition(field), max: 2000 });
      control.dataset.educationKey = field.key;
      if (!['promessa', 'anno'].includes(field.key)) control.classList.add('members-wide');
      return control;
    });
    const assignmentIndex = fields.findIndex(field => !['promessa', 'anno', 'tappa', 'progressione'].includes(field.key));
    controls.splice(assignmentIndex < 0 ? controls.length : assignmentIndex, 0, assignment);
    $('member-education').replaceChildren(...controls);
    assignment.replaceChildren();
    if (['L/C', 'E/G'].includes(educationBranch)) {
      const lc = educationBranch === 'L/C', values = drafts[educationBranch] || {};
      const card = node('section', undefined, 'member-assignment-summary');
      card.append(node('h4', lc ? 'Sestiglia e ruolo' : 'Squadriglia e ruolo'),
        node('p', [values[M.unitField(educationBranch)] || 'Non assegnata', values.ruolo || 'Ruolo non assegnato'].join(' · ')));
      const previous = values.pista;
      if (previous && data.fields.some(field => field.branch === educationBranch && legacyPista(field)))
        card.append(node('p', 'Nota di percorso precedente: ' + previous, 'members-note'));
      const history = node('details', undefined, 'member-assignment-history'), list = node('div');
      const historyToggle = node('summary', 'Storico');
      historyToggle.setAttribute('aria-label', 'Storico assegnazioni');
      history.append(historyToggle);
      for (const item of (editing?.assignmentHistory || []).filter(item => item.branch === educationBranch))
        list.append(node('p', `${item.year} · ${item.unit || (lc ? 'Senza sestiglia' : 'Senza squadriglia')} · ${item.role || 'Nessun ruolo'}`));
      if (!list.children.length) list.append(node('p', 'Nessuno storico registrato. Le assegnazioni precedenti all’attivazione dello storico non sono ricostruibili.'));
      history.append(list); card.append(history); assignment.append(card);
    }
  }
  function educationDefinition(field) {
    if (['L/C', 'E/G'].includes(field.branch) && field.key === M.unitField(field.branch) && field.type === 'text') {
      return { ...field, type: 'select', options: data.units.filter(unit => unit.branch === field.branch && !unit.hidden).map(unit => unit.name) };
    }
    return field;
  }
  function drawMemberPaths(member, feedback = '') {
    const list = $('member-paths-list'), status = $('member-paths-status');
    const labels = { hunt: 'Stagione di caccia', specialty: 'Specialità', badge: 'Brevetto' };
    list.replaceChildren(...memberPaths.map(path => {
      const steps = Array.isArray(path.steps) ? path.steps : [];
      const completed = steps.filter(step => step.done).length;
      const state = path.closed ? 'Conclusa' : !completed ? 'Definito'
        : completed === steps.length ? 'Conquistato' : 'In lavorazione';
      const card = node('article', undefined, 'member-individual-path');
      card.dataset.pathId = path.id;
      card.append(node('h4', path.title), node('p',
        `${labels[path.kind] || 'Percorso'} · ${state}${steps.length ? ` · ${completed}/${steps.length} tappe` : ''}`,
        'member-individual-path-status'));
      const items = node('ul', undefined, 'member-path-steps');
      steps.forEach((step, index) => {
        const row = node('li'), label = node('label', undefined, 'member-path-step');
        const checkbox = node('input');
        checkbox.type = 'checkbox'; checkbox.checked = !!step.done;
        checkbox.disabled = memberPathSaving || path.closed;
        checkbox.dataset.stepIndex = index;
        checkbox.setAttribute('aria-label', `${step.title} · ${path.title}`);
        checkbox.onchange = () => updateMemberPath(member, path, {
          steps: steps.map((item, stepIndex) => stepIndex === index
            ? { ...item, done: checkbox.checked } : item),
        });
        label.append(checkbox, node('span', step.title));
        row.append(label); items.append(row);
      });
      card.append(items);
      if (path.kind === 'hunt' && !path.closed && steps.length && steps.every(step => step.done)) {
        const close = node('button', 'Concludi caccia', 'button button-secondary');
        close.type = 'button'; close.disabled = memberPathSaving;
        close.onclick = () => updateMemberPath(member, path, { closed: true });
        card.append(close);
      }
      if (state === 'Conquistato' && ['specialty', 'badge'].includes(path.kind)) {
        const key = path.kind === 'specialty' ? 'specialita' : 'brevetti';
        const field = data.fields.find(item => item.branch === member.branch && item.key === key);
        const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
        const current = M.selectedChoices(member.values?.[member.branch]?.[key]);
        const option = field?.options?.find(value => normalize(value) === normalize(path.title)) ||
          current.find(value => normalize(value) === normalize(path.title));
        if (option && current.includes(option)) {
          card.append(node('p', path.kind === 'specialty' ? 'Specialità assegnata' : 'Brevetto assegnato',
            'member-path-awarded'));
        } else if (option) {
          const award = node('button', path.kind === 'specialty' ? 'Assegna specialità' : 'Assegna brevetto',
            'button button-secondary');
          award.type = 'button'; award.disabled = memberPathSaving;
          award.onclick = () => assignMemberPathAward(member, path, key, option);
          card.append(award);
        } else {
          card.append(node('p', 'Titolo non presente nell’elenco delle assegnazioni.', 'members-note'));
        }
      }
      return card;
    }));
    status.textContent = feedback || (memberPaths.length ? '' : 'Nessun percorso. Aggiungine uno.');
  }
  async function updateMemberPath(member, path, changes) {
    if (memberPathSaving) return;
    memberPathSaving = true;
    $('member-paths-status').textContent = 'Salvataggio…';
    $('member-paths-list').querySelectorAll('input, button').forEach(control => { control.disabled = true; });
    let feedback = 'Salvato.';
    try {
      const saved = await A.request('activities/paths/' + path.id, 'PATCH', {
        kind: path.kind, personId: path.personId, title: path.title,
        steps: changes.steps || path.steps, closed: changes.closed ?? path.closed,
        branch: path.branch, revision: path.revision,
      });
      memberPaths = memberPaths.map(item => item.id === saved.id ? saved : item);
    } catch (error) {
      feedback = 'Modifica non salvata: ' + error.message;
    } finally {
      memberPathSaving = false;
      if (editing?.id === member.id) drawMemberPaths(member, feedback);
    }
  }
  async function assignMemberPathAward(member, path, key, option) {
    if (memberPathSaving || busy) {
      $('member-paths-status').textContent = 'Attendi il salvataggio in corso.';
      return;
    }
    memberPathSaving = true;
    $('member-paths-status').textContent = 'Assegnazione…';
    $('member-paths-list').querySelectorAll('input, button').forEach(control => { control.disabled = true; });
    $('member-save').disabled = true;
    let feedback = '';
    try {
      const currentMember = editing?.id === member.id ? editing : member;
      const wasDirty = dirty();
      educationDraft();
      const savedValues = currentMember.values?.[member.branch] || {};
      const awarded = M.selectedChoices(savedValues[key]);
      if (awarded.includes(option)) {
        feedback = 'Già assegnata.';
        return;
      }
      const result = await A.request('members/' + member.id, 'PATCH', {
        code: currentMember.code, branch: member.branch, profile: currentMember.profile,
        values: { ...savedValues, [key]: [...awarded, option] }, revision: currentMember.revision,
      });
      if (!result?.member) throw new Error('Risposta di salvataggio non valida');
      editing = result.member;
      data.members = data.members.map(item => item.id === editing.id ? editing : item);
      const draftValues = M.selectedChoices(drafts[member.branch]?.[key] ?? awarded);
      drafts[member.branch] = { ...drafts[member.branch], [key]: [...new Set([...draftValues, option])] };
      if (educationBranch === member.branch) renderEducation();
      if (!wasDirty) formSnapshot = JSON.stringify([...new FormData(profileForm)]);
      feedback = path.kind === 'specialty' ? 'Specialità assegnata.' : 'Brevetto assegnato.';
    } catch (error) {
      feedback = 'Assegnazione non salvata: ' + error.message;
    } finally {
      memberPathSaving = false;
      $('member-save').disabled = false;
      if (editing?.id === member.id)
        drawMemberPaths(editing, feedback);
    }
  }
  async function renderMemberPaths(member) {
    const token = ++pathLoadToken;
    const section = $('member-paths'), status = $('member-paths-status'), link = $('member-paths-link');
    const supportsPaths = member?.kind === 'ragazzo' && ['L/C', 'E/G'].includes(member.branch);
    memberPaths = [];
    $('member-paths-list').replaceChildren();
    section.hidden = !supportsPaths;
    if (!supportsPaths) {
      status.textContent = '';
      return;
    }
    $('member-paths-heading').textContent = member.branch === 'L/C' ? 'Specialità e caccia' : 'Specialità e brevetti';
    link.hidden = false;
    link.textContent = 'Apri nei percorsi →';
    link.href = 'attivita.html?member=' + encodeURIComponent(member.id) + '#paths-panel';
    status.textContent = 'Caricamento…';
    try {
      const result = await A.request('activities');
      if (token !== pathLoadToken || editing?.id !== member.id) return;
      if (!Array.isArray(result.paths)) throw new Error('Dati dei percorsi non validi');
      memberPaths = result.paths.filter(path => path.personId === member.id && path.branch === member.branch);
      drawMemberPaths(member);
    } catch (error) {
      if (token !== pathLoadToken || editing?.id !== member.id) return;
      status.textContent = 'Percorsi non disponibili: ' + error.message;
    }
  }
  function configureMemberSections() {
    const current = memberSections[memberSection];
    const adult = M.isAdult({ ...editing, branch: profileForm.elements.branch.value });
    memberSections = allMemberSections.filter(section => !adult || !['guardians', 'education'].includes(section));
    for (const section of allMemberSections) {
      const omitted = !memberSections.includes(section);
      const tab = $('member-tab-' + section), panel = $('member-panel-' + section);
      tab.hidden = omitted;
      panel.hidden = omitted;
      if (omitted) {
        tab.tabIndex = -1;
        tab.setAttribute('aria-selected', 'false');
      }
      if (['guardians', 'education'].includes(section))
        panel.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = omitted; });
    }
    $('member-education-context').hidden = !adult;
    $('member-activities-context').hidden = !!editing && !adult;
    $('member-activities-context').textContent = adult
      ? 'Lo storico delle partecipazioni dei ragazzi non si applica ai soci adulti.'
      : 'Salva la nuova scheda per consultare attività e quote.';
    showMemberSection(Math.max(0, memberSections.indexOf(current)));
  }
  function showMemberSection(index, focus = false) {
    memberSection = Math.max(0, Math.min(memberSections.length - 1, index));
    memberSections.forEach((section, i) => {
      const tab = $('member-tab-' + section);
      tab.setAttribute('aria-selected', String(i === memberSection));
      tab.tabIndex = i === memberSection ? 0 : -1;
      $('member-panel-' + section).hidden = i !== memberSection;
    });
    if (focus) $('member-tab-' + memberSections[memberSection]).focus();
    $('member-panel-' + memberSections[memberSection]).scrollTop = 0;
    $('member-tab-' + memberSections[memberSection]).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function renderGlance(member) {
    const list = $('member-glance');
    list.replaceChildren();
    if (!member) return;
    const profile = member.profile || {}, adult = M.isAdult(member);
    const add = (text, section, warn) => {
      const item = node('li'), chip = node(section ? 'button' : 'span', text, 'member-chip');
      if (warn) chip.dataset.warn = 'yes';
      if (section) { chip.type = 'button'; chip.onclick = () => showMemberSection(memberSections.indexOf(section), true); }
      item.append(chip); list.append(item);
    };
    add(M.branchLabel(member.branch) || 'Da assegnare');
    const years = age(member);
    if (years !== null && years !== undefined) add(years + ' anni');
    const current = census(member);
    add(current ? `Censimento ${current.year} · ${current.status || 'status n.i.'}` : 'Nessun censimento', 'censuses', !current);
    if (adult) {
      const missing = [profile.email ? '' : 'email', profile.phone ? '' : 'telefono'].filter(Boolean);
      add(missing.length ? 'Manca ' + missing.join(' e ') : 'Contatti completi', 'contacts', !!missing.length);
    } else {
      const guardians = profile.guardianContacts || M.parseGuardians(profile.guardians).contacts;
      const reachable = guardians.some(guardian => guardian.phone || guardian.email);
      add(!guardians.length ? 'Nessun genitore indicato' : reachable ? `Genitori: ${guardians.length}` : 'Genitori senza contatti', 'guardians', !reachable);
      if (!profile.email && !profile.phone && !reachable) add('Nessun contatto', 'contacts', true);
    }
  }
  function openMember(member, initialSection = 'activities') {
    editing = member;
    window.MEMBER_ACTIVITIES?.load(member);
    memberSections = allMemberSections;
    memberSection = Math.max(0, allMemberSections.indexOf(initialSection));
    renderMemberPaths(member);
    drafts = structuredClone(member?.values || {});
    educationBranch = '';
    profileForm.reset();
    $('member-error').textContent = '';
    $('member-title').textContent = member ? member.name : 'Nuovo socio';
    profileForm.elements.code.value = member?.code || '';
    profileForm.elements.code.readOnly = !!member;
    profileForm.elements.branch.value = member?.branch || 'L/C';
    profileForm.elements.branch.disabled = !!member && (!window.NAS.user.admin || member.revision > 0);
    const profile = { ...member?.profile };
    if (member && !Object.keys(profile).length) profile.givenName = member.name;
    for (const [target, keys] of [
      [$('member-profile'), Object.keys(M.profileFields).filter(key => !excludedProfileKeys.includes(key) && !contactKeys.includes(key))],
      [$('member-contacts'), contactKeys],
      [$('member-guardian-type'), ['guardianType']], [$('member-guardian-source'), ['guardians']],
    ]) {
      target.replaceChildren(...keys.map(key => {
        const definition = key === 'birthDate' ? { type: 'date' } : key === 'guardians' ? { long: true, max: 12000 }
          : key === 'email' ? { type: 'email' } : key === 'phone' ? { type: 'tel' }
          : key === 'sex' ? { type: 'select', options: ['M', 'F'] }
          : key === 'digital' ? { type: 'select', options: ['True', 'False'] }
          : {};
        return input(M.profileFields[key], 'profile:' + key, profile[key], definition);
      }));
    }
    $('member-guardian-source').querySelector('input,textarea').readOnly = true;
    guardianNextIndex = 0;
    $('member-guardians').replaceChildren();
    const parsedGuardians = M.parseGuardians(profile.guardians);
    (profile.guardianContacts || parsedGuardians.contacts).forEach(appendGuardian);
    const contacts = profile.guardianContacts || parsedGuardians.contacts;
    const codes = contacts.map(contact => contact.taxCode).filter(Boolean);
    $('member-guardian-warning').textContent = [
      parsedGuardians.unparsed.length ? 'Alcuni dati non sono separabili: consulta il testo originale e completa i campi.' : '',
      new Set(codes).size !== codes.length ? 'Ci sono responsabili con lo stesso CF: verifica i duplicati prima di rimuoverli.' : '',
    ].filter(Boolean).join(' ');
    $('member-censuses').replaceChildren(...(member?.censuses || []).map(current => {
      const section = node('section', undefined, 'members-census'), dl = node('dl');
      section.append(node('h3', 'Anno scout ' + current.year));
      for (const [key, label] of Object.entries(M.censusFields))
        dl.append(node('dt', label), node('dd', (key === 'branch' ? M.branchLabel(current[key]) : current[key]) || 'Non indicato'));
      section.append(dl); return section;
    }));
    if (!member?.censuses.length) $('member-censuses').append(node('p', 'Nessun censimento importato.'));
    renderEducation();
    configureMemberSections();
    renderGlance(member);
    formSnapshot = JSON.stringify([...new FormData(profileForm)]);
    $('member-dialog').showModal();
  }
  profileForm.elements.branch.onchange = () => {
    const oldBranch = educationBranch;
    educationDraft();
    const definitions = data.fields.filter(field => field.branch === oldBranch);
    const changed = definitions.some(field => JSON.stringify(drafts[oldBranch]?.[field.key] || '') !==
      JSON.stringify(field.type === 'multiselect' ? M.selectedChoices(editing?.values[oldBranch]?.[field.key]) : editing?.values[oldBranch]?.[field.key] || ''));
    if (changed && !confirm('Il percorso non salvato della branca precedente non verra salvato. Continuare il passaggio?')) {
      profileForm.elements.branch.value = oldBranch;
      return;
    }
    drafts[oldBranch] = { ...editing?.values[oldBranch] };
    renderEducation();
    configureMemberSections();
  };
  allMemberSections.forEach(section => {
    $('member-tab-' + section).onclick = () => {
      if (memberSections.includes(section)) showMemberSection(memberSections.indexOf(section));
    };
    $('member-tab-' + section).onkeydown = event => {
      const index = memberSections.indexOf(section);
      if (index < 0) return;
      const next = event.key === 'ArrowRight' ? (index + 1) % memberSections.length
        : event.key === 'ArrowLeft' ? (index - 1 + memberSections.length) % memberSections.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? memberSections.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      showMemberSection(next, true);
    };
  });
  let revealingInvalid = false;
  profileForm.addEventListener('invalid', event => {
    if (revealingInvalid) return;
    revealingInvalid = true;
    queueMicrotask(() => { revealingInvalid = false; });
    const index = memberSections.findIndex(section => $('member-panel-' + section).contains(event.target));
    if (index >= 0) showMemberSection(index);
  }, true);
  profileForm.onsubmit = event => {
    event.preventDefault();
    educationDraft();
    const branch = profileForm.elements.branch.value;
    const profileTargets = ['member-profile', 'member-contacts'];
    const hasGuardianSection = memberSections.includes('guardians');
    if (hasGuardianSection) profileTargets.push('member-guardian-type', 'member-guardian-source');
    const profile = { ...editing?.profile, ...Object.fromEntries(profileTargets
      .flatMap(id => [...$(id).querySelectorAll('input,select,textarea')]).map(el => [el.name.slice(8), el.value])) };
    if (hasGuardianSection) profile.guardianContacts = guardianPayload();
    const payload = { code: profileForm.elements.code.value, branch, profile, values: drafts[branch] || {}, revision: editing?.revision };
    run(async () => {
      await A.request(editing ? 'members/' + editing.id : 'members', editing ? 'PATCH' : 'POST', payload);
      $('member-dialog').close(); await load();
    }, $('member-error'));
  };
  function invalidateImport() { preview = null; $('confirm-import').disabled = true; $('import-preview').replaceChildren(); }
  $('import-csv').oninput = invalidateImport;
  $('import-file').onchange = () => run(async () => {
    invalidateImport();
    const file = $('import-file').files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) throw new Error('CSV troppo grande (massimo 4 MiB)');
    $('import-csv').value = await file.text();
    await analyzeImport();
  }, $('import-error'));
  async function analyzeImport() {
    invalidateImport();
    const csv = $('import-csv').value;
    const result = await A.request('members/import', 'POST', { csv });
    // Retain exactly the analyzed content, not a subsequently edited textarea.
    preview = { csv, version: result.version };
    const list = node('ul');
    list.append(...result.warnings.map(warning => node('li', warning)));
    $('import-preview').append(node('h3', `${result.rows} censimenti · ${result.newCount} nuovi soci · ${result.updatedCount} soci aggiornati`),
      node('p', 'Colonne escluse: ' + (result.ignoredColumns.join(', ') || 'nessuna')), list);
    $('import-section-nav').dispatchEvent(new CustomEvent('section-select', { detail: 'import-review-panel' }));
  }
  $('analyze-import').onclick = () => run(analyzeImport, $('import-error'));
  $('confirm-import').onclick = () => {
    if (!preview) return;
    run(async () => {
      await A.request('members/import', 'POST', { ...preview, confirm: true });
      invalidateImport(); $('import-csv').value = ''; $('import-file').value = '';
      $('import-dialog').close(); await load();
    }, $('import-error'));
  };
  function passageSelection() {
    const members = chosen(), source = members[0]?.branch, target = M.nextBranch(source);
    let error = '';
    if (!members.length) error = 'Seleziona almeno un socio.';
    else if (members.some(member => member.branch !== source)) error = 'Seleziona solo soci della stessa branca.';
    else if (!target) error = 'Non e previsto un passaggio alla branca successiva per R/S o Co.Ca.';
    return { members, source, target, error };
  }
  $('open-macro').onclick = () => {
    const passage = passageSelection();
    if (passage.error) { $('macro-error').textContent = passage.error; $('macro-error').hidden = false; return; }
    const value = { action: 'passage', members: passage.members.map(member => ({ id: member.id, revision: member.revision })) };
    run(async () => { await A.request('members/macro', 'POST', value); await load(); }, undefined, `Passaggio proposto per ${value.members.length} soci: in attesa nella scheda Passaggi.`);
  };
  const fieldForm = $('field-form');
  let suggestedKey = '';
  fieldForm.elements.label.oninput = () => {
    if (!fieldForm.elements.key.value || fieldForm.elements.key.value === suggestedKey) {
      suggestedKey = fieldForm.elements.label.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 40);
      fieldForm.elements.key.value = suggestedKey;
    }
  };
  function fieldOptions() {
    const choice = fieldForm.elements.type.value === 'select';
    $('field-options-label').hidden = !choice;
    fieldForm.elements.options.disabled = !choice;
  }
  fieldForm.elements.type.onchange = fieldOptions;
  fieldOptions();
  fieldForm.onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget, payload = Object.fromEntries(new FormData(form));
    payload.options = (payload.options || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    run(async () => { await A.request('members/fields', 'POST', payload); form.reset(); suggestedKey = ''; fieldOptions(); await load(); });
  };
  $('template-form').onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget, payload = Object.fromEntries(new FormData(form));
    run(async () => { await A.request('members/templates', 'POST', payload); form.reset(); await load(); });
  };
  function docMembers() { return selected.size ? chosen() : results(); }
  function documentTexts() {
    const template = data.templates.find(template => String(template.id) === $('document-template').value);
    return docMembers().map(member => {
      const values = { nome: member.profile.givenName || member.name, cognome: member.profile.surname || '',
        codice: member.code, branca: M.branchLabel(member.branch), anno: census(member)?.year || 'Non indicato',
        email: member.profile.email || '', cellulare: member.profile.phone || '',
        data: new Date().toLocaleDateString('it-IT'),
        percorso: data.fields.filter(field => field.branch === member.branch && !legacyPista(field)).map(field => {
          const value = member.values[member.branch]?.[field.key];
          return `${field.label}: ${(Array.isArray(value) ? value.join('; ') : value) || 'Non indicato'}`;
        }).join('\n') };
      return template.body.replace(/\{\{([^{}]+)\}\}/g, (_, key) => values[key]);
    });
  }
  function renderDocuments() {
    const texts = documentTexts();
    $('document-count').textContent = `${texts.length} document${texts.length === 1 ? 'o' : 'i'}${selected.size ? '' : ' (tutti i risultati)'}`;
    $('print-documents').disabled = !texts.length;
    $('document-preview').replaceChildren(...texts.map(text => node('article', text, 'member-document')));
  }
  $('open-documents').onclick = () => {
    const last = localStorage.getItem('soci-document-template');
    if ([...$('document-template').options].some(o => o.value === last)) $('document-template').value = last;
    renderDocuments(); $('documents-dialog').showModal();
  };
  $('document-template').onchange = () => { localStorage.setItem('soci-document-template', $('document-template').value); renderDocuments(); };
  $('print-documents').onclick = () => {
    $('members-print').replaceChildren(...documentTexts().map(text => node('article', text, 'member-document')));
    $('documents-dialog').close();
    window.print();
  };
  window.addEventListener('afterprint', () => $('members-print').replaceChildren());
  $('export-members').onclick = () => {
    if (!confirm('Esportare i risultati con anagrafica, contatti e campi educativi? Il CSV contiene dati personali: conservarlo in modo sicuro.')) return;
    const profileKeys = Object.keys(M.profileFields).filter(key => !M.ignoredProfileFields.includes(key)), censusKeys = Object.keys(M.censusFields);
    const rows = [['Codice socio', 'Branca', ...profileKeys.map(key => M.profileFields[key]), 'Responsabili genitoriali strutturati', 'Anno scout',
      ...censusKeys.map(key => M.censusFields[key]), ...data.fields.map(field => M.branchLabel(field.branch) + ' - ' + field.label)],
    ...results().map(member => [member.code, M.branchLabel(member.branch), ...profileKeys.map(key => member.profile[key]),
      JSON.stringify(member.profile.guardianContacts || M.parseGuardians(member.profile.guardians).contacts), census(member)?.year,
      ...censusKeys.map(key => key === 'branch' ? M.branchLabel(census(member)?.[key]) : census(member)?.[key]), ...data.fields.map(field => {
        const value = member.values[field.branch]?.[field.key];
        return Array.isArray(value) ? value.join('; ') : value;
      })])];
    const url = URL.createObjectURL(new Blob([M.exportCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = 'soci-gruppo.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  for (const chip of document.querySelectorAll('[data-quality]')) chip.onclick = () => {
    filters.elements.quality.value = filters.elements.quality.value === chip.dataset.quality ? '' : chip.dataset.quality;
    render();
  };
  filters.onsubmit = event => event.preventDefault();
  filters.oninput = () => { if (data) render(); };
  filters.onreset = () => setTimeout(() => {
    if (data) render();
    if (document.activeElement === document.body || document.activeElement?.id === 'members-reset-filters') {
      const advanced = $('members-advanced-search');
      (advanced.open ? filters.elements.search : advanced.querySelector('summary')).focus();
    }
  }, 0);
  $('select-results').onclick = () => { results().forEach(member => selected.add(member.id)); render(); };
  $('clear-selection').onclick = () => { selected.clear(); render(); };
  $('new-member').onclick = () => openMember(null);
  $('open-import').onclick = () => {
    $('import-error').textContent = '';
    $('import-section-nav').dispatchEvent(new CustomEvent('section-select', { detail: preview ? 'import-review-panel' : 'import-source-panel' }));
    $('import-dialog').showModal();
  };
  $('reload-members').onclick = () => run(load, undefined, '');
  const dirty = () => $('member-dialog').open && formSnapshot !== JSON.stringify([...new FormData(profileForm)]);
  const canClose = dialog => !busy && (dialog.id !== 'member-dialog' || !dirty() || confirm('Chiudere senza salvare le modifiche alla scheda?'));
  document.querySelectorAll('[data-close]').forEach(button => {
    button.onclick = () => { const dialog = $(button.dataset.close); if (canClose(dialog)) dialog.close(); };
  });
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { if (!canClose(dialog)) event.preventDefault(); });
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  branchOptions(filters.elements.branch, ['', 'Tutte le branche']);
  branchOptions(profileForm.elements.branch); branchOptions($('field-form').elements.branch);
  $('members-access-link').hidden = $('new-member').hidden = $('open-import').hidden = $('template-form').hidden = !window.NAS?.user?.admin;
  if (!window.NAS?.user || (!window.NAS.user.admin && !window.NAS.user.serviceBranch)) {
    $('members-status').textContent = 'Accedi sul NAS; serve una branca di servizio assegnata dall’amministratore.';
    return;
  }
  run(async () => {
    await load();
    const params = new URLSearchParams(location.search);
    const memberId = params.get('member');
    if (memberId) {
      const member = data.members.find(member => String(member.id) === memberId);
      if (!member) throw new Error('Socio non disponibile o fuori dalla tua branca.');
      openMember(member, params.get('section') === 'education' ? 'education' : 'activities');
    }
  }, undefined, '');
})();
