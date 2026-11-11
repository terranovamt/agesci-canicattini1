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
    async function entra(password, code, confirmation, temporary) {
      const result = password === 'nas-session' && code === undefined
        ? await request('auth/me')
        : await request('auth/login', 'POST', { code, password, confirmation, temporary });
      if (result.mustChange) return result;
      window.NAS.user = result.user;
      if (result.user && !result.user.viewAs) window.NAS.viewAs = null;
      if (typeof document !== 'undefined') viewAsControl();
      sessionStorage.setItem('canicattini-area-chiave', 'nas-session');
      sessionStorage.setItem('canicattini-area-verificata', 'nas-session');
    }
    async function esci() {
      await request('logout', 'POST');
      window.NAS.user = null;
      window.NAS.viewAs = null;
      if (typeof document !== 'undefined') document.querySelector('.view-as')?.remove();
      sessionStorage.removeItem('canicattini-area-chiave');
      sessionStorage.removeItem('canicattini-area-verificata');
      localStorage.removeItem('assemblea-gh-token');
    }
    // "Visualizza come": solo l'amministratore tecnico; i permessi effettivi li applica il server.
    async function vista(personId) {
      const result = await request('auth/view-as', 'POST', { personId });
      Object.assign(window.NAS, result);
      return result;
    }
    async function tornaAdmin() {
      const result = await request('auth/view-as', 'DELETE');
      Object.assign(window.NAS, result);
      return result;
    }
    const BRANCHES = ['L/C', 'E/G', 'R/S'];
    function element(tag, props = {}, ...children) {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(props)) {
        if (key in node && !key.startsWith('aria') && key !== 'role') node[key] = value;
        else node.setAttribute(key, value);
      }
      node.append(...children);
      return node;
    }
    function viewAsControl() {
      const header = document.querySelector('.reserved-header, .setup-header, .nas-navbar');
      if (!header || header.querySelector('.view-as')) return;
      const nas = window.NAS;
      let control;
      if (nas.viewAs) {
        const target = nas.viewAs.target;
        const status = element('p', { className: 'view-as-status', role: 'status', 'aria-live': 'polite' });
        const back = element('button', { type: 'button', className: 'view-as-return' }, 'Torna admin');
        back.addEventListener('click', async () => {
          back.disabled = true;
          status.textContent = 'Ritorno all’amministratore…';
          try { await tornaAdmin(); location.reload(); }
          catch (error) { back.disabled = false; status.textContent = error.message || 'Ritorno non riuscito'; }
        });
        control = element('div', { className: 'view-as view-as-active', role: 'group', 'aria-label': 'Vista come capo' },
          element('span', { className: 'view-as-label' }, target
            ? 'Vista capo: ' + target.name + ' · ' + target.serviceBranch
            : 'Capo visualizzato non più disponibile'), back, status);
        document.body.classList.add('viewing-as');
      } else if (nas.user?.admin) {
        const select = element('select', { id: 'view-as-person', required: true });
        const status = element('p', { className: 'view-as-status', role: 'status', 'aria-live': 'polite' });
        const submit = element('button', { type: 'submit', className: 'button', disabled: true }, 'Apri vista');
        const form = element('form', { className: 'view-as-form' },
          element('label', { htmlFor: 'view-as-person' }, 'Capo'), select, submit, status);
        const details = element('details', { className: 'view-as' },
          element('summary', {}, 'Visualizza come'), form);
        let loaded = false;
        details.addEventListener('toggle', async () => {
          if (!details.open || loaded) return;
          loaded = true;
          status.textContent = 'Caricamento capi…';
          try {
            const { people } = await request('people');
            const eligible = people.filter(person => person.loginEnabled && BRANCHES.includes(person.serviceBranch));
            select.replaceChildren(...BRANCHES.map(branch => element('optgroup', { label: 'Branca ' + branch },
              ...eligible.filter(person => person.serviceBranch === branch)
                .map(person => element('option', { value: String(person.id) }, person.name))))
              .filter(group => group.children.length));
            const excluded = people.length - eligible.length;
            status.textContent = (eligible.length ? '' : 'Nessun capo con branca di servizio. ') +
              (excluded === 1 ? '1 capo senza branca non selezionabile.' : excluded ? excluded + ' capi senza branca non selezionabili.' : '');
            submit.disabled = !eligible.length;
          } catch (error) {
            loaded = false;
            status.textContent = error.message || 'Elenco capi non disponibile';
          }
        });
        form.addEventListener('submit', async event => {
          event.preventDefault();
          submit.disabled = true;
          status.textContent = 'Apertura vista…';
          try {
            await vista(Number(select.value));
            location.assign((nas.basePath || '') + '/area-riservata/');
          } catch (error) {
            submit.disabled = false;
            status.textContent = error.message || 'Vista non disponibile';
          }
        });
        details.addEventListener('keydown', event => {
          if (event.key === 'Escape' && details.open) { details.open = false; details.querySelector('summary').focus(); }
        });
        control = details;
      } else return;
      const anchor = [...header.querySelectorAll('a')].find(link => /area riservata/i.test(link.textContent));
      if (anchor) (anchor.closest('nav') || anchor).after(control);
      else header.append(control);
    }
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', viewAsControl);
      else viewAsControl();
    }
    window.ACCESSO = { chiave, verificata, entra, esci, request, vista, tornaAdmin };
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
