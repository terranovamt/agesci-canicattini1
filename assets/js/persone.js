(function () {
  const status = document.getElementById('people-status');
  const app = document.getElementById('people-app');
  const list = document.getElementById('people-list');
  const branchNav = document.getElementById('people-branches');
  const A = window.ACCESSO;
  if (!window.NAS || !window.NAS.user?.admin) {
    status.textContent = 'Pagina riservata all’amministratore sul NAS.';
    return;
  }
  let busy = false;
  let branchFilter = 'ALL';
  let peopleData = [];
  const branchDrafts = new Map();
  function field(labelText, input) {
    const label = document.createElement('label');
    label.append(document.createTextNode(labelText), input);
    return label;
  }
  function card(person) {
    const article = document.createElement('article');
    article.className = 'person-card';
    const title = document.createElement('h3');
    title.textContent = person.name + ' · ' + person.code;
    const edit = document.createElement('form');
    const fields = document.createElement('div');
    fields.className = 'person-fields';
    const service = document.createElement('select');
    for (const [value, text] of [['', 'Nessuna branca'], ['L/C', 'L/C'], ['E/G', 'E/G'], ['R/S', 'R/S']]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = text; service.append(option);
    }
    const originalBranch = person.serviceBranch || '';
    service.value = branchDrafts.get(person.id) ?? originalBranch;
    const branchStatus = document.createElement('span');
    branchStatus.className = 'person-save-status';
    branchStatus.textContent = service.value === originalBranch ? 'Nessuna modifica' : 'Da salvare';
    fields.append(field('Branca di servizio', service));
    service.onchange = () => {
      if (service.value === originalBranch) branchDrafts.delete(person.id);
      else branchDrafts.set(person.id, service.value);
      save.disabled = service.value === originalBranch;
      branchStatus.textContent = save.disabled ? 'Nessuna modifica' : 'Da salvare';
      article.classList.toggle('person-card-dirty', !save.disabled);
    };
    const hint = document.createElement('p');
    hint.textContent = person.hasPassword
      ? 'Password impostata.'
      : 'Password non impostata: il capo la sceglie al primo accesso.';
    const actions = document.createElement('div');
    actions.className = 'person-actions';
    const save = document.createElement('button');
    save.className = 'button button-secondary';
    save.type = 'submit';
    save.textContent = 'Salva branca';
    save.disabled = service.value === originalBranch;
    actions.append(branchStatus);
    actions.append(save);
    edit.onsubmit = e => {
      e.preventDefault();
      run(async () => {
        await A.request('people/' + person.id, 'PATCH', { serviceBranch: service.value });
        branchDrafts.delete(person.id);
      });
    };
    if (person.hasPassword) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'button button-secondary';
      reset.textContent = 'Reimposta password';
      reset.onclick = () => {
        const message = 'Reimpostare la password di ' + person.name + '? Tutte le sue sessioni saranno revocate.';
        if (!confirm(message)) return;
        run(async () => {
          await A.request('people/' + person.id + '/password', 'DELETE');
        });
      };
      actions.append(reset);
    }
    edit.append(fields, actions);
    article.classList.toggle('person-card-dirty', !save.disabled);
    article.append(title, hint, edit);
    return article;
  }
  async function load() {
    const result = await A.request('people');
    peopleData = result.people.filter(person => person.kind === 'capo' && !person.admin && person.loginEnabled);
    app.hidden = false;
    render();
  }
  function render() {
    const people = peopleData;
    const branches = ['L/C', 'E/G', 'R/S', ''];
    const counts = Object.fromEntries(branches.map(branch => [branch, people.filter(person => (person.serviceBranch || '') === branch).length]));
    if (branchFilter !== 'ALL' && !counts[branchFilter === 'UNASSIGNED' ? '' : branchFilter])
      branchFilter = 'ALL';
    const filters = [['ALL', 'Tutte', people.length], ...branches.filter(branch => counts[branch]).map(branch =>
      [branch || 'UNASSIGNED', branch || 'Da assegnare', counts[branch]])];
    branchNav.replaceChildren(...filters.map(([value, label, count]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'people-branch-filter';
      button.setAttribute('aria-pressed', String(branchFilter === value));
      button.textContent = `${label} · ${count}`;
      button.onclick = () => {
        branchFilter = value;
        render();
        branchNav.querySelector?.('[aria-pressed="true"]')?.focus?.();
      };
      return button;
    }));
    document.getElementById('people-count').textContent =
      `${people.length} ${people.length === 1 ? 'capo abilitato' : 'capi abilitati'}`;
    const visibleBranches = branchFilter === 'ALL' ? branches.filter(branch => counts[branch])
      : [branchFilter === 'UNASSIGNED' ? '' : branchFilter];
    list.replaceChildren(...(people.length ? visibleBranches.map(branch => {
      const group = document.createElement('section');
      group.className = 'people-branch-group';
      const heading = document.createElement('h3');
      heading.textContent = branch || 'Da assegnare';
      const cards = document.createElement('div');
      cards.className = 'people-branch-cards';
      cards.append(...people.filter(person => (person.serviceBranch || '') === branch).map(card));
      group.append(heading, cards);
      return group;
    }) : [Object.assign(document.createElement('p'), {
      textContent: 'Nessun capo configurato in NAS_CAPO_CODES.'
    })]));
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    app.inert = true;
    status.textContent = 'Operazione in corso...';
    try {
      await action();
      await load();
      status.textContent = 'Elenco aggiornato.';
    } catch (error) { status.textContent = error.message }
    finally { busy = false; app.inert = false }
  }
  document.getElementById('reload-people').onclick = () => {
    if (branchDrafts.size && !confirm('Scartare le branche non salvate e ricaricare?')) return;
    branchDrafts.clear();
    run(async () => {});
  };
  run(async () => {});
})();
