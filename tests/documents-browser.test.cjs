const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(
  (command) => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0,
);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function fixture(file, css, scripts) {
  const index = read("documents/index.json");
  const calendars = read("calendars/events.json");
  const mock = `
    window.ACCESSO = { verificata: () => true, chiave: () => '', esci() {} };
    window.LIVE = { nas: ${file === "area-riservata/assemblea/setup.html"}, github: { repo: 'test/repo', ramo: 'test' } };
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
        ${read("area-riservata/assemblea/dati.js")}
        element.onload();
      } else append(element);
    };
  `;
  return read(file)
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/g, (original) => (file === "index.html" ? "" : original))
    .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
      const source = path.normalize(path.join(path.dirname(file), src.split("?")[0]));
      return scripts.includes(source) ? "<script>" + read(source) + "</script>" : "";
    })
    .replace(
      "</head>",
      "<style>" + read("assets/css/nas.css") + read("assets/css/theme.css") + read(css) + "</style><script>" + mock + "</script></head>",
    );
}

test("document deletion updates immediately and rolls back when the server rejects it", async () => {
  const nodes = new Map();
  const element = () => ({
    children: [],
    value: "",
    hidden: false,
    disabled: false,
    textContent: "",
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    querySelectorAll() {
      return [];
    },
    setAttribute() {},
    focus() {},
    scrollIntoView() {},
  });
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const document = { getElementById: get, createElement: element };
  let rejectSave;
  const items = [{ file: "test.pdf", title: "Test PDF", description: "Documento" }];
  const context = {
    window: {
      ACCESSO: { verificata: () => true },
      LIVE: { nas: true },
      DOCUMENTS: {
        tokenKey: "test-token",
        load: async () => items,
        apply: () => [],
        save: () =>
          new Promise((resolve, reject) => {
            rejectSave = reject;
          }),
      },
    },
    document,
    localStorage: { getItem: () => "", setItem() {} },
    confirm: () => true,
    Date,
    location: { replace() {} },
    addEventListener() {},
  };
  require("node:vm").runInNewContext(read("assets/js/gestione-documenti.js"), context);
  await new Promise((resolve) => setImmediate(resolve));
  const remove = get("managed-documents").children[0].children[3].children[1];
  const pending = remove.onclick();
  assert.equal(get("managed-documents").children[0].textContent.startsWith("Nessun PDF"), true);
  assert.equal(get("save-document").disabled, true);
  rejectSave(new Error("Server non disponibile"));
  await pending;
  assert.equal(get("managed-documents").children[0].children[0].textContent, "Test PDF");
  assert.equal(get("documents-message").textContent, "Server non disponibile");
  assert.equal(get("save-document").disabled, false);
});

test("public documents and management work in a browser at all required widths", { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "group-documents-"));
  const pages = [
    fixture("index.html", "assets/css/home.css", [
      "assets/js/documents-model.js",
      "assets/js/home-documents.js",
      "assets/js/calendar-model.js",
      "assets/js/home-calendars.js",
    ]),
    fixture("area-riservata/documenti.html", "assets/css/gestione-documenti.css", [
      "assets/js/documents-model.js",
      "assets/js/documents-store.js",
      "assets/js/gestione-documenti.js",
    ]),
    fixture("area-riservata/assemblea/setup.html", "area-riservata/assemblea/core/setup.css", [
      "assets/js/nas-nav.js",
      "area-riservata/assemblea/core/salva-dati.js",
      "area-riservata/assemblea/core/modifiche.js",
      "area-riservata/assemblea/core/nuovo-anno-model.js",
      "area-riservata/assemblea/core/nuovo-anno.js",
      "area-riservata/assemblea/core/setup.js",
    ]),
    fixture("area-riservata/index.html", "assets/css/home.css", [
      "assets/js/area-dashboard.js",
      "assets/js/area-riservata.js",
    ]),
    fixture("assemblea/index.html", "assets/css/home.css", [
      "assets/js/documents-model.js",
      "assets/js/home-documents.js",
    ]),
    fixture("documenti/index.html", "assets/css/home.css", [
      "assets/js/documents-model.js",
      "assets/js/home-documents.js",
    ]),
  ];
  const html = `<!doctype html><meta charset="utf-8"><body><script>
    const pages = ${JSON.stringify(pages).replace(/</g, "\\u003c")};
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
            doc.querySelector('[data-tab="bilancio"]').click();
            const balanceNav = doc.querySelector('#balance-nav');
            doc.querySelector('[data-balance="censimenti"]').click();
            const censusBox = doc.querySelector('[data-id="censimenti"]');
            if (!balanceNav || balanceNav.hidden || !censusBox) throw new Error('Navigazione bilancio non disponibile');
            censusBox.open = true;
            const currentCensus = doc.getElementById('fcensimenti_censiti_attuali');
            const currentPresent = doc.getElementById('fcensimenti_presenti_attuali');
            const historyCensus = doc.getElementById('fcensimenti_storico_per_anno_2022_censiti');
            const historyPresent = doc.getElementById('fcensimenti_storico_per_anno_2022_presenti');
            const headerBox = doc.querySelector('.setup-header').getBoundingClientRect();
            const barBox = doc.querySelector('#bar').getBoundingClientRect();
            const pairFits = (a, b) => {
              const first = a.getBoundingClientRect(), second = b.getBoundingClientRect();
              return Math.abs(first.top - second.top) <= 1 && first.right <= second.left &&
                first.width >= 100 && second.width >= 100;
            };
            results.push({
              setupWidth: width,
              singleHeader: doc.querySelectorAll('header').length === 1,
              compactHeader: width > 520 || headerBox.height <= 80,
              compactBar: width > 520 || barBox.height <= 100,
              pairedCensus: width > 520 || pairFits(currentCensus, currentPresent),
              pairedHistory: width > 520 || pairFits(historyCensus, historyPresent),
              noInputZoom: width > 520 || parseFloat(frame.contentWindow.getComputedStyle(historyCensus).fontSize) >= 16,
              compactHistory: width > 520 || historyCensus.closest('fieldset').getBoundingClientRect().height <= 150,
              balanceNavWorks: balanceNav.querySelector('[aria-pressed="true"]').dataset.balance === 'censimenti',
              barActionsFit: [...doc.querySelectorAll('#bar > button, #bar .more > summary')].every(button => {
                const rect = button.getBoundingClientRect();
                return rect.height >= 44 && rect.width >= 44 && rect.left >= 0 && rect.right <= width;
              }),
            });
            frame.contentWindow.scrollTo(0, 100000);
            const lastCensus = [...doc.querySelectorAll('[data-id="censimenti"] input')].at(-1);
            results.push({ width, reachable: lastCensus.getBoundingClientRect().bottom <= barBox.top });
            frame.contentWindow.scrollTo(0, 0);
            doc.querySelector('[data-tab="json"]').click();
            const originalJson = doc.querySelector('#json-text').value;
            const originalSlides = JSON.parse(originalJson).slide.length;
            doc.querySelector('[data-tab="ordine"]').click();
            const selector = doc.querySelector('#nuova-slide-modello');
            const template = [...selector.options].find(option => option.textContent === 'ordine del giorno');
            if (!template) throw new Error('Template ordine del giorno non trovato');
            selector.value = template.value;
            const addSlide = doc.querySelector('.slide-add button');
            if (!addSlide) throw new Error('Comando aggiungi slide non trovato');
            addSlide.click();
            const editor = doc.querySelector('#slide-editor');
            if (!editor.open) throw new Error('Editor della nuova slide non aperto');
            const editorBox = editor.getBoundingClientRect();
            let list = doc.querySelector('#slide-editor-campi fieldset');
            const removeItem = list?.querySelector('.remove');
            if (!removeItem) throw new Error('Comando rimuovi elemento non trovato');
            removeItem.click();
            list = doc.querySelector('#slide-editor-campi fieldset');
            const addEmpty = list.querySelector('.add');
            if (!addEmpty) throw new Error('Comando aggiungi elemento scomparso su elenco vuoto');
            const canAddAfterEmpty = !!addEmpty && list.querySelectorAll('.field').length === 0;
            addEmpty.click();
            list = doc.querySelector('#slide-editor-campi fieldset');
            const restoredItem = list.querySelector('fieldset');
            results.push({
              slideEditorFits: editorBox.left >= 0 && editorBox.right <= width &&
                editor.scrollWidth <= editor.clientWidth,
              canAddAfterEmpty,
              restoredItem: !!restoredItem && restoredItem.querySelectorAll('.field').length === 2,
              restoredControls: [...editor.querySelectorAll('.add, .remove')].every(button => {
                const box = button.getBoundingClientRect();
                return box.width >= 40 && box.left >= 0 && box.right <= width;
              }),
            });
            doc.querySelector('#slide-editor-chiudi').click();
            doc.querySelector('[data-tab="json"]').click();
            const addedSlide = JSON.parse(doc.querySelector('#json-text').value).slide.length === originalSlides + 1;
            doc.querySelector('#json-text').value = originalJson;
            doc.querySelector('#json-apply').click();
            results.push({
              width,
              addedSlide,
              restoredOriginal:
                JSON.stringify(JSON.parse(doc.querySelector('#json-text').value)) ===
                JSON.stringify(JSON.parse(originalJson)),
            });
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
            safeText: doc.querySelector('.agenda-event h5').textContent.startsWith('<img'),
            injected: doc.querySelector('.agenda-event h5 img') !== null });
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
          const errorSnapshot = ${JSON.stringify(JSON.parse(read("calendars/events.json"))).replace(/</g, "\\u003c")};
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
            upcomingAssemblyText: doc.querySelector('#stato').textContent,
            upcomingAssemblyTitle: doc.querySelector('#stato .assembly-status-title').textContent,
            upcomingAssemblyHref: doc.querySelector('#stato a.assembly-status-link').getAttribute('href'),
            upcomingAssemblyLinkWraps: doc.querySelector('#stato a.assembly-status-link .assembly-status-meta') !== null,
            preparatoryVisible: !doc.querySelector('#documenti-preparatori').hidden,
            explainerArticles: [...doc.querySelectorAll('.assembly-explainer-cite')].map(e => e.textContent).join(',') });
          errorSnapshot.events[0].start = new Date(Date.now() + 20 * 86400000).toISOString();
          errorSnapshot.events[0].end = new Date(Date.now() + 20 * 86400000 + 3600000).toISOString();
          await doc.querySelector('#calendar-retry').onclick();
          results.push({ farPreparatoryHidden: doc.querySelector('#documenti-preparatori').hidden,
            farBannerVisible: !doc.querySelector('#stato').hidden });
          const cards = [...doc.querySelectorAll('#documents-list .document-card')];
          results.push({ cards: cards.length, title: cards[0].querySelector('h3').textContent,
            description: cards[0].querySelector('p').textContent,
            titles: cards.map(card => card.querySelector('h3').textContent),
            pegLink: cards[0].querySelector('.document-primary').getAttribute('href'),
            icons: doc.querySelectorAll('#documents-list .document-icon svg[aria-hidden="true"]').length,
            preparatoryCards: doc.querySelectorAll('#preparatory-list .document-card').length,
            links: cards.every(card => /documents\\/pdf\\/.+\\.pdf$/i.test(card.querySelector('a[download]').getAttribute('href'))),
            pdfLinks: cards.slice(1).every(card => /documents\\/pdf\\/.+\\.pdf$/i.test(card.querySelector('.document-primary').getAttribute('href'))) });
          frame.contentWindow.fetch = async () => ({ ok: false, status: 503 });
          await doc.querySelector('#documents-retry').onclick();
          results.push({ errorVisible: !doc.querySelector('#documents-retry').hidden,
            error: doc.querySelector('#documents-status').textContent });
          frame.contentWindow.fetch = async () => ({ ok: true, json: async () => [] });
          await doc.querySelector('#documents-retry').onclick();
          results.push({ empty: doc.querySelector('#documents-status').textContent,
            retryHidden: doc.querySelector('#documents-retry').hidden });
          const recent = [
            { file: 'old.pdf', title: 'Vecchio', year: 2025, publishedAt: '2025-01-01' },
            { file: 'new.pdf', title: 'Nuovissimo', year: 2027, publishedAt: '2027-01-01' },
            { file: 'undated.pdf', title: 'Senza data' },
            { file: 'four.pdf', title: 'Quarto', year: 2026, publishedAt: '2026-01-01' },
            { file: 'second.pdf', title: 'Secondo', year: 2026, publishedAt: '2026-12-01' },
            { file: 'third.pdf', title: 'Terzo', year: 2026, publishedAt: '2026-06-01' }
          ];
          frame.contentWindow.fetch = async () => ({ ok: true, json: async () => recent.map(item => ({ description: 'Documenti di prova', ...item })) });
          await doc.querySelector('#documents-retry').onclick();
          results.push({ latestTitles: [...doc.querySelectorAll('.document-card h3')].map(node => node.textContent) });
        } else if (page === 1) {
          const win = frame.contentWindow;
          const input = doc.querySelector('#document-file');
          const transfer = new win.DataTransfer();
          transfer.items.add(new win.File(['%PDF-1.7\\nfixture'], 'nuovo.pdf', { type: 'application/pdf' }));
          input.files = transfer.files;
          doc.querySelector('#document-title').value = 'Documento nuovo';
          doc.querySelector('#document-description').value = 'Descrizione di prova';
          doc.querySelector('#document-year').value = '2027';
          doc.querySelector('#document-published-at').value = '2027-02-03';
          doc.querySelector('#document-assembly-year').value = '2026';
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
          results.push({ editedYear: doc.querySelector('#document-year').value,
            editedDate: doc.querySelector('#document-published-at').value });
          results.push({ assemblyYear: doc.querySelector('#document-assembly-year').value });
          doc.querySelector('#document-title').value = 'Titolo modificato';
          const edited = saved();
          doc.querySelector('#document-form').requestSubmit();
          await edited;
          results.push({ edited: doc.querySelector('.managed-document:last-child h3').textContent });
          const deleted = saved();
          doc.querySelector('.managed-document:last-child .danger').click();
          await deleted;
          results.push({ remaining: doc.querySelectorAll('.managed-document').length });
        } else if (page === 5) {
          results.push({ archiveCards: doc.querySelectorAll('.document-card').length,
            archiveYear: [...doc.querySelector('#documents-year').options].map(option => option.value) });
          const data = [
            { file: '2027.pdf', title: 'Nuovo bilancio', description: 'Conti', year: 2027, publishedAt: '2027-01-01' },
            { file: '2026.pdf', title: 'Convocazione', description: 'Assemblea', year: 2026, publishedAt: '2026-11-05' },
            { file: 'legacy.pdf', title: 'Storico', description: 'Materiale precedente' }
          ];
          frame.contentWindow.fetch = async () => ({ ok: true, json: async () => data });
          await doc.querySelector('#documents-retry').onclick();
          const year = doc.querySelector('#documents-year');
          const search = doc.querySelector('#documents-search');
          const titles = () => [...doc.querySelectorAll('.document-card h3')].map(node => node.textContent);
          results.push({ archiveAll: titles(), archiveYears: [...year.options].map(option => option.value) });
          year.value = '2026'; year.onchange();
          results.push({ archive2026: titles() });
          search.value = 'ASSEMBLEA'; search.oninput();
          results.push({ archiveText: titles() });
          search.value = 'inesistente'; search.oninput();
          results.push({ archiveEmpty: titles(), archiveMessage: doc.querySelector('#documents-status').textContent });
          search.value = ''; year.value = 'undated'; year.onchange();
          results.push({ archiveUndated: titles() });
          year.value = ''; search.value = 'conti'; search.oninput();
          results.push({ archiveDescription: titles() });
        } else if (page === 4) {
          results.push({ publicAssembly: doc.querySelectorAll('.document-card').length,
            publicPeg: doc.querySelector('.document-primary').getAttribute('href'),
            publicPdfs: [...doc.querySelectorAll('a[download]')].every(link =>
              link.getAttribute('href').startsWith('../documents/pdf/')) });
        } else if (page === 3) {
          results.push({ dashboard: doc.querySelector('#riservata').hidden === false,
            assembly: doc.querySelector('#dashboard-assembly-title').textContent,
            documents: doc.querySelectorAll('#dashboard-document-links li').length,
            tools: doc.querySelectorAll('.dashboard-tools .dashboard-tool').length });
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
    const file = path.join(dir, "browser.html");
    fs.writeFileSync(file, html);
    const result = spawnSync(
      chrome,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-proxy-server",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        "--virtual-time-budget=20000",
        "--timeout=15000",
        "--user-data-dir=" + path.join(dir, "profile"),
        "--dump-dom",
        "file://" + file,
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 },
    );
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
    assert.ok(match, result.stdout.slice(-6000));
    const results = JSON.parse(match[1]);
    assert.deepEqual(results.find((item) => "latestTitles" in item).latestTitles, [
      "Nuovissimo",
      "Secondo",
      "Terzo",
      "Quarto",
    ]);
    assert.equal(results.find((item) => "editedYear" in item).editedYear, "2027");
    assert.equal(results.find((item) => "editedDate" in item).editedDate, "2027-02-03");
    assert.equal(results.find((item) => "archiveCards" in item).archiveCards, 4);
    assert.deepEqual(results.find((item) => "archiveYear" in item).archiveYear, ["", "2026"]);
    assert.deepEqual(results.find((item) => "archiveYears" in item).archiveYears, ["", "2027", "2026", "undated"]);
    assert.deepEqual(results.find((item) => "archiveAll" in item).archiveAll, [
      "Nuovo bilancio",
      "Convocazione",
      "Storico",
    ]);
    assert.deepEqual(results.find((item) => "archive2026" in item).archive2026, ["Convocazione"]);
    assert.deepEqual(results.find((item) => "archiveText" in item).archiveText, ["Convocazione"]);
    assert.deepEqual(results.find((item) => "archiveEmpty" in item).archiveEmpty, []);
    assert.match(results.find((item) => "archiveMessage" in item).archiveMessage, /Nessun documento/);
    assert.deepEqual(results.find((item) => "archiveUndated" in item).archiveUndated, ["Storico"]);
    assert.deepEqual(results.find((item) => "archiveDescription" in item).archiveDescription, ["Nuovo bilancio"]);
    const publicAssembly = results.find((item) => "publicAssembly" in item);
    assert.equal(publicAssembly.publicAssembly, 4);
    assert.equal(publicAssembly.publicPeg, "../peg/");
    assert.equal(publicAssembly.publicPdfs, true);
    for (const item of results.filter((item) => "overflow" in item)) {
      assert.equal(item.overflow, false, "page " + item.page + " must fit width " + item.width);
    }
    assert.equal(results.find((item) => "cards" in item).cards, 4);
    assert.equal(results.find((item) => "cards" in item).preparatoryCards, 4);
    assert.equal(results.find((item) => "assemblyYear" in item).assemblyYear, "2026");
    assert.equal(results.find((item) => "cards" in item).links, true);
    assert.equal(results.find((item) => "cards" in item).pdfLinks, true);
    assert.equal(results.find((item) => "cards" in item).icons, 4);
    assert.equal(results.find((item) => "cards" in item).pegLink, "peg/");
    assert.deepEqual(results.find((item) => "cards" in item).titles, [
      "PEG 2026-2028",
      "Bilancio 2026 · Modello D",
      "Convocazione assemblea 2026",
      "Regolamento assembleare",
    ]);
    assert.ok(results.find((item) => "cards" in item).description.length > 10);
    assert.equal(results.find((item) => "errorVisible" in item).errorVisible, true);
    assert.match(results.find((item) => "error" in item).error, /503/);
    assert.match(results.find((item) => "empty" in item).empty, /Non ci sono ancora/);
    assert.equal(results.find((item) => "retryHidden" in item).retryHidden, true);
    assert.equal(results.find((item) => "uploaded" in item).uploaded, 5, JSON.stringify(results));
    assert.match(results.find((item) => "uploaded" in item).status, /Salvato/);
    assert.equal(results.find((item) => "edited" in item).edited, "Titolo modificato");
    assert.equal(results.find((item) => "remaining" in item).remaining, 4);
    for (const item of results.filter((item) => "reachable" in item)) {
      assert.equal(item.reachable, true, "setup fields must be reachable above the action bar at width " + item.width);
    }
    for (const item of results.filter((item) => "setupWidth" in item)) {
      for (const key of ["singleHeader", "compactHeader", "compactBar", "pairedCensus", "pairedHistory", "noInputZoom", "compactHistory", "barActionsFit"])
        assert.equal(item[key], true, key + " at setup width " + item.setupWidth);
    }
    for (const item of results.filter((item) => "slideEditorFits" in item)) {
      assert.equal(item.slideEditorFits, true, "slide editor fits at width " + item.width);
      assert.equal(item.canAddAfterEmpty, true, "empty lists remain editable at width " + item.width);
      assert.equal(item.restoredItem, true, "adding restores the correct item schema at width " + item.width);
      assert.equal(item.restoredControls, true, "array actions remain reachable at width " + item.width);
    }
    for (const item of results.filter((item) => "addedSlide" in item)) {
      assert.equal(item.addedSlide, true, "new slides can be added at width " + item.width);
      assert.equal(item.restoredOriginal, true, "browser check restores original data at width " + item.width);
    }
    for (const item of results.filter((item) => "wizardOpened" in item)) assert.equal(item.wizardOpened, true);
    for (const item of results.filter((item) => "fits" in item)) {
      assert.equal(item.fits, true, "wizard fits at " + item.wizardWidth + ", step " + item.step);
      assert.equal(item.actionsVisible, true, "wizard actions visible at " + item.wizardWidth + ", step " + item.step);
      assert.equal(item.valid, true);
    }
    for (const item of results.filter((item) => "review" in item)) {
      assert.equal(item.review, "Riepilogo");
      assert.equal(item.error, "");
      assert.equal(item.reviewFits, true);
      assert.equal(item.unchanged, true, "data must stay unchanged before confirmation");
    }
    for (const item of results.filter((item) => "cancelUnchanged" in item)) assert.equal(item.cancelUnchanged, true);
    const annual = results.find((item) => "applied" in item);
    assert.equal(annual.applied, 2027);
    assert.equal(annual.writtenDate, "20 Novembre 2027");
    assert.equal(annual.qrDate, "2027-11-20T20:30");
    assert.equal(annual.archived, 100);
    assert.equal(annual.newAmount, 10);
    assert.equal(annual.previousAmount, 9665);
    assert.equal(annual.dirty, true);
    assert.equal(annual.wizardClosed, true);
    const dashboard = results.find((item) => "dashboard" in item);
    assert.equal(dashboard.dashboard, true);
    assert.match(dashboard.assembly, /Assemblea/);
    assert.equal(dashboard.documents, 3);
    assert.equal(dashboard.tools, 3);
    assert.equal(results.find((item) => "dashboardError" in item).dashboardError, true);
    assert.equal(results.find((item) => "assemblyError" in item).assemblyError, true);
    assert.match(results.find((item) => "assemblyErrorText" in item).assemblyErrorText, /Impossibile/);
    assert.equal(results.find((item) => "calendarFilters" in item).calendarFilters, 5);
    assert.equal(results.find((item) => "agendaCount" in item).agendaCount, 5);
    assert.equal(results.find((item) => "safeText" in item).safeText, true);
    assert.equal(results.find((item) => "injected" in item).injected, false);
    assert.match(results.find((item) => "noneSelected" in item).noneSelected, /Seleziona almeno/);
    assert.equal(results.find((item) => "branchCount" in item).branchCount, 1);
    assert.equal(results.find((item) => "branch" in item).branch, "Branca E/G");
    assert.equal(results.find((item) => "changedMonth" in item).changedMonth, true);
    assert.equal(results.find((item) => "calendarFailure" in item).calendarFailure, true);
    assert.match(results.find((item) => "calendarFailureText" in item).calendarFailureText, /503/);
    assert.equal(results.find((item) => "infoClosed" in item).infoClosed, true);
    assert.equal(results.find((item) => "bannerHidden" in item).bannerHidden, true);
    assert.equal(results.find((item) => "infoFits" in item).infoFits, true);
    assert.equal(results.find((item) => "compactLabels" in item).compactLabels, "Canicattini 1,E/G,L/C,R/S,Zona");
    assert.equal(results.find((item) => "warningVisible" in item).warningVisible, true);
    assert.equal(results.find((item) => "unavailableFilters" in item).unavailableFilters, 5);
    assert.equal(results.find((item) => "errorBannerHidden" in item).errorBannerHidden, true);
    assert.equal(results.find((item) => "upcomingAssemblyVisible" in item).upcomingAssemblyVisible, true);
    assert.match(
      results.find((item) => "upcomingAssemblyText" in item).upcomingAssemblyText,
      /Assemblea di Gruppo.*Tra 5 giorni/,
    );
    assert.equal(results.find((item) => "upcomingAssemblyTitle" in item).upcomingAssemblyTitle, "Assemblea di Gruppo");
    assert.equal(results.find((item) => "upcomingAssemblyHref" in item).upcomingAssemblyHref, "assemblea/");
    assert.equal(results.find((item) => "upcomingAssemblyLinkWraps" in item).upcomingAssemblyLinkWraps, true);
    assert.equal(results.find((item) => "preparatoryVisible" in item).preparatoryVisible, true);
    assert.match(
      results.find((item) => "explainerArticles" in item).explainerArticles,
      /^\(art\. \d+(, c\. \d+)?\)(,\(art\. \d+(, c\. \d+)?\))*$/,
    );
    assert.equal(results.find((item) => "farPreparatoryHidden" in item).farPreparatoryHidden, true);
    assert.equal(results.find((item) => "farBannerVisible" in item).farBannerVisible, true);
    for (const item of results.filter((item) => "dateTimeFields" in item)) {
      assert.equal(item.dateTimeFields, 1);
      assert.equal(item.duplicateDate, false);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
