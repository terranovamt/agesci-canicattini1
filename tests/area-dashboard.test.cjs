const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
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
    hidden: true,
    textContent: "",
    children: [],
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren() {
      this.children = [];
    },
    remove() {},
    setAttribute() {},
  });
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let subscriber;
  const window = {
    LIVE: { nas: true },
    NAS: { user: { admin: true } },
    ACCESSO: { verificata: () => true, request: async route => {
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
  assert.equal(get("dashboard-group-counts").children.length, 5);
  assert.equal(get("dashboard-group-counts").children[0].children[1].textContent, "3");
  assert.equal(get("dashboard-group-counts").children[2].children[1].textContent, "2");
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

test("non-admin dashboard does not request or show server statistics", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/js/area-dashboard.js"), "utf8");
  const element = () => ({ hidden: true, replaceChildren() {}, append() {} });
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

test("dashboard separates tools, summary and workflow into named sections", () => {
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/index.html"), "utf8");
  assert.match(html, /data-section-target="dashboard-work-panel"/);
  assert.match(html, /data-section-target="dashboard-assembly-panel">Assemblea di gruppo/);
  assert.match(html, /data-section-target="dashboard-summary-panel"/);
  assert.match(html, /id="activities-coming-title">Attività e campi/);
  assert.match(html, /In arrivo · da progettare/);
  assert.doesNotMatch(html.slice(html.indexOf('id="activities-coming-title"'), html.indexOf("</article>", html.indexOf('id="activities-coming-title"'))), /<a\b|<button\b/);
  assert.match(html, /<strong>Pubblica<\/strong><span>Pubblica le modifiche/);
  assert.doesNotMatch(html, /Salva sul NAS/);
  const assembly = html.slice(html.indexOf('<section class="dashboard-workflow"'), html.indexOf('</main>'));
  assert.equal((assembly.match(/class="tool-number"/g) || []).length, 3);
});

test("member and access actions fit and stay separated on the dashboard", { skip: !chrome }, () => {
  const root = path.join(__dirname, "..");
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const css = ["assets/css/theme.css", "assets/css/home.css", "assets/css/nas.css"].map(read).join("\n");
  const page = renderHtml(read("area-riservata/index.html"), "area-riservata/index.html")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, "")
    .replace("</head>", `<style>${css}</style></head>`)
    .replace("</body>", `<script>
      document.getElementById("riservata").hidden = false;
      document.getElementById("people-tool").hidden = false;
      const actions = [...document.querySelectorAll(".people-tool-actions .button")];
      const boxes = actions.map(action => action.getBoundingClientRect());
      const overview = document.getElementById("dashboard-group-overview");
      overview.hidden = false;
      const counts = document.getElementById("dashboard-group-counts");
      for (const [label, count, className] of [
        ["Totale censiti", 145, "group-census-total"], ["L/C", 42, "group-census-branch"],
        ["E/G", 58, "group-census-branch"], ["R/S", 35, "group-census-branch"],
        ["Adulti", 10, "group-census-branch"],
      ]) {
        const item = document.createElement("div"), term = document.createElement("dt"), value = document.createElement("dd");
        item.className = className; term.textContent = label; value.textContent = String(count);
        item.append(term, value); counts.append(item);
      }
      const countRects = [...counts.children].map(item => item.getBoundingClientRect());
      const activity = document.querySelector(".dashboard-tool-coming");
      const activityRect = activity.getBoundingClientRect();
      const result = document.createElement("pre");
      result.id = "layout-result";
      result.textContent = JSON.stringify({
        width: innerWidth,
        fits: document.documentElement.scrollWidth <= innerWidth,
        controlsFit: boxes.every(box => box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= innerWidth),
        separated: boxes[0].right + 10 <= boxes[1].left || boxes[0].bottom + 10 <= boxes[1].top,
        censusFits: countRects.length === 5 && countRects.every(box => box.width >= 44 && box.left >= 0 && box.right <= innerWidth),
        activityFits: activityRect.width >= 44 && activityRect.left >= 0 && activityRect.right <= innerWidth &&
          activity.textContent.includes("In arrivo") && activity.querySelectorAll("a,button").length === 0,
        links: actions.map(action => action.getAttribute("href")),
      });
      document.body.append(result);
    </script></body>`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-layout-"));
  try {
    const file = path.join(directory, "fixture.html");
    for (const width of [375, 768, 1024, 1440]) {
      fs.writeFileSync(file, `<!doctype html><body><iframe style="border:0;width:${width}px;height:1000px"></iframe><script>
        const frame = document.querySelector("iframe");
        frame.onload = () => {
          const result = frame.contentDocument.getElementById("layout-result");
          if (result) document.body.append(result.cloneNode(true));
        };
        frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
      </script>`);
      const browser = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + path.join(directory, "profile-" + width),
        "--window-size=" + width + ",1000", "--virtual-time-budget=3000", "--dump-dom", "file://" + file],
      { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      assert.equal(browser.status, 0, browser.stderr);
      const result = browser.stdout.match(/<pre id="layout-result">([^<]+)<\/pre>/)?.[1];
      assert.ok(result, browser.stdout.slice(-2000));
      const measured = JSON.parse(result);
      assert.equal(measured.width, width);
      assert.equal(measured.fits, true, "dashboard fits at " + width);
      assert.equal(measured.controlsFit, true, "buttons fit at " + width);
      assert.equal(measured.separated, true, "buttons are separated at " + width);
      assert.equal(measured.censusFits, true, "census summary fits at " + width);
      assert.equal(measured.activityFits, true, "activity placeholder is compact and noninteractive at " + width);
      assert.deepEqual(measured.links, ["soci.html", "persone.html"]);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
