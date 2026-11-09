/* Accesso con la chiave condivisa, verificata dalle regole Firebase. */
(function () {
  if (window.NAS) {
    const chiave = () => window.NAS.user ? 'nas-session' : '';
    const verificata = () => !!window.NAS.user;
    async function request(path, method = 'GET', data) {
      const r = await fetch((window.NAS.basePath || '') + '/api/' + path, {
        method, credentials: 'same-origin', cache: 'no-store',
        ...(data === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        })
      });
      if (!r.ok) {
        if (r.status === 401) window.NAS.user = null;
        throw new Error(await r.text());
      }
      return r.json();
    }
    async function entra(password, code, confirmation) {
      const result = password === 'nas-session' && code === undefined
        ? await request('auth/me')
        : await request('auth/login', 'POST', { code, password, confirmation });
      window.NAS.user = result.user;
      sessionStorage.setItem('canicattini-area-chiave', 'nas-session');
      sessionStorage.setItem('canicattini-area-verificata', 'nas-session');
    }
    async function esci() {
      await request('logout', 'POST');
      window.NAS.user = null;
      sessionStorage.removeItem('canicattini-area-chiave');
      sessionStorage.removeItem('canicattini-area-verificata');
      localStorage.removeItem('assemblea-gh-token');
    }
    window.ACCESSO = { chiave, verificata, entra, esci, request };
    return;
  }
  const storageKey = 'canicattini-area-chiave';
  const verifiedKey = 'canicattini-area-verificata';
  const chiave = () => sessionStorage.getItem(storageKey) || '';
  const verificata = () => !!chiave() && sessionStorage.getItem(verifiedKey) === chiave();
  async function entra(key) {
    const url = (window.LIVE?.url || '').replace(/\/$/, '');
    if (!url) throw new Error('Servizio di accesso non configurato');
    if (!key) throw new Error('Inserisci la chiave');
    if (window.LIVE?.nas && key === 'nas-session') {
      const response = await fetch((window.LIVE.basePath || '') + '/api/session', { cache: 'no-store' });
      if (response.ok && (await response.json()).authenticated) {
        sessionStorage.setItem(verifiedKey, key);
        return;
      }
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(verifiedKey);
      throw new Error('Sessione NAS scaduta: accedi di nuovo');
    }
    // Verifica il permesso senza cambiare patch, timestamp o posizione live.
    const r = await fetch(url + '/modifiche/k.json', { method: 'PUT', body: JSON.stringify(key) });
    if (!r.ok) {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(verifiedKey);
      if (window.LIVE?.nas) throw new Error(await r.text());
      throw new Error(r.status === 401 || r.status === 403
        ? 'Chiave non valida o regole Firebase non aggiornate'
        : 'Accesso non riuscito (Firebase ' + r.status + ')');
    }
    const stored = window.LIVE?.nas ? 'nas-session' : key;
    sessionStorage.setItem(storageKey, stored);
    sessionStorage.setItem(verifiedKey, stored);
  }
  function esci() {
    if (window.LIVE?.nas) fetch((window.LIVE.basePath || '') + '/api/logout', { method: 'POST', keepalive: true }).catch(() => {});
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(verifiedKey);
    localStorage.removeItem('assemblea-gh-token');
  }
  window.ACCESSO = { chiave, verificata, entra, esci };
})();
