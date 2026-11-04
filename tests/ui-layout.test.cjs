const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { test } = require('node:test');

const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
  spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0);

function outputUntil(child, pattern) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Process startup timed out: ' + output)), 15000);
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => {
      output += chunk;
      const match = output.match(pattern);
      if (match) { clearTimeout(timer); resolve(match[1]) }
    });
    child.once('error', error => { clearTimeout(timer); reject(error) });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Process exited: ' + code + '\n' + output)) });
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}

test('all pages reflow and management tools work with native keyboard controls', {
  skip: !chrome || typeof WebSocket === 'undefined', timeout: 120000
}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agesci-ui-'));
  const preview = spawn(process.execPath, [path.join(__dirname, '../tools/preview.cjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser, socket;
  t.after(async () => {
    socket?.close();
    if (browser) await stop(browser);
    await stop(preview);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = await outputUntil(preview, /http:\/\/localhost:(\d+)/);
  const origin = 'http://127.0.0.1:' + port;
  browser = spawn(chrome, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    '--user-data-dir=' + dir, 'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const endpoint = await outputUntil(browser, /DevTools listening on (ws:\/\/[^\s]+)/);
  const pages = await (await fetch('http://' + new URL(endpoint).host + '/json/list')).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let id = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (!message.id) return;
    const callback = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
    else callback.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail('Timed out waiting for: ' + expression);
  };
  await command('Runtime.enable');
  const navigate = async pathname => {
    await command('Page.navigate', { url: origin + pathname });
    await wait('location.pathname === ' + JSON.stringify(pathname) + ' && document.readyState === "complete"');
  };
  const reflow = async name => {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const layout = await evaluate('({width:innerWidth, scroll:document.documentElement.scrollWidth})');
      assert.ok(layout.scroll <= layout.width + 1, name + ' must fit at ' + width + ': ' + JSON.stringify(layout));
      if (process.env.UI_SCREENSHOTS && ['setup', 'regia', 'guide'].includes(name) && [375, 1440].includes(width)) {
        fs.mkdirSync(process.env.UI_SCREENSHOTS, { recursive: true });
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(process.env.UI_SCREENSHOTS, name + '-' + width + '.png'), Buffer.from(screenshot.data, 'base64'));
      }
    }
    const lowContrast = await evaluate(`(() => {
      const rgb = color => color.match(/[\\d.]+/g).map(Number);
      const composite = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
      const luminance = color => color.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      return [...document.querySelectorAll('a.btn, .tool-nav a, .tabs button')].filter(el => el.getBoundingClientRect().height && !el.disabled).map(el => {
        const layers = [];
        for (let node = el; node; node = node.parentElement) layers.unshift(rgb(getComputedStyle(node).backgroundColor));
        const background = layers.reduce((color, layer) => composite(layer, color), [255, 255, 255]);
        const foreground = composite(rgb(getComputedStyle(el).color), background);
        const a = luminance(background), b = luminance(foreground);
        return {text: el.textContent.trim(), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05)};
      }).filter(result => !Number.isFinite(result.ratio) || result.ratio < 4.5);
    })()`);
    assert.deepEqual(lowContrast, [], name + ' controls must meet 4.5:1 text contrast');
  };
  const pressEnter = async () => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  };

  await navigate('/index.html');
  await reflow('home');
  await navigate('/area-riservata.html');
  await reflow('login');
  await evaluate("document.getElementById('chiave').value='demo'; document.querySelector('[data-password-toggle]').click()");
  assert.equal(await evaluate("document.getElementById('chiave').type"), 'text');
  await evaluate("document.getElementById('login-form').requestSubmit()");
  await wait("!document.getElementById('riservata').hidden");
  await reflow('reserved tools');

  await navigate('/Assemblea-di-Gruppo/setup.html');
  await wait("document.querySelector('#campi input') !== null");
  await reflow('setup');
  for (const tab of ['ordine', 'bilancio', 'json']) {
    await evaluate('document.querySelector(\'[data-tab="' + tab + '"]\').click()');
    await reflow('setup ' + tab);
    assert.equal(await evaluate('document.querySelector(\'[data-tab="' + tab + '"]\').ariaPressed'), 'true');
  }
  await evaluate("document.querySelector('[data-tab=ordine]').click(); document.querySelector('.ord button[title=\"Modifica i contenuti\"]').click()");
  assert.equal(await evaluate("document.getElementById('slide-editor').open"), true);
  await reflow('slide editor');
  await evaluate("document.getElementById('slide-editor').close()");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await evaluate("document.querySelector('.ord button[title=\"Sposta giù\"]').focus()");
  await pressEnter();
  assert.equal(await evaluate("document.activeElement.title"), 'Sposta giù', 'reordering must preserve keyboard focus');
  await evaluate("document.getElementById('annulla').click()");
  await evaluate("document.querySelector('[data-tab=guida]').click()");
  await wait("document.getElementById('doc').contentDocument?.querySelector('.table-scroll')");
  await reflow('embedded guide');
  await evaluate("document.querySelector('[data-tab=generale]').click()");
  await wait("document.querySelector('#campi input:not([type=number]):not([type=checkbox])')");
  await evaluate("const field = document.querySelector('#campi input:not([type=number]):not([type=checkbox])'); field.value='Prova'; field.dispatchEvent(new Event('input'))");
  await evaluate("window.alert = message => window.previewAlert = message; document.getElementById('salva-gh').click()");
  assert.match(await evaluate('window.previewAlert'), /disattivata/);
  assert.equal(await evaluate("fetch('https://api.github.com/').then(() => false, () => true)"), true);
  await evaluate("document.getElementById('annulla').click()");

  await navigate('/Assemblea-di-Gruppo/regia.html');
  await wait("document.querySelector('#slide button') && !document.getElementById('inizia').disabled");
  await reflow('regia');
  assert.equal(await evaluate("document.getElementById('next').getBoundingClientRect().bottom <= innerHeight"), true,
    'main navigation must be visible without scrolling at desktop size');
  const before = await evaluate("document.getElementById('pos').textContent");
  const previousStep = await evaluate("document.getElementById('principale').contentWindow.VISTA.stato()");
  await evaluate("document.getElementById('next').focus()");
  await pressEnter();
  await wait('document.getElementById("pos").textContent !== ' + JSON.stringify(before));
  const nextStep = await evaluate("document.getElementById('principale').contentWindow.VISTA.stato()");
  assert.deepEqual([nextStep.i, nextStep.k], previousStep.k < previousStep.steps
    ? [previousStep.i, previousStep.k + 1] : [previousStep.i + 1, 0], 'Enter must advance exactly one step');
  assert.equal(await evaluate("document.querySelectorAll('#slide button[aria-current=step]').length"), 1);
  await evaluate("document.querySelector('#slide li:nth-child(3) button').focus()");
  await pressEnter();
  assert.equal(await evaluate("document.querySelector('#slide li:nth-child(3) button').getAttribute('aria-current')"), 'step');
  await evaluate("window.confirm = () => true; document.getElementById('inizia').click()");
  await wait("document.getElementById('b-assemblea').textContent === 'Assemblea attiva'");

  await navigate('/Assemblea-di-Gruppo/index.html');
  await wait("document.getElementById('lv-f') && document.querySelector('.slide.in')");
  await reflow('public presentation');
  assert.equal(await evaluate("document.getElementById('lv-f').getAttribute('aria-label')"), 'Schermo intero');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: true });
  const targets = await evaluate("Array.from(document.querySelectorAll('#lv-bar button')).filter(b => !b.hidden && getComputedStyle(b).display !== 'none').map(b => ({label:b.getAttribute('aria-label'), width:b.getBoundingClientRect().width, height:b.getBoundingClientRect().height}))");
  for (const target of targets) assert.ok(target.width >= 44 && target.height >= 44, JSON.stringify(target));
  await navigate('/Assemblea-di-Gruppo/guida.html');
  await reflow('guide');
  assert.ok(await evaluate("document.querySelectorAll('.table-scroll[tabindex=\"0\"]').length") > 0);
  await evaluate("document.querySelector('a[href=\"#anteprima\"]').click()");
  await wait("location.hash === '#anteprima'");
  await evaluate("fetch('/__preview/firebase/assemblea/stato.json', {method:'PUT',body:JSON.stringify({attiva:false})})");

  await command('Page.navigate', { url: origin + '/setup.html' });
  await wait("location.pathname === '/Assemblea-di-Gruppo/setup.html' && document.querySelector('#campi input')");
  assert.equal(errors.length, 0, 'No uncaught browser errors: ' + JSON.stringify(errors));
});
