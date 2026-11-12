/* Modifiche rapide alle slide, pubblicate nella patch live. */
(function () {
  const $ = s => document.querySelector(s);
  const M = window.MODIFICHE;
  const U = (window.LIVE?.url || '').replace(/\/$/, '');
  const clone = v => JSON.parse(JSON.stringify(v));
  const at = (data, path) => path.reduce((v, k) => v?.[k], data);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const testo = s => String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  let tipoCorrente = '', vista, campi = [], occupato = false;
  const modificati = () => campi.filter(c => c.input.value !== c.iniziale);
  function pending() {
    const n = modificati().length;
    $('#dati-live-pending').textContent = n ? n + (n === 1 ? ' modifica in attesa' : ' modifiche in attesa') : 'Nessuna modifica in attesa';
  }
  function erroreCampo(c, messaggio) {
    c.errore.textContent = messaggio;
    c.input.setAttribute('aria-invalid', String(!!messaggio));
    if (messaggio) c.input.focus();
  }

  function stato(msg, errore = false) {
    $('#dati-live-stato').textContent = msg;
    $('#dati-live-stato').className = errore ? 'err' : '';
  }
  function blocca(on) {
    occupato = on;
    $('#dati-live-campi').disabled = on;
    $('#dati-live-pubblica').disabled = on || !campi.length;
    $('#dati-live-ricarica').disabled = on;
  }
  async function leggiPatch() {
    const r = await fetch(U + '/modifiche/patch.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Impossibile leggere le modifiche (NAS ' + r.status + ')');
    const p = await r.json();
    return p === null ? undefined : JSON.parse(p);
  }
  function definizioni(data) {
    const out = [];
    if (data.censimenti)
      out.push({ path: ['censimenti', 'presenti_attuali'], label: 'Presenti attuali', numero: true, tipo: 'slide_quorum_convocazioni' });
    (data.slide || []).forEach((s, i) => {
      if (!['slide_composizione_organo', 'organo'].includes(s.tipo)) return;
      let scrutatori = 0;
      (s.persone || []).forEach((p, j) => {
        const ruolo = testo(p.ruolo).toLowerCase();
        if (ruolo !== 'presidente' && !/^scrutator[ei]$/.test(ruolo)) return;
        const label = ruolo === 'presidente' ? 'Nome presidente' : 'Nome scrutatore ' + (++scrutatori);
        out.push({ path: ['slide', i, 'persone', j, 'nome'], tipo: 'organo', label: label + ' (slide ' + (i + 1) + ')',
          identita: JSON.stringify([s.tipo, s.persone.map(p => p.ruolo)]) });
      });
    });
    return out;
  }
  function render(data) {
    campi = definizioni(data);
    $('#dati-live-campi').replaceChildren(...campi.map((c, i) => {
      c.originale = at(data, c.path);
      const label = document.createElement('label');
      label.textContent = c.label;
      c.label_el = label;
      const input = document.createElement('input');
      input.id = 'dato-live-' + i;
      input.type = c.numero ? 'number' : 'text';
      if (c.numero) { input.min = '0'; input.step = '1'; input.placeholder = 'Non ancora noto' }
      c.iniziale = c.numero ? String(c.originale ?? '') : testo(c.originale);
      input.value = c.iniziale;
      c.input = input;
      const errore = document.createElement('span');
      errore.id = input.id + '-errore';
      errore.className = 'err';
      errore.setAttribute('aria-live', 'polite');
      input.setAttribute('aria-describedby', errore.id);
      c.errore = errore;
      input.oninput = () => { erroreCampo(c, ''); pending() };
      label.append(input, errore);
      return label;
    }));
    pending();
  }
  const ORGANO = ['slide_composizione_organo', 'organo'];
  function mostra(tipo) {
    const pertinenti = campi.filter(c => !tipo || (c.tipo === 'organo' ? ORGANO.includes(tipo) : c.tipo === tipo));
    campi.forEach(c => { if (c.label_el) c.label_el.hidden = !pertinenti.includes(c) });
    const voto = tipo === 'slide_votazione';
    $('#dati-live-form').hidden = voto;
    const v = $('#dati-live-vuoto'); if (v) v.hidden = voto || !tipo || pertinenti.length > 0;
  }
  async function ricarica() {
    if (occupato) return;
    blocca(true);
    try {
      const patch = await leggiPatch();
      if (!vista.DATI_BASE) throw new Error('Dati della presentazione non ancora disponibili');
      render(M.applyPatch(vista.DATI_BASE, patch));
      mostra(tipoCorrente);
      stato(campi.length ? 'Valori caricati. Le modifiche saranno visibili dopo Pubblica live.' : 'Nessun campo presenti, presidente o scrutatori disponibile nelle slide.');
    } catch (e) { stato(e.message, true) }
    finally { blocca(false) }
  }
  async function pubblica(e) {
    e.preventDefault();
    if (occupato) return;
    blocca(true);
    try {
      campi.forEach(c => erroreCampo(c, ''));
      const cambiati = modificati();
      if (!cambiati.length) { stato('Nessuna modifica da pubblicare.'); return }
      const valori = cambiati.map(c => {
        if (!c.numero) return escape(c.input.value.trim());
        const n = c.input.value.trim() === '' ? null : Number(c.input.value);
        if (n !== null && (!Number.isSafeInteger(n) || n < 0)) {
          const messaggio = 'I presenti devono essere un numero intero maggiore o uguale a zero.';
          erroreCampo(c, messaggio);
          throw new Error(messaggio);
        }
        return n;
      });
      const patch = await leggiPatch();
      const base = vista.DATI_BASE;
      const attuale = M.applyPatch(base, patch), edit = clone(attuale);
      const disponibili = definizioni(attuale);
      cambiati.forEach((c, i) => {
        const d = disponibili.find(d => same(d.path, c.path));
        if (!d || d.identita !== c.identita || !same(at(attuale, c.path), c.originale)) {
          const messaggio = 'Campo cambiato in dati.js o in un’altra regia. Ricarica i valori prima di pubblicare.';
          erroreCampo(c, messaggio);
          throw new Error(messaggio);
        }
        at(edit, c.path.slice(0, -1))[c.path.at(-1)] = valori[i];
      });
      const nuova = M.diffPatch(base, edit);
      const r = await fetch(U + '/modifiche.json', { method: 'PUT', body: JSON.stringify({
        patch: nuova === undefined ? null : JSON.stringify(nuova), t: { '.sv': 'timestamp' }
      }) });
      if (!r.ok) throw new Error(await r.text());
      vista.MODIFICHE.patch = nuova;
      vista.MODIFICHE.ready = true;
      vista.refreshDati();
      render(edit);
      stato('Pubblicato live nella patch. Aggiornamento richiesto agli schermi; telefoni entro circa 10 secondi.');
    } catch (e) { stato(e.message, true) }
    finally {
      blocca(false);
      pending();
      campi.find(c => c.errore.textContent)?.input.focus();
    }
  }
  $('#dati-live-form').onsubmit = pubblica;
  $('#dati-live-ricarica').onclick = () => {
    if (occupato) return;
    if (modificati().length && !confirm('Scartare le modifiche non pubblicate e ricaricare i valori?')) return;
    ricarica();
  };
  window.REGIA_DATI = { slide(t) { if (t !== tipoCorrente) { tipoCorrente = t; mostra(t) } }, avvia(w) { vista = w; ricarica() } };
})();
