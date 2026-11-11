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
  const dateAgo = days => new Date(new Date(today + "T12:00:00Z").getTime() - days * 86400000)
    .toISOString().slice(0, 10);
  const names = [
    "Alessandro", "Giulia", "Lorenzo", "Sofia", "Matteo", "Aurora", "Leonardo", "Alice",
    "Francesco", "Ginevra", "Andrea", "Emma", "Riccardo", "Giorgia", "Tommaso", "Beatrice",
    "Gabriele", "Vittoria", "Davide", "Chiara", "Edoardo", "Martina", "Samuele", "Anna",
    "Filippo", "Elisa", "Pietro", "Sara", "Nicolo", "Camilla", "Simone", "Greta",
    "Antonio", "Rebecca", "Federico", "Viola", "Giovanni", "Marta", "Emanuele", "Noemi", "Marco",
  ];
  const surnames = [
    "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci",
    "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa",
    "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro",
    "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "Longo",
  ];
  const meetingTitles = {
    "L/C": ["Il consiglio della rupe", "Le tracce di Mowgli", "Giochi di lealta", "Le mani abili",
      "Le regole di Baloo", "La pista nel bosco", "Il quaderno di caccia", "Una buona azione insieme"],
    "E/G": ["Nodi e legature", "Orientamento con la bussola", "Cucina di squadriglia", "Pronto soccorso",
      "Costruzioni da campo", "Segnalazione e messaggi", "Impresa di squadriglia", "Consiglio della legge"],
    "R/S": ["Capitolo sul servizio", "Prepariamo la route", "La carta di clan", "Il punto della strada",
      "Veglia rover", "Scelte e responsabilita", "Laboratorio di cittadinanza", "Verifica del servizio"],
  };
  const places = { "L/C": "Sede del branco", "E/G": "Sede del reparto", "R/S": "Sede del clan" };
  const tournament = (members, units, attendance, seed) => ({
    members: members.map((member, number) => {
      const present = attendance[number].status === "presente";
      const score = offset => present && (number + seed + offset) % 13 !== 0
        ? 2 + (number + seed + offset) % 4 : null;
      return { personId: member.id, unit: member.unit,
        punctuality: present ? (number + seed) % 7 !== 0 : null,
        loyalty: score(0), balooRules: score(1), huntNotebook: score(2),
        style: score(3), behavior: score(4) };
    }),
    presentations: units.map((unit, number) => ({ unit, score: 2 + (number + seed) % 4 })),
  });
  try {
    await request("auth/login", "POST", { code: "23816938", password: app.password });
    const { people } = await request("people");
    for (const [index, branch] of ["L/C", "E/G", "R/S"].entries()) {
      const code = String(7654321 + index);
      const chief = people.find(person => person.code === code);
      await request("people/" + chief.id, "PATCH", { serviceBranch: branch });
      const units = branch === "L/C" ? ["Bianchi", "Neri", "Rossi", "Grigi", "Bruni", "Fulvi"] :
        branch === "E/G" ? ["Aquile", "Lupi", "Aironi", "Volpi", "Leoni"] : [];
      const memberCount = branch === "L/C" ? 30 : branch === "E/G" ? 35 : 17;
      const members = [];
      for (let number = 0; number < memberCount; number++) {
        const unit = units.length ? units[Math.floor(number / (memberCount / units.length))] : "";
        const identity = (index === 0 ? 0 : index === 1 ? 30 : 65) + number;
        const position = number % (branch === "L/C" ? 5 : 7);
        const year = position === 0 ? 3 : position === 1 ? 2 : number % 3;
        const givenName = names[identity % names.length];
        const surname = surnames[(identity * 7 + Math.floor(identity / names.length)) % surnames.length];
        const age = (branch === "L/C" ? 8 : branch === "E/G" ? 12 : 17) + year;
        const values = branch === "L/C" ? {
          sestiglia: unit, ruolo: position === 0 ? "Capo sestiglia" : position === 1 ? "Vice capo sestiglia" :
            year === 0 ? "Cucciolo" : "Sestigliere",
          anno: ["Primo anno", "Secondo anno", "Terzo anno"][Math.min(year, 2)],
          progressione: ["Lupo della legge", "Lupo della rupe", "Lupo anziano"][Math.min(year, 2)],
          specialita: number % 4 === 0 ? ["Kim"] : [], promessa: year ? dateAgo(290) : "",
        } : branch === "E/G" ? {
          squadriglia: unit, ruolo: position === 0 ? "Capo squadriglia" : position === 1 ? "Vice capo squadriglia" :
            year === 0 ? "Piede tenero" : "Squadrigliere",
          anno: ["Primo anno", "Secondo anno", "Terzo anno", "Quarto anno"][year],
          tappa: ["Tappa della scoperta", "Tappa della competenza", "Tappa della responsabilita"][Math.min(year, 2)],
          specialita: number % 4 === 0 ? ["Cuoco"] : [],
          brevetti: number % 7 < 2 && number % 4 === 0 ? ["Pioniere"] : [], promessa: year ? dateAgo(290) : "",
        } : {
          comunita: number < 5 ? "Noviziato" : "Clan",
          passi: ["Passi della scoperta", "Passi della competenza", "Passi della responsabilita"][number % 3],
          servizio: ["Doposcuola", "Banco alimentare", "Animazione in parrocchia"][number % 3],
          "punto-strada": "Verifica personale dopo la route: un impegno concreto nel servizio.",
        };
        const { member } = await request("members", "POST", {
          code: String(9000000 + index * 100 + number), branch,
          profile: {
            givenName, surname, sex: identity % 2 ? "F" : "M",
            birthDate: `${Number(part("year")) - age}-${String(number % 12 + 1).padStart(2, "0")}-${String(number % 25 + 1).padStart(2, "0")}`,
            birthTown: "Siracusa", nationality: "Italiana", town: "Canicattini Bagni",
            province: "SR", postalCode: "96010",
            address: "Via della Quercia (indirizzo inventato)", streetNumber: String(number + 1),
            email: `socio${identity + 1}@example.test`,
            ...(branch !== "R/S" ? { guardianContacts: [{
              givenName: number % 2 ? "Paola" : "Roberto", surname,
              email: `famiglia${identity + 1}@example.test`,
            }] } : {}),
          },
          values,
        });
        members.push({ id: member.id, unit });
      }
      // Tutti i dati passano dalle API del server locale, mai dal database NAS.
      for (let week = 52; week >= 1; week--) {
        const date = dateAgo(week * 7 + (new Date(today + "T12:00:00Z").getUTCDay() + 1) % 7 - 7);
        const month = Number(date.slice(5, 7));
        if (date >= today || date < dateAgo(365) || month === 7 || month === 8) continue;
        const title = meetingTitles[branch][week % meetingTitles[branch].length];
        const attendance = members.map((member, number) => ({
          personId: member.id,
          status: (number + week) % 11 === 0 ? "assente" : (number + week) % 9 === 0 ? "giustificato" : "presente",
          paidCents: 0,
        }));
        await request("activities/events", "POST", {
          branch, kind: "riunione", title, date, feeCents: 0, attendance,
          tasks: [{ title: "Aprire la sede e preparare il materiale", done: true },
            { title: "Riordinare dopo la riunione", done: true }],
          program: [
            { date, time: "15:30", endTime: "15:45", title: "Accoglienza e cerchio", place: places[branch],
              description: "Saluto iniziale, presenze e lancio del pomeriggio.", materials: [] },
            { date, time: "15:45", endTime: "17:15", title, place: places[branch],
              description: branch === "L/C" ? "Lancio del racconto, gioco per sestiglie e lavoro sulle prede." :
                branch === "E/G" ? "Lavoro di squadriglia e prova pratica delle tecniche." :
                  "Confronto in comunita e preparazione del servizio.",
              materials: [{ title: "Corde", quantity: 6, unit: "pezzi" },
                { title: "Cartelloni", quantity: 3, unit: "fogli" }] },
            { date, time: "17:15", endTime: "17:30", title: "Verifica e saluti", place: places[branch],
              description: "Ogni gruppo racconta cosa ha imparato.", materials: [] },
          ],
          materials: [{ title: "Corde", done: true, reused: true },
            { title: "Cartelloni", done: true, reused: false }],
          ...(branch === "L/C" ? { tournament: tournament(members, units, attendance, week) } : {}),
        });
      }
      for (let month = 12; month >= 1; month--) {
        const date = dateAgo(month * 30);
        const calendarMonth = Number(date.slice(5, 7));
        const camp = [1, 7, 8, 12].includes(calendarMonth);
        const duration = camp ? calendarMonth === 7 || calendarMonth === 8 ? 6 : 2 : 0;
        const endDate = dateAgo(month * 30 - duration);
        const feeCents = camp ? duration === 6 ? 15000 : 4500 : 1200;
        const attendance = members.map((member, number) => {
          const status = (number + month) % 10 === 0 ? "assente" : "presente";
          return { personId: member.id, status,
            paidCents: status === "assente" ? 0 : (number + month) % 17 === 0 ? feeCents / 2 :
              (number + month) % 19 === 0 ? feeCents + 500 : feeCents };
        });
        const program = [];
        for (let day = 0; day <= duration; day++) {
          const momentDate = dateAgo(month * 30 - day);
          program.push(
            { date: momentDate, time: "08:30", endTime: "09:00", title: day ? "Colazione e cerchio" : "Ritrovo e partenza",
              place: camp ? "Base scout del bosco" : "Parco comunale",
              description: "Controllo del materiale e presentazione del programma.",
              materials: [{ title: "Quaderni", quantity: memberCount, unit: "pezzi" }] },
            { date: momentDate, time: "09:00", endTime: "12:00",
              title: branch === "L/C" ? "Grande gioco nella giungla" : branch === "E/G" ? "Hike e orientamento" : "Strada e servizio",
              place: camp ? "Base scout del bosco" : "Parco comunale",
              description: "Percorso a gruppi con prove pratiche e verifica finale.",
              materials: [{ title: "Corde", quantity: 8, unit: "pezzi" }] },
            { date: momentDate, time: "12:00", endTime: "14:00", title: "Pranzo e riordino",
              place: camp ? "Base scout del bosco" : "Parco comunale",
              materials: [{ title: "Pasta", quantity: 5, unit: "kg" }] },
            { date: momentDate, time: "14:00", endTime: "16:30", title: day === duration ? "Verifica e rientro" : "Laboratori e imprese",
              place: camp ? "Base scout del bosco" : "Parco comunale", materials: [] });
        }
        await request("activities/events", "POST", {
          branch, kind: branch === "L/C" ? "caccia" : branch === "E/G" ? "uscita" : "route",
          title: camp ? (branch === "R/S" ? "Route" : "Campo") +
            ([7, 8].includes(calendarMonth) ? " estivo" : " invernale") :
            ["Uscita nella natura", "Giornata del ricordo", "Servizio al parco"][month % 3],
          date, endDate, feeCents, attendance, program,
          tasks: [{ title: "Confermare la base e il trasporto", done: true },
            { title: "Raccogliere le adesioni", done: true }, { title: "Verifica con i capi", done: month > 1 }],
          materials: [{ title: "Corde", done: true, reused: true },
            { title: "Pasta", done: true, reused: false, shopping: true }],
        });
      }
      const attendance = members.map((member, number) => ({
        personId: member.id, status: number < 4 ? "presente" : number === 4 ? "assente" : "",
        paidCents: number === 0 ? 1000 : number === 1 ? 500 : number === 3 ? 1200 : 0,
      }));
      const event = {
        branch, kind: "riunione", title: "Riunione di oggi - " + meetingTitles[branch][0],
        date: today, feeCents: 1000, attendance,
        tasks: [{ title: "Ritirare le chiavi della sede", done: false }],
        program: [
          { date: today, time: "15:30", endTime: "15:45", title: "Accoglienza", place: places[branch],
            materials: [{ title: "Cerchi", quantity: 6, unit: "pezzi" }] },
          { date: today, time: "15:45", endTime: "17:00", title: "Gioco a squadre", place: places[branch],
            description: "Dividere i ragazzi in squadre e spiegare il gioco.",
            materials: [{ title: "Cerchi", quantity: 4, unit: "pezzi" },
              { title: "Cartelloni", quantity: 2, unit: "fogli" }] },
          { date: today, time: "17:00", endTime: "17:30", title: "Cerchio e verifica", place: places[branch],
            materials: "Nota di esempio: portare il quaderno." },
        ],
        materials: [
          { title: "Cerchi", done: false, reused: true, shopping: false },
          { title: "Cartelloni", done: false, reused: false, shopping: true },
        ],
      };
      if (branch === "L/C") event.tournament = tournament(members, units, attendance, 0);
      await request("activities/events", "POST", event);
      await request("activities/events", "POST", {
        ...event, kind: branch === "L/C" ? "caccia" : branch === "E/G" ? "uscita" : "route",
        title: "Fine settimana al bosco - " + branch, tournament: undefined,
        date: tomorrow, endDate: new Date(followingDay.getTime() + 86400000).toISOString().slice(0, 10),
        attendance: members.map(member => ({ personId: member.id, status: "" })),
        program: event.program.map(moment => ({ ...moment, date: tomorrow })).concat({
          date: new Date(followingDay.getTime() + 86400000).toISOString().slice(0, 10),
          time: "09:00", endTime: "12:00", title: "Esplorazione", place: "Bosco",
        }),
      });
      if (branch !== "R/S") for (const [number, member] of members.entries()) {
        const specialtyTitle = branch === "L/C" ? "Kim" : "Cuoco";
        const completed = number % 4 === 0;
        await request("activities/paths", "POST", {
          branch, personId: member.id, kind: "specialty", title: specialtyTitle, closed: false,
          steps: [
            { title: branch === "L/C" ? "Riconoscere cinque oggetti al tatto" : "Preparare il menu di squadriglia", done: true },
            { title: branch === "L/C" ? "Preparare un gioco dei sensi" : "Cucinare sul fuoco in sicurezza", done: completed || number % 3 === 0 },
            { title: branch === "L/C" ? "Guidare la sestiglia nel gioco" : "Gestire la cambusa e il riordino", done: completed },
          ],
        });
        if (branch === "E/G" && number % 7 < 2) await request("activities/paths", "POST", {
          branch, personId: member.id, kind: "badge", title: "Pioniere", closed: false,
          steps: [{ title: "Progettare una costruzione da campo", done: true },
            { title: "Coordinare le legature della squadriglia", done: completed },
            { title: "Verificare sicurezza e tenuta", done: completed }],
        });
        if (branch === "L/C" && number % 3 === 0) await request("activities/paths", "POST", {
          branch, personId: member.id, kind: "hunt", title: "Caccia dell'anno precedente", closed: true,
          steps: [{ title: "Preparare lo zaino da solo", done: true },
            { title: "Aiutare un cucciolo nel grande gioco", done: true }],
        });
        if (branch !== "L/C") continue;
        await request("activities/paths", "POST", {
          branch, personId: member.id, kind: "hunt",
          title: "Stagione di caccia",
          closed: false,
          steps: [{ title: "Riconoscere tre alberi", done: number % 4 > 0 },
            { title: "Preparare un gioco nella natura", done: number % 4 > 1 },
            { title: "Raccontare una buona azione al consiglio", done: number % 4 === 3 }],
        });
      }
    }
    for (const code of ["7654321", "7654322", "7654323"]) {
      await request("auth/login", "POST", { code, password: app.password, confirmation: app.password, temporary: "Canicattini1" });
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
    console.log("Un anno di vita scout, 82 soci con identita inventate, attivita, quote, torneo e percorsi.");
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
