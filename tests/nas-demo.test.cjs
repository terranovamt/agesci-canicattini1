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
    assert.equal((await fetch(app.origin + "/agesci-canicattini1/area-riservata/canzoniere.html")).status, 200);
    assert.equal((await fetch(app.origin + "/agesci-canicattini1/canzoniere/")).status, 200);
    assert.equal((await fetch(app.origin + "/agesci-canicattini1/api/activities")).status, 401);
    await request("auth/login", "POST", { code: "23816938", password: app.password });
    const songs = await request("canzoniere/songs");
    assert.equal(songs.total, 2);
    assert.deepEqual(songs.songs.map(song => song.slug), ["il-ponte-di-carta-demo", "la-lanterna-demo"]);
    assert.ok((await request("canzoniere/songs/la-lanterna-demo")).text.includes("[G]"));
    const playlists = await request("canzoniere/playlists");
    assert.deepEqual(playlists.map(playlist => playlist.slug), ["passeggiata-demo"]);
    const data = await request("activities");
    assert.equal(data.members.length, 82);
    assert.ok(data.events.length >= 150, "a full year of meetings and outings across three branches");
    assert.equal(data.paths.length, 115);
    assert.equal(new Set(data.members.map(member => member.name)).size, 82);
    assert.ok(data.members.every(member => !/Socio \d|Demo/.test(member.name)));
    const profiles = (await request("members")).members.filter(member => member.kind === "ragazzo");
    assert.equal(profiles.length, 82);
    assert.ok(profiles.every(member => member.profile.birthDate && member.profile.town &&
      member.profile.email.endsWith("@example.test")));
    const today = require("../assets/js/activities-model.js").clock().date;
    const historical = data.events.filter(event => event.date < today);
    assert.ok(historical.some(event => new Date(today) - new Date(event.date) >= 350 * 86400000),
      "history goes back nearly a year");
    assert.ok(historical.every(event => event.endDate <= today &&
      event.attendance.every(person => person.status)));
    assert.ok(historical.every(event => event.program.every(moment => moment.time < moment.endTime)));
    assert.ok(historical.some(event => event.totals.remaining > 0 && event.totals.excess > 0),
      "older outings include debts, partial payments and excess payments");
    assert.ok(data.paths.some(path => path.kind === "hunt" && path.closed));
    assert.ok(data.paths.some(path => path.kind === "badge"));
    assert.ok(data.paths.some(path => path.steps.every(step => step.done)));
    assert.ok(data.paths.some(path => path.steps.every(step => !step.done)));
    const meeting = data.events.find(event => event.branch === "L/C" && event.kind === "riunione");
    assert.equal(meeting.tournament.members.length, 30);
    assert.equal(meeting.tournament.members[0].eye, null);
    for (const event of data.events.filter(event => event.tournament)) {
      for (const person of event.tournament.members) {
        if (event.attendance.find(entry => entry.personId === person.personId).status !== "presente")
          for (const key of ["punctuality", "loyalty", "balooRules", "huntNotebook", "style", "behavior"])
            assert.equal(person[key], null, "absent or unrecorded members have no tournament evaluation");
      }
    }
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
      assert.ok(scoped.events.length >= 50);
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
