/* Accesso gestito dalla sessione del server NAS. */
(function () {
  if (!window.NAS) throw new Error('Accesso NAS non configurato');
  sessionStorage.removeItem('canicattini-area-chiave');
  sessionStorage.removeItem('canicattini-area-verificata');
  localStorage.removeItem('assemblea-gh-token');
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
    function notifyIdentityChange() {
      if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
        window.dispatchEvent(new Event('nas:identitychange'));
      }
    }
    async function entra(password, code, confirmation, temporary) {
      const result = await request('auth/login', 'POST', { code, password, confirmation, temporary });
      if (result.mustChange) return result;
      window.NAS.user = result.user;
      if (result.user && !result.user.viewAs) window.NAS.viewAs = null;
      if (typeof document !== 'undefined') viewAsControl();
      notifyIdentityChange();
    }
    async function esci() {
      await request('logout', 'POST');
      window.NAS.user = null;
      window.NAS.viewAs = null;
      if (typeof document !== 'undefined') document.querySelector('.view-as')?.remove();
      notifyIdentityChange();
    }
    // "Visualizza come": solo l'amministratore tecnico; i permessi effettivi li applica il server.
    async function vista(personId) {
      const result = await request('auth/view-as', 'POST', { personId });
      Object.assign(window.NAS, result);
      notifyIdentityChange();
      return result;
    }
    async function tornaAdmin() {
      const result = await request('auth/view-as', 'DELETE');
      Object.assign(window.NAS, result);
      notifyIdentityChange();
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
          if (event.key === 'Escape' && details.open) {
            event.preventDefault();
            details.open = false;
            details.querySelector('summary').focus();
          }
        });
        control = details;
      } else return;
      const actions = header.querySelector('.reserved-actions');
      if (nas.viewAs) header.append(control);
      else if (actions) actions.append(control);
      else {
        const anchor = [...header.querySelectorAll('a')].find(link => /area riservata/i.test(link.textContent));
        if (anchor) (anchor.closest('nav') || anchor).after(control);
        else header.append(control);
      }
    }
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', viewAsControl);
      else viewAsControl();
    }
  window.ACCESSO = { verificata, entra, esci, request, vista, tornaAdmin };
})();
