/* common/presenza.js — conta i dispositivi collegati (nodo Firebase "presenza").
   Ogni pagina scrive ogni 25 s { t: ora del server, r: ruolo } e si cancella quando si chiude.
   La dashboard regia legge il nodo e conta chi si è fatto sentire nell'ultimo minuto. */
(function () {
  const L = window.LIVE || {};
  const U = (L.url || '').replace(/\/$/, '');
  const OGNI = 25000, VIVO = 60000;
  const nuovoId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);
  let timer = null;
  function avvia(ruolo) {
    if (!U || timer) return;
    const chiave = 'assemblea-presenza-' + ruolo;
    let id = sessionStorage.getItem(chiave);
    if (!id || !/^[a-z0-9]{1,24}$/.test(id)) { id = nuovoId(); sessionStorage.setItem(chiave, id) }
    const url = U + '/presenza/' + id + '.json';
    const batti = () => { if (document.visibilityState !== 'hidden') fetch(url, { method: 'PUT', body: JSON.stringify({ t: { '.sv': 'timestamp' }, r: ruolo }) }).catch(() => { }) };
    batti(); timer = setInterval(batti, OGNI);
    document.addEventListener('visibilitychange', batti);
    addEventListener('pagehide', () => { try { fetch(url, { method: 'DELETE', keepalive: true }) } catch (e) { } });
  }
  /* conteggio: lista { id: {t, r} } -> dispositivi attivi per ruolo + id scaduti da cancellare */
  function conta(lista, adesso) {
    const voci = Object.entries(lista || {}).filter(([, v]) => v && typeof v.t === 'number');
    const ora = adesso || Math.max(0, ...voci.map(([, v]) => v.t));
    const out = { totale: 0, ruoli: {}, scaduti: [] };
    voci.forEach(([id, v]) => {
      if (ora - v.t > VIVO * 2) out.scaduti.push(id);
      if (ora - v.t > VIVO) return;
      out.totale++; out.ruoli[v.r] = (out.ruoli[v.r] || 0) + 1;
    });
    return out;
  }
  window.PRESENZA = { avvia, conta, OGNI, VIVO };
  if (L.ruolo === 'pubblico' && !L.vista && typeof start === 'function') avvia('p');
})();
