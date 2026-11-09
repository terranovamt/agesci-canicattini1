const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const { test } = require("node:test");
const { renderHtml } = require("../tools/site-layout.cjs");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);

test("access management shows only configured chiefs and allows only branch change and password reset", async () => {
  const elements = new Map();
  function element() {
    return {
      children: [], value: "", hidden: false, disabled: false, textContent: "", className: "",
      attributes: {}, classList: { toggle() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      click() { return this.onclick?.(); },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const root = path.join(__dirname, "..");
  const calls = [];
  const context = {
    window: {
      NAS: { user: { admin: true } },
      ACCESSO: { request: async (...args) => { calls.push(args); return { people: [
        { id: 1, name: "Admin example", code: "012345", kind: "capo", admin: true },
        { id: 2, name: "Configured chief", code: "012346", kind: "capo", loginEnabled: true, hasPassword: true, serviceBranch: "E/G" },
        { id: 3, name: "Unconfigured chief", code: "012348", kind: "capo", loginEnabled: false },
        { id: 4, name: "Youth example", code: "012347", kind: "ragazzo", loginEnabled: false },
        { id: 5, name: "Configured L/C chief", code: "012349", kind: "capo", loginEnabled: true, hasPassword: true, serviceBranch: "L/C" },
      ] }; } },
    },
    document: { getElementById: get, createElement: element, createTextNode: text => ({ textContent: text }) },
    confirm: () => true,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/persone.js"), "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  let branchGroups = get("people-list").children;
  assert.equal(branchGroups.length, 2);
  assert.deepEqual(branchGroups.map(group => group.children[0].textContent), ["L/C", "E/G"]);
  const lcFilter = get("people-branches").children.find(button => button.textContent.startsWith("L/C"));
  lcFilter.click();
  branchGroups = get("people-list").children;
  assert.equal(branchGroups.length, 1);
  assert.equal(branchGroups[0].children[0].textContent, "L/C");
  assert.equal(branchGroups[0].children[1].children[0].children[0].textContent, "Configured L/C chief · 012349");
  get("people-branches").children[0].click();
  branchGroups = get("people-list").children;
  const egGroup = branchGroups.find(group => group.children[0].textContent === "E/G");
  const cards = egGroup.children[1].children;
  assert.equal(cards.length, 1);
  assert.deepEqual(cards.map(card => card.children[0].textContent), ["Configured chief · 012346"]);
  assert.equal(get("people-app").hidden, false);
  assert.equal(get("people-branches").children[0].attributes["aria-pressed"], "true");
  assert.equal(get("people-count").textContent, "2 capi abilitati");
  const edit = cards[0].children[2];
  assert.equal(edit.children[0].children.length, 1);
  assert.equal(edit.children[1].children.length, 3);
  assert.equal(edit.children[1].children[1].disabled, true);
  const serviceLabel = edit.children[0].children[0];
  serviceLabel.children[1].value = "R/S";
  edit.onsubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  const branchUpdate = calls.find(call => call[1] === "PATCH");
  assert.equal(branchUpdate[0], "people/2");
  assert.equal(branchUpdate[2].serviceBranch, "R/S");
  assert.equal(Object.keys(branchUpdate[2]).length, 1);
  await edit.children[1].children[2].click();
  await new Promise(resolve => setImmediate(resolve));
  const passwordReset = calls.find(call => call[1] === "DELETE");
  assert.equal(passwordReset[0], "people/2/password");
  const html = fs.readFileSync(path.join(root, "area-riservata/persone.html"), "utf8");
  assert.doesNotMatch(html, /person-form|Aggiungi capo|name="name"|name="kind"/);
});

test("access management fits mobile, tablet, laptop and desktop without overlapping actions", { skip: !chrome }, () => {
  const root = path.join(__dirname, "..");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "people-access-layout-"));
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const css = ["assets/css/theme.css", "assets/css/home.css", "assets/css/nas.css"].map(read).join("\n");
  const page = renderHtml(read("area-riservata/persone.html"), "area-riservata/persone.html")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, "")
    .replace("</head>", `<style>${css}</style><script>
      window.NAS = { user: { admin: true } };
      window.ACCESSO = { request: async () => ({ people: [
        { id: 2, name: "Configured chief", code: "012346", kind: "capo",
          loginEnabled: true, hasPassword: true, serviceBranch: "E/G" }
      ] }) };
    </script></head>`)
    .replace("</body>", `<script>${read("assets/js/persone.js")}
      setTimeout(() => {
        const actions = [...document.querySelectorAll(".person-actions .button")];
        const boxes = actions.map(button => button.getBoundingClientRect());
        const out = document.createElement("pre");
        out.id = "layout-result";
        out.textContent = JSON.stringify({
          width: innerWidth,
          fits: document.documentElement.scrollWidth <= innerWidth,
          controlsFit: boxes.every(box => box.width >= 44 && box.left >= 0 && box.right <= innerWidth),
          actionsSeparate: boxes.every((box, index) => boxes.slice(index + 1).every(next =>
            box.right <= next.left + 1 || next.right <= box.left + 1 ||
            box.bottom <= next.top + 1 || next.bottom <= box.top + 1))
        });
        document.body.append(out);
      }, 50);
    </script></body>`);
  try {
    const file = path.join(directory, "fixture.html");
    for (const width of [375, 768, 1024, 1440]) {
      fs.writeFileSync(file, `<!doctype html><body><script>
        const frame = document.createElement('iframe');
        frame.style.cssText = 'border:0;width:${width}px;height:1000px';
        document.body.append(frame);
        frame.srcdoc = ${JSON.stringify(page).replace(/</g, "\\u003c")};
        const timer = setInterval(() => {
          const result = frame.contentDocument?.getElementById('layout-result');
          if (result) {
            const copy = document.createElement('pre');
            copy.id = 'layout-result';
            copy.textContent = result.textContent;
            document.body.append(copy);
            clearInterval(timer);
          }
        }, 50);
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
      assert.equal(measured.fits, true, "page must fit width " + width);
      assert.equal(measured.controlsFit, true, "actions must fit width " + width);
      assert.equal(measured.actionsSeparate, true, "actions must not overlap at width " + width);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
