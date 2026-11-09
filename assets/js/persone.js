(function () {
  const status = document.getElementById('people-status');
  const app = document.getElementById('people-app');
  const list = document.getElementById('people-list');
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
    const service = document.createElement('select');
    for (const [value, text] of [['', 'Nessuna branca'], ['L/C', 'L/C'], ['E/G', 'E/G'], ['R/S', 'R/S']]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = text; service.append(option);
    }
    service.value = person.serviceBranch || '';
    fields.append(field('Branca di servizio', service));
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
    actions.append(save);
    edit.onsubmit = e => {
      e.preventDefault();
      run(() => A.request('people/' + person.id, 'PATCH', { serviceBranch: service.value }));
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
    article.append(title, hint, edit);
    return article;
  }
  async function load() {
    const result = await A.request('people');
    const people = result.people.filter(person => person.kind === 'capo' && !person.admin && person.loginEnabled);
    list.replaceChildren(...(people.length ? people.map(card) : [Object.assign(document.createElement('p'), {
      textContent: 'Nessun capo configurato in NAS_CAPO_CODES.'
    })]));
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
  document.getElementById('reload-people').onclick = () => run(async () => {});
  run(async () => {});
})();
