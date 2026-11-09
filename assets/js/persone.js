(function () {
  const status = document.getElementById('people-status');
  const app = document.getElementById('people-app');
  const list = document.getElementById('people-list');
  const branchNav = document.getElementById('people-branches');
  const count = document.getElementById('people-count');
  const reload = document.getElementById('reload-people');
  const login = document.getElementById('people-login');
  const A = window.ACCESSO;
  function announce(message) {
    status.textContent = message;
    status.hidden = !message;
  }
  if (!window.NAS || !window.NAS.user?.admin) {
    count.textContent = '';
    announce(window.NAS && !window.NAS.user ? 'Sessione scaduta. Accedi di nuovo con l’account amministratore.'
      : 'Pagina riservata all’amministratore sul NAS. Accedi con il suo account.');
    reload.hidden = true;
    login.hidden = false;
    return;
  }
  let busy = false;
  let expired = false;
  let loaded = false;
  let branchFilter = 'ALL';
  let peopleData = [];
  let visibleIds = [];
  const branchDrafts = new Map();
  const feedback = new Map();
  const branches = ['L/C', 'E/G', 'R/S', ''];
  const isExpired = error => !window.NAS.user || /sessione.*scadut/i.test(error.message);
  function expire() {
    expired = true;
    login.hidden = false;
    announce('Sessione scaduta. Accedi di nuovo; le modifiche non salvate restano in questa pagina.');
  }
  function chooseVisible() {
    const branch = branchFilter === 'UNASSIGNED' ? '' : branchFilter;
    visibleIds = peopleData.filter(person => branchFilter === 'ALL' || (person.serviceBranch || '') === branch)
      .sort((a, b) => branches.indexOf(a.serviceBranch || '') - branches.indexOf(b.serviceBranch || ''))
      .map(person => person.id);
  }
  function card(person) {
    const article = document.createElement('article');
    article.className = 'person-card';
    const title = document.createElement('h2');
    title.textContent = person.name;
    const identity = document.createElement('p');
    identity.className = 'person-identity';
    identity.textContent = `Codice ${person.code} · ${person.hasPassword ? 'Password impostata' : 'Password da inizializzare'}`;
    const edit = document.createElement('form');
    const fields = document.createElement('div');
    fields.className = 'person-fields';
    const service = document.createElement('select');
    service.id = 'person-branch-' + person.id;
    service.disabled = busy || expired;
    for (const [value, text] of [['', 'Nessuna branca'], ['L/C', 'L/C'], ['E/G', 'E/G'], ['R/S', 'R/S']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      service.append(option);
    }
    service.value = branchDrafts.get(person.id) ?? (person.serviceBranch || '');
    const label = document.createElement('label');
    label.append(document.createTextNode('Branca di servizio'), service);
    const save = document.createElement('button');
    save.id = 'person-save-' + person.id;
    save.className = 'button button-secondary';
    save.type = 'submit';
    save.textContent = 'Salva branca';
    save.disabled = busy || expired || !branchDrafts.has(person.id);
    const message = document.createElement('p');
    message.id = 'person-feedback-' + person.id;
    message.className = 'person-feedback';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    message.setAttribute('aria-atomic', 'true');
    message.tabIndex = -1;
    const state = feedback.get(person.id);
    message.textContent = state?.text || (branchDrafts.has(person.id) ? 'Branca da salvare.' : '');
    message.hidden = !message.textContent;
    message.classList.toggle('person-feedback-error', state?.error === true);
    service.setAttribute('aria-describedby', message.id);
    service.setAttribute('aria-invalid', String(state?.error === true && state?.action === 'branch'));
    article.classList.toggle('person-card-dirty', branchDrafts.has(person.id));
    article.setAttribute('aria-busy', String(state?.pending === true));
    service.onchange = () => {
      if (service.value === (person.serviceBranch || '')) branchDrafts.delete(person.id);
      else branchDrafts.set(person.id, service.value);
      feedback.delete(person.id);
      service.setAttribute('aria-invalid', 'false');
      save.disabled = !branchDrafts.has(person.id);
      message.textContent = save.disabled ? '' : 'Branca da salvare.';
      message.hidden = !message.textContent;
      message.classList.toggle('person-feedback-error', false);
      article.classList.toggle('person-card-dirty', !save.disabled);
    };
    edit.onsubmit = e => {
      e.preventDefault();
      if (!branchDrafts.has(person.id)) return;
      mutate(person, 'branch', service.value);
    };
    fields.append(label, save);
    const actions = document.createElement('div');
    actions.className = 'person-actions';
    if (person.hasPassword) {
      const reset = document.createElement('button');
      reset.id = 'person-reset-' + person.id;
      reset.type = 'button';
      reset.className = 'button button-secondary';
      reset.textContent = 'Reimposta password';
      reset.disabled = busy || expired;
      reset.onclick = () => {
        if (busy || expired) return;
        if (!confirm(`Reimpostare la password di ${person.name} (codice ${person.code})?\n\nTutte le sue sessioni saranno revocate. Non verrà generata né inviata una password. Il capo dovrà sceglierne una al prossimo accesso: supervisiona questa inizializzazione, perché chi conosce il codice censimento potrebbe effettuarla.`)) return;
        mutate(person, 'password');
      };
      actions.append(reset);
    }
    edit.append(fields, actions, message);
    article.append(title, identity, edit);
    return article;
  }
  function render(focusId) {
    reload.disabled = busy || expired;
    const filters = [['ALL', 'Tutte', peopleData.length], ...branches.map(branch =>
      [branch || 'UNASSIGNED', branch || 'Da assegnare',
        peopleData.filter(person => (person.serviceBranch || '') === branch).length])]
      .filter(([value, , total]) => total || value === 'ALL' || value === branchFilter);
    branchNav.replaceChildren(...filters.map(([value, label, total]) => {
      const button = document.createElement('button');
      button.id = 'people-filter-' + value.replace('/', '-');
      button.type = 'button';
      button.className = 'people-branch-filter';
      button.setAttribute('aria-pressed', String(branchFilter === value));
      button.textContent = `${label} · ${total}`;
      button.onclick = () => {
        branchFilter = value;
        chooseVisible();
        render(button.id);
      };
      return button;
    }));
    count.textContent = `${peopleData.length} ${peopleData.length === 1 ? 'capo abilitato' : 'capi abilitati'}`;
    const visible = visibleIds.map(id => peopleData.find(person => person.id === id)).filter(Boolean);
    list.replaceChildren(...(visible.length ? visible.map(card) : [Object.assign(document.createElement('p'), {
      textContent: peopleData.length ? 'Nessun capo in questa branca. Scegli un altro filtro.'
        : 'Nessun capo configurato in NAS_CAPO_CODES.'
    })]));
    if (focusId) document.getElementById(focusId)?.focus();
  }
  async function fetchPeople() {
    const result = await A.request('people');
    if (!Array.isArray(result.people)) throw new Error('Risposta elenco non valida.');
    peopleData = result.people.filter(person => person.kind === 'capo' && !person.admin && person.loginEnabled);
    loaded = true;
    app.hidden = false;
  }
  async function load() {
    if (busy || expired) return;
    if (branchDrafts.size && !confirm('Scartare le branche non salvate e ricaricare?')) return;
    busy = true;
    reload.disabled = true;
    announce('Caricamento dei capi…');
    app.setAttribute('aria-busy', 'true');
    if (loaded) render();
    try {
      await fetchPeople();
      branchDrafts.clear();
      feedback.clear();
      chooseVisible();
      announce('');
    } catch (error) {
      if (isExpired(error)) expire();
      else {
        if (!loaded) count.textContent = 'Elenco non disponibile';
        announce(`${loaded ? 'Elenco non aggiornato; dati e bozze conservati.' : 'Impossibile caricare i capi.'} ${error.message} Premi Ricarica per riprovare.`);
      }
    } finally {
      busy = false;
      app.setAttribute('aria-busy', 'false');
      if (loaded) render();
      else reload.disabled = expired;
    }
  }
  async function mutate(person, action, value) {
    if (busy || expired) return;
    busy = true;
    const success = action === 'branch' ? 'Branca salvata.'
      : 'Password reimpostata. Sessioni revocate. Supervisiona il prossimo accesso: il capo sceglierà la nuova password; nessuna password è stata generata o inviata.';
    feedback.set(person.id, { pending: true, text: action === 'branch' ? 'Salvataggio branca…' : 'Reset password in corso…' });
    render('person-feedback-' + person.id);
    try {
      await A.request('people/' + person.id + (action === 'password' ? '/password' : ''),
        action === 'branch' ? 'PATCH' : 'DELETE', action === 'branch' ? { serviceBranch: value } : undefined);
      if (action === 'branch') {
        person.serviceBranch = value;
        branchDrafts.delete(person.id);
      } else person.hasPassword = false;
      feedback.set(person.id, { text: success });
      render('person-feedback-' + person.id);
      // A failed read must never turn a confirmed write into a failed mutation.
      try {
        await fetchPeople();
      } catch (error) {
        feedback.set(person.id, { text: `${success} Elenco non aggiornato: ${error.message} Usa Ricarica per leggere i dati, senza ripetere l’operazione.` });
        if (isExpired(error)) expire();
      }
    } catch (error) {
      feedback.set(person.id, { error: true, action, text: `Operazione non confermata: ${error.message} Le bozze sono conservate. Ricarica l’elenco per verificare lo stato prima di riprovare.` });
      if (isExpired(error)) expire();
    } finally {
      busy = false;
      // Keep the acted-on card visible until the next filter/reload, even if its branch changed.
      render('person-feedback-' + person.id);
    }
  }
  reload.onclick = load;
  window.addEventListener('beforeunload', event => {
    if (!branchDrafts.size && !busy) return;
    event.preventDefault();
    event.returnValue = '';
  });
  load();
})();
