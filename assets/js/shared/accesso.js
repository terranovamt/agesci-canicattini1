/* Accesso con la chiave condivisa, verificata dalle regole Firebase. */
(function () {
  const storageKey = 'canicattini-area-chiave';
  const verifiedKey = 'canicattini-area-verificata';
  const chiave = () => sessionStorage.getItem(storageKey) || '';
  const verificata = () => !!chiave() && sessionStorage.getItem(verifiedKey) === chiave();
  async function entra(key) {
    const url = (window.LIVE?.url || '').replace(/\/$/, '');
    if (!url) throw new Error('Firebase non configurato');
    if (!key) throw new Error('Inserisci la chiave');
    // Verifica il permesso senza cambiare patch, timestamp o posizione live.
    const r = await fetch(url + '/modifiche/k.json', { method: 'PUT', body: JSON.stringify(key) });
    if (!r.ok) {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(verifiedKey);
      throw new Error(r.status === 401 || r.status === 403
        ? 'Chiave non valida o regole Firebase non aggiornate'
        : 'Accesso non riuscito (Firebase ' + r.status + ')');
    }
    sessionStorage.setItem(storageKey, key);
    sessionStorage.setItem(verifiedKey, key);
  }
  function esci() {
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(verifiedKey);
    localStorage.removeItem('assemblea-gh-token');
  }
  window.ACCESSO = { chiave, verificata, entra, esci };
})();
