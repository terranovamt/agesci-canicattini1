(function () {
  const list = document.getElementById('documents-list');
  const status = document.getElementById('documents-status');
  const retry = document.getElementById('documents-retry');
  const siteRoot = list.dataset.siteRoot || '';
  const preparatory = [
    { file: 'PEG26-28.pdf', label: 'Il nostro percorso', theme: 'project', link: 'peg/index.html',
      icon: ['M4 5h6a3 3 0 0 1 3 3v12a4 4 0 0 0-3-1H4z', 'M13 8a3 3 0 0 1 3-3h4v14h-4a4 4 0 0 0-3 1'] },
    { file: 'Rendiconto_per_cassa_-_ModelloD.pdf', label: 'Trasparenza · 2026', theme: 'finance',
      icon: ['M4 20h16', 'M6 16v-4', 'M12 16V4', 'M18 16V8'] },
    { file: 'ConvocaAssemblea26.pdf', label: 'L’invito a partecipare', theme: 'invitation',
      icon: ['M4 6h16v13H4z', 'm4 7 8 6 8-6'] },
    { file: 'RegolamentoAssembleaCanicattini1.pdf', label: 'Le regole condivise', theme: 'rules',
      icon: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 12h7', 'M9 16h7'] }
  ];

  function icon(paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(d => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    });
    return svg;
  }

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
      const order = file => {
        const index = preparatory.findIndex(item => item.file === file.file);
        return index === -1 ? preparatory.length : index;
      };
      files.sort((a, b) => order(a) - order(b)
        || (a.title || a.file).localeCompare(b.title || b.file, 'it', { numeric: true }));
      status.textContent = files.length ? files.length + ' documenti PDF disponibili.' : 'Non ci sono ancora documenti PDF pubblicati.';
      files.forEach(file => {
        const detail = preparatory.find(item => item.file === file.file);
        const card = document.createElement('article');
        card.className = 'document-card document-' + (detail?.theme || 'rules');
        const top = document.createElement('div');
        top.className = 'document-card-top';
        const emblem = document.createElement('span');
        emblem.className = 'document-icon';
        emblem.append(icon(detail?.icon || preparatory[3].icon));
        const type = document.createElement('span');
        type.className = 'document-number';
        type.textContent = detail ? String(preparatory.indexOf(detail) + 1).padStart(2, '0') : 'PDF';
        top.append(emblem, type);
        const label = document.createElement('span');
        label.className = 'document-label';
        label.textContent = detail?.label || 'Documenti del gruppo';
        const heading = document.createElement('h3');
        heading.textContent = file.title || file.file.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
        const description = document.createElement('p');
        description.textContent = file.description || '';
        const actions = document.createElement('div');
        actions.className = 'document-actions';
        const url = siteRoot + 'documents/pdf/' + encodeURIComponent(file.file);
        const open = document.createElement('a');
        open.href = detail?.link ? siteRoot + detail.link : url;
        if (!detail?.link) { open.target = '_blank'; open.rel = 'noopener' }
        open.className = 'document-primary';
        open.textContent = detail?.link ? 'Leggi il PEG →' : 'Consulta PDF ↗';
        open.setAttribute('aria-label', detail?.link ? 'Leggi ' + heading.textContent
          : 'Apri ' + heading.textContent + ' in una nuova scheda');
        const download = document.createElement('a');
        download.href = url;
        download.download = file.file;
        download.textContent = 'Scarica PDF';
        download.setAttribute('aria-label', 'Scarica ' + heading.textContent);
        actions.append(open, download);
        card.append(top, label, heading, description, actions);
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
