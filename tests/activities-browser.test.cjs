const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { startNasDev } = require("../tools/nas-dev.cjs");
const { startNasDemo } = require("../tools/nas-demo.cjs");

const chrome = ["google-chrome", "chromium", "chromium-browser"].find(command =>
  spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test("demo screens expose navigation, individual paths, clear attendance and compact program controls",
  { skip: !chrome, timeout: 120000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agesci-demo-ux-"));
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
        throw new Error("Timed out waiting for: " + expression);
      };
      const go = async route => {
        await page.send("Page.navigate", { url: base + route });
        await wait("document.readyState === 'complete' && !!window.ACCESSO");
      };
      const click = selector => page.evaluate(`{
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element?.checkVisibility()) throw new Error('Control not visible: ' + ${JSON.stringify(selector)});
        element.scrollIntoView({block:'nearest',inline:'nearest'}); element.click();
      }`);
      const shot = async name => {
        if (!process.env.ACTIVITIES_SCREENSHOTS) return;
        await fs.mkdir(process.env.ACTIVITIES_SCREENSHOTS, { recursive: true });
        const { data } = await page.send("Page.captureScreenshot", { format: "png" });
        await fs.writeFile(path.join(process.env.ACTIVITIES_SCREENSHOTS, name + ".png"), Buffer.from(data, "base64"));
      };
      await go("");
      await page.evaluate(`ACCESSO.entra(${JSON.stringify(app.password)}, '7654321')`);
      const context = await page.evaluate(`(async () => {
        const data = await ACCESSO.request('activities');
        const meeting = data.events.find(event=>event.kind==='riunione');
        const member = data.members.find(member=>member.id===data.paths[0].personId);
        const free = await ACCESSO.request('activities/events','POST',{branch:'L/C',kind:'riunione',
          title:'DEMO - Gratis',date:meeting.date,feeCents:0,program:[],tasks:[],
          attendance:[{personId:member.id,status:'presente',due:true,paidCents:0}]});
        return {member,meeting,free};
      })()`);
      for (const [label, width, height] of [["telefono",390,844], ["tablet",820,1180],
        ["portatile",1366,768], ["desktop",1920,1080]]) {
        await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width < 500 });
        await go("attivita.html");
        await wait("!document.getElementById('activities-app').hidden");
        assert.equal(await page.evaluate("document.getElementById('activities-search').closest('label').hidden"), false,
          "the 30-member branch exposes search");
        assert.equal(await page.evaluate("document.querySelector('.reserved-location a').textContent.includes('Home capi')"), true);
        assert.equal(await page.evaluate("document.querySelector('.reserved-location [aria-current=page]').textContent"), "Attività");
        assert.equal(await page.evaluate("!!document.querySelector('#events-list .activity-event-extra, #events-list .activity-participants, .event-help')"), false);
        assert.equal(await page.evaluate(`(() => {
          const free = [...document.querySelectorAll('#events-list article')].find(row=>row.textContent.includes('DEMO - Gratis'));
          return [...free.querySelectorAll('button,a')].some(control=>control.checkVisibility() && control.textContent.trim()==='Quote');
        })()`), false);
        await go("attivita.html?event=" + context.meeting.id + "&vista=presenze");
        await wait("document.getElementById('event-dialog')?.open");
        await click("#event-attendance [data-person-action]");
        assert.equal(await page.evaluate("document.querySelector('#event-attendance .activity-person').dataset.status"), "assente");
        assert.match(await page.evaluate("document.querySelector('#event-attendance [data-person-action]').textContent"), /Assente/);
        await click("#event-attendance [data-person-action]");
        assert.equal(await page.evaluate("document.querySelector('#event-attendance .activity-person').dataset.status"), "presente");
        assert.match(await page.evaluate("document.querySelector('#event-attendance [data-person-action]').textContent"), /Presente/);
        await shot(label + "-correzioni-presenze");
        await click('[data-event-view="programma"]');
        await page.evaluate("document.querySelector('.activity-program-extra').open=true");
        assert.equal(await page.evaluate("document.querySelectorAll('#event-program .activity-program-day-add').length === document.querySelectorAll('#event-program .activity-program-day').length && !document.getElementById('add-program-item')"), true,
          "each day has its own add action and the duplicate global action is gone");
        assert.equal(await page.evaluate(`[...document.querySelectorAll('.activity-program-item input[type=date]')].some(input=>input.checkVisibility())`), false);
        assert.equal(await page.evaluate(`[...document.querySelectorAll('#event-program button')].some(button=>/questo giorno/i.test(button.textContent))`), false);
        assert.equal(await page.evaluate(`(() => {
          const controls = [...document.querySelector('.program-material-row').querySelectorAll('input,button')];
          const boxes = controls.map(control=>control.getBoundingClientRect());
          return boxes.every(box=>Math.abs(box.top-boxes[0].top)<2 && box.right<=innerWidth &&
            box.left>=0 && box.height>=44);
        })()`), true, label + ": material controls stay on one row");
        if (width >= 1000)
          assert.ok(await page.evaluate("document.getElementById('event-dialog').getBoundingClientRect().width") >= Math.min(1100,width*.8));
        await shot(label + "-correzioni-programma");
        await click('#event-form button[type=submit]');
        await wait("!document.getElementById('event-dialog').open");
        assert.deepEqual(await page.evaluate(`ACCESSO.request('activities').then(data=>data.events.find(event=>event.id===${context.meeting.id}).program.map(moment=>moment.place))`),
          context.meeting.program.map(moment=>moment.place), "saving other edits preserves different legacy places");
        await go("soci.html?member=" + context.member.id + "&section=education");
        await wait("document.getElementById('member-dialog')?.open && !document.getElementById('member-panel-education').hidden");
        await wait("document.getElementById('member-paths')?.textContent.includes('Stagione di caccia')");
        assert.equal(await page.evaluate("document.getElementById('member-paths').textContent.includes('Percorso di un altro socio')"), false);
        assert.deepEqual(await page.evaluate("[...document.querySelectorAll('#member-section-nav [role=tab]')].map(tab=>tab.textContent.trim())"),
          ["Attività","Percorso","Anagrafica","Contatti","Genitori","Censimenti"]);
        await click("#member-tab-profile");
        await page.evaluate(`document.querySelector('#member-form [name="profile:givenName"]').value='Bozza personale'`);
        for (const id of ["contacts","guardians","censuses","education"]) {
          await click("#member-tab-" + id);
          assert.equal(await page.evaluate("document.querySelector('#member-form [name=\"profile:givenName\"]').value"), "Bozza personale");
        }
        if (width >= 1000)
          assert.ok(await page.evaluate("document.getElementById('member-dialog').getBoundingClientRect().width") >= Math.min(1100,width*.8));
        await shot(label + "-correzioni-socio");
        await go("attivita.html#paths-panel");
        await wait("!document.getElementById('activities-app').hidden && !document.getElementById('paths-panel').hidden");
        assert.equal(await page.evaluate("document.querySelectorAll('#paths-members .activity-path-unit').length"), 6);
        assert.equal(await page.evaluate("[...document.querySelectorAll('#paths-members .activity-path-unit')].every(group => group.open)"), true);
        assert.equal(await page.evaluate("[...document.querySelectorAll('#paths-members .activity-path-unit')].every(group => group.style.getPropertyValue('--unit-color') === group.style.getPropertyValue('--unit-color-secondary'))"), true,
          "L/C sestiglie use one color rather than a two-color patrol swatch");
        assert.equal(await page.evaluate("document.querySelector('.activity-more').hidden"), true,
          "the activity-model menu is hidden when this branch has no model");
        const firstPathLink = await page.evaluate("document.querySelector('#paths-members .activity-path-unit .path-member-link').getAttribute('href')");
        assert.match(firstPathLink, /soci\.html\?member=\d+&section=education/);
        await go(firstPathLink);
        await wait("document.getElementById('member-dialog')?.open && !document.getElementById('member-panel-education').hidden");
        await wait("document.getElementById('member-paths-list').textContent.includes('Stagione di caccia')");
        assert.match(await page.evaluate("document.getElementById('member-paths-list').textContent"), /Stagione di caccia/);
        assert.equal(await page.evaluate("document.getElementById('member-paths').textContent.includes('Percorsi individuali')"), false);
        const pathBeforeTick = await page.evaluate(`ACCESSO.request('activities').then(data =>
          data.paths.find(path => path.personId === Number(new URLSearchParams(location.search).get('member'))))`);
        const stepBeforeTick = await page.evaluate("document.querySelector('#member-paths-list input[type=checkbox]').checked");
        await click("#member-paths-list input[type=checkbox]");
        await wait(`ACCESSO.request('activities').then(data =>
          data.paths.find(path => path.id === ${pathBeforeTick.id})?.revision === ${pathBeforeTick.revision + 1})`);
        assert.equal(await page.evaluate("document.getElementById('member-paths-status').textContent"), "Salvato.");
        assert.notEqual(await page.evaluate("document.querySelector('#member-paths-list input[type=checkbox]').checked"), stepBeforeTick);
        const pathsBeforeProfile = await page.evaluate("ACCESSO.request('activities').then(data => data.paths)");
        assert.deepEqual(await page.evaluate("ACCESSO.request('activities').then(data => data.paths)"), pathsBeforeProfile,
          "opening a member path does not move or alter their prey");
        await page.evaluate("document.getElementById('member-dialog').close()");
        await go("attivita.html?member=" + context.member.id + "#paths-panel");
        await wait("!document.getElementById('activities-app').hidden && !document.getElementById('paths-panel').hidden");
        assert.equal(await page.evaluate("document.getElementById('paths-list').textContent.includes('Stagione di caccia')"), true);
        await click("#new-path");
        assert.equal(await page.evaluate("document.querySelector('#path-form [name=personId]').value"), String(context.member.id));
        assert.equal(await page.evaluate("document.documentElement.scrollWidth > innerWidth"), false);
        await page.evaluate("document.getElementById('path-dialog').close()");
      }
      await go("attivita.html?event=" + context.free.id + "&vista=programma");
      await wait("document.getElementById('event-dialog')?.open");
      assert.equal(await page.evaluate("document.querySelector('[data-event-view=quote]').hidden"), true);
      if (!await page.evaluate("document.getElementById('event-settings').open"))
        await click("#event-settings > summary");
      await page.evaluate(`{
        const place = document.getElementById('event-place');
        place.value='Base demo'; place.dispatchEvent(new Event('input',{bubbles:true}));
      }`);
      await click('#event-form button[type=submit]');
      await wait("document.getElementById('event-error').textContent.includes('momento')");
      assert.equal(await page.evaluate("document.getElementById('event-dialog').open"), true);
      assert.equal(await page.evaluate("document.getElementById('event-place').value"), "Base demo");
      await click("#event-program .activity-program-day[open] .activity-program-day-add");
      await page.evaluate(`{
        const title = document.querySelector('#event-program [name^="program-title-"]');
        title.value='Accoglienza'; title.dispatchEvent(new Event('input',{bubbles:true}));
      }`);
      await click('#event-form button[type=submit]');
      await wait("!document.getElementById('event-dialog').open");
      assert.equal(await page.evaluate(`ACCESSO.request('activities').then(data=>data.events.find(event=>event.id===${context.free.id}).program[0].place)`), "Base demo");
      assert.deepEqual(page.errors, []);
    } finally {
      if (page) await page.stop();
      await app.stop();
      await fs.rm(directory, { recursive:true, force:true });
    }
  });

test("branch chiefs land on today's program, including the last camp day, across four screen formats",
  { skip: !chrome, timeout: 120000 }, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agesci-live-browser-"));
    const app = await startNasDev({ basePath: "/agesci-canicattini1", censusCodes: "7654321,7654322,7654323" });
    let page;
    try {
      page = await browser(directory);
      const base = app.origin + "/agesci-canicattini1/area-riservata/";
      const wait = async expression => {
        for (let attempt = 0; attempt < 200; attempt++) {
          if (await page.evaluate(expression)) return;
          await delay(25);
        }
        throw new Error("Timed out waiting for: " + expression);
      };
      const go = async route => {
        await page.send("Page.navigate", { url: base + route });
        await wait("document.readyState === 'complete' && !!window.ACCESSO");
      };
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `{
        const RealDate = Date;
        window.Date = class extends RealDate {
          constructor(...args) { super(...(args.length ? args : ['2027-01-05T09:00:00Z'])); }
          static now() { return new RealDate('2027-01-05T09:00:00Z').getTime(); }
        };
      }` });
      await go("");
      await page.evaluate(`ACCESSO.entra(${JSON.stringify(app.password)}, '23816938')`);
      await page.evaluate(`(async () => {
        window.testChiefs = {};
        const people = (await ACCESSO.request('people')).people;
        for (const [index, branch] of ['L/C','E/G','R/S'].entries()) {
          const chief = people.find(person => person.code === String(7654321 + index));
          await ACCESSO.request('people/' + chief.id, 'PATCH', {serviceBranch:branch});
          window.testChiefs[branch] = chief.id;
          await ACCESSO.request('members', 'POST', {code:'49000'+index, branch,
            profile:{givenName:'Socio', surname:'Prova'}, values:branch === 'L/C' ? {sestiglia:'Bianchi'} :
              branch === 'E/G' ? {squadriglia:'Aironi'} : {}});
          await ACCESSO.request('activities/events', 'POST', {branch,
            kind:branch === 'R/S' ? 'route' : branch === 'E/G' ? 'uscita' : 'riunione',
            title:'Oggi con la branca ' + branch, date:branch === 'L/C' ? '2027-01-05' : '2027-01-02',
            endDate:'2027-01-05', attendance:[], tasks:[], program:[
              {date:'2027-01-04',time:'22:00',title:'Il momento di ieri'},
              {date:'2027-01-05',time:'09:00',title:'Gioco nel bosco',place:'Prato della base',
                description:'Dividere i ragazzi in squadre e spiegare il gioco.',materials:'Corde e cartelloni'},
              {date:'2027-01-05',time:'11:00',title:'Cerchio e verifica'}
            ].filter(item => branch !== 'L/C' || item.date === '2027-01-05')});
        }
      })()`);
      const chiefs = await page.evaluate("window.testChiefs");
      const images = [];
      const shot = async name => {
        const { data } = await page.send("Page.captureScreenshot", { format: "png" });
        images.push({ name, data });
        if (process.env.ACTIVITIES_SCREENSHOTS) {
          await fs.mkdir(process.env.ACTIVITIES_SCREENSHOTS, { recursive: true });
          await fs.writeFile(path.join(process.env.ACTIVITIES_SCREENSHOTS, name + ".png"), Buffer.from(data, "base64"));
        }
      };
      for (const [branch, color] of [["L/C", "rgb(211, 168, 23)"], ["E/G", "rgb(57, 130, 88)"], ["R/S", "rgb(188, 78, 80)"]]) {
        await page.evaluate(`ACCESSO.request('auth/view-as', 'POST', {personId:${chiefs[branch]}})`);
        for (const [label, width, height] of [["telefono",390,844], ["tablet",820,1180],
          ["portatile",1366,768], ["desktop",1920,1080]]) {
          await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width < 500 });
          await go("");
          await wait("document.getElementById('dashboard-event-title').textContent.startsWith('Oggi con')");
          const dashboard = await page.evaluate(`(() => {
            const panel = document.getElementById('dashboard-event-panel'), action = document.getElementById('dashboard-event-action');
            return {branch:document.getElementById('reserved-content').dataset.branch,
              title:document.getElementById('dashboard-title').textContent,
              color:getComputedStyle(panel).borderTopColor,
              first:panel.getBoundingClientRect().top < document.getElementById('dashboard-more').getBoundingClientRect().top,
              actionVisible:action.getBoundingClientRect().bottom <= innerHeight,
              overflow:document.documentElement.scrollWidth > innerWidth,
              now:document.getElementById('dashboard-event-moment').textContent,
              next:document.getElementById('dashboard-event-next').textContent,
              stats:!document.getElementById('dashboard-metrics').hidden,
              urls:[...document.querySelectorAll('#dashboard-branch-tools a')].map(link=>link.getAttribute('href'))};
          })()`);
          assert.equal(dashboard.branch, branch);
          assert.equal(dashboard.color, color);
          assert.equal(dashboard.first, true);
          assert.equal(dashboard.actionVisible, true, `${branch} ${label}: primary action must be above the fold`);
          assert.equal(dashboard.overflow, false);
          assert.equal(dashboard.stats, false);
          assert.equal(dashboard.now, "09:00 · Gioco nel bosco");
          assert.match(dashboard.next, /11:00 · Cerchio/);
          await shot(label + "-live-home-" + branch.replace("/", ""));
          await page.evaluate("document.getElementById('dashboard-event-action').click()");
          await wait("document.getElementById('event-dialog')?.open");
          assert.equal(await page.evaluate("document.activeElement.id"), "event-live");
          assert.equal(await page.evaluate("document.getElementById('event-live').hidden"), false);
          assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('#event-program .activity-program-item')].map(row => [
            row.querySelector('[name^="program-title-"]').value, row.dataset.timeState])`),
          branch === "L/C" ? [["Gioco nel bosco", "current"], ["Cerchio e verifica", "upcoming"]] :
            [["Il momento di ieri", "past"], ["Gioco nel bosco", "current"], ["Cerchio e verifica", "upcoming"]]);
          assert.match(await page.evaluate("document.getElementById('event-live-moment').textContent"), /Gioco nel bosco.*Prato della base.*Corde e cartelloni/);
          await shot(label + "-live-programma-" + branch.replace("/", ""));
          // A clock refresh must not reset unsaved attendance or reopen the editor.
          await page.evaluate(`{
            const select = document.querySelector('#event-attendance select');
            select.value='presente'; select.dispatchEvent(new Event('change',{bubbles:true}));
            dispatchEvent(new Event('focus'));
          }`);
          assert.equal(await page.evaluate("document.querySelector('#event-attendance select').value"), "presente");
          await page.evaluate("document.getElementById('event-live-attendance').click()");
          assert.equal(await page.evaluate("document.activeElement.matches('#event-attendance [data-person-action]')"), true);
          await page.evaluate("document.getElementById('event-dialog').close()");
          for (const href of dashboard.urls.filter(href => href.includes("#"))) {
            await go(href);
            await wait("!document.getElementById('activities-app').hidden");
            const id = href.split("#")[1];
            assert.equal(await page.evaluate(`document.getElementById(${JSON.stringify(id)}).hidden`), false, "branch shortcut opens its section");
          }
          t.diagnostic(branch + " " + label + ": live home, current program and shortcuts");
        }
        await page.evaluate("ACCESSO.request('auth/view-as', 'DELETE')");
      }
      assert.deepEqual(page.errors, []);
      if (process.env.ACTIVITIES_SCREENSHOTS) {
        await page.send("Emulation.setDeviceMetricsOverride", { width:1200,height:1800,deviceScaleFactor:1,mobile:false });
        await page.evaluate(`(async () => {
          document.body.replaceChildren();
          const canvas = document.createElement('canvas'); canvas.width=1200; canvas.height=1800;
          document.body.append(canvas); document.body.style='margin:0;background:white';
          const context = canvas.getContext('2d'); context.fillStyle='white'; context.fillRect(0,0,1200,1800);
          const shots = ${JSON.stringify(images.filter(image => image.name.includes("-live-home-")))};
          for (let i=0;i<shots.length;i++) {
            const image = new Image(); image.src='data:image/png;base64,'+shots[i].data; await image.decode();
            const x=Math.floor(i/4)*400,y=(i%4)*450;
            context.fillStyle='#222'; context.font='16px sans-serif'; context.fillText(shots[i].name,x+8,y+20);
            const scale=Math.min(390/image.width,420/image.height);
            context.drawImage(image,x+5,y+28,image.width*scale,image.height*scale);
          }
        })()`);
        const { data } = await page.send("Page.captureScreenshot", { format:"png" });
        await fs.writeFile(path.join(process.env.ACTIVITIES_SCREENSHOTS,"confronto-home-branche.png"),Buffer.from(data,"base64"));
      }
    } finally {
      if (page) await page.stop();
      await app.stop();
      await fs.rm(directory, { recursive:true, force:true });
    }
  });

async function browser(directory) {
  const child = spawn(chrome, ["--headless", "--no-sandbox", "--disable-gpu",
    "--disable-dev-shm-usage", "--remote-debugging-port=0", "--user-data-dir=" + directory, "about:blank"],
  { stdio: "ignore" });
  let port;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { port = (await fs.readFile(path.join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; }
    catch (error) { if (error.code !== "ENOENT") throw error; await delay(50); }
  }
  if (!port) { child.kill(); throw new Error("Chrome did not start"); }
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
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable"); await send("Page.enable");
  return {
    send, errors,
    async evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    async stop() { socket.close(); child.kill(); await new Promise(resolve => child.once("exit", resolve)); },
  };
}

test("login autofill, education dates, activities and progression work on four screen formats", { skip: !chrome, timeout: 120000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agesci-activities-browser-"));
  const app = await startNasDev({ basePath: "/agesci-canicattini1" });
  let page;
  try {
    page = await browser(directory);
    const base = app.origin + "/agesci-canicattini1";
    const wait = async expression => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await page.evaluate(expression)) return;
        await delay(25);
      }
      throw new Error("Timed out waiting for: " + expression);
    };
    const go = async route => {
      await page.send("Page.navigate", { url: base + "/area-riservata/" + route });
      await wait("document.readyState === 'complete' && !!window.ACCESSO");
    };
    const click = async selector => page.evaluate(`{
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element?.checkVisibility()) throw new Error('Control not visible: ' + ${JSON.stringify(selector)});
      element.scrollIntoView({block:'nearest'}); element.click();
    }`);
    const expand = async selector => {
      if (!await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).open`))
        await click(selector + " > summary");
    };
    const fill = async (selector, value, event = "input") => page.evaluate(`{
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input?.checkVisibility()) throw new Error('Field not visible: ' + ${JSON.stringify(selector)});
      input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles:true}));
    }`);
    const shot = async name => {
      const fits = await page.evaluate(`(() => {
        const dialog = document.querySelector('dialog[open]');
        const root = dialog || document.querySelector('main');
        const controls = [...root.querySelectorAll('input:not([type=checkbox]), textarea, select, button, a.button')]
          .filter(element => element.checkVisibility());
        const clipped = controls.filter(element => { const r = element.getBoundingClientRect();
          return r.width < 43 || r.height < 43 ||
            (!element.closest('.tournament-judging, .tournament-rankings') && (r.left < -1 || r.right > innerWidth + 1)); });
        const scrollRegionsFit = [...root.querySelectorAll('.tournament-judging, .tournament-rankings')]
          .filter(element => element.checkVisibility()).every(element => {
            const r = element.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth + 1 && element.tabIndex === 0;
          });
        return {page:document.documentElement.scrollWidth <= innerWidth,
          dialog:!dialog || dialog.scrollWidth <= dialog.clientWidth,
          scrollRegionsFit,
          clipped:clipped.map(element => element.outerHTML)};
      })()`);
      assert.equal(fits.page, true, name + ": page overflow");
      assert.equal(fits.dialog, true, name + ": dialog overflow");
      assert.equal(fits.scrollRegionsFit, true, name + ": accessible table scroll regions fit");
      assert.deepEqual(fits.clipped, [], name + ": clipped controls");
      if (process.env.ACTIVITIES_SCREENSHOTS) {
        await fs.mkdir(process.env.ACTIVITIES_SCREENSHOTS, { recursive: true });
        const dialog = await page.evaluate("!!document.querySelector('dialog[open]')");
        const { cssContentSize } = await page.send("Page.getLayoutMetrics");
        const image = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !dialog,
          ...(!dialog ? { clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } } : {}) });
        await fs.writeFile(path.join(process.env.ACTIVITIES_SCREENSHOTS, name + ".png"), Buffer.from(image.data, "base64"));
      }
    };
    for (const [label, width, height] of [["telefono", 390, 844], ["tablet", 820, 1180],
      ["portatile", 1366, 768], ["desktop", 1920, 1080]]) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
      await go("");
      if (label !== "telefono") {
        await page.evaluate("window.ACCESSO.esci()");
        await go("");
      }
      await wait("!document.getElementById('nas-login-form').hidden");
      await fill("#census-code", "23816938");
      await shot(label + "-01-login-codice");
      await click('#nas-login-form button[type="submit"]');
      await wait("!document.getElementById('password-fields').hidden && !document.getElementById('census-code').disabled");
      await fill("#nas-password", app.password);
      await fill("#census-code", "23816938");
      assert.equal(await page.evaluate("document.getElementById('password-fields').hidden"), false, "same-code autofill must not reset");
      await shot(label + "-02-login-password");
      await click('#nas-login-form button[type="submit"]');
      await wait("!document.getElementById('riservata').hidden");
      await wait("document.getElementById('dashboard-group-status').textContent.includes('censiment')");
      await shot(label + "-03-dashboard");
      if (label === "telefono") {
        await page.evaluate(`(async () => {
          window.ids = {};
          for (const [index, branch] of ['L/C','E/G','R/S'].entries()) {
            const values = branch === 'L/C' ? {sestiglia:'Bianchi'} :
              branch === 'E/G' ? {squadriglia:'Aironi'} : {};
            await ACCESSO.request('members','POST',{code:'12345'+index,branch,
              profile:{givenName:'Socio',surname:branch,birthDate:'2014-03-12'},values});
            await ACCESSO.request('members','POST',{code:'22345'+index,branch,
              profile:{givenName:'Zeta',surname:'Secondo '+branch,birthDate:'2014-03-12'},values});
          }
          const members = await ACCESSO.request('members');
          for (const member of members.members) if (member.kind === 'ragazzo') window.ids[member.branch] = member.id;
          for (const [title, done] of [['Astronomo',false],['Campeggiatore',true]]) {
            await ACCESSO.request('activities/paths','POST',{branch:'E/G',kind:'specialty',personId:window.ids['E/G'],
              title,closed:false,steps:[{title:'Concordare il progetto',done:true},{title:'Realizzare il progetto',done}]});
          }
        })()`);
      }
      await go("soci.html");
      await wait("!document.getElementById('members-app').hidden");
      await click(".member-name");
      await click('#member-tab-education');
      await wait("!document.getElementById('member-panel-education').hidden");
      const education = await page.evaluate(`(() => {
        const date = document.querySelector('[data-education-key="promessa"] input');
        const year = document.querySelector('[data-education-key="anno"] select');
        const a = date.getBoundingClientRect(), b = year.getBoundingClientRect();
        return {separate:a.right <= b.left || a.bottom <= b.top, stacked:a.bottom <= b.top};
      })()`);
      assert.equal(education.separate, true, label + ": date and year overlap");
      if (width < 500) assert.equal(education.stacked, true);
      await shot(label + "-04-percorso-socio");
      await click('[data-close="member-dialog"]');
      await page.evaluate(`[...document.querySelectorAll('.member-name')].find(button=>button.textContent.includes('L/C')).click()`);
      await click('#member-tab-education');
      await shot(label + "-04-percorso-LC");
      await go("attivita.html");
      await wait("!document.getElementById('activities-app').hidden");
      for (const branch of ["L/C", "E/G", "R/S"]) {
        await fill("#activities-branch", branch, "change");
        await shot(label + "-05-incontri-" + branch.replace("/", ""));
        await click("#new-event");
        assert.match(await page.evaluate("document.getElementById('event-save-state').textContent"), /Bozza non registrata/);
        assert.equal(await page.evaluate("document.querySelector('#event-form button[type=submit]').textContent.trim()"), "Salva attività");
        await expand('#event-program-view > details:last-child');
        await click('#event-tasks + button');
        assert.match(await page.evaluate("document.getElementById('event-save-state').textContent"), /modifiche non salvate/);
        const options = await page.evaluate("[...document.querySelector('#event-form [name=kind]').options].map(option => option.value)");
        assert.deepEqual(options, branch === "L/C" ? ["riunione", "caccia"] : branch === "E/G" ? ["riunione", "uscita"] : ["riunione", "route"]);
        await fill('#event-form [name=kind]', options[1], "change");
        await fill('#event-form [name=title]', "Incontro " + branch + " " + label);
        await fill('#event-form [name=date]', "2025-11-15");
        await click('[data-event-view="presenze"]');
        await click("#event-attendance [data-person-action]");
        assert.equal(await page.evaluate("document.querySelector('#event-attendance select').value"), "presente");
        await click('[data-event-view="programma"]');
        await expand("#event-settings");
        await fill('#event-form [name=fee]', "10.25");
        await click('[data-event-view="quote"]');
        assert.equal(await page.evaluate("document.querySelector('#event-attendance [data-due]') === null"), true);
        assert.equal(await page.evaluate("document.getElementById('event-totals').textContent.includes('20,50')"), true,
          "the quota is due by both members before any payment, including unrecorded attendance");
        await click("#event-attendance [data-person-action]");
        assert.equal(await page.evaluate("document.querySelector('#event-attendance [data-paid]').value"), "10.25");
        await fill('#event-attendance [data-paid]', "5");
        await click("#event-attendance .activity-person:nth-of-type(2) [data-person-action]");
        await page.evaluate(`{
          const row = document.querySelectorAll('#event-attendance .activity-person')[1];
          const paid = row.querySelector('[data-paid]'); paid.value='15';
          paid.dispatchEvent(new Event('input',{bubbles:true}));
        }`);
        assert.deepEqual(await page.evaluate(`(() => {
          const text = document.getElementById('event-totals').textContent;
          return ['20,50','20,00','5,25','4,75'].map(amount=>text.includes(amount));
        })()`), [true, true, true, true], "live amounts must keep excess separate from debt");
        await click('[data-event-view="programma"]');
        await fill('#event-tasks textarea', "Preparare i materiali");
        await shot(label + "-06-attivita-" + branch.replace("/", ""));
        await click('#event-form button[type=submit]');
        await wait("!document.getElementById('event-dialog').open");
        assert.equal(await page.evaluate("document.getElementById('activities-status').textContent"), "Attività salvata.");
        await shot(label + "-05-incontri-" + branch.replace("/", ""));
        assert.equal(await page.evaluate("!!document.querySelector('#events-list .activity-participants, #events-list .activity-event-extra')"), false);
        await click("#events-list button");
        assert.equal(await page.evaluate("document.querySelector('#event-attendance select').value"), "presente");
        if (branch !== "R/S") assert.match(await page.evaluate("document.querySelector('#event-attendance .activity-attendance-group > summary').textContent"),
          branch === "L/C" ? /Bianchi/ : /Aironi/);
        assert.equal(await page.evaluate("document.querySelector('#event-attendance [data-paid]').value"), "5.00");
        const memberUrl = await page.evaluate("document.querySelector('#event-attendance a.activity-person-profile').href");
        await click('[data-event-view="quote"]');
        await click("#event-attendance [data-person-action]");
        assert.equal(await page.evaluate("document.querySelector('#event-attendance [data-paid]').value"), "10.25",
          "suggest the cumulative balance, not another full payment on top of the advance");
        await fill('#event-attendance [data-paid]', "5");
        await shot(label + "-12-quote-" + branch.replace("/", ""));
        await expand("#event-filters");
        await fill("#event-member-filter", "unpaid", "change");
        assert.equal(await page.evaluate("[...document.querySelectorAll('#event-attendance .activity-person')].filter(row=>!row.hidden).length"), 1);
        assert.equal(await page.evaluate("document.getElementById('event-totals').textContent.includes('20,50')"), true);
        await fill("#event-member-filter", "", "change");
        await click('[data-event-view="programma"]');
        await expand('#event-program-view > details:last-child');
        await click("#event-tasks input[type=checkbox]");
        await click('#event-form button[type=submit]');
        await wait("!document.getElementById('event-dialog').open");
        await page.send("Page.navigate", { url: memberUrl });
        await wait("document.readyState === 'complete' && document.getElementById('member-dialog')?.open");
        await wait("document.getElementById('member-activities-summary').textContent.includes('partecipazion')");
        assert.equal(await page.evaluate("document.getElementById('member-activities').open"), true);
        await wait("document.querySelector('#member-activities-list a') !== null");
        assert.equal(await page.evaluate("document.getElementById('member-activities-list').textContent.includes('5,25')"), true);
        await shot(label + "-13-storico-" + branch.replace("/", ""));
        if (label === "telefono" && branch === "L/C") {
          await page.evaluate(`(async () => {
            const original = ACCESSO.request;
            let fail = true;
            ACCESSO.request = (...args) => {
              if (args[0].startsWith('activities/members/') && fail) {
                fail = false; return Promise.reject(new Error('Connessione interrotta'));
              }
              return original(...args);
            };
            const id = Number(new URLSearchParams(location.search).get('member'));
            await MEMBER_ACTIVITIES.load({id,kind:'ragazzo',branch:'L/C'});
            document.getElementById('member-activities').open = true;
          })()`);
          assert.equal(await page.evaluate("document.getElementById('member-activities-status').textContent.includes('Connessione interrotta')"), true);
          await click("#member-activities-retry");
          await wait("document.getElementById('member-activities-list').textContent.includes('5,25')");
        }
        await page.send("Page.navigate", { url: await page.evaluate("document.querySelector('#member-activities-list a').href") });
        await wait("document.readyState === 'complete' && document.getElementById('event-dialog')?.open");
        await wait("document.querySelector('#event-attendance [data-paid]')?.value === '5.00'");
        await click("#event-dialog [data-close]");
        if (branch === "R/S") {
          assert.equal(await page.evaluate("document.getElementById('paths-tab').hidden"), true);
          continue;
        }
        await click("#paths-tab");
        if (await page.evaluate("document.getElementById('paths-members').checkVisibility()")) {
          await page.send("Page.navigate", { url: await page.evaluate("document.querySelector('#paths-members a').href") });
          await wait("document.readyState === 'complete' && document.getElementById('member-dialog')?.open && !document.getElementById('member-panel-education').hidden");
          assert.equal(await page.evaluate("document.getElementById('member-paths').hidden"), false);
          await page.send("Page.navigate", { url: await page.evaluate("document.getElementById('member-paths-link').href") });
          await wait("document.readyState === 'complete' && !document.getElementById('activities-app')?.hidden && !document.getElementById('new-path')?.hidden");
        }
        if (label === "telefono") {
          await click("#new-path");
          if (branch === "L/C") {
            await click("#add-path-step");
            await fill('#path-steps textarea', "Collaborare con la sestiglia");
            await click("#add-path-step");
            await page.evaluate(`document.querySelectorAll('#path-steps textarea')[1].value='Prendersi cura del materiale'`);
            await shot(label + "-07-prede-definite");
            await click('#path-form button[type=submit]');
            await wait("!document.getElementById('path-dialog').open");
            assert.equal(await page.evaluate("document.querySelector('#paths-list .activity-state').textContent"), "Definito");
            await click("#paths-list .path-inline-steps input");
            assert.equal(await page.evaluate("document.querySelector('#paths-list .activity-state').textContent"), "In lavorazione");
            await fill("#activities-branch", "E/G", "change");
            assert.equal(await page.evaluate("document.querySelector('.activity-more').hidden"), false,
              "the activity model remains available for E/G");
            await fill("#activities-branch", "L/C", "change");
            assert.equal(await page.evaluate("document.querySelector('#paths-list .path-inline-steps input').checked"), true,
              "switching branch must preserve an unsaved path tick");
            await page.evaluate(`{
              const request = ACCESSO.request;
              let fail = true;
              ACCESSO.request = (...args) => {
                if (fail && args[0].startsWith('activities/paths/') && args[1] === 'PATCH') {
                  fail = false; return Promise.reject(new Error('Connessione interrotta'));
                }
                return request(...args);
              };
            }`);
            await click("#save-paths");
            await wait("document.getElementById('paths-save-status').textContent.includes('Connessione interrotta')");
            assert.equal(await page.evaluate("document.querySelector('#paths-list .path-inline-steps input').checked"), true);
            assert.equal(await page.evaluate("document.getElementById('paths-save-bar').hidden"), false,
              "a failed save must retain the draft and expose retry");
            await click("#save-paths");
            await wait("document.getElementById('paths-save-bar').hidden");
            await click("#paths-list .path-inline-steps label:nth-child(2) input");
            assert.equal(await page.evaluate("document.querySelector('#paths-list .activity-state').textContent"), "Conquistato");
            await click("#save-paths");
            await wait("document.getElementById('paths-save-bar').hidden");
            assert.equal(await page.evaluate("document.querySelector('#paths-list .activity-state').textContent"), "Conquistato",
              "all prey completed must not silently close the hunting season");
            await click("#new-path");
            await fill("#path-form [name=kind]", "specialty", "change");
            await fill("#path-form [name=title]", "Specialità senza caccia conclusa");
            await click("#add-path-step");
            await fill('#path-steps textarea', "Scegliere una tappa");
            await click('#path-form button[type=submit]');
            await wait("!document.getElementById('path-dialog').open");
            assert.equal(await page.evaluate("document.getElementById('paths-list').textContent.includes('Specialità senza caccia conclusa')"), true,
              "a specialty can start before explicitly closing the hunting season");
            await page.evaluate(`{
              const hunt = [...document.querySelectorAll('#paths-list .path-card')]
                .find(card => card.querySelector('.eyebrow').textContent === 'Stagione di caccia');
              hunt.querySelector(':scope > button').click();
            }`);
            await shot(label + "-08-stagione-conclusa");
            await click("#save-paths");
            await wait("document.getElementById('paths-save-bar').hidden");
            assert.equal(await page.evaluate("document.querySelector('#paths-list .activity-state').textContent"), "Conclusa");
            await click("#new-path");
          }
          await fill("#path-form [name=kind]", branch === "L/C" ? "specialty" : "badge", "change");
          await fill("#path-form [name=title]", branch === "L/C" ? "Amico della natura" : "Animazione");
          await click("#add-path-step");
          await fill('#path-steps textarea', "Concordare il progetto con i capi");
          await click('#path-form button[type=submit]');
          await wait("!document.getElementById('path-dialog').open");
        }
        await shot(label + "-09-percorsi-" + branch.replace("/", ""));
        await expand("#paths-list .path-more");
        await click("#paths-list .path-more button");
        await shot(label + "-10-tappe-" + branch.replace("/", ""));
        await click("#path-dialog [data-close]");
        await expand(".path-filters");
        await fill("#paths-state", "Definito", "change");
        assert.equal(await page.evaluate("[...document.querySelectorAll('#paths-list .activity-state')].every(item=>item.textContent==='Definito')"), true);
        await fill("#paths-state", "", "change");
        if (branch === "L/C" && label !== "telefono") {
          await page.evaluate(`{
            const card = [...document.querySelectorAll('#paths-list article')].find(card=>card.textContent.includes('Stagione di caccia'));
            card.querySelector('.path-more').open = true; card.querySelector('.path-more button').click();
          }`);
          await shot(label + "-08-stagione-conclusa");
          await click("#path-dialog [data-close]");
        }
        await click('[data-section-target="events-panel"]');
      }
      await fill("#activities-branch", "E/G", "change");
      await expand(".activity-more");
      await click("#new-winter-camp");
      assert.equal(await page.evaluate("document.querySelector('#event-form [name=title]').value"), "Campo invernale");
      assert.equal(await page.evaluate("document.querySelector('#event-form [name=date]').value"), "2027-01-02");
      assert.equal(await page.evaluate("document.querySelector('#event-form [name=endDate]').value"), "2027-01-05");
      await click("#event-program .activity-program-day[open] .activity-program-day-add");
      await fill('#event-program [name="program-time-1"]', "08:00", "change");
      await fill('#event-program [name="program-title-1"]', "Lancio");
      await expand(".activity-program-extra");
      await fill('#event-place', "Sede scout");
      await fill("#event-program textarea", "Ci troviamo e presentiamo il campo.");
      await click("#event-program .program-materials-column button");
      await fill("#event-program [data-material-name]", "Cerchi");
      await fill("#event-program [data-material-quantity]", "6");
      await fill("#event-program [data-material-unit]", "pezzi");
      await page.evaluate(`{
        document.querySelector('.activity-program-day').open = true;
        document.querySelector('.activity-program-extra').open = false;
        document.querySelector('.activity-program-item').scrollIntoView({block:'center'});
      }`);
      await shot(label + "-14a-programma-timeline");
      await expand('#event-program-view > details:nth-child(2)');
      await fill("#activity-material-name", "Pasta");
      await fill("#activity-material-quantity", "4");
      await fill("#activity-material-unit", "kg");
      await page.evaluate(`{
        const shopping = document.getElementById('activity-material-shopping');
        shopping.checked = true; shopping.dispatchEvent(new Event('change', {bubbles:true}));
      }`);
      await click("#add-event-material");
      assert.match(await page.evaluate("document.getElementById('event-materials').textContent"), /Cerchi — 6 pezzi.*Pasta — 4 kg/);
      await shot(label + "-14-campo-programma");
      if (label === "desktop") {
        await expand("#event-settings");
        await fill('#event-form [name=fee]', "25.00");
        await click('[data-event-view="quote"]');
        await click("#event-attendance [data-person-action]");
        await page.evaluate(`{
          const paid = document.querySelector('#event-attendance [data-paid]');
          paid.value = '10'; paid.dispatchEvent(new Event('input',{bubbles:true}));
        }`);
        await click('#event-form button[type=submit]');
        await wait("!document.getElementById('event-dialog').open");
        const campId = await page.evaluate("ACCESSO.request('activities').then(data => data.events.find(item => item.title === 'Campo invernale')?.id)");
        assert.ok(campId);
        await page.evaluate(`{
          const card = [...document.querySelectorAll('#events-list .activity-card')].find(item => item.textContent.includes('Campo invernale'));
          card.querySelector('button').click();
        }`);
        await wait("document.getElementById('event-dialog').open");
        assert.equal(await page.evaluate("document.querySelector('#event-form [name=endDate]').value"), "2027-01-05");
        assert.equal(await page.evaluate("document.querySelector('#event-program [name=program-title-1]').value"), "Lancio");
        assert.match(await page.evaluate("document.getElementById('event-materials').textContent"), /Cerchi — 6 pezzi.*Pasta — 4 kg/);
        await page.evaluate("document.getElementById('event-dialog').close()");
        await go("");
        await wait("document.getElementById('dashboard-event-title').textContent === 'Campo invernale'");
        assert.match(await page.evaluate("document.getElementById('dashboard-event-details').textContent"), /gennaio 2027/);
        assert.match(await page.evaluate("document.getElementById('dashboard-event-preparation').textContent"), /1 momenti/);
        assert.match(await page.evaluate("document.getElementById('dashboard-fees-action').textContent"), /Da ricevere \(2\)/);
        assert.match(await page.evaluate("document.getElementById('dashboard-event-action').href"), /event=/);
        assert.doesNotMatch(await page.evaluate("document.getElementById('dashboard-event-action').href"), /presenze=1/);
        assert.equal(await page.evaluate("document.getElementById('dashboard-attendance-action').textContent"), "Presenze");
        assert.match(await page.evaluate("document.getElementById('dashboard-attendance-action').href"), /event=.*vista=presenze/);
        await shot("desktop-17-prossimo-evento");

        await go("attivita.html");
        await wait("!document.getElementById('activities-app').hidden");
        await fill("#activities-branch", "L/C", "change");
        await click("#new-event");
        await fill('#event-form [name=title]', "Riunione torneo di prova");
        await fill('#event-form [name=date]', "2026-11-20");
        await click('[data-event-view="presenze"]');
        await click("#event-attendance [data-person-action]");
        await expand("#event-attendance .activity-person:nth-of-type(2) .activity-presence-options");
        await fill("#event-attendance .activity-person:nth-of-type(2) select", "assente", "change");
        await click('[data-event-view="torneo"]');
        await fill("#tournament-presentations input", "5");
        await fill("#tournament-members .tournament-person select", "true", "change");
        await page.evaluate(`{
          const scores = document.querySelector('.tournament-person').querySelectorAll('input');
          scores.forEach(input => { input.value = '5'; input.dispatchEvent(new Event('input',{bubbles:true})); });
        }`);
        const disabledScores = await page.evaluate(`([...document.querySelectorAll('#tournament-members .tournament-person')].map(row => ({
          id: row.dataset.personId, absent: row.classList.contains('is-absent'),
          disabled: [...row.querySelectorAll('select:disabled, input:disabled')].map(input => input.outerHTML)
        })))`);
        assert.deepEqual(disabledScores.filter(row => row.absent).map(row => row.disabled.length), [6], JSON.stringify(disabledScores));
        await shot("desktop-15-torneo-sestiglie");
        await click('#event-form button[type=submit]');
        await wait("!document.getElementById('event-dialog').open");
        await click("#tournament-tab");
        assert.ok(await page.evaluate("!!document.querySelector('#tournament-rankings tbody')"), "the LC leaderboard should render saved scores");
        assert.equal(await page.evaluate("document.querySelector('#tournament-rankings tbody').textContent.includes('92.9%')"), true);
        const categories = await page.evaluate("[...document.querySelectorAll('#tournament-rankings [data-sort]')].map(button=>button.dataset.sort)");
        assert.deepEqual(categories, ["unit", "presentation", "presence", "punctuality", "loyalty", "balooRules", "huntNotebook", "style", "behavior", "total"]);
        assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.tournament-judging-table thead th')].map(cell=>cell.textContent.trim())"),
          ["Componente", "Puntualità", "Lealtà", "Regole di Baloo", "Quaderno di caccia", "Stile", "Comportamento"]);
        await click('#tournament-rankings [data-sort="punctuality"]');
        assert.equal(await page.evaluate("document.querySelector('#tournament-rankings [data-sort=punctuality]').closest('th').getAttribute('aria-sort')"), "descending");
        assert.equal(await page.evaluate("document.querySelector('#tournament-rankings tbody').textContent.includes('100.0%')"), true);
        await shot("desktop-16-classifica-torneo");
        await click("#tournament-events button");
        await wait("document.getElementById('event-dialog').open && document.getElementById('event-tournament').open");
        assert.equal(await page.evaluate("document.querySelector('#tournament-presentations input').value"), "5");
        await page.evaluate("document.getElementById('event-dialog').close()");
      } else {
        await page.evaluate("document.getElementById('event-dialog').close()");
      }
      // Capture the first-access layout without creating or changing any credentials.
      await page.evaluate("window.ACCESSO.esci()"); await go("");
      await page.evaluate(`{
        const original = window.ACCESSO.request;
        window.ACCESSO.request = (route,...args) => route === 'auth/status' ? Promise.resolve({firstAccess:true}) : original(route,...args);
      }`);
      await fill("#census-code", "7654321"); await click('#nas-login-form button[type=submit]');
      await wait("!document.getElementById('confirmation-field').hidden");
      await shot(label + "-11-primo-accesso");
      assert.deepEqual(page.errors, [], label + ": browser exceptions");
      t.diagnostic(label + ": " + width + "x" + height + ", login, percorso e attivita verificati");
    }
  } finally {
    if (page) await page.stop();
    await app.stop();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
