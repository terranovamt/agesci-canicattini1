const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");
const { renderHtml } = require("../tools/site-layout.cjs");
const root = path.join(__dirname, "..");
const chrome = require("./helpers/chrome.cjs");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const people = [
  { id: 2, name: "Giulia Capo", code: "7654321", kind: "capo", admin: false, loginEnabled: true, serviceBranch: "E/G" },
  { id: 3, name: "Andrea Capo", code: "7654322", kind: "capo", admin: false, loginEnabled: true, serviceBranch: "L/C" },
  { id: 4, name: "Senza branca", code: "7654323", kind: "capo", admin: false, loginEnabled: true, serviceBranch: "" },
];
const scenarios = {
  admin: { user: { id: 1, admin: true, name: "Amministratore" }, viewAs: null, basePath: "" },
  viewing: { user: { id: 3, admin: false, name: "Andrea Capo", serviceBranch: "L/C", viewAs: { adminName: "Amministratore" } },
    viewAs: { adminName: "Amministratore", target: { id: 3, name: "Andrea Capo", serviceBranch: "L/C" } }, basePath: "" },
  capo: { user: { id: 3, admin: false, name: "Andrea Capo", serviceBranch: "L/C" }, viewAs: null, basePath: "" },
};

function run(directory, scenario, width, height) {
  const mock = `
    window.NAS = ${JSON.stringify(scenarios[scenario])};
    window.LIVE = { nas: true, basePath: '' };
    window.calls = [];
    window.fetch = (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body || null });
      if (url === '/api/people') return Promise.resolve({ ok: true, json: async () => ({ people: ${JSON.stringify(people)} }) });
      return new Promise(() => {});
    };`;
  const exercise = `
    (async () => {
      const wait = () => new Promise(resolve => setTimeout(resolve, 60));
      const fits = node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; };
      const result = { width: innerWidth, height: innerHeight };
      try {
        await wait();
        const header = document.querySelector('.reserved-header');
        const control = header.querySelector('.view-as');
        result.controls = document.querySelectorAll('.view-as').length;
        const toggle = document.getElementById('reserved-menu-toggle');
        if (innerWidth <= 1024 && control?.matches('details')) {
          result.hiddenInMenu = !control.checkVisibility();
          toggle.click();
        }
        result.inMenu = !!control?.closest('.reserved-actions');
        if (control?.matches('details')) {
          const summary = control.querySelector('summary');
          result.summary = summary.textContent;
          result.summaryHeight = summary.getBoundingClientRect().height;
          control.open = true; await wait();
          const select = control.querySelector('select');
          result.label = control.querySelector('label[for=view-as-person]')?.textContent;
          result.groups = [...select.querySelectorAll('optgroup')].map(group => group.label + ':' + [...group.children].map(o => o.value + '=' + o.textContent).join('|'));
          result.status = control.querySelector('[role=status]').textContent;
          result.formFits = fits(control.querySelector('form'));
          select.value = '2';
          control.querySelector('form').requestSubmit(); await wait();
          result.post = calls.find(call => call.method === 'POST');
          control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          result.closedOnEscape = !control.open;
          result.menuStillOpen = innerWidth > 1024 || toggle.getAttribute('aria-expanded') === 'true';
        } else if (control) {
          result.text = control.querySelector('.view-as-label').textContent;
          const back = control.querySelector('button');
          result.backLabel = back.textContent;
          result.backHeight = back.getBoundingClientRect().height;
          result.backFits = fits(back);
          result.bodyFlag = document.body.classList.contains('viewing-as');
          result.returnAlwaysVisible = back.checkVisibility() && !control.closest('#reserved-menu');
          result.returnParent = control.parentElement.className;
          back.click(); await wait();
          result.del = calls.find(call => call.method === 'DELETE');
          result.backDisabled = back.disabled;
        }
        result.calls = calls.length;
        result.fits = document.documentElement.scrollWidth <= innerWidth;
      } catch (error) { result.error = error.message; }
      const output = document.createElement('pre'); output.id = 'view-as-result';
      output.textContent = btoa(JSON.stringify(result)); document.body.append(output);
    })();`;
  const page = renderHtml(read("area-riservata/persone.html"), "area-riservata/persone.html")
    .replace('<head>', '<head><base href="http://127.0.0.1/area-riservata/persone.html">')
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
      src.includes("shared/accesso.js") ? `<script>${read("assets/js/shared/accesso.js")}</script>` :
        src.includes("nas-nav.js") ? `<script>${read("assets/js/nas-nav.js")}</script>` : "")
    .replace("</head>", `<style>${["theme", "home", "nas"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`)
    .replace("</body>", `<script>${exercise}</script></body>`);
  const file = path.join(directory, `${scenario}-${width}.html`);
  fs.writeFileSync(file, `<!doctype html><body style="margin:0"><script>
    const frame = document.createElement('iframe');
    frame.style.cssText = 'border:0;width:${width}px;height:${height}px'; document.body.append(frame);
    frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
    const timer = setInterval(() => {
      const result = frame.contentDocument?.getElementById('view-as-result');
      if (result) { const copy = document.createElement('pre'); copy.id = result.id; copy.textContent = result.textContent; document.body.append(copy); clearInterval(timer); }
    }, 50);
  </script>`);
  const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, `profile-${scenario}-${width}`),
    "--window-size=" + width + ",1200", "--virtual-time-budget=6000", "--dump-dom", pathToFileURL(file).href],
  { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, TMPDIR: root } });
  assert.equal(browser.status, 0, browser.stderr);
  const encoded = /<pre id="view-as-result">([^<]+)<\/pre>/.exec(browser.stdout)?.[1];
  assert.ok(encoded, browser.stdout.slice(-2000));
  const measured = JSON.parse(Buffer.from(encoded, "base64").toString("latin1"));
  assert.equal(measured.error, undefined, JSON.stringify(measured));
  assert.equal(measured.width, width);
  assert.equal(measured.fits, true, JSON.stringify(measured));
  return measured;
}

test("view-as header control is admin-only, compact, accessible and keeps an explicit return", { skip: !chrome }, () => {
  const directory = fs.mkdtempSync(path.join(root, ".view-as-browser-"));
  try {
    for (const [width, height] of [[1366, 768], [820, 1180], [390, 844], [844, 390]]) {
      const admin = run(directory, "admin", width, height);
      assert.equal(admin.controls, 1);
      assert.equal(admin.inMenu, true);
      if (width <= 1024) assert.equal(admin.hiddenInMenu, true);
      assert.equal(admin.summary, "Visualizza come");
      assert.ok(admin.summaryHeight >= 44, JSON.stringify(admin));
      assert.equal(admin.label, "Capo");
      assert.deepEqual(admin.groups, ["Branca L/C:3=Andrea Capo", "Branca E/G:2=Giulia Capo"]);
      assert.equal(admin.status, "1 capo senza branca non selezionabile.");
      assert.equal(admin.formFits, true, JSON.stringify(admin));
      assert.deepEqual(admin.post, { url: "/api/auth/view-as", method: "POST", body: '{"personId":2}' });
      assert.equal(admin.closedOnEscape, true);
      assert.equal(admin.menuStillOpen, true);

      const viewing = run(directory, "viewing", width, height);
      assert.equal(viewing.controls, 1);
      assert.equal(viewing.text, "Vista capo: Andrea Capo · L/C");
      assert.equal(viewing.backLabel, "Torna admin");
      assert.ok(viewing.backHeight >= 40, JSON.stringify(viewing));
      assert.equal(viewing.backFits, true, JSON.stringify(viewing));
      assert.equal(viewing.bodyFlag, true);
      assert.equal(viewing.returnAlwaysVisible, true, JSON.stringify(viewing));
      assert.deepEqual(viewing.del, { url: "/api/auth/view-as", method: "DELETE", body: null });
      assert.equal(viewing.backDisabled, true);
      assert.equal(viewing.calls, 1);

      const capo = run(directory, "capo", width, height);
      assert.equal(capo.controls, 0);
      assert.equal(capo.calls, 0);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
