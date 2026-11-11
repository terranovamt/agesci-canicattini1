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

test("staff UI hides admin tools, constrains fields and exposes destination confirmation", { skip: !chrome }, () => {
  const directory = fs.mkdtempSync(path.join(root, ".members-staff-browser-"));
  try {
    const base = { currentYear: "2027", group: {}, units: [], lc: { environment: "Branco", revision: 1 }, templates: [{ id: 1, title: "Internal", body: "{{nome}}" }],
      fields: M.defaultFields.filter(field => field.branch === "E/G") };
    const scenarios = {
      populated: { ...base,
        members: [{ id: 1, name: "Example member", code: "012345", branch: "E/G", revision: 1,
          profile: { givenName: "Example", surname: "Member", birthDate: "2012-01-01" }, censuses: [], values: {} }],
        visibility: { branch: "E/G", total: 1, excludedPendingCoca: 0, excludedLongSuspended: 0 },
        transfers: [{ id: 1, personId: 2, name: "Incoming", code: "012346", birthYear: "2014",
          source: "L/C", target: "E/G", revision: 1, canConfirm: true, canCancel: false }] },
      // The server already omits pending Co.Ca. adults: only their count reaches the browser.
      zeroPending: { ...base, members: [], transfers: [],
        visibility: { branch: "E/G", total: 2, excludedPendingCoca: 2, excludedLongSuspended: 0 } },
      zeroMixed: { ...base,
        members: [{ id: 5, name: "Suspended member", code: "012350", branch: "E/G", revision: 1,
          profile: { givenName: "Suspended", surname: "Member", birthDate: "2011-01-01" },
          censuses: [{ year: "2027", statusCode: "D", status: "Sospeso da oltre un anno" }], values: {} }],
        visibility: { branch: "E/G", total: 3, excludedPendingCoca: 2, excludedLongSuspended: 1 },
        transfers: [{ id: 7, personId: 8, name: "Incoming zero", code: "012358", birthYear: "2015",
          source: "L/C", target: "E/G", revision: 3, canConfirm: true, canCancel: false },
        { id: 9, personId: 10, name: "Awaiting other leader", code: "012360", birthYear: "2015",
          source: "L/C", target: "E/G", revision: 1, canConfirm: false, canCancel: false }] },
    };
    const mock = `
      window.NAS = {user:{admin:false,serviceBranch:'E/G'}};
      window.confirmations = [];
      window.confirm = text => { confirmations.push(text); return true; };
      window.calls = [];
      window.errors = [];
      addEventListener('error', event => errors.push(event.message));
      addEventListener('unhandledrejection', event => errors.push(event.reason.message));
      const scenarios = ${JSON.stringify(scenarios)};
      window.useScenario = name => { window.snapshot = structuredClone(scenarios[name]); };
      useScenario('populated');
      let nextTransfer = 100;
      window.ACCESSO = {request:async(route,method='GET',value) => {
        calls.push(structuredClone({route,method,value}));
        const snapshot = window.snapshot;
        if(route === 'members/macro') {
          if(value.action !== 'passage' || Object.hasOwn(value, 'branch')) throw new Error('Macro non valida');
          for(const selected of value.members) {
            const member = snapshot.members.find(member => member.id === selected.id);
            const target = window.SOCI_MODEL.nextBranch(member.branch);
            if(!target || member.revision !== selected.revision) throw new Error('Passaggio non valido');
            snapshot.transfers.push({id:nextTransfer++,personId:member.id,name:member.name,code:member.code,birthYear:'2012',
              source:member.branch,target,revision:1,canConfirm:false,canCancel:true});
          }
        } else if(route.startsWith('members/transfers/')) {
          const transfer = snapshot.transfers.find(transfer => transfer.id === Number(route.split('/')[2]));
          if(!transfer?.canConfirm || transfer.revision !== value.revision) throw new Error('Conferma non consentita');
          snapshot.transfers = snapshot.transfers.filter(item => item !== transfer);
          if(value.action === 'confirm') {
            snapshot.members.push({id:transfer.personId,name:transfer.name,code:transfer.code,branch:transfer.target,revision:2,
              profile:{givenName:transfer.name,birthDate:transfer.birthYear + '-01-01'},censuses:[],values:{}});
            snapshot.visibility.total++;
          }
        } else if(route !== 'members' || method !== 'GET') throw new Error('Rotta inattesa ' + route);
        return structuredClone(snapshot);
      }};
    `;
    const exercise = `
      (async () => {
        const $ = id => document.getElementById(id);
        const wait = () => new Promise(resolve => setTimeout(resolve,30));
        const tab = panel => document.querySelector('[data-section-target="' + panel + '"]');
        const showing = panel => !$(panel).hidden && tab(panel).getAttribute('aria-pressed') === 'true';
        const panelFits = panel => $(panel).scrollWidth <= $(panel).clientWidth &&
          [...$(panel).querySelectorAll('button')].filter(button => button.getClientRects().length).every(button => {
            const rect = button.getBoundingClientRect();
            return rect.height >= 44 && rect.left >= -1 && rect.right <= innerWidth + 1;
          });
        const transferButton = label => [...$('members-transfers').querySelectorAll('button')].find(button => button.textContent === label);
        const result = {};
        try {
          await wait();
          result.width = innerWidth;
          result.height = innerHeight;
          result.loaded = !$('members-app').hidden && showing('members-search-panel') && $('members-transfer-panel').hidden;
          result.branchCardColor = getComputedStyle($('members-summary').querySelector('button')).getPropertyValue('--branch-color').trim();
          result.branchCardCount = $('members-summary').querySelector('strong').textContent;
          result.visibleMemberRows = $('members-list').rows.length;
          result.hidden = ['members-access-link','new-member','open-import','template-form'].every(id => getComputedStyle($(id)).display === 'none');
          result.scope = [...$('field-form').elements.branch.options].map(option => option.value);
          result.branchSelectorHidden = $('units-branch').closest('label').hidden &&
            $('units-branch').value === 'E/G';
          result.selectionInitiallyHidden = $('members-selection').hidden;
          result.populatedNote = $('members-diagnostics').hidden && !$('members-visibility-note').checkVisibility() &&
            $('members-visibility-note').textContent.includes('E/G: 1 soci assegnati alla branca.') &&
            !$('members-visibility-note').textContent.includes('esclusi') && !$('members-visibility-note').textContent.includes('sospesi');
          result.incomingCta = !$('members-incoming').hidden && $('members-incoming').textContent === '1 passaggi da accettare o rifiutare →' &&
            !$('transfers-tab').hidden && $('transfers-tab').textContent === 'Passaggi · 1';
          tab('members-transfer-panel').click();
          result.transfersShown = showing('members-transfer-panel') && $('members-search-panel').hidden;
          result.transfersFit = panelFits('members-transfer-panel');
          result.confirmVisible = !!transferButton('Conferma ingresso') && transferButton('Conferma ingresso').getClientRects().length > 0;
          transferButton('Conferma ingresso').focus();
          transferButton('Conferma ingresso').click(); await wait();
          result.approval = calls.find(call => call.route === 'members/transfers/1').value;
          result.approvalCleared = $('members-incoming').hidden && $('transfers-tab').textContent === 'Passaggi' &&
            $('transfers-tab').hidden && showing('members-search-panel') && $('members-transfer-panel').hidden;
          tab('members-search-panel').click();
          result.searchShown = showing('members-search-panel') && $('members-transfer-panel').hidden;
          [...document.querySelectorAll('.member-name')].find(button => button.textContent === 'Example member').click();
          result.branchLocked = $('member-form').elements.branch.disabled;
          result.tabsFit = [...$('member-section-nav').querySelectorAll('button')].every(button => {
            const rect = button.getBoundingClientRect();
            return rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth;
          });
          result.assignmentReadOnly = !$('member-form').elements['extra:ruolo'] &&
            !$('member-form').elements['extra:squadriglia'] && $('member-assignment').textContent.includes('Squadriglie');
          $('member-tab-education').click();
          result.educationOrder = [...$('member-education').children].map(element => element.dataset.educationKey || element.id);
          const promise = $('member-form').elements['extra:promessa'].getBoundingClientRect();
          const year = $('member-form').elements['extra:anno'].getBoundingClientRect();
          result.educationPaired = innerWidth <= 760
            ? promise.bottom <= year.top
            : Math.abs(promise.top - year.top) < 2 && promise.right <= year.left;
          document.querySelector('[data-close=member-dialog]').click();
          [...$('members-list').querySelectorAll('input[type=checkbox]')]
            .find(input => input.getAttribute('aria-label') === 'Seleziona Example member').click();
          result.selectionVisible = !$('members-selection').hidden && $('open-macro').textContent === 'Proponi passaggio E/G → R/S';
          result.route = $('open-macro').textContent.slice('Proponi passaggio '.length);
          result.noEducationalInput = !$('macro-value') && !$('macro-field-label') && $('macro-error').hidden;
          result.proposeEnabled = !$('open-macro').disabled;
          $('open-macro').click(); await wait();
          result.proposal = calls.find(call => call.route === 'members/macro').value;
          result.macroClosed = $('members-selection').hidden;
          result.outgoingPending = !$('transfers-tab').hidden && $('transfers-tab').textContent === 'Passaggi · 1' && $('members-incoming').hidden &&
            $('members-transfers').textContent.includes('E/G → R/S') && !transferButton('Conferma ingresso');
          result.fits = document.documentElement.scrollWidth <= innerWidth;

          const callsBeforeZero = calls.length;
          useScenario('zeroPending');
          $('reload-members').click(); await wait();
          const note = () => $('members-visibility-note').textContent;
          result.zeroPending = {
            rows: $('members-list').rows.length, empty: $('members-list').textContent.includes('Nessun socio corrisponde ai filtri.'),
            count: $('members-count').textContent, card: $('members-summary').querySelector('strong').textContent,
            noteVisible: !$('members-visibility-note').hidden && $('members-visibility-note').checkVisibility(),
            note: note(), incomingHidden: $('members-incoming').hidden,
          };
          useScenario('zeroMixed');
          $('reload-members').click(); await wait();
          result.zeroMixed = {
            rows: $('members-list').rows.length, empty: $('members-list').textContent.includes('Nessun socio corrisponde ai filtri.'),
            hiddenSuspended: !$('members-list').textContent.includes('Suspended member'),
            count: $('members-count').textContent, card: $('members-summary').querySelector('strong').textContent,
            note: note(), numbers: [...note().matchAll(/\\d+/g)].map(match => Number(match[0])),
            filterBranches: [...$('members-filters').elements.branch.options].map(option => option.value),
          };
          const filters = $('members-filters').elements;
          filters.showSuspended.checked = true; $('members-filters').oninput();
          result.zeroMixed.withSuspended = { rows: $('members-list').rows.length, visibleSuspended: $('members-list').textContent.includes('Suspended member'),
            card: $('members-summary').querySelector('strong').textContent, note: note() };
          filters.showSuspended.checked = false; $('members-filters').oninput();
          result.zeroMixed.restored = $('members-list').textContent.includes('Nessun socio') && note().includes('1 sospesi da oltre un anno nascosti');
          result.zeroMixed.onlyMembersReads = calls.slice(callsBeforeZero).every(call => call.route === 'members' && call.method === 'GET');
          result.zeroMixed.tab = $('transfers-tab').textContent;
          result.zeroMixed.cta = $('members-incoming').hidden ? '' : $('members-incoming').textContent;
          const ctaRect = $('members-incoming').getBoundingClientRect();
          result.zeroMixed.ctaFits = ctaRect.height >= 44 && ctaRect.left >= -1 && ctaRect.right <= innerWidth + 1;
          $('members-incoming').click();
          result.zeroMixed.ctaOpensTab = showing('members-transfer-panel') && $('members-search-panel').hidden;
          result.zeroMixed.transfersFit = panelFits('members-transfer-panel');
          result.zeroMixed.confirmButtons = [...$('members-transfers').querySelectorAll('button')].filter(button => button.textContent === 'Conferma ingresso').length;
          result.zeroMixed.waitingNote = $('members-transfers').textContent.includes('In attesa di un altro capo della destinazione');
          const confirmationsBefore = confirmations.length;
          transferButton('Conferma ingresso').click(); await wait();
          result.zeroMixed.confirmPrompted = confirmations.length === confirmationsBefore + 1 && confirmations.at(-1).includes('Incoming zero');
          result.zeroMixed.patch = calls.filter(call => call.method === 'PATCH').at(-1);
          result.zeroMixed.reloadedAfterPatch = calls.at(-1).route === 'members' && calls.at(-1).method === 'GET';
          $('reload-members').click(); await wait();
          result.zeroMixed.afterReload = {
            cta: $('members-incoming').hidden, tab: $('transfers-tab').textContent,
            remaining: $('members-transfers').textContent.includes('Awaiting other leader') && !$('members-transfers').textContent.includes('Incoming zero') &&
              !transferButton('Conferma ingresso'),
          };
          tab('members-search-panel').click();
          result.zeroMixed.afterReload.rows = [...$('members-list').querySelectorAll('.member-name')].map(button => button.textContent);
          result.zeroMixed.afterReload.note = note();
          result.fitsAfterZero = document.documentElement.scrollWidth <= innerWidth;
          result.errors = errors;
        } catch(error) { result.error = error.message; result.errors = errors; }
        const output = document.createElement('pre'); output.id = 'staff-result';
        output.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(result)))); document.body.append(output);
      })();
    `;
    const page = renderHtml(read("area-riservata/soci.html"), "area-riservata/soci.html")
      .replace(/<link\b[^>]*>/g, "")
      .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
        src.includes("soci-model.js") ? `<script>${read("assets/js/soci-model.js")}</script>` :
          src.includes("soci-units.js") ? `<script>${read("assets/js/soci-units.js")}</script>` :
          src.includes("soci.js") ? `<script>${read("assets/js/soci.js")}</script>` :
          src.includes("section-nav.js") ? `<script>${read("assets/js/shared/section-nav.js")}</script>` : "")
      .replace("</head>", `<style>${["theme", "home", "nas", "soci", "section-nav"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`)
      .replace("</body>", `<script>${exercise}</script></body>`);
    const file = path.join(directory, "fixture.html");
    for (const [width, height] of [[1920, 1080], [1366, 768], [820, 1180], [390, 844], [1180, 820], [844, 390]]) {
      fs.writeFileSync(file, `<!doctype html><body><script>
        const frame = document.createElement('iframe');
        frame.style.cssText = 'border:0;width:${width}px;height:${height}px'; document.body.append(frame);
        frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
        const timer = setInterval(() => {
          const result = frame.contentDocument?.getElementById('staff-result');
          if(result) {const copy=document.createElement('pre');copy.id=result.id;copy.textContent=result.textContent;document.body.append(copy);clearInterval(timer);}
        },50);
      </script>`);
      const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, "profile-" + width),
        "--window-size=" + width + ",1000", "--virtual-time-budget=6000", "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, TMPDIR: root } });
      assert.equal(browser.status, 0, browser.stderr);
      const encoded = /<pre id="staff-result">([^<]+)<\/pre>/.exec(browser.stdout)?.[1];
      assert.ok(encoded, browser.stdout.slice(-2000));
      const measured = JSON.parse(Buffer.from(encoded, "base64").toString());
      const detail = key => key + " at " + width + ": " + JSON.stringify(measured);
      assert.equal(measured.error, undefined, JSON.stringify(measured));
      assert.deepEqual(measured.errors, []);
      assert.equal(measured.width, width);
      assert.equal(measured.height, height);
      assert.equal(measured.branchCardColor, M.branchColors["E/G"]);
      assert.equal(measured.branchCardCount, "1");
      assert.equal(measured.visibleMemberRows, 1);
      for (const key of ["loaded", "hidden", "populatedNote", "incomingCta", "transfersShown", "transfersFit", "confirmVisible", "approvalCleared",
        "searchShown", "branchLocked", "noEducationalInput", "proposeEnabled", "macroClosed", "outgoingPending", "fits", "fitsAfterZero",
        "selectionInitiallyHidden", "selectionVisible", "tabsFit", "branchSelectorHidden"])
        assert.equal(measured[key], true, detail(key));
      assert.deepEqual(measured.scope, ["E/G"]);
      assert.equal(measured.assignmentReadOnly, true);
      assert.deepEqual(measured.educationOrder, ['promessa', 'anno', 'tappa', 'member-assignment', 'specialita', 'brevetti']);
      assert.equal(measured.educationPaired, true, detail('educationPaired'));
      assert.deepEqual(measured.approval, { action: "confirm", revision: 1 });
      assert.equal(measured.route, "E/G → R/S");
      assert.deepEqual(measured.proposal, { action: "passage", members: [{ id: 1, revision: 1 }] });

      const pending = measured.zeroPending;
      assert.equal(pending.rows, 1, detail("zeroPending"));
      assert.equal(pending.empty, true, detail("zeroPending"));
      assert.equal(pending.count, "0 risultati · 0 selezionati");
      assert.equal(pending.card, "0");
      assert.equal(pending.noteVisible, false, detail("zeroPending"));
      assert.equal(pending.incomingHidden, true, detail("zeroPending"));
      assert.equal(pending.note, "E/G: 2 soci assegnati alla branca. 2 esclusi dalla vista capo: FoCa valorizzato e ingresso Co.Ca. assente o No. " +
        "L’amministratore puo verificarne le schede. I passaggi in ingresso non sono ancora soci della branca: compaiono dopo la conferma.");

      const zero = measured.zeroMixed;
      assert.equal(zero.rows, 1, detail("zeroMixed"));
      for (const key of ["empty", "hiddenSuspended", "restored", "onlyMembersReads", "ctaFits", "ctaOpensTab", "transfersFit", "waitingNote", "confirmPrompted", "reloadedAfterPatch"])
        assert.equal(zero[key], true, detail("zeroMixed." + key));
      assert.equal(zero.count, "0 risultati · 0 selezionati");
      assert.equal(zero.card, "0");
      assert.deepEqual(zero.filterBranches, ["", "E/G"]);
      assert.match(zero.note, /^E\/G: 3 soci assegnati alla branca\. 2 esclusi dalla vista capo: FoCa valorizzato e ingresso Co\.Ca\. assente o No\./);
      assert.match(zero.note, /1 sospesi da oltre un anno nascosti; puoi includerli dalla ricerca avanzata\./);
      assert.match(zero.note, /I passaggi in ingresso non sono ancora soci della branca: compaiono dopo la conferma\.$/);
      const [total, excludedPending, excludedSuspended] = zero.numbers;
      assert.deepEqual(zero.numbers, [total, excludedPending, excludedSuspended]);
      assert.equal(total, excludedPending + excludedSuspended + 0, "counts in the note must explain the empty list");
      assert.deepEqual(zero.withSuspended.rows, 1);
      assert.equal(zero.withSuspended.visibleSuspended, true);
      assert.equal(zero.withSuspended.card, "1");
      assert.equal(zero.withSuspended.note.includes("sospesi"), false, detail("withSuspended"));
      assert.equal(zero.withSuspended.note.includes("2 esclusi dalla vista capo"), true, detail("withSuspended"));
      assert.equal(zero.tab, "Passaggi · 2");
      assert.equal(zero.cta, "1 passaggi da accettare o rifiutare →");
      assert.equal(zero.confirmButtons, 1);
      assert.deepEqual(zero.patch, { route: "members/transfers/7", method: "PATCH", value: { action: "confirm", revision: 3 } });
      assert.deepEqual(zero.afterReload.cta, true);
      assert.equal(zero.afterReload.tab, "Passaggi · 1");
      assert.equal(zero.afterReload.remaining, true, detail("afterReload"));
      assert.deepEqual(zero.afterReload.rows, ["Incoming zero"]);
      assert.match(zero.afterReload.note, /^E\/G: 4 soci assegnati alla branca\./);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
