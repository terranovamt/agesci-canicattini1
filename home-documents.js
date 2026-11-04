(function () {
  const list = document.getElementById('documents-list');
  const status = document.getElementById('documents-status');
  const retry = document.getElementById('documents-retry');

  async function load() {
    retry.hidden = true;
    status.textContent = 'Caricamento dei documenti…';
    list.replaceChildren();
    try {
      const response = await fetch(list.dataset.documentsUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Impossibile leggere i documenti (HTTP ' + response.status + ')');
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error('Elenco dei documenti non valido');
      const files = entries.filter(entry => typeof entry.file === 'string'
        && /^[^/\\]+\.pdf$/i.test(entry.file) && !entry.file.startsWith('.'));
      files.sort((a, b) => (a.title || a.file).localeCompare(b.title || b.file, 'it', { numeric: true }));
      status.textContent = files.length ? files.length + ' documenti PDF disponibili.' : 'Non ci sono ancora documenti PDF pubblicati.';
      files.forEach(file => {
        const card = document.createElement('article');
        card.className = 'document-card';
        const type = document.createElement('span');
        type.className = 'document-number';
        type.textContent = 'PDF';
        const heading = document.createElement('h3');
        heading.textContent = file.title || file.file.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
        const description = document.createElement('p');
        description.textContent = file.description || '';
        const actions = document.createElement('div');
        actions.className = 'document-actions';
        const url = 'documents/pdf/' + encodeURIComponent(file.file);
        const open = document.createElement('a');
        open.href = url;
        open.target = '_blank';
        open.rel = 'noopener';
        open.textContent = 'Apri PDF';
        open.setAttribute('aria-label', 'Apri ' + heading.textContent + ' in una nuova scheda');
        const download = document.createElement('a');
        download.href = url;
        download.download = file.file;
        download.textContent = 'Scarica';
        download.setAttribute('aria-label', 'Scarica ' + heading.textContent);
        actions.append(open, download);
        card.append(type, heading, description, actions);
        list.append(card);
      });
    } catch (error) {
      status.textContent = error.message + '. Riprova tra poco.';
      retry.hidden = false;
      console.error('Caricamento PDF non riuscito', error);
    }
  }
  retry.onclick = load;
  load();
})();
