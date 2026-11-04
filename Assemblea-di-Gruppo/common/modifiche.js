/* common/modifiche.js — modifiche live ai dati (Firebase, nodo "modifiche").
   La regia salva una "patch" (solo i campi cambiati rispetto a dati.js);
   regia e pubblico la applicano sopra dati.js e si aggiornano in tempo reale.
   Formato patch: oggetti = campi cambiati; null = campo cancellato;
   { "$i": { "3": ... } } = modifiche a singoli elementi di una lista; altri valori = sostituzione. */
(function () {
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function applyPatch(base, patch) {
    if (patch === undefined) return base;
    if (Array.isArray(base) && plain(patch) && plain(patch.$i)) {
      const out = base.slice();
      Object.entries(patch.$i).forEach(([i, p]) => { out[+i] = applyPatch(out[+i], p) });
      return out;
    }
    if (plain(base) && plain(patch) && !('$i' in patch)) {
      const out = { ...base };
      Object.entries(patch).forEach(([key, p]) => { if (p === null) delete out[key]; else out[key] = applyPatch(base[key], p) });
      return out;
    }
    return patch;
  }

  function diffPatch(base, edit) {
    if (same(base, edit)) return undefined;
    if (Array.isArray(base) && Array.isArray(edit) && base.length === edit.length) {
      const $i = {};
      edit.forEach((x, i) => { const d = diffPatch(base[i], x); if (d !== undefined) $i[i] = d });
      return { $i };
    }
    if (plain(base) && plain(edit)) {
      const out = {};
      Object.keys(edit).forEach(key => { const d = diffPatch(base[key], edit[key]); if (d !== undefined) out[key] = d });
      Object.keys(base).forEach(key => { if (!(key in edit)) out[key] = null });
      return out;
    }
    return edit === undefined ? null : edit;
  }

  window.MODIFICHE = { applyPatch, diffPatch, patch: undefined, ready: false };

  const L = window.LIVE;
  const U = L && L.url ? L.url.replace(/\/$/, '') : '';
  const M = window.MODIFICHE;
  const parse = s => { try { return s ? JSON.parse(s) : undefined } catch (e) { console.warn('Patch modifiche non valida', e); return undefined } };
  const set = s => { M.patch = parse(s); M.ready = true; if (typeof refreshDati === 'function') refreshDati() };

  /* Solo dentro la presentazione; setup e dashboard usano gli helper puri sopra. */
  if (typeof start !== 'function') return;
  if (!U) { M.ready = true; return }
  const get = () => fetch(U + '/modifiche/patch.json').then(r => r.json()).then(set).catch(() => { if (!M.ready) set(null) });
  get();
  setTimeout(() => { if (!M.ready) { M.ready = true; refreshDati() } }, 2500);
  if (L.ruolo === 'regia') {
    const es = new EventSource(U + '/modifiche/patch.json');
    es.addEventListener('put', e => { const m = JSON.parse(e.data); if (m.path === '/') set(m.data) });
  } else {
    /* il pubblico non apre un'altra connessione permanente (il piano gratuito ne permette 100):
       ogni 10 s legge solo l'ora dell'ultima modifica e scarica la patch quando cambia */
    let t0;
    fetch(U + '/modifiche/t.json').then(r => r.json()).then(t => { t0 = t }).catch(() => { });
    setInterval(() => fetch(U + '/modifiche/t.json').then(r => r.json()).then(t => { if (t0 !== undefined && t !== t0) get(); t0 = t }).catch(() => { }), 10000);
  }
})();
