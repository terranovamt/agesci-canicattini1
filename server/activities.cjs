"use strict";

const M = require("../assets/js/soci-model.js");
const AM = require("../assets/js/activities-model.js");
const TM = require("../assets/js/tournament-model.js");
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const branches = ["L/C", "E/G", "R/S"];
const kinds = { "L/C": ["riunione", "caccia"], "E/G": ["riunione", "uscita"], "R/S": ["riunione", "route"] };
const object = value => value && typeof value === "object" && !Array.isArray(value);
function text(value, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0"))
    fail(400, "Testo mancante o troppo lungo");
  return value.trim();
}
function steps(value) {
  if (!Array.isArray(value) || value.length > 100) fail(400, "Massimo 100 tappe o cose da fare");
  return value.map(item => {
    if (!object(item) || typeof item.done !== "boolean") fail(400, "Tappa non valida");
    return { title: text(item.title, 500), done: item.done };
  });
}
function amount(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > AM.maxCents)
    fail(400, "Importo non valido: usa centesimi interi positivi o zero");
  return value;
}
function optionalText(value, max = 1000) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > max || value.includes("\0")) fail(400, "Testo non valido");
  return value.trim();
}
function checklist(value, shopping = false) {
  if (!Array.isArray(value) || value.length > 200) fail(400, "Riepilogo materiali non valido");
  return value.map(item => {
    if (!object(item) || typeof item.done !== "boolean") fail(400, "Voce del riepilogo non valida");
    const result = { title: text(item.title, 500), done: item.done };
    if (typeof item.reused === "boolean") result.reused = item.reused;
    if (typeof item.shopping === "boolean") result.shopping = item.shopping;
    if (item.unit !== undefined) result.unit = optionalText(item.unit, 32);
    if (item.quantity !== undefined) {
      if (typeof item.quantity === "number") {
        if (!Number.isFinite(item.quantity) || item.quantity < 0 || item.quantity > 1000000)
          fail(400, "Quantità materiale non valida");
        result.quantity = item.quantity;
      } else if (item.quantity === null) result.quantity = null;
      else if (shopping) result.quantity = optionalText(item.quantity, 100);
      else fail(400, "Quantità materiale non valida");
    }
    return result;
  });
}
function tournament(value, eligible, attendance, existing) {
  if (!object(value) || !Array.isArray(value.members) || value.members.length > 1000 ||
      !Array.isArray(value.presentations) || value.presentations.length > 200)
    fail(400, "Punteggi del torneo non validi");
  const allowed = new Set(attendance.map(person => person.personId));
  const prior = new Map((existing?.members || []).map(person => [person.personId, person]));
  const seen = new Set();
  const members = value.members.map(item => {
    if (!object(item) || !Number.isSafeInteger(item.personId) || !allowed.has(item.personId) || seen.has(item.personId))
      fail(400, "Partecipante del torneo non valido o duplicato");
    seen.add(item.personId);
    const member = eligible.find(person => person.id === item.personId);
    const unit = prior.get(item.personId)?.unit ?? member?.unit ?? "";
    if (item.unit !== undefined && item.unit !== unit) fail(400, "Sestiglia del torneo non valida");
    const result = { personId: item.personId, unit };
    for (const key of ["punctuality", "loyalty", "balooRules", "huntNotebook", "style", "behavior", "eye"]) {
      const score = item[key] ?? null;
      if (key === "punctuality" ? score !== null && typeof score !== "boolean" :
          score !== null && (!Number.isInteger(score) || score < 0 || score > 5))
        fail(400, "Punteggio del torneo non valido");
      result[key] = score;
    }
    return result;
  });
  if (members.length !== attendance.length) fail(400, "Il torneo deve includere tutti i soci dell'attività");
  const units = new Set(members.map(person => person.unit || "Senza sestiglia"));
  const seenUnits = new Set();
  const presentations = value.presentations.map(item => {
    if (!object(item) || typeof item.unit !== "string" || item.unit.length > 80 ||
        !units.has(item.unit || "Senza sestiglia") || seenUnits.has(item.unit) ||
        item.score !== null && (!Number.isInteger(item.score) || item.score < 0 || item.score > 5))
      fail(400, "Punteggio di presentazione non valido");
    seenUnits.add(item.unit);
    return { unit: item.unit, score: item.score };
  });
  return { members, presentations };
}
function createActivities(db, people) {
  db.exec(`CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY, category TEXT NOT NULL, branch TEXT NOT NULL,
    data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
  )`);
  const record = row => {
    const data = JSON.parse(row.data);
    if (row.category === "events") {
      data.feeCents ??= 0;
      data.endDate ??= data.date;
      data.program ??= [];
      data.materials ??= [];
      data.shopping ??= [];
      data.attendance = data.attendance.map(person => ({
        ...person, due: data.feeCents > 0, paidCents: person.paidCents ?? 0,
      }));
      data.totals = AM.totals(data);
    }
    return { ...data, id: row.id, branch: row.branch, revision: row.revision };
  };
  const all = category => db.prepare("SELECT * FROM activities WHERE category=? ORDER BY id DESC").all(category).map(record);
  const roster = () => {
    const year = db.prepare("SELECT max(year) AS year FROM member_censuses").get().year || String(new Date().getFullYear());
    return db.prepare(`SELECT p.id,p.name,p.kind,m.branch,v.data AS valuesData FROM people p
      JOIN member_profiles m ON p.id=m.person_id
      LEFT JOIN member_values v ON v.person_id=p.id AND v.branch=m.branch
      WHERE p.kind='ragazzo' ORDER BY p.name,p.id`).all()
      .filter(person => !M.longSuspended({ censuses: db.prepare(
        "SELECT year,data FROM member_censuses WHERE person_id=? ORDER BY year DESC"
      ).all(person.id).map(row => ({ ...JSON.parse(row.data), year: row.year })) }, year))
      .map(person => {
        const values = JSON.parse(person.valuesData || "{}");
        return { id: person.id, name: person.name, kind: person.kind, branch: person.branch,
          unit: ["L/C", "E/G"].includes(person.branch) ? values[M.unitField(person.branch)] || "" : "",
          role: values.ruolo || "" };
      });
  };
  return {
    async handle(route, request, response, { body, send, sessionId }) {
      if (!/^\/api\/activities(?:\/|$)/.test(route)) return false;
      const user = () => {
        const current = people.user(sessionId(request));
        if (!current) fail(401, "Sessione scaduta: accedi di nuovo");
        if (!current.admin && !branches.includes(current.serviceBranch))
          fail(403, "Nessuna branca di servizio assegnata");
        return current;
      };
      const access = branch => {
        const current = user();
        if (!branches.includes(branch)) fail(400, "Branca non valida");
        if (!current.admin && branch !== current.serviceBranch) fail(403, "Attivita fuori dalla tua branca");
      };
      const current = user();
      const history = /^\/api\/activities\/members\/([1-9]\d*)$/.exec(route);
      if (history && request.method === "GET") {
        const personId = Number(history[1]);
        const member = db.prepare(`SELECT p.kind,m.branch FROM people p JOIN member_profiles m
          ON p.id=m.person_id WHERE p.id=?`).get(personId);
        if (!member || member.kind !== "ragazzo") fail(404, "Socio non trovato");
        if (!current.admin && member.branch !== current.serviceBranch) fail(403, "Socio fuori dalla tua branca");
        const events = all("events")
          .filter(event => current.admin || event.branch === current.serviceBranch)
          .flatMap(event => {
            const person = event.attendance.find(person => person.personId === personId);
            return person ? [{ id: event.id, title: event.title, kind: event.kind, date: event.date,
              branch: event.branch, status: person.status, feeCents: event.feeCents,
              due: person.due, paidCents: person.paidCents }] : [];
          }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        send(response, 200, { events });
        return true;
      }
      if (route === "/api/activities" && request.method === "GET") {
        const allowed = current.admin ? branches : [current.serviceBranch];
        send(response, 200, {
          branches: allowed,
          members: roster().filter(person => allowed.includes(person.branch)),
          events: all("events").filter(item => allowed.includes(item.branch)),
          paths: all("paths").filter(item => allowed.includes(item.branch)),
        });
        return true;
      }
      const match = /^\/api\/activities\/(events|paths)(?:\/([1-9]\d*))?$/.exec(route);
      if (!match || request.method !== (match[2] ? "PATCH" : "POST")) fail(404, "Operazione attivita non disponibile");
      const category = match[1], id = Number(match[2]);
      const value = await body(request, 128000);
      if (!object(value)) fail(400, "Dati attivita non validi");
      let existing;
      if (id) {
        const row = db.prepare("SELECT * FROM activities WHERE id=? AND category=?").get(id, category);
        if (!row) fail(404, "Attivita non trovata");
        existing = record(row);
      }
      const branch = existing?.branch || value.branch;
      access(branch);
      if (existing && (value.revision !== existing.revision || value.branch !== branch))
        fail(409, "Dati modificati: ricarica prima di salvare");
      let data;
      if (category === "events") {
        if (!kinds[branch].includes(value.kind)) fail(400, "Tipo di attivita non previsto per la branca");
        let date;
        try { date = M.date(value.date); } catch { fail(400, "Data non valida"); }
        if (!date) fail(400, "Indica la data dell'attivita");
        let endDate;
        try { endDate = M.date(value.endDate || existing?.endDate || date); } catch { fail(400, "Data finale non valida"); }
        if (!endDate || endDate < date) fail(400, "La data finale deve essere uguale o successiva alla data iniziale");
        const program = value.program ?? existing?.program ?? [];
        if (!Array.isArray(program) || program.length > 300) fail(400, "Programma non valido");
        const schedule = program.map(item => {
          if (!object(item)) fail(400, "Momento del programma non valido");
          let day;
          try { day = M.date(item.date); } catch { fail(400, "Data del programma non valida"); }
          if (!day || day < date || day > endDate) fail(400, "La data del programma deve rientrare nell'attività");
          const time = optionalText(item.time, 5), endTime = optionalText(item.endTime, 5);
          if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
              endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime))
            fail(400, "Orario del programma non valido");
          if (endTime && (!time || endTime <= time))
            fail(400, "L’orario di fine deve essere successivo all’inizio");
          if (item.materials !== undefined && item.materials !== null &&
              typeof item.materials !== "string" && !Array.isArray(item.materials))
            fail(400, "Materiali del momento non validi");
          let materials = Array.isArray(item.materials) ? [] : optionalText(item.materials, 1000);
          if (Array.isArray(item.materials)) {
            if (item.materials.length > 100) fail(400, "Troppi materiali per un momento");
            materials = item.materials.map(material => {
              if (!object(material)) fail(400, "Materiale del momento non valido");
              const quantity = material.quantity ?? null;
              if (quantity !== null && (typeof quantity !== "number" || !Number.isFinite(quantity) ||
                  quantity < 0 || quantity > 1000000)) fail(400, "Quantità materiale non valida");
              return { title: text(material.title, 200), quantity,
                unit: optionalText(material.unit, 32) };
            });
          }
          return { date: day, time, ...(endTime ? { endTime } : {}), title: text(item.title, 200),
            place: optionalText(item.place, 200), description: optionalText(item.description, 2000),
            materials, materialNote: optionalText(item.materialNote, 1000) };
        }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        if (!Array.isArray(value.attendance) || value.attendance.length > 1000)
          fail(400, "Presenze non valide");
        const feeCents = amount(Object.hasOwn(value, "feeCents") ? value.feeCents : existing?.feeCents ?? 0);
        const eligible = roster().filter(person => person.branch === branch);
        const seen = new Set();
        const attendance = value.attendance.map(item => {
          if (!object(item) || !["", "presente", "assente", "giustificato"].includes(item.status) || seen.has(item.personId))
            fail(400, "Presenza non valida o duplicata");
          const member = eligible.find(person => person.id === item.personId) ||
            existing?.attendance.find(person => person.personId === item.personId);
          if (!member) fail(400, "Socio non appartenente alla branca");
          seen.add(item.personId);
          const previous = existing?.attendance.find(person => person.personId === item.personId);
          if (Object.hasOwn(item, "due") && typeof item.due !== "boolean") fail(400, "Quota dovuta non valida");
          const paidCents = amount(Object.hasOwn(item, "paidCents") ? item.paidCents : previous?.paidCents ?? 0);
          return { personId: item.personId, name: member.name, status: item.status, due: feeCents > 0, paidCents,
            unit: previous?.unit ?? member.unit ?? "" };
        });
        if (existing?.attendance.some(person => person.paidCents > 0 && !seen.has(person.personId)))
          fail(400, "Non puoi rimuovere un socio con versamenti registrati: correggi prima il versamento");
        const eligibleById = new Map(eligible.map(person => [person.id, person]));
        const savedTournament = Object.hasOwn(value, "tournament") ? value.tournament : existing?.tournament;
        if (savedTournament && (branch !== "L/C" || value.kind !== "riunione"))
          fail(400, "Il torneo delle sestiglie è disponibile solo per le riunioni L/C");
        data = { kind: value.kind, title: text(value.title), date, endDate, feeCents, attendance,
          tasks: steps(value.tasks), program: schedule,
          materials: checklist(value.materials ?? existing?.materials ?? []),
          shopping: checklist(value.shopping ?? existing?.shopping ?? [], true) };
        if (savedTournament) data.tournament = tournament(savedTournament, eligible, attendance, existing?.tournament);
        else if (branch === "L/C" && value.kind === "riunione") {
          const previous = existing?.tournament;
          if (previous) data.tournament = tournament(previous, eligible, attendance, previous);
        }
      } else {
        const allowed = branch === "L/C" ? ["hunt", "specialty"] : branch === "E/G" ? ["specialty", "badge"] : [];
        if (!allowed.includes(value.kind)) fail(400, "Percorso non previsto per la branca");
        if (existing && (existing.kind !== value.kind || existing.personId !== value.personId))
          fail(400, "Il percorso non puo cambiare tipo o socio");
        const member = roster().find(person => person.id === value.personId && person.branch === branch);
        if (!existing && !member) fail(400, "Socio non appartenente alla branca");
        const stages = steps(value.steps);
        if (typeof value.closed !== "boolean" || (value.kind !== "hunt" && value.closed))
          fail(400, "Conclusione non valida");
        if (value.closed && (!stages.length || stages.some(step => !step.done)))
          fail(400, "Conquista tutte le prede prima di concludere la stagione");
        const paths = all("paths").filter(item => item.branch === branch && item.personId === value.personId);
        if (value.kind === "hunt" && !value.closed && paths.some(item => item.id !== existing?.id && item.kind === "hunt" && !item.closed))
          fail(409, "Questo lupetto ha gia una stagione di caccia aperta");
        data = { kind: value.kind, personId: value.personId, memberName: existing?.memberName || member.name,
          title: text(value.title), steps: stages, closed: value.closed };
      }
      if (existing) {
        const result = db.prepare("UPDATE activities SET data=?,revision=revision+1 WHERE id=? AND revision=?")
          .run(JSON.stringify(data), id, value.revision);
        if (!result.changes) fail(409, "Dati modificati: ricarica prima di salvare");
      } else {
        const result = db.prepare("INSERT INTO activities(category,branch,data) VALUES(?,?,?)").run(category, branch, JSON.stringify(data));
        existing = { id: Number(result.lastInsertRowid) };
      }
      send(response, 200, record(db.prepare("SELECT * FROM activities WHERE id=?").get(existing.id)));
      return true;
    },
  };
}
module.exports = { createActivities };
