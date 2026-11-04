const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { test } = require('node:test');

test('graphic preview isolates services and simulates login and live without editing production config', { timeout: 30000 }, async t => {
  const child = spawn(process.execPath, [path.join(__dirname, '../tools/preview.cjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve('http://127.0.0.1:' + match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error('Preview exited: ' + code)));
  });
  const request = (file, method = 'GET', body) => fetch(origin + file, {
    method, body: body === undefined ? undefined : JSON.stringify(body)
  });
  for (const page of ['/', '/area-riservata.html', '/Assemblea-di-Gruppo/setup.html', '/Assemblea-di-Gruppo/regia.html', '/Assemblea-di-Gruppo/index.html']) {
    const response = await request(page);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.match(response.headers.get('content-security-policy'), /form-action 'self'/);
    assert.match(await response.text(), /<head><script src="\/tools\/preview-ui.js"><\/script>/);
  }
  const config = await (await request('/Assemblea-di-Gruppo/config.js')).text();
  assert.match(config, /url: location\.origin \+ '\/__preview\/firebase'/);
  assert.doesNotMatch(config, /url: 'https:\/\/assemblea/);
  const access = await (await request('/Assemblea-di-Gruppo/common/accesso.js')).text();
  assert.match(access, /canicattini-preview-area-verificata/);
  assert.match(access, /assemblea-preview-gh-token/);
  assert.doesNotMatch(access, /canicattini-area-verificata/);
  const database = '/__preview/firebase';
  assert.equal((await request(database + '/modifiche/k.json', 'PUT', 'demo')).status, 200);
  assert.equal(await (await request(database + '/modifiche/k.json')).json(), 'demo');
  await request(database + '/.json', 'PATCH', {
    assemblea: { k: 'demo', stato: { attiva: true } },
    live: { k: 'demo', stato: { pos: 1000, max: 1000 } },
    modifiche: { k: 'demo', patch: null, t: { '.sv': 'timestamp' } }
  });
  assert.deepEqual(await (await request(database + '/assemblea/stato.json')).json(), { attiva: true });
  assert.deepEqual(await (await request(database + '/live/stato.json')).json(), { pos: 1000, max: 1000 });
  assert.equal(typeof await (await request(database + '/modifiche/t.json')).json(), 'number');
  const stream = await fetch(origin + database + '/live/stato.json', { headers: { Accept: 'text/event-stream' } });
  const reader = stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: put[\s\S]*"pos":1000/);
  await reader.cancel();
  assert.equal((await request('/Assemblea-di-Gruppo/dati.js', 'PUT', {})).status, 405);
  assert.equal((await request(database + '/live.json', 'POST', {})).status, 405);
  child.kill();
  await once(child, 'exit');
});
