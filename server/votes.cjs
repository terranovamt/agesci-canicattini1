"use strict";

const crypto = require("node:crypto");

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
const MODES = ["scelta", "nominativa"];
const CODE = /^\d{6}$/;

// Votazioni segrete: chi ha votato (vote_cast) e cosa è stato votato (vote_tally) sono tabelle
// separate e senza data, così nessun dato collega una persona alla sua scelta.
function createVotes(db, people) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vote_codes (person_id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS vote_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slide TEXT NOT NULL UNIQUE, question TEXT NOT NULL,
      mode TEXT NOT NULL, options TEXT NOT NULL, live INTEGER NOT NULL DEFAULT 0,
      open INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vote_tally (
      poll_id INTEGER NOT NULL, option INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(poll_id,option)
    );
    CREATE TABLE IF NOT EXISTS vote_cast (poll_id INTEGER NOT NULL, person_id INTEGER NOT NULL, PRIMARY KEY(poll_id,person_id));
  `);
  db.exec("DELETE FROM vote_codes WHERE length(code)!=6");
  const failures = new Map();
  const blocked = ip => {
    const item = failures.get(ip);
    if (item && item.until > Date.now() && item.count >= 10) fail(429, "Troppi codici errati: riprova tra qualche minuto");
  };
  const wrong = ip => {
    const now = Date.now(), item = failures.get(ip);
    if (!item || item.until < now) failures.set(ip, { count: 1, until: now + 600000 });
    else item.count++;
    fail(401, "Codice di voto non valido");
  };
  const total = () => db.prepare("SELECT count(*) AS n FROM vote_codes").get().n;
  const latest = () => db.prepare("SELECT * FROM vote_polls ORDER BY open DESC, updated DESC LIMIT 1").get();
  const tallies = poll => {
    const options = JSON.parse(poll.options), counts = options.map(() => 0);
    for (const row of db.prepare("SELECT option,n FROM vote_tally WHERE poll_id=?").all(poll.id)) counts[row.option] = row.n;
    return counts;
  };
  const received = poll => db.prepare("SELECT count(*) AS n FROM vote_cast WHERE poll_id=?").get(poll.id).n;
  const publicPoll = poll => {
    if (!poll) return null;
    const counts = !poll.open || (poll.live && poll.mode === "scelta") ? tallies(poll) : null;
    return { id: poll.id, slide: poll.slide, domanda: poll.question, modalita: poll.mode, opzioni: JSON.parse(poll.options),
      aperta: !!poll.open, ricevuti: received(poll), totale: total(), conteggi: counts };
  };
  const text = (value, max, label) => {
    if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) fail(400, label + " non valido");
    return value.trim();
  };
  const voter = code => {
    if (typeof code !== "string" || !CODE.test(code)) return null;
    return db.prepare(`SELECT p.id, p.name FROM vote_codes c JOIN people p ON p.id=c.person_id WHERE c.code=?`).get(code) || null;
  };
  const staff = (sessionId, request) => {
    const current = people.user(sessionId(request));
    if (!current) fail(401, "Sessione scaduta: accedi di nuovo");
    return current;
  };
  const freshCode = () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      if (!db.prepare("SELECT 1 FROM vote_codes WHERE code=?").get(code)) return code;
    }
    fail(500, "Impossibile generare codici di voto univoci");
  };

  return {
    async handle(route, request, response, { body, send, sessionId, ip }) {
      if (!route.startsWith("/api/vote/")) return false;
      const method = request.method;
      if (route === "/api/vote/state" && method === "GET") {
        send(response, 200, { poll: publicPoll(latest()) });
        return true;
      }
      if (route === "/api/vote/identify" && method === "POST") {
        blocked(ip);
        const value = await body(request, 1024);
        const who = voter(value?.code);
        if (!who) wrong(ip);
        const poll = latest();
        const open = poll && poll.open ? poll : null;
        send(response, 200, { nome: who.name, poll: publicPoll(open),
          haVotato: !!(open && db.prepare("SELECT 1 FROM vote_cast WHERE poll_id=? AND person_id=?").get(open.id, who.id)) });
        return true;
      }
      if (route === "/api/vote/cast" && method === "POST") {
        blocked(ip);
        const value = await body(request, 1024);
        const who = voter(value?.code);
        if (!who) wrong(ip);
        db.exec("BEGIN IMMEDIATE");
        try {
          const poll = db.prepare("SELECT * FROM vote_polls WHERE id=?").get(value.poll);
          if (!poll || !poll.open) fail(409, "La votazione non è aperta");
          const options = JSON.parse(poll.options);
          if (!Number.isInteger(value.scelta) || value.scelta < 0 || value.scelta >= options.length) fail(400, "Scelta non valida");
          if (db.prepare("INSERT OR IGNORE INTO vote_cast(poll_id,person_id) VALUES(?,?)").run(poll.id, who.id).changes === 0)
            fail(409, "Hai già votato");
          db.prepare(`INSERT INTO vote_tally(poll_id,option,n) VALUES(?,?,1)
            ON CONFLICT(poll_id,option) DO UPDATE SET n=n+1`).run(poll.id, value.scelta);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        send(response, 200, { ok: true });
        return true;
      }
      if (route === "/api/vote/codes" && method === "POST") {
        const current = staff(sessionId, request);
        if (!current.admin) fail(403, "Operazione riservata all'amministratore");
        const value = await body(request, 1024);
        const year = text(value?.anno, 8, "Anno");
        db.exec("BEGIN IMMEDIATE");
        try {
          if (value.rigenera === true) db.exec("DELETE FROM vote_codes");
          const rows = db.prepare(`SELECT p.id, p.name, p.census_code AS code, c.data FROM member_censuses c
            JOIN people p ON p.id=c.person_id WHERE c.year=? AND p.census_code!=? ORDER BY p.name`)
            .all(year, require("./people.cjs").ADMIN_CODE);
          const result = rows.map(row => {
            let personal = db.prepare("SELECT code FROM vote_codes WHERE person_id=?").get(row.id)?.code;
            if (!personal) {
              personal = freshCode();
              db.prepare("INSERT INTO vote_codes(person_id,code) VALUES(?,?)").run(row.id, personal);
            }
            return { nome: row.name, codice: row.code, personale: personal, branca: JSON.parse(row.data).branch || "" };
          });
          db.exec("COMMIT");
          send(response, 200, { righe: result, totale: total() });
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return true;
      }
      if (route === "/api/vote/open" && method === "POST") {
        staff(sessionId, request);
        const value = await body(request, 16 * 1024);
        const slide = text(value?.slide, 80, "Slide");
        const question = text(value.domanda, 300, "Quesito");
        if (!MODES.includes(value.modalita)) fail(400, "Tipo di votazione non valido");
        if (!Array.isArray(value.opzioni) || value.opzioni.length < 2 || value.opzioni.length > 40) fail(400, "Servono da 2 a 40 opzioni");
        const options = value.opzioni.map(item => text(item, 120, "Opzione"));
        if (!total()) fail(409, "Nessun codice di voto: generali dalla scheda Censiti del setup");
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("UPDATE vote_polls SET open=0 WHERE open=1 AND slide!=?").run(slide);
          const existing = db.prepare("SELECT * FROM vote_polls WHERE slide=?").get(slide);
          if (!existing) {
            db.prepare("INSERT INTO vote_polls(slide,question,mode,options,live,open,updated) VALUES(?,?,?,?,?,1,?)")
              .run(slide, question, value.modalita, JSON.stringify(options), value.live === true ? 1 : 0, Date.now());
          } else if (received(existing) === 0) {
            db.prepare("UPDATE vote_polls SET question=?,mode=?,options=?,live=?,open=1,updated=? WHERE id=?")
              .run(question, value.modalita, JSON.stringify(options), value.live === true ? 1 : 0, Date.now(), existing.id);
          } else {
            db.prepare("UPDATE vote_polls SET live=?,open=1,updated=? WHERE id=?")
              .run(value.live === true ? 1 : 0, Date.now(), existing.id);
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        send(response, 200, { poll: publicPoll(db.prepare("SELECT * FROM vote_polls WHERE slide=?").get(slide)) });
        return true;
      }
      if (route === "/api/vote/close" && method === "POST") {
        staff(sessionId, request);
        db.prepare("UPDATE vote_polls SET open=0, updated=? WHERE open=1").run(Date.now());
        send(response, 200, { ok: true });
        return true;
      }
      if (route === "/api/vote/reset" && method === "POST") {
        staff(sessionId, request);
        const value = await body(request, 1024);
        const poll = db.prepare("SELECT * FROM vote_polls WHERE slide=?").get(text(value?.slide, 80, "Slide"));
        if (poll) {
          db.exec("BEGIN IMMEDIATE");
          db.prepare("DELETE FROM vote_tally WHERE poll_id=?").run(poll.id);
          db.prepare("DELETE FROM vote_cast WHERE poll_id=?").run(poll.id);
          db.prepare("DELETE FROM vote_polls WHERE id=?").run(poll.id);
          db.exec("COMMIT");
        }
        send(response, 200, { ok: true });
        return true;
      }
      if (route === "/api/vote/results" && method === "GET") {
        staff(sessionId, request);
        const slide = new URL(request.url, "http://x").searchParams.get("slide");
        const poll = slide ? db.prepare("SELECT * FROM vote_polls WHERE slide=?").get(slide) : latest();
        const base = publicPoll(poll);
        const hide = poll && poll.open && poll.mode === "nominativa";
        send(response, 200, { poll: base && { ...base, conteggi: hide ? null : tallies(poll) } });
        return true;
      }
      if (route === "/api/vote/report" && method === "GET") {
        staff(sessionId, request);
        const polls = db.prepare("SELECT * FROM vote_polls ORDER BY id").all().map(poll => ({ ...publicPoll(poll), conteggi: tallies(poll) }));
        send(response, 200, { polls });
        return true;
      }
      fail(404, "Risorsa non disponibile");
    },
  };
}

module.exports = { createVotes };
