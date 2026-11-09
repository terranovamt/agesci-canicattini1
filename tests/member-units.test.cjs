const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createMemberUnits } = require("../server/member-units.cjs");
const M = require("../assets/js/soci-model.js");

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE people(id INTEGER PRIMARY KEY, census_code TEXT);
    CREATE TABLE member_censuses(person_id INTEGER, year TEXT, data TEXT);
    CREATE TABLE member_values(person_id INTEGER, branch TEXT, data TEXT);
    CREATE TABLE member_profiles(person_id INTEGER, branch TEXT, revision INTEGER);`);
  const units = createMemberUnits(db);
  const post = async value => {
    let result;
    await units.handle("/api/members/units", { method: "POST" }, {}, {
      body: async () => value, access: () => {}, transaction: fn => fn(),
      send: (_response, status, payload) => { result = { status, payload }; },
    });
    return result;
  };
  return { db, units, post };
}

test("Panda is a cataloged yellow and black squadriglia for E/G only", async () => {
  const identity = M.patrolIdentity("Panda");
  assert.deepEqual(identity.colors, ["Giallo", "Nero"]);
  assert.equal(identity.color, M.patrolColors.Giallo[0]);
  assert.equal(identity.color2, M.patrolColors.Nero[0]);
  assert.equal(identity.image, "panda.svg");
  assert.ok(!Object.keys(M.sestigliaColors).includes("Panda"));
  const { units, post } = setup();
  const created = await post({ branch: "E/G", name: "panda" });
  assert.equal(created.status, 201);
  assert.deepEqual([created.payload.unit.color, created.payload.unit.color2], ["#f5cb31", "#242424"]);
  assert.equal(units.all().length, 1);
});

test("Blu is lighter, shared by both palettes and applied to existing sestiglie", async () => {
  const blu = M.sestigliaColors.Blu;
  assert.equal(M.patrolColors.Blu[0], blu);
  const luminance = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).reduce((sum, value) => sum + value, 0);
  assert.ok(luminance(blu) > luminance("#25477e"));
  const distinct = Object.entries(M.patrolColors).filter(([name]) => name !== "Blu").map(([, [hex]]) => hex);
  assert.ok(!distinct.includes(blu));
  const { db, units, post } = setup();
  db.prepare("INSERT INTO member_units(branch,name_key,name,color,color2) VALUES('L/C','blu','Blu','#25477e','#ffffff')").run();
  assert.equal(units.all()[0].color, blu);
  await assert.rejects(post({ branch: "L/C", name: "Blu" }), { status: 409 });
  db.prepare("UPDATE member_units SET hidden=1").run();
  const restored = await post({ branch: "L/C", name: "blu" });
  assert.equal(restored.status, 201);
  assert.equal(restored.payload.unit.color, blu);
  assert.equal(restored.payload.unit.hidden, false);
});
