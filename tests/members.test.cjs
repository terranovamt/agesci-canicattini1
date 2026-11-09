const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createNasServer } = require("../server/nas.cjs");
const { startNasDev } = require("../tools/nas-dev.cjs");
const { createMembers } = require("../server/members.cjs");
const M = require("../assets/js/soci-model.js");

const columns = ["ANNO SCOUT", "CODICE SOCIO", "NOME", "COGNOME", "BRANCA", "ORDINALE",
  "DATA NASCITA", "EMAIL", "CELLULARE", "RESP.GENITORIALE DATI", "STATUS SOCIO", "CODICE STATUS SOCIO",
  "GRUPPO", "CODICE AREA"];
const base = { "ANNO SCOUT": "2026", "CODICE SOCIO": "012345", NOME: "Persona", COGNOME: "Esempio",
  BRANCA: "Branca E/G", ORDINALE: "R2053", "DATA NASCITA": "2/3/2012", EMAIL: "test@example.invalid",
  CELLULARE: "000 123;000123", "RESP.GENITORIALE DATI": 'Responsabile "Esempio", contatto\nDa verificare',
  "STATUS SOCIO": "Attivo", "CODICE STATUS SOCIO": "A", GRUPPO: "Gruppo esempio", "CODICE AREA": "ignora" };
function csv(rows = [{}], headers = columns) {
  const cell = value => '="' + String(value ?? "").replace(/"/g, '""') + '"';
  return "\uFEFFsep=,\r\n" + headers.join(",") + "\r\n" +
    rows.map(row => headers.map(key => cell({ ...base, ...row }[key])).join(",") + ",").join("\r\n");
}
const password = "Test-only-password1!";
const guardianSource = "Esempio Responsabile [C.F.ABCDEF80A01H501U] - Nato/a a: Comune Esempio (XX) il: 1/1/1980 e-mail: guardian@example.invalid Cellulare: 000 123";
async function start(directory, censusCodes = "7654321") {
  const server = await createNasServer({ dataDir: directory, password, censusCodes,
    basePath: "/agesci-canicattini1", publicOrigin: "http://localhost", secureCookie: false });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let cookie = "";
  return {
    cookie: () => cookie,
    async request(route, method = "GET", data, origin = "http://localhost", suppliedCookie = cookie) {
      return fetch(`http://127.0.0.1:${server.address().port}/agesci-canicattini1/api/${route}`, {
        method, headers: { Cookie: suppliedCookie, Origin: origin, "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    },
    async login(code = "23816938") {
      const r = await this.request("auth/login", "POST", { code, password, confirmation: password });
      assert.equal(r.status, 200, await r.text());
      cookie = r.headers.get("set-cookie").split(";")[0];
    },
    async snapshot() {
      const r = await this.request("members");
      assert.equal(r.status, 200);
      return r.json();
    },
    async import(content) {
      const r = await this.request("members/import", "POST", { csv: content });
      assert.equal(r.status, 200, await r.clone().text());
      const preview = await r.json();
      const saved = await this.request("members/import", "POST", { csv: content, confirm: true, version: preview.version });
      assert.equal(saved.status, 200, await saved.text());
      return preview;
    },
    async close() { server.stop(); await once(server, "close"); },
  };
}

test("AGESCI CSV preserves codes, quotes, multiline guardians and converts dates", () => {
  const imported = M.parseImport(csv());
  assert.equal(imported.members[0].code, "012345");
  assert.equal(imported.members[0].profile.birthDate, "2012-03-02");
  assert.equal(imported.members[0].profile.guardians, base["RESP.GENITORIALE DATI"]);
  assert.equal(imported.members[0].profile.phone, "000123");
  assert.equal(imported.members[0].census.branch, "E/G");
  assert.equal(imported.group.ORDINALE, "R2053");
  assert.deepEqual(imported.ignoredColumns, ["CODICE AREA"]);
  assert.equal(imported.warnings.length, 2);
  assert.equal(M.parseImport(csv([{}], columns.filter(key => key !== "EMAIL"))).members[0].profile.email, undefined);
  const ordinary = columns.join(",") + "\n" + columns.map(key => '"' + String(base[key] ?? "").replace(/"/g, '""') + '"').join(",");
  assert.equal(M.parseImport(ordinary).members[0].profile.guardians, base["RESP.GENITORIALE DATI"]);
});

test("AGESCI CSV rejects ambiguous or invalid records before producing a plan", () => {
  for (const [content, error] of [
    [csv([{}, {}]), /duplicato/], [csv([{ ORDINALE: "X0000" }]), /gruppo diverso/],
    [csv([{ "DATA NASCITA": "31/2/2012" }]), /data di nascita/], [csv([{ BRANCA: "Unknown" }]), /branca/],
    [csv([{ "CODICE SOCIO": "1234" }]), /codice/], [csv([{ "ANNO SCOUT": "26" }]), /anno/],
    [csv([{ NOME: "", COGNOME: "" }]), /nome e cognome/], [csv() + 'x', /numero colonne/],
    [csv([{}, { "CODICE SOCIO": "012346", GRUPPO: "Diverso" }]), /gruppo incoerenti/],
    ['ANNO SCOUT,ANNO SCOUT', /Intestazioni/], [csv().slice(0, -2), /non chiuse/],
    [csv([{}], [...columns, "NOME"]), /Intestazioni duplicate/],
  ]) assert.throws(() => M.parseImport(content), error);
  assert.throws(() => M.parseImport("x".repeat(4 * 1024 * 1024 + 1)), /troppo grande/);
  assert.throws(() => M.parseImport("\u00e9".repeat(2 * 1024 * 1024 + 1)), /troppo grande/);
  assert.equal(M.parseImport(csv([{ "CODICE STATUS SOCIO": "S" }])).warnings.some(w => w.includes("sospeso")), true);
});

test("guardian parsing separates AGESCI contacts without guessing names or merging duplicates", () => {
  const parsed = M.parseGuardians(guardianSource + "; " + guardianSource);
  assert.equal(parsed.contacts.length, 2);
  assert.deepEqual(parsed.unparsed, []);
  assert.deepEqual(parsed.contacts[0], { fullName: "Esempio Responsabile", givenName: "", surname: "",
    taxCode: "ABCDEF80A01H501U", birthTown: "Comune Esempio (XX)", birthDate: "1980-01-01",
    email: "guardian@example.invalid", phone: "000123" });
  const bad = guardianSource.replace("1/1/1980", "31/2/1980");
  assert.deepEqual(M.parseGuardians(bad), { contacts: [], unparsed: [bad] });
  const imported = M.parseImport(csv([{ "RESP.GENITORIALE DATI": guardianSource }]));
  assert.equal(imported.members[0].profile.guardians, guardianSource);
  assert.deepEqual(imported.members[0].profile.guardianContacts, [parsed.contacts[0]]);
  assert.deepEqual(M.parseGuardians(""), { contacts: [], unparsed: [] });
});

test("catalog schema upgrades standard fields while retaining custom definitions and legacy values", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE people(id INTEGER PRIMARY KEY,census_code TEXT,name TEXT,kind TEXT)");
    createMembers(db, {});
    const oldFields = [
      { branch: "L/C", key: "specialita", label: "Specialita", type: "text", options: [] },
      { branch: "E/G", key: "specialita", label: "Specialita", type: "text", options: [] },
      { branch: "E/G", key: "brevetti", label: "Brevetti di competenza", type: "text", options: [] },
      { branch: "E/G", key: "tappa", label: "Tappa", type: "text", options: [] },
      { branch: "E/G", key: "progressione", label: "Ingresso in reparto", type: "select", options: ["Piede tenero"] },
    ];
    for (const field of oldFields) db.prepare("INSERT OR REPLACE INTO member_fields VALUES(?,?,?)")
      .run(field.branch, field.key, JSON.stringify(field));
    db.exec("INSERT INTO people VALUES(1,'012345','Example','ragazzo')");
    db.prepare("INSERT INTO member_values VALUES(1,'E/G',?)").run(JSON.stringify({ specialita: "Old custom award", progressione: "Piede tenero" }));
    createMembers(db, {});
    for (const old of oldFields) {
      if (old.key === "progressione") {
        assert.equal(db.prepare("SELECT definition FROM member_fields WHERE branch=? AND key=?").get(old.branch, old.key), undefined);
        continue;
      }
      const field = JSON.parse(db.prepare("SELECT definition FROM member_fields WHERE branch=? AND key=?").get(old.branch, old.key).definition);
      assert.deepEqual(field, M.defaultFields.find(field => field.branch === old.branch && field.key === old.key));
    }
    assert.equal(JSON.parse(db.prepare("SELECT data FROM member_values WHERE person_id=1").get().data).specialita, "Old custom award");
    assert.equal(JSON.parse(db.prepare("SELECT data FROM member_values WHERE person_id=1").get().data).ruolo, "Piede tenero");
    assert.equal(JSON.parse(db.prepare("SELECT data FROM member_values WHERE person_id=1").get().data).progressione, undefined);
    const custom = { ...oldFields[0], label: "Local custom specialty" };
    db.prepare("UPDATE member_fields SET definition=? WHERE branch='L/C' AND key='specialita'").run(JSON.stringify(custom));
    createMembers(db, {});
    assert.deepEqual(JSON.parse(db.prepare("SELECT definition FROM member_fields WHERE branch='L/C' AND key='specialita'").get().definition), custom);
    assert.equal(M.specialtyCatalogs["L/C"].length, 39);
    assert.equal(M.specialtyCatalogs["E/G"].length, 65);
    assert.equal(M.competencyBadges.length, 15);
  } finally { db.close(); }
});

test("parents, multiple specialties, badges and tenderfoot role persist without exposing admin", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-member-catalogs-"));
  let app = await start(directory);
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([{ "RESP.GENITORIALE DATI": guardianSource },
    { "CODICE SOCIO": "012346", BRANCA: "Branca L/C", "RESP.GENITORIALE DATI": "" },
    { "CODICE SOCIO": "23816938", "ANNO SCOUT": "2099", BRANCA: "Branca Adulti", "RESP.GENITORIALE DATI": "" }]));
  let state = await app.snapshot();
  assert.equal(state.members.some(member => member.code === "23816938"), false);
  assert.equal(state.members.length, 3);
  assert.equal(state.currentYear, "2026");
  let member = state.members.find(member => member.code === "012345");
  member.profile.guardianContacts[0].givenName = "Responsabile";
  member.profile.guardianContacts[0].surname = "Esempio";
  const values = { ruolo: "Piede tenero", tappa: "Tappa della scoperta",
    specialita: ["Cuoco", "Fotografo"], brevetti: ["Pioniere", "Soccorritore"] };
  assert.equal((await app.request("members/" + member.id, "PATCH",
    { revision: member.revision, branch: member.branch, profile: member.profile, values })).status, 200);
  await app.import(csv([{ "RESP.GENITORIALE DATI": guardianSource }]));
  member = (await app.snapshot()).members.find(row => row.id === member.id);
  assert.equal(member.profile.guardianContacts[0].givenName, "Responsabile");
  member.profile.guardianContacts[0] = { ...member.profile.guardianContacts[0], fullName: "Responsabile Verificato", givenName: "", surname: "" };
  assert.equal((await app.request("members/" + member.id, "PATCH",
    { revision: member.revision, branch: member.branch, profile: member.profile, values })).status, 200);
  await app.import(csv([{ "RESP.GENITORIALE DATI": guardianSource }]));
  member = (await app.snapshot()).members.find(row => row.id === member.id);
  assert.equal(member.profile.guardianContacts[0].fullName, "Responsabile Verificato");
  assert.equal(member.profile.guardians, guardianSource);
  assert.deepEqual(member.values["E/G"], values);
  const before = await app.snapshot();
  assert.equal((await app.request("members/" + member.id, "PATCH", { revision: member.revision, branch: member.branch,
    profile: member.profile, values: { specialita: ["Not a catalog choice"] } })).status, 400);
  assert.deepEqual(await app.snapshot(), before);
  assert.equal((await app.request("members/" + member.id, "PATCH", { revision: member.revision, branch: member.branch,
    profile: { ...member.profile, guardianContacts: [{ givenName: "Example", taxCode: "invalid" }] }, values })).status, 400);
  const lc = before.members.find(row => row.code === "012346");
  assert.equal((await app.request("members/macro", "POST", { action: "field", branch: "L/C", key: "specialita",
    value: ["Astronomo", "Kim"], members: [{ id: lc.id, revision: lc.revision }] })).status, 200);
  const persisted = await app.snapshot();
  assert.deepEqual(persisted.members.find(row => row.id === lc.id).values["L/C"].specialita, ["Astronomo", "Kim"]);
  await app.close(); app = await start(directory); await app.login();
  assert.deepEqual(await app.snapshot(), persisted);
});

test("unit migrations replace standard flags and novice roles once without changing custom schemas", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE people(id INTEGER PRIMARY KEY,census_code TEXT,name TEXT,kind TEXT)");
    createMembers(db, {});
    for (let id = 1; id <= 3; id++) {
      db.prepare("INSERT INTO people VALUES(?,?,?,'ragazzo')").run(id, "01234" + id, "Example " + id);
      db.prepare("INSERT INTO member_profiles VALUES(?,?,?,1)").run(id, id === 3 ? "L/C" : "E/G", "{}");
    }
    const flag = { branch: "E/G", key: "progressione", label: "Piede tenero", type: "select", options: ["Si", "No"] };
    const role = { ...M.defaultFields.find(field => field.branch === "L/C" && field.key === "ruolo"),
      options: ["Capo sestiglia", "Vice capo sestiglia", "Sestigliere", "Novizio"] };
    db.prepare("INSERT INTO member_fields VALUES('E/G','progressione',?)").run(JSON.stringify(flag));
    db.prepare("UPDATE member_fields SET definition=? WHERE branch='L/C' AND key='ruolo'").run(JSON.stringify(role));
    db.prepare("INSERT INTO member_values VALUES(1,'E/G',?)").run('{"ruolo":"Squadrigliere","progressione":"Si"}');
    db.prepare("INSERT INTO member_values VALUES(2,'E/G',?)").run('{"ruolo":"Capo squadriglia","progressione":"Si"}');
    db.prepare("INSERT INTO member_values VALUES(3,'L/C',?)").run('{"ruolo":"Novizio","sestiglia":"Rossi"}');
    createMembers(db, {});
    const values = () => db.prepare("SELECT person_id,data FROM member_values ORDER BY person_id").all().map(row => JSON.parse(row.data));
    assert.deepEqual(values(), [{ ruolo: "Piede tenero" }, { ruolo: "Capo squadriglia" }, { ruolo: "Cucciolo", sestiglia: "Rossi" }]);
    const revisions = () => db.prepare("SELECT revision FROM member_profiles ORDER BY person_id").all().map(row => row.revision);
    assert.deepEqual(revisions(), [2, 2, 2]);
    createMembers(db, {});
    assert.deepEqual(revisions(), [2, 2, 2]);
    const customRole = { ...role, label: "Custom local roles" };
    const customFlag = { ...flag, label: "Local flag" };
    db.prepare("UPDATE member_fields SET definition=? WHERE branch='L/C' AND key='ruolo'").run(JSON.stringify(customRole));
    db.prepare("INSERT INTO member_fields VALUES('E/G','progressione',?)").run(JSON.stringify(customFlag));
    db.prepare("UPDATE member_values SET data=? WHERE person_id=3").run('{"ruolo":"Novizio","sestiglia":"Rossi"}');
    createMembers(db, {});
    assert.equal(values()[2].ruolo, "Novizio");
    assert.equal(db.prepare("SELECT definition FROM member_fields WHERE branch='L/C' AND key='ruolo'").get().definition, JSON.stringify(customRole));
    assert.equal(db.prepare("SELECT definition FROM member_fields WHERE branch='E/G' AND key='progressione'").get().definition, JSON.stringify(customFlag));
    db.exec("INSERT INTO people VALUES(4,'012349','Example 4','ragazzo')");
    const longName = "Legacy " + "x".repeat(90);
    db.prepare("INSERT INTO member_values VALUES(4,'E/G',?)").run(JSON.stringify({ squadriglia: longName }));
    createMembers(db, {});
    assert.equal(db.prepare("SELECT name FROM member_units WHERE name=?").get(longName).name, longName);
  } finally { db.close(); }
});

test("units preserve identity, colors, symbols and assignments across hide, restore and restart; all editors enforce roles", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-member-units-"));
  let app = await start(directory);
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([{}, { "CODICE SOCIO": "012346" }, { "CODICE SOCIO": "012347" }]));
  const send = async (route, method, value, status = 200) => {
    const response = await app.request("members/" + route, method, value);
    assert.equal(response.status, status, await response.clone().text());
    return status < 300 ? response.json() : null;
  };
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const first = (await send("units", "POST", { branch: "E/G", name: "Aquile", color: "#cc3038", color2: "#ffffff", emblem: png }, 201)).unit;
  assert.equal(first.color, M.patrolIdentity("Aquile").color);
  assert.equal(first.color2, M.patrolIdentity("Aquile").color2);
  const second = (await send("units", "POST", { branch: "E/G", name: "Falchi" }, 201)).unit;
  let state = await app.snapshot();
  const [a, b, c] = ["012345", "012346", "012347"].map(code => state.members.find(member => member.code === code));
  const assign = async (id, unitId, role, status = 200) => {
    const member = (await app.snapshot()).members.find(member => member.id === id);
    await send("units/assign", "PATCH", { memberId: id, revision: member.revision, unitId, role }, status);
  };
  await assign(a.id, first.id, "Capo squadriglia");
  await assign(b.id, first.id, "Capo squadriglia", 409);
  await assign(b.id, first.id, "Vice capo squadriglia");
  await assign(c.id, first.id, "Piede tenero");
  await send("units/assign", "PATCH", { memberId: c.id, revision: 1, unitId: second.id, role: "Squadrigliere" }, 409);
  const before = await app.snapshot(), latestC = before.members.find(member => member.id === c.id);
  await send(String(c.id), "PATCH", { branch: "E/G", revision: latestC.revision, profile: latestC.profile,
    values: { squadriglia: first.name, ruolo: "Capo squadriglia" } }, 409);
  await send("macro", "POST", { action: "field", branch: "E/G", key: "ruolo", value: "Capo squadriglia",
    members: [b, c].map(member => ({ id: member.id, revision: before.members.find(row => row.id === member.id).revision })) }, 409);
  assert.deepEqual(await app.snapshot(), before);
  for (const unitId of [undefined, {}, "1", -1, 1.5])
    await send("units/assign", "PATCH", { memberId: c.id, revision: latestC.revision, unitId, role: "Squadrigliere" }, 400);
  await assign(a.id, second.id, "Squadrigliere");
  state = await app.snapshot();
  await send("macro", "POST", { action: "field", branch: "E/G", key: "ruolo", value: "Capo squadriglia",
    members: [b, c].map(member => ({ id: member.id, revision: state.members.find(row => row.id === member.id).revision })) }, 409);
  assert.deepEqual(await app.snapshot(), state);
  await assign(b.id, first.id, "Capo squadriglia");
  await send("units/" + first.id, "PATCH", { revision: first.revision, hidden: true });
  await assign(c.id, first.id, "Squadrigliere", 409);
  state = await app.snapshot();
  const unchanged = state.members.find(member => member.id === c.id);
  await send(String(c.id), "PATCH", { branch: "E/G", revision: unchanged.revision, profile: unchanged.profile,
    values: { ...unchanged.values["E/G"], specialita: ["Cuoco"] } });
  await app.close(); app = await start(directory); await app.login();
  state = await app.snapshot();
  assert.equal(state.units.find(unit => unit.id === first.id).hidden, true);
  assert.equal(state.members.find(member => member.id === c.id).values["E/G"].squadriglia, first.name);
  const restored = (await send("units", "POST", { branch: "E/G", name: "  AQUILE  ", color: "#000000", emblem: "" }, 201)).unit;
  assert.deepEqual({ ...restored, revision: first.revision, hidden: false }, first);
  await send("units", "POST", { branch: "E/G", name: "Aquile" }, 409);
  await send("units/" + first.id, "PATCH", { revision: first.revision, hidden: true }, 409);
  await send("units/" + first.id, "PATCH", { revision: restored.revision, hidden: false, emblem: "data:image/svg+xml;base64,WA==" }, 400);
  await send("units", "POST", { branch: "E/G", name: "Invalid image", emblem: "data:image/png;base64,WA==" }, 400);
  assert.equal((await app.snapshot()).units.some(unit => unit.name === "Invalid image"), false);
  await assign(c.id, null, "");
  const cleared = (await app.snapshot()).members.find(member => member.id === c.id).values["E/G"];
  assert.deepEqual(cleared, { squadriglia: "", ruolo: "", specialita: ["Cuoco"] });
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  db.prepare("UPDATE member_values SET data=? WHERE person_id=? AND branch='E/G'")
    .run(JSON.stringify({ ...cleared, specialita: "Cuoco; Old custom award" }), c.id);
  db.close();
  await assign(c.id, second.id, "Piede tenero");
  assert.deepEqual((await app.snapshot()).members.find(member => member.id === c.id).values["E/G"].specialita, ["Cuoco", "Old custom award"]);
});

test("patrol catalog resolves singular and plural names and preserves all supplied color variants", () => {
  for (const [singular, plural, first, second = first] of M.patrolCatalog) {
    const identity = M.patrolIdentity(singular);
    assert.deepEqual(identity, M.patrolIdentity(plural.toUpperCase()));
    assert.equal(identity.color, M.patrolColors[first][0]);
    assert.equal(identity.color2, M.patrolColors[second][0]);
    assert.match(identity.image, /^[a-z-]+\.svg$/);
  }
  assert.deepEqual(M.patrolIdentity("Aquile").colors, ["Verde", "Nero"]);
  assert.deepEqual(M.patrolIdentity("Falchi").colors, ["Rosa"]);
  assert.equal(M.patrolIdentity("Leoni").image, "leoni.svg");
  assert.equal(M.patrolIdentity("Gallo"), null);
  assert.equal(M.patrolCatalog.filter(([name]) => name.startsWith("Gallo ")).length, 3);
  assert.equal(M.patrolIdentity("Nome locale"), null);
});

test("passage re-entry cannot reactivate a historical assignment into an occupied leader role", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-unit-passage-"));
  const app = await start(directory, "7654321,7654322");
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([{ BRANCA: "Branca L/C" }, { "CODICE SOCIO": "012346" }]));
  const state = await app.snapshot();
  const lc = state.members.find(member => member.code === "012345"), eg = state.members.find(member => member.code === "012346");
  for (const [code, branch] of [["7654321", "L/C"], ["7654322", "E/G"]]) {
    const chief = state.members.find(member => member.code === code);
    assert.equal((await app.request("people/" + chief.id, "PATCH", { serviceBranch: branch })).status, 200);
  }
  assert.equal((await app.request("members/" + eg.id, "PATCH", { revision: eg.revision, branch: "E/G", profile: eg.profile,
    values: { squadriglia: "Aquile", ruolo: "Capo squadriglia" } })).status, 200);
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  db.prepare("INSERT INTO member_values VALUES(?,'E/G',?)").run(lc.id, '{"squadriglia":"Aquile","ruolo":"Capo squadriglia"}');
  db.close();
  await app.login("7654321");
  assert.equal((await app.request("members/macro", "POST", { action: "passage", branch: "E/G",
    members: [{ id: lc.id, revision: lc.revision }] })).status, 200);
  await app.login("7654322");
  const transfer = (await app.snapshot()).transfers[0];
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: transfer.revision })).status, 409);
  let current = await app.snapshot();
  assert.equal(current.members.some(member => member.id === lc.id), false);
  assert.equal(current.transfers.length, 1);
  const leader = current.members.find(member => member.id === eg.id);
  assert.equal((await app.request("members/units/assign", "PATCH", { memberId: eg.id, revision: leader.revision, unitId: null })).status, 200);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: transfer.revision })).status, 200);
  current = await app.snapshot();
  assert.equal(current.members.find(member => member.id === lc.id).values["E/G"].ruolo, "Capo squadriglia");
});

test("LC environment is shared, migrates moments and novice roles, and respects chief scope", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-lc-environment-"));
  let app = await start(directory, "7654321,7654322,7654323");
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([{ BRANCA: "Branca L/C" }, { "CODICE SOCIO": "012346", BRANCA: "Branca L/C" },
    { "CODICE SOCIO": "012347", BRANCA: "Branca R/S" }]));
  let state = await app.snapshot();
  const chiefs = ["7654321", "7654322", "7654323"].map(code => state.members.find(member => member.code === code));
  for (const [index, chief] of chiefs.entries())
    assert.equal((await app.request("people/" + chief.id, "PATCH", { serviceBranch: M.branches[index] })).status, 200);
  const lc = state.members.find(member => member.code === "012345");
  const rs = state.members.find(member => member.code === "012347");
  const values = { sestiglia: "Rossi", ruolo: "Cucciolo", progressione: "Lupo della rupe", specialita: ["Kim"] };
  assert.equal((await app.request("members/" + lc.id, "PATCH", { branch: "L/C", revision: lc.revision, profile: lc.profile, values })).status, 200);
  const egUnit = await app.request("members/units", "POST", { branch: "E/G", name: "Aquile" });
  const eg = (await egUnit.json()).unit;
  await app.login("7654321");
  state = await app.snapshot();
  assert.equal(state.units.every(unit => unit.branch === "L/C"), true);
  assert.equal((await app.request("members/units", "POST", { branch: "E/G", name: "Falchi" })).status, 403);
  assert.equal((await app.request("members/units/" + eg.id, "PATCH", { revision: eg.revision, hidden: true })).status, 403);
  const member = state.members.find(member => member.id === lc.id);
  assert.equal((await app.request("members/units/assign", "PATCH", { memberId: member.id, revision: member.revision, unitId: eg.id, role: "Cucciolo" })).status, 403);
  assert.equal((await app.request("members/lc-environment", "PATCH", { revision: state.lc.revision, environment: "Cerchio" })).status, 200);
  const changed = await app.snapshot(), after = changed.members.find(member => member.id === lc.id);
  assert.deepEqual(after.values["L/C"], { ...values, ruolo: "Cocci", progressione: "Coccinella del bosco" });
  assert.equal(after.revision, member.revision + 1);
  assert.deepEqual(changed.fields.find(field => field.key === "progressione").options, M.lcMoments.Cerchio);
  assert.deepEqual(changed.fields.find(field => field.key === "ruolo").options, M.unitRoles("L/C", "Cerchio"));
  assert.equal(changed.fields.find(field => field.key === "pista").label, "Sentiero");
  assert.equal((await app.request("members/lc-environment", "PATCH", { revision: state.lc.revision, environment: "Branco" })).status, 409);
  assert.equal((await app.request("members/units", "POST", { branch: "L/C", name: "Bianchi", color: "#ff0000" })).status, 400);
  await app.login("7654322");
  assert.equal((await app.request("members/lc-environment", "PATCH", { revision: changed.lc.revision, environment: "Branco" })).status, 403);
  await app.login("7654323");
  assert.equal((await app.request("members/units", "POST", { branch: "R/S", name: "Not a unit" })).status, 400);
  assert.equal((await app.request("members/units/assign", "PATCH", { memberId: rs.id, revision: rs.revision, unitId: eg.id, role: "Squadrigliere" })).status, 400);
  await app.close(); app = await start(directory, "7654321,7654322,7654323"); await app.login("7654321");
  assert.deepEqual(await app.snapshot(), changed);
});

test("census overview returns only latest-year branch aggregates to administrators", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-census-overview-"));
  const app = await start(directory, "7654321");
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([
    { "CODICE SOCIO": "012345", BRANCA: "Branca E/G" },
    { "CODICE SOCIO": "012346", BRANCA: "Branca E/G" },
    { "CODICE SOCIO": "012347", BRANCA: "Branca L/C" },
    { "CODICE SOCIO": "012348", "ANNO SCOUT": "2025", BRANCA: "Branca R/S" },
    { "CODICE SOCIO": "23816938", BRANCA: "Branca Adulti" },
  ]));
  const response = await app.request("members/overview");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    year: "2026", total: 3,
    branches: [
      { branch: "L/C", count: 1 }, { branch: "E/G", count: 2 },
      { branch: "R/S", count: 0 }, { branch: "Adulti", count: 0 },
    ],
  });
  const state = await app.snapshot();
  const chief = state.members.find(member => member.code === "7654321");
  assert.equal((await app.request("people/" + chief.id, "PATCH", { serviceBranch: "E/G" })).status, 200);
  await app.login("7654321");
  assert.equal((await app.request("members/overview")).status, 403);
});

test("CSV export is formula-safe with valid quoting and leading-zero codes", () => {
  const output = M.exportCsv([["012345", "=1+1", " +1", "@x", "-2", 'a,"b"\nnext', undefined]]);
  assert.equal(output, '\uFEFF"012345","\'=1+1","\' +1","\'@x","\'-2","a,""b""\nnext",""');
});

test("old suspended census records are excluded using the latest status, not birth year or selected census", () => {
  const member = (year, statusCode) => ({ censuses: [{ year, statusCode }] });
  assert.equal(M.longSuspended(member("2027", "D"), "2027"), true);
  assert.equal(M.longSuspended(member("2026", "S"), "2027"), true);
  assert.equal(M.longSuspended(member("2027", "S"), "2027"), false);
  assert.equal(M.longSuspended(member("2025", "A"), "2027"), false);
  assert.equal(M.longSuspended({ censuses: [] }, "2027"), false);
  assert.equal(M.longSuspended({ censuses: [{ year: "2027", statusCode: "A" }, { year: "2025", statusCode: "D" }] }, "2027"), false);
  assert.equal(M.nextBranch("L/C"), "E/G"); assert.equal(M.nextBranch("E/G"), "R/S"); assert.equal(M.nextBranch("R/S"), "");
  assert.equal(M.defaultFields.filter(f => f.branch === "R/S").some(f => ["ruolo", "specialita", "brevetti", "sestiglia", "squadriglia"].includes(f.key)), false);
  assert.deepEqual(M.defaultFields.find(f => f.branch === "R/S" && f.key === "comunita"),
    { branch: "R/S", key: "comunita", label: "Comunità R/S · Noviziato per i novizi", type: "select", options: ["Noviziato", "Clan"] });
});

test("educational schema upgrade preserves existing role values and custom definitions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE people(id INTEGER PRIMARY KEY,census_code TEXT,name TEXT,kind TEXT)");
    createMembers(db, {});
    db.exec("INSERT INTO people VALUES(1,'012345','Example','ragazzo')");
    const old = { branch: "E/G", key: "ruolo", label: "Ruolo in squadriglia", type: "text", options: [] };
    db.prepare("UPDATE member_fields SET definition=? WHERE branch='E/G' AND key='ruolo'").run(JSON.stringify(old));
    db.prepare("INSERT INTO member_values VALUES(1,'E/G',?)").run('{"ruolo":"Legacy role"}');
    const oldCommunity = { branch: "R/S", key: "comunita", label: "Noviziato / clan", type: "text", options: [] };
    db.prepare("UPDATE member_fields SET definition=? WHERE branch='R/S' AND key='comunita'").run(JSON.stringify(oldCommunity));
    db.prepare("INSERT INTO member_values VALUES(1,'R/S',?)").run('{"comunita":"Comunità locale"}');
    createMembers(db, {});
    const upgraded = JSON.parse(db.prepare("SELECT definition FROM member_fields WHERE branch='E/G' AND key='ruolo'").get().definition);
    assert.equal(upgraded.type, "select");
    assert.equal(upgraded.options.includes("Capo squadriglia"), true);
    assert.equal(upgraded.options.includes("Legacy role"), true);
    const upgradedCommunity = JSON.parse(db.prepare("SELECT definition FROM member_fields WHERE branch='R/S' AND key='comunita'").get().definition);
    assert.equal(upgradedCommunity.type, "select");
    assert.deepEqual(upgradedCommunity.options.slice(0, 2), ["Noviziato", "Clan"]);
    assert.equal(upgradedCommunity.options.includes("Comunità locale"), true);
    assert.equal(JSON.parse(db.prepare("SELECT data FROM member_values WHERE person_id=1 AND branch='R/S'").get().data).comunita, "Comunità locale");
    assert.equal(JSON.parse(db.prepare("SELECT data FROM member_values WHERE person_id=1").get().data).ruolo, "Legacy role");
    const custom = { ...old, label: "Custom role" };
    db.prepare("UPDATE member_fields SET definition=? WHERE branch='E/G' AND key='ruolo'").run(JSON.stringify(custom));
    createMembers(db, {});
    assert.deepEqual(JSON.parse(db.prepare("SELECT definition FROM member_fields WHERE branch='E/G' AND key='ruolo'").get().definition), custom);
  } finally { db.close(); }
});

test("service branches constrain every staff operation and passages require a different destination chief", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-branch-access-"));
  let app = await start(directory, "7654321,7654322,7654323");
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([
    { "CODICE SOCIO": "012341", BRANCA: "Branca L/C" },
    { "CODICE SOCIO": "012342", BRANCA: "Branca L/C" },
    { "CODICE SOCIO": "012343", BRANCA: "Branca E/G" },
    { "CODICE SOCIO": "012344", BRANCA: "Branca R/S" },
  ]));
  let state = await app.snapshot();
  const chiefs = ["7654321", "7654322", "7654323"].map(code => state.members.find(m => m.code === code));
  for (const [i, chief] of chiefs.entries())
    assert.equal((await app.request("people/" + chief.id, "PATCH", { serviceBranch: M.branches[i] })).status, 200);
  const adminCookie = app.cookie();
  let lc = state.members.find(m => m.code === "012341"), eg = state.members.find(m => m.code === "012343");
  // A historical branch value must not be exposed to the chief of the current branch.
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  db.prepare("INSERT INTO member_values VALUES(?,'E/G',?)").run(lc.id, '{"squadriglia":"Historical"}');
  db.close();
  await app.login("7654321");
  const lcCookie = app.cookie();
  state = await app.snapshot();
  assert.equal(state.members.length, 2);
  assert.equal(state.members.every(m => m.branch === "L/C"), true);
  assert.equal(state.members[0].values["E/G"], undefined);
  assert.equal(state.fields.every(f => f.branch === "L/C"), true);
  for (const route of ["members/import", "members/templates", "members"])
    assert.equal((await app.request(route, "POST", {})).status, 403);
  assert.equal((await app.request("members/" + eg.id, "PATCH", { revision: eg.revision, branch: eg.branch, profile: eg.profile, values: {} })).status, 403);
  assert.equal((await app.request("members/fields", "POST", { branch: "E/G", key: "secret", label: "Secret", type: "text" })).status, 403);
  assert.equal((await app.request("members/fields", "POST", { branch: "L/C", key: "obiettivo", label: "Obiettivo", type: "text" })).status, 201);
  assert.equal((await app.request("members/" + lc.id, "PATCH", { revision: lc.revision, branch: "E/G", profile: lc.profile, values: {} })).status, 403);
  assert.equal((await app.request("members/" + lc.id, "PATCH", { revision: lc.revision, branch: "L/C", profile: lc.profile, values: { ruolo: "Capo sestiglia", anno: "Terzo anno", progressione: "Lupo anziano" } })).status, 200);
  lc = (await app.snapshot()).members.find(m => m.id === lc.id);
  const proposal = { action: "passage", branch: "E/G", members: [{ id: lc.id, revision: lc.revision }] };
  assert.equal((await app.request("members/macro", "POST", { ...proposal, branch: "R/S" })).status, 400);
  assert.equal((await app.request("members/macro", "POST", { ...proposal, members: [...proposal.members, { id: eg.id, revision: eg.revision }] })).status, 403);
  assert.equal((await app.snapshot()).transfers.length, 0);
  assert.equal((await app.request("members/macro", "POST", proposal)).status, 200);
  assert.equal((await app.request("members/macro", "POST", proposal)).status, 409);
  state = await app.snapshot();
  assert.equal(state.members.find(m => m.id === lc.id).branch, "L/C");
  const transfer = state.transfers[0];
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 403);
  await app.login("7654323");
  assert.equal((await app.snapshot()).transfers.length, 0);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 403);
  await app.login("7654322");
  const egCookie = app.cookie();
  state = await app.snapshot();
  assert.equal(state.members.some(m => m.id === lc.id), false);
  assert.equal(state.transfers[0].canConfirm, true);
  assert.equal(Object.hasOwn(state.transfers[0], "profile"), false);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 99 })).status, 409);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "cancel", revision: 1 })).status, 403);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 200);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 409);
  state = await app.snapshot();
  assert.equal(state.members.find(m => m.id === lc.id).branch, "E/G");
  assert.equal(state.members.find(m => m.id === lc.id).values["L/C"], undefined);
  const lcResponse = await app.request("members", "GET", undefined, "http://localhost", lcCookie);
  assert.equal((await lcResponse.json()).members.some(m => m.id === lc.id), false);
  const all = await (await app.request("members", "GET", undefined, "http://localhost", adminCookie)).json();
  assert.equal(all.members.find(m => m.id === lc.id).values["L/C"].ruolo, "Capo sestiglia");
  // Assignment changes take effect on existing sessions and survive restart.
  assert.equal((await app.request("people/" + chiefs[1].id, "PATCH", { serviceBranch: "" }, "http://localhost", adminCookie)).status, 200);
  assert.equal((await app.request("members", "GET", undefined, "http://localhost", egCookie)).status, 403);
  await app.close(); app = await start(directory, "7654321,7654322,7654323");
  await app.login("7654321");
  assert.equal((await app.snapshot()).members.every(m => m.branch === "L/C"), true);
});

test("pending passages survive restart, conflict with profile changes and can be rejected or cancelled", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-branch-transfers-"));
  let app = await start(directory);
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login(); await app.import(csv([{ BRANCA: "Branca L/C" }]));
  let state = await app.snapshot(), member = state.members.find(m => m.code === "012345");
  const chief = state.members.find(m => m.code === "7654321");
  assert.equal((await app.request("people/" + chief.id, "PATCH", { serviceBranch: "E/G" })).status, 200);
  const propose = () => app.request("members/macro", "POST", { action: "passage", branch: "E/G", members: [{ id: member.id, revision: member.revision }] });
  assert.equal((await propose()).status, 200);
  await app.close(); app = await start(directory); await app.login();
  let transfer = (await app.snapshot()).transfers[0];
  assert.equal(transfer.canConfirm, false);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 403);
  assert.equal((await app.request("members/" + member.id, "PATCH", { branch: "L/C", revision: member.revision, profile: member.profile, values: { sestiglia: "Rossi" } })).status, 200);
  member = (await app.snapshot()).members.find(m => m.id === member.id);
  await app.login("7654321");
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 409);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "reject", revision: 1 })).status, 200);
  await app.login();
  assert.equal((await propose()).status, 200);
  transfer = (await app.snapshot()).transfers[0];
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "cancel", revision: 1 })).status, 200);
  assert.equal((await app.snapshot()).members.find(m => m.id === member.id).branch, "L/C");
});

test("real NAS gateway connects the member page, session config, assets and API under the site prefix", async t => {
  const basePath = "/agesci-canicattini1";
  const app = await startNasDev({ basePath });
  t.after(() => app.stop());
  const root = app.origin + basePath;
  const page = await (await fetch(root + "/area-riservata/soci.html")).text();
  assert.match(page, /id="members-app"/);
  assert.match(page, /href="\.\.\/">/);
  assert.match(page, /src="\.\.\/assets\/js\/soci.js"/);
  assert.doesNotMatch(page, /include:brand/);
  assert.equal((await fetch(root + "/api/members")).status, 401);
  const login = await fetch(root + "/api/auth/login", { method: "POST",
    headers: { Origin: app.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ code: "23816938", password: app.password }) });
  assert.equal(login.status, 200);
  const headers = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  const config = await (await fetch(root + "/config/site.js", { headers })).text();
  assert.match(config, /"admin":true/);
  assert.match(config, /"basePath":"\/agesci-canicattini1"/);
  assert.equal((await fetch(root + "/api/members", { headers })).status, 200);
  for (const asset of ["assets/js/soci-model.js", "assets/js/soci-units.js", "assets/js/soci.js", "assets/css/soci.css"])
    assert.equal((await fetch(root + "/" + asset)).status, 200);
  const dashboard = await (await fetch(root + "/area-riservata/")).text();
  assert.match(dashboard, /href="soci.html"/);
});

test("unassigned chiefs cannot access members and import preview does not write or grant login", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-members-auth-"));
  const app = await start(directory);
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  assert.equal((await app.request("members")).status, 401);
  await app.login("7654321");
  for (const [route, method, value] of [["members", "GET"], ["members/import", "POST", { csv: csv() }],
    ["members/fields", "POST", {}], ["members/templates", "POST", {}], ["members/macro", "POST", {}], ["members/1", "PATCH", {}]])
    assert.equal((await app.request(route, method, value)).status, 403);
  await app.login();
  assert.equal((await app.request("members/import", "POST", { csv: csv() }, "https://foreign.invalid")).status, 403);
  const initial = await app.snapshot();
  const content = csv([{}, { "CODICE SOCIO": "012346", BRANCA: "Adulti" }]);
  const preview = await (await app.request("members/import", "POST", { csv: content })).json();
  assert.equal(preview.rows, 2); assert.equal(preview.newCount, 2);
  assert.deepEqual(await app.snapshot(), initial);
  assert.equal((await app.request("members/import", "POST", { csv: content, confirm: true })).status, 409);
  assert.equal((await app.request("members/import", "POST", { csv: content + "\n", confirm: true, version: preview.version })).status, 409);
  assert.equal((await app.request("members/import", "POST", { csv: content, confirm: true, version: preview.version })).status, 200);
  const imported = await app.snapshot();
  assert.equal(imported.members.length, initial.members.length + 2);
  assert.equal(JSON.stringify(imported).includes("password_hash"), false);
  assert.match((await app.request("members")).headers.get("cache-control"), /no-store/);
  assert.equal((await app.request("auth/status", "POST", { code: "012346" })).status, 403);
  const readDb = new DatabaseSync(path.join(directory, "site.sqlite"));
  assert.equal(readDb.prepare("SELECT password_hash FROM people WHERE census_code='012346'").get().password_hash, null);
  readDb.close();
});

test("members retain annual history, educational fields, account permissions and persist after restart", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-members-history-"));
  let app = await start(directory);
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv());
  let member = (await app.snapshot()).members.find(m => m.code === "012345");
  const payload = { revision: member.revision, branch: "E/G", profile: member.profile,
    values: { squadriglia: "Aquile", promessa: "2025-05-01" } };
  assert.equal((await app.request("members/" + member.id, "PATCH", payload)).status, 200);
  assert.equal((await app.request("members/" + member.id, "PATCH", payload)).status, 409);
  member = (await app.snapshot()).members.find(m => m.id === member.id);
  assert.equal((await app.request("members/macro", "POST", { action: "branch", branch: "R/S",
    members: [{ id: member.id, revision: member.revision }] })).status, 200);
  assert.equal((await app.snapshot()).members.find(m => m.id === member.id).branch, "E/G");
  const proposal = (await app.snapshot()).transfers[0];
  const capo = (await app.snapshot()).members.find(m => m.code === "7654321");
  assert.equal((await app.request("people/" + capo.id, "PATCH", { serviceBranch: "R/S" })).status, 200);
  await app.login("7654321");
  assert.equal((await app.request("members/transfers/" + proposal.id, "PATCH", { action: "confirm", revision: proposal.revision })).status, 200);
  await app.login();
  await app.import(csv([{ "ANNO SCOUT": "2027", NOME: "Nuovo", BRANCA: "Branca R/S" }]));
  await app.import(csv([{ "ANNO SCOUT": "2025", NOME: "Vecchio", GRUPPO: "Gruppo storico" }]));
  member = (await app.snapshot()).members.find(m => m.id === member.id);
  assert.equal(member.profile.givenName, "Nuovo");
  assert.equal(member.branch, "R/S"); assert.equal(member.kind, "ragazzo");
  assert.deepEqual(member.censuses.map(c => c.year), ["2027", "2026", "2025"]);
  assert.deepEqual(member.values["E/G"], { squadriglia: "Aquile", promessa: "2025-05-01" });
  assert.equal((await app.snapshot()).group.GRUPPO, "Gruppo esempio");
  const reducedHeaders = ["ANNO SCOUT", "CODICE SOCIO", "NOME", "COGNOME", "BRANCA", "ORDINALE"];
  await app.import(csv([{ "ANNO SCOUT": "2027" }], reducedHeaders));
  member = (await app.snapshot()).members.find(m => m.id === member.id);
  assert.equal(member.profile.email, "test@example.invalid");
  const preview = await app.import(csv([{ "ANNO SCOUT": "2027", EMAIL: "" }]));
  assert.equal(preview.newCount, 0); assert.equal(preview.updatedCount, 1);
  member = (await app.snapshot()).members.find(m => m.id === member.id);
  assert.equal(member.profile.email, "");
  await app.import(csv([{ "CODICE SOCIO": "7654321", BRANCA: "Branca E/G" }]));
  assert.equal((await app.snapshot()).members.find(m => m.code === "7654321").kind, "capo");
  const before = await app.snapshot();
  await app.close(); app = await start(directory); await app.login();
  assert.deepEqual(await app.snapshot(), before);
});

test("profiles, custom fields, templates and bulk macros validate and rollback atomically", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-members-macros-"));
  const app = await start(directory);
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([{}, { "CODICE SOCIO": "012346" }]));
  let members = (await app.snapshot()).members.filter(m => m.code.startsWith("01234"));
  let [member] = members;
  for (const patch of [
    { profile: { givenName: "Esempio", password_hash: "bad" } }, { profile: { ...member.profile, birthDate: "2026-02-30" } },
    { values: { unknown: "x" } }, { values: { promessa: "no" } },
  ]) assert.equal((await app.request("members/" + member.id, "PATCH",
    { revision: member.revision, branch: member.branch, profile: member.profile, values: {}, ...patch })).status, 400);
  assert.deepEqual((await app.snapshot()).members.filter(m => m.code.startsWith("01234")), members);
  const field = { branch: "E/G", key: "obiettivo", label: "Obiettivo", type: "select", options: ["Avviato", "Concluso"] };
  assert.equal((await app.request("members/fields", "POST", { ...field, options: ["", ""] })).status, 400);
  assert.equal((await app.request("members/fields", "POST", field)).status, 201);
  assert.equal((await app.request("members/fields", "POST", field)).status, 409);
  const macro = { action: "field", branch: "E/G", key: "obiettivo", value: "Avviato",
    members: members.map(m => ({ id: m.id, revision: m.revision })) };
  assert.equal((await app.request("members/macro", "POST", { ...macro,
    members: [macro.members[0], { ...macro.members[1], revision: 999 }] })).status, 409);
  assert.equal((await app.snapshot()).members.find(m => m.id === member.id).values["E/G"], undefined);
  assert.equal((await app.request("members/macro", "POST", { ...macro, value: "Non previsto" })).status, 400);
  assert.equal((await app.request("members/macro", "POST", macro)).status, 200);
  members = (await app.snapshot()).members.filter(m => m.code.startsWith("01234"));
  assert.equal(members.every(m => m.values["E/G"].obiettivo === "Avviato"), true);
  assert.equal((await app.request("members/macro", "POST", macro)).status, 409);
  assert.equal((await app.request("members/templates", "POST", { title: "Interno", body: "{{password}}" })).status, 400);
  assert.equal((await app.request("members/templates", "POST", { title: "Interno", body: "{{nome}} {{percorso}}" })).status, 201);
  const pending = await (await app.request("members/import", "POST", { csv: csv() })).json();
  assert.equal((await app.request("members/templates", "POST", { title: "Altro", body: "{{nome}}" })).status, 201);
  assert.equal((await app.request("members/import", "POST", { csv: csv(), confirm: true, version: pending.version })).status, 409);
  const newMember = { code: "012349", branch: "L/C", profile: { givenName: "Locale", surname: "Esempio" }, values: { sestiglia: "Rossi" } };
  assert.equal((await app.request("members", "POST", { ...newMember, values: { unknown: "bad" } })).status, 400);
  assert.equal((await app.snapshot()).members.some(m => m.code === newMember.code), false);
  assert.equal((await app.request("members", "POST", newMember)).status, 201);
  assert.equal((await app.request("members", "POST", newMember)).status, 409);
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("admin sees all fourteen adults regardless of FoCa/CoCa, consents are ignored and annual assignments persist", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-member-history-"));
  let app = await start(directory, "");
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  const headers = [...columns, "LIVELLO FOCA", "INGRESSO COCA", "CONSENSO 2A", "CONSENSO RIVISTE"];
  await app.import(csv([
    { "ANNO SCOUT": "2025", BRANCA: "Branca L/C", "CONSENSO 2A": "SI" },
    { "CODICE SOCIO": "012346", BRANCA: "Branca Adulti", "LIVELLO FOCA": "CFT", "INGRESSO COCA": "" },
    { "CODICE SOCIO": "012347", BRANCA: "Branca Adulti", "LIVELLO FOCA": "CFT", "INGRESSO COCA": "2025" },
    ...Array.from({ length: 12 }, (_, index) => ({
      "CODICE SOCIO": String(560000 + index), BRANCA: "Branca Adulti",
      "LIVELLO FOCA": "CFT", "INGRESSO COCA": "",
    })),
  ], headers));
  let state = await app.snapshot();
  assert.equal(state.members.some(member => member.code === "012346"), true);
  assert.equal(state.members.some(member => member.code === "012347"), true);
  assert.equal(state.members.filter(member => member.branch === "Adulti").length, 14);
  const overview = await (await app.request("members/overview")).json();
  assert.equal(overview.branches.find(item => item.branch === "Adulti").count, 14);
  let member = state.members.find(member => member.code === "012345");
  assert.equal(member.profile.consent2a, undefined);
  const createUnit = async name => {
    const response = await app.request("members/units", "POST", { branch: "L/C", name });
    assert.equal(response.status, 201);
    return (await response.json()).unit;
  };
  const first = await createUnit("Rossi");
  const assign = async (unit, role) => {
    assert.equal((await app.request("members/units/assign", "PATCH", {
      memberId: member.id, revision: member.revision, unitId: unit.id, role,
    })).status, 200);
    member = (await app.snapshot()).members.find(row => row.id === member.id);
  };
  // The maximum imported year is the operational year for the whole group.
  await assign(first, "Cucciolo");
  await app.import(csv([{ "ANNO SCOUT": "2027", BRANCA: "Branca L/C" }]));
  member = (await app.snapshot()).members.find(row => row.id === member.id);
  const second = await createUnit("Bianchi");
  await assign(second, "Sestigliere");
  assert.deepEqual(member.assignmentHistory, [
    { year: "2027", branch: "L/C", unit: "Bianchi", role: "Sestigliere" },
    { year: "2026", branch: "L/C", unit: "Rossi", role: "Cucciolo" },
  ]);
  assert.equal((await app.request("members/" + member.id, "PATCH", {
    revision: member.revision, branch: member.branch,
    profile: { ...member.profile, consent2a: "invalid", magazines: "SI" }, values: member.values["L/C"],
  })).status, 200);
  const persisted = await app.snapshot();
  member = persisted.members.find(row => row.id === member.id);
  assert.equal(member.profile.consent2a, undefined);
  assert.equal(member.profile.magazines, undefined);
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  const stored = JSON.parse(db.prepare("SELECT data FROM member_profiles WHERE person_id=?").get(member.id).data);
  assert.equal(Object.hasOwn(stored, "consent2a"), false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM member_profiles").get().n >= 3, true);
  db.close();
  await app.close(); app = await start(directory, ""); await app.login();
  assert.deepEqual(await app.snapshot(), persisted);
  assert.equal(M.pendingCoca({ foca: "CFT", coca: "NO" }), true);
  assert.equal(M.pendingCoca({ foca: "", coca: "" }), false);
});

test("admin view-as sees only the chief's branch and passages stay attributed to the real admin", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-view-as-members-"));
  const app = await start(directory, "7654321,7654322");
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([{ "CODICE SOCIO": "012341", BRANCA: "Branca L/C" }, { "CODICE SOCIO": "012343", BRANCA: "Branca E/G" }]));
  let state = await app.snapshot();
  const [lcChief, egChief] = ["7654321", "7654322"].map(code => state.members.find(m => m.code === code));
  assert.equal((await app.request("people/" + lcChief.id, "PATCH", { serviceBranch: "L/C" })).status, 200);
  assert.equal((await app.request("people/" + egChief.id, "PATCH", { serviceBranch: "E/G" })).status, 200);
  const lc = state.members.find(m => m.code === "012341"), eg = state.members.find(m => m.code === "012343");
  assert.equal((await app.request("members/" + lc.id, "PATCH", { revision: lc.revision, branch: "L/C", profile: lc.profile, values: {} })).status, 200);
  assert.equal((await app.request("auth/view-as", "POST", { personId: lcChief.id })).status, 200);
  state = await app.snapshot();
  assert.equal(state.members.every(m => m.branch === "L/C"), true);
  assert.equal(state.fields.every(f => f.branch === "L/C"), true);
  assert.equal((await app.request("members/" + eg.id, "PATCH", { revision: eg.revision, branch: "E/G", profile: eg.profile, values: {} })).status, 403);
  const current = state.members.find(m => m.id === lc.id);
  assert.equal((await app.request("members/macro", "POST", { action: "passage", branch: "E/G", members: [{ id: lc.id, revision: current.revision }] })).status, 200);
  const db = new DatabaseSync(path.join(directory, "site.sqlite"));
  const adminId = db.prepare("SELECT id FROM people WHERE census_code='23816938'").get().id;
  assert.equal(db.prepare("SELECT proposer_id FROM member_transfers").get().proposer_id, adminId);
  assert.equal((await app.request("auth/view-as", "DELETE")).status, 200);
  assert.equal((await app.request("auth/view-as", "POST", { personId: egChief.id })).status, 200);
  const transfer = (await app.snapshot()).transfers[0];
  assert.equal(transfer.canConfirm, false);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 403);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "reject", revision: 1 })).status, 403);
  assert.equal((await app.request("auth/view-as", "DELETE")).status, 200);
  await app.login("7654322");
  assert.equal((await app.snapshot()).transfers[0].canConfirm, true);
  assert.equal((await app.request("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: 1 })).status, 200);
  assert.equal(db.prepare("SELECT reviewer_id FROM member_transfers").get().reviewer_id, egChief.id);
  db.close();
});
