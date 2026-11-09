"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const ADMIN_CODE = "23816938";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function code(value) {
  if (typeof value !== "string" || !/^[0-9]{5,9}$/.test(value))
    fail(400, "Il codice censimento deve contenere da 5 a 9 cifre, senza spazi");
  return value;
}

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
  const allowed = new Set([ADMIN_CODE]);
  for (const value of configuredCodes.split(",").filter((value) => value.trim()))
    allowed.add(code(value.trim()));
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
  if (!database.prepare("PRAGMA table_info(sessions)").all().some((column) => column.name === "person_id")) {
    database.exec("ALTER TABLE sessions ADD COLUMN person_id INTEGER REFERENCES people(id); DELETE FROM sessions;");
  }
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
  });
  const user = (sessionId) => {
    const row = database.prepare(`SELECT people.* FROM people JOIN sessions ON people.id=sessions.person_id
      WHERE sessions.id=? AND expires>? AND kind='capo'
      AND (census_code=? OR password_hash IS NOT NULL)`).get(sessionId, Date.now(), ADMIN_CODE);
    return row && allowed.has(row.census_code) ? person(row) : null;
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
  const validatePerson = (value) => {
    if (typeof value?.name !== "string" || !value.name.trim() || value.name.trim().length > 120 ||
        !["capo", "ragazzo"].includes(value.kind)) fail(400, "Nome o tipologia non validi");
  };
  return {
    user,
    async handle(route, request, response, { body, send, cookie, sessionId, rateLimit, clearLimit, ip, seconds }) {
      const method = request.method;
      if (route === "/api/auth/me" && method === "GET") {
        const current = user(sessionId(request));
        if (!current) fail(401, "Sessione scaduta: accedi di nuovo");
        send(response, 200, { user: current });
        return true;
      }
      if (route === "/api/auth/status" && method === "POST") {
        rateLimit("status:" + ip, 30, 60000);
        const current = enabled(code((await body(request, 4096))?.code));
        send(response, 200, { firstAccess: current.census_code !== ADMIN_CODE && !current.password_hash });
        return true;
      }
      if (route === "/api/auth/login" && method === "POST") {
        rateLimit("login-ip:" + ip, 30, 900000);
        const value = await body(request, 4096);
        const censusCode = code(value?.code);
        rateLimit("login-code:" + censusCode, 5, 900000);
        let current = enabled(censusCode);
        if (censusCode !== ADMIN_CODE && !current.password_hash) {
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
        send(response, 200, { people: database.prepare("SELECT * FROM people ORDER BY name,census_code").all().map(person) });
        return true;
      }
      if (route === "/api/people" && method === "POST") {
        const value = await body(request, 4096);
        validatePerson(value);
        const censusCode = code(value.code);
        if (byCode(censusCode)) fail(409, "Il codice censimento esiste gia'");
        database.prepare("INSERT INTO people(census_code,name,kind) VALUES(?,?,?)")
          .run(censusCode, value.name.trim(), value.kind);
        send(response, 201, { ok: true });
        return true;
      }
      const match = /^\/api\/people\/(\d+)(\/password)?$/.exec(route);
      if (!match) fail(404, "Persona non trovata");
      const current = database.prepare("SELECT * FROM people WHERE id=?").get(Number(match[1]));
      if (!current) fail(404, "Persona non trovata");
      if (match[2] && method === "DELETE") {
        if (current.census_code === ADMIN_CODE)
          fail(400, "Modifica NAS_ADMIN_PASSWORD in nas.env (o .env): la password amministratore non e' nel database");
        if (current.kind !== "capo") fail(400, "I ragazzi non hanno password");
        database.prepare("UPDATE people SET password_hash=NULL WHERE id=?").run(current.id);
        database.prepare("DELETE FROM sessions WHERE person_id=?").run(current.id);
      } else if (!match[2] && method === "PATCH") {
        const value = await body(request, 4096);
        validatePerson(value);
        if (current.census_code === ADMIN_CODE && value.kind !== "capo")
          fail(400, "L'amministratore deve restare capo");
        database.prepare(`UPDATE people SET name=?,kind=?,
          password_hash=CASE WHEN ?='ragazzo' THEN NULL ELSE password_hash END WHERE id=?`)
          .run(value.name.trim(), value.kind, value.kind, current.id);
        if (current.kind !== value.kind) database.prepare("DELETE FROM sessions WHERE person_id=?").run(current.id);
      } else fail(405, "Metodo non consentito");
      send(response, 200, { ok: true });
      return true;
    },
  };
}

module.exports = { createPeople, validatePassword };
