"use strict";

const M = require("../assets/js/soci-model.js");
const { ADMIN_CODE } = require("./people.cjs");
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function createMemberUnits(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_units (
      id INTEGER PRIMARY KEY, branch TEXT NOT NULL, name_key TEXT NOT NULL,
      name TEXT NOT NULL, color TEXT NOT NULL, color2 TEXT NOT NULL,
      emblem TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1, UNIQUE(branch,name_key)
    );
    CREATE TABLE IF NOT EXISTS member_branch_settings (
      branch TEXT PRIMARY KEY, environment TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
    INSERT OR IGNORE INTO member_branch_settings VALUES('L/C','Branco',1);
    CREATE TABLE IF NOT EXISTS member_assignment_history (
      person_id INTEGER NOT NULL REFERENCES people(id), branch TEXT NOT NULL,
      year TEXT NOT NULL, unit TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY(person_id,branch,year)
    );
  `);
  const currentYear = () => db.prepare(`SELECT max(c.year) AS year FROM member_censuses c
    JOIN people p ON p.id=c.person_id WHERE p.census_code!=?`).get(ADMIN_CODE).year || String(new Date().getFullYear());
  function recordAssignment(id, branch, values) {
    if (!["L/C", "E/G"].includes(branch)) return;
    const unit = values[M.unitField(branch)] || "", role = values.ruolo || "";
    if (!unit && !role && !db.prepare("SELECT 1 FROM member_assignment_history WHERE person_id=? AND branch=?").get(id, branch)) return;
    db.prepare(`INSERT INTO member_assignment_history VALUES(?,?,?,?,?)
      ON CONFLICT(person_id,branch,year) DO UPDATE SET unit=excluded.unit,role=excluded.role`)
      .run(id, branch, currentYear(), unit, role);
  }
  function checkpoint() {
    for (const row of db.prepare(`SELECT v.person_id,v.branch,v.data FROM member_values v
      JOIN member_profiles m ON m.person_id=v.person_id AND m.branch=v.branch
      JOIN people p ON p.id=v.person_id WHERE p.census_code!=?`).all(ADMIN_CODE))
      recordAssignment(row.person_id, row.branch, JSON.parse(row.data));
  }
  const history = id => db.prepare("SELECT year,branch,unit,role FROM member_assignment_history WHERE person_id=? ORDER BY year DESC,branch").all(id);
  checkpoint();
  const configuration = () => db.prepare("SELECT environment,revision FROM member_branch_settings WHERE branch='L/C'").get();
  const all = () => db.prepare("SELECT * FROM member_units ORDER BY branch,name COLLATE NOCASE").all()
    .map(row => ({ id: row.id, branch: row.branch, name: row.name,
      color: (row.branch === "E/G" && M.patrolIdentity(row.name)?.color) || row.color,
      color2: (row.branch === "E/G" && M.patrolIdentity(row.name)?.color2) || row.color2,
      emblem: row.emblem, hidden: !!row.hidden, revision: row.revision }));
  const groupName = (value, max = 80) => {
    if (typeof value !== "string") fail(400, "Nome del gruppo non valido");
    const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!name || name.length > max || /[\x00-\x1f\x7f]/.test(name))
      fail(400, `Nome del gruppo non valido (massimo ${max} caratteri)`);
    return name;
  };
  const find = (branch, name) => db.prepare("SELECT * FROM member_units WHERE branch=? AND name_key=?")
    .get(branch, M.unitKey(name));
  const ensure = (branch, name, legacy = false) => {
    name = groupName(name, legacy ? 2000 : 80);
    const color = Object.entries(M.sestigliaColors).find(([key]) => M.unitKey(key) === M.unitKey(name))?.[1] || "#898989";
    db.prepare(`INSERT OR IGNORE INTO member_units(branch,name_key,name,color,color2)
      VALUES(?,?,?,?,?)`).run(branch, M.unitKey(name), name, branch === "L/C" ? color : "#ffffff", "#ffffff");
    return find(branch, name);
  };
  for (const row of db.prepare(`SELECT v.branch,v.data FROM member_values v JOIN people p ON p.id=v.person_id
    WHERE v.branch IN ('L/C','E/G') AND p.census_code!=?`).all(ADMIN_CODE)) {
    const name = JSON.parse(row.data)[M.unitField(row.branch)];
    if (typeof name === "string" && name.trim()) ensure(row.branch, name, true);
  }
  function definitions(fields) {
    const { environment } = configuration();
    return fields.map(field => {
      if (["L/C", "E/G"].includes(field.branch) && field.key === "ruolo" && field.type === "select") {
        const roles = M.unitRoles(field.branch, environment);
        const legacy = field.options.filter(role => !roles.includes(role) && !(field.branch === "L/C" && ["Cucciolo", "Cocci"].includes(role)));
        return { ...field, options: [...roles, ...legacy] };
      }
      if (field.branch !== "L/C") return field;
      const standard = M.defaultFields.find(item => item.branch === "L/C" && item.key === field.key);
      if (!standard || JSON.stringify(field) !== JSON.stringify(standard)) return field;
      if (field.key === "progressione") return { ...field, options: M.lcMoments[environment] };
      if (field.key === "pista") return { ...field, label: environment === "Cerchio" ? "Sentiero" : "Pista" };
      return field;
    });
  }
  function validateAssignment(member, branch, values) {
    if (!["L/C", "E/G"].includes(branch)) return;
    const key = M.unitField(branch), name = values[key];
    if (!name) return;
    const unit = find(branch, name);
    const old = member.values[branch] || {};
    const changed = member.branch !== branch || M.unitKey(old[key]) !== M.unitKey(name) || old.ruolo !== values.ruolo;
    if (unit?.hidden && changed) fail(409, "Il gruppo e nascosto: ripristinalo prima di assegnare soci.");
    if (changed && M.unitRoles(branch).slice(0, 2).includes(values.ruolo)) {
      const year = db.prepare(`SELECT max(c.year) AS year FROM member_censuses c
        JOIN people p ON p.id=c.person_id WHERE p.census_code!=?`).get(ADMIN_CODE).year || String(new Date().getFullYear());
      const occupied = db.prepare(`SELECT v.person_id,v.data FROM member_values v
        JOIN member_profiles m ON m.person_id=v.person_id JOIN people p ON p.id=v.person_id
        WHERE v.branch=? AND m.branch=? AND v.person_id!=? AND p.census_code!=?`)
        .all(branch, branch, member.id, ADMIN_CODE).some(row => {
          const other = JSON.parse(row.data);
          const censuses = db.prepare("SELECT year,data FROM member_censuses WHERE person_id=? ORDER BY year DESC").all(row.person_id)
            .map(row => ({ year: row.year, ...JSON.parse(row.data) }));
          return M.unitKey(other[key]) === M.unitKey(name) && other.ruolo === values.ruolo &&
            !M.longSuspended({ censuses }, year);
        });
      if (occupied) fail(409, "Questo posto e occupato: sposta prima il capo o il vice attuale.");
    }
    const target = unit || ensure(branch, name);
    values[key] = target.name;
  }
  const color = value => {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) fail(400, "Colore non valido");
    return value.toLowerCase();
  };
  function unitColor(branch, name, value) {
    const result = color(value);
    const expected = Object.entries(M.sestigliaColors).find(([key]) => M.unitKey(key) === M.unitKey(name))?.[1];
    if (branch === "L/C" && expected && result !== expected)
      fail(400, "Il colore della sestiglia deve corrispondere al suo nome.");
    return result;
  }
  function emblem(value) {
    if (value === "") return "";
    if (typeof value !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
      fail(400, "Usa un simbolo PNG, JPEG o WebP tramite il caricamento immagine.");
    const bytes = Buffer.from(value.slice("data:image/png;base64,".length), "base64");
    if (bytes.length > 256 * 1024 || bytes.length < 24 ||
        !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.toString("ascii", 12, 16) !== "IHDR" ||
        !bytes.readUInt32BE(16) || bytes.readUInt32BE(16) > 512 ||
        !bytes.readUInt32BE(20) || bytes.readUInt32BE(20) > 512)
      fail(400, "Il simbolo deve essere un PNG fino a 512 pixel e 256 KiB.");
    return value;
  }
  async function handle(route, request, response, context) {
    const { body, send, access, transaction, get, requireRevision, writeValues, writeProfile } = context;
    if (route === "/api/members/lc-environment" && request.method === "PATCH") {
      const value = await body(request, 4096);
      access("L/C");
      if (!Object.hasOwn(M.lcMoments, value?.environment)) fail(400, "Ambiente L/C non valido");
      transaction(() => {
        const old = configuration();
        if (value.revision !== old.revision) fail(409, "Ambiente cambiato: ricarica prima di salvare.");
        if (old.environment === value.environment) return;
        const oldRoles = M.unitRoles("L/C", old.environment), nextRoles = M.unitRoles("L/C", value.environment);
        for (const row of db.prepare("SELECT person_id,data FROM member_values WHERE branch='L/C'").all()) {
          const values = JSON.parse(row.data);
          const index = M.lcMoments[old.environment].indexOf(values.progressione);
          let changed = false;
          if (index >= 0) { values.progressione = M.lcMoments[value.environment][index]; changed = true; }
          if (values.ruolo === oldRoles[3]) { values.ruolo = nextRoles[3]; changed = true; }
          if (!changed) continue;
          db.prepare("UPDATE member_values SET data=? WHERE person_id=? AND branch='L/C'")
            .run(JSON.stringify(values), row.person_id);
          recordAssignment(row.person_id, "L/C", values);
          db.prepare("UPDATE member_profiles SET revision=revision+1 WHERE person_id=?").run(row.person_id);
        }
        db.prepare("UPDATE member_branch_settings SET environment=?,revision=revision+1 WHERE branch='L/C'").run(value.environment);
      });
      send(response, 200, { ok: true }); return true;
    }
    if (route === "/api/members/units" && request.method === "POST") {
      const value = await body(request, 360 * 1024);
      access(value?.branch);
      if (!["L/C", "E/G"].includes(value?.branch)) fail(400, "Sestiglie e squadriglie sono disponibili solo in L/C ed E/G.");
      const name = groupName(value.name, 2000);
      const unit = transaction(() => {
        let unit = find(value.branch, name);
        if (unit && !unit.hidden) fail(409, "Esiste gia un gruppo con questo nome.");
        if (!unit) {
          if (value.branch === "E/G" && !M.patrolIdentity(name))
            fail(400, "Nome fuori catalogo: aggiungi prima i colori della squadriglia nel codice.");
          unit = ensure(value.branch, name);
          const firstColor = value.color === undefined ? unit.color : unitColor(value.branch, name, value.color);
          const secondColor = value.branch === "L/C" || value.color2 === undefined ? unit.color2 : color(value.color2);
          const image = value.branch === "L/C" || value.emblem === undefined ? "" : emblem(value.emblem);
          db.prepare("UPDATE member_units SET color=?,color2=?,emblem=? WHERE id=?")
            .run(firstColor, secondColor, image, unit.id);
        }
        else db.prepare("UPDATE member_units SET hidden=0,revision=revision+1 WHERE id=?").run(unit.id);
        return all().find(item => item.id === unit.id);
      });
      send(response, 201, { unit }); return true;
    }
    const assignment = /^\/api\/members\/units\/assign$/.test(route);
    if (assignment && request.method === "PATCH") {
      const value = await body(request, 4096);
      transaction(() => {
        if (!Number.isSafeInteger(value?.memberId) || value.memberId <= 0) fail(400, "Socio non valido");
        const member = get(value.memberId);
        access(member.branch);
        requireRevision(member, value.revision);
        if (!member.revision || member.kind !== "ragazzo" || !["L/C", "E/G"].includes(member.branch))
          fail(400, "Seleziona un ragazzo con una scheda completa in L/C o E/G.");
        const values = { ...(member.values[member.branch] || {}) };
        const key = M.unitField(member.branch);
        if (value.unitId === null) { values[key] = ""; values.ruolo = ""; }
        else {
          if (!Number.isSafeInteger(value.unitId) || value.unitId <= 0) fail(400, "Gruppo non valido");
          const unit = db.prepare("SELECT * FROM member_units WHERE id=?").get(value.unitId);
          if (!unit || unit.hidden) fail(409, "Gruppo non disponibile: ricarica.");
          access(unit.branch);
          if (unit.branch !== member.branch) fail(400, "Il gruppo appartiene a un'altra branca.");
          if (!M.unitRoles(member.branch, configuration().environment).includes(value.role)) fail(400, "Ruolo non valido");
          values[key] = unit.name;
          values.ruolo = value.role;
        }
        writeValues(member, member.branch, values);
        writeProfile(member, member.branch, member.profile);
      });
      send(response, 200, { ok: true }); return true;
    }
    const match = /^\/api\/members\/units\/(\d+)$/.exec(route);
    if (match && request.method === "PATCH") {
      const value = await body(request, 360 * 1024);
      if (!Number.isSafeInteger(Number(match[1]))) fail(400, "Gruppo non valido");
      const unit = db.prepare("SELECT * FROM member_units WHERE id=?").get(Number(match[1]));
      if (!unit) fail(404, "Gruppo non trovato");
      access(unit.branch);
      if (value?.revision !== unit.revision) fail(409, "Gruppo modificato: ricarica prima di salvare.");
      if (typeof value.hidden !== "boolean") fail(400, "Visibilita non valida");
      const next = {
        color: value.color === undefined ? unit.color : unitColor(unit.branch, unit.name, value.color),
        color2: unit.branch === "L/C" ? unit.color2 : value.color2 === undefined ? unit.color2 : color(value.color2),
        emblem: unit.branch === "L/C" ? "" : value.emblem === undefined ? unit.emblem : emblem(value.emblem),
      };
      db.prepare("UPDATE member_units SET color=?,color2=?,emblem=?,hidden=?,revision=revision+1 WHERE id=?")
        .run(next.color, next.color2, next.emblem, Number(value.hidden), unit.id);
      send(response, 200, { ok: true }); return true;
    }
    return false;
  }
  return { all, configuration, definitions, validateAssignment, handle, recordAssignment, checkpoint, history };
}
module.exports = { createMemberUnits };
