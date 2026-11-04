/* Setup statico: modifica dati.js e salva su GitHub, senza accessi Firebase. */
(function () {
  if (!window.ACCESSO.verificata()) {
    location.replace('../area-riservata.html');
    return;
  }
  const $ = s => document.querySelector(s);
  const M = window.MODIFICHE, L = window.LIVE || {};
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const getAt = (o, p) => p.reduce((x, k) => x == null ? undefined : x[k], o);
  const setAt = (o, p, v) => { const t = getAt(o, p.slice(0, -1)); if (v === undefined) { if (Array.isArray(t)) t.splice(p.at(-1), 1); else delete t[p.at(-1)] } else t[p.at(-1)] = v };
  const strip = s => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null)); return e };

  let base, published, edit, view = 'generale', saving = false;
  const open = new Set(['assemblea']);
  const collapsed = new WeakSet();

  function toast(msg) {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const t = el('div', { className: 'toast', textContent: msg });
    document.body.append(t); setTimeout(() => t.remove(), 2600);
  }
  function status(text, cls) { const s = $('#stato'); s.textContent = text; s.className = 'pill ' + (cls || '') }

  /* carica dati.js "pulito", senza modifiche live */
  function script(src) {
    return new Promise((res, reject) => {
      const s = el('script', { src: src + '?t=' + Date.now() });
      s.onload = () => { s.remove(); res() };
      s.onerror = () => { s.remove(); reject(new Error('Impossibile caricare dati.js')) };
      document.head.append(s);
    });
  }
  async function loadBase() {
    window.DATI = undefined;
    await script('dati.js');
    if (!window.DATI) throw new Error('dati.js non trovato o con errori');
    return clone(window.DATI);
  }
  const dirty = () => !same(edit, published);

  function sync(newBase, snapshot) {
    const pending = snapshot ? M.diffPatch(snapshot, edit) : undefined;
    base = newBase;
    published = clone(base);
    edit = M.applyPatch(clone(base), pending);
    render();
    status('dati.js caricato', 'ok');
  }

  /* ---------- campi ---------- */
  function field(path, value, label) {
    const b = getAt(base, path);
    const wrap = el('div', { className: 'field' });
    const lab = el('label', { textContent: label });
    let input;
    const commit = v => { setAt(edit, path, v); mark(); updateDirty() };
    const mark = () => wrap.classList.toggle('mod', !same(getAt(edit, path), b));
    if (typeof value === 'boolean') {
      wrap.classList.add('chk');
      input = el('input', { type: 'checkbox', checked: value });
      input.onchange = () => commit(!input.checked && b === undefined ? undefined : input.checked);
    } else if (typeof value === 'number') {
      input = el('input', { type: 'number', step: 'any', value: String(value) });
      input.oninput = () => { if (input.value !== '' && !isNaN(+input.value)) commit(+input.value) };
    } else {
      const long = String(value ?? '').length > 70 || /\n/.test(value);
      input = el(long ? 'textarea' : 'input', { value: value ?? '' });
      if (long) { input.rows = Math.min(8, Math.ceil(String(value).length / 60) + 1) }
      input.oninput = () => commit(input.value);
    }
    const id = 'f' + path.join('_').replace(/[^\w-]/g, '');
    input.id = lab.htmlFor = id;
    const reset = el('button', { className: 'reset', type: 'button', title: 'Ripristina il valore di dati.js', textContent: '↺' });
    reset.onclick = () => { if (b === undefined) { setAt(edit, path, undefined); render() } else { commit(clone(b)); if (input.type === 'checkbox') input.checked = b; else input.value = b } };
    if (input.type === 'checkbox') wrap.append(input, lab, reset); else wrap.append(lab, input, reset);
    mark();
    return wrap;
  }
  const human = k => String(k).replace(/_/g, ' ');

  function node(path, value, label) {
    if (Array.isArray(value)) {
      const fs = el('fieldset', {}, el('legend', { textContent: label + ' (' + value.length + ')' }));
      value.forEach((item, i) => {
        const child = node(path.concat(i), item, '#' + (i + 1));
        const rm = el('button', { type: 'button', className: 'sec', title: 'Togli questo elemento', textContent: '✕' });
        rm.onclick = () => { setAt(edit, path.concat(i), undefined); render() };
        if (child.tagName === 'FIELDSET') child.querySelector('legend').append(rm);
        else child.append(rm);
        fs.append(child);
      });
      if (value.length) {
        const add = el('button', { type: 'button', className: 'sec add', textContent: '+ Aggiungi' });
        add.onclick = () => { getAt(edit, path).push(blank(value.at(-1))); render() };
        fs.append(add);
      }
      return fs;
    }
    if (plain(value)) {
      const fs = el('fieldset', {}, el('legend', { textContent: label }));
      Object.entries(value).forEach(([k, v]) => fs.append(node(path.concat(k), v, human(k))));
      return fs;
    }
    return field(path, value, label);
  }
  /* nuovo elemento di una lista: stessa struttura dell'ultimo, ma vuoto */
  const blank = v => Array.isArray(v) ? [] : plain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)])) : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : '';

  function box(id, title, sub, badges, fill) {
    const d = el('details', { className: 'box', open: open.has(id) });
    d.dataset.id = id;
    d.ontoggle = () => { d.open ? open.add(id) : open.delete(id) };
    d.append(el('summary', {}, el('span', { className: 't', textContent: title }), sub ? el('small', { textContent: sub }) : null, ...badges));
    const body = el('div', { className: 'body' });
    fill(body); d.append(body);
    return d;
  }
  const badge = (t, c) => el('span', { className: 'badge ' + (c || ''), textContent: t });

  const GENERALE = ['anno_esercizio', 'assemblea'];
  const INTRO = {
    generale: 'Data, luogo e orari dell\'assemblea.',
    ordine: 'Aggiungi o elimina slide; 👁 nasconde e ✎ modifica. Collassa un divisore per spostare tutta la sezione con trascinamento o ↑ ↓. Le modifiche vanno salvate su GitHub.',
    contenuti: 'Testi e nomi di ogni slide. Le slide del bilancio prendono i numeri dalla scheda Bilancio.',
    bilancio: 'Numeri del rendiconto e del patrimonio: censimenti, entrate, uscite, avanzi e beni.',
    json: 'Tutti i dati di dati.js e le modifiche locali in formato JSON.'
  };
  const tipoOf = x => String(x.tipo || '').replace(/^slide_/, '');
  const titleOf = x => strip(x.titolo || x.titolo_barra) || human(tipoOf(x));
  const sezione = x => ['slide_divisore_sezione', 'sezione'].includes(x.tipo);
  const sectionEnd = i => {
    let end = i + 1;
    while (end < edit.slide.length && !sezione(edit.slide[end])) end++;
    return end;
  };
  const blockEnd = i => sezione(edit.slide[i]) && collapsed.has(edit.slide[i]) ? sectionEnd(i) : i + 1;
  const visibleSlides = () => {
    const out = [];
    for (let i = 0; i < edit.slide.length; i = blockEnd(i)) out.push(i);
    return out;
  };

  /* posizione originale (in dati.js) di ogni slide, per segnalare quelle spostate */
  function origins() {
    const used = new Set(), bs = (base.slide || []).map(x => JSON.stringify(x));
    const find = (x, i) => { const j = bs.findIndex((y, k) => !used.has(k) && y === JSON.stringify(x)); if (j >= 0) { used.add(j); return j } return -1 };
    return edit.slide.map(find);
  }
  function move(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= edit.slide.length || to < 0 || to >= edit.slide.length) return;
    const end = blockEnd(from), targetEnd = blockEnd(to);
    if (to >= from && to < end) return;
    const items = edit.slide.splice(from, end - from);
    const dest = to < from ? to : targetEnd - items.length;
    edit.slide.splice(dest, 0, ...items);
    [...open].filter(k => k.startsWith('slide-')).forEach(k => open.delete(k));
    render();
    const r = document.querySelector(`.ord li[data-i="${dest}"]`); if (r) { r.classList.add('flash'); r.scrollIntoView({ block: 'nearest' }) }
  }

  function renderOrdine(c) {
    const org = origins(), ol = el('ol', { className: 'ord' });
    const templates = [
      { tipo: 'slide_titolo', titolo: 'Nuova slide', sottotitolo: '' },
      { tipo: 'slide_divisore_sezione', titolo: 'Nuova sezione', sottotitolo: '' },
      { tipo: 'slide_testo_articoli', titolo_barra: 'Nuovo testo', articoli: [{ titolo: 'Titolo', paragrafi: ['Testo'] }] },
      ...edit.slide
    ];
    const select = el('select', { id: 'nuova-slide-modello', 'ariaLabel': 'Modello nuova slide' });
    templates.forEach((s, i) => select.append(el('option', {
      value: String(i), textContent: i < 3 ? titleOf(s) : 'Copia slide ' + (i - 2) + ': ' + titleOf(s)
    })));
    select.value = '0';
    const add = el('button', { type: 'button', textContent: '+ Aggiungi slide' });
    add.onclick = () => {
      const slide = clone(templates[Number(select.value)]);
      delete slide.id; delete slide.nascosta;
      edit.slide.push(slide);
      render();
      toast('Slide aggiunta in fondo. Usa ✎ per modificarla e ↑ ↓ per spostarla.');
    };
    c.append(el('div', { className: 'slide-add' }, select, add));
    const visible = visibleSlides();
    let drag = -1;
    visible.forEach((i, row) => {
      const x = edit.slide[i], closed = collapsed.has(x);
      const hid = !!x.nascosta, moved = org[i] !== i && org[i] >= 0;
      const btn = (t, title, fn, dis) => { const b = el('button', { type: 'button', className: 'ic', textContent: t, title, disabled: !!dis }); b.onclick = fn; return b };
      const li = el('li', { className: (sezione(x) ? 'sez ' : '') + (hid ? 'hid ' : ''), draggable: true },
        el('span', { className: 'grip', textContent: '⋮⋮', title: 'Trascina' }),
        el('span', { className: 'num', textContent: i + 1 }),
        sezione(x) ? btn(closed ? '▸' : '▾', closed ? 'Espandi sezione' : 'Collassa sezione', () => {
          closed ? collapsed.delete(x) : collapsed.add(x); render();
        }) : null,
        el('span', { className: 't' }, el('b', { textContent: titleOf(x) }), el('small', { textContent: tipoOf(x) })),
        sezione(x) && closed ? badge((sectionEnd(i) - i - 1) + ' slide nella sezione') : null,
        moved ? badge('spostata') : null, org[i] < 0 ? badge('modificata') : null,
        btn(hid ? '🚫' : '👁', hid ? 'Nascosta: clic per mostrarla' : 'Visibile: clic per nasconderla', () => { if (hid && getAt(base, ['slide', i, 'nascosta']) === undefined) delete x.nascosta; else x.nascosta = !hid; render() }),
        btn('↑', closed ? 'Sposta sezione su' : 'Sposta su', () => move(i, visible[row - 1]), row === 0),
        btn('↓', closed ? 'Sposta sezione giù' : 'Sposta giù', () => move(i, visible[row + 1]), row === visible.length - 1),
        btn('✎', 'Modifica i contenuti', () => { open.add('slide-' + i); go('contenuti'); setTimeout(() => document.querySelector(`details[data-id="slide-${i}"]`)?.scrollIntoView({ block: 'start' }), 0) }),
        btn('✕', 'Elimina solo questa slide', () => {
          if (!confirm('Eliminare la slide "' + titleOf(x) + '"? Le altre slide della sezione restano.')) return;
          edit.slide.splice(i, 1);
          [...open].filter(k => k.startsWith('slide-')).forEach(k => open.delete(k));
          render();
        }, edit.slide.length <= 1));
      li.dataset.i = i;
      li.ondragstart = e => { drag = i; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i) };
      li.ondragend = () => li.classList.remove('drag');
      li.ondragover = e => { e.preventDefault(); ol.querySelectorAll('.over').forEach(o => o.classList.remove('over')); li.classList.add('over') };
      li.ondrop = e => { e.preventDefault(); if (drag >= 0) move(drag, i); drag = -1 };
      ol.append(li);
    });
    c.append(ol);
  }

  function renderContenuti(c) {
    edit.slide.forEach((x, i) => {
      const p = ['slide', i], b = [];
      if (x.nascosta) b.push(badge('nascosta', 'hid'));
      const fields = Object.keys(x).filter(k => k !== 'tipo' && k !== 'nascosta');
      if (getAt(base, p) && !same(x, getAt(base, p))) b.push(badge('modificata'));
      c.append(box('slide-' + i, (i + 1) + '. ' + titleOf(x), tipoOf(x), b, body => {
        body.append(field(p.concat('nascosta'), !!x.nascosta, 'Nascosta (salta questa slide)'));
        if (!fields.length) body.append(el('p', { className: 'hint', textContent: /rendiconto|patrimonio/.test(x.tipo) ? 'I numeri di questa slide sono nella scheda Bilancio.' : 'Questa slide non ha testi da modificare.' }));
        fields.forEach(kk => body.append(node(p.concat(kk), x[kk], human(kk))));
      }));
    });
  }

  function renderSezioni(c, keys) {
    keys.filter(k => k in edit).forEach(k => {
      const v = edit[k];
      c.append(box(k, human(k), '', same(v, base[k]) ? [] : [badge('modificata')], body => {
        if (plain(v)) Object.entries(v).forEach(([kk, x]) => body.append(node([k, kk], x, human(kk))));
        else body.append(node([k], v, human(k)));
      }));
    });
  }

  function render() {
    const y = scrollY, c = $('#campi');
    c.innerHTML = '';
    if (view === 'generale') renderSezioni(c, GENERALE);
    else if (view === 'bilancio') renderSezioni(c, Object.keys(edit).filter(k => k !== 'slide' && !GENERALE.includes(k)));
    else if (view === 'ordine' && Array.isArray(edit.slide)) renderOrdine(c);
    else if (view === 'contenuti' && Array.isArray(edit.slide)) renderContenuti(c);
    if (view === 'json') $('#json-text').value = JSON.stringify(edit, null, 2);
    scrollTo(0, y);
    updateDirty();
  }

  function go(tab) {
    const prev = view; view = tab;
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
    const doc = tab === 'guida' || tab === 'limiti';
    $('#campi').hidden = doc || tab === 'json'; $('#json').hidden = tab !== 'json'; $('#doc').hidden = !doc;
    $('#intro').hidden = doc; $('#intro').textContent = INTRO[tab] || '';
    if (doc) { const src = 'guida.html?embed' + (tab === 'limiti' ? '&solo=limiti' : ''); if ($('#doc').getAttribute('src') !== src) $('#doc').src = src }
    else if (edit) { if (prev !== tab) scrollTo(0, 0); render() }
  }

  function updateDirty() {
    const d = dirty();
    $('#dirty').textContent = d ? '● Modifiche non salvate su GitHub' : '✓ Nessuna modifica locale';
    $('#dirty').style.color = d ? 'var(--r)' : 'var(--g)';
    $('#salva-gh').disabled = !d || saving;
    $('#annulla').disabled = !d || saving;
  }

  /* ---------- GitHub: salva dati.js ---------- */
  const GH = L.github || {};
  const TK = 'assemblea-gh-token';
  const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
  const b64enc = s => { const b = new TextEncoder().encode(s); let r = ''; for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(r) };
  function token() {
    const t = localStorage.getItem(TK);
    if (t) return Promise.resolve(t);
    const d = $('#gh'); $('#gh-repo').textContent = GH.repo; $('#gh-token').value = '';
    return new Promise(res => {
      d.onclose = () => { const v = $('#gh-token').value.trim(); if (d.returnValue === 'ok' && v) { localStorage.setItem(TK, v); $('#dimentica').hidden = false; res(v) } else res(null) };
      d.returnValue = ''; d.showModal();
    });
  }
  async function gh(file, tk, body) {
    const url = 'https://api.github.com/repos/' + GH.repo + '/contents/' + GH.cartella + '/' + file;
    const r = await fetch(body ? url : url + '?ref=' + encodeURIComponent(GH.ramo), {
      method: body ? 'PUT' : 'GET', cache: 'no-store', body: body && JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' }
    });
    if (r.status === 401) { localStorage.removeItem(TK); $('#dimentica').hidden = true; throw new Error('Token GitHub non valido o scaduto: riprova e inseriscine uno nuovo') }
    if (r.status === 403 || (r.status === 404 && body)) throw new Error('Il token non può scrivere in ' + GH.repo + ' (serve Contents: Read and write)');
    if (r.status === 404) return null;
    if (r.status === 409 || r.status === 422) throw Object.assign(new Error('conflitto'), { conflict: true });
    if (!r.ok) throw new Error('GitHub: errore ' + r.status);
    return r.json();
  }
  async function salvaGitHub() {
    if (saving || !edit) return;
    if (!GH.repo) return toast('⚠ Imposta "github" in config.js');
    saving = true; updateDirty();
    const snapshot = clone(edit);
    try {
      const tk = await token(); if (!tk) return;
      status('Salvo su GitHub…');
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        const fd = await gh('dati.js', tk);
        if (!fd) throw new Error('dati.js non trovato su GitHub');
        const testo = b64dec(fd.content);
        /* Applica solo le modifiche locali sopra l'ultima versione su GitHub. */
        const voluto = M.applyPatch(window.SALVA_DATI.valuta(testo), M.diffPatch(base, snapshot));
        const nuovo = window.SALVA_DATI.genera(testo, voluto);
        if (nuovo === testo) { sync(voluto, snapshot); toast('dati.js su GitHub è già aggiornato'); return }
        try {
          await gh('dati.js', tk, { message: 'Aggiorna dati.js dalla pagina di setup', content: b64enc(nuovo), sha: fd.sha, branch: GH.ramo });
        } catch (e) {
          if (e.conflict && tentativo < 2) continue;
          throw e;
        }
        sync(voluto, snapshot);
        status('Salvato su GitHub; pubblicazione Pages in attesa', 'ok');
        toast('Salvato su GitHub: tra circa 1 minuto è online');
        return;
      }
    } catch (e) {
      toast('⚠ ' + e.message); status('Errore', 'ko');
    } finally { saving = false; updateDirty(); $('.more').open = false }
  }

  async function init() {
    $('#app').hidden = $('#bar').hidden = false;
    go(view);
    $('#apri-regia').href = 'regia.html';
    try {
      sync(await loadBase());
    } catch (e) { status('Errore', 'ko'); $('#campi').textContent = '⚠ ' + e.message; return }
  }

  $('#salva-gh').onclick = () => salvaGitHub();
  $('#dimentica').hidden = !localStorage.getItem(TK);
  $('#dimentica').onclick = () => { localStorage.removeItem(TK); $('#dimentica').hidden = true; toast('Token GitHub dimenticato') };
  $('#esci-area').onclick = () => {
    if (edit && dirty() && !confirm('Uscire senza salvare le modifiche su GitHub?')) return;
    localStorage.removeItem(TK);
    window.ACCESSO.esci();
    if (published) edit = clone(published);
    location.replace('../index.html');
  };
  $('#annulla').onclick = () => { edit = clone(published); render() };
  $('#scarica').onclick = async () => {
    let txt;
    try { txt = window.SALVA_DATI.genera(await (await fetch('dati.js?t=' + Date.now(), { cache: 'no-store' })).text(), edit) }
    catch (e) { txt = 'window.DATI = ' + JSON.stringify(edit, null, 2) + ';\n' }
    const a = el('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/javascript' })), download: 'dati.js' });
    a.click(); URL.revokeObjectURL(a.href);
  };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
  $('#doc').onload = () => { try { const d = $('#doc').contentDocument; $('#doc').style.height = d.documentElement.scrollHeight + 'px' } catch (e) { } };
  $('#json-apply').onclick = () => {
    try { const v = JSON.parse($('#json-text').value); if (!plain(v) || !Array.isArray(v.slide)) throw new Error('serve un oggetto con la lista "slide"'); edit = v; $('#json-err').textContent = ''; render(); toast('Applicato: ora premi Salva su GitHub') }
    catch (e) { $('#json-err').textContent = 'JSON non valido: ' + e.message }
  };
  addEventListener('beforeunload', e => { if (edit && dirty()) e.preventDefault() });

  history.replaceState(null, '', location.pathname + location.hash);
  init();
})();
