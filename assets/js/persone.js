(function () {
  const status = document.getElementById('people-status');
  const app = document.getElementById('people-app');
  const list = document.getElementById('people-list');
  const form = document.getElementById('person-form');
  const A = window.ACCESSO;
  if (!window.NAS || !window.NAS.user?.admin) {
    status.textContent = 'Pagina riservata all’amministratore sul NAS.';
    return;
  }
  let busy = false;
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
    const name = document.createElement('input');
    name.value = person.name;
    name.required = true;
    name.maxLength = 120;
    const kind = document.createElement('select');
    for (const [value, text] of [['ragazzo', 'Ragazzo'], ['capo', 'Capo']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      kind.append(option);
    }
    kind.value = person.kind;
    kind.disabled = person.admin;
    const service = document.createElement('select');
    for (const [value, text] of [['', 'Nessuna branca'], ['L/C', 'L/C'], ['E/G', 'E/G'], ['R/S', 'R/S']]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = text; service.append(option);
    }
    service.value = person.serviceBranch || '';
    service.disabled = kind.value !== 'capo' || person.admin;
    kind.onchange = () => { service.disabled = kind.value !== 'capo'; if (service.disabled) service.value = ''; };
    fields.append(field('Nome e cognome', name), field('Tipologia', kind), field('Branca di servizio', service));
    const hint = document.createElement('p');
    hint.textContent = person.admin ? 'Unico amministratore del sito. Password gestita da NAS_ADMIN_PASSWORD in nas.env (o .env), non salvata nel database.' : person.kind === 'ragazzo'
      ? 'Nessun accesso all’area riservata.' : !person.loginEnabled
        ? 'Login non abilitato: aggiungi il codice a NAS_CAPO_CODES in nas.env (o .env); l’aggiornamento NAS lo applica automaticamente.'
        : person.hasPassword ? 'Password impostata.' : 'Password da impostare al prossimo accesso.';
    const actions = document.createElement('div');
    actions.className = 'person-actions';
    const save = document.createElement('button');
    save.className = 'button button-secondary';
    save.type = 'submit';
    save.textContent = 'Salva modifiche';
    actions.append(save);
    edit.onsubmit = e => {
      e.preventDefault();
      if (person.kind === 'capo' && kind.value === 'ragazzo' &&
          !confirm('Il passaggio a ragazzo cancella la password e revoca gli accessi. Continuare?')) return;
      run(() => A.request('people/' + person.id, 'PATCH', { name: name.value, kind: kind.value, serviceBranch: service.value }));
    };
    if (!person.admin && person.kind === 'capo' && person.hasPassword) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'button button-secondary';
      reset.textContent = 'Cancella password';
      reset.onclick = () => {
        const message = 'Cancellare la password di ' + person.name + '? Tutte le sue sessioni saranno revocate.';
        if (!confirm(message)) return;
        run(async () => {
          await A.request('people/' + person.id + '/password', 'DELETE');
        });
      };
      actions.append(reset);
    }
    edit.append(fields, actions);
    article.append(title, hint, edit);
    return article;
  }
  async function load() {
    const result = await A.request('people');
    list.replaceChildren(...result.people.filter(person => person.kind === 'capo').map(card));
    app.hidden = false;
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
  form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    run(async () => { await A.request('people', 'POST', data); form.reset() });
  };
  document.getElementById('reload-people').onclick = () => run(async () => {});
  run(async () => {});
})();
