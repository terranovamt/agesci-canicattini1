const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/shared/accesso.js"), "utf8");
function load(fetch, nas = false) {
  const session = new Map(),
    local = new Map();
  const storage = (map) => ({
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  });
  const c = {
    window: { LIVE: { nas, url: nas ? "/api/state/" : "https://firebase.test/" } },
    fetch,
    sessionStorage: storage(session),
    localStorage: storage(local),
  };
  vm.runInNewContext(source, c);
  return { a: c.window.ACCESSO, session, local };
}

test("NAS login does not store the password and logout revokes the server session", async () => {
  const calls = [];
  const { a, session } = load(async (url, options) => {
    calls.push({ url, options });
    return { ok: true };
  }, true);
  await a.entra("test-password");
  assert.equal(a.chiave(), "nas-session");
  assert.ok(![...session.values()].includes("test-password"));
  a.esci();
  assert.equal(calls[1].url, "/api/logout");
  assert.equal(calls[1].options.keepalive, true);
});

test("opening NAS regia revalidates the cookie, never sends the session marker as a password", async () => {
  const calls = [];
  let authenticated = true;
  const { a } = load(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ authenticated }) };
  }, true);
  await a.entra("test-password");
  await a.entra(a.chiave());
  assert.equal(calls[1].url, "/api/session");
  assert.equal(calls[1].options.body, undefined);
  authenticated = false;
  await assert.rejects(a.entra(a.chiave()), /Sessione NAS scaduta/);
  assert.equal(a.verificata(), false);
});
test("access is confirmed by Firebase without changing content or lifecycle", async () => {
  let release, request;
  const { a } = load((url, opts) => {
    request = [url, opts];
    return new Promise((r) => {
      release = r;
    });
  });
  const pending = a.entra("test-key");
  assert.equal(a.chiave(), "");
  assert.equal(a.verificata(), false);
  release({ ok: true });
  await pending;
  assert.equal(a.chiave(), "test-key");
  assert.equal(a.verificata(), true);
  assert.equal(request[0], "https://firebase.test/modifiche/k.json");
  assert.equal(request[1].method, "PUT");
  assert.equal(request[1].body, '"test-key"');
});
test("wrong or revoked keys are rejected and forgotten", async () => {
  let ok = true;
  const { a } = load(async () => ({ ok, status: 403 }));
  await a.entra("old-key");
  ok = false;
  await assert.rejects(a.entra("bad-key"), /Chiave non valida/);
  assert.equal(a.chiave(), "");
  assert.equal(a.verificata(), false);
});
test("offline login does not authenticate and logout also forgets the GitHub token", async () => {
  const { a, local } = load(async () => {
    throw new Error("Offline");
  });
  await assert.rejects(a.entra("key"), /Offline/);
  assert.equal(a.chiave(), "");
  local.set("assemblea-gh-token", "token");
  a.esci();
  assert.equal(local.size, 0);
  assert.equal(a.verificata(), false);
});

test("a key stored by an old regia URL is not a verified session", () => {
  const { a, session } = load(async () => {
    throw new Error("must not fetch");
  });
  session.set("canicattini-area-chiave", "unverified");
  assert.equal(a.verificata(), false);
});
