/* Accesso con la chiave condivisa, verificata dalle regole Firebase. */
(function () {
  const storageKey = 'canicattini-area-chiave';
  const chiave = () => sessionStorage.getItem(storageKey) || '';
  async function entra(key) {
    const url = (window.LIVE?.url || '').replace(/\/$/, '');
    if (!url) throw new Error('Firebase non configurato');
    if (!key) throw new Error('Inserisci la chiave');
    // Verifica il permesso senza cambiare patch, timestamp o posizione live.
    const r = await fetch(url + '/modifiche/k.json', { method: 'PUT', body: JSON.stringify(key) });
    if (!r.ok) {
      sessionStorage.removeItem(storageKey);
      throw new Error(r.status === 401 || r.status === 403
        ? 'Chiave non valida o regole Firebase non aggiornate'
        : 'Accesso non riuscito (Firebase ' + r.status + ')');
    }
    sessionStorage.setItem(storageKey, key);
  }
  function esci() {
    sessionStorage.removeItem(storageKey);
    localStorage.removeItem('assemblea-gh-token');
  }
  window.ACCESSO = { chiave, entra, esci };
})();
