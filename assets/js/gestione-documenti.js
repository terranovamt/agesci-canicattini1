(function () {
  if (!window.ACCESSO.verificata()) {
    location.replace('index.html');
    return;
  }
  const $ = id => document.getElementById(id);
  const D = window.DOCUMENTS;
  const preview = window.DOCUMENTS_PREVIEW === true;
  let items = [], editing = null, busy = false, ready = false, formDirty = false;
  const credentials = () => $('document-token').value.trim() || localStorage.getItem(D.tokenKey) || '';
  $('documents-app').hidden = false;
  $('github-credentials').hidden = preview;
  $('document-token').value = localStorage.getItem(D.tokenKey) || '';

  function message(text, error = false) {
    $('documents-message').textContent = text;
    $('documents-message').className = error ? 'error' : '';
  }
  function lock(value) {
    busy = value;
    $('document-form').querySelectorAll('input,textarea,button').forEach(element => { element.disabled = value });
    $('save-document').disabled = value || !ready;
    $('reload-documents').disabled = value;
    $('managed-documents').querySelectorAll('button').forEach(button => { button.disabled = value });
  }
  function reset() {
    editing = null;
    formDirty = false;
    $('document-file').value = '';
    $('document-file').required = true;
    $('document-title').value = '';
    $('document-description').value = '';
    $('edit-heading').textContent = 'Nuovo documento';
    $('file-hint').textContent = '(obbligatorio)';
    $('save-document').textContent = 'Pubblica documento';
    $('cancel-document').hidden = true;
  }
  function startEdit(item) {
    if (formDirty && !confirm('Scartare le modifiche al documento aperto?')) return;
    editing = { ...item };
    $('document-file').value = '';
    $('document-file').required = false;
    $('document-title').value = item.title;
    $('document-description').value = item.description;
    $('file-hint').textContent = '(facoltativo: sostituisce ' + item.file + ')';
    $('edit-heading').textContent = 'Modifica documento';
    $('save-document').textContent = 'Salva modifiche';
    $('cancel-document').hidden = false;
    formDirty = false;
    $('document-title').focus();
    $('document-form').scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function render() {
    const list = $('managed-documents');
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nessun PDF pubblicato. Carica il primo documento con il modulo.';
      list.append(empty);
    }
    items.forEach(item => {
      const article = document.createElement('article');
      article.className = 'managed-document';
      const title = document.createElement('h3');
      title.textContent = item.title;
      const description = document.createElement('p');
      description.textContent = item.description;
      const open = document.createElement('a');
      open.href = '../documents/pdf/' + encodeURIComponent(item.file);
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = 'Apri ' + item.file;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary';
      edit.textContent = 'Modifica';
      edit.setAttribute('aria-label', 'Modifica ' + item.title);
      edit.onclick = () => startEdit(item);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Elimina';
      remove.setAttribute('aria-label', 'Elimina ' + item.title);
      remove.onclick = async () => {
        if (busy || !confirm('Eliminare "' + item.title + '" e il suo PDF dal sito?')) return;
        if (formDirty && !confirm('Questa operazione scarterà anche le modifiche al modulo. Continuare?')) return;
        await publish({ operation: 'delete', previous: item });
      };
      actions.append(edit, remove);
      article.append(title, description, open, actions);
      list.append(article);
    });
  }
  async function reload() {
    if (busy || (formDirty && !confirm('Scartare le modifiche al modulo e ricaricare?'))) return;
    lock(true);
    message('Caricamento dei documenti…');
    try {
      items = await D.load(credentials());
      ready = true;
      reset();
      render();
      message(preview ? 'Anteprima: modifiche simulate in memoria, nessuna pubblicazione reale.' : 'Documenti aggiornati da GitHub.');
    } catch (error) {
      ready = false;
      message(error.message, true);
    } finally { lock(false) }
  }
  async function publish(change) {
    lock(true);
    message(preview ? 'Salvataggio nella simulazione locale…' : 'Pubblicazione su GitHub…');
    try {
      items = await D.save(change, credentials());
      if (!preview) localStorage.setItem(D.tokenKey, credentials());
      reset();
      render();
      message(preview ? 'Salvato nella simulazione locale. Ricarica la home per vedere il risultato.' : 'Salvato su GitHub. Attendi GitHub Pages per vedere la modifica sul sito.');
    } catch (error) {
      message(error.message, true);
    } finally { lock(false) }
  }
  $('document-form').oninput = event => {
    if (event.target.id !== 'document-token') formDirty = true;
  };
  $('document-form').onsubmit = async event => {
    event.preventDefault();
    if (busy || !ready) return;
    const file = $('document-file').files[0];
    const title = $('document-title').value.trim();
    const description = $('document-description').value.trim();
    if (!title || !description) { message('Inserisci un titolo e una descrizione.', true); return }
    lock(true);
    let change;
    try {
      let content;
      if (file) {
        if (!D.safeName(file.name)) throw new Error('Seleziona un file con estensione .pdf e un nome valido');
        if (file.size >= 100 * 1024 * 1024) throw new Error('Il PDF supera il limite GitHub di 100 MiB');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Il file selezionato non è un PDF valido');
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        content = btoa(binary);
      } else if (!editing) throw new Error('Seleziona un PDF da caricare');
      change = {
        operation: 'save', previous: editing || undefined,
        document: { file: editing?.file || file.name, title, description },
        content
      };
      D.apply(items, change);
    } catch (error) { message(error.message, true); lock(false); return }
    await publish(change);
  };
  $('cancel-document').onclick = () => { if (!formDirty || confirm('Scartare le modifiche?')) reset() };
  $('reload-documents').onclick = reload;
  $('forget-token').onclick = () => {
    localStorage.removeItem(D.tokenKey);
    $('document-token').value = '';
    message('Token GitHub dimenticato.');
  };
  addEventListener('beforeunload', event => { if (formDirty || busy) event.preventDefault() });
  reload();
})();
