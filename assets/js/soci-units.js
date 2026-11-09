(function () {
  'use strict';
  const M = window.SOCI_MODEL;
  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const options = (select, items) => {
    const previous = select.value;
    select.replaceChildren(...items.map(([value, text]) => {
      const option = el('option', text); option.value = value; return option;
    }));
    if (items.some(([value]) => String(value) === previous)) select.value = previous;
  };
  let nextSymbol = 0;
  function symbol(unit) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 220 160');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (unit.branch === 'L/C' ? 'Triangolo della sestiglia ' : 'Guidone della squadriglia ') + unit.name);
    const shape = (tag, attributes) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      return node;
    };
    if (unit.branch === 'L/C') {
      svg.append(shape('path', { d: 'M20 20 H200 L110 145 Z', fill: unit.color, stroke: '#f5cb31', 'stroke-width': '10', 'stroke-linejoin': 'round' }));
    } else {
      const outline = 'M30 20 Q155 12 205 80 Q155 148 30 140 Z';
      const clipId = 'unit-flag-' + (++nextSymbol);
      const defs = shape('defs', {}), clip = shape('clipPath', { id: clipId });
      clip.append(shape('path', { d: outline })); defs.append(clip); svg.append(defs);
      svg.append(shape('path', { d: 'M23 8 V153', stroke: '#76512d', 'stroke-width': '6', 'stroke-linecap': 'round' }));
      svg.append(shape('path', { d: outline, fill: '#ffffff', stroke: '#5c5660', 'stroke-width': '2' }));
      const contents = shape('g', { 'clip-path': 'url(#' + clipId + ')' });
      contents.append(shape('rect', { x: 31, y: 20, width: 15, height: 60, fill: unit.color }),
        shape('rect', { x: 31, y: 80, width: 15, height: 61, fill: unit.color2 }));
      if (unit.emblem) contents.append(shape('image', { href: unit.emblem, x: 72, y: 35, width: 98, height: 90, preserveAspectRatio: 'xMidYMid meet' }));
      svg.append(contents, shape('path', { d: outline, fill: 'none', stroke: '#5c5660', 'stroke-width': '2' }));
    }
    return svg;
  }
  window.SOCI_UNITS = function ({ perform, reload, openMember }) {
    let data, editing = null, draftEmblem = '', imageBusy = false, editorSnapshot = '';
    const branchSelect = $('units-branch'), assignment = $('unit-assignment-form'), form = $('unit-form');
    const branch = () => branchSelect.value;
    const environment = () => data.lc.environment;
    const visibleUnits = () => data.units.filter(unit => unit.branch === branch() && !unit.hidden);
    const members = () => data.members.filter(member => member.branch === branch() && member.kind === 'ragazzo' &&
      !M.longSuspended(member, data.currentYear));
    const state = () => JSON.stringify([form.elements.name.value, form.elements.color.value, form.elements.color2.value, draftEmblem]);
    const editorDirty = () => $('unit-dialog').open && state() !== editorSnapshot;
    const closeEditor = () => {
      if (imageBusy || (editorDirty() && !confirm('Chiudere senza salvare i colori o il simbolo?'))) return;
      $('unit-dialog').close();
    };
    function preview() {
      $('unit-symbol-preview').replaceChildren(symbol({
        branch: branch(), name: form.elements.name.value, color: form.elements.color.value,
        color2: form.elements.color2.value, emblem: draftEmblem,
      }));
    }
    function editUnit(unit) {
      editing = unit;
      draftEmblem = unit?.emblem || '';
      form.reset();
      form.elements.name.value = unit?.name || '';
      form.elements.name.readOnly = !!unit;
      form.elements.color.value = unit?.color || '#ffffff';
      form.elements.color.disabled = branch() === 'L/C' && Object.keys(M.sestigliaColors).some(name => M.unitKey(name) === M.unitKey(unit?.name));
      form.elements.color2.value = unit?.color2 || '#ffffff';
      $('unit-editor-title').textContent = unit ? 'Colori e simbolo · ' + unit.name : branch() === 'L/C' ? 'Nuova sestiglia' : 'Nuova squadriglia';
      $('unit-appearance').hidden = false;
      $('unit-color2-label').hidden = $('unit-emblem-controls').hidden = branch() === 'L/C';
      $('unit-name-hint').textContent = unit ? 'Il nome identifica il gruppo e non cambia. Nascondilo per conservarlo senza mostrarlo.' :
        branch() === 'L/C' ? 'Usa il nome del colore (es. Bianchi, Rossi, Neri). Lo stesso nome ripristina la sestiglia nascosta.' :
          'Lo stesso nome ripristina la squadriglia nascosta, comprese le sue informazioni.';
      $('save-unit').textContent = unit ? 'Salva gruppo' : 'Crea / ripristina';
      $('unit-error').textContent = '';
      form.elements.name.setAttribute('list', branch() === 'L/C' ? 'sestiglia-names' : '');
      $('sestiglia-names').replaceChildren(...(branch() === 'L/C' ? Object.keys(M.sestigliaColors).map(name => {
        const option = el('option'); option.value = name; return option;
      }) : []));
      preview();
      editorSnapshot = state();
      $('unit-dialog').showModal();
    }
    $('new-unit').onclick = () => editUnit(null);
    $('units-new-member').onclick = () => $('new-member').click();
    $('close-unit').onclick = closeEditor;
    $('unit-dialog').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
    window.addEventListener('beforeunload', event => {
      if (editorDirty() || imageBusy) { event.preventDefault(); event.returnValue = ''; }
    });
    form.elements.color.oninput = form.elements.color2.oninput = preview;
    form.elements.name.oninput = () => {
      if (branch() === 'L/C') {
        const match = Object.entries(M.sestigliaColors).find(([name]) => M.unitKey(name) === M.unitKey(form.elements.name.value));
        form.elements.color.disabled = !!match;
        if (match) form.elements.color.value = match[1];
      }
      preview();
    };
    $('remove-unit-image').onclick = () => { draftEmblem = ''; $('unit-image-file').value = ''; preview(); };
    $('unit-image-file').onchange = async () => {
      const file = $('unit-image-file').files[0];
      if (!file || imageBusy) return;
      imageBusy = true; $('save-unit').disabled = true; $('unit-error').textContent = 'Elaborazione immagine...';
      $('unit-image-file').disabled = $('remove-unit-image').disabled = $('close-unit').disabled = true;
      try {
        if (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
          throw new Error('Scegli un PNG, JPEG o WebP fino a 5 MiB.');
        const bitmap = await createImageBitmap(file);
        const ratio = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const encoded = canvas.toDataURL('image/png');
        if (encoded.length > 350000) throw new Error('Immagine troppo complessa: scegli un simbolo piu semplice.');
        draftEmblem = encoded; preview(); $('unit-error').textContent = '';
      } catch (error) {
        $('unit-error').textContent = 'Impossibile caricare il simbolo: ' + error.message;
      } finally {
        imageBusy = false;
        $('unit-image-file').disabled = $('remove-unit-image').disabled = $('close-unit').disabled = $('save-unit').disabled = false;
      }
    };
    form.onsubmit = event => {
      event.preventDefault();
      if (imageBusy) return;
      perform(async () => {
        if (editing) await window.ACCESSO.request('members/units/' + editing.id, 'PATCH', {
          revision: editing.revision, color: form.elements.color.value, color2: form.elements.color2.value,
          emblem: draftEmblem, hidden: false,
        });
        else await window.ACCESSO.request('members/units', 'POST', {
          branch: branch(), name: form.elements.name.value, color: form.elements.color.value,
          color2: form.elements.color2.value, emblem: draftEmblem,
        });
        await reload();
        $('unit-dialog').close();
      }, $('unit-error'));
    };
    function requestMove(member, unitId, role) {
      perform(async () => {
        await window.ACCESSO.request('members/units/assign', 'PATCH', {
          memberId: member.id, revision: member.revision, unitId, role,
        });
        await reload();
      }, $('units-status'));
    }
    assignment.elements.unitId.onchange = () => {
      assignment.elements.role.disabled = !assignment.elements.unitId.value;
      assignment.elements.role.required = !!assignment.elements.unitId.value;
    };
    assignment.onsubmit = event => {
      event.preventDefault();
      const member = members().find(member => String(member.id) === assignment.elements.memberId.value);
      if (!member) { $('units-status').textContent = 'Seleziona un socio della branca.'; return; }
      requestMove(member, assignment.elements.unitId.value ? Number(assignment.elements.unitId.value) : null, assignment.elements.role.value);
    };
    $('lc-environment-form').onsubmit = event => {
      event.preventDefault();
      const next = event.currentTarget.elements.environment.value;
      if (next === environment()) return;
      if (!confirm('Cambiare l’ambiente per tutti i capi L/C? I momenti corrispondenti e Cucciolo/Cocci saranno aggiornati, mantenendo soci e sestiglie.')) return;
      perform(async () => {
        await window.ACCESSO.request('members/lc-environment', 'PATCH', { environment: next, revision: data.lc.revision });
        await reload();
      }, $('units-status'));
    };
    branchSelect.onchange = () => render();
    $('reload-units').onclick = () => perform(reload, $('units-status'));
    function memberCard(member) {
      const card = el('article', undefined, 'unit-member');
      card.dataset.memberId = member.id;
      card.draggable = member.revision > 0;
      card.ondragstart = event => {
        if (!member.revision) { event.preventDefault(); return; }
        event.dataTransfer.setData('application/x-scout-member', String(member.id));
        event.dataTransfer.effectAllowed = 'move';
      };
      const name = el('button', member.name, 'member-name');
      name.type = 'button'; name.onclick = () => openMember(member);
      const move = el('button', 'Sposta', 'button button-secondary');
      move.type = 'button';
      move.disabled = !member.revision;
      move.setAttribute('aria-label', 'Sposta ' + member.name);
      move.onclick = () => {
        assignment.elements.memberId.value = member.id;
        const current = visibleUnits().find(unit => M.unitKey(unit.name) === M.unitKey(member.values[branch()]?.[M.unitField(branch())]));
        assignment.elements.unitId.value = current?.id || '';
        assignment.elements.unitId.onchange();
        const role = member.values[branch()]?.ruolo;
        if (M.unitRoles(branch(), environment()).includes(role)) assignment.elements.role.value = role;
        $('unit-assignment').open = true;
        assignment.scrollIntoView({ block: 'center', behavior: 'smooth' });
        assignment.elements.unitId.focus();
      };
      card.append(name, move);
      if (!member.revision) card.append(el('small', 'Completa prima la scheda socio.'));
      return card;
    }
    function dropTarget(node, unitId, role) {
      node.ondragover = event => {
        if (!event.dataTransfer.types.includes('application/x-scout-member')) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move'; node.classList.add('unit-drop-active');
      };
      node.ondragleave = () => node.classList.remove('unit-drop-active');
      node.ondrop = event => {
        event.preventDefault(); node.classList.remove('unit-drop-active');
        const id = Number(event.dataTransfer.getData('application/x-scout-member'));
        const member = members().find(member => member.id === id);
        if (!member) { $('units-status').textContent = 'Il socio non appartiene alla branca selezionata.'; return; }
        requestMove(member, unitId, role);
      };
    }
    function render() {
      if (!data || !branch()) return;
      const lc = branch() === 'L/C', roles = M.unitRoles(branch(), environment());
      $('members-units-panel').dataset.environment = lc ? environment() : 'Reparto';
      $('units-title').textContent = lc ? 'Sestiglie del ' + environment().toLocaleLowerCase('it') : 'Squadriglie del reparto';
      $('units-environment-label').textContent = lc ? environment() + (environment() === 'Branco' ? ' · Lupetti' : ' · Coccinelle') : 'Reparto · Esploratori e guide';
      $('new-unit').textContent = lc ? '+ Sestiglia' : '+ Squadriglia';
      $('lc-environment-form').hidden = !lc;
      $('lc-environment-form').elements.environment.value = environment();
      const available = members();
      options(assignment.elements.memberId, [['', 'Scegli un socio'], ...available.map(member => [member.id, member.name])]);
      options(assignment.elements.unitId, [['', 'Senza gruppo'], ...visibleUnits().map(unit => [unit.id, unit.name])]);
      options(assignment.elements.role, roles.map(role => [role, role]));
      assignment.elements.unitId.onchange();
      const previousUnassigned = $('unit-unassigned').querySelector('details');
      const unassigned = el('details', undefined, 'unit-unassigned');
      unassigned.dataset.branch = branch();
      unassigned.open = previousUnassigned?.dataset.branch === branch() ? previousUnassigned.open : !visibleUnits().length;
      const groupedIds = new Set(visibleUnits().map(unit => M.unitKey(unit.name)));
      const outside = available.filter(member => !groupedIds.has(M.unitKey(member.values[branch()]?.[M.unitField(branch())])));
      unassigned.append(el('summary', 'Senza gruppo / da verificare · ' + outside.length));
      const unassignedList = el('div', undefined, 'unit-unassigned-list');
      outside.forEach(member => {
        const card = memberCard(member);
        const group = member.values[branch()]?.[M.unitField(branch())];
        if (group) card.append(el('small', 'Assegnazione conservata: ' + group + ' (gruppo nascosto o non disponibile)'));
        unassignedList.append(card);
      });
      if (!outside.length) unassignedList.append(el('p', 'Tutti i soci visibili hanno un gruppo.'));
      unassigned.append(unassignedList); dropTarget(unassigned, null, '');
      $('unit-unassigned').replaceChildren(unassigned);
      $('units-board').replaceChildren(...visibleUnits().map(unit => {
        const card = el('section', undefined, 'scout-unit');
        card.dataset.unitId = unit.id;
        const heading = el('div', undefined, 'unit-heading');
        heading.append(symbol(unit), el('h3', unit.name));
        const edit = el('button', 'Colori e simbolo', 'button button-secondary');
        edit.type = 'button'; edit.onclick = () => editUnit(unit);
        if (lc) edit.textContent = 'Colore';
        const hide = el('button', 'Nascondi', 'button button-secondary');
        hide.type = 'button'; hide.onclick = () => {
          if (!confirm('Nascondere ' + unit.name + '? Assegnazioni, colori e simbolo saranno conservati.')) return;
          perform(async () => { await window.ACCESSO.request('members/units/' + unit.id, 'PATCH', { revision: unit.revision, hidden: true }); await reload(); }, $('units-status'));
        };
        const actions = el('div', undefined, 'members-toolbar'); actions.append(edit, hide);
        card.append(heading, actions);
        const assigned = available.filter(member => M.unitKey(member.values[branch()]?.[M.unitField(branch())]) === M.unitKey(unit.name));
        for (const role of roles) {
          const lane = el('section', undefined, 'unit-role-lane');
          lane.dataset.role = role; lane.setAttribute('aria-label', unit.name + ' · ' + role);
          lane.append(el('h4', role));
          const occupants = assigned.filter(member => member.values[branch()]?.ruolo === role);
          occupants.forEach(member => lane.append(memberCard(member)));
          if (!occupants.length) lane.append(el('p', 'Posto libero', 'unit-empty'));
          if (roles.indexOf(role) < 2 && occupants.length > 1) lane.append(el('p', 'Piu soci in questo ruolo: verifica le assegnazioni precedenti.', 'unit-warning'));
          dropTarget(lane, unit.id, role);
          card.append(lane);
        }
        const unknown = assigned.filter(member => !roles.includes(member.values[branch()]?.ruolo));
        if (unknown.length) {
          const pending = el('section', undefined, 'unit-role-lane');
          pending.append(el('h4', 'Ruolo da assegnare / precedente'));
          unknown.forEach(member => {
            const row = memberCard(member);
            row.append(el('small', member.values[branch()]?.ruolo || 'Nessun ruolo'));
            pending.append(row);
          });
          card.append(pending);
        }
        return card;
      }));
      if (!visibleUnits().length) $('units-board').append(el('p', lc ? 'Aggiungi la prima sestiglia.' : 'Aggiungi la prima squadriglia.'));
      const hidden = data.units.filter(unit => unit.branch === branch() && unit.hidden);
      $('units-hidden').querySelector('summary').textContent = 'Gruppi nascosti · ' + hidden.length;
      $('units-hidden-list').replaceChildren(...hidden.map(unit => {
        const row = el('div', undefined, 'unit-hidden-row');
        const restore = el('button', 'Ripristina ' + unit.name, 'button button-secondary');
        restore.type = 'button';
        restore.onclick = () => perform(async () => {
          await window.ACCESSO.request('members/units', 'POST', { branch: branch(), name: unit.name });
          await reload();
        }, $('units-status'));
        row.append(symbol(unit), restore); return row;
      }));
    }
    return {
      update(snapshot) {
        data = snapshot;
        const branches = window.NAS.user.admin ? ['L/C', 'E/G'] : ['L/C', 'E/G'].filter(branch => branch === window.NAS.user.serviceBranch);
        options(branchSelect, branches.map(branch => [branch, branch]));
        $('units-tab').hidden = !branches.length;
        $('units-new-member').hidden = !window.NAS.user.admin;
        render();
      },
    };
  };
})();
