const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { renderHtml } = require("../tools/site-layout.cjs");
const M = require("../assets/js/soci-model.js");
const root = path.join(__dirname, "..");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("member UI edits, filters, imports, applies macros and prints safely on desktop and mobile", { skip: !chrome }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "members-browser-"));
  try {
    const snapshot = {
      members: [
        { id: 1, code: "012345", name: '<img src=x onerror=alert(1)> Esempio', kind: "ragazzo", branch: "E/G", revision: 1,
          profile: { givenName: '<img src=x onerror=alert(1)>', surname: "Esempio", birthDate: "2012-03-02", email: "test@example.invalid",
            guardians: "Esempio Responsabile [C.F.ABCDEF80A01H501U] - Nato/a a: Comune Esempio il: 1/1/1980 e-mail: guardian@example.invalid Cellulare: 000123" },
          censuses: [{ year: "2026", branch: "E/G", status: "Attivo" }], values: { "E/G": { squadriglia: "Aquile" } } },
        { id: 2, code: "012346", name: "Persona Locale", kind: "ragazzo", branch: "L/C", revision: 1,
          profile: { givenName: "Persona", surname: "Locale" }, censuses: [], values: {} },
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
      window.confirm = () => true;
      window.NAS = { user: { admin: true } };
      let snapshot = ${JSON.stringify(snapshot).replace(/</g, "\\u003c")};
      window.calls = [];
      window.ACCESSO = { request: async (route, method = 'GET', value) => {
        window.calls.push(structuredClone({route, method, value}));
        if (method === 'PATCH' && !route.includes('/transfers/')) {
          const member = snapshot.members.find(m => m.id === Number(route.split('/')[1]));
          member.profile = value.profile; member.branch = value.branch;
          member.values[value.branch] = value.values; member.revision++;
        }
        if (route === 'members/import') return {rows:1, newCount:1, updatedCount:0, warnings:['Da verificare'], ignoredColumns:['COLONNA'], version:'preview-token'};
        if (route === 'members/macro') {
          for (const selected of value.members) {
            const member = snapshot.members.find(m => m.id === selected.id);
            if(value.action === 'passage') {
              snapshot.transfers.push({id:1,personId:member.id,name:member.name,code:member.code,birthYear:'2012',source:member.branch,target:value.branch,revision:1,canConfirm:false,canCancel:true});
            } else {
              member.values[value.branch] ||= {}; member.values[value.branch][value.key] = value.value;
              member.revision++;
            }
          }
        }
        if (route.startsWith('members/transfers/')) snapshot.transfers = [];
        return structuredClone(snapshot);
      }};
      window.print = () => { window.printed = document.querySelector('#members-print').textContent; };
    `;
    const exercise = `
      (async () => {
        const results = {}, $ = id => document.getElementById(id);
        const settle = () => new Promise(resolve => setTimeout(resolve, 30));
        try {
          await settle();
          results.loaded = !$('members-app').hidden;
          results.width = window.innerWidth;
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
          results.safeName = !!document.querySelector('.member-name') && !document.querySelector('.member-name img');
          results.rows = $('members-list').rows.length;
          results.visibleCount = [...$('members-summary').querySelectorAll('strong')].reduce((n,el) => n + Number(el.textContent), 0);
          const filters = $('members-filters').elements;
          filters.showSuspended.checked = true; $('members-filters').oninput();
          results.withSuspended = $('members-list').rows.length;
          $('select-results').click();
          filters.showSuspended.checked = false; $('members-filters').oninput();
          results.hiddenSelectionRemoved = $('members-count').textContent.includes('2 selezionati');
          $('clear-selection').click();
          const branchCard = [...$('members-summary').querySelectorAll('button')].find(button => button.firstChild.textContent === 'E/G');
          branchCard.click();
          results.branchCardFilters = filters.branch.value === 'E/G' &&
            $('members-list').textContent.includes('012345') && !$('members-list').textContent.includes('Persona Locale') &&
            document.activeElement.getAttribute('aria-pressed') === 'true';
          results.summaryNoHint = !$('members-summary').textContent.includes('schede visibili nella branca locale');
          results.branchRows = $('members-list').rows.length;
          filters.year.value = '2026'; $('members-filters').oninput();
          results.yearRows = $('members-list').rows.length;
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
          results.sectionNavigation = memberTabs.length === 6 &&
            memberTabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length === 1;
          results.saveAvailable = !$('member-save').hidden;
          const givenName = form.elements['profile:givenName'];
          givenName.value = 'Bozza conservata';
          memberTabs[3].click();
          results.draftSurvivesNavigation = givenName.value === 'Bozza conservata' &&
            $('member-panel-profile').hidden && !$('member-panel-consents').hidden;
          $('member-section-next').click();
          results.sectionProgress = $('member-section-progress').textContent.includes('5 di 6');
          memberTabs[0].click();
          const dialogRect = $('member-dialog').getBoundingClientRect();
          results.dialogFits = dialogRect.left >= 0 && dialogRect.right <= innerWidth &&
            $('member-dialog').scrollWidth <= $('member-dialog').clientWidth;
          const saveRect = $('member-save').getBoundingClientRect();
          results.saveReachable = saveRect.bottom <= innerHeight && saveRect.height >= 44;
          results.branchLocked = form.elements.branch.disabled;
          results.prefilled = form.elements['extra:squadriglia'].value;
          results.history = $('member-censuses').textContent.includes('2026') && $('member-censuses').textContent.includes('Attivo');
          memberTabs[2].click();
          results.guardianParsed = $('member-guardians').children.length === 1 &&
            form.elements['guardian:0:taxCode'].value === 'ABCDEF80A01H501U' &&
            form.elements['guardian:0:email'].value === 'guardian@example.invalid' &&
            form.elements['guardian:0:givenName'].value === '';
          form.elements['guardian:0:givenName'].value = 'Responsabile';
          form.elements['guardian:0:surname'].value = 'Esempio';
          $('add-guardian').click();
          results.guardianAdd = $('member-guardians').children.length === 2;
          $('member-guardians').lastElementChild.querySelector('button').click();
          results.guardianRemove = $('member-guardians').children.length === 1;
          memberTabs[4].click();
          const specialtyGroup = [...$('member-education').querySelectorAll('.members-choice-field')]
            .find(group => group.querySelector('input[type=checkbox]').name === 'extra:specialita');
          specialtyGroup.querySelector('details').open = true;
          const checkAward = value => {
            const checkbox = [...specialtyGroup.querySelectorAll('input[type=checkbox]')].find(input => input.value === value);
            checkbox.click();
          };
          checkAward('Cuoco'); checkAward('Fotografo');
          const awardSearch = specialtyGroup.querySelector('input[type=search]');
          awardSearch.value = 'cuoco'; awardSearch.dispatchEvent(new Event('input'));
          results.awardSearch = [...specialtyGroup.querySelector('.members-choice-list').children].filter(label => !label.hidden).length === 1;
          results.awardFits = $('member-dialog').scrollWidth <= $('member-dialog').clientWidth;
          const badge = [...$('member-education').querySelectorAll('input[name="extra:brevetti"]')].find(input => input.value === 'Pioniere');
          badge.click();
          form.elements['extra:progressione'].value = 'No';
          form.elements['extra:ruolo'].value = 'Squadrigliere';
          form.elements['extra:tappa'].value = 'Tappa della scoperta';
          memberTabs[2].click();
          results.guardianDraft = form.elements['guardian:0:givenName'].value === 'Responsabile';
          form.elements['profile:phone'].value = '000123';
          memberTabs[1].click();
          form.elements['profile:email'].value = 'not-an-email';
          form.elements['profile:email'].setCustomValidity('Email non valida');
          form.requestSubmit();
          results.invalidContactsVisible = !$('member-panel-contacts').hidden && $('member-dialog').open;
          form.elements['profile:email'].value = 'test@example.invalid';
          form.elements['profile:email'].setCustomValidity('');
          memberTabs[0].click();
          form.elements['extra:squadriglia'].value = 'Falchi';
          form.requestSubmit(); await settle();
          results.saved = window.calls.find(call => call.method === 'PATCH').value;
          results.closedAfterSave = !$('member-dialog').open;
          $('members-list').querySelector('input[type=checkbox]').click();
          $('open-macro').click();
          const macro = $('macro-form');
          macro.elements.branch.value = 'E/G'; macro.elements.branch.onchange();
          macro.elements.key.value = 'squadriglia'; macro.elements.key.onchange();
          macro.elements.value.value = 'Volpi';
          macro.requestSubmit(); await settle();
          results.macro = window.calls.find(call => call.route === 'members/macro').value;
          $('members-list').querySelector('input[type=checkbox]').click();
          $('open-documents').click();
          results.safeDocument = !document.querySelector('#document-preview img');
          $('print-documents').click();
          results.printed = window.printed.includes('Volpi') && window.printed.includes('012345');
          $('open-macro').click();
          macro.elements.action.value = 'passage'; macro.elements.action.onchange();
          results.nextBranch = macro.elements.branch.value;
          macro.requestSubmit(); await settle();
          results.passage = window.calls.find(call => call.route === 'members/macro' && call.value.action === 'passage').value;
          results.pending = $('members-transfers').textContent.includes('E/G → R/S');
          results.notMoved = $('members-list').textContent.includes('E/G');
          $('members-transfers').querySelector('button').click(); await settle();
          results.cancelled = $('members-transfers').textContent.includes('Nessun passaggio');
          $('open-import').click();
          $('import-csv').value = 'synthetic csv';
          $('analyze-import').click(); await settle();
          results.preview = !$('confirm-import').disabled && $('import-preview').textContent.includes('Da verificare');
          $('confirm-import').click(); await settle();
          results.confirm = window.calls.find(call => call.route === 'members/import' && call.value.confirm).value;
          results.clearedCsv = $('import-csv').value === '';
          $('new-member').click();
          results.newEditableCode = !form.elements.code.readOnly;
          document.querySelector('[data-close=member-dialog]').click();
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
          src.includes("soci.js") ? `<script>${read("assets/js/soci.js")}</script>` :
          src.includes("section-nav.js") ? `<script>${read("assets/js/shared/section-nav.js")}</script>` : "")
      .replace("</head>", `<style>${["theme", "home", "nas", "soci", "section-nav"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`);
    for (const width of [320, 360, 375, 768, 1024, 1440]) {
      const file = path.join(directory, "fixture.html");
      const page = source.replace("</body>", `<script>${exercise}</script></body>`);
      fs.writeFileSync(file, `<!doctype html><body><script>
        const frame = document.createElement('iframe');
        frame.style.cssText = 'border:0;width:${width}px;height:1000px';
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
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      assert.equal(browser.status, 0, browser.stderr);
      const encoded = /<pre id="members-browser-result">([^<]+)<\/pre>/.exec(browser.stdout)?.[1];
      assert.ok(encoded, browser.stdout.slice(-4000));
      const results = JSON.parse(Buffer.from(encoded, "base64").toString());
      assert.equal(results.failure, undefined, JSON.stringify(results));
      assert.deepEqual(results.errors, []);
      assert.equal(results.width, width); assert.equal(results.fits, true);
      assert.equal(results.buttonLayout, true, JSON.stringify(results));
      assert.equal(results.dialogFits, true, JSON.stringify(results));
      for (const key of ["loaded", "safeName", "dialog", "history", "emptyText", "missingContact", "closedAfterSave", "safeDocument",
        "printed", "preview", "clearedCsv", "newEditableCode", "sectionNavigation", "saveAvailable", "draftSurvivesNavigation", "sectionProgress"])
        assert.equal(results[key], true, key + ": " + JSON.stringify(results));
      assert.equal(results.rows, 2);
      assert.equal(results.visibleCount, 2); assert.equal(results.withSuspended, 4); assert.equal(results.hiddenSelectionRemoved, true);
      assert.equal(results.branchLocked, true);
      assert.equal(results.branchCardFilters, true); assert.equal(results.summaryNoHint, true);
      assert.equal(results.branchRows, 1); assert.equal(results.yearRows, 1); assert.equal(results.fieldMatch, 1);
      assert.equal(results.birthRows, 1); assert.equal(results.birthGroup, true);
      assert.equal(results.prefilled, "Aquile");
      assert.equal(results.saved.profile.phone, "000123");
      assert.equal(results.saved.values.squadriglia, "Falchi");
      for (const key of ["guardianParsed", "guardianAdd", "guardianRemove", "guardianDraft", "awardSearch", "awardFits"])
        assert.equal(results[key], true, key + ": " + JSON.stringify(results));
      assert.deepEqual(results.saved.values.specialita, ["Cuoco", "Fotografo"]);
      assert.deepEqual(results.saved.values.brevetti, ["Pioniere"]);
      assert.equal(results.saved.values.progressione, "No");
      assert.equal(results.saved.values.ruolo, "Squadrigliere");
      assert.equal(results.saved.values.tappa, "Tappa della scoperta");
      assert.equal(results.saved.profile.guardianContacts[0].givenName, "Responsabile");
      assert.equal(results.invalidContactsVisible, true);
      assert.equal(results.saveReachable, true);
      assert.equal(results.saved.revision, 1);
      assert.equal(results.macro.value, "Volpi"); assert.equal(results.macro.members[0].revision, 2);
      assert.equal(results.nextBranch, "R/S"); assert.equal(results.passage.branch, "R/S");
      assert.equal(results.pending, true, JSON.stringify(results)); assert.equal(results.notMoved, true, JSON.stringify(results)); assert.equal(results.cancelled, true, JSON.stringify(results));
      assert.equal(results.confirm.version, "preview-token"); assert.equal(results.confirm.csv, "synthetic csv");
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
