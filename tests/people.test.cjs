const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createNasServer } = require("../server/nas.cjs");

const password = "Test-only-password1!";
const originHeader = "http://localhost";

async function start(directory, censusCodes = "7654321,7654322", adminPassword = password) {
  const server = await createNasServer({
    dataDir: directory, password: adminPassword, censusCodes, publicOrigin: originHeader, secureCookie: false,
    basePath: "/agesci-canicattini1",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const root = `http://127.0.0.1:${server.address().port}/agesci-canicattini1`;
  let cookie = "";
  return {
    async request(route, method = "GET", data, suppliedCookie = cookie, origin = originHeader) {
      return fetch(root + "/api/" + route, {
        method, headers: { Cookie: suppliedCookie, Origin: origin, "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    },
    async login(code = "1238005", suppliedPassword = password, confirmation) {
      const response = await this.request("auth/login", "POST", { code, password: suppliedPassword, confirmation });
      if (response.ok) cookie = response.headers.get("set-cookie").split(";")[0];
      return response;
    },
    cookie: () => cookie,
    async close() { server.stop(); await once(server, "close"); },
  };
}

test("NAS personal accounts bootstrap from env and first access hashes passwords", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-people-"));
  const app = await start(directory);
  try {
    assert.equal((await app.login()).status, 200);
    const admin = app.cookie();
    const list = await (await app.request("people")).json();
    assert.equal(list.people.length, 3);
    assert.equal(list.people.filter(p => p.admin).length, 1);
    assert.equal(JSON.stringify(list).includes("password_hash"), false);
    assert.deepEqual(await (await app.request("auth/status", "POST", { code: "7654321" })).json(), { firstAccess: true });
    assert.equal((await app.login("7654321", password, "wrong")).status, 400);
    assert.equal((await app.login("7654321", "short", "short")).status, 400);
    assert.equal((await app.login("7654321", password, password)).status, 200);
    const capo = app.cookie();
    assert.equal((await app.request("people")).status, 403);
    assert.equal((await app.request("auth/me")).status, 200);
    assert.deepEqual(await (await app.request("auth/status", "POST", { code: "7654321" })).json(), { firstAccess: false });
    const db = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.equal(db.prepare("SELECT password_hash FROM people WHERE census_code='1238005'").get().password_hash, null);
    const encoded = db.prepare("SELECT password_hash FROM people WHERE census_code='7654321'").get().password_hash;
    assert.match(encoded, /^scrypt\$[a-f0-9]{64}\$[a-f0-9]{128}$/);
    assert.equal(encoded.includes(password), false);
    db.close();
    const id = list.people.find(p => p.code === "7654321").id;
    assert.equal((await app.request("people/" + id + "/password", "DELETE", undefined, capo)).status, 403);
    assert.equal((await app.request("people/" + id + "/password", "DELETE", undefined, admin)).status, 200);
    assert.equal((await app.request("auth/me", "GET", undefined, capo)).status, 401);
    assert.equal((await app.login("7654321")).status, 400);
    assert.equal((await app.login("7654321", password, password)).status, 200);
    assert.equal((await app.request("logout", "POST")).status, 200);
    assert.equal((await app.request("auth/me")).status, 401);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("NAS allowlist, ragazzi and env-only admin restrictions survive restart", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-allowlist-"));
  let app = await start(directory);
  try {
    await app.login();
    const admin = app.cookie();
    const list = await (await app.request("people")).json();
    const capoId = list.people.find(p => p.code === "7654321").id;
    assert.equal((await app.request("people/" + capoId, "PATCH", { name: "Ragazzo", kind: "ragazzo" })).status, 200);
    assert.equal((await app.login("7654321", password, password)).status, 403);
    assert.equal((await app.request("people", "POST", { code: "7654323", name: "Capo extra", kind: "capo" })).status, 201);
    assert.equal((await app.login("7654323", password, password)).status, 403);
    const adminId = list.people.find(p => p.admin).id;
    assert.equal((await app.request("people/" + adminId, "PATCH", { name: "Admin", kind: "ragazzo" })).status, 400);
    assert.equal((await app.login("7654322", password, password)).status, 200);
    const capo = app.cookie();
    await app.close();
    app = await start(directory, "");
    assert.equal((await app.request("auth/me", "GET", undefined, capo)).status, 401);
    await app.login();
    assert.equal((await app.request("people/" + adminId + "/password", "DELETE")).status, 400);
    assert.equal((await app.request("auth/me", "GET", undefined, admin)).status, 401);
    await app.close();
    app = await start(directory, "");
    assert.deepEqual(await (await app.request("auth/status", "POST", { code: "1238005" })).json(), { firstAccess: false });
    assert.equal((await app.login()).status, 200);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("NAS rejects bad credentials, foreign origins and shared password login", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-errors-"));
  const app = await start(directory);
  try {
    assert.equal((await app.request("auth/login", "POST", { code: "1238005", password }, "", "https://evil.example")).status, 403);
    assert.equal((await app.request("auth/status", "POST", { code: "../bad" })).status, 400);
    for (const code of ["123 8005", "1238005 ", " 1238005", "123a005", "123800", "12380055", "123\t8005", "1238005\n", "1238005\r", 1238005]) {
      assert.equal((await app.request("auth/status", "POST", { code })).status, 400);
      assert.equal((await app.login(code)).status, 400);
    }
    assert.equal((await app.request("people")).status, 401);
    assert.equal((await app.request("state/modifiche/k.json", "PUT", password)).status, 410);
    for (let i = 0; i < 5; i++) assert.equal((await app.login("1238005", "wrong-password")).status, 401);
    assert.equal((await app.login()).status, 429);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("admin env password replaces legacy hash and changes on restart without affecting capi", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-admin-env-"));
  let app = await start(directory);
  try {
    await app.login();
    const adminCookie = app.cookie();
    await app.login("7654321", password, password);
    const capoCookie = app.cookie();
    await app.close();
    const db = new DatabaseSync(path.join(directory, "site.sqlite"));
    const capoHash = db.prepare("SELECT password_hash FROM people WHERE census_code='7654321'").get().password_hash;
    db.prepare("UPDATE people SET password_hash=? WHERE census_code='1238005'").run(capoHash);
    db.prepare("INSERT INTO auth_settings VALUES('admin_initialized','1')").run();
    db.close();
    const newPassword = "New-env-password2@";
    app = await start(directory, "7654321,7654322", newPassword);
    assert.equal((await app.request("auth/me", "GET", undefined, adminCookie)).status, 401);
    assert.equal((await app.request("auth/me", "GET", undefined, capoCookie)).status, 200);
    assert.equal((await app.login()).status, 401);
    assert.equal((await app.login("1238005", newPassword)).status, 200);
    const list = await (await app.request("people")).json();
    assert.equal(list.people.find(p => p.admin).hasPassword, true);
    const migrated = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.equal(migrated.prepare("SELECT password_hash FROM people WHERE census_code='1238005'").get().password_hash, null);
    assert.equal(migrated.prepare("SELECT * FROM auth_settings WHERE name='admin_initialized'").get(), undefined);
    assert.equal(migrated.prepare("SELECT password_hash FROM people WHERE census_code='7654321'").get().password_hash, capoHash);
    migrated.close();
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("new capo passwords require eight characters and all four character classes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-policy-"));
  const invalid = ["Abcde1@", "abcdef1@", "ABCDEF1@", "Abcdefg@", "Abcdefg1", "Abcdef1 ", "Aa1@" + "a".repeat(125)];
  const codes = invalid.map((_, i) => String(7654320 + i));
  const app = await start(directory, codes.join(","));
  try {
    for (const [i, value] of invalid.entries()) {
      const response = await app.login(codes[i], value, value);
      assert.equal(response.status, 400);
      assert.match(await response.text(), /carattere speciale/);
    }
    assert.equal((await app.login(codes[0], "Abcdef1@", "Abcdef1@")).status, 200);
    assert.equal((await app.login(codes[1], "Aa1@" + "a".repeat(124), "Aa1@" + "a".repeat(124))).status, 200);
    await app.login();
    assert.equal((await app.request("people", "POST", { code: "765 4329", name: "Test", kind: "capo" })).status, 400);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("concurrent first accesses do not overwrite the winning password", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-race-"));
  const app = await start(directory);
  try {
    const responses = await Promise.all(["First-password1!", "Second-password1!"].map(value =>
      app.request("auth/login", "POST", { code: "7654321", password: value, confirmation: value })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
