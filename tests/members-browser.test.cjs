const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { renderHtml } = require("../tools/site-layout.cjs");
const M = require("../assets/js/soci-model.js");
const root = path.join(__dirname, "..");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("member UI edits, filters, imports, proposes passages and prints safely across six responsive viewports", { skip: !chrome }, t => {
  const directory = fs.mkdtempSync(path.join(root, ".members-browser-"));
  try {
    const snapshot = {
      units: [{ id: 1, branch: "E/G", name: "Aquile", color: "#ffffff", color2: "#ff0000", emblem: "", hidden: false, revision: 1 },
        { id: 2, branch: "E/G", name: "Falchi", color: "#ffffff", color2: "#ff0000", emblem: "", hidden: false, revision: 1 },
        { id: 3, branch: "E/G", name: "Volpi", color: "#ffffff", color2: "#ff0000", emblem: "", hidden: false, revision: 1 }],
      lc: { environment: "Branco", revision: 1 },
      members: [
        { id: 1, code: "012345", name: '<img src=x onerror=alert(1)> Esempio', kind: "ragazzo", branch: "E/G", revision: 1,
          profile: { givenName: '<img src=x onerror=alert(1)>', surname: "Esempio", birthDate: "2012-03-02", email: "test@example.invalid",
            guardians: "Esempio Responsabile [C.F.ABCDEF80A01H501U] - Nato/a a: Comune Esempio il: 1/1/1980 e-mail: guardian@example.invalid Cellulare: 000123" },
          censuses: [{ year: "2026", branch: "E/G", status: "Attivo" }], values: { "E/G": { squadriglia: "Aquile" } } },
        { id: 2, code: "012346", name: "Persona Locale", kind: "ragazzo", branch: "L/C", revision: 1,
          profile: { givenName: "Persona", surname: "Locale" }, censuses: [], values: { "L/C": { pista: "Nota precedente" } } },
        { id: 3, code: "012347", name: "Sospeso Lungo", kind: "ragazzo", branch: "E/G", revision: 1,
          profile: { givenName: "Sospeso", surname: "Lungo" }, censuses: [{ year: "2026", statusCode: "D", status: "Sospeso da oltre un anno" }], values: {} },
        { id: 4, code: "012348", name: "Sospeso Storico", kind: "ragazzo", branch: "L/C", revision: 1,
          profile: { givenName: "Sospeso", surname: "Storico" }, censuses: [{ year: "2025", statusCode: "S", status: "Sospeso" }], values: {} },
      ],
      fields: M.defaultFields,
      templates: [{ id: 1, title: "Scheda", body: "{{nome}} {{cognome}}\n{{codice}}\n{{percorso}}" }],
      group: {},
      currentYear: "2026",
      transfers: [],
    };
    const mock = `
      window.errors = [];
      window.addEventListener('error', event => window.errors.push(event.message));
      window.addEventListener('unhandledrejection', event => window.errors.push(event.reason.message));
      window.confirmations = [];
      window.confirm = text => { window.confirmations.push(text); return true; };
      window.NAS = { user: { admin: true } };
      let snapshot = ${JSON.stringify(snapshot).replace(/</g, "\\u003c")};
      window.calls = [];
      window.ACCESSO = { request: async (route, method = 'GET', value) => {
        window.calls.push(structuredClone({route, method, value}));
        if (route === 'activities') return { paths: [], events: [], members: [], branches: ['L/C', 'E/G', 'R/S'] };
        if (method === 'PATCH' && !route.includes('/transfers/')) {
          const member = snapshot.members.find(m => m.id === Number(route.split('/')[1]));
          member.profile = value.profile; member.branch = value.branch;
          member.values[value.branch] = value.values; member.revision++;
        }
        if (route === 'members/import') return {rows:1, newCount:1, updatedCount:0,
          warnings:Array.from({length:12}, (_,index) => 'Da verificare: responsabile della riga ' + (index + 1)),
          ignoredColumns:['COLONNA'], version:'preview-token'};
        if (route === 'members/macro') {
          if (value.action !== 'passage' || Object.hasOwn(value, 'branch')) throw new Error('Macro non valida');
          for (const selected of value.members) {
            const member = snapshot.members.find(m => m.id === selected.id);
            const target = window.SOCI_MODEL.nextBranch(member.branch);
            if (!target || member.revision !== selected.revision) throw new Error('Passaggio non valido');
            snapshot.transfers.push({id:1,personId:member.id,name:member.name,code:member.code,birthYear:'2012',source:member.branch,target,revision:1,canConfirm:true,canCancel:true});
          }
        }
        if (route.startsWith('members/transfers/')) snapshot.transfers = [];
        return structuredClone(snapshot);
      }};
      window.print = () => { window.printed = document.querySelector('#members-print').textContent; };
    `;
    const exercise = `
      (async () => {
        const results = {}, $ = id => document.getElementById(id), M = window.SOCI_MODEL;
        const settle = () => new Promise(resolve => setTimeout(resolve, 30));
        const controlsFit = root => [...root.querySelectorAll('input:not([type=checkbox]), select, textarea, button, summary')]
          .filter(control => control.getClientRects().length).every(control => {
            const rect = control.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44 && rect.left >= -1 && rect.right <= innerWidth + 1;
          });
        const dialogFits = id => {
          const dialog = $(id), rect = dialog.getBoundingClientRect();
          return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1 &&
            dialog.scrollWidth <= dialog.clientWidth && controlsFit(dialog);
        };
        try {
          await settle();
          results.loaded = !$('members-app').hidden;
          results.noInitialSuccess = $('members-status').textContent === '';
          results.adminDiagnostics = !$('members-diagnostics').hidden && !$('members-diagnostics').open &&
            $('members-visibility-note').textContent.includes('E/G: 2 soci assegnati alla branca.') &&
            $('members-visibility-note').textContent.includes('1 sospesi da oltre un anno nascosti');
          results.adminBranchSelector = !$('units-branch').closest('label').hidden;
          const visibleInViewport = element => { const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth; };
          results.lowHeightControls = innerHeight > 500 || (visibleInViewport(document.querySelector('#members-app > .section-nav')) &&
            visibleInViewport($('members-access-link')) && visibleInViewport($('new-member')) &&
            visibleInViewport(document.querySelector('.members-summary button')) &&
            visibleInViewport($('members-advanced-search').querySelector('summary')));
          results.lowHeightSearchTop = Math.round($('members-filters').elements.search.getBoundingClientRect().top);
          $('reload-members').click(); await settle();
          results.noReloadSuccess = $('members-status').textContent === '' && !$('members-app').inert;
          results.contextualUnitLabels = $('units-tab').textContent === 'Sestiglie' &&
            $('units-title').textContent.startsWith('Sestiglie');
          $('units-branch').value = 'E/G'; $('units-branch').onchange();
          results.contextualUnitLabels = results.contextualUnitLabels &&
            $('units-tab').textContent === 'Squadriglie' && $('units-title').textContent.startsWith('Squadriglie');
          $('units-branch').value = 'L/C'; $('units-branch').onchange();
          results.width = window.innerWidth;
          results.height = window.innerHeight;
          results.fits = document.documentElement.scrollWidth <= window.innerWidth;
          results.buttonLayout = [...document.querySelectorAll('.members-toolbar, .members-dialog-actions')]
            .every(group => {
              const buttons = [...group.querySelectorAll('button,a.button')].filter(button => button.getClientRects().length);
              return buttons.every((button, index) => {
                const rect = button.getBoundingClientRect();
                return rect.width >= 44 && rect.left >= -1 && rect.right <= innerWidth + 1 &&
                  buttons.slice(index + 1).every(other => {
                    const next = other.getBoundingClientRect();
                    return rect.right <= next.left + 1 || next.right <= rect.left + 1 || rect.bottom <= next.top + 1 || next.bottom <= rect.top + 1;
                  });
              });
            });
          results.quickFilterTargets = [...document.querySelectorAll('.members-filter-chip')]
              .every(button => {
                  const rect = button.getBoundingClientRect();
                  return rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth + 1;
              });
          results.safeName = !!document.querySelector('.member-name') && !document.querySelector('.member-name img');
          results.readableList = innerWidth <= 900 ? getComputedStyle($('members-list').rows[0]).display === 'grid' :
            document.querySelector('.members-table-wrap').scrollWidth <= document.querySelector('.members-table-wrap').clientWidth;
          results.rowTouchTarget = [...document.querySelectorAll('.members-row-select, #members-list .member-name')]
            .every(control => control.getBoundingClientRect().height >= 44);
          const secondary = document.querySelector('.members-secondary-actions');
          secondary.open = true;
          results.secondaryActionsFit = controlsFit(secondary);
          secondary.open = false;
          results.rows = $('members-list').rows.length;
          results.visibleCount = [...$('members-summary').querySelectorAll('strong')].reduce((n,el) => n + Number(el.textContent), 0);
          const originalMembers = snapshot.members;
          const today = new Date();
          snapshot.members = [10, 9, 14, null].map((years, index) => ({
            ...structuredClone(originalMembers[0]), id: 41 + index, code: '99994' + index,
            name: ['Zeta', 'Beta', 'Alfa', 'Gamma'][index],
            profile: { birthDate: years === null ? '' : (today.getFullYear() - years) + (index === 0 ? '-12-31' : '-01-01') },
          }));
          $('reload-members').click(); await settle();
          const codes = () => [...$('members-list').querySelectorAll('td:nth-child(2) .member-code')].map(code => code.textContent).join(',');
          const ageSort = document.querySelector('[data-sort="age"]');
          ageSort.click();
          results.ageAscending = codes() === '999941,999940,999942,999943' &&
            ageSort.parentElement.getAttribute('aria-sort') === 'ascending';
          ageSort.click();
          results.ageDescending = codes() === '999942,999940,999941,999943' &&
            ageSort.parentElement.getAttribute('aria-sort') === 'descending';
          ageSort.click();
          results.sortCleared = codes() === '999940,999941,999942,999943' &&
            ageSort.parentElement.getAttribute('aria-sort') === 'none';
          const nameSort = document.querySelector('[data-sort="name"]');
          nameSort.click();
          results.nameAscending = codes() === '999942,999941,999943,999940';
          ageSort.click();
          results.switchSort = codes() === '999941,999940,999942,999943' &&
            nameSort.parentElement.getAttribute('aria-sort') === 'none';
          ageSort.click(); ageSort.click();
          snapshot.members = originalMembers;
          $('reload-members').click(); await settle();
          results.branchBadgeColor = $('members-list').querySelector('.member-badge').style.getPropertyValue('--branch-color') === M.branchColors['E/G'] &&
            document.querySelector('[data-sort="branch"]').textContent === 'Branca';
          const filters = $('members-filters').elements;
          results.noDuplicateFilters = $('members-quick-filters').hidden && $('members-selection').hidden;
          const resetFilters = $('members-reset-filters');
          results.advancedCensusFilters = !$('members-advanced-search').contains(filters.search) &&
            ['year', 'status', 'showSuspended'].every(name => $('members-advanced-search').contains(filters[name])) &&
            !$('members-advanced-search').open;
          results.resetHiddenWithoutFilters = $('members-active-filters').hidden && !resetFilters.getClientRects().length &&
            !$('members-filters').contains(resetFilters) && !filters.search.checkVisibility();
          filters.search.value = 'Esempio'; $('members-filters').oninput();
          const chipRect = document.querySelector('[data-filter-key="search"]').getBoundingClientRect();
          const resetRect = resetFilters.getBoundingClientRect();
          results.resetRightOfActiveFilters = !$('members-active-filters').hidden && resetRect.width >= 44 && resetRect.height >= 44 &&
            resetRect.left >= chipRect.right && resetRect.right <= innerWidth + 1 &&
            Math.abs(resetRect.right - $('members-active-filters').getBoundingClientRect().right) <= 1;
          resetFilters.click(); await settle();
          results.resetClearsAndHides = filters.search.value === '' && $('members-active-filters').hidden &&
            $('members-list').rows.length === 2;
          filters.showSuspended.checked = true; $('members-filters').oninput();
          results.checkboxShowsReset = !$('members-active-filters').hidden && resetFilters.getClientRects().length > 0;
          filters.showSuspended.checked = false; $('members-filters').oninput();
          filters.showSuspended.checked = true; $('members-filters').oninput();
          results.withSuspended = $('members-list').rows.length;
          $('select-results').click();
          results.selectionBar = !$('members-selection').hidden;
          filters.showSuspended.checked = false; $('members-filters').oninput();
          results.hiddenSelectionRemoved = $('members-count').textContent.includes('2 selezionati');
          $('clear-selection').click();
          results.selectionBar = results.selectionBar && $('members-selection').hidden;
          const branchCard = [...$('members-summary').querySelectorAll('button')].find(button => button.firstChild.textContent === 'E/G');
          branchCard.click();
          results.branchCardFilters = filters.branch.value === 'E/G' &&
            $('members-list').textContent.includes('012345') && !$('members-list').textContent.includes('Persona Locale') &&
            document.activeElement.getAttribute('aria-pressed') === 'true';
          [...$('members-summary').querySelectorAll('button')].find(button => button.firstChild.textContent === 'E/G').click();
          const clearedBranch = [...$('members-summary').querySelectorAll('button')].find(button => button.firstChild.textContent === 'E/G');
          results.branchClickAgainClears = filters.branch.value === '' && $('members-list').rows.length === 2 &&
            clearedBranch.getAttribute('aria-pressed') === 'false' &&
            getComputedStyle(clearedBranch).backgroundColor === 'rgb(255, 255, 255)';
          [...$('members-summary').querySelectorAll('button')].find(button => button.firstChild.textContent === 'E/G').click();
          results.summaryNoHint = !$('members-summary').textContent.includes('schede visibili nella branca locale');
          results.branchRows = $('members-list').rows.length;
          filters.year.value = '2026'; $('members-filters').oninput();
          results.yearRows = $('members-list').rows.length;
          results.yearChipPressed = filters.year.value === '2026' &&
            document.querySelector('[data-filter-key="year"]').getAttribute('aria-label') === 'Rimuovi filtro Anno censimento: 2026';
          filters.status.value = 'Attivo'; $('members-filters').oninput();
          results.statusCombined = filters.status.value === 'Attivo' && $('members-list').rows.length === 1;
          document.querySelector('[data-filter-key="status"]').click();
          results.statusChipToggle = filters.status.value === '' && filters.year.value === '2026';
          document.querySelector('[data-filter-key="year"]').click();
          results.yearChipToggle = filters.year.value === '' && $('members-list').rows.length === 1;
          results.advancedCollapsed = !$('members-advanced-search').open;
          $('members-advanced-search').querySelector('summary').click();
          results.advancedExpanded = $('members-advanced-search').open &&
            $('members-advanced-search').querySelector('[name="birthYear"]').getClientRects().length > 0;
          results.advancedFits = controlsFit($('members-filters')) &&
            $('members-filters').scrollWidth <= $('members-filters').clientWidth;
          filters.field.value = 'E/G:squadriglia'; filters.value.value = 'Aquile'; $('members-filters').oninput();
          results.fieldMatch = $('members-list').rows.length;
          filters.missing.checked = true; $('members-filters').oninput();
          results.emptyText = $('members-list').textContent.includes('Nessun socio');
          $('members-filters').reset(); await settle();
          filters.quality.value = 'contacts'; $('members-filters').oninput();
          results.missingContact = $('members-list').textContent.includes('Persona Locale') && !$('members-list').textContent.includes('012345');
          $('members-filters').reset(); await settle();
          filters.birthYear.value = '2012'; $('members-filters').oninput();
          results.birthRows = $('members-list').rows.length;
          filters.groupBirthYear.checked = true; $('members-filters').oninput();
          results.birthGroup = $('members-list').textContent.includes('Nati nel 2012');
          $('members-filters').reset(); await settle();
          document.querySelector('.member-name').click();
          const form = $('member-form');
          results.dialog = $('member-dialog').open;
          const memberTabs = [...document.querySelectorAll('#member-section-nav [role="tab"]')];
          results.sectionNavigation = memberTabs.map(tab => tab.textContent.trim()).join('|') === 'Attività|Percorso|Anagrafica|Contatti|Genitori|Censimenti' &&
            memberTabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length === 1 &&
            memberTabs[0].getAttribute('aria-selected') === 'true' && !$('member-panel-activities').hidden &&
            document.querySelectorAll('#member-dialog [role=tabpanel]').length === 6 &&
            $('member-panel-activities').contains($('member-activities')) &&
            !$('member-panel-profile').contains($('member-activities')) &&
            ['contacts', 'guardians', 'censuses'].every(section =>
              !$('member-panel-profile').contains($('member-panel-' + section)) &&
              $('member-panel-' + section).parentElement === $('member-form'));
          results.saveAvailable = !$('member-save').hidden;
          const givenName = form.elements['profile:givenName'];
          givenName.value = 'Bozza conservata';
          memberTabs[1].click();
          results.draftSurvivesNavigation = givenName.value === 'Bozza conservata' &&
            $('member-panel-profile').hidden && !$('member-panel-education').hidden;
          memberTabs[2].click();
          results.activeSectionClear = memberTabs[2].getAttribute('aria-selected') === 'true' &&
            !$('member-panel-profile').hidden && $('member-panel-activities').hidden;
          memberTabs[0].click();
          const dialogRect = $('member-dialog').getBoundingClientRect();
          results.dialogFits = dialogRect.left >= 0 && dialogRect.right <= innerWidth &&
            $('member-dialog').scrollWidth <= $('member-dialog').clientWidth;
          const saveRect = $('member-save').getBoundingClientRect();
          results.saveReachable = saveRect.bottom <= innerHeight && saveRect.height >= 44;
          results.allSectionsReachable = memberTabs.every(tab => {
            tab.scrollIntoView({block:'nearest', inline:'nearest'});
            tab.click();
            const rect = tab.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && rect.height >= 44 &&
              tab.getAttribute('aria-selected') === 'true' && !$(tab.getAttribute('aria-controls')).hidden;
          });
          memberTabs[0].click();
          results.usefulScrollArea = $('member-panel-activities').clientHeight >= Math.min(150, innerHeight / 3);
          results.shortFullscreen = (innerHeight > 500 && innerWidth > 760) || (dialogRect.width === innerWidth && dialogRect.height === innerHeight);
          results.dialogUsesSpace = innerWidth <= 760 || innerHeight <= 500 ||
            (dialogRect.width >= Math.min(1100, innerWidth * .8) && dialogRect.width <= 1200 && dialogRect.height <= innerHeight);
          results.measures = { dialog: [Math.round(dialogRect.width), Math.round(dialogRect.height)],
            scrollArea: $('member-panel-activities').clientHeight, searchTop: results.lowHeightSearchTop };
          results.sectionContentsReachable = memberTabs.every(tab => {
            tab.click();
            const panel = $(tab.getAttribute('aria-controls'));
            panel.scrollTop = panel.scrollHeight;
            const last = panel.lastElementChild.getBoundingClientRect();
            const bounds = panel.getBoundingClientRect();
            return panel.clientHeight >= Math.min(150, innerHeight / 3) && last.bottom <= bounds.bottom + 1;
          });
          memberTabs[0].click();
          results.branchLocked = form.elements.branch.disabled;
          results.prefilled = $('member-assignment').textContent.includes('Aquile') &&
            !form.elements['extra:squadriglia'] && !form.elements['extra:ruolo'];
          const historyToggle = $('member-assignment').querySelector('details summary');
          results.assignmentHistory = historyToggle.textContent.trim() === 'Storico' &&
            historyToggle.getAttribute('aria-label') === 'Storico assegnazioni';
          results.assignmentNoDirections = !$('member-assignment').textContent.includes('Si modificano dalla schermata');
          results.history = $('member-censuses').textContent.includes('2026') && $('member-censuses').textContent.includes('Attivo');
          $('member-tab-guardians').click();
          results.guardianParsed = $('member-guardians').children.length === 1 &&
            form.elements['guardian:0:taxCode'].value === 'ABCDEF80A01H501U' &&
            form.elements['guardian:0:email'].value === 'guardian@example.invalid' &&
            form.elements['guardian:0:birthTown'].value === 'Comune Esempio' &&
            form.elements['guardian:0:birthDate'].value === '1980-01-01' &&
            form.elements['guardian:0:email'].type === 'email' &&
            !form.elements['guardian:0:givenName'] && !form.elements['guardian:0:surname'] &&
            form.elements['guardian:0:fullName'].value === 'Esempio Responsabile';
          form.elements['guardian:0:fullName'].value = 'Responsabile Esempio';
          $('add-guardian').click();
          results.guardianAdd = $('member-guardians').children.length === 2;
          $('member-guardians').lastElementChild.querySelector('button').click();
          results.guardianRemove = $('member-guardians').children.length === 1;
          memberTabs[1].click();
          const specialtyGroup = [...$('member-education').querySelectorAll('.members-choice-field')]
            .find(group => group.querySelector('input[type=checkbox]').name === 'extra:specialita');
          specialtyGroup.querySelector('details').open = true;
          results.specialtyEmptyPrompt = specialtyGroup.querySelector('summary').textContent.includes('Scegli specialità') &&
            !specialtyGroup.querySelector('summary').textContent.includes('0 selezionate');
          results.specialtiesNotButtonGrid = specialtyGroup.querySelectorAll('.members-choice-list button, input[type=radio]').length === 0 &&
            specialtyGroup.querySelectorAll('input[type=checkbox]').length === M.specialtyCatalogs['E/G'].length;
          const checkAward = value => {
            const checkbox = [...specialtyGroup.querySelectorAll('input[type=checkbox]')].find(input => input.value === value);
            checkbox.click();
          };
          checkAward('Cuoco'); checkAward('Fotografo');
          results.specialtySummary = specialtyGroup.querySelector('summary').textContent.includes('2 selezionate') &&
            specialtyGroup.querySelector('.members-selected-choices').textContent.includes('Cuoco') &&
            specialtyGroup.querySelector('.members-selected-choices').textContent.includes('Fotografo');
          specialtyGroup.querySelector('[aria-label="Rimuovi Cuoco"]').click();
          results.specialtyRemove = ![...specialtyGroup.querySelectorAll('input[type=checkbox]')].find(input => input.value === 'Cuoco').checked;
          checkAward('Cuoco');
          const awardSearch = specialtyGroup.querySelector('input[type=search]');
          awardSearch.value = 'cuoco'; awardSearch.dispatchEvent(new Event('input'));
          results.awardSearch = [...specialtyGroup.querySelector('.members-choice-list').children].filter(label => !label.hidden).length === 1;
          results.awardFits = $('member-dialog').scrollWidth <= $('member-dialog').clientWidth;
          results.pickerFits = controlsFit(specialtyGroup) &&
            specialtyGroup.querySelector('.members-choice-list').clientHeight <= 180;
          const badge = [...$('member-education').querySelectorAll('input[name="extra:brevetti"]')].find(input => input.value === 'Pioniere');
          badge.click();
          form.elements['extra:tappa'].value = 'Tappa della scoperta';
          form.elements['extra:anno'].value = 'Secondo anno';
          memberTabs[2].click();
          results.guardianDraft = form.elements['guardian:0:fullName'].value === 'Responsabile Esempio';
          form.elements['profile:phone'].value = '000123';
          memberTabs[1].click();
          form.elements['profile:email'].value = 'not-an-email';
          results.emailType = form.elements['profile:email'].type === 'email';
          memberTabs[0].click();
          form.requestSubmit();
          results.invalidContactsVisible = !$('member-panel-contacts').hidden && $('member-dialog').open &&
            $('member-tab-contacts').getAttribute('aria-selected') === 'true';
          form.elements['profile:email'].value = 'test@example.invalid';
          memberTabs[0].click();
          form.requestSubmit(); await settle();
          results.saved = window.calls.find(call => call.method === 'PATCH').value;
          results.realOperationSuccess = $('members-status').textContent === 'Operazione completata.' &&
            $('members-status').dataset.tone === 'success' && getComputedStyle($('members-status')).color === 'rgb(49, 95, 69)';
          results.closedAfterSave = !$('member-dialog').open;
          const macro = $('macro-form');
          const macroCalls = () => window.calls.filter(call => call.route === 'members/macro').length;
          $('members-list').querySelector('input[type=checkbox]').click();
          results.quickActionOnlyPassage = $('open-macro').textContent === 'Proponi passaggio' &&
            [...$('members-selection').querySelectorAll('button')].map(button => button.textContent).join('|') === 'Deseleziona|Proponi passaggio|Genera documenti';
          $('open-macro').click();
          results.macroFits = dialogFits('macro-dialog');
          results.macroRoute = $('macro-route').textContent === 'E/G → R/S' && $('macro-error').textContent === '' &&
            !$('propose-transfer').disabled && $('macro-count').textContent.startsWith('1 soci selezionati');
          results.macroNoInputs = macro.querySelectorAll('select,input,textarea').length === 0 &&
            !$('macro-value') && !$('macro-field-label') && !$('macro-replacement-warning') &&
            [...macro.querySelectorAll('button')].map(button => button.textContent).join('|') === 'Chiudi|Proponi passaggio';
          macro.requestSubmit(); await settle();
          results.passageConfirmed = window.confirmations.at(-1) === 'Proporre il passaggio E/G → R/S per 1 soci?';
          results.passage = window.calls.find(call => call.route === 'members/macro').value;
          results.macroClosed = !$('macro-dialog').open;
          results.pending = $('members-transfers').textContent.includes('E/G → R/S');
          results.notMoved = $('members-list').textContent.includes('E/G');
          results.pendingBadge = $('transfers-tab').textContent === 'Passaggi · 1' && !$('members-incoming').hidden &&
            $('members-incoming').textContent === '1 passaggi da accettare o rifiutare →';
          $('members-list').querySelector('input[type=checkbox]').click();
          $('open-documents').click();
          results.documentsFit = dialogFits('documents-dialog');
          results.safeDocument = !document.querySelector('#document-preview img');
          $('print-documents').click();
          results.printed = ['Secondo anno', 'Tappa della scoperta', 'Cuoco; Fotografo', 'Pioniere', '012345'].every(text => window.printed.includes(text));
          $('members-incoming').click();
          results.incomingOpensTab = !$('members-transfer-panel').hidden && $('members-search-panel').hidden &&
            $('transfers-tab').getAttribute('aria-pressed') === 'true';
          results.pendingLayout = controlsFit($('members-transfers')) &&
            $('members-transfers').scrollWidth <= $('members-transfers').clientWidth;
          [...$('members-transfers').querySelectorAll('button')].find(button => button.textContent === 'Annulla proposta').click(); await settle();
          results.cancelPatch = window.calls.filter(call => call.method === 'PATCH').at(-1);
          results.cancelled = $('members-transfers').textContent.includes('Nessun passaggio') && $('members-incoming').hidden &&
            $('transfers-tab').textContent === 'Passaggi';
          document.querySelector('[data-section-target="members-search-panel"]').click();
          $('open-import').click();
          results.importSourceFits = dialogFits('import-dialog');
          $('import-csv').value = 'synthetic csv';
          $('analyze-import').click(); await settle();
          results.preview = !$('confirm-import').disabled && $('import-preview').textContent.includes('Da verificare');
          $('import-dialog').scrollTop = $('import-dialog').scrollHeight;
          results.importReviewFits = dialogFits('import-dialog') &&
            $('confirm-import').getBoundingClientRect().bottom <= innerHeight;
          $('confirm-import').click(); await settle();
          results.confirm = window.calls.find(call => call.route === 'members/import' && call.value.confirm).value;
          results.clearedCsv = $('import-csv').value === '';
          $('new-member').click();
          results.newEditableCode = !form.elements.code.readOnly;
          form.elements.code.value = '012349';
          form.elements['profile:givenName'].value = 'Bozza';
          let closePrompt = '';
          window.confirm = text => { closePrompt = text; return false; };
          document.querySelector('[data-close=member-dialog]').click();
          results.dirtyCloseProtected = $('member-dialog').open && closePrompt.includes('senza salvare');
          window.confirm = text => { window.confirmations.push(text); return true; };
          document.querySelector('[data-close=member-dialog]').click();
          [...document.querySelectorAll('#members-list .member-name')].find(button => button.textContent === 'Persona Locale').click();
          results.onlyLcMoment = !form.elements['extra:pista'] && !!form.elements['extra:progressione'] &&
            $('member-assignment').textContent.includes('Nota precedente');
          document.querySelector('[data-close=member-dialog]').click();
          $('clear-selection').click();
          filters.search.value = 'Persona Locale'; $('members-filters').oninput();
          $('select-results').click(); $('open-documents').click();
          results.noLegacyPistaDocument = !$('document-preview').textContent.includes('Nota precedente') &&
            !$('document-preview').textContent.includes('Pista / sentiero');
          document.querySelector('[data-close=documents-dialog]').click();
          $('open-macro').click();
          results.lcRoute = $('macro-route').textContent === 'L/C → E/G' && !$('propose-transfer').disabled && $('macro-error').textContent === '';
          document.querySelector('[data-close=macro-dialog]').click();
          filters.search.value = ''; $('members-filters').oninput();
          [...$('members-list').querySelectorAll('input[type=checkbox]')].find(input => !input.checked).click();
          $('open-macro').click();
          const noRoute = 'Nessun passaggio proponibile con questa selezione.';
          results.mixedBlocked = $('members-count').textContent.includes('2 selezionati') &&
            $('macro-error').textContent === 'Seleziona solo soci della stessa branca.' &&
            $('macro-route').textContent === noRoute && $('propose-transfer').disabled;
          macro.querySelector('#propose-transfer').scrollIntoView({block:'end'});
          results.multipleMacroFits = dialogFits('macro-dialog') &&
            macro.querySelector('#propose-transfer').getBoundingClientRect().bottom <= innerHeight;
          const invalidStart = { calls: window.calls.length, macro: macroCalls(), confirmations: window.confirmations.length };
          macro.requestSubmit(); await settle();
          results.mixedStaysOpen = $('macro-dialog').open && $('macro-error').textContent === 'Seleziona solo soci della stessa branca.';
          document.querySelector('[data-close=macro-dialog]').click();
          $('clear-selection').click();
          results.emptyDisabled = $('open-macro').disabled && $('members-selection').hidden;
          $('open-macro').onclick();
          results.emptyBlocked = $('macro-error').textContent === 'Seleziona almeno un socio.' &&
            $('macro-route').textContent === noRoute && $('propose-transfer').disabled;
          macro.requestSubmit(); await settle();
          results.emptyStaysOpen = $('macro-dialog').open && $('macro-error').textContent === 'Seleziona almeno un socio.';
          results.invalidNoApi = window.calls.length === invalidStart.calls && macroCalls() === invalidStart.macro &&
            window.confirmations.length === invalidStart.confirmations;
          document.querySelector('[data-close=macro-dialog]').click();
          const field = $('field-form');
          field.elements.label.value = 'Obiettivo personale'; field.elements.label.dispatchEvent(new Event('input'));
          results.keySuggested = field.elements.key.value === 'obiettivo-personale';
          field.elements.key.value = 'mia-chiave';
          field.elements.label.value = 'Altro nome'; field.elements.label.dispatchEvent(new Event('input'));
          results.keyEditable = field.elements.key.value === 'mia-chiave';
          results.optionsConditional = $('field-options-label').hidden && field.elements.options.disabled;
          field.elements.type.value = 'select'; field.elements.type.onchange();
          results.optionsConditional = results.optionsConditional && !$('field-options-label').hidden && !field.elements.options.disabled;
          document.querySelector('[data-section-target="members-settings-panel"]').click();
          results.settingsFits = controlsFit($('members-settings-panel')) &&
            $('members-settings-panel').scrollWidth <= $('members-settings-panel').clientWidth;
          document.querySelector('[data-section-target="members-transfer-panel"]').click();
          results.transfersFit = $('members-transfer-panel').scrollWidth <= $('members-transfer-panel').clientWidth;
          document.querySelector('[data-section-target="members-search-panel"]').click();
          field.elements.type.value = 'text'; field.elements.type.onchange();
          field.requestSubmit(); await settle();
          results.nonSelectOptions = window.calls.find(call => call.route === 'members/fields').value.options.length === 0;
          results.errors = window.errors;
        } catch(error) { results.failure = error.message; results.errors = window.errors; }
        const output = document.createElement('pre'); output.id = 'members-browser-result';
        output.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(results)))); document.body.append(output);
      })();
    `;
    const source = renderHtml(read("area-riservata/soci.html"), "area-riservata/soci.html")
      .replace(/<link\b[^>]*>/g, "")
      .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
        src.includes("soci-model.js") ? `<script>${read("assets/js/soci-model.js")}</script>` :
          src.includes("soci-units.js") ? `<script>${read("assets/js/soci-units.js")}</script>` :
          src.includes("soci.js") ? `<script>${read("assets/js/soci.js")}</script>` :
          src.includes("section-nav.js") ? `<script>${read("assets/js/shared/section-nav.js")}</script>` : "")
      .replace("</head>", `<style>${["theme", "home", "nas", "soci", "section-nav"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`);
    for (const [width, height] of [[1920, 1080], [1366, 768], [820, 1180], [390, 844], [1180, 820], [844, 390]]) {
      const file = path.join(directory, "fixture.html");
      const page = source.replace("</body>", `<script>${exercise}</script></body>`);
      fs.writeFileSync(file, `<!doctype html><body><script>
        const frame = document.createElement('iframe');
        frame.style.cssText = 'border:0;width:${width}px;height:${height}px';
        document.body.append(frame);
        frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
        const timer = setInterval(() => {
          const result = frame.contentDocument?.getElementById('members-browser-result');
          if (result) { const copy = document.createElement('pre'); copy.id = result.id;
            copy.textContent = result.textContent; document.body.append(copy); clearInterval(timer); }
        }, 50);
      </script>`);
      const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, "profile-" + width),
        "--window-size=" + width + ",1000", "--virtual-time-budget=6000", "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, TMPDIR: root } });
      assert.equal(browser.status, 0, browser.stderr);
      const encoded = /<pre id="members-browser-result">([^<]+)<\/pre>/.exec(browser.stdout)?.[1];
      assert.ok(encoded, browser.stdout.slice(-4000));
      const results = JSON.parse(Buffer.from(encoded, "base64").toString());
      assert.equal(results.failure, undefined, JSON.stringify(results));
      assert.deepEqual(results.errors, []);
      assert.equal(results.width, width); assert.equal(results.height, height); assert.equal(results.fits, true);
      assert.equal(results.buttonLayout, true, JSON.stringify(results));
      assert.equal(results.quickFilterTargets, true, JSON.stringify(results));
      assert.equal(results.dialogFits, true, JSON.stringify(results));
      for (const key of ["loaded", "adminDiagnostics", "adminBranchSelector", "safeName", "dialog", "history", "emptyText", "missingContact", "closedAfterSave", "safeDocument",
        "printed", "preview", "clearedCsv", "newEditableCode", "sectionNavigation", "saveAvailable", "draftSurvivesNavigation", "activeSectionClear",
        "contextualUnitLabels", "assignmentHistory", "assignmentNoDirections", "onlyLcMoment", "noDuplicateFilters", "selectionBar", "allSectionsReachable",
        "usefulScrollArea", "noInitialSuccess", "lowHeightControls", "noReloadSuccess", "realOperationSuccess", "shortFullscreen", "sectionContentsReachable", "emailType", "dirtyCloseProtected",
        "noLegacyPistaDocument", "quickActionOnlyPassage", "macroRoute", "macroNoInputs", "passageConfirmed", "macroClosed", "pendingBadge",
        "incomingOpensTab", "lcRoute", "mixedBlocked", "mixedStaysOpen", "emptyDisabled", "emptyBlocked", "emptyStaysOpen", "invalidNoApi", "keySuggested", "keyEditable", "optionsConditional", "nonSelectOptions",
        "readableList", "rowTouchTarget", "secondaryActionsFit", "advancedFits", "dialogUsesSpace", "pickerFits", "macroFits", "documentsFit",
        "importSourceFits", "importReviewFits", "settingsFits", "transfersFit", "pendingLayout", "multipleMacroFits",
        "ageAscending", "ageDescending", "sortCleared", "nameAscending", "switchSort", "branchBadgeColor"])
        assert.equal(results[key], true, key + ": " + JSON.stringify(results));
      t.diagnostic(width + "×" + height + ": " + JSON.stringify(results.measures));
      assert.equal(results.rows, 2);
      assert.equal(results.visibleCount, 2); assert.equal(results.withSuspended, 4); assert.equal(results.hiddenSelectionRemoved, true);
      assert.equal(results.branchLocked, true);
      assert.equal(results.branchCardFilters, true); assert.equal(results.summaryNoHint, true);
      for (const key of ["branchClickAgainClears", "yearChipPressed", "statusCombined", "statusChipToggle",
        "yearChipToggle", "advancedCollapsed", "advancedExpanded", "advancedCensusFilters", "resetHiddenWithoutFilters",
        "resetRightOfActiveFilters", "resetClearsAndHides", "checkboxShowsReset", "specialtiesNotButtonGrid", "specialtySummary", "specialtyRemove"])
        assert.equal(results[key], true, key + ": " + JSON.stringify(results));
      assert.equal(results.branchRows, 1); assert.equal(results.yearRows, 1); assert.equal(results.fieldMatch, 1);
      assert.equal(results.birthRows, 1); assert.equal(results.birthGroup, true);
      assert.equal(results.prefilled, true);
      assert.equal(results.saved.profile.phone, "000123");
      assert.equal(results.saved.values.squadriglia, "Aquile");
      for (const key of ["guardianParsed", "guardianAdd", "guardianRemove", "guardianDraft", "awardSearch", "awardFits", "specialtyEmptyPrompt"])
        assert.equal(results[key], true, key + ": " + JSON.stringify(results));
      assert.deepEqual(results.saved.values.specialita, ["Cuoco", "Fotografo"]);
      assert.deepEqual(results.saved.values.brevetti, ["Pioniere"]);
      assert.equal(results.saved.values.progressione, undefined);
      assert.equal(results.saved.values.ruolo, undefined);
      assert.equal(results.saved.values.tappa, "Tappa della scoperta");
      assert.equal(results.saved.values.anno, "Secondo anno");
      assert.equal(results.saved.profile.guardianContacts[0].fullName, "Responsabile Esempio");
      assert.equal(results.invalidContactsVisible, true);
      assert.equal(results.saveReachable, true);
      assert.equal(results.saved.revision, 1);
      assert.deepEqual(results.passage, { action: "passage", members: [{ id: 1, revision: 2 }] });
      assert.deepEqual(results.cancelPatch, { route: "members/transfers/1", method: "PATCH", value: { action: "cancel", revision: 1 } });
      assert.equal(results.pending, true, JSON.stringify(results)); assert.equal(results.notMoved, true, JSON.stringify(results)); assert.equal(results.cancelled, true, JSON.stringify(results));
      assert.equal(results.confirm.version, "preview-token"); assert.equal(results.confirm.csv, "synthetic csv");
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
