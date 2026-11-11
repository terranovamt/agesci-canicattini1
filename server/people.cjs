"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const ADMIN_CODE = "23816938";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const SERVICE_BRANCHES = ["L/C", "E/G", "R/S"];
const STALE_VIEW = "Il capo visualizzato non e' piu' disponibile: torna amministratore";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function code(value) {
  if (typeof value !== "string" || !/^[0-9]{5,9}$/.test(value))
    fail(400, "Il codice censimento deve contenere da 5 a 9 cifre, senza spazi");
  return value;
}

// Capi senza password personale accedono solo con questa e devono sceglierne subito una nuova.
const DEFAULT_PASSWORD = "Canicattini1";

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9\s]/.test(password))
    fail(400, "La password deve contenere almeno 8 caratteri (massimo 128), una maiuscola, una minuscola, un numero e un carattere speciale, come @");
}

async function encode(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(32).toString("hex");
  const digest = await scrypt(password, Buffer.from(salt, "hex"), 64);
  return `scrypt$${salt}$${digest.toString("hex")}`;
}

async function matches(password, encoded) {
  if (typeof password !== "string" || password.length > 128 || !encoded) return false;
  const [, salt, expected] = encoded.split("$");
  const digest = await scrypt(password, Buffer.from(salt, "hex"), 64);
  return crypto.timingSafeEqual(digest, Buffer.from(expected, "hex"));
}

async function createPeople(database, adminPassword, configuredCodes = "") {
  validatePassword(adminPassword);
  const configured = new Set();
  for (const value of configuredCodes.split(",").filter((value) => value.trim()))
    configured.add(code(value.trim()));
  configured.delete(ADMIN_CODE);
  const allowed = new Set([ADMIN_CODE, ...configured]);
  database.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY, census_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('ragazzo','capo')), password_hash TEXT,
      CHECK(kind='capo' OR password_hash IS NULL)
    );
    CREATE TABLE IF NOT EXISTS auth_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const peopleSchema = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='people'").get().sql;
  if (peopleSchema.includes("census_code!='1238005'")) {
    const foreignKeys = database.prepare("PRAGMA foreign_keys").get().foreign_keys;
    database.exec("PRAGMA foreign_keys=OFF");
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.exec(`
          CREATE TABLE people_migrated (
            id INTEGER PRIMARY KEY, census_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('ragazzo','capo')), password_hash TEXT,
            CHECK(kind='capo' OR password_hash IS NULL)
          );
          INSERT INTO people_migrated SELECT id,census_code,name,kind,password_hash FROM people;
          DROP TABLE people;
          ALTER TABLE people_migrated RENAME TO people;
          COMMIT;
        `);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      if (foreignKeys) database.exec("PRAGMA foreign_keys=ON");
    }
  }
  if (!database.prepare("PRAGMA table_info(people)").all().some(column => column.name === "service_branch"))
    database.exec("ALTER TABLE people ADD COLUMN service_branch TEXT NOT NULL DEFAULT ''");
  if (!database.prepare("PRAGMA table_info(sessions)").all().some((column) => column.name === "person_id")) {
    database.exec("ALTER TABLE sessions ADD COLUMN person_id INTEGER REFERENCES people(id); DELETE FROM sessions;");
  }
  // Admin "view as": the session keeps the real admin in person_id and only stores the viewed chief.
  if (!database.prepare("PRAGMA table_info(sessions)").all().some((column) => column.name === "view_as_id"))
    database.exec("ALTER TABLE sessions ADD COLUMN view_as_id INTEGER REFERENCES people(id)");
  database.prepare("INSERT OR IGNORE INTO people(census_code,name,kind) VALUES(?,?,'capo')")
    .run(ADMIN_CODE, "Amministratore");
  database.prepare("UPDATE people SET kind='capo', password_hash=NULL WHERE census_code=?").run(ADMIN_CODE);
  for (const censusCode of allowed)
    database.prepare("INSERT OR IGNORE INTO people(census_code,name,kind) VALUES(?,?,'capo')")
      .run(censusCode, "Capo " + censusCode);
  database.prepare("DELETE FROM auth_settings WHERE name='admin_initialized'").run();
  // Restart invalidates admin sessions so an env password change also revokes access.
  database.prepare("DELETE FROM sessions WHERE person_id=(SELECT id FROM people WHERE census_code=?)").run(ADMIN_CODE);
  const placeholders = [...allowed].map(() => "?").join(",");
  database.prepare(`DELETE FROM sessions WHERE person_id IN (
    SELECT id FROM people WHERE census_code NOT IN (${placeholders})
  )`).run(...allowed);
  const byCode = (censusCode) => database.prepare("SELECT * FROM people WHERE census_code=?").get(censusCode);
  const person = (row) => ({
    id: row.id, code: row.census_code, name: row.name, kind: row.kind,
    admin: row.census_code === ADMIN_CODE, hasPassword: row.census_code === ADMIN_CODE || !!row.password_hash,
    loginEnabled: row.kind === "capo" && allowed.has(row.census_code),
    serviceBranch: row.service_branch,
  });
  const actorRow = (sessionId) => {
    const row = database.prepare(`SELECT people.*, sessions.view_as_id AS session_view_as_id FROM people
      JOIN sessions ON people.id=sessions.person_id
      WHERE sessions.id=? AND expires>? AND kind='capo'
      AND (census_code=? OR password_hash IS NOT NULL)`).get(sessionId, Date.now(), ADMIN_CODE);
    return row && allowed.has(row.census_code) ? row : null;
  };
  const viewTarget = (id) => {
    const row = Number.isSafeInteger(id) ? database.prepare("SELECT * FROM people WHERE id=?").get(id) : null;
    return row && row.kind === "capo" && configured.has(row.census_code) &&
      SERVICE_BRANCHES.includes(row.service_branch) ? row : null;
  };
  // actorId is non-enumerable: available for server-side audit fields, never serialized to clients.
  const withActor = (value, actor) => Object.defineProperty(value, "actorId", { value: actor.id });
  const resolve = (sessionId) => {
    const actor = actorRow(sessionId);
    if (!actor) return null;
    if (actor.session_view_as_id === null) return { actor, user: withActor(person(actor), actor), viewAs: null };
    if (actor.census_code !== ADMIN_CODE) return null;
    const target = viewTarget(actor.session_view_as_id);
    const viewAs = { adminName: actor.name,
      target: target ? { id: target.id, name: target.name, serviceBranch: target.service_branch } : null };
    return { actor, viewAs, user: target ? withActor({ ...person(target), viewAs: { adminName: actor.name } }, actor) : null };
  };
  // Effective user for every permission check: under "view as" it is the viewed chief, never the admin.
  const user = (sessionId) => {
    const current = resolve(sessionId);
    if (current?.viewAs && !current.user) fail(409, STALE_VIEW);
    return current?.user || null;
  };
  const client = (sessionId) => {
    const current = resolve(sessionId);
    return { user: current?.user || null, viewAs: current?.viewAs || null };
  };
  const enabled = (censusCode) => {
    const row = byCode(censusCode);
    if (!allowed.has(censusCode) || row?.kind !== "capo")
      fail(403, "Codice non abilitato. Contatta l'amministratore del sito");
    return row;
  };
  const requireAdmin = (sessionId) => {
    const current = user(sessionId);
    if (!current) fail(401, "Sessione scaduta: accedi di nuovo");
    if (!current.admin) fail(403, "Operazione riservata all'amministratore");
  };
  return {
    user,
    client,
    async handle(route, request, response, { body, send, cookie, sessionId, rateLimit, clearLimit, ip, seconds }) {
      const method = request.method;
      if (route === "/api/auth/me" && method === "GET") {
        const current = user(sessionId(request));
        if (!current) fail(401, "Sessione scaduta: accedi di nuovo");
        send(response, 200, { user: current });
        return true;
      }
      if (route === "/api/auth/view-as") {
        const id = sessionId(request), current = resolve(id);
        if (!current) fail(401, "Sessione scaduta: accedi di nuovo");
        if (current.actor.census_code !== ADMIN_CODE) fail(403, "Operazione riservata all'amministratore");
        if (method === "POST") {
          if (current.viewAs) fail(409, "Torna amministratore prima di cambiare vista");
          const value = await body(request, 1024);
          if (!value || typeof value !== "object" || Object.keys(value).length !== 1 || !Number.isSafeInteger(value.personId))
            fail(400, "Capo da visualizzare non valido");
          const target = viewTarget(value.personId);
          if (!target) fail(404, "Capo non disponibile: serve un capo abilitato con branca di servizio");
          if (!database.prepare("UPDATE sessions SET view_as_id=? WHERE id=? AND person_id=? AND view_as_id IS NULL")
            .run(target.id, id, current.actor.id).changes) fail(409, "Torna amministratore prima di cambiare vista");
        } else if (method === "DELETE") {
          database.prepare("UPDATE sessions SET view_as_id=NULL WHERE id=? AND person_id=?").run(id, current.actor.id);
        } else fail(405, "Metodo non consentito");
        send(response, 200, client(id));
        return true;
      }
      if (route === "/api/auth/status" && method === "POST") {
        rateLimit("status:" + ip, 30, 60000);
        const current = enabled(code((await body(request, 4096))?.code));
        send(response, 200, { firstAccess: false });
        return true;
      }
      if (route === "/api/auth/login" && method === "POST") {
        rateLimit("login-ip:" + ip, 30, 900000);
        const value = await body(request, 4096);
        const censusCode = code(value?.code);
        rateLimit("login-code:" + censusCode, 5, 900000);
        let current = enabled(censusCode);
        const isDefault = (candidate) => typeof candidate === "string" && candidate.length <= 128 &&
          crypto.timingSafeEqual(Buffer.from(hash(candidate), "hex"), Buffer.from(hash(DEFAULT_PASSWORD), "hex"));
        if (censusCode !== ADMIN_CODE && !current.password_hash) {
          if (value.confirmation === undefined) {
            if (!isDefault(value.password)) fail(401, "Codice censimento o password non validi");
            send(response, 200, { mustChange: true });
            return true;
          }
          if (!isDefault(value.temporary)) fail(401, "Codice censimento o password non validi");
          if (value.password === DEFAULT_PASSWORD) fail(400, "Scegli una password diversa da quella provvisoria");
          if (value.password !== value.confirmation) fail(400, "Le password non coincidono");
          const encoded = await encode(value.password);
          database.prepare("UPDATE people SET password_hash=? WHERE id=? AND kind='capo' AND password_hash IS NULL")
            .run(encoded, current.id);
          current = enabled(censusCode);
        }
        const valid = censusCode === ADMIN_CODE
          ? typeof value.password === "string" && value.password.length <= 128 &&
            crypto.timingSafeEqual(Buffer.from(hash(value.password), "hex"), Buffer.from(hash(adminPassword), "hex"))
          : await matches(value.password, current.password_hash);
        if (!valid) fail(401, "Codice censimento o password non validi");
        const latest = enabled(censusCode);
        if (latest.password_hash !== current.password_hash) fail(409, "Credenziali cambiate: riprova l'accesso");
        clearLimit("login-code:" + censusCode);
        const token = crypto.randomBytes(32).toString("hex");
        database.prepare("INSERT INTO sessions(id,expires,person_id) VALUES(?,?,?)")
          .run(hash(token), Date.now() + seconds * 1000, current.id);
        send(response, 200, { user: person(current) }, undefined, { "Set-Cookie": cookie(token, seconds) });
        return true;
      }
      if (!route.startsWith("/api/people")) return false;
      requireAdmin(sessionId(request));
      if (route === "/api/people" && method === "GET") {
        const codes = [...configured];
        const people = codes.length
          ? database.prepare(`SELECT * FROM people WHERE kind='capo' AND census_code IN (${codes.map(() => "?").join(",")}) ORDER BY name,census_code`).all(...codes).map(person)
          : [];
        send(response, 200, { people });
        return true;
      }
      if (route === "/api/people") fail(405, "Metodo non consentito");
      const match = /^\/api\/people\/(\d+)(\/password)?$/.exec(route);
      if (!match) fail(404, "Persona non trovata");
      const current = database.prepare("SELECT * FROM people WHERE id=?").get(Number(match[1]));
      if (!current || !configured.has(current.census_code) || current.kind !== "capo")
        fail(404, "Capo non trovato nell'elenco configurato");
      if (match[2] && method === "DELETE") {
        database.prepare("UPDATE people SET password_hash=NULL WHERE id=?").run(current.id);
        database.prepare("DELETE FROM sessions WHERE person_id=?").run(current.id);
      } else if (!match[2] && method === "PATCH") {
        const value = await body(request, 4096);
        if (!value || Object.keys(value).length !== 1 || !Object.hasOwn(value, "serviceBranch") ||
            !["", "L/C", "E/G", "R/S"].includes(value.serviceBranch))
          fail(400, "E' possibile modificare solo una branca di servizio valida");
        database.prepare("UPDATE people SET service_branch=? WHERE id=?").run(value.serviceBranch, current.id);
      } else fail(405, "Metodo non consentito");
      send(response, 200, { ok: true });
      return true;
    },
  };
}

module.exports = { createPeople, validatePassword, ADMIN_CODE, DEFAULT_PASSWORD };
