/* Stato dell'assemblea, separato dalla posizione live e dalle modifiche. */
(function () {
  const url = (window.LIVE?.url || '').replace(/\/$/, '');
  async function leggi() {
    if (!url) throw new Error('Firebase non configurato');
    const r = await fetch(url + '/assemblea/stato.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Impossibile leggere lo stato assemblea (Firebase ' + r.status + ')');
    const s = await r.json();
    if (s !== null && typeof s?.attiva !== 'boolean') throw new Error('Stato assemblea non valido');
    return s;
  }
  async function salva(attiva, chiave, patch) {
    if (!url) throw new Error('Firebase non configurato');
    const data = { assemblea: { k: chiave, stato: { attiva } } };
    if (attiva) {
      data.live = { k: chiave, stato: { pos: 0, max: 0 } };
      data.modifiche = { k: chiave, patch: patch === undefined ? null : JSON.stringify(patch), t: { '.sv': 'timestamp' } };
    }
    const r = await fetch(url + '/.json', { method: 'PATCH', body: JSON.stringify(data) });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403
      ? 'Chiave non valida o regole Firebase non aggiornate (nodo assemblea)'
      : 'Impossibile salvare lo stato assemblea (Firebase ' + r.status + ')');
  }
  function osserva(onState, onError) {
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try { onState(await leggi()) } catch (e) { onError(e) }
      finally { running = false }
    };
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }
  window.ASSEMBLEA = { leggi, salva, osserva };
})();
