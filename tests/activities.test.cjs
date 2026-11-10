const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");
const { createNasServer } = require("../server/nas.cjs");

const password = "Activities-test-password1!";
async function start(dataDir) {
  const server = await createNasServer({ dataDir, password, censusCodes: "7654321",
    publicOrigin: "http://localhost", secureCookie: false });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let cookie = "";
  const request = async (route, method = "GET", data, expected = 200) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
      method, headers: { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const content = await response.text();
    assert.equal(response.status, expected, route + ": " + content);
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return expected < 300 ? JSON.parse(content) : content;
  };
  return { request, close: async () => { server.stop(); await once(server, "close"); } };
}

test("the quota is due by everyone regardless of attendance or legacy flags, without resetting payments", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agesci-fees-"));
  const app = await start(directory);
  try {
    const r = (...args) => app.request(...args);
    await r("auth/login", "POST", { code: "23816938", password });
    const attendance = [];
    for (const [index, status] of ["presente", "assente", "giustificato", ""].entries()) {
      const { member } = await r("members", "POST", { code: "91000" + index, branch: "L/C",
        profile: { givenName: "Socio", surname: "Quota " + index } }, 201);
      attendance.push({ personId: member.id, status, due: false, paidCents: [500, 1500, 0, 100][index] });
    }
    let event = await r("activities/events", "POST", { branch: "L/C", kind: "riunione",
      title: "Quota per tutti", date: "2026-11-10", feeCents: 1000, attendance, tasks: [] });
    assert.ok(event.attendance.every(person => person.due));
    assert.deepEqual(event.totals, { expected: 4000, paid: 2100, remaining: 2400, excess: 500 });
    const absent = (await r("activities/members/" + attendance[1].personId)).events[0];
    assert.equal(absent.status, "assente");
    assert.equal(absent.due, true);
    assert.equal(absent.paidCents, 1500);
    event = await r("activities/events/" + event.id, "PATCH", { ...event, feeCents: 0 });
    assert.ok(event.attendance.every(person => !person.due));
    assert.deepEqual(event.totals, { expected: 0, paid: 2100, remaining: 0, excess: 2100 });
    event = await r("activities/events/" + event.id, "PATCH", { ...event, feeCents: 2000,
      attendance: event.attendance.map(person => ({ ...person, due: false, status: "" })) });
    assert.deepEqual(event.attendance.map(person => person.paidCents), [500, 1500, 0, 100]);
    assert.deepEqual(event.totals, { expected: 8000, paid: 2100, remaining: 5900, excess: 0 });
    assert.deepEqual((await r("activities")).events.find(item => item.id === event.id).totals, event.totals);
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("branch activities persist dates, attendance and tasks; scoped paths enforce prey completion and revisions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agesci-activities-"));
  let app = await start(directory);
  try {
    const r = (...args) => app.request(...args);
    await r("activities", "GET", undefined, 401);
    await r("auth/login", "POST", { code: "23816938", password });
    const ids = {};
    for (const [index, branch] of ["L/C", "E/G", "R/S"].entries()) {
      await r("members", "POST", { code: "12345" + index, branch,
        profile: { givenName: "Socio", surname: branch } }, 201);
      ids[branch] = (await r("members")).members.find(member => member.branch === branch).id;
    }
    const chief = (await r("people")).people.find(person => person.code === "7654321");
    await r("people/" + chief.id, "PATCH", { serviceBranch: "L/C" });
    const item = (branch, kind) => ({ branch, kind, title: "Incontro di prova", date: "2026-11-15",
      attendance: [{ personId: ids[branch], status: "" }], tasks: [{ title: "Preparare il materiale", done: false }] });
    const events = [];
    for (const [branch, kind] of [["L/C", "caccia"], ["E/G", "uscita"], ["R/S", "route"]])
      events.push(await r("activities/events", "POST", item(branch, kind)));
    await r("activities/events", "POST", item("L/C", "route"), 400);
    await r("activities/events", "POST", { ...item("E/G", "riunione"), date: "2026-02-30" }, 400);
    await r("activities/events", "POST", { ...item("E/G", "riunione"), attendance: [{ personId: ids["L/C"], status: "presente" }] }, 400);
    await r("activities/events", "POST", { ...item("E/G", "riunione"), attendance: [
      { personId: ids["E/G"], status: "presente" }, { personId: ids["E/G"], status: "assente" },
    ] }, 400);
    let event = await r("activities/events/" + events[0].id, "PATCH", {
      ...events[0], attendance: [{ personId: ids["L/C"], status: "presente" }], tasks: [{ title: "Preparare il materiale", done: true }],
    });

    test("multi-day events preserve a day-by-day program, preparation lists and LC tournament snapshots", async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agesci-camp-"));
      const app = await start(directory);
      try {
        const r = (...args) => app.request(...args);
        await r("auth/login", "POST", { code: "23816938", password });
        const members = [];
        for (let index = 0; index < 11; index++) {
          const unit = index < 7 ? "Bianchi" : "Rossi";
          const result = await r("members", "POST", { code: "5900" + String(index).padStart(2, "0"), branch: "L/C",
            profile: { givenName: "Ragazzo " + String(index).padStart(2, "0"), surname: unit },
            values: { sestiglia: unit } }, 201);
          members.push(result.member);
        }
        let data = await r("activities");
        const roster = data.members.filter(person => person.branch === "L/C");
        assert.equal(roster.filter(person => person.unit === "Bianchi").length, 7);
        assert.equal(roster.filter(person => person.unit === "Rossi").length, 4);

        let camp = await r("activities/events", "POST", {
          branch: "E/G", kind: "uscita", title: "Campo invernale", date: "2027-01-02", endDate: "2027-01-05",
          feeCents: 2500, attendance: [], tasks: [{ title: "Ritirare le chiavi", done: false }],
          program: [
            { date: "2027-01-02", time: "08:00", title: "Lancio", place: "Sede scout", description: "Cerchio e lancio del campo", materials: "Cartellone e pennarelli" },
            { date: "2027-01-02", time: "10:00", title: "Spostamento", place: "Fermata del pullman", description: "Partenza verso la base",
              materials: [{ title: "Cerchi", quantity: 6, unit: "pezzi" }], materialNote: "Da riportare" },
          ],
          materials: [
            { title: "Kit pronto soccorso", done: false, reused: true, shopping: false, quantity: 1, unit: "kit" },
            { title: "Nastro", done: false, reused: true, shopping: false, quantity: null, unit: "rotolo" },
          ],
          shopping: [{ title: "Pasta", quantity: "4 kg", done: false }],
        });
        assert.equal(camp.endDate, "2027-01-05");
        assert.equal(camp.program[0].time, "08:00");
        assert.equal(camp.program[1].place, "Fermata del pullman");
        assert.deepEqual(camp.program[1].materials, [{ title: "Cerchi", quantity: 6, unit: "pezzi" }]);
        assert.equal(camp.program[1].materialNote, "Da riportare");
        assert.equal(camp.materials[0].done, false);
        assert.equal(camp.materials[0].quantity, 1);
        assert.equal(camp.materials[0].reused, true);
        assert.equal(camp.materials[1].quantity, null);
        assert.equal(camp.shopping[0].quantity, "4 kg");
        camp = await r("activities/events/" + camp.id, "PATCH", { ...camp, revision: camp.revision,
          title: "Campo invernale EG" });
        assert.equal(camp.endDate, "2027-01-05");
        assert.equal(camp.program.length, 2);
        assert.equal(camp.shopping[0].title, "Pasta");
        await r("activities/events", "POST", {
          branch: "E/G", kind: "uscita", title: "Date invertite", date: "2027-01-05", endDate: "2027-01-02",
          attendance: [], tasks: [], program: [],
        }, 400);
        await r("activities/events", "POST", {
          branch: "E/G", kind: "uscita", title: "Programma fuori date", date: "2027-01-02", endDate: "2027-01-05",
          attendance: [], tasks: [], program: [{ date: "2027-01-06", title: "Ritorno", time: "18:00" }],
        }, 400);
        await r("activities/events", "POST", {
          branch: "E/G", kind: "uscita", title: "Orario errato", date: "2027-01-02",
          attendance: [], tasks: [], program: [{ date: "2027-01-02", title: "Lancio", time: "25:90" }],
        }, 400);
        await r("activities/events", "POST", {
          branch: "E/G", kind: "uscita", title: "Torneo non consentito", date: "2027-01-02",
          attendance: [], tasks: [], tournament: { members: [], presentations: [] },
        }, 400);

        const active = { Bianchi: 0, Rossi: 0 };
        const attendance = roster.map(person => {
          const count = active[person.unit] || 0;
          const present = count < (person.unit === "Bianchi" ? 5 : 2);
          if (present) active[person.unit]++;
          return { personId: person.id, status: present ? "presente" : "assente", due: false, paidCents: 0 };
        });
        const tournament = {
          members: roster.map(person => {
            const present = attendance.find(item => item.personId === person.id).status === "presente";
            return { personId: person.id, unit: person.unit,
              punctuality: present, loyalty: present ? 5 : null, balooRules: present ? 5 : null,
              huntNotebook: present ? 5 : null, style: present ? 5 : null, eye: present ? 5 : null };
          }),
          presentations: [{ unit: "Bianchi", score: 5 }, { unit: "Rossi", score: 5 }],
        };
        const meeting = await r("activities/events", "POST", { branch: "L/C", kind: "riunione",
          title: "Riunione e torneo", date: "2026-11-14", endDate: "2026-11-14",
          attendance, tasks: [], tournament });
        data = await r("activities");
        const { standings } = require("../assets/js/tournament-model.js");
        const results = standings(meeting.tournament.members, meeting.attendance, meeting.tournament.presentations);
        const bianchi = results.find(item => item.unit === "Bianchi");
        assert.equal(bianchi.members, 7);
        assert.equal(bianchi.present, 5);
        assert.equal(bianchi.values.presence, 5 / 7 * 100);
        assert.equal(bianchi.values.punctuality, 100);
        assert.equal(data.events.find(item => item.id === meeting.id).tournament.members[0].unit, "Bianchi");
        await r("activities/events/" + meeting.id, "PATCH", {
          ...meeting, tournament: { ...tournament, members: tournament.members.map((person, index) =>
            index ? person : { ...person, unit: "Rossi" }) },
        }, 400);
        await r("activities/events/" + meeting.id, "PATCH", {
          ...meeting, tournament: { ...tournament, members: tournament.members.slice(1) },
        }, 400);
      } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
    });
    assert.equal(event.attendance[0].status, "presente");
    assert.equal(event.attendance[0].name, "Socio L/C");
    assert.equal(event.tasks[0].done, true);
    await r("activities/events/" + event.id, "PATCH", events[0], 409);
    event = await r("activities/events/" + event.id, "PATCH", { ...event, feeCents: 1025,
      attendance: [{ personId: ids["L/C"], status: "presente", due: true, paidCents: 500 }] });
    assert.deepEqual(event.totals, { expected: 1025, paid: 500, remaining: 525, excess: 0 });
    for (const invalid of [-1, 0.1, "100", 100000001, null]) {
      await r("activities/events/" + event.id, "PATCH", { ...event, feeCents: invalid }, 400);
      await r("activities/events/" + event.id, "PATCH", { ...event,
        attendance: [{ ...event.attendance[0], paidCents: invalid }] }, 400);
    }
    await r("activities/events/" + event.id, "PATCH", { ...event,
      attendance: [{ ...event.attendance[0], due: "true" }] }, 400);
    await r("activities/events/" + event.id, "PATCH", { ...event, attendance: [] }, 400);
    // Older clients must not erase saved payments when editing attendance.
    const { feeCents, ...legacy } = event;
    event = await r("activities/events/" + event.id, "PATCH", { ...legacy,
      attendance: [{ personId: ids["L/C"], status: "assente" }] });
    assert.equal(event.feeCents, 1025);
    assert.equal(event.attendance[0].paidCents, 500);
    assert.equal(event.attendance[0].due, true);
    let history = await r("activities/members/" + ids["L/C"]);
    assert.equal(history.events.length, 1);
    assert.equal(history.events[0].status, "assente");
    assert.equal(history.events[0].paidCents, 500);
    assert.equal(Object.hasOwn(history.events[0], "attendance"), false, "member history must not expose other participants");
    event = await r("activities/events/" + event.id, "PATCH", { ...event,
      attendance: [{ ...event.attendance[0], status: "presente", paidCents: 1500 }] });
    assert.deepEqual(event.totals, { expected: 1025, paid: 1500, remaining: 0, excess: 475 });
    history = await r("activities/members/" + ids["L/C"]);
    assert.equal(history.events[0].status, "presente");
    await r("activities/members/999999", "GET", undefined, 404);

    const pathValue = { branch: "L/C", kind: "hunt", personId: ids["L/C"],
      title: "Stagione di caccia", steps: [], closed: false };
    await r("activities/paths", "POST", { ...pathValue, kind: "specialty" }, 409);
    await r("activities/paths", "POST", { ...pathValue, closed: true }, 400);
    let hunt = await r("activities/paths", "POST", pathValue);
    await r("activities/paths", "POST", pathValue, 409);
    hunt = await r("activities/paths/" + hunt.id, "PATCH", {
      ...hunt, steps: [{ title: "Prima preda", done: true }, { title: "Seconda preda", done: false }],
    });
    await r("activities/paths/" + hunt.id, "PATCH", { ...hunt, closed: true }, 400);
    hunt = await r("activities/paths/" + hunt.id, "PATCH", { ...hunt, steps: hunt.steps.map(step => ({ ...step, done: true })) });
    assert.equal(hunt.closed, false, "all prey completed still needs explicit closure");
    await r("activities/paths", "POST", { ...pathValue, kind: "specialty" }, 409);
    hunt = await r("activities/paths/" + hunt.id, "PATCH", { ...hunt, closed: true });
    await r("activities/paths/" + hunt.id, "PATCH", { ...hunt, steps: [{ title: "Preda incompleta", done: false }] }, 400);
    const specialty = await r("activities/paths", "POST", { ...pathValue, kind: "specialty", title: "Amico della natura" });
    const nextHunt = await r("activities/paths", "POST", pathValue);
    await r("activities/paths/" + hunt.id, "PATCH", { ...hunt, closed: false }, 409);
    let badge = await r("activities/paths", "POST", { ...pathValue, branch: "E/G", personId: ids["E/G"], kind: "badge", title: "Animazione" });
    badge = await r("activities/paths/" + badge.id, "PATCH", { ...badge,
      steps: [{ title: "Concordare il progetto", done: true }] });
    await r("activities/paths/" + badge.id, "PATCH", { ...badge, personId: ids["L/C"] }, 400);
    await r("activities/paths", "POST", { ...pathValue, kind: "badge" }, 400);
    await r("activities/paths", "POST", { ...pathValue, branch: "R/S", personId: ids["R/S"], kind: "specialty" }, 400);
    await r("activities/paths/" + specialty.id, "PATCH", { ...specialty, revision: 0 }, 409);

    await r("auth/view-as", "POST", { personId: chief.id });
    const scoped = await r("activities");
    assert.deepEqual(scoped.branches, ["L/C"]);
    assert.ok(scoped.members.every(member => member.branch === "L/C"));
    assert.ok(scoped.events.every(item => item.branch === "L/C"));
    assert.ok(scoped.paths.every(item => item.branch === "L/C"));
    assert.equal((await r("activities/members/" + ids["L/C"])).events[0].paidCents, 1500);
    assert.equal(scoped.events[0].totals.paid, 1500);
    await r("activities/members/" + ids["E/G"], "GET", undefined, 403);
    await r("activities/events", "POST", item("E/G", "riunione"), 403);
    await r("activities/events/" + badge.id, "PATCH", badge, 404);
    await r("activities/paths/" + badge.id, "PATCH", badge, 403);
    await r("auth/view-as", "DELETE");
    await r("people/" + chief.id, "PATCH", { serviceBranch: "" });
    await r("auth/login", "POST", { code: "7654321", password, confirmation: password });
    await r("activities", "GET", undefined, 403);
    await app.close();
    app = await start(directory);
    await r("auth/login", "POST", { code: "23816938", password });
    const restored = await r("activities");
    assert.equal(restored.events.length, 3);
    assert.equal(restored.events.find(item => item.id === event.id).tasks[0].done, true);
    assert.deepEqual(restored.events.find(item => item.id === event.id).totals,
      { expected: 1025, paid: 1500, remaining: 0, excess: 475 });
    assert.equal((await r("activities/members/" + ids["L/C"])).events[0].paidCents, 1500);
    assert.equal(restored.paths.find(item => item.id === hunt.id).closed, true);
    assert.equal(restored.paths.find(item => item.id === nextHunt.id).closed, false);
    const member = (await r("members")).members.find(member => member.id === ids["L/C"]);
    await r("members/macro", "POST", { action: "passage", members: [{ id: member.id, revision: member.revision }] });
    const transfer = (await r("members")).transfers.find(transfer => transfer.personId === member.id);
    await r("members/transfers/" + transfer.id, "PATCH", { action: "confirm", revision: transfer.revision });
    assert.equal((await r("activities/members/" + member.id)).events[0].paidCents, 1500);
    await r("people/" + chief.id, "PATCH", { serviceBranch: "E/G" });
    await r("auth/view-as", "POST", { personId: chief.id });
    assert.deepEqual((await r("activities/members/" + member.id)).events, [],
      "the new branch must not receive the previous branch's financial history");
    await r("auth/view-as", "DELETE");
    await r("people/" + chief.id, "PATCH", { serviceBranch: "L/C" });
    await r("auth/view-as", "POST", { personId: chief.id });
    await r("activities/members/" + member.id, "GET", undefined, 403);
    event = await r("activities/events/" + event.id, "PATCH", { ...event, title: "Attivita storica" });
    assert.equal(event.attendance[0].paidCents, 1500, "past participants keep their payments after transfer");
  } finally { await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
