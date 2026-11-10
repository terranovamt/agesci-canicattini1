const assert = require("node:assert/strict");
const { test } = require("node:test");
const { startNasDemo } = require("../tools/nas-demo.cjs");

test("local demo provides fictional data, working logins, branch scope and editable activities", async () => {
  const app = await startNasDemo();
  let cookie = "";
  const request = async (route, method = "GET", data) => {
    const response = await fetch(app.origin + "/agesci-canicattini1/api/" + route, {
      method, headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    assert.equal(response.ok, true, route + ": " + response.status);
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return response.json();
  };
  try {
    assert.equal((await fetch(app.origin + "/agesci-canicattini1/area-riservata/")).status, 200);
    assert.equal((await fetch(app.origin + "/agesci-canicattini1/api/activities")).status, 401);
    await request("auth/login", "POST", { code: "23816938", password: app.password });
    const data = await request("activities");
    assert.equal(data.members.length, 82);
    assert.equal(data.events.length, 6);
    assert.equal(data.paths.length, 65);
    assert.ok(data.events.every(event => event.title.startsWith("DEMO -")));
    const meeting = data.events.find(event => event.branch === "L/C" && event.kind === "riunione");
    assert.equal(meeting.tournament.members.length, 30);
    assert.equal(meeting.tournament.members[0].eye, null);
    assert.equal(meeting.tournament.presentations.length, 6);
    assert.deepEqual(meeting.totals, { expected: 30000, paid: 2700, remaining: 27500, excess: 200 });
    assert.equal(meeting.program[0].materials[0].quantity, 6);
    assert.ok(data.events.some(event => event.endDate > event.date && event.program.some(moment => moment.date === event.endDate)));
    for (const [index, branch, expectedMembers] of [["L/C", 30], ["E/G", 35], ["R/S", 17]].map(([branch, count], index) =>
      [index, branch, count])) {
      await request("auth/login", "POST", { code: String(7654321 + index), password: app.password });
      const scoped = await request("activities");
      assert.deepEqual(scoped.branches, [branch]);
      assert.equal(scoped.members.length, expectedMembers);
      if (branch === "L/C") {
        const counts = Object.groupBy(scoped.members, member => member.unit);
        assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([unit, members]) => [unit, members.length])),
          { Bianchi: 5, Neri: 5, Rossi: 5, Grigi: 5, Bruni: 5, Fulvi: 5 });
      } else if (branch === "E/G") {
        const counts = Object.groupBy(scoped.members, member => member.unit);
        assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([unit, members]) => [unit, members.length])),
          { Aquile: 7, Lupi: 7, Aironi: 7, Volpi: 7, Leoni: 7 });
      }
      assert.equal(scoped.events.length, 2);
      assert.ok(scoped.events.every(event => event.branch === branch));
      const event = scoped.events.find(event => event.kind === "riunione");
      await request("activities/events/" + event.id, "PATCH", {
        ...event, attendance: event.attendance.map((person, number) =>
          number === 2 ? { ...person, paidCents: 1000 } : person),
      });
      const updated = (await request("activities")).events.find(item => item.id === event.id);
      assert.equal(updated.attendance[2].paidCents, 1000);
      assert.equal(updated.revision, event.revision + 1);
    }
  } finally {
    await app.stop();
  }
});
