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
  const calendars = read('calendars/events.json');
  const mock = `
    window.ACCESSO = { verificata: () => true, chiave: () => '', esci() {} };
    window.LIVE = { github: { repo: 'test/repo', ramo: 'test' } };
    window.DOCUMENTS_PREVIEW = true;
    history.replaceState = () => {};
    let items = ${index};
    Object.defineProperty(window, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} } });
    window.confirm = () => true;
    window.fetch = async (url, options) => {
      if (url === 'calendars/events.json') {
        const snapshot = ${calendars};
        snapshot.generatedAt = new Date().toISOString();
        snapshot.calendars.forEach(calendar => { calendar.status = 'ok'; calendar.lastSuccess = snapshot.generatedAt });
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const day = tomorrow.toISOString().slice(0, 10);
        snapshot.events = snapshot.calendars.map((calendar, i) => ({
          id: String(i), calendar: calendar.id, title: '<img src=x onerror=alert(1)>Evento ' + calendar.name,
          location: 'Sede', start: day + 'T09:00:00Z', end: day + 'T10:00:00Z', allDay: false
        }));
        return { ok: true, json: async () => snapshot };
      }
      if (options?.method === 'POST') items = DOCUMENTS_MODEL.apply(items, JSON.parse(options.body));
      return { ok: true, json: async () => JSON.parse(JSON.stringify(items)) };
    };
    const append = document.head.append.bind(document.head);
    document.head.append = element => {
      if (element.tagName === 'SCRIPT' && element.src.includes('dati.js')) {
        ${read('Assemblea-di-Gruppo/dati.js')}
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
    fixture('index.html', 'home.css', ['home-documents.js', 'calendar-model.js', 'home-calendars.js']),
    fixture('gestione-documenti.html', 'gestione-documenti.css', ['documents-model.js', 'documents-store.js', 'gestione-documenti.js']),
    fixture('Assemblea-di-Gruppo/setup.html', 'Assemblea-di-Gruppo/common/setup.css',
      ['common/salva-dati.js', 'common/modifiche.js', 'common/nuovo-anno-model.js', 'common/nuovo-anno.js', 'common/setup.js']),
    fixture('area-riservata.html', 'home.css', ['area-dashboard.js', 'area-riservata.js'])
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
          frame.style.height = (width === 375 ? 740 : 1000) + 'px';
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push({ page, width, overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth });
          if (page === 0) {
            doc.querySelector('#calendar-info').open = true;
            results.push({ page, width, overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth });
            doc.querySelector('#calendar-info').open = false;
          }
          if (page === 2) {
            for (const section of ['ordine', 'json', 'generale']) {
              doc.querySelector('[data-tab="' + section + '"]').click();
              results.push({ page, width, section, overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth });
            }
            frame.contentWindow.scrollTo(0, 100000);
            const field = [...doc.querySelectorAll('#campi input')].at(-1).getBoundingClientRect();
            const footer = doc.querySelector('footer').getBoundingClientRect();
            results.push({ width, reachable: field.bottom <= footer.top });
            const readSetup = () => {
              doc.querySelector('[data-tab="json"]').click();
              const value = JSON.parse(doc.querySelector('#json-text').value);
              doc.querySelector('[data-tab="generale"]').click();
              return value;
            };
            const before = JSON.stringify(readSetup());
            doc.querySelector('#nuovo-anno').click();
            const wizard = doc.querySelector('#year-dialog');
            results.push({ wizardOpened: wizard.open, width });
            for (let step = 0; step < 6; step++) {
              for (const input of doc.querySelectorAll('#year-fields input')) {
                if (input.type === 'number' && input.value === '') input.value = '10';
                if (input.type === 'datetime-local') input.value = '2027-11-20T20:30';
                if (input.required && input.value === '') input.value = '20 Novembre 2027';
                input.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
              }
              results.push({ wizardWidth: width, step,
                fits: wizard.scrollWidth <= wizard.clientWidth,
                actionsVisible: doc.querySelector('#year-next').getBoundingClientRect().bottom <= frame.contentWindow.innerHeight,
                valid: doc.querySelector('#year-form').checkValidity() });
              if (step === 1) results.push({ dateTimeFields: doc.querySelectorAll('#year-fields input[type="datetime-local"]').length,
                duplicateDate: [...doc.querySelectorAll('#year-fields label')].some(label => label.textContent.includes('Data assemblea (es.')) });
              doc.querySelector('#year-form').requestSubmit();
            }
            results.push({ review: doc.querySelector('#year-step-title').textContent,
              error: doc.querySelector('#year-error').textContent,
              reviewFits: wizard.scrollWidth <= wizard.clientWidth,
              unchanged: JSON.stringify(readSetup()) === before });
            if (width !== 1440) {
              doc.querySelector('#year-cancel').click();
              results.push({ cancelUnchanged: JSON.stringify(readSetup()) === before });
            } else {
              doc.querySelector('.year-confirm input').checked = true;
              doc.querySelector('#year-form').requestSubmit();
              const after = readSetup();
              results.push({ applied: after.anno_esercizio, archived: after.censimenti.storico_per_anno['2026'].censiti,
                writtenDate: after.assemblea.data,
                qrDate: after.slide.find(slide => slide.tipo === 'slide_qr_live').data_ora,
                newAmount: after.entrate[0].importo, previousAmount: after.entrate[0].importo_anno_precedente,
                dirty: !doc.querySelector('#salva-gh').disabled, wizardClosed: !wizard.open });
            }
          }
        }
        if (page === 0) {
          results.push({ infoClosed: !doc.querySelector('#calendar-info').open,
            bannerHidden: doc.querySelector('#stato').hidden,
            compactLabels: [...doc.querySelectorAll('.calendar-filter-name')].map(e => e.textContent).join(',') });
          doc.querySelector('#calendar-info').open = true;
          results.push({ infoFits: doc.documentElement.scrollWidth <= doc.documentElement.clientWidth });
          doc.querySelector('#calendar-info').open = false;
          results.push({ calendarFilters: doc.querySelectorAll('#calendar-filters input').length,
            agendaCount: doc.querySelectorAll('.agenda-event').length,
            safeText: doc.querySelector('.agenda-event h4').textContent.startsWith('<img'),
            injected: doc.querySelector('.agenda-event h4 img') !== null });
          const filters = [...doc.querySelectorAll('#calendar-filters input')];
          filters.forEach(input => { input.checked = false; input.onchange() });
          results.push({ noneSelected: doc.querySelector('#calendar-agenda').textContent });
          filters[1].checked = true; filters[1].onchange();
          results.push({ branchCount: doc.querySelectorAll('.agenda-event').length,
            branch: doc.querySelector('.event-source').textContent });
          doc.querySelector('#calendar-all').click();
          const previousMonth = doc.querySelector('#calendar-month').textContent;
          doc.querySelector('#calendar-next').click();
          results.push({ changedMonth: previousMonth !== doc.querySelector('#calendar-month').textContent });
          doc.querySelector('#calendar-today').click();
          const dayWithEvent = [...doc.querySelectorAll('.calendar-day')].find(button => button.querySelector('.day-marker'));
          if (dayWithEvent) {
            dayWithEvent.click();
            results.push({ selectedDay: doc.querySelectorAll('.calendar-day[aria-pressed=true]').length,
              dayAgenda: doc.querySelectorAll('.agenda-event').length });
          }
          frame.contentWindow.fetch = async () => ({ ok: false, status: 503 });
          await doc.querySelector('#calendar-retry').onclick();
          results.push({ calendarFailure: !doc.querySelector('#calendar-retry').hidden,
            calendarFailureText: doc.querySelector('#calendar-status').textContent,
            warningVisible: !doc.querySelector('#calendar-info-warning').hidden });
          const errorSnapshot = ${JSON.stringify(JSON.parse(read('calendars/events.json'))).replace(/</g, '\\u003c')};
          errorSnapshot.calendars.forEach(calendar => { calendar.status = 'error' });
          frame.contentWindow.fetch = async () => ({ ok: true, json: async () => errorSnapshot });
          await doc.querySelector('#calendar-retry').onclick();
          results.push({ unavailableFilters: doc.querySelectorAll('.calendar-filter.is-unavailable').length,
            errorBannerHidden: doc.querySelector('#stato').hidden });
          errorSnapshot.generatedAt = new Date().toISOString();
          errorSnapshot.calendars.forEach(calendar => { calendar.status = 'ok' });
          const soon = new Date(Date.now() + 5 * 86400000);
          errorSnapshot.events = [{ id: 'assembly', calendar: 'gruppo', title: 'Assemblea di Gruppo',
            start: soon.toISOString(), end: new Date(soon.getTime() + 3600000).toISOString(),
            allDay: false, location: '' }];
          await doc.querySelector('#calendar-retry').onclick();
          results.push({ upcomingAssemblyVisible: !doc.querySelector('#stato').hidden,
            upcomingAssemblyText: doc.querySelector('#stato').textContent });
          const cards = [...doc.querySelectorAll('.document-card')];
          results.push({ cards: cards.length, title: cards[0].querySelector('h3').textContent,
            description: cards[0].querySelector('p').textContent,
            links: cards.every(card => [...card.querySelectorAll('a')].every(link => /documents\\/pdf\\/.+\\.pdf$/i.test(link.getAttribute('href')))) });
          frame.contentWindow.fetch = async () => ({ ok: false, status: 503 });
          await doc.querySelector('#documents-retry').onclick();
          results.push({ errorVisible: !doc.querySelector('#documents-retry').hidden,
            error: doc.querySelector('#documents-status').textContent });
          frame.contentWindow.fetch = async () => ({ ok: true, json: async () => [] });
          await doc.querySelector('#documents-retry').onclick();
          results.push({ empty: doc.querySelector('#documents-status').textContent,
            retryHidden: doc.querySelector('#documents-retry').hidden });
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
        } else if (page === 3) {
          results.push({ dashboard: doc.querySelector('#riservata').hidden === false,
            assembly: doc.querySelector('#dashboard-assembly-title').textContent,
            documents: doc.querySelectorAll('#dashboard-document-links li').length,
            tools: doc.querySelectorAll('.dashboard-tool').length });
          frame.contentWindow.fetch = async () => ({ ok: false, status: 503 });
          await doc.querySelector('#dashboard-documents-retry').onclick();
          results.push({ dashboardError: !doc.querySelector('#dashboard-documents-retry').hidden });
          const append = doc.head.append.bind(doc.head);
          doc.head.append = element => {
            if (element.tagName === 'SCRIPT') element.onerror();
            else append(element);
          };
          await doc.querySelector('#dashboard-assembly-retry').onclick();
          results.push({ assemblyError: !doc.querySelector('#dashboard-assembly-retry').hidden,
            assemblyErrorText: doc.querySelector('#dashboard-assembly-details').textContent });
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
      '--host-resolver-rules=MAP * ~NOTFOUND', '--virtual-time-budget=20000', '--timeout=15000',
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
    assert.equal(results.find(item => 'errorVisible' in item).errorVisible, true);
    assert.match(results.find(item => 'error' in item).error, /503/);
    assert.match(results.find(item => 'empty' in item).empty, /Non ci sono ancora/);
    assert.equal(results.find(item => 'retryHidden' in item).retryHidden, true);
    assert.equal(results.find(item => 'uploaded' in item).uploaded, 3, JSON.stringify(results));
    assert.match(results.find(item => 'uploaded' in item).status, /Salvato/);
    assert.equal(results.find(item => 'edited' in item).edited, 'Titolo modificato');
    assert.equal(results.find(item => 'remaining' in item).remaining, 2);
    for (const item of results.filter(item => 'reachable' in item)) {
      assert.equal(item.reachable, true, 'setup fields must be reachable above the action bar at width ' + item.width);
    }
    for (const item of results.filter(item => 'wizardOpened' in item)) assert.equal(item.wizardOpened, true);
    for (const item of results.filter(item => 'fits' in item)) {
      assert.equal(item.fits, true, 'wizard fits at ' + item.wizardWidth + ', step ' + item.step);
      assert.equal(item.actionsVisible, true, 'wizard actions visible at ' + item.wizardWidth + ', step ' + item.step);
      assert.equal(item.valid, true);
    }
    for (const item of results.filter(item => 'review' in item)) {
      assert.equal(item.review, 'Riepilogo');
      assert.equal(item.error, '');
      assert.equal(item.reviewFits, true);
      assert.equal(item.unchanged, true, 'data must stay unchanged before confirmation');
    }
    for (const item of results.filter(item => 'cancelUnchanged' in item)) assert.equal(item.cancelUnchanged, true);
    const annual = results.find(item => 'applied' in item);
    assert.equal(annual.applied, 2027);
    assert.equal(annual.writtenDate, '20 Novembre 2027');
    assert.equal(annual.qrDate, '2027-11-20T20:30');
    assert.equal(annual.archived, 100);
    assert.equal(annual.newAmount, 10);
    assert.equal(annual.previousAmount, 9665);
    assert.equal(annual.dirty, true);
    assert.equal(annual.wizardClosed, true);
    const dashboard = results.find(item => 'dashboard' in item);
    assert.equal(dashboard.dashboard, true);
    assert.match(dashboard.assembly, /Assemblea/);
    assert.equal(dashboard.documents, 2);
    assert.equal(dashboard.tools, 3);
    assert.equal(results.find(item => 'dashboardError' in item).dashboardError, true);
    assert.equal(results.find(item => 'assemblyError' in item).assemblyError, true);
    assert.match(results.find(item => 'assemblyErrorText' in item).assemblyErrorText, /Impossibile/);
    assert.equal(results.find(item => 'calendarFilters' in item).calendarFilters, 5);
    assert.equal(results.find(item => 'agendaCount' in item).agendaCount, 5);
    assert.equal(results.find(item => 'safeText' in item).safeText, true);
    assert.equal(results.find(item => 'injected' in item).injected, false);
    assert.match(results.find(item => 'noneSelected' in item).noneSelected, /Seleziona almeno/);
    assert.equal(results.find(item => 'branchCount' in item).branchCount, 1);
    assert.equal(results.find(item => 'branch' in item).branch, 'Branca E/G');
    assert.equal(results.find(item => 'changedMonth' in item).changedMonth, true);
    assert.equal(results.find(item => 'calendarFailure' in item).calendarFailure, true);
    assert.match(results.find(item => 'calendarFailureText' in item).calendarFailureText, /503/);
    assert.equal(results.find(item => 'infoClosed' in item).infoClosed, true);
    assert.equal(results.find(item => 'bannerHidden' in item).bannerHidden, true);
    assert.equal(results.find(item => 'infoFits' in item).infoFits, true);
    assert.equal(results.find(item => 'compactLabels' in item).compactLabels, 'Canicattini 1,E/G,L/C,R/S,Zona');
    assert.equal(results.find(item => 'warningVisible' in item).warningVisible, true);
    assert.equal(results.find(item => 'unavailableFilters' in item).unavailableFilters, 5);
    assert.equal(results.find(item => 'errorBannerHidden' in item).errorBannerHidden, true);
    assert.equal(results.find(item => 'upcomingAssemblyVisible' in item).upcomingAssemblyVisible, true);
    assert.match(results.find(item => 'upcomingAssemblyText' in item).upcomingAssemblyText, /Assemblea di Gruppo.*Tra 5 giorni/);
    for (const item of results.filter(item => 'dateTimeFields' in item)) {
      assert.equal(item.dateTimeFields, 1);
      assert.equal(item.duplicateDate, false);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
});
