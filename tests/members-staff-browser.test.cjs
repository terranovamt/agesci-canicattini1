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

test("staff UI hides admin tools, constrains fields and exposes destination confirmation", { skip: !chrome }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "members-staff-browser-"));
  try {
    const snapshot = { currentYear: "2027", group: {}, templates: [{ id: 1, title: "Internal", body: "{{nome}}" }],
      fields: M.defaultFields.filter(field => field.branch === "E/G"),
      members: [{ id: 1, name: "Example member", code: "012345", branch: "E/G", revision: 1,
        profile: { givenName: "Example", surname: "Member", birthDate: "2012-01-01" }, censuses: [], values: {} }],
      transfers: [{ id: 1, personId: 2, name: "Incoming", code: "012346", birthYear: "2014",
        source: "L/C", target: "E/G", revision: 1, canConfirm: true, canCancel: false }] };
    const mock = `
      window.NAS = {user:{admin:false,serviceBranch:'E/G'}};
      window.confirm = () => true;
      window.calls = [];
      const snapshot = ${JSON.stringify(snapshot)};
      window.ACCESSO = {request:async(route,method='GET',value) => {
        calls.push(structuredClone({route,method,value}));
        if(route === 'members/transfers/1') snapshot.transfers = [];
        return structuredClone(snapshot);
      }};
    `;
    const exercise = `
      (async () => {
        const $ = id => document.getElementById(id);
        const wait = () => new Promise(resolve => setTimeout(resolve,30));
        const result = {};
        try {
          await wait();
          result.loaded = !$('members-app').hidden;
          result.hidden = ['members-access-link','new-member','open-import','template-form'].every(id => getComputedStyle($(id)).display === 'none');
          result.scope = [...$('field-form').elements.branch.options].map(option => option.value);
          result.confirmVisible = $('members-transfers').textContent.includes('Conferma ingresso');
          $('members-transfers').querySelector('button').click(); await wait();
          result.approval = calls.find(call => call.route === 'members/transfers/1').value;
          document.querySelector('.member-name').click();
          result.branchLocked = $('member-form').elements.branch.disabled;
          result.roleOptions = [...$('member-form').elements['extra:ruolo'].options].map(option => option.value);
          document.querySelector('[data-close=member-dialog]').click();
          $('select-results').click(); $('open-macro').click();
          const macro = $('macro-form');
          macro.elements.action.value = 'passage'; macro.elements.action.onchange();
          result.target = macro.elements.branch.value;
          result.noEducationalInput = $('macro-value').children.length === 0 && getComputedStyle($('macro-field-label')).display === 'none';
          macro.requestSubmit(); await wait();
          result.proposal = calls.find(call => call.route === 'members/macro').value;
          result.fits = document.documentElement.scrollWidth <= innerWidth;
        } catch(error) { result.error = error.message; }
        const output = document.createElement('pre'); output.id = 'staff-result';
        output.textContent = btoa(JSON.stringify(result)); document.body.append(output);
      })();
    `;
    const page = renderHtml(read("area-riservata/soci.html"), "area-riservata/soci.html")
      .replace(/<link\b[^>]*>/g, "")
      .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
        src.includes("soci-model.js") ? `<script>${read("assets/js/soci-model.js")}</script>` :
          src.includes("soci.js") ? `<script>${read("assets/js/soci.js")}</script>` : "")
      .replace("</head>", `<style>${["theme", "home", "nas", "soci"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`)
      .replace("</body>", `<script>${exercise}</script></body>`);
    const file = path.join(directory, "fixture.html");
    fs.writeFileSync(file, `<!doctype html><body><script>
      const frame = document.createElement('iframe');
      frame.style.cssText = 'border:0;width:375px;height:1000px'; document.body.append(frame);
      frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
      const timer = setInterval(() => {
        const result = frame.contentDocument?.getElementById('staff-result');
        if(result) {const copy=document.createElement('pre');copy.id=result.id;copy.textContent=result.textContent;document.body.append(copy);clearInterval(timer);}
      },50);
    </script>`);
    const result = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, "profile"),
      "--virtual-time-budget=6000", "--dump-dom", "file://" + file], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const encoded = /<pre id="staff-result">([^<]+)<\/pre>/.exec(result.stdout)?.[1];
    assert.ok(encoded, result.stdout.slice(-2000));
    const measured = JSON.parse(Buffer.from(encoded, "base64").toString());
    assert.equal(measured.error, undefined, JSON.stringify(measured));
    for (const key of ["loaded", "hidden", "confirmVisible", "branchLocked", "noEducationalInput", "fits"])
      assert.equal(measured[key], true, key + ": " + JSON.stringify(measured));
    assert.deepEqual(measured.scope, ["E/G"]);
    assert.deepEqual(measured.roleOptions, ["", "Capo squadriglia", "Vice capo squadriglia", "Squadrigliere"]);
    assert.deepEqual(measured.approval, { action: "confirm", revision: 1 });
    assert.equal(measured.target, "R/S");
    assert.equal(measured.proposal.branch, "R/S");
    assert.equal(measured.proposal.members[0].id, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
