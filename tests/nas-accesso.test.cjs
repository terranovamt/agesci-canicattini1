const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = name => fs.readFileSync(path.join(__dirname, '../assets/js/', name), 'utf8');

test('NAS authentication uses the server cookie, never persists passwords or a shared key', async () => {
  const requests = [], removed = [];
  const c = {
    window: { NAS: { user: null } },
    sessionStorage: { removeItem: k => removed.push(k), setItem() {} },
    localStorage: { removeItem: k => removed.push(k) },
    fetch: async (url, options) => {
      requests.push([url, options]);
      return { ok: true, json: async () => ({ user: { admin: true, code: '1238005' } }) };
    }
  };
  vm.runInNewContext(source('shared/accesso.js'), c);
  assert.equal(c.window.ACCESSO.verificata(), false);
  await c.window.ACCESSO.entra('A-long-password1!', '1238005', 'A-long-password1!');
  assert.equal(c.window.ACCESSO.verificata(), true);
  assert.equal(c.window.ACCESSO.chiave(), 'nas-session');
  assert.equal(requests[0][0], '/api/auth/login');
  assert.equal(requests[0][1].credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    password: 'A-long-password1!', code: '1238005', confirmation: 'A-long-password1!'
  });
  await c.window.ACCESSO.esci();
  assert.equal(c.window.ACCESSO.verificata(), false);
  assert.equal(requests[1][0], '/api/logout');
  assert.ok(removed.includes('assemblea-gh-token'));
});

test('NAS expired sessions and failed requests are explicit errors', async () => {
  const c = {
    window: { NAS: { user: { admin: false } } },
    fetch: async () => ({ ok: false, status: 401, text: async () => 'Accedi di nuovo.' })
  };
  vm.runInNewContext(source('shared/accesso.js'), c);
  await assert.rejects(c.window.ACCESSO.request('people'), /Accedi di nuovo/);
  assert.equal(c.window.ACCESSO.verificata(), false);
});

function loginPage(firstAccess) {
  const elements = new Map(), calls = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', type: 'password', hidden: true, disabled: true, required: false, attributes: {},
      focus() {}, setAttribute(name, value) { this.attributes[name] = value },
      querySelector(selector) { return get(id + (selector === 'button[type="submit"]' ? '-submit' : '-button')) }
    });
    return elements.get(id);
  };
  const c = {
    document: { getElementById: get },
    location: { replace() {} },
    window: {
      NAS: { user: null },
      AREA_DASHBOARD: { load() { calls.push(['dashboard']) } },
      ACCESSO: {
        verificata: () => false,
        request: async (...args) => { calls.push(args); return { firstAccess } },
        entra: async (...args) => { calls.push(['login', ...args]); c.window.NAS.user = { admin: false } },
        esci: async () => {}
      }
    }
  };
  vm.runInNewContext(source('area-riservata.js'), c);
  return { get, calls };
}

test('NAS first access shows password and required confirmation only after code lookup', async () => {
  const t = loginPage(true);
  assert.equal(t.get('nas-login-form').hidden, false);
  assert.equal(t.get('login-form').hidden, true);
  assert.equal(t.get('password-fields').hidden, true);
  t.get('census-code').value = '7654321';
  await t.get('nas-login-form').onsubmit({ preventDefault() {} });
  assert.equal(t.get('password-fields').hidden, false);
  assert.equal(t.get('confirmation-field').hidden, false);
  assert.equal(t.get('nas-confirmation').required, true);
  assert.equal(t.get('toggle-nas-password').disabled, false);
  assert.equal(t.get('toggle-nas-confirmation').disabled, false);
  t.get('toggle-nas-password').onclick();
  assert.equal(t.get('nas-password').type, 'text');
  assert.equal(t.get('toggle-nas-password').textContent, 'Nascondi password');
  assert.equal(t.get('toggle-nas-password').attributes['aria-pressed'], 'true');
  t.get('toggle-nas-confirmation').onclick();
  assert.equal(t.get('nas-confirmation').type, 'text');
  t.get('toggle-nas-password').onclick();
  t.get('toggle-nas-confirmation').onclick();
  assert.equal(t.get('nas-password').type, 'password');
  assert.equal(t.get('nas-confirmation').type, 'password');
  assert.equal(t.get('nas-password').minLength, 8);
  const policy = new RegExp('^(?:' + t.get('nas-password').pattern + ')$', 'v');
  assert.equal(policy.test('Abcdef1@'), true);
  for (const invalid of ['Abcde1@', 'abcdef1@', 'ABCDEF1@', 'Abcdefg@', 'Abcdefg1', 'Abcdef1 '])
    assert.equal(policy.test(invalid), false, invalid);
  assert.equal(t.get('nas-password').autocomplete, 'new-password');
  t.get('nas-password').value = t.get('nas-confirmation').value = 'A-long-password!';
  await t.get('nas-login-form').onsubmit({ preventDefault() {} });
  assert.deepEqual(t.calls[1], ['login', 'A-long-password!', '7654321', 'A-long-password!']);
  assert.equal(t.get('riservata').hidden, false);
  assert.equal(t.get('people-tool').hidden, true);
  assert.equal(t.get('nas-password').value, '');
  assert.equal(t.get('nas-password').type, 'password');
});

test('NAS returning access shows only password; changing code clears both credentials', async () => {
  const t = loginPage(false);
  t.get('census-code').value = '7654321';
  await t.get('nas-login-form').onsubmit({ preventDefault() {} });
  assert.equal(t.get('confirmation-field').hidden, true);
  assert.equal(t.get('nas-confirmation').disabled, true);
  assert.equal(t.get('toggle-nas-confirmation').disabled, true);
  assert.equal(t.get('nas-password').autocomplete, 'current-password');
  assert.equal(t.get('nas-password').pattern, '');
  t.get('nas-password').value = 'A-long-password!';
  t.get('census-code').oninput();
  assert.equal(t.get('password-fields').hidden, true);
  assert.equal(t.get('nas-password').value, '');
  assert.equal(t.get('nas-password').type, 'password');
  assert.equal(t.get('toggle-nas-password').disabled, true);
  await t.get('nas-login-form').onsubmit({ preventDefault() {} });
  assert.equal(t.calls[1][0], 'auth/status');
});

test('NAS census inputs require seven digits without disclosing the admin code', () => {
  for (const file of ['index.html', 'persone.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../area-riservata/', file), 'utf8');
    const input = html.match(/<input[^>]+(?:id="census-code"|name="code")[^>]*>/)[0];
    assert.match(input, /maxlength="7"/);
    assert.match(input, /pattern="\[0-9\]\{7\}"/);
    assert.match(input, /placeholder="7654321"/);
    assert.doesNotMatch(input, /1238005|123 8005/);
  }
});
