const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { renderHtml } = require("../tools/site-layout.cjs");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);

test("dashboard does not load data or make requests before verified access", () => {
  const context = {
    window: { ACCESSO: { verificata: () => false } },
    document: {
      getElementById() {
        throw new Error("must not render before login");
      },
    },
    fetch() {
      throw new Error("must not request before login");
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), context);
  context.window.AREA_DASHBOARD.load();
});

test("NAS dashboard subscribes to an automatic summary and clears stale counters", async () => {
  const elements = new Map();
  const element = () => ({
    hidden: true, dataset: {},
    textContent: "",
    children: [],
    style: { setProperty(name, value) { this[name] = value; } },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren() {
      this.children = [];
    },
    remove() {},
    removeAttribute() {},
    setAttribute() {},
  });
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let subscriber;
  const window = {
    ACTIVITIES_MODEL: require("../assets/js/activities-model.js"),
    SOCI_MODEL: require("../assets/js/soci-model.js"),
    LIVE: { nas: true },
    NAS: { user: { admin: true } },
    ACCESSO: { verificata: () => true, request: async route => {
      if (route === "activities") return { events: [] };
      assert.equal(route, "members/overview");
      return { year: "2026", total: 3, branches: [
        { branch: "L/C", count: 1 }, { branch: "E/G", count: 2 },
        { branch: "R/S", count: 0 }, { branch: "Adulti", count: 0 },
      ] };
    } },
    DATI: { anno_esercizio: 2026, assemblea: { titolo: "Assemblea" }, slide: [] },
    NAS_METRICS: {
      watch(options) {
        subscriber = options;
      },
    },
  };
  const context = {
    window,
    document: {
      getElementById: get,
      createElement: element,
      head: {
        append(script) {
          script.onload();
        },
      },
    },
    fetch: async () => ({ ok: true, json: async () => [] }),
    Date,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), context);
  window.AREA_DASHBOARD.load();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(get("dashboard-group-overview").hidden, false);
  assert.match(get("dashboard-group-status").textContent, /anno 2026/);
  assert.match(get("dashboard-group-status").textContent, /esclusi i sospesi da oltre un anno/);
  assert.equal(get("dashboard-group-counts").children.length, 5);
  assert.equal(get("dashboard-group-counts").children[0].children[1].textContent, "3");
  assert.equal(get("dashboard-group-counts").children[2].children[1].textContent, "2");
  assert.equal(get("dashboard-group-counts").children[4].children[0].textContent, "Co.Ca.");
  assert.deepEqual(get("dashboard-group-counts").children.slice(1).map(item => item.style["--census-color"]),
    ["#b49526", "#398258", "#bc4e50", "#795699"]);
  assert.equal(subscriber.view, "summary");
  subscriber.render({
    enabled: true,
    sampledAt: Date.now(),
    traffic: { today: { visits: 4, connections: 8, errors: 0 }, liveStreams: 2 },
    resources: { host: null },
  });

  assert.equal(get("dashboard-visits").textContent, "4");
  assert.equal(get("dashboard-streams").textContent, "2");
  assert.equal(get("dashboard-cpu").textContent, "-");
  subscriber.error("Offline");
  assert.equal(get("dashboard-streams").textContent, "-");
});

test("branch dashboard highlights today's event, attendance, preparation and missing fees", async () => {
  const elements = new Map();
  const element = () => ({
    hidden: true, textContent: "", href: "", children: [], dataset: {},
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    setAttribute() {},
    removeAttribute() {},
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const model = require("../assets/js/activities-model.js");
  const window = {
    ACTIVITIES_MODEL: {
      ...model,
      liveProgram: () => ({ active: true, time: "09:00", current: { time: "09:00", title: "Lancio" }, next: null }),
    },
    NAS: { user: { admin: false, serviceBranch: "E/G" } },
    ACCESSO: { verificata: () => true, request: async route => {
      if (route === "activities") return { events: [{
        id: 12, branch: "E/G", kind: "uscita", title: "Campo invernale",
        date: today, endDate: today, feeCents: 1000,
        attendance: [
          { due: true, paidCents: 1000 }, { due: true, paidCents: 500 }, { due: false, paidCents: 0 },
        ],
        totals: { expected: 3000, paid: 1500, remaining: 1500 }, program: [{ title: "Lancio" }, { title: "Gioco" }],
        materials: [{ done: false }], shopping: [{ done: false }], tasks: [{ done: false }],
      }] };
      throw new Error("Non-admin must not request census overview");
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), {
    window, document: { getElementById: get, createElement: element, head: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => [] }), Date,
  });
  window.AREA_DASHBOARD.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("dashboard-event-panel").hidden, false);
  assert.equal(get("dashboard-event-title").textContent, "Campo invernale");
  assert.match(get("dashboard-event-details").textContent, /Oggi/);
  assert.match(get("dashboard-event-preparation").textContent, /2 momenti/);
  assert.match(get("dashboard-event-preparation").textContent, /3 da preparare/);
  assert.match(get("dashboard-fees-action").textContent, /Da ricevere \(2\)/);
  assert.match(get("dashboard-event-finances").textContent, /15,00/);
  assert.match(get("dashboard-event-finances").textContent, /15,00.*da ricevere/);
  assert.equal(get("dashboard-event-action").href, "attivita.html?event=12&vista=programma&ora=1");
  assert.match(get("dashboard-event-action").textContent, /Attività in corso/);
  assert.equal(get("dashboard-attendance-action").href, "attivita.html?event=12&vista=presenze");
  assert.equal(get("dashboard-fees-action").href, "attivita.html?event=12&vista=quote&filtro=unpaid");
  assert.match(get("dashboard-title").textContent, /capi E\/G/);
  assert.equal(get("dashboard-shortcuts-heading").hidden, false);
  assert.equal(get("dashboard-branch-tools").children.length, 3);
});

test("free activities hide fees even when attendance marks a member as due", async () => {
  const elements = new Map();
  const element = () => ({
    hidden: true, textContent: "", children: [], dataset: {},
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    setAttribute() {}, removeAttribute() {},
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let paidCents = 0;
  const model = require("../assets/js/activities-model.js");
  const window = {
    ACTIVITIES_MODEL: {
      ...model,
      liveProgram: () => ({ active: true, time: "09:00", current: { time: "09:00", title: "Riunione" }, next: null }),
    },
    NAS: { user: { serviceBranch: "L/C" } },
    ACCESSO: { verificata: () => true, request: async () => ({ events: [{
      id: 1, branch: "L/C", title: "Riunione gratuita", date: "2099-01-01",
      feeCents: 0, attendance: [{ status: "presente", due: true, paidCents }],
      totals: { expected: 0, paid: paidCents, remaining: 0 },
    }] }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), {
    window, document: { getElementById: get, createElement: element, head: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => [] }), Date,
  });
  window.AREA_DASHBOARD.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("dashboard-fees-action").hidden, true);
  assert.equal(get("dashboard-event-finances").textContent, "");
  paidCents = 500;
  await get("dashboard-event-retry").onclick();
  assert.equal(get("dashboard-fees-action").hidden, false, "existing payments remain accessible if the fee is removed");
  assert.match(get("dashboard-event-finances").textContent, /5,00/);
});

test("non-admin dashboard does not request or show server statistics", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8");
  const element = () => ({ hidden: true, dataset: {}, replaceChildren() {}, append() {} });
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const window = {
    LIVE: { nas: true }, NAS: { user: { admin: false } },
    ACCESSO: { verificata: () => true, request: async () => { throw new Error("Non-admin must not request census overview"); } },
    NAS_METRICS: { watch() { throw new Error("Non-admin must not request summary"); } },
  };
  vm.runInNewContext(source, {
    window, document: { getElementById: get, createElement: element, head: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => [] }), Date,
  });
  window.AREA_DASHBOARD.load();
  assert.equal(get("dashboard-metrics").hidden, true);
  assert.equal(get("dashboard-group-overview").hidden, true);
});

  for (const [branch, count, label] of [["L/C", 4, "Torneo sestiglie"],
    ["E/G", 3, "Specialità e brevetti"], ["R/S", 2, "Rover e scolte"]]) {
    test(`${branch} dashboard prioritizes its live activity and updates the current moment without reloading`, async () => {
      const elements = new Map();
      const element = () => ({
        hidden: true, textContent: "", children: [], attributes: {}, dataset: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        removeAttribute(key) { delete this.attributes[key]; },
        replaceChildren(...children) { this.children = children; },
        append(...children) { this.children.push(...children); },
      });
      const get = id => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      };
      let now = new Date("2027-01-05T08:30:00Z"), tick, focus, refreshMs, requests = 0;
      const model = require("../assets/js/activities-model.js");
      const window = {
        NAS: { user: { admin: false, serviceBranch: branch } },
        ACTIVITIES_MODEL: {
          nextEvent: events => model.nextEvent(events, now),
          liveProgram: event => model.liveProgram(event, now),
        },
        setInterval(callback, interval) { tick = callback; refreshMs = interval; },
        addEventListener(name, callback) { if (name === "focus") focus = callback; },
        ACCESSO: { verificata: () => true, request: async route => {
          assert.equal(route, "activities"); requests++;
          return { events: [
            { id: 8, date: "2027-01-01", endDate: "2027-01-05", branch: branch === "L/C" ? "E/G" : "L/C", title: "Altra branca" },
            { id: 9, date: "2027-01-06", branch, title: "Prossima riunione" },
            { id: 10, date: "2027-01-02", endDate: "2027-01-05", branch, title: "Ultimo giorno di campo", program: [
              { date: "2027-01-04", time: "22:00", title: "Ieri sera" },
              { date: "2027-01-05", time: "09:00", title: "Gioco", place: "Prato", description: "Preparare le squadre", materials: "Corde" },
              { date: "2027-01-05", time: "10:00", endTime: "10:15", title: "Cerchio" },
            ] },
          ] };
        } },
      };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), {
        window, document: { getElementById: get, createElement: element, head: { append() {} } },
        fetch: async () => ({ ok: true, json: async () => [] }), Date,
      });
      window.AREA_DASHBOARD.load();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(refreshMs, 30000);
      assert.equal(get("reserved-content").attributes["data-branch"], branch);
      assert.equal(get("dashboard-branch-tools").children.length, count);
      assert.ok(get("dashboard-branch-tools").children.some(link => link.textContent === label));
      assert.equal(get("dashboard-event-panel").attributes["data-active"], "true");
      assert.equal(get("dashboard-event-title").textContent, "Ultimo giorno di campo");
      assert.equal(get("dashboard-event-moment").textContent, "09:00 · Gioco");
      assert.match(get("dashboard-event-place").textContent, /Prato/);
      assert.match(get("dashboard-event-description").textContent, /Preparare le squadre/);
      assert.match(get("dashboard-event-materials").textContent, /Corde/);
      assert.match(get("dashboard-event-next").textContent, /10:00–10:15 · Cerchio/);
      assert.equal(get("dashboard-event-action").textContent, "Attività in corso");
      assert.equal(get("dashboard-attendance-action").textContent, "Presenze");
      assert.equal(get("dashboard-event-action").href, "attivita.html?event=10&vista=programma&ora=1");
      assert.equal(get("dashboard-attendance-action").href, "attivita.html?event=10&vista=presenze");
      assert.equal(get("dashboard-branch-tools").children[0].textContent, "Programma");
      assert.equal(get("dashboard-branch-tools").children[0].href, "attivita.html?event=10&vista=programma");
      now = new Date("2027-01-05T09:00:00Z");
      tick();
      assert.equal(get("dashboard-event-moment").textContent, "10:00–10:15 · Cerchio");
      now = new Date("2027-01-05T23:00:00Z");
      focus();
      assert.equal(get("dashboard-event-panel").hidden, true, "hide once the day's last scheduled moment has ended");
      now = new Date("2027-01-06T23:00:00Z");
      tick();
      assert.equal(get("dashboard-event-panel").attributes["data-active"], "false");
      assert.equal(get("dashboard-event-panel").hidden, true, "a future activity without a timed moment stays hidden");
      assert.equal(requests, 1, "clock updates must not reload the dashboard");
    });
  }
test("dashboard hides a future activity until its next moment is within 15 minutes", async () => {
  const elements = new Map();
  const element = () => ({
    hidden: true, textContent: "", children: [], attributes: {}, dataset: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let now = new Date("2027-01-05T06:22:00Z"), tick;
  const model = require("../assets/js/activities-model.js");
  const window = {
    NAS: { user: { admin: false, serviceBranch: "L/C" } },
    ACTIVITIES_MODEL: {
      nextEvent: events => model.nextEvent(events, now),
      liveProgram: event => model.liveProgram(event, now),
    },
    setInterval(callback) { tick = callback; },
    addEventListener() {},
    ACCESSO: { verificata: () => true, request: async route => route === "activities" ? {
      events: [{
        id: 8, date: "2027-01-06", branch: "L/C", title: "Riunione",
        program: [{ date: "2027-01-06", time: "15:30", title: "Accoglienza" }],
      }],
    } : { transfers: [] } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), {
    window, document: { getElementById: get, createElement: element, head: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => [] }), Date,
  });
  window.AREA_DASHBOARD.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("dashboard-event-panel").hidden, true, "at 07:22 the 15:30 activity is not useful");
  now = new Date("2027-01-06T14:14:00Z");
  tick();
  assert.equal(get("dashboard-event-panel").hidden, true, "keep it hidden 16 minutes before the start");
  now = new Date("2027-01-06T14:15:00Z");
  tick();
  assert.equal(get("dashboard-event-panel").hidden, false, "show it at the 15-minute threshold");
  assert.equal(get("dashboard-event-clock").textContent, "Inizia tra 15 min · ora di Roma");
});
test("admin census errors expose retry and recover without losing tools", async () => {
  const elements = new Map();
  const element = () => ({
    hidden: true, children: [], dataset: {}, style: { setProperty() {} },
    setAttribute() {},
    removeAttribute() {},
    replaceChildren() { this.children = []; },
    append(...children) { this.children.push(...children); },
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let failed = true, requests = 0;
  const window = {
    NAS: { user: { admin: true } }, SOCI_MODEL: require("../assets/js/soci-model.js"),
    ACTIVITIES_MODEL: require("../assets/js/activities-model.js"),
    ACCESSO: {
      verificata: () => true,
      request: async route => {
        if (route === "activities") return { events: [] };
        assert.equal(route, "members/overview");
        requests++;
        if (failed) throw new Error("Server non disponibile");
        return { year: 2026, total: 0, branches: [] };
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8"), {
    window, document: { getElementById: get, createElement: element, head: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => [] }), Date,
  });
  window.AREA_DASHBOARD.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("dashboard-group-retry").hidden, false);
  assert.equal(get("dashboard-group-counts").children.length, 0);
  assert.match(get("dashboard-group-status").textContent, /Server non disponibile/);
  failed = false;
  await get("dashboard-group-retry").onclick();
  assert.equal(get("dashboard-group-retry").hidden, true);
  assert.equal(get("dashboard-group-counts").children[0].children[1].textContent, "0");
  assert.match(get("dashboard-group-status").textContent, /anno 2026/);
  window.AREA_DASHBOARD.load();
  assert.equal(requests, 2, "repeated load must not duplicate subscriptions or requests");
});

test("dashboard presents one operational layout without tabs or duplicate document tools", () => {
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/index.html"), "utf8");
  const dashboard = fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8");
  assert.doesNotMatch(html, /data-section-(?:nav|target|panel)|section-nav\.(?:css|js)/);
  assert.match(dashboard, /\["Prede e specialità", "attivita\.html#paths-panel"\]/);
  assert.match(html, /class="dashboard-layout" id="dashboard-layout"/);
  assert.match(html, /id="dashboard-shortcuts-heading"[^>]*>Accesso rapido/);
  assert.match(html, /id="dashboard-branch-tools"[^>]*aria-label="Strumenti della tua branca"/);
  const documentsTool = html.slice(html.indexOf('<article id="documents-tool"'), html.indexOf("</article>", html.indexOf('<article id="documents-tool"')));
  assert.match(documentsTool, /<h2>Gestione documenti<\/h2>[\s\S]*Caricamento e organizzazione dei materiali del gruppo/);
  assert.match(documentsTool, /href="documenti.html">Carica o gestisci documenti/);
  assert.doesNotMatch(documentsTool, /\bhidden\b/);
  assert.doesNotMatch(html, /winter-camp-panel|winter-camp-tool|Campo invernale/);
  assert.doesNotMatch(html, /id="people-tool"|id="people-access-tool"|id="activities-tool"/);
  assert.match(html, /id="dashboard-documents-title">Documenti pubblicati/);
  assert.match(html, /class="dashboard-publication-notice"/);
  assert.doesNotMatch(html, /Benvenuto|Il gruppo, a colpo|Dal lavoro alla presentazione/);
  assert.match(html, /<article id="dashboard-metrics"[^>]*hidden>/);
  assert.match(html, /Riepilogo dei dati pubblicati, non della diretta/);
  assert.match(html, /<section id="dashboard-overview"[^>]*aria-labelledby="dashboard-overview-title"/);
  assert.match(html, /id="dashboard-overview-title"[^>]*>Gestione e risorse/);
  assert.doesNotMatch(html, /id="dashboard-more"|Altri strumenti/);
  assert.ok(html.indexOf('id="dashboard-overview"') < html.indexOf('id="documents-tool"'),
    "group tools are organized under the overview section");
  assert.match(html, /<form id="nas-login-form"[\s\S]*id="accesso-stato"[\s\S]*?<\/form>/);
  assert.match(html, /<form id="login-form"[\s\S]*id="legacy-accesso-stato"[\s\S]*?<\/form>/);
  assert.ok(html.indexOf('id="dashboard-group-overview"') < html.indexOf('id="dashboard-layout"'));
  assert.ok(html.indexOf('id="dashboard-event-panel"') < html.indexOf('id="dashboard-group-overview"'),
    "today's activity must come before administrative content in reading order");
  assert.doesNotMatch(html, /Salva sul NAS/);
  const assemblyStart = html.indexOf('<section class="dashboard-workflow dashboard-layout-wide"');
  const assembly = html.slice(assemblyStart, html.indexOf('</section>', assemblyStart));
  assert.match(assembly, /id="dashboard-assembly-title"/);
  assert.match(assembly, /href="assemblea\/setup.html"/);
  assert.match(assembly, /href="assemblea\/regia.html"/);
  assert.match(assembly, /href="assemblea\/guida.html"/);
  assert.doesNotMatch(assembly, /href="documenti.html"|<ol\b/);
  assert.equal((html.match(/href="documenti.html"/g) || []).length, 1);
});

function loginHarness({ nas = true, firstAccess = false, admin = false, serviceBranch = "LC" } = {}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: false, value: "", type: "password", disabled: false, dataset: {}, attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name === "data-state") this.dataset.state = value;
      },
      removeAttribute(name) { delete this.attributes[name]; },
      focus() { this.focused = true; },
      querySelector(selector) { return get(id + (selector.startsWith('label') ? "-password-label" : "-submit")); },
      querySelectorAll() { return [...elements.values()].filter(input => input.attributes['aria-invalid']); },
      insertBefore(child) { child.parent = this; },
    });
    return elements.get(id);
  };
  get("accesso-stato").parent = get("nas-login-form");
  get("legacy-accesso-stato").parent = get("login-form");
  get("esci").hidden = get("riservata").hidden = true;
  const calls = [];
  let releaseStatus, releaseLogin, loadCount = 0;
  const access = {
    verificata: () => false,
    chiave: () => "",
    request(route, method, data) {
      calls.push({ route, method, data });
      return new Promise(resolve => { releaseStatus = () => resolve({ firstAccess }); });
    },
    entra(...args) {
      calls.push({ args });
      return new Promise((resolve, reject) => {
        releaseLogin = error => error ? reject(new Error(error)) : resolve();
      });
    },
    esci: async () => { throw new Error("Server non raggiungibile"); },
  };
  const window = {
    ACCESSO: access,
    AREA_DASHBOARD: { load() { loadCount++; } },
    ...(nas ? { NAS: { user: { admin, serviceBranch } } } : {}),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/area-riservata.js"), "utf8"), {
    window, document: { getElementById: get }, location: { replace() {} },
  });
  return { get, calls, status: () => releaseStatus(), login: error => releaseLogin(error), loads: () => loadCount };
}

for (const firstAccess of [false, true]) {
  test(`NAS login keeps local feedback, password visibility and ${firstAccess ? "first access" : "password"} flow`, async () => {
    const app = loginHarness({ firstAccess });
    const get = app.get, form = get("nas-login-form"), status = get("accesso-stato");
    assert.equal(status.parent, form);
    get("census-code").value = "1234567";
    const check = form.onsubmit({ preventDefault() {} });
    assert.equal(status.dataset.state, "pending");
    assert.equal(form.attributes["aria-busy"], "true");
    assert.equal(get("census-code").disabled, true);
    app.status();
    await check;
    assert.equal(status.dataset.state, "");
    assert.equal(status.textContent, "");
    assert.equal(form.attributes["aria-busy"], "false");
    assert.equal(get("password-fields").hidden, false);
    assert.equal(get("confirmation-field").hidden, !firstAccess);
    assert.equal(get("nas-confirmation").required, firstAccess);
    assert.equal(get("nas-password").autocomplete, firstAccess ? "new-password" : "current-password");
    assert.equal(get("nas-password").focused, true);
    get("nas-password").value = "Password1!";
    get("nas-confirmation").value = "Password1!";
    get("toggle-nas-password").onclick();
    assert.equal(get("nas-password").type, "text");
    const failure = form.onsubmit({ preventDefault() {} });
    assert.match(status.textContent, /Accesso in corso/);
    app.login("Credenziali non valide");
    await failure;
    assert.equal(status.dataset.state, "error");
    assert.equal(status.attributes.role, "alert");
    assert.equal(get("nas-password").attributes["aria-invalid"], "true");
    assert.equal(get("nas-password").focused, true);
    assert.match(status.textContent, /Accesso non riuscito: Credenziali non valide/);
    assert.equal(get("nas-password").value, "");
    assert.equal(get("nas-password").type, "password");
    assert.equal(get("nas-login-form-submit").disabled, false);
    get("nas-password").value = get("nas-confirmation").value = "Password1!";
    const success = form.onsubmit({ preventDefault() {} });
    app.login();
    await success;
    const args = app.calls.at(-1).args;
    assert.equal(args[1], "1234567");
    assert.equal(args[2], firstAccess ? "Password1!" : undefined);
    assert.equal(get("login").hidden, true);
    assert.equal(get("riservata").hidden, false);
    assert.equal(get("esci").hidden, false);
    assert.equal(app.loads(), 1);
    await get("esci").onclick();
    assert.match(get("dashboard-session-status").textContent, /Uscita non riuscita/);
    assert.equal(status.textContent, "");
  });
}

test("changing census code clears password flow and feedback", async () => {
  const app = loginHarness({ firstAccess: true });
  const get = app.get;
  get("census-code").value = "1234567";
  const pending = get("nas-login-form").onsubmit({ preventDefault() {} });
  app.status();
  await pending;
  get("nas-password").value = get("nas-confirmation").value = "Password1!";
  get("census-code").value = "1234568";
  get("census-code").oninput();
  assert.equal(get("accesso-stato").textContent, "");
  assert.equal(get("password-fields").hidden, true);
  assert.equal(get("nas-password").disabled, true);
  assert.equal(get("nas-confirmation").disabled, true);
  assert.equal(get("nas-password").value, "");
});

for (const role of [
  { admin: true, serviceBranch: "" },
  { admin: false, serviceBranch: "E/G" },
  { admin: false, serviceBranch: "L/C" },
  { admin: false, serviceBranch: "" },
]) {
  test(`verified NAS role admin=${role.admin}, branch=${role.serviceBranch || "none"} keeps its permitted tools`, async () => {
    const app = loginHarness(role);
    app.get("census-code").value = "1234567";
    const check = app.get("nas-login-form").onsubmit({ preventDefault() {} });
    app.status();
    await check;
    const login = app.get("nas-login-form").onsubmit({ preventDefault() {} });
    app.login();
    await login;
    assert.equal(app.get("documents-tool").hidden, false);
    assert.equal(app.get("dashboard-assembly-panel").hidden, false);
    assert.equal(app.loads(), 1);
  });
}

test("legacy login distinguishes pending and error within its own form", async () => {
  const app = loginHarness({ nas: false });
  const get = app.get, form = get("login-form"), status = get("legacy-accesso-stato");
  get("chiave").value = " key ";
  form.onsubmit({ preventDefault() {} });
  assert.equal(status.parent, form);
  assert.equal(status.dataset.state, "pending");
  app.login("Chiave errata");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status.dataset.state, "error");
  assert.equal(get("login").hidden, false);
  form.onsubmit({ preventDefault() {} });
  app.login();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("riservata").hidden, false);
  assert.equal(status.textContent, "");
  assert.equal(app.loads(), 1);
});

test("unified dashboard and login adapt across six device layouts", { skip: !chrome }, t => {
  const root = path.join(__dirname, "..");
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const css = ["assets/css/theme.css", "assets/css/home.css", "assets/css/nas-metrics.css",
    "assets/css/nas.css"].map(read).join("\n");
  const page = renderHtml(read("area-riservata/index.html"), "area-riservata/index.html")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, "")
    .replace("</head>", `<style>${css}</style></head>`)
    .replace("</body>", `<script>
      const header = document.querySelector(".reserved-header");
      header.classList.add("reserved-navbar");
      const toggle = document.createElement("button");
      toggle.className = "reserved-menu-toggle";
      toggle.textContent = "Menu";
      const menu = document.createElement("div");
      menu.className = "reserved-menu";
      const nav = document.createElement("nav");
      nav.className = "reserved-links";
      const actions = document.createElement("div");
      actions.className = "reserved-actions";
      for (const [label, href] of [["Home capi", "./"], ["Attività", "attivita.html"], ["Soci", "soci.html"]]) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        nav.append(link);
      }
      const publicLink = document.createElement("a");
      publicLink.href = "../";
      publicLink.textContent = "Sito pubblico";
      actions.append(publicLink);
      menu.append(nav, actions);
      header.append(toggle, menu);
      document.getElementById("riservata").hidden = false;
      document.getElementById("esci").hidden = false;
      document.getElementById("dashboard-metrics").hidden = false;
      const shortcuts = document.getElementById("dashboard-branch-tools");
      shortcuts.hidden = false;
      for (const [label, href] of [["Tutte le attività", "attivita.html"],
        ["Libro soci", "soci.html"], ["Accessi capi", "persone.html"]]) {
        const link = document.createElement("a");
        link.className = "button";
        link.href = href;
        link.textContent = label;
        shortcuts.append(link);
      }
      document.getElementById("accesso-stato").textContent = "Accesso non riuscito: verifica le credenziali e riprova.";
      const feedback = document.getElementById("accesso-stato");
      feedback.dataset.state = "pending";
      const pendingColor = getComputedStyle(feedback).color;
      feedback.dataset.state = "error";
      const errorColor = getComputedStyle(feedback).color;
      const overview = document.getElementById("dashboard-group-overview");
      overview.hidden = false;
      const counts = document.getElementById("dashboard-group-counts");
      for (const [label, count, className] of [
        ["Totale censiti", 145, "group-census-total"], ["L/C", 42, "group-census-branch"],
        ["E/G", 58, "group-census-branch"], ["R/S", 35, "group-census-branch"],
        ["Co.Ca.", 10, "group-census-branch"],
      ]) {
        const item = document.createElement("div"), term = document.createElement("dt"), value = document.createElement("dd");
        item.className = className; term.textContent = label; value.textContent = String(count);
        item.append(term, value); counts.append(item);
      }
      document.getElementById("dashboard-assembly-title").textContent = "Assemblea del gruppo Canicattini 1";
      document.getElementById("dashboard-assembly-details").textContent =
        "Esercizio 2026 · Anno scout 2026/2027 · 9 novembre · Convocazioni: 18:00 / 19:00 · 12 slide visibili";
      for (let i = 0; i < 3; i++) {
        const li = document.createElement("li"), link = document.createElement("a");
        link.textContent = "Documento preparatorio del gruppo " + (i + 1);
        link.href = "../documents/pdf/documento-" + i + ".pdf";
        li.append(link); document.getElementById("dashboard-document-links").append(li);
      }
      const visible = control => control.checkVisibility() && !control.disabled;
      const measure = name => {
        const controls = [...document.querySelectorAll("a[href], button, summary, input")].filter(visible);
        const focusLink = document.querySelector('#documents-tool a');
        if (visible(focusLink)) focusLink.focus();
        return {
          name,
          navigationAvailable: visible(toggle) || [...menu.querySelectorAll("a, button")].some(visible),
          navigationHidden: !visible(toggle) && ![...menu.querySelectorAll("a, button")].some(visible),
          availableWidth: document.documentElement.clientWidth,
          fits: document.documentElement.scrollWidth <= innerWidth,
          touchFits: controls.every(control => {
            const box = control.getBoundingClientRect();
            return box.height >= 44 && box.width >= 44 && box.left >= 0 && box.right <= innerWidth;
          }),
          noClipping: controls.every(control => control.scrollWidth <= control.clientWidth + 1),
          keyboardFocus: focusLink.matches(":focus-visible") &&
            parseFloat(getComputedStyle(focusLink).outlineWidth) >= 3,
          contentWidth: Math.round(document.getElementById("reserved-content").getBoundingClientRect().width),
        };
      };
      const panels = [];
      document.getElementById("login").hidden = true;
      {
        const measured = measure("unified");
        measured.overviewVisible = visible(document.getElementById("dashboard-overview"));
        measured.allToolsVisible = ["documents-tool", "dashboard-assembly-panel",
          "dashboard-documents-title", "dashboard-metrics", "dashboard-group-overview"]
          .every(id => visible(document.getElementById(id)));
        measured.noTabs = !document.querySelector("[data-section-nav], [role=tab], [role=tablist]");
        measured.mainColumns = getComputedStyle(document.querySelector(".dashboard-layout")).gridTemplateColumns.split(" ").length;
        const documents = document.getElementById("documents-tool").getBoundingClientRect();
        const layout = document.getElementById("dashboard-layout").getBoundingClientRect();
        measured.documentsWide = Math.abs(documents.width - layout.width) < 1;
        const actions = [...document.querySelectorAll("#dashboard-branch-tools .button")];
        const boxes = actions.map(action => action.getBoundingClientRect());
        measured.separated = boxes.length === 3 && boxes.every((box, index) =>
          boxes.slice(index + 1).every(next => box.bottom <= next.top || box.right <= next.left));
        measured.links = actions.map(action => action.getAttribute("href"));
        measured.noDuplicateLinks = [...document.querySelectorAll("#dashboard-branch-tools a")].every(shortcut =>
          ![...document.querySelectorAll("#dashboard-overview a")].some(link =>
            link.getAttribute("href") === shortcut.getAttribute("href")));
        const rects = [...counts.children].map(item => item.getBoundingClientRect());
        measured.censusFits = rects.length === 5 && rects.every(box => box.width >= 44 && box.right <= innerWidth);
        measured.branchesOneRow = rects.slice(1).every(box => box.top === rects[1].top);
        measured.assemblyLinks = [...document.querySelectorAll(".dashboard-assembly-actions a")].map(link => link.getAttribute("href"));
        panels.push(measured);
      }
      document.getElementById("riservata").hidden = true;
      document.getElementById("esci").hidden = true;
      document.getElementById("login").hidden = false;
      document.getElementById("login-form").hidden = true;
      document.getElementById("nas-login-form").hidden = false;
      const login = [];
      for (const [name, password, confirmation] of [
        ["code", false, false], ["password", true, false], ["firstAccess", true, true],
      ]) {
        document.getElementById("password-fields").hidden = !password;
        document.getElementById("confirmation-field").hidden = !confirmation;
        for (const id of ["nas-password", "toggle-nas-password"]) document.getElementById(id).disabled = !password;
        for (const id of ["nas-confirmation", "toggle-nas-confirmation"]) document.getElementById(id).disabled = !confirmation;
        const measured = measure(name);
        delete measured.keyboardFocus;
        measured.cardWidth = Math.round(document.getElementById("login").getBoundingClientRect().width);
        login.push(measured);
      }
      const result = document.createElement("pre");
      result.id = "layout-result";
      result.textContent = JSON.stringify({
        width: innerWidth,
        height: innerHeight,
        feedbackDistinct: pendingColor !== errorColor,
        panels, login,
      });
      document.body.append(result);
    </script></body>`);
  const directory = path.join(root, ".dashboard-layout-" + process.pid);
  fs.mkdirSync(directory);
  try {
    const file = path.join(directory, "fixture.html");
    for (const [width, height] of [[1920, 1080], [1366, 768], [820, 1180], [390, 844], [1180, 820], [844, 390]]) {
      fs.writeFileSync(file, `<!doctype html><body><iframe style="border:0;width:${width}px;height:${height}px"></iframe><script>
        const frame = document.querySelector("iframe");
        frame.onload = () => {
          const result = frame.contentDocument.getElementById("layout-result");
          if (result) document.body.append(result.cloneNode(true));
        };
        frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
      </script>`);
      const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, "profile-" + width),
        "--window-size=" + width + "," + height, "--virtual-time-budget=1000", "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024,
        cwd: directory, env: { ...process.env, TMPDIR: "." } });
      assert.equal(browser.status, 0, browser.stderr);
      const result = browser.stdout.match(/<pre id="layout-result">([^<]+)<\/pre>/)?.[1];
      assert.ok(result, browser.stdout.slice(-2000));
      const measured = JSON.parse(result);
      assert.equal(measured.width, width);
      assert.equal(measured.height, height);
      assert.equal(measured.feedbackDistinct, true, "pending feedback is not styled as an error");
      for (const state of [...measured.panels, ...measured.login]) {
        const label = width + "x" + height + " " + state.name;
        assert.equal(state.fits, true, "page fits: " + label);
        assert.equal(state.touchFits, true, "all controls fit and are at least 44px: " + label);
        assert.equal(state.noClipping, true, "no clipped controls: " + label);
      }
      for (const state of measured.panels) assert.equal(state.navigationAvailable, true);
      for (const state of measured.login) assert.equal(state.navigationHidden, true,
        "reserved navigation stays hidden until login");
      for (const panel of measured.panels) {
        assert.equal(panel.overviewVisible, true, "group tools stay visible without an extra disclosure step");
        assert.equal(panel.allToolsVisible, true);
        assert.equal(panel.noTabs, true);
        assert.equal(panel.documentsWide, true, width + ": " + JSON.stringify(panel));
        assert.equal(panel.keyboardFocus, true);
        const cap = [width <= 600 ? 24 : 48, 1e5];
        assert.ok(Math.abs(panel.contentWidth - (width >= 900 ? panel.availableWidth * 0.8 : panel.availableWidth - cap[0])) <= 1);
      }
      const [tools] = measured.panels;
      assert.equal(tools.separated, true);
      assert.deepEqual(tools.links, ["attivita.html", "soci.html", "persone.html"]);
      assert.equal(tools.noDuplicateLinks, true);
      assert.equal(tools.censusFits, true);
      assert.equal(tools.branchesOneRow, true);
      assert.equal(tools.mainColumns, tools.availableWidth >= 800 ? 2 : 1);
      assert.deepEqual(tools.assemblyLinks, ["assemblea/setup.html", "assemblea/regia.html", "assemblea/guida.html"]);
      for (const login of measured.login) assert.equal(login.cardWidth, Math.min(login.availableWidth - 32, 580));
      t.diagnostic(`${width}x${height}: dashboard ${tools.contentWidth}px; login ${measured.login[0].cardWidth}px; ` +
        `main columns ${tools.mainColumns}; all tools visible`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dashboard shows confirmable transfers and attendance counts at first glance", () => {
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8");
  assert.ok(html.indexOf('id="dashboard-transfers-alert"') < html.indexOf('id="dashboard-event-panel"'));
  assert.match(html, /id="dashboard-event-presence"/);
  assert.match(source, /transfer\.canConfirm/);
  assert.match(source, /da segnare/);
});
