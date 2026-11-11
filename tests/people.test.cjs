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
    async login(code = "23816938", suppliedPassword = password, confirmation, temporary = "Canicattini1") {
      const response = await this.request("auth/login", "POST", { code, password: suppliedPassword, confirmation, temporary: confirmation === undefined ? undefined : temporary });
      if (response.ok && response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
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
    assert.equal((await app.request("metrics", "GET", undefined, "")).status, 401);
    for (const suffix of ["", "?view=summary", "?view=live"]) {
      assert.equal((await app.request("metrics" + suffix, "GET", undefined, admin)).status, 200);
    }
    const list = await (await app.request("people")).json();
    assert.deepEqual(list.people.map(person => person.code).sort(), ["7654321", "7654322"]);
    assert.equal(list.people.some(person => person.admin), false);
    assert.equal(JSON.stringify(list).includes("password_hash"), false);
    const id = list.people.find(person => person.code === "7654321").id;
    assert.equal((await app.request("people/" + id, "PATCH", { serviceBranch: "E/G" }, admin)).status, 200);
    assert.equal((await app.request("people/" + id, "PATCH", { name: "Changed", serviceBranch: "R/S" }, admin)).status, 400);
    assert.deepEqual(await (await app.request("auth/status", "POST", { code: "7654321" })).json(), { firstAccess: false });
    assert.equal((await app.login("7654321", password, "wrong")).status, 400);
    assert.equal((await app.login("7654321", "short", "short")).status, 400);
    assert.equal((await app.login("7654321", password, password)).status, 200);
    const capo = app.cookie();
    assert.equal((await app.request("people")).status, 403);
    assert.equal((await app.request("metrics")).status, 403);
    assert.equal((await app.request("metrics?view=summary")).status, 403);
    assert.equal((await app.request("metrics?view=live")).status, 200);
    assert.equal((await app.request("auth/me")).status, 200);
    assert.deepEqual(await (await app.request("auth/status", "POST", { code: "7654321" })).json(), { firstAccess: false });
    const db = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.equal(db.prepare("SELECT password_hash FROM people WHERE census_code='23816938'").get().password_hash, null);
    const encoded = db.prepare("SELECT password_hash FROM people WHERE census_code='7654321'").get().password_hash;
    assert.match(encoded, /^scrypt\$[a-f0-9]{64}\$[a-f0-9]{128}$/);
    assert.equal(encoded.includes(password), false);
    db.close();
    assert.equal((await app.request("people/" + id + "/password", "DELETE", undefined, capo)).status, 403);
    assert.equal((await app.request("people/" + id + "/password", "DELETE", undefined, admin)).status, 200);
    assert.equal((await app.request("auth/me", "GET", undefined, capo)).status, 401);
    assert.equal((await app.login("7654321")).status, 401);
    assert.equal((await app.login("7654321", "Canicattini1")).status, 200);
    assert.equal((await app.login("7654321", password, password, "wrong")).status, 401);
    assert.equal((await app.login("7654321", "Canicattini1", "Canicattini1")).status, 400);
    assert.equal((await app.login("7654321", password, password)).status, 200);
    assert.equal((await app.request("logout", "POST")).status, 200);
    assert.equal((await app.request("auth/me")).status, 401);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("legacy admin becomes an ordinary capo and existing accounts survive schema migration", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-admin-migration-"));
  let app = await start(directory, "7654321,1238005");
  try {
    assert.equal((await app.login("7654321", password, password)).status, 200);
    const capoCookie = app.cookie();
    await app.close();
    const db = new DatabaseSync(path.join(directory, "site.sqlite"));
    db.exec(`
      PRAGMA foreign_keys=OFF;
      BEGIN;
      CREATE TABLE people_legacy (
        id INTEGER PRIMARY KEY, census_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('ragazzo','capo')), password_hash TEXT,
        CHECK(kind='capo' OR password_hash IS NULL),
        CHECK(census_code!='1238005' OR kind='capo')
      );
      INSERT INTO people_legacy SELECT id,census_code,name,kind,password_hash FROM people;
      DROP TABLE people;
      ALTER TABLE people_legacy RENAME TO people;
      UPDATE people SET kind='ragazzo',name='Existing person' WHERE census_code='23816938';
      COMMIT;
    `);
    db.close();
    app = await start(directory, "7654321,1238005");
    assert.equal((await app.request("auth/me", "GET", undefined, capoCookie)).status, 200);
    assert.equal((await app.login("23816938", password)).status, 200);
    const admin = app.cookie();
    const people = (await (await app.request("people")).json()).people;
    assert.equal(people.some(p => p.code === "23816938"), false);
    const oldAdmin = people.find(p => p.code === "1238005");
    assert.equal(oldAdmin.admin, false);
    assert.equal(oldAdmin.hasPassword, false);
    assert.equal((await app.login("1238005", password, password)).status, 200);
    assert.equal((await app.request("people")).status, 403);
    assert.equal((await app.request("people/" + oldAdmin.id, "PATCH", { name: oldAdmin.name, kind: "ragazzo" }, admin)).status, 400);
    assert.equal((await app.request("people/" + oldAdmin.id, "PATCH", { serviceBranch: "R/S" }, admin)).status, 200);
    const verify = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.deepEqual(verify.prepare("PRAGMA foreign_key_check").all(), []);
    verify.close();
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("census codes accept five through nine digits including leading zeros", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-code-length-"));
  const codes = ["01234", "012345", "0123456", "01234567", "012345678"];
  const app = await start(directory, codes.join(","));
  try {
    for (const code of codes) {
      assert.deepEqual(await (await app.request("auth/status", "POST", { code })).json(), { firstAccess: false });
      assert.equal((await app.login(code, password, password)).status, 200);
    }
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
    assert.equal((await app.request("people/" + capoId, "PATCH", { name: "Ragazzo", kind: "ragazzo" })).status, 400);
    assert.equal((await app.request("people/" + capoId, "PATCH", { serviceBranch: "L/C" })).status, 200);
    assert.equal((await app.login("7654321", password, password)).status, 200);
    assert.equal((await app.request("people", "POST", { code: "7654323", name: "Capo extra", kind: "capo" }, admin)).status, 405);
    assert.equal((await app.login("7654323", password, password)).status, 403);
    const adminId = (await (await app.request("auth/me", "GET", undefined, admin)).json()).user.id;
    assert.equal((await app.request("people/" + adminId, "PATCH", { serviceBranch: "L/C" }, admin)).status, 404);
    assert.equal((await app.login("7654322", password, password)).status, 200);
    const capo = app.cookie();
    await app.close();
    app = await start(directory, "");
    assert.equal((await app.request("auth/me", "GET", undefined, capo)).status, 401);
    await app.login();
    assert.equal((await app.request("people/" + adminId + "/password", "DELETE")).status, 404);
    assert.equal((await app.request("auth/me", "GET", undefined, admin)).status, 401);
    await app.close();
    app = await start(directory, "");
    assert.deepEqual(await (await app.request("auth/status", "POST", { code: "23816938" })).json(), { firstAccess: false });
    assert.equal((await app.login()).status, 200);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("NAS rejects bad credentials, foreign origins and shared password login", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-errors-"));
  const app = await start(directory);
  try {
    assert.equal((await app.request("auth/login", "POST", { code: "23816938", password }, "", "https://evil.example")).status, 403);
    assert.equal((await app.request("auth/status", "POST", { code: "../bad" })).status, 400);
    for (const code of ["123 8005", "23816938 ", " 23816938", "123a005", "1234", "1234567890", "123\t8005", "23816938\n", "23816938\r", 23816938]) {
      assert.equal((await app.request("auth/status", "POST", { code })).status, 400);
      assert.equal((await app.login(code)).status, 400);
    }
    assert.equal((await app.request("people")).status, 401);
    assert.equal((await app.request("state/modifiche/k.json", "PUT", password)).status, 410);
    for (let i = 0; i < 5; i++) assert.equal((await app.login("23816938", "wrong-password")).status, 401);
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
    db.prepare("UPDATE people SET password_hash=? WHERE census_code='23816938'").run(capoHash);
    db.prepare("INSERT INTO auth_settings VALUES('admin_initialized','1')").run();
    db.close();
    const newPassword = "New-env-password2@";
    app = await start(directory, "7654321,7654322", newPassword);
    assert.equal((await app.request("auth/me", "GET", undefined, adminCookie)).status, 401);
    assert.equal((await app.request("auth/me", "GET", undefined, capoCookie)).status, 200);
    assert.equal((await app.login()).status, 401);
    assert.equal((await app.login("23816938", newPassword)).status, 200);
    const list = await (await app.request("people")).json();
    assert.equal(list.people.some(p => p.admin), false);
    assert.equal((await (await app.request("auth/me")).json()).user.hasPassword, true);
    const migrated = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.equal(migrated.prepare("SELECT password_hash FROM people WHERE census_code='23816938'").get().password_hash, null);
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
    assert.equal((await app.login(codes[0], "Canic@ttini1", "Canic@ttini1")).status, 200);
    assert.equal((await app.login(codes[0], "Canic@ttini1")).status, 200);
    assert.equal((await app.login(codes[1], "Aa1@" + "a".repeat(124), "Aa1@" + "a".repeat(124))).status, 200);
    await app.login();
    assert.equal((await app.request("people", "POST", { code: "765 4329", name: "Test", kind: "capo" })).status, 405);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("concurrent first accesses do not overwrite the winning password", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-race-"));
  const app = await start(directory);
  try {
    const responses = await Promise.all(["First-password1!", "Second-password1!"].map(value =>
      app.request("auth/login", "POST", { code: "7654321", password: value, confirmation: value, temporary: "Canicattini1" })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("admin view-as applies the chief's server permissions, keeps the admin identity and returns explicitly", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-view-as-"));
  let app = await start(directory, "7654321,7654322,7654323");
  try {
    assert.equal((await app.login()).status, 200);
    const admin = app.cookie();
    const list = (await (await app.request("people")).json()).people;
    const [eg, rs, none] = ["7654321", "7654322", "7654323"].map(code => list.find(person => person.code === code));
    assert.equal((await app.request("people/" + eg.id, "PATCH", { serviceBranch: "E/G" })).status, 200);
    assert.equal((await app.request("people/" + rs.id, "PATCH", { serviceBranch: "R/S" })).status, 200);
    assert.equal((await app.login("7654321", password, password)).status, 200);
    const capo = app.cookie();
    const db = new DatabaseSync(path.join(directory, "site.sqlite"));
    const hashes = () => db.prepare("SELECT census_code,password_hash,service_branch FROM people ORDER BY id").all();
    const before = JSON.stringify(hashes());
    // A chief can neither start nor end a view, nor forge one via body fields.
    for (const [method, data] of [["POST", { personId: rs.id }], ["DELETE", undefined]])
      assert.equal((await app.request("auth/view-as", method, data, capo)).status, 403);
    assert.equal((await app.request("auth/view-as", "POST", { personId: rs.id }, "")).status, 401);
    assert.equal((await app.request("auth/view-as", "POST", { personId: rs.id }, admin, "http://evil.example")).status, 403);
    // Only active, allowlisted, non-admin chiefs with a service branch are valid targets.
    const adminId = db.prepare("SELECT id FROM people WHERE census_code='23816938'").get().id;
    for (const personId of [adminId, none.id, 999999])
      assert.equal((await app.request("auth/view-as", "POST", { personId }, admin)).status, 404);
    for (const data of [{}, { personId: "1" }, { personId: eg.id, code: "23816938" }])
      assert.equal((await app.request("auth/view-as", "POST", data, admin)).status, 400);
    assert.equal((await app.request("auth/view-as", "GET", undefined, admin)).status, 405);
    // The target needs no password: rs never completed first access.
    const started = await app.request("auth/view-as", "POST", { personId: rs.id }, admin);
    assert.equal(started.status, 200);
    const view = await started.json();
    assert.equal(started.headers.get("set-cookie"), null);
    assert.deepEqual(view.viewAs, { adminName: "Amministratore", target: { id: rs.id, name: rs.name, serviceBranch: "R/S" } });
    assert.equal(view.user.code, "7654322");
    assert.equal(view.user.admin, false);
    assert.equal(JSON.stringify(view).includes("password"), false);
    assert.equal(JSON.stringify(view).includes("actorId"), false);
    const me = (await (await app.request("auth/me", "GET", undefined, admin)).json()).user;
    assert.deepEqual([me.code, me.admin, me.serviceBranch, me.viewAs.adminName], ["7654322", false, "R/S", "Amministratore"]);
    const session = await (await app.request("session", "GET", undefined, admin)).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.viewAs.target.id, rs.id);
    // Every admin-only endpoint now enforces the chief's permissions on the server.
    for (const [route, method, data] of [["people", "GET"], ["people/" + eg.id, "PATCH", { serviceBranch: "R/S" }],
      ["people/" + eg.id + "/password", "DELETE"], ["metrics", "GET"], ["metrics?view=summary", "GET"],
      ["members/overview", "GET"], ["members/import", "POST", {}], ["members", "POST", {}]])
      assert.equal((await app.request(route, method, data, admin)).status, 403, route);
    assert.equal((await app.request("metrics?view=live", "GET", undefined, admin)).status, 200);
    assert.equal((await app.request("members", "GET", undefined, admin)).status, 200);
    assert.equal((await app.request("authorize", "GET", undefined, admin)).status, 204);
    assert.equal((await app.request("auth/view-as", "POST", { personId: eg.id }, admin)).status, 409);
    assert.equal(JSON.stringify(hashes()), before);
    assert.equal((await app.request("auth/me", "GET", undefined, capo)).status, 200);
    // Revoking the target's branch from another admin session yields an explicit error, never admin rights.
    assert.equal((await app.login()).status, 200);
    const otherAdmin = app.cookie();
    assert.equal((await app.request("people/" + rs.id, "PATCH", { serviceBranch: "" }, otherAdmin)).status, 200);
    for (const [route, method] of [["auth/me", "GET"], ["people", "GET"], ["members", "GET"], ["authorize", "GET"]]) {
      const response = await app.request(route, method, undefined, admin);
      assert.equal(response.status, 409, route);
      assert.match(await response.text(), /torna amministratore/);
    }
    const stale = await (await app.request("session", "GET", undefined, admin)).json();
    assert.deepEqual([stale.authenticated, stale.user, stale.viewAs.target], [false, null, null]);
    const returned = await app.request("auth/view-as", "DELETE", undefined, admin);
    assert.equal(returned.status, 200);
    assert.deepEqual(await returned.json(), { user: (await (await app.request("auth/me", "GET", undefined, admin)).json()).user, viewAs: null });
    assert.equal((await app.request("people", "GET", undefined, admin)).status, 200);
    assert.equal((await app.request("auth/view-as", "DELETE", undefined, admin)).status, 200);
    // A forged view on a chief session is ignored as an invalid session, not honored.
    db.prepare("UPDATE sessions SET view_as_id=? WHERE person_id=?").run(eg.id, eg.id);
    assert.equal((await app.request("auth/me", "GET", undefined, capo)).status, 401);
    // Starting a view again survives restart only until admin sessions are revoked at boot.
    assert.equal((await app.request("auth/view-as", "POST", { personId: eg.id }, admin)).status, 200);
    db.close();
    await app.close();
    app = await start(directory, "7654321,7654322,7654323");
    assert.equal((await app.request("auth/me", "GET", undefined, admin)).status, 401);
    assert.equal((await app.request("auth/view-as", "DELETE", undefined, admin)).status, 401);
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
