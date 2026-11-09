(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const M = window.SOCI_MODEL, A = window.ACCESSO, filters = $('members-filters');
  const profileForm = $('member-form'), macroForm = $('macro-form');
  let data, busy = false, editing = null, drafts = {}, educationBranch = '', preview = null, formSnapshot = '';
  const selected = new Set();
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
  function branchOptions(select, first) { options(select, M.branches.map(branch => [branch, branch]), first); }
  function input(labelText, name, value, definition = {}) {
    const label = node('label', labelText);
    const el = node(definition.type === 'select' ? 'select' : definition.long ? 'textarea' : 'input');
    el.name = name;
    if (definition.type === 'select') options(el, definition.options.map(v => [v, v]), ['', 'Non indicato']);
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
      if (query && ![member.name, member.code, ...Object.values(member.profile)].join(' ').toLocaleLowerCase('it').includes(query)) return false;
      if (f.branch.value && member.branch !== f.branch.value) return false;
      if (f.year.value && !current) return false;
      if (f.status.value && current?.status !== f.status.value) return false;
      if (f.minAge.value && (years === null || years < Number(f.minAge.value))) return false;
      if (f.maxAge.value && (years === null || years > Number(f.maxAge.value))) return false;
      if (f.quality.value === 'contacts' && (member.profile.email || member.profile.phone)) return false;
      if (f.quality.value === 'consents' && ['consent2a', 'consent2b', 'consent2c'].every(key => member.profile[key])) return false;
      if (f.quality.value === 'incomplete' && member.profile.givenName && member.profile.surname && member.profile.birthDate) return false;
      if (f.field.value) {
        const [branch, key] = f.field.value.split(':');
        if (member.branch !== branch) return false;
        const value = member.values[branch]?.[key] || '';
        if (f.missing.checked ? !!value : !value.toLocaleLowerCase('it').includes(f.value.value.toLocaleLowerCase('it'))) return false;
      }
      return true;
    });
  }
  function chosen() { return data.members.filter(member => selected.has(member.id)); }
  function updateSelection() {
    $('members-count').textContent = `${results().length} risultati · ${selected.size} selezionati`;
    $('open-macro').disabled = $('open-documents').disabled = !selected.size;
  }
  function render() {
    const rows = results().map(member => {
      const row = node('tr'), checkCell = node('td'), checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.checked = selected.has(member.id);
      checkbox.setAttribute('aria-label', 'Seleziona ' + member.name);
      checkbox.onchange = () => { checkbox.checked ? selected.add(member.id) : selected.delete(member.id); updateSelection(); };
      checkCell.append(checkbox);
      const nameCell = node('td'), name = node('button', member.name, 'member-name');
      name.type = 'button'; name.onclick = () => openMember(member);
      nameCell.append(name, node('span', member.code, 'member-code'));
      const branchCell = node('td'); branchCell.append(node('span', member.branch || 'Da assegnare', 'member-badge'));
      const current = census(member);
      const censusCell = node('td', current ? `${current.year} · ${current.status || 'Status non indicato'}` : 'Nessun censimento');
      if (current) censusCell.append(node('span', current.branch, 'member-code'));
      row.append(checkCell, nameCell, branchCell, node('td', age(member) ?? '—'), censusCell,
        node('td', [member.profile.email, member.profile.phone].filter(Boolean).join(' · ') || 'Non indicati'));
      return row;
    });
    if (!rows.length) {
      const row = node('tr'), cell = node('td', 'Nessun socio corrisponde ai filtri.'); cell.colSpan = 6; row.append(cell); rows.push(row);
    }
    $('members-list').replaceChildren(...rows);
    updateSelection();
  }
  async function load() {
    data = await A.request('members');
    selected.clear();
    const oldYear = filters.elements.year.value, oldStatus = filters.elements.status.value, oldField = filters.elements.field.value;
    options(filters.elements.year, [...new Set(data.members.flatMap(m => m.censuses.map(c => c.year)))].sort().reverse().map(v => [v, v]), ['', 'Ultimo disponibile per socio']);
    options(filters.elements.status, [...new Set(data.members.flatMap(m => m.censuses.map(c => c.status)).filter(Boolean))].sort().map(v => [v, v]), ['', 'Tutti gli status']);
    options(filters.elements.field, data.fields.map(field => [field.branch + ':' + field.key, field.branch + ' · ' + field.label]), ['', 'Tutti i campi']);
    for (const [key, value] of [['year', oldYear], ['status', oldStatus], ['field', oldField]])
      if ([...filters.elements[key].options].some(o => o.value === value)) filters.elements[key].value = value;
    $('members-summary').replaceChildren(...M.branches.map((branch, i) => {
      const card = node('article'); card.style.setProperty('--branch-color', ['#b49526', '#398258', '#bc4e50', '#795699'][i]);
      card.append(node('span', branch), node('strong', String(data.members.filter(m => m.branch === branch).length)), node('span', 'schede nella branca locale'));
      return card;
    }));
    options($('document-template'), data.templates.map(template => [String(template.id), template.title]));
    $('members-app').hidden = false;
    render();
  }
  async function run(action, errorTarget = $('members-status')) {
    if (busy) return;
    busy = true;
    $('members-app').inert = true;
    document.querySelectorAll('dialog button').forEach(button => { button.disabled = true; });
    errorTarget.textContent = 'Operazione in corso...';
    try { await action(); errorTarget.textContent = ''; $('members-status').textContent = 'Operazione completata.'; }
    catch (error) {
      errorTarget.textContent = error.message;
      if (!window.NAS.user) {
        data = null; selected.clear(); preview = null;
        $('members-app').hidden = true;
        $('members-list').replaceChildren(); $('members-print').replaceChildren();
        document.querySelectorAll('dialog').forEach(dialog => dialog.close());
        $('members-status').textContent = error.message;
      }
    }
    finally {
      busy = false; $('members-app').inert = false;
      document.querySelectorAll('dialog button').forEach(button => { button.disabled = false; });
      $('confirm-import').disabled = !preview;
      if (data) updateSelection();
    }
  }
  const consentKeys = ['guardianType', 'guardians', 'digital', 'consent2a', 'consent2b', 'consent2c', 'magazines'];
  function educationDraft() {
    if (educationBranch) drafts[educationBranch] = Object.fromEntries([...$('member-education').querySelectorAll('input,select,textarea')].map(el => [el.name.slice(6), el.value]));
  }
  function renderEducation() {
    educationBranch = profileForm.elements.branch.value;
    $('member-education').replaceChildren(...data.fields.filter(field => field.branch === educationBranch)
      .map(field => input(field.label, 'extra:' + field.key, drafts[educationBranch]?.[field.key], { ...field, max: 2000 })));
  }
  function openMember(member) {
    editing = member;
    drafts = structuredClone(member?.values || {});
    educationBranch = '';
    profileForm.reset();
    $('member-error').textContent = '';
    $('member-title').textContent = member ? member.name : 'Nuovo socio';
    profileForm.elements.code.value = member?.code || '';
    profileForm.elements.code.readOnly = !!member;
    profileForm.elements.branch.value = member?.branch || 'L/C';
    const profile = { ...member?.profile };
    if (member && !Object.keys(profile).length) profile.givenName = member.name;
    for (const [target, keys] of [[$('member-profile'), Object.keys(M.profileFields).filter(key => !consentKeys.includes(key))], [$('member-consents'), consentKeys]]) {
      target.replaceChildren(...keys.map(key => {
        const definition = key === 'birthDate' ? { type: 'date' } : key === 'guardians' ? { long: true, max: 12000 }
          : key === 'sex' ? { type: 'select', options: ['M', 'F'] }
          : key === 'digital' ? { type: 'select', options: ['True', 'False'] }
          : key.startsWith('consent') || key === 'magazines' ? { type: 'select', options: ['SI', 'NO'] } : {};
        return input(M.profileFields[key], 'profile:' + key, profile[key], definition);
      }));
    }
    $('member-censuses').replaceChildren(...(member?.censuses || []).map(current => {
      const section = node('section', undefined, 'members-census'), dl = node('dl');
      section.append(node('h3', 'Anno scout ' + current.year));
      for (const [key, label] of Object.entries(M.censusFields)) dl.append(node('dt', label), node('dd', current[key] || 'Non indicato'));
      section.append(dl); return section;
    }));
    if (!member?.censuses.length) $('member-censuses').append(node('p', 'Nessun censimento importato.'));
    renderEducation();
    formSnapshot = JSON.stringify([...new FormData(profileForm)]);
    $('member-dialog').showModal();
  }
  profileForm.elements.branch.onchange = () => {
    const oldBranch = educationBranch;
    educationDraft();
    const definitions = data.fields.filter(field => field.branch === oldBranch);
    const changed = definitions.some(field => (drafts[oldBranch]?.[field.key] || '') !== (editing?.values[oldBranch]?.[field.key] || ''));
    if (changed && !confirm('Il percorso non salvato della branca precedente non verra salvato. Continuare il passaggio?')) {
      profileForm.elements.branch.value = oldBranch;
      return;
    }
    drafts[oldBranch] = { ...editing?.values[oldBranch] };
    renderEducation();
  };
  profileForm.onsubmit = event => {
    event.preventDefault();
    educationDraft();
    const branch = profileForm.elements.branch.value;
    const profile = Object.fromEntries([...$('member-profile').querySelectorAll('input,select,textarea'), ...$('member-consents').querySelectorAll('input,select,textarea')].map(el => [el.name.slice(8), el.value]));
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
  }, $('import-error'));
  $('analyze-import').onclick = () => run(async () => {
    invalidateImport();
    const csv = $('import-csv').value;
    const result = await A.request('members/import', 'POST', { csv });
    // Retain exactly the analyzed content, not a subsequently edited textarea.
    preview = { csv, version: result.version };
    const list = node('ul');
    list.append(...result.warnings.map(warning => node('li', warning)));
    $('import-preview').append(node('h3', `${result.rows} censimenti · ${result.newCount} nuovi soci · ${result.updatedCount} soci aggiornati`),
      node('p', 'Colonne escluse: ' + (result.ignoredColumns.join(', ') || 'nessuna')), list);
  }, $('import-error'));
  $('confirm-import').onclick = () => {
    if (!preview || !confirm('Salvare i dati analizzati sul NAS? I dati anagrafici importati sostituiranno quelli precedenti.')) return;
    run(async () => {
      await A.request('members/import', 'POST', { ...preview, confirm: true });
      invalidateImport(); $('import-csv').value = ''; $('import-file').value = '';
      $('import-dialog').close(); await load();
    }, $('import-error'));
  };
  function macroInputs() {
    const f = macroForm.elements, fieldAction = f.action.value === 'field';
    const fields = data.fields.filter(field => field.branch === f.branch.value);
    const oldKey = f.key.value;
    options(f.key, fields.map(field => [field.key, field.label]));
    if (fields.some(field => field.key === oldKey)) f.key.value = oldKey;
    $('macro-field-label').hidden = !fieldAction;
    $('macro-value').replaceChildren();
    const definition = fields.find(field => field.key === f.key.value);
    if (fieldAction && definition) $('macro-value').append(input('Nuovo valore (vuoto per cancellare)', 'value', '', { ...definition, max: 2000 }));
  }
  macroForm.elements.branch.onchange = macroForm.elements.action.onchange = macroInputs;
  macroForm.elements.key.onchange = () => {
    const definition = data.fields.find(field => field.branch === macroForm.elements.branch.value && field.key === macroForm.elements.key.value);
    $('macro-value').replaceChildren(input('Nuovo valore (vuoto per cancellare)', 'value', '', { ...definition, max: 2000 }));
  };
  $('open-macro').onclick = () => {
    $('macro-error').textContent = '';
    $('macro-count').textContent = `${selected.size} soci selezionati (anche fuori dai filtri correnti).`;
    macroForm.elements.branch.value = chosen()[0]?.branch || 'L/C';
    macroInputs(); $('macro-dialog').showModal();
  };
  macroForm.onsubmit = event => {
    event.preventDefault();
    if (!confirm(`Applicare la macro a ${selected.size} soci?`)) return;
    const value = Object.fromEntries(new FormData(macroForm));
    value.members = chosen().map(member => ({ id: member.id, revision: member.revision }));
    run(async () => { await A.request('members/macro', 'POST', value); $('macro-dialog').close(); await load(); }, $('macro-error'));
  };
  $('field-form').onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget, payload = Object.fromEntries(new FormData(form));
    payload.options = payload.options.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    run(async () => { await A.request('members/fields', 'POST', payload); form.reset(); await load(); });
  };
  $('template-form').onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget, payload = Object.fromEntries(new FormData(form));
    run(async () => { await A.request('members/templates', 'POST', payload); form.reset(); await load(); });
  };
  function documentTexts() {
    const template = data.templates.find(template => String(template.id) === $('document-template').value);
    return chosen().map(member => {
      const values = { nome: member.profile.givenName || member.name, cognome: member.profile.surname || '',
        codice: member.code, branca: member.branch, anno: census(member)?.year || 'Non indicato',
        email: member.profile.email || '', cellulare: member.profile.phone || '',
        data: new Date().toLocaleDateString('it-IT'),
        percorso: data.fields.filter(field => field.branch === member.branch).map(field => `${field.label}: ${member.values[member.branch]?.[field.key] || 'Non indicato'}`).join('\n') };
      return template.body.replace(/\{\{([^{}]+)\}\}/g, (_, key) => values[key]);
    });
  }
  function renderDocuments() { $('document-preview').replaceChildren(...documentTexts().map(text => node('article', text, 'member-document'))); }
  $('open-documents').onclick = () => { renderDocuments(); $('documents-dialog').showModal(); };
  $('document-template').onchange = renderDocuments;
  $('print-documents').onclick = () => {
    $('members-print').replaceChildren(...documentTexts().map(text => node('article', text, 'member-document')));
    $('documents-dialog').close();
    window.print();
  };
  window.addEventListener('afterprint', () => $('members-print').replaceChildren());
  $('export-members').onclick = () => {
    if (!confirm('Esportare i risultati con anagrafica, contatti, consensi e campi educativi? Il CSV contiene dati personali: conservarlo in modo sicuro.')) return;
    const profileKeys = Object.keys(M.profileFields), censusKeys = Object.keys(M.censusFields);
    const rows = [['Codice socio', 'Branca locale', ...profileKeys.map(key => M.profileFields[key]), 'Anno scout',
      ...censusKeys.map(key => M.censusFields[key]), ...data.fields.map(field => field.branch + ' - ' + field.label)],
    ...results().map(member => [member.code, member.branch, ...profileKeys.map(key => member.profile[key]), census(member)?.year,
      ...censusKeys.map(key => census(member)?.[key]), ...data.fields.map(field => member.values[field.branch]?.[field.key])])];
    const url = URL.createObjectURL(new Blob([M.exportCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = 'soci-gruppo.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  filters.onsubmit = event => event.preventDefault();
  filters.oninput = () => { if (data) render(); };
  filters.onreset = () => setTimeout(() => { if (data) render(); }, 0);
  $('select-results').onclick = () => { results().forEach(member => selected.add(member.id)); render(); };
  $('clear-selection').onclick = () => { selected.clear(); render(); };
  $('new-member').onclick = () => openMember(null);
  $('open-import').onclick = () => { $('import-error').textContent = ''; $('import-dialog').showModal(); };
  $('reload-members').onclick = () => run(load);
  const dirty = () => $('member-dialog').open && formSnapshot !== JSON.stringify([...new FormData(profileForm)]);
  const canClose = dialog => !busy && (dialog.id !== 'member-dialog' || !dirty() || confirm('Chiudere senza salvare le modifiche alla scheda?'));
  document.querySelectorAll('[data-close]').forEach(button => {
    button.onclick = () => { const dialog = $(button.dataset.close); if (canClose(dialog)) dialog.close(); };
  });
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { if (!canClose(dialog)) event.preventDefault(); });
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  branchOptions(filters.elements.branch, ['', 'Tutte le branche']);
  branchOptions(profileForm.elements.branch); branchOptions(macroForm.elements.branch); branchOptions($('field-form').elements.branch);
  if (!window.NAS?.user?.admin) {
    $('members-status').textContent = 'Pagina riservata all’amministratore sul NAS. Accedi dall’area riservata.';
    return;
  }
  run(load);
})();
