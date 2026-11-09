const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { renderHtml } = require("../tools/site-layout.cjs");
const M = require("../assets/js/soci-model.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);

test("unit board supports ordered roles, dragging, accessible moves, hide/restore, symbols and LC environments at five widths", { skip: !chrome }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "member-units-browser-"));
  try {
    const snapshot = {
      currentYear: "2026", group: {}, templates: [], transfers: [], fields: M.defaultFields,
      lc: { environment: "Branco", revision: 1 },
      units: [
        { id: 1, name: "Aquile", branch: "E/G", color: "#cc3038", color2: "#ffffff", emblem: "", revision: 1, hidden: false },
        { id: 2, name: "Falchi", branch: "E/G", color: "#cc3038", color2: "#ffffff", emblem: "", revision: 1, hidden: false },
        { id: 3, name: "Nascosti", branch: "E/G", color: "#cc3038", color2: "#ffffff", emblem: "", revision: 1, hidden: true },
      ],
      members: Array.from({ length: 7 }, (_, index) => {
        const id = index + 1, branch = id <= 2 ? "L/C" : "E/G";
        const values = id === 3 ? { squadriglia: "Aquile", ruolo: "Capo squadriglia" }
          : id === 5 ? { squadriglia: "Aquile", ruolo: "Ruolo storico" }
            : id === 6 ? { squadriglia: "Nascosti", ruolo: "Piede tenero" } : {};
        return { id, code: "01234" + id, name: "Persona " + id, kind: "ragazzo", branch, revision: 1,
          profile: { givenName: "Persona", surname: String(id) }, values: { [branch]: values },
          censuses: [{ year: "2026", statusCode: id === 7 ? "D" : "A" }] };
      }),
    };
    const mock = `
      window.errors = []; addEventListener('error', event => errors.push(event.message));
      addEventListener('unhandledrejection', event => errors.push(event.reason.message));
      window.confirm = () => true; window.NAS = { user: { admin: true } };
      window.snapshot = ${JSON.stringify(snapshot)};
      window.ACCESSO = {request: async (route, method = 'GET', value) => {
        const M = window.SOCI_MODEL;
        if (route === 'members/units' && method === 'POST') {
          let unit = snapshot.units.find(unit => unit.branch === value.branch && M.unitKey(unit.name) === M.unitKey(value.name));
          if (unit && !unit.hidden) throw new Error('Gruppo gia attivo');
          if (!unit) { unit = {id: 10, branch: value.branch, name: value.name, color: value.color,
            color2: value.color2, emblem: value.emblem, revision: 1, hidden: false}; snapshot.units.push(unit); }
          else {unit.hidden = false; unit.revision++;}
          return {unit: structuredClone(unit)};
        }
        if (route === 'members/units/assign') {
          const member = snapshot.members.find(member => member.id === value.memberId);
          const unit = snapshot.units.find(unit => unit.id === value.unitId);
          if (unit && M.unitRoles(unit.branch).slice(0, 2).includes(value.role) &&
            snapshot.members.some(other => other.id !== member.id && other.values[member.branch]?.[M.unitField(member.branch)] === unit.name &&
              other.values[member.branch].ruolo === value.role)) throw new Error('Questo posto e occupato');
          member.values[member.branch] ||= {};
          member.values[member.branch][M.unitField(member.branch)] = unit?.name || '';
          member.values[member.branch].ruolo = unit ? value.role : ''; member.revision++;
        } else if (route.startsWith('members/units/') && method === 'PATCH') {
          const unit = snapshot.units.find(unit => unit.id === Number(route.split('/')[2]));
          Object.assign(unit, value, {revision: unit.revision + 1});
        } else if (route === 'members/lc-environment') {
          for (const member of snapshot.members.filter(member => member.branch === 'L/C')) {
            const values = member.values['L/C'];
            if (values.ruolo === 'Cucciolo') values.ruolo = 'Cocci';
            const index = M.lcMoments.Branco.indexOf(values.progressione);
            if (index >= 0) values.progressione = M.lcMoments.Cerchio[index];
            member.revision++;
          }
          snapshot.lc.environment = value.environment; snapshot.lc.revision++;
          snapshot.fields = snapshot.fields.map(field => field.branch !== 'L/C' ? field :
            field.key === 'ruolo' ? {...field, options: M.unitRoles('L/C', value.environment)} :
            field.key === 'progressione' ? {...field, options: M.lcMoments[value.environment]} : field);
        }
        return structuredClone(snapshot);
      }};
    `;
    const exercise = `
      (async () => {
        const results = {}, $ = id => document.getElementById(id), M = window.SOCI_MODEL;
        const settle = () => new Promise(resolve => setTimeout(resolve, 40));
        const check = (condition, name) => { if (!condition) throw new Error(name); results[name] = true; };
        const fits = () => document.documentElement.scrollWidth <= innerWidth &&
          [...document.querySelectorAll('.scout-unit, .unit-role-lane, .unit-member')].filter(node => node.getClientRects().length)
            .every(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
        const submit = form => form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
        try {
          await settle(); $('units-tab').click(); await settle();
          check($('units-title').textContent.includes('branco'), 'branco');
          $('new-unit').click();
          const form = $('unit-form');
          form.elements.name.value = 'Bianchi'; form.elements.name.oninput();
          check(form.elements.color.value === '#ffffff' && form.elements.color.disabled, 'namedColor');
          submit(form); await settle();
          check(!$('unit-dialog').open && $('units-board').querySelector('svg path').getAttribute('stroke') === '#f5cb31', 'triangle');
          const assignment = $('unit-assignment-form');
          assignment.elements.memberId.value = '1'; assignment.elements.unitId.value = '10'; assignment.elements.unitId.onchange();
          assignment.elements.role.value = 'Cucciolo'; submit(assignment); await settle();
          check(!!document.querySelector('[data-unit-id="10"] [data-role="Cucciolo"] [data-member-id="1"]'), 'accessibleMove');
          check(fits(), 'lcFits');
          $('lc-environment-form').elements.environment.value = 'Cerchio';
          submit($('lc-environment-form')); await settle();
          check($('units-title').textContent.includes('cerchio') &&
            !!document.querySelector('[data-role="Cocci"] [data-member-id="1"]'), 'cerchio');
          document.querySelector('[data-unit-id="10"] .member-name').click();
          check([...$('member-education').querySelector('[name="extra:progressione"]').options].some(option => option.value === 'Coccinella del prato'), 'cerchioSheet');
          document.querySelector('[data-close="member-dialog"]').click();
          const hide = [...document.querySelectorAll('[data-unit-id="10"] button')].find(button => button.textContent === 'Nascondi');
          hide.click(); await settle();
          check(!$('units-board').querySelector('[data-unit-id="10"]') &&
            $('unit-unassigned').textContent.includes('Assegnazione conservata: Bianchi'), 'hidePreserves');
          $('new-unit').click(); form.elements.name.value = ' bianchi '; form.elements.name.oninput();
          submit(form); await settle();
          check(!!document.querySelector('[data-unit-id="10"] [data-member-id="1"]'), 'restorePreserves');
          $('units-branch').value = 'E/G'; $('units-branch').onchange(); await settle();
          check(!$('unit-unassigned').querySelector('details').open, 'unassignedCompact');
          $('unit-unassigned').querySelector('details').open = true;
          check($('lc-environment-form').hidden && !$('units-board').textContent.includes('Persona 7'), 'egScope');
          check(JSON.stringify([...document.querySelector('[data-unit-id="1"]').querySelectorAll('h4')].slice(0,4).map(node => node.textContent)) ===
            JSON.stringify(M.unitRoles('E/G')), 'roleOrder');
          check($('units-board').textContent.includes('Ruolo storico') &&
            $('unit-unassigned').textContent.includes('Assegnazione conservata: Nascosti'), 'legacyVisible');
          const drag = (id, unitId, role) => {
            const transfer = new DataTransfer(), member = document.querySelector('.unit-member[data-member-id="' + id + '"]');
            member.dispatchEvent(new DragEvent('dragstart', {dataTransfer: transfer, bubbles: true}));
            const lane = document.querySelector('[data-unit-id="' + unitId + '"] [data-role="' + role + '"]');
            lane.dispatchEvent(new DragEvent('dragover', {dataTransfer: transfer, bubbles: true, cancelable: true}));
            lane.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true, cancelable: true}));
          };
          drag(4, 1, 'Capo squadriglia'); await settle();
          check($('units-status').textContent.includes('occupato') && !!$('unit-unassigned').querySelector('[data-member-id="4"]'), 'occupiedError');
          drag(3, 2, 'Squadrigliere'); await settle();
          drag(4, 1, 'Capo squadriglia'); await settle();
          check(!!document.querySelector('[data-unit-id="1"] [data-role="Capo squadriglia"] [data-member-id="4"]') &&
            !!document.querySelector('[data-unit-id="2"] [data-role="Squadrigliere"] [data-member-id="3"]'), 'dragMove');
          document.querySelector('[data-unit-id="1"] .members-toolbar button').click();
          form.elements.color.value = '#25477e'; form.elements.color.oninput();
          const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 8;
          canvas.getContext('2d').fillRect(0, 0, 16, 8);
          const blob = new Blob([Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), char => char.charCodeAt(0))], {type:'image/png'});
          const upload = new DataTransfer(); upload.items.add(new File([blob], 'symbol.png', {type:'image/png'}));
          $('unit-image-file').files = upload.files;
          const uploading = $('unit-image-file').onchange();
          check($('save-unit').disabled && $('close-unit').disabled, 'imageBusy');
          await uploading;
          check(!!$('unit-symbol-preview').querySelector('image') &&
            document.querySelector('#unit-symbol-preview image').getAttribute('preserveAspectRatio') === 'xMidYMid meet', 'imagePreview');
          const invalid = new DataTransfer(); invalid.items.add(new File(['bad'], 'invalid.svg', {type:'image/svg+xml'}));
          $('unit-image-file').files = invalid.files; await $('unit-image-file').onchange();
          check($('unit-error').textContent.includes('Impossibile caricare') && !!$('unit-symbol-preview').querySelector('image'), 'invalidImageError');
          $('unit-image-file').files = upload.files; await $('unit-image-file').onchange();
          check($('unit-dialog').getBoundingClientRect().right <= innerWidth + 1 &&
            $('unit-dialog').scrollWidth <= $('unit-dialog').clientWidth, 'editorFits');
          submit(form); await settle();
          check(!!document.querySelector('[data-unit-id="1"] svg image') && snapshot.units[0].color === '#25477e', 'imageSaved');
          check(fits(), 'egFits');
          for (const card of document.querySelectorAll('.unit-member')) {
            const rect = card.querySelector('.button').getBoundingClientRect();
            if (rect.height) check(rect.height >= 44 && rect.width >= 44, 'touchTargets');
          }
          check(!errors.length, 'noErrors');
        } catch (error) { results.failure = error.message; results.errors = errors; }
        const output = document.createElement('pre'); output.id = 'unit-result';
        output.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(results)))); document.body.append(output);
      })();
    `;
    const page = renderHtml(read("area-riservata/soci.html"), "area-riservata/soci.html")
      .replace(/<link\b[^>]*>/g, "")
      .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
        const file = ["soci-model.js", "soci-units.js", "soci.js"].find(file => src.endsWith("/" + file));
        return file ? `<script>${read("assets/js/" + file)}</script>` : src.endsWith("/section-nav.js") ? `<script>${read("assets/js/shared/section-nav.js")}</script>` : "";
      })
      .replace("</head>", `<style>${["theme", "home", "nas", "soci", "section-nav"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`)
      .replace("</body>", `<script>${exercise}</script></body>`);
    for (const width of [320, 375, 768, 1024, 1440]) {
      const file = path.join(directory, "fixture.html");
      fs.writeFileSync(file, `<!doctype html><body><script>
        const frame = document.createElement('iframe'); frame.style.cssText = 'border:0;width:${width}px;height:1000px';
        document.body.append(frame); frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
        const timer = setInterval(() => {
          const result = frame.contentDocument?.getElementById('unit-result');
          if(result) {const copy = result.cloneNode(true); document.body.append(copy); clearInterval(timer);}
        }, 50);
      </script>`);
      const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, "profile-" + width),
        "--virtual-time-budget=7000", "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      assert.equal(browser.status, 0, browser.stderr);
      const encoded = /<pre id="unit-result">([^<]+)<\/pre>/.exec(browser.stdout)?.[1];
      assert.ok(encoded, browser.stdout.slice(-3000));
      const results = JSON.parse(Buffer.from(encoded, "base64").toString());
      assert.equal(results.failure, undefined, width + ": " + JSON.stringify(results));
      for (const key of ["branco", "namedColor", "triangle", "accessibleMove", "lcFits", "cerchio", "cerchioSheet",
        "hidePreserves", "restorePreserves", "egScope", "roleOrder", "legacyVisible", "occupiedError", "dragMove",
        "imagePreview", "imageBusy", "invalidImageError", "editorFits", "imageSaved", "egFits", "touchTargets", "noErrors", "unassignedCompact"])
        assert.equal(results[key], true, width + " " + key + ": " + JSON.stringify(results));
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
