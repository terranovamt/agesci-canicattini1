const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function fixture(file, css, scripts) {
  const index = read('documents/index.json');
  const mock = `
    window.ACCESSO = { verificata: () => true };
    window.LIVE = { github: { repo: 'test/repo', ramo: 'test' } };
    window.DOCUMENTS_PREVIEW = true;
    history.replaceState = () => {};
    let items = ${index};
    Object.defineProperty(window, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} } });
    window.confirm = () => true;
    window.fetch = async (url, options) => {
      if (options?.method === 'POST') items = DOCUMENTS_MODEL.apply(items, JSON.parse(options.body));
      return { ok: true, json: async () => JSON.parse(JSON.stringify(items)) };
    };
    const append = document.head.append.bind(document.head);
    document.head.append = element => {
      if (element.tagName === 'SCRIPT' && element.src.includes('dati.js')) {
        window.DATI = { anno_esercizio: 2026, assemblea: { titolo: 'Assemblea del gruppo', data: '20 Novembre' },
          slide: [{ tipo: 'slide_titolo', titolo: 'Una slide con un titolo abbastanza lungo per verificare la leggibilità' },
            { tipo: 'slide_divisore_sezione', titolo: 'Sezione di prova' }] };
        element.onload();
      } else append(element);
    };
  `;
  return read(file).replace(/<link\b[^>]*>/g, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/g, original => file === 'index.html' ? '' : original)
    .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
      scripts.includes(src) ? '<script>' + read(path.join(path.dirname(file), src)) + '</script>' : '')
    .replace('</head>', '<style>' + read('Assemblea-di-Gruppo/common/theme.css') + read(css) + '</style><script>' + mock + '</script></head>');
}

test('public documents and management work in a browser at all required widths', { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-documents-'));
  const pages = [
    fixture('index.html', 'home.css', ['home-documents.js']),
    fixture('gestione-documenti.html', 'gestione-documenti.css', ['documents-model.js', 'documents-store.js', 'gestione-documenti.js']),
    fixture('Assemblea-di-Gruppo/setup.html', 'Assemblea-di-Gruppo/common/setup.css',
      ['common/salva-dati.js', 'common/modifiche.js', 'common/setup.js'])
  ];
  const html = `<!doctype html><meta charset="utf-8"><body><script>
    const pages = ${JSON.stringify(pages).replace(/</g, '\\u003c')};
    const results = [];
    (async () => {
      for (let page = 0; page < pages.length; page++) {
        const frame = document.createElement('iframe');
        frame.style.height = '1000px';
        document.body.append(frame);
        const loaded = new Promise(resolve => frame.onload = resolve);
        frame.srcdoc = pages[page];
        await loaded;
        const doc = frame.contentDocument;
        for (const width of [375, 768, 1024, 1440]) {
          frame.style.width = width + 'px';
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push({ page, width, overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth });
          if (page === 2) {
            for (const section of ['ordine', 'json', 'generale']) {
              doc.querySelector('[data-tab="' + section + '"]').click();
              results.push({ page, width, section, overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth });
            }
            frame.contentWindow.scrollTo(0, 100000);
            const field = [...doc.querySelectorAll('#campi input')].at(-1).getBoundingClientRect();
            const footer = doc.querySelector('footer').getBoundingClientRect();
            results.push({ width, reachable: field.bottom <= footer.top });
          }
        }
        if (page === 0) {
          const cards = [...doc.querySelectorAll('.document-card')];
          results.push({ cards: cards.length, title: cards[0].querySelector('h3').textContent,
            description: cards[0].querySelector('p').textContent,
            links: cards.every(card => [...card.querySelectorAll('a')].every(link => /documents\\/pdf\\/.+\\.pdf$/i.test(link.getAttribute('href')))) });
        } else if (page === 1) {
          const win = frame.contentWindow;
          const input = doc.querySelector('#document-file');
          const transfer = new win.DataTransfer();
          transfer.items.add(new win.File(['%PDF-1.7\\nfixture'], 'nuovo.pdf', { type: 'application/pdf' }));
          input.files = transfer.files;
          doc.querySelector('#document-title').value = 'Documento nuovo';
          doc.querySelector('#document-description').value = 'Descrizione di prova';
          const saved = () => new Promise(resolve => {
            const observer = new win.MutationObserver(() => {
              if (!doc.querySelector('#save-document').disabled) { observer.disconnect(); resolve() }
            });
            observer.observe(doc.querySelector('#save-document'), { attributes: true });
          });
          const uploaded = saved();
          doc.querySelector('#document-form').requestSubmit();
          await uploaded;
          results.push({ uploaded: doc.querySelectorAll('.managed-document').length,
            status: doc.querySelector('#documents-message').textContent });
          doc.querySelector('.managed-document:last-child button').click();
          doc.querySelector('#document-title').value = 'Titolo modificato';
          const edited = saved();
          doc.querySelector('#document-form').requestSubmit();
          await edited;
          results.push({ edited: doc.querySelector('.managed-document:last-child h3').textContent });
          const deleted = saved();
          doc.querySelector('.managed-document:last-child .danger').click();
          await deleted;
          results.push({ remaining: doc.querySelectorAll('.managed-document').length });
        }
        frame.remove();
      }
      const out = document.createElement('pre'); out.id = 'results'; out.textContent = JSON.stringify(results); document.body.append(out);
    })().catch(error => { const out = document.createElement('pre'); out.id = 'error'; out.textContent = error.stack; document.body.append(out) });
  </script>`;
  try {
    const file = path.join(dir, 'browser.html');
    fs.writeFileSync(file, html);
    const result = spawnSync(chrome, [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--virtual-time-budget=5000', '--timeout=10000',
      '--user-data-dir=' + path.join(dir, 'profile'), '--dump-dom', 'file://' + file
    ], { encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
    assert.ok(match, result.stdout.slice(-6000));
    const results = JSON.parse(match[1]);
    for (const item of results.filter(item => 'overflow' in item)) {
      assert.equal(item.overflow, false, 'page ' + item.page + ' must fit width ' + item.width);
    }
    assert.equal(results.find(item => 'cards' in item).cards, 2);
    assert.equal(results.find(item => 'cards' in item).links, true);
    assert.ok(results.find(item => 'cards' in item).description.length > 10);
    assert.equal(results.find(item => 'uploaded' in item).uploaded, 3, JSON.stringify(results));
    assert.match(results.find(item => 'uploaded' in item).status, /Salvato/);
    assert.equal(results.find(item => 'edited' in item).edited, 'Titolo modificato');
    assert.equal(results.find(item => 'remaining' in item).remaining, 2);
    for (const item of results.filter(item => 'reachable' in item)) {
      assert.equal(item.reachable, true, 'setup fields must be reachable above the action bar at width ' + item.width);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
});
