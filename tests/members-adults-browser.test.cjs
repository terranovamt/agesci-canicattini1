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

test("adult labels and classification preserve the internal AGESCI branch", () => {
  assert.equal(M.branchLabel("Adulti"), "Co.Ca.");
  assert.equal(M.branchLabel("Branca Adulti"), "Co.Ca.");
  assert.equal(M.branchLabel("Adulti", true), "Co.Ca. · Comunità Capi");
  assert.ok(M.branches.includes("Adulti"));
  assert.ok(!M.branches.includes("Co.Ca."));
  for (const branch of ["L/C", "E/G", "R/S"]) {
    assert.equal(M.branchLabel(branch), branch);
    assert.equal(M.isAdult({ kind: "capo", branch }), true);
    assert.equal(M.isAdult({ kind: "ragazzo", branch, serviceBranch: branch, values: { [branch]: { ruolo: "Capo squadriglia" } } }), false);
  }
  assert.equal(M.isAdult({ branch: "Adulti", kind: "ragazzo" }), true);
  assert.equal(M.isAdult({ branch: "Adulti" }), true);
  assert.equal(M.isAdult(null), false);
  const parsed = M.parseImport('ANNO SCOUT,CODICE SOCIO,NOME,COGNOME,BRANCA,ORDINALE\n2026,012345,Persona,Esempio,Branca Adulti,R2053');
  assert.equal(parsed.members[0].branch, "Adulti");
  assert.equal(parsed.members[0].census.branch, "Adulti");
});

test("adult sheets skip youth sections, navigate accessibly and preserve saved data", { skip: !chrome }, () => {
  const directory = fs.mkdtempSync(path.join(root, ".members-adults-browser-"));
  try {
    const members = ["Adulti", "L/C", "E/G", "R/S", "Adulti", "Adulti", "E/G"].map((branch, index) => ({
      id: index + 1, code: "01234" + index, name: "Persona " + (index + 1),
      kind: index === 4 || index === 6 ? "ragazzo" : "capo", branch,
      revision: index === 5 ? 0 : 1,
      profile: index === 5 ? {} : {
        givenName: "Persona", surname: String(index + 1), email: "test@example.invalid",
        guardianType: "Legacy", guardians: "Testo originale conservato",
        guardianContacts: [{ givenName: "Nome", surname: "Verificato", fullName: "Nome originale",
          email: index === 6 ? "guardian@example.invalid" : "legacy-email", birthDate: "1980-01-01" }],
      },
      censuses: [{ year: "2026", branch, status: "Attivo" }],
      values: index === 5 ? {} : { [branch]: branch === "Adulti"
        ? { servizio: "Servizio precedente", formazione: "Formazione precedente" }
        : branch === "L/C" ? { pista: "Nota precedente", specialita: ["Voce precedente"] }
          : branch === "E/G" ? { ruolo: "Capo squadriglia", specialita: ["Voce precedente"] }
            : { servizio: "Servizio precedente", comunita: "Clan" },
        ...(branch !== "Adulti" ? { Adulti: { formazione: "Storico da conservare" } } : {}) },
    }));
    const snapshot = { members, fields: M.defaultFields, units: [], lc: { environment: "Branco", revision: 1 },
      templates: [{ id: 1, title: "Scheda", body: "{{branca}}" }], transfers: [], group: {}, currentYear: "2026" };
    const mock = `
      window.NAS = { user: { admin: true } };
      window.confirm = () => true;
      window.calls = [];
      window.errors = [];
      addEventListener('error', event => errors.push(event.message));
      addEventListener('unhandledrejection', event => errors.push(event.reason.message));
      const snapshot = ${JSON.stringify(snapshot)};
      window.ACCESSO = {request: async(route, method='GET', value) => {
        calls.push(structuredClone({route, method, value}));
        if(method === 'PATCH') {
          const member = snapshot.members.find(member => route === 'members/' + member.id);
          member.profile = value.profile;
          member.values[value.branch] = value.values;
          member.revision++;
        }
        return structuredClone(snapshot);
      }};
      URL.createObjectURL = blob => { window.exported = blob.text(); return 'blob:fixture'; };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = () => {};
    `;
    const exercise = `
      (async () => {
        const $ = id => document.getElementById(id), result = {};
        const wait = () => new Promise(resolve => setTimeout(resolve, 30));
        const tabs = () => [...$('member-section-nav').querySelectorAll('[role=tab]')].filter(tab => !tab.hidden);
        const sections = () => tabs().map(tab => tab.id.replace('member-tab-', ''));
        const key = (tab, key) => tab.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        const open = id => [...document.querySelectorAll('.member-name')].find(button => button.textContent === 'Persona ' + id).click();
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        try {
          await wait();
          const filter = $('members-filters').elements.branch;
          assert([...filter.options].find(option => option.value === 'Adulti').textContent === 'Co.Ca.', 'branch filter label');
          assert($('field-form').elements.branch.querySelector('[value=Adulti]').textContent === 'Co.Ca.', 'custom field label');
          assert($('members-filters').elements.field.querySelector('[value="Adulti:formazione"]').textContent.startsWith('Co.Ca.'), 'educational filter label');
          const card = [...$('members-summary').children].find(card => card.dataset.branch === 'Adulti');
          assert(card.title === 'Co.Ca. · Comunità Capi' && card.firstChild.textContent === 'Co.Ca.', 'summary label');
          card.click();
          assert(filter.value === 'Adulti' && document.activeElement.dataset.branch === 'Adulti', 'summary focus');
          assert($('members-list').textContent.includes('Co.Ca.') && !$('members-list').textContent.includes('Adulti'), 'list labels');
          assert(document.querySelector('[data-filter-key=branch]').textContent.includes('Co.Ca.'), 'filter chip');
          document.activeElement.click();
          assert(filter.value === '' && document.activeElement.dataset.branch === 'Adulti', 'summary toggle focus');
          for(let id = 1; id <= 6; id++) {
            open(id);
            assert(JSON.stringify(sections()) === JSON.stringify(['profile','contacts','censuses']), 'adult sections ' + id);
            assert($('member-section-progress').textContent.startsWith('Sezione 1 di 3'), 'adult progress');
            for(const section of ['guardians','education']) {
              assert($('member-panel-' + section).hidden && $('member-tab-' + section).tabIndex === -1, 'hidden section');
              assert([...$('member-panel-' + section).querySelectorAll('input,select,textarea,button')].every(control => control.disabled), 'disabled hidden inputs');
            }
            assert(tabs().filter(tab => tab.tabIndex === 0).length === 1, 'single roving focus');
            $('member-section-next').click();
            assert(document.activeElement.id === 'member-tab-contacts', 'next focus');
            key(document.activeElement, 'ArrowRight');
            assert(document.activeElement.id === 'member-tab-censuses' && $('member-section-next').hidden, 'skip hidden tabs');
            key(document.activeElement, 'ArrowRight');
            assert(document.activeElement.id === 'member-tab-profile', 'wrap right');
            key(document.activeElement, 'ArrowLeft');
            assert(document.activeElement.id === 'member-tab-censuses', 'wrap left');
            key(document.activeElement, 'Home');
            assert(document.activeElement.id === 'member-tab-profile' && $('member-section-back').disabled, 'Home focus');
            key(document.activeElement, 'End');
            assert(document.activeElement.id === 'member-tab-censuses', 'End focus');
            $('member-section-back').click();
            assert(document.activeElement.id === 'member-tab-contacts', 'back skips hidden tabs');
            if(id === 1) assert($('member-censuses').textContent.includes('Co.Ca.') && !$('member-censuses').textContent.includes('Adulti'), 'census label');
            $('member-form').elements['profile:email'].value = 'updated@example.invalid';
            assert($('member-form').checkValidity(), 'adult hidden inputs must not block save');
            $('member-form').requestSubmit(); await wait();
            assert(!$('member-dialog').open, 'adult saved ' + id);
            open(id);
            assert($('member-form').elements['profile:email'].value === 'updated@example.invalid', 'persisted contact');
            document.querySelector('[data-close=member-dialog]').click();
          }
          open(7);
          assert(JSON.stringify(sections()) === JSON.stringify(['profile','contacts','guardians','education','censuses']), 'youth sections restored');
          assert($('member-section-progress').textContent.startsWith('Sezione 1 di 5'), 'youth progress');
          key($('member-tab-contacts'), 'ArrowRight');
          assert(document.activeElement.id === 'member-tab-guardians' && !$('member-panel-guardians').hidden, 'youth guardian focus');
          assert(!$('member-form').elements['guardian:0:fullName'].disabled, 'youth guardians editable');
          key(document.activeElement, 'ArrowRight');
          assert(document.activeElement.id === 'member-tab-education' && !$('member-panel-education').hidden, 'youth education focus');
          assert(!$('member-form').elements['extra:tappa'].disabled, 'youth education editable');
          $('member-form').requestSubmit(); await wait();
          $('new-member').click();
          const form = $('member-form');
          form.elements.branch.value = 'Adulti'; form.elements.branch.onchange();
          assert(sections().length === 3 && form.elements.branch.selectedOptions[0].textContent === 'Co.Ca.', 'new adult sections');
          form.elements.branch.value = 'L/C'; form.elements.branch.onchange();
          assert(sections().length === 5 && !form.elements['extra:anno'].disabled, 'new youth sections');
          document.querySelector('[data-close=member-dialog]').click();
          $('select-results').click(); $('open-macro').click();
          assert($('macro-form').elements.branch.querySelector('[value=Adulti]').textContent === 'Co.Ca.', 'macro label');
          document.querySelector('[data-close=macro-dialog]').click();
          $('open-documents').click();
          assert($('document-preview').textContent.includes('Co.Ca.') && !$('document-preview').textContent.includes('Adulti'), 'document label');
          document.querySelector('[data-close=documents-dialog]').click();
          $('export-members').click();
          const csv = await window.exported;
          assert(csv.includes('Co.Ca.') && !csv.includes('Adulti'), 'export labels');
          result.saves = calls.filter(call => call.method === 'PATCH');
          result.persisted = structuredClone(snapshot.members);
          result.errors = errors;
        } catch(error) { result.failure = error.message; }
        const output = document.createElement('pre'); output.id = 'adults-result';
        output.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(result)))); document.body.append(output);
      })();
    `;
    const page = renderHtml(read("area-riservata/soci.html"), "area-riservata/soci.html")
      .replace(/<link\b[^>]*>/g, "")
      .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
        src.includes("soci-model.js") ? `<script>${read("assets/js/soci-model.js")}</script>` :
          src.includes("soci-units.js") ? `<script>${read("assets/js/soci-units.js")}</script>` :
          src.includes("soci.js") ? `<script>${read("assets/js/soci.js")}</script>` : "")
      .replace("</head>", `<style>${["theme", "home", "nas", "soci"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`)
      .replace("</body>", `<script>${exercise}</script></body>`);
    const file = path.join(directory, "fixture.html");
    fs.writeFileSync(file, page);
    for (const width of [1366, 390]) {
      const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, "profile-" + width),
        "--window-size=" + width + ",844", "--virtual-time-budget=6000", "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, TMPDIR: root } });
      assert.equal(browser.status, 0, browser.stderr);
      const encoded = /<pre id="adults-result">([^<]+)<\/pre>/.exec(browser.stdout)?.[1];
      assert.ok(encoded, browser.stdout.slice(-2000));
      const result = JSON.parse(Buffer.from(encoded, "base64").toString());
      assert.equal(result.failure, undefined, JSON.stringify(result));
      assert.deepEqual(result.errors, []);
      assert.equal(result.saves.length, 7);
      for (const [index, call] of result.saves.entries()) {
        const original = members[index];
        assert.equal(call.value.branch, original.branch);
        assert.equal(call.value.revision, original.revision);
        if (index < 6) {
          assert.equal(call.value.profile.email, "updated@example.invalid");
          for (const key of ["guardianType", "guardians", "guardianContacts"])
            assert.deepEqual(call.value.profile[key], original.profile[key], key);
          assert.deepEqual(call.value.values, original.values[original.branch] || {});
          for (const [branch, values] of Object.entries(original.values))
            assert.deepEqual(result.persisted[index].values[branch], values, 'persisted ' + branch);
        } else {
          assert.equal(call.value.profile.guardianContacts[0].fullName, "Nome Verificato");
          assert.equal(call.value.values.ruolo, "Capo squadriglia");
        }
      }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
