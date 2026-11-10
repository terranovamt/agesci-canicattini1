"use strict";

const { startNasDev } = require("./nas-dev.cjs");

async function startNasDemo() {
  const app = await startNasDev({
    basePath: "/agesci-canicattini1",
    censusCodes: "7654321,7654322,7654323",
  });
  let cookie = "";
  const request = async (route, method = "GET", data) => {
    const response = await fetch(app.origin + "/agesci-canicattini1/api/" + route, {
      method,
      headers: { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (!response.ok) throw new Error(route + ": " + response.status + " " + await response.text());
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return response.json();
  };
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = name => parts.find(item => item.type === name).value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const followingDay = new Date(today + "T12:00:00Z");
  followingDay.setUTCDate(followingDay.getUTCDate() + 1);
  const tomorrow = followingDay.toISOString().slice(0, 10);
  try {
    await request("auth/login", "POST", { code: "23816938", password: app.password });
    const { people } = await request("people");
    for (const [index, branch] of ["L/C", "E/G", "R/S"].entries()) {
      const code = String(7654321 + index);
      const chief = people.find(person => person.code === code);
      await request("people/" + chief.id, "PATCH", { serviceBranch: branch });
      const members = [];
      for (let number = 0; number < 6; number++) {
        const unit = branch === "L/C" ? (number < 3 ? "Bianchi" : "Rossi") :
          branch === "E/G" ? (number < 3 ? "Aironi" : "Aquile") : "";
        const { member } = await request("members", "POST", {
          code: String(9000000 + index * 100 + number), branch,
          profile: { givenName: "Socio " + (number + 1), surname: "Demo " + branch },
          values: branch === "L/C" ? { sestiglia: unit } : branch === "E/G" ? { squadriglia: unit } : {},
        });
        members.push({ id: member.id, unit });
      }
      const attendance = members.map((member, number) => ({
        personId: member.id, status: number < 4 ? "presente" : number === 4 ? "assente" : "",
        paidCents: [1000, 500, 0, 1200, 0, 0][number],
      }));
      const event = {
        branch, kind: "riunione", title: "DEMO - Riunione di oggi " + branch,
        date: today, feeCents: 1000, attendance,
        tasks: [{ title: "Ritirare le chiavi della sede", done: false }],
        program: [
          { date: today, time: "08:00", title: "Accoglienza", place: "Sede scout",
            materials: [{ title: "Cerchi", quantity: 6, unit: "pezzi" }] },
          { date: today, time: "10:00", title: "Gioco a squadre", place: "Cortile",
            description: "Dividere i ragazzi in squadre e spiegare il gioco.",
            materials: [{ title: "Cerchi", quantity: 4, unit: "pezzi" },
              { title: "Cartelloni", quantity: 2, unit: "fogli" }] },
          { date: today, time: "18:00", title: "Cerchio e verifica", place: "Sede scout",
            materials: "Nota di esempio: portare il quaderno." },
        ],
        materials: [
          { title: "Cerchi", done: false, reused: true, shopping: false },
          { title: "Cartelloni", done: false, reused: false, shopping: true },
        ],
      };
      if (branch === "L/C") event.tournament = {
        members: members.map((member, number) => ({
          personId: member.id, unit: member.unit,
          punctuality: number < 3 ? true : number === 3 ? false : null,
          loyalty: number < 4 ? 4 : null, balooRules: number < 4 ? 5 : null,
          huntNotebook: number < 4 ? 3 : null, style: number < 4 ? 4 : null, eye: null,
        })),
        presentations: [{ unit: "Bianchi", score: 5 }, { unit: "Rossi", score: 4 }],
      };
      await request("activities/events", "POST", event);
      await request("activities/events", "POST", {
        ...event, kind: branch === "L/C" ? "caccia" : branch === "E/G" ? "uscita" : "route",
        title: "DEMO - Campo di due giorni " + branch, tournament: undefined,
        date: tomorrow, endDate: new Date(followingDay.getTime() + 86400000).toISOString().slice(0, 10),
        attendance: members.map(member => ({ personId: member.id, status: "" })),
        program: event.program.map(moment => ({ ...moment, date: tomorrow })).concat({
          date: new Date(followingDay.getTime() + 86400000).toISOString().slice(0, 10),
          time: "09:00", title: "Esplorazione", place: "Bosco",
        }),
      });
      if (branch !== "R/S") await request("activities/paths", "POST", {
        branch, personId: members[0].id, kind: branch === "L/C" ? "hunt" : "specialty",
        title: branch === "L/C" ? "DEMO - Stagione di caccia" : "DEMO - Naturalista",
        closed: false,
        steps: [{ title: "Riconoscere tre alberi", done: true },
          { title: "Preparare un gioco nella natura", done: false }],
      });
    }
    for (const code of ["7654321", "7654322", "7654323"]) {
      await request("auth/login", "POST", { code, password: app.password, confirmation: app.password });
    }
    return app;
  } catch (error) {
    await app.stop();
    throw error;
  }
}

module.exports = { startNasDemo };
if (require.main === module) {
  startNasDemo().then(app => {
    console.log("DEMO locale: " + app.origin + "/agesci-canicattini1/area-riservata/");
    console.log("Codici: 23816938 amministratore | 7654321 L/C | 7654322 E/G | 7654323 R/S");
    console.log("Password per tutti gli account demo: " + app.password);
    console.log("Dati inventati in SQLite temporaneo. Alla chiusura vengono eliminati.");
    console.log("Nessuna connessione al NAS. Premi Ctrl+C per terminare.");
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      app.stop().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
      });
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
