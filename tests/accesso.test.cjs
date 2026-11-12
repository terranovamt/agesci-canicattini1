const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/shared/accesso.js"), "utf8");
function load(fetch, initial = {}) {
  const session = new Map(),
    local = new Map();
  for (const [key, value] of Object.entries(initial.session || {})) session.set(key, value);
  for (const [key, value] of Object.entries(initial.local || {})) local.set(key, value);
  const storage = (map) => ({
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  });
  const c = {
    window: { NAS: { user: initial.user || null, basePath: "" } },
    fetch,
    sessionStorage: storage(session),
    localStorage: storage(local),
  };
  vm.runInNewContext(source, c);
  return { a: c.window.ACCESSO, session, local };
}

test("NAS login uses the session API and does not store credentials", async () => {
  const calls = [];
  const { a, session, local } = load(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ user: { code: "12345" } }) };
  });
  assert.equal(a.verificata(), false);
  await a.entra("test-password", "12345", "confirmation");
  assert.equal(calls[0].url, "/api/auth/login");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    code: "12345",
    password: "test-password",
    confirmation: "confirmation",
  });
  assert.equal(a.verificata(), true);
  assert.ok(![...session.values()].includes("test-password"));
  assert.equal(local.size, 0);
});

test("NAS logout revokes the server session and clears the client identity", async () => {
  const calls = [];
  const { a } = load(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ ok: true }) };
  }, { user: { code: "12345" } });
  await a.esci();
  assert.equal(calls[0].url, "/api/logout");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(a.verificata(), false);
});
test("failed NAS login remains unauthenticated and propagates the server error", async () => {
  const { a } = load(async () => {
    throw new Error("Offline");
  });
  await assert.rejects(a.entra("password", "12345"), /Offline/);
  assert.equal(a.verificata(), false);
});

test("legacy keys and GitHub tokens are removed from browser storage", () => {
  const { a, session, local } = load(async () => {
    throw new Error("must not fetch");
  }, {
    session: { "canicattini-area-chiave": "unverified", "canicattini-area-verificata": "unverified" },
    local: { "assemblea-gh-token": "old-token" },
  });
  assert.equal(a.verificata(), false);
  assert.equal(session.size, 0);
  assert.equal(local.size, 0);
});

test("NAS view-as uses dedicated session endpoints and never sends credentials", async () => {
  const calls = [];
  const window = { NAS: { user: { admin: true }, viewAs: null, basePath: "/base" } };
  const replies = [
    { user: { admin: false, serviceBranch: "E/G" }, viewAs: { adminName: "Amministratore", target: { id: 2, name: "Capo", serviceBranch: "E/G" } } },
    { user: { admin: true }, viewAs: null },
  ];
  const storage = { removeItem() {}, setItem() {}, getItem() { return null } };
  vm.runInNewContext(source, {
    window,
    sessionStorage: storage,
    localStorage: storage,
    fetch: async (url, options) => {
      calls.push({ url, method: options.method, body: options.body });
      return { ok: true, json: async () => replies.shift() };
    },
  });
  await window.ACCESSO.vista(2);
  assert.equal(window.NAS.user.admin, false);
  assert.equal(window.NAS.viewAs.target.serviceBranch, "E/G");
  await window.ACCESSO.tornaAdmin();
  assert.deepEqual([window.NAS.user.admin, window.NAS.viewAs], [true, null]);
  assert.deepEqual(calls, [
    { url: "/base/api/auth/view-as", method: "POST", body: '{"personId":2}' },
    { url: "/base/api/auth/view-as", method: "DELETE", body: undefined },
  ]);
});
