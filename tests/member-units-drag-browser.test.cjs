const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { renderHtml } = require("../tools/site-layout.cjs");
const M = require("../assets/js/soci-model.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture() {
  const member = (id, branch, values) => ({ id, code: "01234" + id, name: "Persona " + id, kind: "ragazzo", branch, revision: 1,
    profile: { givenName: "Persona", surname: String(id) }, values: { [branch]: values },
    censuses: [{ year: "2026", statusCode: "A" }] });
  const snapshot = {
    currentYear: "2026", group: {}, templates: [], transfers: [], fields: M.defaultFields,
    lc: { environment: "Branco", revision: 1 },
    units: [
      { id: 1, name: "Aquile", branch: "E/G", color: "#398258", color2: "#242424", emblem: "", revision: 1, hidden: false },
      { id: 2, name: "Falchi", branch: "E/G", color: "#e7a1ba", color2: "#e7a1ba", emblem: "", revision: 1, hidden: false },
      { id: 3, name: "Panda", branch: "E/G", color: "#f5cb31", color2: "#242424", emblem: "", revision: 1, hidden: false },
      { id: 4, name: "Blu", branch: "L/C", color: M.sestigliaColors.Blu, color2: "#ffffff", emblem: "", revision: 1, hidden: false },
      { id: 5, name: "Lupi", branch: "E/G", color: "#f5cb31", color2: "#242424", emblem: "", revision: 1, hidden: true },
    ],
    members: [
      member(1, "L/C", { sestiglia: "Blu", ruolo: "Sestigliere" }), member(2, "L/C", {}),
      member(3, "E/G", { squadriglia: "Aquile", ruolo: "Capo squadriglia" }), member(4, "E/G", {}),
      member(5, "E/G", { squadriglia: "Aquile", ruolo: "Squadrigliere" }),
      member(6, "E/G", { squadriglia: "Falchi", ruolo: "Capo squadriglia" }),
      member(7, "E/G", { squadriglia: "Lupi", ruolo: "Piede tenero" }),
    ],
  };
  const mock = `
    window.errors = []; addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(event.reason.message));
    window.confirm = () => true; window.NAS = { user: { admin: true } };
    window.snapshot = ${JSON.stringify(snapshot)}; window.requests = [];
    window.ACCESSO = {request: async (route, method = 'GET', value) => {
      const M = window.SOCI_MODEL;
      if (method !== 'GET') requests.push({route, method, value: structuredClone(value)});
      if (route === 'members/units' && method === 'POST') {
        const unit = snapshot.units.find(unit => unit.branch === value.branch && M.unitKey(unit.name) === M.unitKey(value.name));
        if (!unit) throw new Error('Il mock accetta solo ripristini');
        unit.hidden = false; unit.revision++;
        return {unit: structuredClone(unit)};
      }
      if (route === 'members/units/assign') {
        const member = snapshot.members.find(member => member.id === value.memberId);
        if (member.revision !== value.revision) throw new Error('Revisione non aggiornata');
        const unit = snapshot.units.find(unit => unit.id === value.unitId);
        if (unit && M.unitRoles(unit.branch).slice(0, 2).includes(value.role) &&
          snapshot.members.some(other => other.id !== member.id && other.values[member.branch]?.[M.unitField(member.branch)] === unit.name &&
            other.values[member.branch].ruolo === value.role)) throw new Error('Questo posto e occupato: sposta prima il capo o il vice attuale.');
        member.values[member.branch] ||= {};
        member.values[member.branch][M.unitField(member.branch)] = unit?.name || '';
        member.values[member.branch].ruolo = unit ? value.role : ''; member.revision++;
      }
      return structuredClone(snapshot);
    }};
  `;
  return renderHtml(read("area-riservata/soci.html"), "area-riservata/soci.html")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
      const file = ["soci-model.js", "soci-units.js", "soci.js"].find(file => src.endsWith("/" + file));
      return file ? `<script>${read("assets/js/" + file)}</script>` : src.endsWith("/section-nav.js") ? `<script>${read("assets/js/shared/section-nav.js")}</script>` : "";
    })
    .replace("</head>", `<style>${["theme", "home", "nas", "soci", "section-nav"].map(name => read("assets/css/" + name + ".css")).join("\n")}</style><script>${mock}</script></head>`);
}

async function openBrowser(directory, file) {
  const profile = path.join(directory, "profile");
  const child = spawn(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
    "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, TMPDIR: path.join(__dirname, "..") } });
  let stderr = "", browserUrl = "";
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome non ha aperto la porta di debug: " + stderr)), 15000);
    child.stderr.on("data", chunk => {
      stderr += chunk;
      const match = /DevTools listening on (ws:\/\/[^:]+:(\d+)\/\S+)/.exec(stderr);
      if (match) { clearTimeout(timer); browserUrl = match[1]; resolve(match[2]); }
    });
    child.once("exit", code => { clearTimeout(timer); reject(new Error("Chrome terminato (" + code + "): " + stderr)); });
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error("CDP non raggiungibile")); });
  let next = 0; const pending = new Map();
  socket.onmessage = message => {
    const data = JSON.parse(message.data);
    if (!pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id); pending.delete(data.id);
    data.error ? reject(new Error(data.error.message)) : resolve(data.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const waitFor = async (expression, label) => {
    for (let index = 0; index < 100; index++) { if (await evaluate(expression)) return; await sleep(30); }
    throw new Error("Timeout: " + label + " · stato: " + await evaluate("document.getElementById('units-status').textContent"));
  };
  const center = async selector => {
    const point = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null; node.scrollIntoView({block: 'center', behavior: 'instant'}); const r = node.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
    assert.ok(point, "Elemento non trovato: " + selector);
    return point;
  };
  const steps = (from, to, count = 8) => Array.from({ length: count }, (_, index) =>
    ({ x: from.x + (to.x - from.x) * (index + 1) / count, y: from.y + (to.y - from.y) * (index + 1) / count }));
  // The target is measured after the drag has started, as a user scrolling to the destination would do.
  const destination = async to => typeof to === "string" ? center(to) : to;
  const mouseDrag = async (fromSelector, to) => {
    const from = await center(fromSelector);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...from, button: "left", buttons: 1, clickCount: 1 });
    const start = { x: from.x + 12, y: from.y + 12 };
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...start, button: "left", buttons: 1 });
    const end = await destination(to);
    for (const point of steps(start, end)) await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...end, button: "left", buttons: 0, clickCount: 1 });
  };
  const click = async point => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
  };
  const touchDrag = async (fromSelector, to, hold) => {
    const from = await center(fromSelector);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
    await sleep(hold);
    const start = { x: from.x + 12, y: from.y + 12 };
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...start, id: 1 }] });
    await sleep(16);
    const end = hold || fromSelector.includes("grip") ? await destination(to) : { x: from.x, y: from.y - 200 };
    for (const point of steps(start, end)) {
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, id: 1 }] });
      await sleep(16);
    }
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await send("Runtime.enable");
  await send("Page.enable");
  return { send, evaluate, waitFor, center, mouseDrag, click, touchDrag,
    async load(width, height, mobile) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await send("Page.navigate", { url: "file://" + file });
      await waitFor("!!document.getElementById('units-tab') && !!window.SOCI_MODEL && document.readyState === 'complete'", "pagina");
      await sleep(100);
      await evaluate("document.getElementById('units-tab').click()");
      await waitFor("document.querySelector('[data-unit-id]') !== null", "tabellone");
    },
    async close() {
      // A graceful Browser.close lets Chrome delete its singleton directory from TMPDIR.
      socket.close();
      const exited = new Promise(resolve => child.once("exit", resolve));
      const browserSocket = new WebSocket(browserUrl);
      await new Promise((resolve, reject) => { browserSocket.onopen = resolve; browserSocket.onerror = () => reject(new Error("CDP browser non raggiungibile")); });
      browserSocket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      await exited;
    },
  };
}

const lane = (unitId, role) => `[data-unit-id="${unitId}"] [data-drop-role="${role}"]`;
const name = id => `.unit-member[data-member-id="${id}"] .member-name`;
const status = "document.getElementById('units-status').textContent";
const lastAssign = "JSON.stringify(requests.filter(item => item.route === 'members/units/assign').at(-1)?.value || null)";

test("names move between squadriglie and sestiglie with real mouse and touch input", { skip: !chrome, timeout: 120000 }, async () => {
  const directory = fs.mkdtempSync(path.join(__dirname, "..", ".member-units-drag-"));
  const file = path.join(directory, "page.html");
  fs.writeFileSync(file, fixture());
  let browser;
  try {
    browser = await openBrowser(directory, file);
    const { evaluate, waitFor, center, mouseDrag, click, touchDrag } = browser;
    await browser.load(1366, 768, false);
    await evaluate("document.getElementById('units-branch').value = 'E/G'; document.getElementById('units-branch').onchange()");
    await waitFor(`!!document.querySelector('${lane(3, "Piede tenero")}')`, "E/G");
    assert.equal(await evaluate("document.querySelector('[data-unit-id=\"3\"] .unit-colors').getAttribute('aria-label')"), "Giallo / Nero");
    assert.equal(await evaluate("document.querySelectorAll('.unit-member[draggable]').length"), 0, "nessun drag HTML5 residuo");

    await click(await center(name(5)));
    await waitFor("document.getElementById('member-dialog').open", "click sul nome apre la scheda");
    await evaluate("document.querySelector('[data-close=\"member-dialog\"]').click()");

    assert.equal(await evaluate("document.getElementById('unit-unassigned').hidden"), false);
    await mouseDrag(name(4), lane(2, "Squadrigliere"));
    await waitFor(`!!document.querySelector('${lane(2, "Squadrigliere")} [data-member-id="4"]')`, "mouse: da senza squadriglia a Falchi");
    assert.deepEqual(JSON.parse(await evaluate(lastAssign)), { memberId: 4, revision: 1, unitId: 2, role: "Squadrigliere" });
    assert.equal(await evaluate("document.getElementById('member-dialog').open"), false, "il rilascio non apre la scheda");
    assert.equal(await evaluate("requests.some(item => item.route !== 'members/units/assign')"), false, "nessun inserimento o altra scrittura");

    await mouseDrag(name(3), lane(2, "Capo squadriglia"));
    await waitFor(`${status}.includes('occupato')`, "errore esplicito posto occupato");
    assert.ok(await evaluate(`!!document.querySelector('${lane(1, "Capo squadriglia")} [data-member-id="3"]')`));

    await mouseDrag(name(3), lane(3, "Capo squadriglia"));
    await waitFor(`!!document.querySelector('${lane(3, "Capo squadriglia")} [data-member-id="3"]')`, "mouse: capo trasferito in Panda");
    assert.ok(await evaluate(`document.querySelector('${lane(1, "Capo squadriglia")}').textContent.includes('Posto libero')`));

    const count = await evaluate("requests.length");
    await mouseDrag(name(5), { x: 5, y: 5 });
    await waitFor(`${status}.includes('annullato')`, "rilascio fuori dalle righe");
    assert.equal(await evaluate("requests.length"), count, "nessuna richiesta fuori bersaglio");
    assert.equal(await evaluate("!!document.querySelector('.unit-drag-ghost')"), false);

    await mouseDrag(name(5), '#unit-available-title');
    await waitFor("!!document.querySelector('#unit-unassigned [data-member-id=\"5\"]')", "mouse: rimozione dal gruppo");
    assert.deepEqual(JSON.parse(await evaluate(lastAssign)), { memberId: 5, revision: 1, unitId: null, role: "" });
    assert.ok(await evaluate("document.getElementById('unit-unassigned').textContent.includes('Assegnazione conservata: Lupi')"), "assegnazione storica conservata");

    await evaluate("document.getElementById('new-unit').click()");
    assert.equal(await evaluate("document.getElementById('save-unit').textContent"), "Crea");
    await evaluate("document.getElementById('close-unit').click()");
    await evaluate("[...document.querySelectorAll('#units-hidden-list button')].find(button => button.textContent === 'Ripristina Lupi').click()");
    await waitFor("!!document.querySelector('[data-unit-id=\"5\"] [data-member-id=\"7\"]')", "ripristino invariato");

    await browser.load(390, 844, true);
    await evaluate("document.getElementById('units-branch').value = 'E/G'; document.getElementById('units-branch').onchange()");
    await waitFor(`!!document.querySelector('${lane(3, "Piede tenero")}')`, "E/G touch");
    const before = await evaluate("requests.length");
    await touchDrag(name(5), lane(3, "Piede tenero"), 0);
    await sleep(1200); // let the swipe fling finish before measuring the next gesture
    assert.equal(await evaluate("requests.length"), before, "uno swipe veloce scorre la pagina senza spostare");
    assert.equal(await evaluate("document.getElementById('member-dialog').open"), false);

    await touchDrag(name(5), lane(3, "Piede tenero"), 500);
    await waitFor(`!!document.querySelector('${lane(3, "Piede tenero")} [data-member-id="5"]')`, "touch: pressione lunga sul nome");
    assert.deepEqual(JSON.parse(await evaluate(lastAssign)), { memberId: 5, revision: 1, unitId: 3, role: "Piede tenero" });
    assert.equal(await evaluate("document.getElementById('member-dialog').open"), false);

    await touchDrag(`.unit-member[data-member-id="4"] .unit-grip`, lane(1, "Vice capo squadriglia"), 0);
    await waitFor(`!!document.querySelector('${lane(1, "Vice capo squadriglia")} [data-member-id="4"]')`, "touch: maniglia");

    await evaluate("document.getElementById('units-branch').value = 'L/C'; document.getElementById('units-branch').onchange()");
    await waitFor(`!!document.querySelector('${lane(4, "Sestigliere")}')`, "L/C");
    assert.equal(await evaluate("document.querySelector('[data-unit-id=\"4\"] svg path').getAttribute('fill')"), M.sestigliaColors.Blu);
    await touchDrag(name(2), lane(4, "Cucciolo"), 500);
    await waitFor(`!!document.querySelector('${lane(4, "Cucciolo")} [data-member-id="2"]')`, "touch L/C");
    assert.equal(await evaluate("document.getElementById('unit-unassigned').hidden"), true, "blocco nascosto senza soci disponibili");
    await touchDrag(name(1), lane(4, "Capo sestiglia"), 500);
    await waitFor(`!!document.querySelector('${lane(4, "Capo sestiglia")} [data-member-id="1"]')`, "touch L/C ruolo");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    assert.deepEqual(await evaluate("errors"), []);
  } finally {
    await browser?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
