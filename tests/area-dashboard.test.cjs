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
    append(child) {
      this.children.push(child);
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
    ACCESSO: { verificata: () => true },
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
    ACCESSO: { verificata: () => true },
    NAS_METRICS: { watch() { throw new Error("Non-admin must not request summary"); } },
  };
  vm.runInNewContext(source, {
    window, document: { getElementById: get, createElement: element, head: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => [] }), Date,
  });
  window.AREA_DASHBOARD.load();
  assert.equal(get("dashboard-metrics").hidden, true);
});

test("dashboard separates tools, summary and workflow into named sections", () => {
  const html = fs.readFileSync(path.join(__dirname, "../area-riservata/index.html"), "utf8");
  assert.match(html, /data-section-target="dashboard-work-panel"/);
  assert.match(html, /data-section-target="dashboard-assembly-panel">Assemblea di gruppo/);
  assert.match(html, /data-section-target="dashboard-summary-panel"/);
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
      const result = document.createElement("pre");
      result.id = "layout-result";
      result.textContent = JSON.stringify({
        width: innerWidth,
        fits: document.documentElement.scrollWidth <= innerWidth,
        controlsFit: boxes.every(box => box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= innerWidth),
        separated: boxes[0].right + 10 <= boxes[1].left || boxes[0].bottom + 10 <= boxes[1].top,
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
      assert.deepEqual(measured.links, ["soci.html", "persone.html"]);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
