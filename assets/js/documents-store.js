(function () {
  const config = window.LIVE.github;
  const api = 'https://api.github.com/repos/' + config.repo;
  const manifest = 'documents/index.json';
  const tokenKey = 'assemblea-gh-token';
  const { apply, validate, safeName } = window.DOCUMENTS_MODEL;

  async function request(route, token, body, method) {
    const response = await fetch(api + route, {
      method: method || (body ? 'POST' : 'GET'),
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body)
    });
    if (response.status === 401) {
      localStorage.removeItem(tokenKey);
      throw new Error('Token GitHub non valido o scaduto');
    }
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) throw new Error('Conflitto GitHub: ricarica i documenti prima di riprovare.');
      throw new Error('GitHub HTTP ' + response.status + ': controlla il token e il permesso Contents: Read and write.');
    }
    return response.json();
  }

  function decode(base64) {
    return new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\s/g, '')), value => value.charCodeAt(0)));
  }

  async function load(token) {
    if (window.DOCUMENTS_PREVIEW || window.LIVE.nas) {
      const response = await fetch('/documents/index.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Indice documenti locale non disponibile');
      return validate(await response.json());
    }
    if (!token) throw new Error('Inserisci il token GitHub per gestire i documenti');
    const content = await request('/contents/' + manifest + '?ref=' + encodeURIComponent(config.ramo), token);
    return validate(JSON.parse(decode(content.content)));
  }

  async function save(change, token) {
    if (window.DOCUMENTS_PREVIEW || window.LIVE.nas) {
      const response = await fetch(window.DOCUMENTS_PREVIEW ? '/__preview/documents' : '/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change)
      });
      if (!response.ok) throw new Error(await response.text());
      return validate(await response.json());
    }
    if (!token) throw new Error('Inserisci il token GitHub per pubblicare i documenti');
    const ref = await request('/git/ref/heads/' + encodeURIComponent(config.ramo), token);
    const parent = ref.object.sha;
    const [commit, content] = await Promise.all([
      request('/git/commits/' + parent, token),
      request('/contents/' + manifest + '?ref=' + parent, token)
    ]);
    const next = apply(JSON.parse(decode(content.content)), change);
    const entries = [{
      path: manifest, mode: '100644', type: 'blob', content: JSON.stringify(next, null, 2) + '\n'
    }];
    if (change.operation === 'delete') {
      entries.push({ path: 'documents/pdf/' + change.previous.file, mode: '100644', type: 'blob', sha: null });
    } else if (change.content) {
      const blob = await request('/git/blobs', token, { content: change.content, encoding: 'base64' });
      entries.push({ path: 'documents/pdf/' + change.document.file, mode: '100644', type: 'blob', sha: blob.sha });
    } else if (!change.previous) throw new Error('Seleziona un file PDF da caricare');
    const tree = await request('/git/trees', token, { base_tree: commit.tree.sha, tree: entries });
    const saved = await request('/git/commits', token, {
      message: change.operation === 'delete' ? 'docs: elimina documento del gruppo' : 'docs: aggiorna documenti del gruppo',
      tree: tree.sha, parents: [parent]
    });
    await request('/git/refs/heads/' + encodeURIComponent(config.ramo), token, { sha: saved.sha, force: false }, 'PATCH');
    return next;
  }

  window.DOCUMENTS = { apply, load, save, validate, safeName, tokenKey };
})();
