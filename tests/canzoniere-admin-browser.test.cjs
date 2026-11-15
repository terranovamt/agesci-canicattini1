const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");
const { startNasDemo } = require("../tools/nas-demo.cjs");
const chrome = require("./helpers/chrome.cjs");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function browser(directory) {
  const child = spawn(chrome, ["--headless", "--no-sandbox", "--disable-gpu",
    "--disable-dev-shm-usage", "--remote-debugging-port=0", "--user-data-dir=" + directory, "about:blank"],
  { stdio: "ignore" });
  let port;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      port = (await fs.readFile(path.join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0];
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await delay(50);
    }
  }
  if (!port) {
    child.kill();
    throw new Error("Chrome did not start");
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let serial = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data), item = pending.get(message.id);
    if (item) {
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("CDP timeout: " + method));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  return {
    send,
    errors,
    async evaluate(expression) {
      const result = await send("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    async stop() {
      try {
        if (child.exitCode === null) {
          const closed = new Promise(resolve => child.once("exit", resolve));
          try {
            await send("Browser.close");
          } finally {
            if (child.exitCode === null) child.kill();
            await closed;
          }
        }
      } finally {
        socket.close();
      }
    },
  };
}

test("chiefs see Canzoniere management and leader playlist tools; public view has published playlists only",
  { skip: !chrome, timeout: 120000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agesci-canzoniere-chief-"));
    const app = await startNasDemo();
    let page;
    try {
      page = await browser(directory);
      const base = app.origin + "/agesci-canicattini1/area-riservata/";
      const wait = async expression => {
        for (let attempt = 0; attempt < 200; attempt++) {
          if (await page.evaluate(expression)) return;
          await delay(25);
        }
        const state = await page.evaluate(`(() => ({
          url: location.href, user: window.NAS?.user,
          access: document.getElementById('canzoniere-admin-access-status')?.textContent,
          status: document.getElementById('canzoniere-admin-status')?.textContent,
          hidden: document.getElementById('canzoniere-admin')?.hidden,
        }))()`);
        throw new Error("Timed out waiting for: " + expression + " · " + JSON.stringify(state));
      };
      const go = async route => {
        await page.send("Page.navigate", { url: base + route });
        await wait("document.readyState === 'complete' && !!window.ACCESSO");
      };

      await go("");
      await page.evaluate(`ACCESSO.entra(${JSON.stringify(app.password)}, "23816938")`);
      await page.evaluate(`(async () => {
        const people = (await ACCESSO.request("people")).people;
        const chief = people.find(person => person.serviceBranch === "E/G") || people[0];
        if (!chief) throw new Error("Nessun capo di test disponibile");
        await ACCESSO.request("people/" + chief.id, "PATCH", { serviceBranch: "E/G" });
        await ACCESSO.request("auth/view-as", "POST", { personId: chief.id });
      })()`);
      await go("");
      await wait("!NAS.user.admin && NAS.user.serviceBranch === 'E/G'");
      await wait("!document.getElementById('riservata').hidden");
      assert.deepEqual(await page.evaluate(`(() => ({
        canzoniereTool: !document.getElementById("dashboard-canzoniere-tool").hidden,
        documentsLink: !!document.querySelector('.reserved-links a[href$="documenti.html"]'),
        canzoniereLink: !!document.querySelector('.reserved-links a[href$="canzoniere.html"]'),
      }))()`), { canzoniereTool: true, documentsLink: true, canzoniereLink: true });

      await go("canzoniere.html");
      await wait("!document.getElementById('canzoniere-admin').hidden && document.getElementById('canzoniere-admin-status').textContent === 'Catalogo aggiornato.'");
      assert.deepEqual(await page.evaluate(`(() => ({
        role: NAS.user.serviceBranch,
        newSong: document.getElementById("admin-new-song").checkVisibility(),
        leaderTab: [...document.querySelectorAll('#admin-section-nav button')]
          .some(button => button.textContent.trim() === 'Strumenti capi'),
      }))()`), { role: "E/G", newSong: true, leaderTab: true });
      await page.evaluate(`document.querySelector('[data-section-target="admin-leader-tools-panel"]').click()`);
      await wait("!document.getElementById('admin-leader-tools-panel').hidden");

      const query = await page.evaluate(`ACCESSO.request("canzoniere/songs?limit=100&offset=0")
        .then(data => data.songs.find(song => song.slug === "il-ponte-di-carta-demo").title)`);
      await page.evaluate(`(query => {
        const field = document.getElementById("leader-playlist-search");
        field.value = query;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        document.getElementById("leader-playlist-add-form")
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      })(${JSON.stringify(query)})`);
      await wait("document.querySelector('#leader-playlist-search-results button')?.textContent === 'Aggiungi'");
      await page.evaluate(`document.querySelector('#leader-playlist-search-results button').click()`);
      await wait("document.querySelectorAll('#leader-playlist-items .playlist-item').length === 1");

      await page.evaluate(`{
        const moment = document.getElementById("leader-playlist-moment");
        moment.value = "uscita";
        document.getElementById("leader-generate-moment").click();
      }`);
      await wait("document.querySelectorAll('#leader-generated-items .playlist-item').length > 0");
      await page.evaluate(`document.getElementById("leader-use-generated").click()`);
      await wait("document.querySelectorAll('#leader-playlist-items .playlist-item').length === 2");
      assert.deepEqual(await page.evaluate(`(() => ({
        personalCount: document.querySelectorAll('#leader-playlist-items .playlist-item').length,
        generatedCount: document.querySelectorAll('#leader-generated-items .playlist-item').length,
        publicIndexTools: !!document.getElementById('personal-playlist-title') ||
          !!document.getElementById('playlist-generator-title'),
      }))()`), { personalCount: 2, generatedCount: 1, publicIndexTools: false });

      await page.send("Page.navigate", { url: app.origin + "/agesci-canicattini1/canzoniere/" });
      await wait("document.readyState === 'complete' && document.getElementById('song-list')?.getAttribute('aria-busy') === 'false'");
      assert.deepEqual(await page.evaluate(`(() => ({
        personal: !!document.getElementById('personal-playlist-title'),
        generator: !!document.getElementById('playlist-generator-title'),
        published: document.querySelectorAll('#published-playlists li').length,
      }))()`), { personal: false, generator: false, published: 1 });
      assert.deepEqual(page.errors, []);
    } finally {
      if (page) await page.stop();
      await app.stop();
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
