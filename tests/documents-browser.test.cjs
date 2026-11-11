const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(
  (command) => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0,
);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function fixture(file, css, scripts, user) {
  const index = read("documents/index.json");
  const calendars = read("calendars/events.json");
  const mock = `
    window.ACCESSO = { verificata: () => true, chiave: () => '', esci() {} };
    ${user ? `window.NAS = { user: ${JSON.stringify(user)} };` : ""}
    window.LIVE = { nas: ${!!user || file === "area-riservata/assemblea/setup.html"}, github: { repo: 'test/repo', ramo: 'test' } };
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
      return scripts.includes(source) || source === "assets/js/shared/section-nav.js" ? "<script>" + read(source) + "</script>" : "";
    })
    .replace(
      "</head>",
      "<style>" + read("assets/css/nas.css") + read("assets/css/theme.css") + read(css) + read("assets/css/section-nav.css") + "</style><script>" + mock + "</script></head>",
    );
}

test("public documents and management work in a browser at all required widths", { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(__dirname, ".group-documents-"));
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
    ], { admin: false, serviceBranch: "" }),
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
            doc.querySelector('[data-tab="json"]').click();
            const financialOriginal = doc.querySelector('#json-text').value;
            doc.querySelector('[data-tab="bilancio"]').click();
            doc.querySelector('[data-balance="entrate"]').click();
            const amount = doc.querySelector('.financial-amounts input');
            amount.value = '123.45';
            amount.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
            doc.querySelector('[data-balance="uscite"]').click();
            doc.querySelector('[data-balance="entrate"]').click();
            const amountBoxes = [...doc.querySelector('.financial-amounts').querySelectorAll('input')].map(input => input.getBoundingClientRect());
            results.push({ financialDraft: doc.querySelector('.financial-amounts input').value === '123.45',
              financialPairs: amountBoxes.length === 2 && Math.abs(amountBoxes[0].top - amountBoxes[1].top) <= 1 &&
                amountBoxes[0].right <= amountBoxes[1].left && amountBoxes.every(box => box.width >= 100),
              financialFits: doc.documentElement.scrollWidth <= doc.documentElement.clientWidth });
            const entryCount = doc.querySelectorAll('.financial-row').length;
            doc.querySelector('.financial-list > .add').click();
            results.push({ financialAdd: doc.querySelectorAll('.financial-row').length === entryCount + 1 });
            doc.querySelectorAll('.financial-remove')[entryCount].click();
            results.push({ financialRemove: doc.querySelectorAll('.financial-row').length === entryCount });
            doc.querySelector('[data-balance="patrimonio"]').click();
            results.push({ fixedAssets: doc.querySelectorAll('.financial-row').length === 6 &&
              !doc.querySelector('.financial-list .add, .financial-remove') });
            doc.querySelector('[data-tab="json"]').click();
            doc.querySelector('#json-text').value = financialOriginal;
            doc.querySelector('#json-apply').click();
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
            for (let step = 0; step < 2; step++) {
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
              if (step === 0) results.push({ dateTimeFields: doc.querySelectorAll('#year-fields input[type="datetime-local"]').length,
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
          results.push({ latestTitles: [...doc.querySelectorAll('#documents-list .document-card h3')].map(node => node.textContent) });
        } else if (page === 1) {
          const win = frame.contentWindow;
          const originalFetch = win.fetch;
          const tick = () => new Promise(resolve => setTimeout(resolve, 5));
          const texts = selector => [...doc.querySelectorAll(selector)].map(node => node.textContent.trim());
          const slotStates = () => [...doc.querySelectorAll('#preparatory-slots .slot')].map(slot =>
            slot.classList.contains('is-missing') ? 'missing' : slot.classList.contains('is-unknown') ? 'unknown' : 'ok');
          const saved = () => new Promise(resolve => {
            const observer = new win.MutationObserver(() => {
              if (!doc.querySelector('#save-document').disabled) { observer.disconnect(); resolve() }
            });
            observer.observe(doc.querySelector('#save-document'), { attributes: true });
          });
          results.push({ initialSlots: texts('#preparatory-slots .slot-type'), initialStates: slotStates(),
            initialCount: doc.querySelectorAll('.managed-document').length,
            source: doc.querySelector('#documents-source').textContent,
            credentialsHiddenInPreview: doc.querySelector('#github-credentials').hidden,
            publicWarning: doc.querySelector('#publish-destination').textContent,
            techSecondary: [...doc.querySelectorAll('.managed-document .doc-tech')].every(details => !details.open),
            deleteDistinct: [...doc.querySelectorAll('.managed-document')].every(article =>
              article.querySelectorAll('.danger').length === 1 && article.querySelector('.danger').textContent === 'Elimina') });
          doc.querySelector('#new-document').click();
          const input = doc.querySelector('#document-file');
          const transfer = new win.DataTransfer();
          transfer.items.add(new win.File(['%PDF-1.7\\nfixture'], 'nuovo.pdf', { type: 'application/pdf' }));
          input.files = transfer.files;
          input.dispatchEvent(new win.Event('change', { bubbles: true }));
          const titlePrefilled = doc.querySelector('#document-title').value;
          const descriptionOptional = !doc.querySelector('#document-description').required;
          doc.querySelector('#document-title').value = 'Documento nuovo';
          doc.querySelector('#document-description').value = 'Descrizione di prova';
          doc.querySelector('#document-year').value = '2027';
          doc.querySelector('#document-published-at').value = '2027-02-03';
          const assemblyHiddenForGeneral = doc.querySelector('#assembly-fields').hidden;
          doc.querySelector('#document-kind-preparatory').click();
          doc.querySelector('#document-assembly-type').value = 'verbale';
          results.push({ titlePrefilled, descriptionOptional, assemblyHiddenForGeneral, assemblyShown: !doc.querySelector('#assembly-fields').hidden,
            typeWithoutYearBlocked: !doc.querySelector('#document-form').checkValidity() &&
              doc.querySelector('#document-assembly-year').validity.valueMissing });
          doc.querySelector('#document-assembly-year').value = '2026';
          let release = null, posts = 0;
          win.fetch = (url, options) => {
            if (options?.method !== 'POST') return originalFetch(url, options);
            posts++;
            return new Promise(resolve => { release = resolve });
          };
          const failed = saved();
          doc.querySelector('#document-form').requestSubmit();
          while (!release) await tick();
          results.push({ pendingCount: doc.querySelectorAll('.managed-document').length,
            pendingMessage: doc.querySelector('#documents-message').textContent,
            pendingLocked: doc.querySelector('#save-document').disabled && doc.querySelector('#reload-documents').disabled });
          release({ ok: false, status: 503, text: async () => 'Server non disponibile' });
          await failed;
          results.push({ failedMessage: doc.querySelector('#documents-message').textContent,
            failedCount: doc.querySelectorAll('.managed-document').length,
            draftKept: doc.querySelector('#document-title').value === 'Documento nuovo' &&
              doc.querySelector('#document-file').files.length === 1 &&
              doc.querySelector('#document-assembly-type').value === 'verbale' &&
              doc.querySelector('#document-kind-preparatory').checked });
          win.fetch = originalFetch;
          const uploaded = saved();
          doc.querySelector('#document-form').requestSubmit();
          await uploaded;
          results.push({ uploaded: doc.querySelectorAll('.managed-document').length, posts,
            status: doc.querySelector('#documents-message').textContent, uploadedStates: slotStates() });
          doc.querySelector('.managed-document[data-file="nuovo.pdf"] button').click();
          const yearBox = doc.querySelector('#document-year').getBoundingClientRect();
          const dateBox = doc.querySelector('#document-published-at').getBoundingClientRect();
          const assemblyYearBox = doc.querySelector('#document-assembly-year').getBoundingClientRect();
          const assemblyTypeBox = doc.querySelector('#document-assembly-type').getBoundingClientRect();
          results.push({ editedYear: doc.querySelector('#document-year').value,
            editedDate: doc.querySelector('#document-published-at').value,
            assemblyYear: doc.querySelector('#document-assembly-year').value,
            editPreparatory: doc.querySelector('#document-kind-preparatory').checked,
            currentFile: doc.querySelector('#current-file-link').textContent,
            currentFileHref: doc.querySelector('#current-file-link').getAttribute('href'),
            replacementOptional: !doc.querySelector('#document-file').required && !doc.querySelector('#current-file').hidden,
            pairedDates: Math.abs(yearBox.top - dateBox.top) <= 1 && yearBox.right <= dateBox.left,
            pairedAssembly: Math.abs(assemblyYearBox.top - assemblyTypeBox.top) <= 1 });
          doc.querySelector('#document-title').value = 'Titolo modificato';
          doc.querySelector('#document-title').dispatchEvent(new win.Event('input', { bubbles: true }));
          let asked = 0;
          win.confirm = () => { asked++; return false };
          await doc.querySelector('#reload-documents').onclick();
          results.push({ dirtyReloadAsked: asked, dirtyReloadKept: doc.querySelector('#document-title').value === 'Titolo modificato' });
          win.confirm = () => true;
          const edited = saved();
          doc.querySelector('#document-form').requestSubmit();
          await edited;
          results.push({ edited: doc.querySelector('.managed-document[data-file="nuovo.pdf"] h3').textContent });
          const deleted = saved();
          doc.querySelector('.managed-document[data-file="nuovo.pdf"] .danger').click();
          await deleted;
          results.push({ remaining: doc.querySelectorAll('.managed-document').length });
          win.fetch = async () => ({ ok: false, status: 503 });
          await doc.querySelector('#reload-documents').onclick();
          results.push({ loadError: !!doc.querySelector('#managed-documents .state-error'),
            errorStates: slotStates(), errorSaveDisabled: doc.querySelector('#save-document').disabled,
            errorMessageClass: doc.querySelector('#documents-message').className });
          win.fetch = async () => ({ ok: true, json: async () => [] });
          await doc.querySelector('#reload-documents').onclick();
          results.push({ emptyState: !!doc.querySelector('#managed-documents .state-empty'), emptyStates: slotStates() });
          doc.querySelector('#preparatory-slots .slot[data-type="bilancio"] button').click();
          results.push({ prefillKind: doc.querySelector('#document-kind-preparatory').checked,
            prefillType: doc.querySelector('#document-assembly-type').value,
            prefillYear: doc.querySelector('#document-assembly-year').value,
            prefillVisible: !doc.querySelector('#documents-edit-panel').hidden });
          win.fetch = originalFetch;
          await doc.querySelector('#reload-documents').onclick();
          doc.querySelector('.managed-document button').click();
          const credentials = doc.querySelector('#github-credentials');
          credentials.hidden = false;
          credentials.open = true;
          for (const [width, height] of [[1920, 1080], [1366, 768], [820, 1180], [1180, 820], [390, 844], [844, 390]]) {
            frame.style.width = width + 'px';
            frame.style.height = height + 'px';
            const nav = doc.querySelector('#documents-section-nav');
            await tick();
            // Headless virtual time may delay matchMedia change events: reapply the selection like the listener does.
            nav.dispatchEvent(new win.CustomEvent('section-select', { detail: 'documents-library-panel' }));
            const tabs = nav.getClientRects().length > 0;
            for (const panel of tabs ? ['documents-library-panel', 'documents-edit-panel'] : ['both']) {
              if (tabs) nav.dispatchEvent(new win.CustomEvent('section-select', { detail: panel }));
              doc.querySelectorAll('.doc-tech').forEach(details => { details.open = true });
              win.scrollTo(0, 0);
              await tick();
              const small = [...doc.querySelectorAll('#documents-app button, #documents-app select, #documents-app input:not([type=radio]), #documents-app summary, #documents-app a, #documents-app .choice')]
                .filter(control => control.getClientRects().length)
                .filter(control => {
                  const box = control.getBoundingClientRect();
                  return box.height < 44 || box.width < 44 || box.left < 0 || box.right > width;
                })
                .map(control => control.id || control.className || control.textContent.trim());
              const library = doc.querySelector('#documents-library-panel').getBoundingClientRect();
              const form = doc.querySelector('#documents-edit-panel').getBoundingClientRect();
              const visible = id => !doc.getElementById(id).hidden && doc.getElementById(id).getClientRects().length > 0;
              const content = doc.querySelector('main').getBoundingClientRect();
              results.push({ viewport: width + 'x' + height, panel, tabs,
                viewportFits: doc.documentElement.scrollWidth <= doc.documentElement.clientWidth, small,
                sideBySide: visible('documents-library-panel') && visible('documents-edit-panel') &&
                  Math.abs(library.top - form.top) <= 1 && library.right <= form.left,
                stacked: visible('documents-library-panel') && visible('documents-edit-panel') && library.bottom <= form.top,
                contentRatio: Math.round(content.width / width * 100) / 100,
                slots: [...doc.querySelectorAll('#preparatory-slots .slot-type')].map(node => node.textContent).join(','),
                reloadUsable: !doc.querySelector('#reload-documents').disabled && doc.querySelector('#reload-documents').getClientRects().length > 0,
                tokenUsable: doc.querySelector('#document-token').getBoundingClientRect().width >= 200,
                saveUsable: panel === 'documents-library-panel' || (!doc.querySelector('#save-document').disabled &&
                  doc.querySelector('#save-document').getBoundingClientRect().width >= 44) });
              doc.querySelectorAll('.doc-tech').forEach(details => { details.open = false });
            }
          }
          credentials.hidden = true;
          doc.querySelector('#documents-section-nav').dispatchEvent(new win.CustomEvent('section-select', { detail: 'documents-library-panel' }));
          doc.querySelector('#document-title').focus();
          const focused = doc.activeElement === doc.querySelector('#document-title') &&
            win.getComputedStyle(doc.querySelector('#document-title')).outlineStyle !== 'none';
          results.push({ keyboardFocus: focused });
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
            publicPeg: [...doc.querySelectorAll('.document-primary')].find(link => link.textContent.includes('PEG')).getAttribute('href'),
            prepOrder: [...doc.querySelectorAll('.document-card h3')].map(heading => heading.textContent),
            missingVerbale: doc.querySelectorAll('.document-card')[4].querySelectorAll('a').length === 0,
            publicPdfs: [...doc.querySelectorAll('a[download]')].every(link =>
              link.getAttribute('href').startsWith('../documents/pdf/')) });
        } else if (page === 3) {
          results.push({ dashboard: doc.querySelector('#riservata').hidden === false,
            assembly: doc.querySelector('#dashboard-assembly-title').textContent,
            documents: doc.querySelectorAll('#dashboard-document-links li').length,
            unified: !doc.querySelector('[data-section-nav], [data-section-panel]') &&
              ['documents-tool', 'dashboard-assembly-panel', 'dashboard-documents-title'].every(id =>
                doc.getElementById(id).getClientRects().length > 0),
            documentManagerLinks: doc.querySelectorAll('#riservata a[href="documenti.html"]').length,
            unassignedCapo: !frame.contentWindow.NAS.user.admin && !frame.contentWindow.NAS.user.serviceBranch &&
              ['people-tool', 'people-access-tool', 'dashboard-group-overview', 'dashboard-metrics']
                .every(id => doc.getElementById(id).getClientRects().length === 0),
            pdfLinks: [...doc.querySelectorAll('#dashboard-document-links a')].every(link =>
              link.getClientRects().length > 0 && link.getAttribute('href').startsWith('../documents/pdf/') &&
              link.target === '_blank' && link.rel === 'noopener'),
            toolLinks: [...doc.querySelectorAll('.dashboard-assembly-actions > a')]
              .map(link => link.getAttribute('href')) });
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
          doc.head.append = append;
          frame.contentWindow.fetch = async () => ({ ok: true, json: async () => ${read("documents/index.json")} });
          await doc.querySelector('#dashboard-documents-retry').onclick();
          await doc.querySelector('#dashboard-assembly-retry').onclick();
          results.push({ dashboardRecovered: doc.querySelector('#dashboard-documents-retry').hidden &&
            doc.querySelector('#dashboard-assembly-retry').hidden &&
            doc.querySelectorAll('#dashboard-document-links a').length === 3 &&
            !doc.querySelector('#dashboard-assembly-title').textContent.includes('non disponibile') });
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
        "--timeout=120000",
        "--user-data-dir=" + path.join(dir, "profile"),
        "--dump-dom",
        "file://" + file,
      ],
      { encoding: "utf8", timeout: 150000, maxBuffer: 5 * 1024 * 1024,
        cwd: dir, env: { ...process.env, TMPDIR: "." } },
    );
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
    assert.ok(match, result.stdout.slice(-3000) + result.stderr.slice(-1500));
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
    assert.equal(publicAssembly.publicAssembly, 5);
    assert.equal(publicAssembly.missingVerbale, true);
    assert.deepEqual(publicAssembly.prepOrder, ["Convocazione assemblea 2026", "Regolamento assembleare",
      "PEG 2026-2028", "Bilancio 2026 · Modello D", "Verbale"]);
    assert.equal(publicAssembly.publicPeg, "../peg/");
    assert.equal(publicAssembly.publicPdfs, true);
    for (const item of results.filter((item) => "overflow" in item)) {
      assert.equal(item.overflow, false, "page " + item.page + " must fit width " + item.width);
    }
    assert.equal(results.find((item) => "cards" in item).cards, 4);
    assert.equal(results.find((item) => "cards" in item).preparatoryCards, 5);
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
    const manage = Object.assign({}, ...results.filter((item) => "initialSlots" in item || "pendingCount" in item ||
      "failedMessage" in item || "uploaded" in item || "editPreparatory" in item || "dirtyReloadAsked" in item ||
      "edited" in item || "remaining" in item || "loadError" in item || "emptyState" in item || "prefillKind" in item ||
      "assemblyShown" in item));
    const model = require("../assets/js/documents-model.js");
    const year = new Date().getFullYear();
    const expectedStates = model.preparatorySlots(JSON.parse(read("documents/index.json")), year)
      .map((slot) => (slot.document ? "ok" : "missing"));
    assert.deepEqual(manage.initialSlots, ["Convocazione", "Regolamento", "PEG", "Bilancio", "Verbale"]);
    assert.deepEqual(manage.initialStates, expectedStates);
    assert.equal(manage.initialCount, 4);
    assert.match(manage.source, /anteprima locale/);
    assert.equal(manage.credentialsHiddenInPreview, true);
    assert.match(manage.publicWarning, /PDF pubblici/);
    assert.equal(manage.techSecondary, true);
    assert.equal(manage.deleteDistinct, true);
    assert.equal(manage.titlePrefilled, "Nuovo", "title prefilled from the PDF file name");
    assert.equal(manage.descriptionOptional, true);
    assert.equal(manage.assemblyHiddenForGeneral, true);
    assert.equal(manage.assemblyShown, true);
    assert.equal(manage.typeWithoutYearBlocked, true, "a preparatory type without year must not be ignored");
    assert.equal(manage.pendingCount, 4, "no optimistic success-shaped list before the save completes");
    assert.match(manage.pendingMessage, /in corso/);
    assert.equal(manage.pendingLocked, true);
    assert.match(manage.failedMessage, /^Non salvato: Server non disponibile/);
    assert.equal(manage.failedCount, 4);
    assert.equal(manage.draftKept, true, "a failed save keeps the draft");
    assert.equal(manage.uploaded, 5, JSON.stringify(results));
    assert.equal(manage.posts, 1);
    assert.match(manage.status, /Salvato/);
    if (year === 2026) assert.deepEqual(manage.uploadedStates, ["ok", "ok", "ok", "ok", "ok"]);
    assert.equal(manage.editPreparatory, true);
    assert.equal(manage.currentFile, "nuovo.pdf");
    assert.equal(manage.currentFileHref, "../documents/pdf/nuovo.pdf");
    assert.equal(manage.replacementOptional, true);
    assert.equal(manage.pairedDates, true);
    assert.equal(manage.pairedAssembly, true);
    assert.equal(manage.dirtyReloadAsked, 1);
    assert.equal(manage.dirtyReloadKept, true);
    assert.equal(manage.edited, "Titolo modificato");
    assert.equal(manage.remaining, 4);
    assert.equal(manage.loadError, true);
    assert.deepEqual(manage.errorStates, ["unknown", "unknown", "unknown", "unknown", "unknown"]);
    assert.equal(manage.errorSaveDisabled, true);
    assert.equal(manage.errorMessageClass, "error");
    assert.equal(manage.emptyState, true);
    assert.deepEqual(manage.emptyStates, ["missing", "missing", "missing", "missing", "missing"]);
    assert.equal(manage.prefillKind, true);
    assert.equal(manage.prefillType, "bilancio");
    assert.equal(manage.prefillYear, String(year));
    assert.equal(manage.prefillVisible, true);
    const viewports = results.filter((item) => "viewport" in item);
    const layouts = Object.fromEntries(viewports.map((item) => [item.viewport, item.tabs]));
    assert.deepEqual(layouts, { "1920x1080": false, "1366x768": false, "820x1180": false, "1180x820": false,
      "390x844": true, "844x390": false });
    for (const item of viewports) {
      const where = item.viewport + " " + item.panel;
      assert.equal(item.viewportFits, true, where + " must not overflow");
      assert.deepEqual(item.small, [], where + " controls must be at least 44px and inside the viewport");
      assert.equal(item.slots, "Convocazione,Regolamento,PEG,Bilancio,Verbale", where);
      assert.equal(item.reloadUsable, true, where);
      assert.equal(item.tokenUsable, true, where);
      assert.equal(item.saveUsable, true, where);
      const width = Number(item.viewport.split("x")[0]);
      if (width >= 1100) assert.equal(item.sideBySide, true, where + " shows library and form side by side");
      else if (!item.tabs) assert.equal(item.stacked, true, where + " stacks library above the form");
      assert.ok(item.contentRatio >= (width >= 1900 ? 0.74 : 0.95), where + " leaves no huge empty margins: " + item.contentRatio);
    }
    assert.equal(results.find((item) => "keyboardFocus" in item).keyboardFocus, true);
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
      assert.equal(item.review, "Testi e riepilogo");
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
    assert.equal(dashboard.unified, true);
    assert.equal(dashboard.documentManagerLinks, 1);
    assert.equal(dashboard.unassignedCapo, true);
    assert.equal(dashboard.pdfLinks, true);
    assert.equal(results.find(item => "dashboardRecovered" in item).dashboardRecovered, true);
    assert.deepEqual(dashboard.toolLinks, ["assemblea/setup.html", "assemblea/regia.html", "assemblea/guida.html"]);
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
