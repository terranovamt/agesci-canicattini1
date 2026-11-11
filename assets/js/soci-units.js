(function () {
  'use strict';
  const M = window.SOCI_MODEL;
  const guidoniRoot = new URL('../img/guidoni/', document.currentScript.src || new URL('assets/js/soci-units.js', document.baseURI)).href;
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
      svg.append(shape('path', { d: 'M110 10 L190 148.564 L30 148.564 Z', fill: unit.color, stroke: '#f5cb31', 'stroke-width': '10', 'stroke-linejoin': 'round' }));
    } else {
      const outline = 'M30 20 Q155 12 205 80 Q155 148 30 140 Z';
      svg.append(shape('path', { d: 'M23 8 V153', stroke: '#76512d', 'stroke-width': '6', 'stroke-linecap': 'round' }));
      svg.append(shape('path', { d: outline, fill: '#ffffff', stroke: '#5c5660', 'stroke-width': '2' }));
      const identity = M.patrolIdentity(unit.name);
      if (identity) {
        const image = shape('image', { href: guidoniRoot + identity.image, x: 0, y: 0, width: 220, height: 160, preserveAspectRatio: 'xMidYMid meet' });
        image.addEventListener('error', () => image.remove(), { once: true });
        svg.append(image);
      }
    }
    return svg;
  }
  window.SOCI_UNITS = function ({ perform, reload, openMember }) {
    let data, editing = null, draftEmblem = '', imageBusy = false, editorSnapshot = '';
    const branchSelect = $('units-branch'), form = $('unit-form'), search = $('unit-available-search');
    let keyboardMember = null;
    function select(member) {
      keyboardMember = member;
      document.querySelectorAll('.unit-member.unit-selected').forEach(card => card.classList.remove('unit-selected'));
      document.querySelectorAll('.unit-grip[aria-pressed="true"]').forEach(grip => grip.setAttribute('aria-pressed', 'false'));
      $('members-units-panel').toggleAttribute('data-selecting', !!member);
      $('unit-selection').hidden = !member;
      if (!member) return;
      const card = document.querySelector(`.unit-member[data-member-id="${member.id}"]`);
      card?.classList.add('unit-selected'); card?.querySelector('.unit-grip')?.setAttribute('aria-pressed', 'true');
      const assigned = !!member.values[branch()]?.[M.unitField(branch())];
      $('unit-selection-text').textContent = member.name + ': tocca la riga di destinazione' +
        (assigned ? ' o «Soci disponibili» per toglierlo.' : '.');
    }
    $('unit-selection-cancel').onclick = () => {
      const id = keyboardMember?.id;
      select(null);
      $('units-status').textContent = 'Spostamento annullato.';
      document.querySelector(`.unit-member[data-member-id="${id}"] .unit-grip`)?.focus();
    };
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
      $('unit-appearance').hidden = branch() === 'E/G';
      $('unit-color2-label').hidden = $('unit-emblem-controls').hidden = branch() === 'L/C';
      $('unit-name-hint').textContent = unit ? (branch() === 'L/C' ? 'Il nome identifica la sestiglia' : 'Il nome identifica la squadriglia') + ' e non cambia. Puoi nasconderla per conservarla senza mostrarla.' :
        branch() === 'L/C' ? 'Usa il nome del colore (es. Bianchi, Rossi, Neri). Lo stesso nome ripristina la sestiglia nascosta.' :
          'Scegli un nome dal catalogo: colori e guidone sono definiti nel codice. Lo stesso nome ripristina la squadriglia nascosta.';
      $('save-unit').textContent = unit ? (branch() === 'L/C' ? 'Salva sestiglia' : 'Salva squadriglia') : 'Crea';
      $('unit-error').textContent = '';
      form.elements.name.setAttribute('list', 'sestiglia-names');
      $('sestiglia-names').replaceChildren(...(branch() === 'L/C' ? Object.keys(M.sestigliaColors) : M.patrolCatalog.map(entry => entry[1])).map(name => {
        const option = el('option'); option.value = name; return option;
      }));
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
      } else {
        const identity = M.patrolIdentity(form.elements.name.value);
        const previous = data.units.find(unit => unit.branch === 'E/G' && M.unitKey(unit.name) === M.unitKey(form.elements.name.value));
        $('unit-name-hint').textContent = identity ? identity.colors.join(' / ') + '. Colori definiti nel codice.' :
          previous ? 'Nome locale: saranno conservati i colori precedenti.' :
            'Scegli un nome dal catalogo: per questo nome i colori non sono definiti. Aggiungili nel codice prima di creare la squadriglia.';
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
      if (branch() === 'E/G' && !M.patrolIdentity(form.elements.name.value) &&
          !data.units.some(unit => unit.branch === 'E/G' && M.unitKey(unit.name) === M.unitKey(form.elements.name.value))) {
        $('unit-error').textContent = 'Scegli un nome dal catalogo o aggiungi prima i suoi colori nel codice.';
        return;
      }
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
    branchSelect.onchange = () => { search.value = ''; render(); };
    $('reload-units').onclick = () => perform(reload, $('units-status'), '');
    function highlightNames() {
      const query = search.value.trim().toLocaleLowerCase('it');
      let matches = 0;
      for (const name of $('unit-available-list').querySelectorAll('.member-name')) {
        const text = name.dataset.name, lower = text.toLocaleLowerCase('it');
        name.replaceChildren();
        let start = 0, index = query ? lower.indexOf(query) : -1;
        name.closest('.unit-member').hidden = !!query && index < 0;
        if (index >= 0) matches++;
        while (index >= 0) {
          name.append(document.createTextNode(text.slice(start, index)), el('mark', text.slice(index, index + query.length)));
          start = index + query.length;
          index = lower.indexOf(query, start);
        }
        name.append(document.createTextNode(text.slice(start)));
      }
      $('unit-available-status').textContent = query
        ? matches ? `${matches} soci trovati. Trascina un socio sulla riga desiderata.` : 'Nessun nome corrisponde alla ricerca.'
        : 'Trascina un socio sulla riga desiderata.';
    }
    search.oninput = highlightNames;
    $('members-units-panel').addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !keyboardMember) return;
      $('unit-selection-cancel').click();
    });
    const sameAssignment = (member, unitId, role) => {
      const values = member.values[branch()] || {};
      const current = visibleUnits().find(unit => M.unitKey(unit.name) === M.unitKey(values[M.unitField(branch())]));
      return unitId === null ? !current : current?.id === unitId && values.ruolo === role;
    };
    // Pointer-based drag (mouse, pen and touch): HTML5 drag never starts on touch screens or from the name button.
    let dragging = null;
    const dropLane = (x, y) => document.elementFromPoint(x, y)?.closest('#members-units-panel [data-drop-role]') || null;
    function highlight(lane) {
      if (dragging.lane === lane) return;
      dragging.lane?.classList.remove('unit-drop-active');
      dragging.lane = lane;
      lane?.classList.add('unit-drop-active');
    }
    function placeGhost(x, y) {
      dragging.ghost.style.transform = `translate(${x - dragging.offsetX}px, ${y - dragging.offsetY}px)`;
    }
    function activateDrag() {
      const state = dragging;
      clearTimeout(state.timer);
      state.active = true;
      state.card.setPointerCapture(state.pointerId);
      const rect = state.card.getBoundingClientRect();
      state.offsetX = state.x - rect.left; state.offsetY = state.y - rect.top;
      state.ghost = state.card.cloneNode(true);
      state.ghost.className = 'unit-member unit-drag-ghost';
      state.ghost.removeAttribute('data-member-id');
      state.ghost.setAttribute('aria-hidden', 'true');
      state.ghost.style.width = rect.width + 'px';
      document.body.append(state.ghost);
      state.card.classList.add('unit-dragging');
      document.documentElement.classList.add('unit-drag-in-progress');
      placeGhost(state.x, state.y);
      highlight(dropLane(state.x, state.y));
      $('units-status').textContent = 'Trascinamento di ' + state.member.name + ': rilascia il nome sulla riga di destinazione.';
    }
    function stopDrag() {
      const state = dragging;
      dragging = null;
      clearTimeout(state.timer);
      removeEventListener('pointermove', onDragMove);
      removeEventListener('pointerup', onDragEnd);
      removeEventListener('pointercancel', onDragCancel);
      removeEventListener('keydown', onDragKey);
      if (!state.active) return state;
      if (state.card.hasPointerCapture(state.pointerId)) state.card.releasePointerCapture(state.pointerId);
      state.lane?.classList.remove('unit-drop-active');
      state.ghost.remove();
      state.card.classList.remove('unit-dragging');
      document.documentElement.classList.remove('unit-drag-in-progress');
      const swallow = event => { event.preventDefault(); event.stopPropagation(); };
      addEventListener('click', swallow, { capture: true, once: true });
      // A touch tap can be synthesized after pointerup: ignore only the click that belongs to this gesture.
      setTimeout(() => removeEventListener('click', swallow, { capture: true }), 350);
      return state;
    }
    function onDragMove(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      if (!dragging.active) {
        if (Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) < 8) return;
        // Touch on the name waits for a long press so that a quick swipe still scrolls the page.
        if (dragging.hold) { stopDrag(); return; }
        activateDrag();
      }
      event.preventDefault();
      placeGhost(event.clientX, event.clientY);
      highlight(dropLane(event.clientX, event.clientY));
      if (event.clientY < 56) scrollBy({ top: -18, behavior: 'instant' });
      else if (event.clientY > innerHeight - 56) scrollBy({ top: 18, behavior: 'instant' });
    }
    function onDragEnd(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      const state = stopDrag();
      if (!state.active) return;
      const lane = dropLane(event.clientX, event.clientY);
      if (!lane) {
        $('units-status').textContent = 'Spostamento annullato: rilascia ' + state.member.name + ' su una riga di una ' + (branch() === 'L/C' ? 'sestiglia.' : 'squadriglia.');
        return;
      }
      const unitId = lane.dataset.dropUnit ? Number(lane.dataset.dropUnit) : null, role = lane.dataset.dropRole;
      if (sameAssignment(state.member, unitId, role)) { $('units-status').textContent = state.member.name + ' e gia in questa posizione.'; return; }
      requestMove(state.member, unitId, role);
    }
    function onDragCancel(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      if (stopDrag().active) $('units-status').textContent = 'Spostamento interrotto dal dispositivo: riprova tenendo premuto il nome.';
    }
    function onDragKey(event) {
      if (event.key !== 'Escape' || !dragging) return;
      if (stopDrag().active) $('units-status').textContent = 'Spostamento annullato.';
    }
    function draggableCard(card, member) {
      card.classList.add('unit-draggable');
      card.addEventListener('pointerdown', event => {
        if (dragging || !event.isPrimary || event.button !== 0) return;
        select(null);
        const handle = !!event.target.closest('.unit-grip');
        dragging = { card, member, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
          active: false, hold: event.pointerType === 'touch' && !handle };
        if (dragging.hold) dragging.timer = setTimeout(activateDrag, 350);
        addEventListener('pointermove', onDragMove, { passive: false });
        addEventListener('pointerup', onDragEnd);
        addEventListener('pointercancel', onDragCancel);
        addEventListener('keydown', onDragKey);
      });
      card.addEventListener('touchmove', event => { if (dragging?.active && dragging.card === card) event.preventDefault(); }, { passive: false });
      card.addEventListener('contextmenu', event => { if (dragging?.card === card) event.preventDefault(); });
      card.addEventListener('dragstart', event => event.preventDefault());
    }
    function memberCard(member) {
      const card = el('article', undefined, 'unit-member');
      card.dataset.memberId = member.id;
      const name = el('button', member.name, 'member-name');
      name.dataset.name = member.name;
      name.type = 'button';
      name.onclick = () => {
        if (!keyboardMember) openMember(member);
        else if (keyboardMember.id === member.id) $('unit-selection-cancel').click();
      };
      if (member.revision) {
        const grip = el('button', '⋮⋮', 'unit-grip');
        grip.type = 'button';
        grip.title = 'Trascina ' + member.name + ' oppure premi Invio e scegli la riga con Tab';
        grip.setAttribute('aria-label', 'Trascina ' + member.name);
        grip.onclick = () => {
          select(member);
          $('units-status').textContent = member.name + ': scegli una riga con Tab e premi Invio, oppure toccala. Esc annulla.';
        };
        card.append(grip);
        draggableCard(card, member);
      }
      card.append(name);
      if (!member.revision) card.append(el('small', 'Completa prima la scheda socio.'));
      return card;
    }
    function dropTarget(node, unitId, role) {
      node.dataset.dropUnit = unitId === null ? '' : unitId;
      node.dataset.dropRole = role;
      node.tabIndex = 0;
      const moveHere = () => {
        const member = keyboardMember;
        select(null);
        if (sameAssignment(member, unitId, role)) {
          $('units-status').textContent = member.name + ' e gia in questa posizione.';
          return;
        }
        requestMove(member, unitId, role);
      };
      node.addEventListener('keydown', event => {
        if (event.target !== node || !keyboardMember || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); moveHere();
      });
      node.addEventListener('click', event => {
        if (keyboardMember && !event.target.closest('.unit-grip, .unit-selection')) moveHere();
      });
    }
    function render() {
      if (!data || !branch()) return;
      select(null);
      const lc = branch() === 'L/C', roles = M.unitRoles(branch(), environment());
      $('units-tab').textContent = lc ? 'Sestiglie' : 'Squadriglie';
      $('members-units-panel').dataset.environment = lc ? environment() : 'Reparto';
      $('units-title').textContent = lc ? 'Sestiglie del ' + environment().toLocaleLowerCase('it') : 'Squadriglie del reparto';
      $('units-environment-label').textContent = lc ? environment() + (environment() === 'Branco' ? ' · Lupetti' : ' · Coccinelle') : 'Reparto · Esploratori e guide';
      $('new-unit').textContent = lc ? '+ Sestiglia' : '+ Squadriglia';
      $('lc-environment-form').hidden = !lc;
      $('lc-environment-settings').hidden = !lc;
      $('lc-environment-form').elements.environment.value = environment();
      const available = members();
      const groupedIds = new Set(visibleUnits().map(unit => M.unitKey(unit.name)));
      const outside = available.filter(member => !groupedIds.has(M.unitKey(member.values[branch()]?.[M.unitField(branch())])));
      $('unit-unassigned').hidden = !outside.length;
      $('unit-available-count').textContent = '· ' + outside.length;
      const unassignedList = $('unit-available-list');
      unassignedList.replaceChildren();
      outside.forEach(member => {
        const card = memberCard(member);
        const group = member.values[branch()]?.[M.unitField(branch())];
        if (group) card.append(el('small', 'Assegnazione conservata: ' + group + (lc ? ' (sestiglia nascosta o non disponibile)' : ' (squadriglia nascosta o non disponibile)')));
        unassignedList.append(card);
      });
      highlightNames();
      $('unit-unassigned').dataset.dropUnit = '';
      $('unit-unassigned').dataset.dropRole = '';
      if (!$('unit-unassigned').hasAttribute('tabindex')) dropTarget($('unit-unassigned'), null, '');
      $('units-board').replaceChildren(...visibleUnits().map(unit => {
        const card = el('section', undefined, 'scout-unit');
        card.dataset.unitId = unit.id;
        const heading = el('div', undefined, 'unit-heading');
        const title = el('div', undefined, 'unit-title');
        title.append(el('h3', unit.name));
        const assigned = available.filter(member => M.unitKey(member.values[branch()]?.[M.unitField(branch())]) === M.unitKey(unit.name));
        const count = el('output', assigned.length + (assigned.length === 1 ? ' ragazzo' : ' ragazzi'), 'unit-member-count');
        count.setAttribute('aria-label', `${unit.name}: ${assigned.length} ${assigned.length === 1 ? 'ragazzo assegnato' : 'ragazzi assegnati'}`);
        if (!lc) {
          const identity = M.patrolIdentity(unit.name);
          const colors = el('span', undefined, 'unit-colors');
          const colorNames = identity?.colors.join(' / ') || 'Colori locali precedenti';
          colors.setAttribute('role', 'img'); colors.setAttribute('aria-label', colorNames);
          colors.title = [colorNames, ...(identity?.meanings || [])].join(' · ');
          for (const color of [identity?.color || unit.color, identity?.color2 || unit.color2]) {
            const half = el('span'); half.style.backgroundColor = color; colors.append(half);
          }
          title.append(colors);
        }
        title.append(count);
        const missing = roles.slice(0, 2).filter(role => !assigned.some(member => member.values[branch()]?.ruolo === role))
          .map(role => ['capo', 'vice'][roles.indexOf(role)]);
        if (missing.length) title.append(el('small', 'Manca: ' + missing.join(' · '), 'unit-missing'));
        heading.append(symbol(unit), title);
        const hide = el('button', '×', 'unit-hide');
        hide.type = 'button'; hide.onclick = () => {
          if (!confirm('Nascondere ' + unit.name + '? Assegnazioni, colori e simbolo saranno conservati.')) return;
          perform(async () => { await window.ACCESSO.request('members/units/' + unit.id, 'PATCH', { revision: unit.revision, hidden: true }); await reload(); }, $('units-status'));
        };
        hide.setAttribute('aria-label', 'Nascondi ' + unit.name);
        hide.title = 'Nascondi ' + unit.name;
        heading.append(hide);
        card.append(heading);
        for (const [index, role] of roles.entries()) {
          const lane = el('section', undefined, 'unit-role-lane');
          lane.classList.add(['unit-chief', 'unit-deputy', 'unit-regular', 'unit-newcomer'][index]);
          lane.dataset.role = role; lane.setAttribute('aria-label', unit.name + ' · ' + role);
          const occupants = assigned.filter(member => member.values[branch()]?.ruolo === role);
          if (index < 2) {
            const row = occupants.length ? memberCard(occupants[0]) : el('div', undefined, 'unit-member');
            const badge = el('abbr', index === 0 ? 'C' : 'VC', 'unit-role-badge');
            badge.title = role; row.prepend(badge);
            if (!occupants.length) row.append(el('span', 'Posto libero', 'unit-empty'));
            lane.append(row);
            occupants.slice(1).forEach(member => lane.append(memberCard(member)));
          } else occupants.forEach(member => {
            const row = memberCard(member), badge = el('abbr', index === 2 ? 'S' : lc ? (environment() === 'Cerchio' ? 'Co' : 'Cu') : 'PT', 'unit-role-badge');
            badge.title = role; row.prepend(badge); lane.append(row);
          });
          if (!occupants.length && index >= 2) {
            const empty = el('p', index === 3 ? role + ' · trascina qui' : 'Trascina qui', 'unit-empty');
            lane.append(empty);
          }
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
      $('units-hidden').querySelector('summary').textContent = (lc ? 'Sestiglie nascoste' : 'Squadriglie nascoste') + ' · ' + hidden.length;
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
        branchSelect.closest('label').hidden = !window.NAS.user.admin;
        $('units-tab').hidden = !branches.length;
        $('units-new-member').hidden = !window.NAS.user.admin;
        render();
      },
    };
  };
})();
