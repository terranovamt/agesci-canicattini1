const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const { test } = require("node:test");
const { renderHtml } = require("../tools/site-layout.cjs");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);
const tick = () => new Promise(resolve => setImmediate(resolve));
const chiefs = () => [
  { id: 1, name: "Admin", code: "012345", kind: "capo", admin: true, loginEnabled: true },
  { id: 2, name: "Giulia Capo", code: "012346", kind: "capo", loginEnabled: true, hasPassword: true, serviceBranch: "E/G" },
  { id: 3, name: "Non abilitato", code: "012348", kind: "capo", loginEnabled: false },
  { id: 4, name: "Ragazzo", code: "012347", kind: "ragazzo", loginEnabled: false },
  { id: 5, name: "Andrea Capo", code: "012349", kind: "capo", loginEnabled: true, hasPassword: false, serviceBranch: "L/C" },
];
function setup({ data = chiefs(), admin = true, request } = {}) {
  const elements = new Map();
  const calls = [];
  const confirmations = [];
  const listeners = {};
  let handler = request;
  let confirmed = true;
  function element(tag = "") {
    const node = {
      tag, children: [], value: "", hidden: false, disabled: false, textContent: "", className: "",
      attributes: {}, classList: { toggle() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      click() { if (!this.disabled) return this.onclick?.(); },
      focus() { document.activeElement = this; },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
    Object.defineProperty(node, "id", { get() { return this._id; }, set(value) { this._id = value; elements.set(value, this); } });
    return node;
  }
  const get = id => {
    if (!elements.has(id)) {
      const node = element();
      node.id = id;
      node.hidden = ["people-app", "people-login", "people-status"].includes(id);
    }
    return elements.get(id);
  };
  const document = { getElementById: get, createElement: element, createTextNode: text => ({ textContent: text }) };
  const window = {
    NAS: { user: { admin } },
    addEventListener(name, fn) { listeners[name] = fn; },
    ACCESSO: { request: async (...args) => {
      calls.push(args);
      if (handler) return handler(...args);
      if (!args[1]) return { people: data.map(person => ({ ...person })) };
      const person = data.find(person => person.id === Number(args[0].split("/")[1]));
      if (args[1] === "PATCH") person.serviceBranch = args[2].serviceBranch;
      if (args[1] === "DELETE") person.hasPassword = false;
      return { ok: true };
    } },
  };
  vm.runInNewContext(read("assets/js/persone.js"), {
    window, document, confirm: text => { confirmations.push(text); return confirmed; },
  });
  const cards = () => get("people-list").children.filter(node => node.className === "person-card");
  const submit = id => get("person-save-" + id) && cards().find(node =>
    node.children[2].children[0].children[1].id === "person-save-" + id).children[2].onsubmit({ preventDefault() {} });
  const change = (id, value) => { const select = get("person-branch-" + id); select.value = value; select.onchange(); };
  return { get, cards, calls, confirmations, listeners, window, document, submit, change,
    handle(fn) { handler = fn; }, confirm(value) { confirmed = value; } };
}

test("only configured non-admin chiefs, compact cards, branch drafts and restricted mutations", async () => {
  const ui = setup();
  await tick();
  assert.deepEqual(ui.cards().map(card => card.children[0].textContent), ["Andrea Capo", "Giulia Capo"]);
  assert.equal(ui.get("people-count").textContent, "2 capi abilitati");
  assert.equal(ui.get("person-save-2").disabled, true);
  assert.equal(ui.get("person-feedback-2").hidden, true);
  ui.change(2, "R/S");
  ui.get("people-filter-L-C").click();
  ui.get("people-filter-ALL").click();
  assert.equal(ui.get("person-branch-2").value, "R/S");
  assert.equal(ui.get("person-save-2").disabled, false);
  ui.submit(2);
  await tick();
  const patch = ui.calls.find(call => call[1] === "PATCH");
  assert.equal(patch[0], "people/2");
  assert.equal(JSON.stringify(patch[2]), '{"serviceBranch":"R/S"}');
  assert.equal(ui.get("person-feedback-2").textContent, "Branca salvata.");
  assert.equal(ui.get("person-save-2").disabled, true);
  const html = read("area-riservata/persone.html");
  assert.doesNotMatch(html, /person-form|Aggiungi capo|name="name"|name="kind"/);
  assert.match(html, /<details class="people-help"><summary>/);
  assert.doesNotMatch(read("assets/js/persone.js"), /Nessuna modifica/);
});

test("reset confirms identity, revocation and supervised initialization without generating passwords", async () => {
  const ui = setup();
  await tick();
  ui.confirm(false);
  ui.get("person-reset-2").click();
  assert.equal(ui.calls.filter(call => call[1] === "DELETE").length, 0);
  ui.confirm(true);
  ui.get("person-reset-2").click();
  await tick();
  assert.match(ui.confirmations[0], /Giulia Capo \(codice 012346\)/);
  assert.match(ui.confirmations[0], /sessioni saranno revocate/);
  assert.match(ui.confirmations[0], /Non verrà generata né inviata/);
  assert.match(ui.confirmations[0], /supervisiona/);
  assert.equal(ui.calls.find(call => call[1] === "DELETE")[0], "people/2/password");
  assert.match(ui.get("person-feedback-2").textContent, /Sessioni revocate.*Supervisiona/);
  assert.match(ui.cards().find(card => card.children[0].textContent === "Giulia Capo").children[1].textContent, /da inizializzare/);
});

test("pending and write errors stay on the card; duplicate writes blocked; drafts retained", async () => {
  const ui = setup();
  await tick();
  let reject;
  ui.handle(() => new Promise((resolve, fail) => { reject = fail; }));
  ui.change(2, "R/S");
  ui.submit(2);
  assert.match(ui.get("person-feedback-2").textContent, /Salvataggio/);
  assert.equal(ui.get("person-feedback-2").attributes["aria-live"], "polite");
  assert.equal(ui.get("person-save-2").disabled, true);
  assert.equal(ui.get("person-branch-5").disabled, true);
  ui.submit(2);
  assert.equal(ui.calls.filter(call => call[1] === "PATCH").length, 1);
  reject(new Error("Rete non disponibile"));
  await tick();
  assert.match(ui.get("person-feedback-2").textContent, /Operazione non confermata.*Ricarica/);
  assert.equal(ui.get("person-branch-2").attributes["aria-invalid"], "true");
  assert.equal(ui.get("person-branch-2").value, "R/S");
  assert.equal(ui.document.activeElement.id, "person-feedback-2");
});

test("successful write with failed refresh remains successful, and retry performs only GET", async () => {
  const ui = setup();
  await tick();
  ui.change(5, "R/S");
  ui.get("people-filter-E-G").click();
  ui.change(2, "L/C");
  ui.handle(async (route, method) => {
    if (!method) throw new Error("Lettura non disponibile");
    return { ok: true };
  });
  ui.submit(2);
  await tick();
  assert.match(ui.get("person-feedback-2").textContent, /^Branca salvata\. Elenco non aggiornato/);
  assert.equal(ui.get("person-save-2").disabled, true);
  assert.equal(ui.get("people-filter-E-G").attributes["aria-pressed"], "true");
  assert.equal(ui.cards().length, 1, "keep acted-on card and its feedback reachable");
  ui.confirm(false);
  ui.get("reload-people").click();
  await tick();
  assert.equal(ui.confirmations.length, 1, "other card draft still needs discard confirmation");
  ui.confirm(true);
  ui.get("reload-people").click();
  await tick();
  assert.equal(ui.calls.filter(call => call[1] === "PATCH").length, 1);
  assert.equal(ui.calls.at(-1)[1], undefined);
  ui.get("people-filter-ALL").click();
  assert.equal(ui.get("person-branch-5").value, "R/S", "failed reload must preserve drafts");
  assert.match(ui.get("people-status").textContent, /dati e bozze conservati/);
});

test("confirmed reset followed by expired read is not reported as failed and never repeated", async () => {
  const ui = setup();
  await tick();
  ui.handle(async (route, method) => {
    if (method === "DELETE") return { ok: true };
    ui.window.NAS.user = null;
    throw new Error("Sessione scaduta: accedi di nuovo");
  });
  ui.get("person-reset-2").click();
  await tick();
  assert.match(ui.get("person-feedback-2").textContent, /^Password reimpostata\. Sessioni revocate/);
  assert.match(ui.get("person-feedback-2").textContent, /Elenco non aggiornato/);
  assert.doesNotMatch(ui.get("person-feedback-2").textContent, /Operazione non confermata/);
  assert.match(ui.get("people-status").textContent, /Sessione scaduta/);
  assert.equal(ui.get("people-login").hidden, false);
  assert.equal(ui.calls.filter(call => call[1] === "DELETE").length, 1);
  assert.equal(ui.get("reload-people").disabled, true);
});

test("empty, initial loading/error and session expiry remain distinct from actual empty data", async () => {
  const empty = setup({ data: [] });
  assert.match(empty.get("people-status").textContent, /Caricamento/);
  await tick();
  assert.match(empty.get("people-list").children[0].textContent, /Nessun capo configurato/);
  const unavailable = setup({ request: async () => { throw new Error("NAS non raggiungibile"); } });
  await tick();
  assert.match(unavailable.get("people-status").textContent, /Impossibile caricare.*NAS non raggiungibile/);
  assert.equal(unavailable.get("people-app").hidden, true);
  assert.equal(unavailable.cards().length, 0);
  assert.equal(unavailable.get("people-count").textContent, "Elenco non disponibile");
  assert.equal(unavailable.get("reload-people").disabled, false);
  unavailable.handle(async () => ({ people: chiefs() }));
  unavailable.get("reload-people").click();
  await tick();
  assert.equal(unavailable.cards().length, 2);
  const ui = setup();
  await tick();
  ui.change(2, "R/S");
  ui.handle(async () => { ui.window.NAS.user = null; throw new Error("Sessione scaduta: accedi di nuovo"); });
  ui.submit(2);
  await tick();
  assert.match(ui.get("people-status").textContent, /Sessione scaduta/);
  assert.equal(ui.get("people-login").hidden, false);
  assert.equal(ui.get("person-save-2").disabled, true);
  assert.equal(ui.get("person-branch-2").value, "R/S");
  const denied = setup({ admin: false });
  await tick();
  assert.equal(denied.calls.length, 0);
  assert.match(denied.get("people-status").textContent, /riservata all’amministratore/);
});

test("reload cancellation and navigation guard preserve drafts; successful reload clears them", async () => {
  const ui = setup();
  await tick();
  ui.change(2, "R/S");
  let guarded = false;
  ui.listeners.beforeunload({ preventDefault() { guarded = true; } });
  assert.equal(guarded, true);
  ui.confirm(false);
  ui.get("reload-people").click();
  await tick();
  assert.equal(ui.calls.length, 1);
  ui.confirm(true);
  ui.get("reload-people").click();
  await tick();
  assert.equal(ui.get("person-branch-2").value, "E/G");
  assert.equal(ui.get("person-save-2").disabled, true);
});

test("a successful reload reconciles errors without losing the selected empty branch filter", async () => {
  const ui = setup();
  await tick();
  ui.get("people-filter-E-G").click();
  ui.change(2, "L/C");
  ui.handle(async () => { throw new Error("Risposta interrotta"); });
  ui.submit(2);
  await tick();
  assert.match(ui.get("person-feedback-2").textContent, /Operazione non confermata/);
  ui.handle(async () => ({ people: chiefs().map(person => person.id === 2 ? { ...person, serviceBranch: "L/C" } : person) }));
  ui.get("reload-people").click();
  await tick();
  assert.equal(ui.get("people-filter-E-G").attributes["aria-pressed"], "true");
  assert.match(ui.get("people-list").children[0].textContent, /Nessun capo in questa branca/);
  ui.get("people-filter-ALL").click();
  assert.equal(ui.get("person-feedback-2").hidden, true);
  assert.equal(ui.get("person-branch-2").value, "L/C");
});

test("six responsive layouts keep cards compact and draft/reset/filter/guide/error controls reachable", { skip: !chrome }, t => {
  const directory = fs.mkdtempSync(".people-ui-browser-");
  const css = ["assets/css/theme.css", "assets/css/home.css", "assets/css/nas.css"].map(read).join("\n");
  const people = [...chiefs(),
    { id: 6, name: "Marco Capo con nome e cognome molto lunghi", code: "012350", kind: "capo", loginEnabled: true, hasPassword: true, serviceBranch: "R/S" },
    { id: 7, name: "Capo da assegnare", code: "012351", kind: "capo", loginEnabled: true, hasPassword: false, serviceBranch: "" },
  ];
  const page = renderHtml(read("area-riservata/persone.html"), "area-riservata/persone.html")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, "")
    .replace("</head>", `<style>${css}</style><script>
      window.NAS = { user: { admin: true } };
      const people = ${JSON.stringify(people)};
      window.confirm = text => { window.resetConfirmation = text; return true; };
      window.ACCESSO = { request: async (route, method, data) => {
        if (!method) return { people: people.map(person => ({ ...person })) };
        const person = people.find(person => person.id === Number(route.split('/')[1]));
        if (method === 'PATCH') person.serviceBranch = data.serviceBranch;
        if (method === 'DELETE') person.hasPassword = false;
        return { ok: true };
      } };
    </script></head>`)
    .replace("</body>", `<script>${read("assets/js/persone.js")}
      setTimeout(async () => {
        const measure = () => {
          const controls = [...document.querySelectorAll('#reserved-content button, #reserved-content select, #reserved-content summary')];
          const boxes = controls.map(button => button.getBoundingClientRect()).filter(box => box.width);
          return {
            fits: document.documentElement.scrollWidth <= innerWidth,
            controlsFit: boxes.every(box => box.height >= 44 && box.width >= 44 && box.left >= 0 && box.right <= innerWidth),
            actionsSeparate: boxes.every((box, index) => boxes.slice(index + 1).every(next =>
              box.right <= next.left + 1 || next.right <= box.left + 1 ||
              box.bottom <= next.top + 1 || next.bottom <= box.top + 1)),
            minControlHeight: Math.min(...boxes.map(box => box.height))
          };
        };
        const firstCard = document.querySelector('.person-card').getBoundingClientRect();
        const fields = document.querySelector('.person-fields');
        const fieldBoxes = [...fields.children].map(node => node.getBoundingClientRect());
        const result = { width: innerWidth, height: innerHeight, closed: measure(),
          firstCardTop: firstCard.top, cardWidth: firstCard.width,
          contentWidth: document.getElementById('reserved-content').getBoundingClientRect().width,
          columns: getComputedStyle(document.getElementById('people-list')).gridTemplateColumns.split(' ').length,
          branchSaveGap: fieldBoxes[1].left - fieldBoxes[0].right,
          branchSaveAligned: Math.abs(fieldBoxes[0].bottom - fieldBoxes[1].bottom) < 1 };
        document.querySelector('.people-help').open = true;
        result.open = measure();
        const select = document.getElementById('person-branch-2');
        select.value = 'R/S'; select.onchange();
        document.getElementById('person-save-2').focus();
        result.draft = measure();
        result.focusVisible = document.activeElement.matches(':focus-visible') &&
          getComputedStyle(document.activeElement).outlineStyle !== 'none';
        document.getElementById('people-filter-E-G').click();
        result.filtered = measure();
        result.filteredWidth = document.querySelector('.person-card').getBoundingClientRect().width;
        document.getElementById('people-filter-ALL').click();
        result.draftRestored = document.getElementById('person-branch-2').value === 'R/S';
        const feedback = document.getElementById('person-feedback-2');
        feedback.textContent = 'Operazione non confermata: connessione interrotta. Ricarica per verificare lo stato prima di riprovare.';
        feedback.hidden = false;
        result.error = measure();
        document.getElementById('person-reset-2').click();
        await new Promise(resolve => setTimeout(resolve, 10));
        result.reset = measure();
        result.resetConfirmed = /Giulia Capo/.test(window.resetConfirmation) && /supervisiona/.test(window.resetConfirmation);
        result.resetFeedback = document.getElementById('person-feedback-2').textContent.startsWith('Password reimpostata.');
        result.draftAfterReset = document.getElementById('person-branch-2').value === 'R/S';
        const out = document.createElement('pre');
        out.id = 'layout-result'; out.textContent = JSON.stringify(result);
        document.body.append(out);
      }, 50);
    </script></body>`);
  try {
    const file = path.resolve(directory, "fixture.html");
    for (const [width, height, columns] of [[1920, 1080, 3], [1366, 768, 3], [820, 1180, 2],
      [390, 844, 1], [1180, 820, 3], [844, 390, 2]]) {
      fs.writeFileSync(file, `<!doctype html><body><script>
        const frame = document.createElement('iframe');
        frame.style.cssText = 'border:0;width:${width}px;height:${height}px';
        document.body.append(frame);
        frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
        const timer = setInterval(() => {
          const result = frame.contentDocument?.getElementById('layout-result');
          if (result) {
            const copy = document.createElement('pre');
            copy.id = 'layout-result'; copy.textContent = result.textContent;
            document.body.append(copy); clearInterval(timer);
          }
        }, 50);
      </script>`);
      const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.resolve(directory, "profile-" + width),
        "--window-size=" + width + "," + height, "--virtual-time-budget=3000", "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      assert.equal(browser.status, 0, browser.stderr);
      const result = browser.stdout.match(/<pre id="layout-result">([^<]+)<\/pre>/)?.[1];
      assert.ok(result, browser.stdout.slice(-2000));
      const measured = JSON.parse(result);
      assert.equal(measured.width, width);
      assert.equal(measured.height, height);
      for (const state of ["closed", "open", "draft", "filtered", "error", "reset"]) {
        assert.equal(measured[state].fits, true, `${state}: page fits ${width}x${height}`);
        assert.equal(measured[state].controlsFit, true, `${state}: 44px controls fit ${width}x${height}`);
        assert.equal(measured[state].actionsSeparate, true, `${state}: no overlap ${width}x${height}`);
      }
      assert.ok(measured.firstCardTop < Math.min(350, height - 90), `first card reachable early: ${JSON.stringify(measured)}`);
      assert.equal(measured.focusVisible, true);
      assert.equal(measured.columns, columns, `appropriate column count at ${width}x${height}`);
      assert.ok(measured.contentWidth <= 1100, "content width bounded on wide screens");
      assert.ok(measured.cardWidth <= 400, "cards never stretch across unused columns");
      assert.ok(Math.abs(measured.filteredWidth - measured.cardWidth) < 1, "filtering one card preserves compact width");
      assert.equal(measured.branchSaveAligned, true);
      assert.ok(measured.branchSaveGap >= 0 && measured.branchSaveGap <= 10, "branch/save remain adjacent");
      assert.equal(measured.draftRestored, true);
      assert.equal(measured.resetConfirmed, true);
      assert.equal(measured.resetFeedback, true);
      assert.equal(measured.draftAfterReset, true);
      t.diagnostic(`${width}x${height}: ${columns} columns; content ${measured.contentWidth}px; card ${measured.cardWidth}px; first card y=${Math.round(measured.firstCardTop)}px; controls >=${measured.closed.minControlHeight}px; branch/save gap ${measured.branchSaveGap}px.`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
