const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { spawn } = require("node:child_process");
const http = require("node:http");

const root = path.join(__dirname, "../area-riservata/assemblea");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("public presentation reserves the live bar and device safe areas", () => {
  const html = read("index.html");
  const live = read("core/live.js");
  const portrait = read("slides/portrait/base.js");
  assert.match(html, /viewport-fit=cover/);
  assert.match(live, /height:\s*calc\(76px \+ env\(safe-area-inset-bottom/);
  assert.match(live, /button\{[^}]*height:44px;min-width:44px/s);
  assert.match(live, /button:focus-visible/);
  assert.match(portrait, /getBoundingClientRect\(\)\.height/);
  assert.match(portrait, /--lv-safe-\$\{side\}/);
  assert.match(portrait, /id: scenes\[si\]\?\.id, index: si, step: sk/);
  assert.match(portrait, /if \(si !== index \|\| sk !== position\.step\) go\(index, position\.step\)/);
  assert.match(portrait, /const returnPosition = saved \? \{ \.\.\.saved \} : null/);
});

test("live status explains waiting, connection loss, review, and returning live", () => {
  const live = read("core/live.js");
  for (const phrase of [
    "In attesa della diretta",
    "Connessione interrotta",
    "Aggiornamento automatico",
    "Stai rivedendo",
    "Torna alla diretta",
  ]) {
    assert.ok(live.includes(phrase), `missing public status copy: ${phrase}`);
  }
  assert.match(live, /role="status" aria-live="polite"/);
  assert.match(live, /aria-hidden="true" tabindex="-1"/);
  assert.match(live, /prefers-reduced-motion:reduce/);
});

test("ODG items are ordered, keyboard-operable controls without slide bubbling", () => {
  const landscape = read("slides/landscape/ordine_del_giorno.js");
  const portrait = read("slides/portrait/ordine_del_giorno.js");
  const base = read("core/base.js");
  const live = read("core/live.js");
  const vista = read("core/vista.js");
  const motore = read("core/motore.js");
  for (const source of [landscape, portrait]) {
    assert.match(source, /<ol class="(?:odg|odp)-list"/);
    assert.match(source, /<button type="button"/);
    assert.match(source, /tabIndex = i < k \? 0 : -1/);
  }
  assert.match(base, /ev\.stopPropagation\(\)/);
  assert.match(live, /if \(e\.target\.closest\?\.\("\[data-live-control\]"\)\) return;/);
  assert.match(live, /html\.votazione-attiva #lv-bar\{display:none!important\}/);
  assert.match(vista, /if \(e\.target\.closest\?\.\('\[data-live-control\]'\)\) return;/);
  assert.match(motore, /e\.target\.closest\?\.\('\[data-live-control\]'\)/);
});

test("preview context stays outside the slide stage and off the projector view", () => {
  const vista = read("core/vista.js");
  assert.match(vista, /if \(V === 'anteprima'\)/);
  assert.match(vista, /id = 'vista-context'/);
  assert.match(vista, /Anteprima · solo visualizzazione/);
  assert.match(vista, /#nav,#cnt,#lv-bar\{display:none!important\}/);
  assert.match(read("slides/landscape/ordine_del_giorno.js"), /window\.LIVE\?\.vista !== 'schermo'/);
});

test("six viewports: static/live stage, QR, controls, keyboard and resize preserve navigation", { timeout: 90000 }, async (t) => {
  const profile = fs.mkdtempSync(path.join(process.cwd(), ".presentation-chrome-"));
  const chromeExecutable = process.env.CHROME_BIN || (process.platform === "win32"
    ? path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")
    : "/usr/bin/google-chrome");
  const scripts = [
    "core/base.js", "slides/landscape/qr_live.js", "slides/landscape/ordine_del_giorno.js",
    "core/motore.js", "slides/portrait/base.js", "slides/portrait/ordine_del_giorno.js", "core/live.js",
  ];
  const fixture = (mode) => `<!doctype html><meta charset="utf-8">
    <link rel="stylesheet" href="/assets/css/theme.css">
    ${["core/base.css", "slides/landscape/qr_live.css", "slides/portrait/base.css"].map((f) =>
      `<link rel="stylesheet" href="/area-riservata/assemblea/${f}">`).join("")}
    <body><div id="stage"><div id="ph"></div><div id="hdr" class="hd off"><span></span><img></div>
    <div id="prog"></div><div id="cnt"></div><div id="pm"></div></div><div id="msg"></div>
    <script>
      window.LIVE={ruolo:"${mode === "live" ? "pubblico" : "locale"}",vista:${mode === "preview" ? '"anteprima"' : 'null'},url:"/mock",limite:"massimo"};
      window.VOTO={poll:null,config(){},on(fn){window.voteLockListener=fn;fn(this.poll);return()=>{window.voteLockListener=null}}};
      window.EventSource=class {constructor(){window.stream=this;this.handlers={}}addEventListener(n,f){this.handlers[n]=f}};
      window.fetch=async()=>({ok:true,json:async()=>({pos:2000,max:2000})});
      let pdfBusy=false;async function exportPdf(){}
    </script>
    ${scripts.map((f) => `<script src="/area-riservata/assemblea/${f}"></script>`).join("")}
    ${mode === "preview" ? '<script src="/area-riservata/assemblea/core/vista.js"></script>' : ""}
    <script>
      window.DATI={assemblea:{titolo:"Assemblea di Gruppo 2026"},slide:[
        {id:"qr",tipo:"slide_qr_live",data_ora:"2099-11-20T20:30:00"},
        {id:"odg",tipo:"slide_ordine_del_giorno",punti:[
          {testo:"Presentazione del programma",slide_collegata:"fine"},
          {testo:"Approvazione del rendiconto",slide_collegata:"fine"},
          "Conclusioni e prossimi appuntamenti"]},
        {id:"fine",tipo:"slide_qr_live",data_ora:"2099-11-20T20:30:00"}]};
      start(window.DATI);
      if(window.stream) stream.handlers.put({data:JSON.stringify({path:"/",data:{pos:2000,max:2000}})});
      window.ready=true;
    </script>`;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/fixture")) {
      res.setHeader("Content-Type", "text/html");
      return res.end(fixture(req.url.includes("live") ? "live" : req.url.includes("preview") ? "preview" : "static"));
    }
    const file = path.join(process.cwd(), decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(process.cwd() + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); return res.end(); }
      const ext = path.extname(file);
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" }[ext] || "application/octet-stream");
      res.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const chrome = spawn(chromeExecutable, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe", `--user-data-dir=${profile}`,
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  let seq = 0, buffer = "";
  const requests = new Map();
  chrome.stdio[4].on("data", (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
      if (requests.has(message.id)) {
        const { resolve, reject, timer } = requests.get(message.id);
        clearTimeout(timer);
        requests.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    requests.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
  });
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.bringToFront", {}, sessionId);
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const dimensions = [[1920, 1080], [1366, 768], [820, 1180], [390, 844], [1180, 820], [844, 390]];
    for (const mode of ["static", "live", "preview"]) {
      const live = mode === "live";
      for (const [width, height] of dimensions) {
        await t.test(`${mode} ${width}x${height}`, async () => {
          await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
          await send("Emulation.setTouchEmulationEnabled", { enabled: width <= 1180, maxTouchPoints: 5 }, sessionId);
          await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/fixture-${mode}` }, sessionId);
          await evaluate(`new Promise((resolve,reject)=>{let n=0;const wait=()=>window.ready?resolve(true):++n>200?reject(Error("fixture not ready")):setTimeout(wait,20);wait()})`);
          const protectedControl = await evaluate(`(()=> {
            const button=document.createElement("button");button.dataset.liveControl="";
            document.body.append(button);
            const before=[si,sk];
            button.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:innerWidth*.8}));
            const afterClick=[si,sk];
            button.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"ArrowRight"}));
            const afterKey=[si,sk];
            const start=new Event("touchstart",{bubbles:true});
            Object.defineProperty(start,"touches",{value:[{clientX:100}]});
            button.dispatchEvent(start);
            const end=new Event("touchend",{bubbles:true,cancelable:true});
            Object.defineProperty(end,"changedTouches",{value:[{clientX:0}]});
            button.dispatchEvent(end);
            const afterTouch=[si,sk];button.remove();
            return {before,afterClick,afterKey,afterTouch};
          })()`);
          assert.deepEqual(protectedControl.afterClick, protectedControl.before, "control clicks must not advance the presentation");
          assert.deepEqual(protectedControl.afterKey, protectedControl.before, "control keys must not advance the presentation");
          assert.deepEqual(protectedControl.afterTouch, protectedControl.before, "control touches must not swipe the presentation");
          const metrics = await evaluate(`(async()=>{
            INST=true;go(0,0);await document.fonts.ready;fit();
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            await Promise.all(cur.r.getAnimations().map(a=>a.finished.catch(()=>{})));
            const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
            const stage=rect(st), qr=rect(cur.r.querySelector(".qrq img")), bar=document.getElementById("lv-bar");
            const k=stage.width/parseFloat(st.style.width);
            const context=document.getElementById("vista-context");
            return {stage,qr,context:context?rect(context):null,portrait:document.body.classList.contains("pm"),bar:bar?rect(bar):null,
              subtitle:parseFloat(getComputedStyle(cur.r.querySelector(".qrs")).fontSize)*k,
              unit:parseFloat(getComputedStyle(cur.r.querySelector(".qrt span")).fontSize)*k,
              controls:bar?[...bar.querySelectorAll("button")].filter(e=>!e.hidden).map(rect):[],
              labels:[...cur.r.querySelectorAll(".qra,.qrc")].map(rect)};
          })()`);
          assert.equal(metrics.portrait, width < height && width <= 1024);
          const availableHeight = height - (live ? metrics.bar.height : metrics.context?.height || 0);
          assert.ok(metrics.stage.x >= -1 && metrics.stage.y >= -1);
          assert.ok(metrics.stage.right <= width + 1 && metrics.stage.bottom <= availableHeight + 1);
          if (!metrics.portrait) assert.ok(Math.abs(metrics.stage.width / metrics.stage.height - 16 / 9) < .001);
          assert.ok(Math.abs(metrics.qr.width - metrics.qr.height) < 1);
          assert.ok(metrics.qr.width >= 180, `QR width ${metrics.qr.width}`);
          assert.ok(metrics.subtitle >= 13 && metrics.unit >= 12, JSON.stringify(metrics));
          for (const rect of [metrics.qr, ...metrics.labels]) {
            assert.ok(rect.x >= metrics.stage.x - 1 && rect.right <= metrics.stage.right + 1, JSON.stringify(metrics));
            assert.ok(rect.y >= metrics.stage.y - 1 && rect.bottom <= metrics.stage.bottom + 1);
          }
          for (const control of metrics.controls) {
            assert.ok(control.width >= 44 && control.height >= 44);
            assert.ok(control.x >= 0 && control.right <= width);
          }
          if (mode === "preview") {
            assert.ok(metrics.context.y >= metrics.stage.bottom - 1, "preview context must be outside stage");
            assert.ok(metrics.labels.every((rect) => rect.bottom <= metrics.context.y + 1));
            const odg = await evaluate(`(async()=>{
              go(1,2);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
              await Promise.all(cur.r.getAnimations().map(a=>a.finished.catch(()=>{})));
              return {header:HD.getBoundingClientRect().bottom,content:cur.r.getBoundingClientRect().bottom,
                context:document.getElementById("vista-context").getBoundingClientRect().top};
            })()`);
            assert.ok(odg.header <= odg.context && odg.content <= odg.context + 1, "preview context must not overlap ODG");
          }
          if (live) {
            const unchanged = await evaluate(`(()=>{
              const rect=()=>[...document.querySelectorAll("#lv-bar button")].map(e=>{
                const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
              go(2,0);const before=rect();go(0,0);const after=rect();
              return JSON.stringify(before)===JSON.stringify(after);
            })()`);
            assert.equal(unchanged, true, "return-live reveal must not shift controls");
          }
          const stable = await evaluate(`(()=>{
            go(1,2);saved={i:2,k:0};
            const before=[si,sk,saved.i,saved.k];
            window.mobileLayout.rotate(true);window.mobileLayout.rotate(false);
            return {before,after:[si,sk,saved.i,saved.k],revealed:cur.r.querySelectorAll(".on").length};
          })()`);
          assert.deepEqual(stable.after, stable.before);
          assert.equal(stable.revealed, 2);
          await send("Emulation.setDeviceMetricsOverride", { width: height, height: width, deviceScaleFactor: 1, mobile: false }, sessionId);
          assert.deepEqual(await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>resolve([si,sk,saved.i,saved.k])))`), stable.before);
          await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
          await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>{cur.r.querySelector("button").focus();resolve(true)}))`);
          const outline = await evaluate(`getComputedStyle(document.activeElement).outlineStyle`);
          assert.notEqual(outline, "none");
          await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 }, sessionId);
          await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
          assert.deepEqual(await evaluate("[si,sk]"), [2, 0], "ODG keyboard activation must not advance twice");
          assert.deepEqual(await evaluate("back();[si,sk]"), [1, 2], "previous-slide link preserves its reveal step");
          if (live) {
            assert.deepEqual(await evaluate("go(2,999);[si,sk]"), [2, 0], "public navigation never exceeds the max limit");
            const idleFocus = await evaluate(`(()=>{
              document.getElementById("lv-p").focus();document.body.classList.add("idle");
              return getComputedStyle(document.getElementById("lv-bar")).pointerEvents;
            })()`);
            assert.equal(idleFocus, "auto", "keyboard-focused public controls remain usable when idle");
          }
          if (mode === "static" && width === 1920) {
            const lock = await evaluate(`(()=> {
              const open={id:1,slide:"odg",aperta:true};
              window.LIVE.ruolo="pubblico";window.VOTO.poll=open;window.voteLockListener(open);
              const forced=[si,sk];next();prev();const local=[si,sk];go(2,0,true);const remote=[si,sk];
              window.VOTO.poll={...open,aperta:false};window.voteLockListener(window.VOTO.poll);
              const resumed=[si,sk];
              window.LIVE.ruolo="locale";window.LIVE.vista="anteprima";window.VOTO.poll=open;window.voteLockListener(open);
              const preview=[si,sk];
              const screenPoll={...open,slide:"qr"};
              window.LIVE.vista="schermo";window.VOTO.poll=screenPoll;window.voteLockListener(screenPoll);
              const screen=[si,sk];window.VOTO.poll={...screenPoll,aperta:false};window.voteLockListener(window.VOTO.poll);
              const screenUnlocked=[si,sk];
              return {forced,local,remote,resumed,preview,screen,screenUnlocked,lockClass:document.documentElement.classList.contains("votazione-attiva")};
            })()`);
            assert.deepEqual(lock.forced, [1, 0], "opening a poll forces its slide");
            assert.deepEqual(lock.local, [1, 0], "local navigation is locked during the poll");
            assert.deepEqual(lock.remote, [1, 0], "remote navigation is deferred during the poll");
            assert.deepEqual(lock.resumed, [2, 0], "the latest remote position resumes after closing the poll");
            assert.deepEqual(lock.preview, [2, 0], "preview remains navigable");
            assert.deepEqual(lock.screen, [0, 0], "the public screen locks to the poll slide");
            assert.deepEqual(lock.screenUnlocked, [0, 0]);
            assert.equal(lock.lockClass, false);
          }
        });
      }
    }
  } finally {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await exited;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
