"use strict";

const M = require("../assets/js/canzoniere-model.js");

const BASE = "/api/canzoniere";
const TABLES = Object.freeze({
  songs: "canzoniere_songs",
  tags: "canzoniere_tags",
  albums: "canzoniere_albums",
  presets: "canzoniere_presets",
  playlists: "canzoniere_playlists",
});
const RIGHTS = new Set(["pubblico dominio", "autorizzato", "da verificare"]);
const CATEGORIES = new Set(["momento", "branca", "altro"]);
const BRANCH_TAGS = Object.freeze({ "L/C": "lc", "E/G": "eg", "R/S": "rs" });

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, max, label) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0"))
    fail(400, label + " mancante o non valido");
  return value.trim();
}

function optionalText(value, max, label) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > max || value.includes("\0"))
    fail(400, label + " non valido");
  return value.trim();
}

function safeSlug(value) {
  if (typeof value !== "string" || value.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    fail(400, "Slug non valido");
  return value;
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, label + " non valido");
  return value;
}

function stringList(value, max, label) {
  if (!Array.isArray(value) || value.length > max) fail(400, label + " non valido");
  const result = value.map(safeSlug);
  if (new Set(result).size !== result.length) fail(400, label + " duplicato");
  return result;
}

function assertKeys(value, allowed) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    fail(400, "Campi della richiesta non validi");
}

function createCanzoniere(db, people) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canzoniere_migrations (
      version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS canzoniere_songs (
      slug TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS canzoniere_tags (
      slug TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS canzoniere_albums (
      slug TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS canzoniere_presets (
      slug TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS canzoniere_playlists (
      slug TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    );
  `);

  const transaction = (run) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const migration = db.prepare("SELECT version FROM canzoniere_migrations WHERE version=1").get();
  if (!migration) {
    transaction(() => {
      for (const tag of M.DEFAULT_TAGS)
        db.prepare("INSERT OR IGNORE INTO canzoniere_tags(slug,data) VALUES(?,?)")
          .run(tag.slug, JSON.stringify({ name: tag.name, category: tag.category }));
      for (const preset of M.DEFAULT_PRESETS) {
        const { slug, ...data } = preset;
        db.prepare("INSERT OR IGNORE INTO canzoniere_presets(slug,data) VALUES(?,?)")
          .run(slug, JSON.stringify(data));
      }
      db.prepare("INSERT INTO canzoniere_migrations(version,applied_at) VALUES(1,?)").run(Date.now());
    });
  }

  const row = (kind, slug) => {
    const entry = db.prepare(`SELECT slug,data,revision FROM ${TABLES[kind]} WHERE slug=?`).get(slug);
    return entry ? { slug: entry.slug, data: JSON.parse(entry.data), revision: entry.revision } : null;
  };
  const record = (kind, slug) => {
    const entry = row(kind, slug);
    return entry ? { slug: entry.slug, ...entry.data, revision: entry.revision } : null;
  };
  const records = (kind) =>
    db.prepare(`SELECT slug,data,revision FROM ${TABLES[kind]} ORDER BY slug`).all()
      .map((entry) => ({ slug: entry.slug, ...JSON.parse(entry.data), revision: entry.revision }));
  const slugFor = (kind, value, label) => {
    if (value.slug !== undefined) return safeSlug(value.slug);
    const base = M.slugify(label) || "elemento";
    let candidate = base;
    for (let suffix = 2; row(kind, candidate); suffix++) candidate = base + "-" + suffix;
    return candidate;
  };
  const checkReferences = (kind, slugs, label) => {
    for (const slug of slugs)
      if (!row(kind, slug)) fail(400, label + " non trovato: " + slug);
  };

  const normalizeSong = (value) => {
    const title = requiredText(value.title, 200, "Titolo");
    const author = optionalText(value.author, 200, "Autore");
    const albumSlug = value.albumSlug === undefined || value.albumSlug === null || value.albumSlug === ""
      ? null
      : safeSlug(value.albumSlug);
    if (albumSlug && !row("albums", albumSlug)) fail(400, "Album non trovato");
    if (typeof value.text !== "string" || value.text.length > 100000 || value.text.includes("\0"))
      fail(400, "Testo ChordPro non valido o troppo lungo");
    const key = optionalText(value.key, 16, "Tonalita");
    if (key && !/^[A-G](?:#|b)?(?:m|maj|min|major|minor|dim|aug)?$/i.test(key))
      fail(400, "Tonalita non valida");
    const bpm = value.bpm === undefined || value.bpm === null || value.bpm === ""
      ? null
      : integer(value.bpm, 20, 300, "BPM");
    const meter = value.meter === undefined ? "4/4" : value.meter;
    if (typeof meter !== "string" || !Object.hasOwn(M.METERS, meter)) fail(400, "Tempo musicale non valido");
    const capo = value.capo === undefined || value.capo === null || value.capo === ""
      ? 0
      : integer(value.capo, 0, 12, "Capotasto");
    const barsPerLine = value.barsPerLine === undefined
      ? 2
      : integer(value.barsPerLine, 1, 16, "Battute per riga");
    const rights = value.rights === undefined ? "da verificare" : value.rights;
    if (typeof rights !== "string" || !RIGHTS.has(rights)) fail(400, "Diritti non validi");
    const tagSlugs = stringList(value.tagSlugs === undefined ? [] : value.tagSlugs, 50, "Tag");
    checkReferences("tags", tagSlugs, "Tag");
    return {
      title,
      author,
      albumSlug,
      text: value.text.replace(/\r\n?/g, "\n"),
      key,
      bpm,
      meter,
      capo,
      barsPerLine,
      notes: optionalText(value.notes, 4000, "Note"),
      source: optionalText(value.source, 1000, "Fonte"),
      rights,
      tagSlugs,
    };
  };
  const normalizeTag = (value) => {
    const name = requiredText(value.name, 80, "Nome tag");
    const category = value.category === undefined ? "altro" : value.category;
    if (typeof category !== "string" || !CATEGORIES.has(category)) fail(400, "Categoria tag non valida");
    return { name, category };
  };
  const normalizeAlbum = (value) => {
    const year = value.year === undefined || value.year === null || value.year === ""
      ? null
      : integer(value.year, 1900, 2200, "Anno album");
    return {
      title: requiredText(value.title, 200, "Titolo album"),
      author: optionalText(value.author, 200, "Autore album"),
      year,
      notes: optionalText(value.notes, 2000, "Note album"),
    };
  };
  const normalizePreset = (value) => {
    const tagSlugs = stringList(value.tagSlugs === undefined ? [] : value.tagSlugs, 50, "Tag preset");
    const songSlugs = stringList(value.songSlugs === undefined ? [] : value.songSlugs, 100, "Canzoni preset");
    checkReferences("tags", tagSlugs, "Tag");
    checkReferences("songs", songSlugs, "Canzone");
    return {
      title: requiredText(value.title, 120, "Titolo preset"),
      tagSlugs,
      songSlugs,
      limit: value.limit === undefined ? 12 : integer(value.limit, 1, 50, "Limite preset"),
    };
  };
  const normalizePlaylist = (value) => {
    const songSlugs = stringList(value.songSlugs === undefined ? [] : value.songSlugs, 100, "Canzoni scaletta");
    checkReferences("songs", songSlugs, "Canzone");
    const published = value.published === undefined ? false : value.published;
    if (typeof published !== "boolean") fail(400, "Pubblicazione scaletta non valida");
    if (published && !songSlugs.length) fail(400, "Una scaletta pubblicata deve contenere almeno una canzone");
    return {
      title: requiredText(value.title, 160, "Titolo scaletta"),
      description: optionalText(value.description, 2000, "Descrizione scaletta"),
      songSlugs,
      published,
    };
  };
  const normalizers = {
    songs: normalizeSong,
    tags: normalizeTag,
    albums: normalizeAlbum,
    presets: normalizePreset,
    playlists: normalizePlaylist,
  };
  const fields = {
    songs: ["title", "author", "albumSlug", "text", "key", "bpm", "meter", "capo", "barsPerLine",
      "notes", "source", "rights", "tagSlugs"],
    tags: ["name", "category"],
    albums: ["title", "author", "year", "notes"],
    presets: ["title", "tagSlugs", "songSlugs", "limit"],
    playlists: ["title", "description", "songSlugs", "published"],
  };
  const labelFor = (kind, value) => kind === "tags" ? value.name : value.title;
  const summarizeSong = (song) => {
    const { text, ...summary } = song;
    return summary;
  };
  const publicPlaylists = (isAdmin) => records("playlists").filter((playlist) => isAdmin || playlist.published);
  const catalog = (isAdmin) => ({
    tags: records("tags"),
    albums: records("albums"),
    presets: records("presets"),
    playlists: publicPlaylists(isAdmin),
  });

  const createRecord = (kind, value) => {
    assertKeys(value, ["slug", ...fields[kind]]);
    const slug = slugFor(kind, value, labelFor(kind, value));
    const data = normalizers[kind](value);
    return transaction(() => {
      if (row(kind, slug)) fail(409, "Slug gia' esistente");
      db.prepare(`INSERT INTO ${TABLES[kind]}(slug,data,revision) VALUES(?,?,1)`)
        .run(slug, JSON.stringify(data));
      return record(kind, slug);
    });
  };
  const updateRecord = (kind, slug, value) => {
    assertKeys(value, ["revision", ...fields[kind]]);
    const revision = integer(value.revision, 1, Number.MAX_SAFE_INTEGER, "Revisione");
    return transaction(() => {
      const current = row(kind, slug);
      if (!current) fail(404, "Elemento non trovato");
      if (current.revision !== revision) fail(409, "Dati modificati: ricarica prima di salvare");
      const data = normalizers[kind]({ ...current.data, ...value });
      const result = db.prepare(`UPDATE ${TABLES[kind]} SET data=?,revision=revision+1 WHERE slug=? AND revision=?`)
        .run(JSON.stringify(data), slug, revision);
      if (!result.changes) fail(409, "Dati modificati: ricarica prima di salvare");
      return record(kind, slug);
    });
  };
  const deleteRecord = (kind, slug, value) => {
    assertKeys(value, ["revision"]);
    const revision = integer(value.revision, 1, Number.MAX_SAFE_INTEGER, "Revisione");
    return transaction(() => {
      const current = row(kind, slug);
      if (!current) fail(404, "Elemento non trovato");
      if (current.revision !== revision) fail(409, "Dati modificati: ricarica prima di eliminare");

      if (kind === "albums") {
        for (const song of records("songs")) {
          if (song.albumSlug !== slug) continue;
          const { revision: songRevision, slug: songSlug, ...data } = song;
          data.albumSlug = null;
          db.prepare("UPDATE canzoniere_songs SET data=?,revision=revision+1 WHERE slug=? AND revision=?")
            .run(JSON.stringify(data), songSlug, songRevision);
        }
      } else if (kind === "tags") {
        for (const song of records("songs")) {
          if (!song.tagSlugs.includes(slug)) continue;
          const { revision: songRevision, slug: songSlug, ...data } = song;
          data.tagSlugs = data.tagSlugs.filter((item) => item !== slug);
          db.prepare("UPDATE canzoniere_songs SET data=?,revision=revision+1 WHERE slug=? AND revision=?")
            .run(JSON.stringify(data), songSlug, songRevision);
        }
        for (const preset of records("presets")) {
          if (!preset.tagSlugs.includes(slug)) continue;
          const { revision: presetRevision, slug: presetSlug, ...data } = preset;
          data.tagSlugs = data.tagSlugs.filter((item) => item !== slug);
          db.prepare("UPDATE canzoniere_presets SET data=?,revision=revision+1 WHERE slug=? AND revision=?")
            .run(JSON.stringify(data), presetSlug, presetRevision);
        }
      } else if (kind === "songs") {
        for (const playlist of records("playlists")) {
          if (!playlist.songSlugs.includes(slug)) continue;
          const { revision: playlistRevision, slug: playlistSlug, ...data } = playlist;
          data.songSlugs = data.songSlugs.filter((item) => item !== slug);
          if (!data.songSlugs.length) data.published = false;
          db.prepare("UPDATE canzoniere_playlists SET data=?,revision=revision+1 WHERE slug=? AND revision=?")
            .run(JSON.stringify(data), playlistSlug, playlistRevision);
        }
        for (const preset of records("presets")) {
          if (!preset.songSlugs.includes(slug)) continue;
          const { revision: presetRevision, slug: presetSlug, ...data } = preset;
          data.songSlugs = data.songSlugs.filter((item) => item !== slug);
          db.prepare("UPDATE canzoniere_presets SET data=?,revision=revision+1 WHERE slug=? AND revision=?")
            .run(JSON.stringify(data), presetSlug, presetRevision);
        }
      }

      db.prepare(`DELETE FROM ${TABLES[kind]} WHERE slug=? AND revision=?`).run(slug, revision);
      return { ok: true };
    });
  };

  const listSongs = (url) => {
    const params = url.searchParams;
    const query = params.get("q") || "";
    if (query.length > 120) fail(400, "Ricerca troppo lunga");
    const tagSlugs = [...params.getAll("tag"), ...params.getAll("tags")]
      .flatMap((value) => value.split(",").filter(Boolean))
      .map(safeSlug);
    if (new Set(tagSlugs).size !== tagSlugs.length) fail(400, "Tag filtro duplicato");
    checkReferences("tags", tagSlugs, "Tag");
    const album = params.get("album");
    if (album) safeSlug(album);
    const branch = params.get("branch");
    if (branch && !Object.hasOwn(BRANCH_TAGS, branch)) fail(400, "Branca filtro non valida");
    const slugsParam = params.get("slugs");
    const requestedSlugs = slugsParam === null
      ? null
      : stringList(slugsParam.split(",").filter(Boolean), 100, "Slug");
    const requestedLimit = params.get("limit");
    const requestedOffset = params.get("offset");
    const limit = requestedLimit === null ? 24 : integer(Number(requestedLimit), 1, 100, "Limite");
    const offset = requestedOffset === null ? 0 : integer(Number(requestedOffset), 0, 1000000, "Offset");
    let songs = records("songs");
    if (requestedSlugs) {
      const bySlug = new Map(songs.map((song) => [song.slug, song]));
      songs = requestedSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);
    }
    songs = songs.filter((song) =>
      M.matchesSearch(song, query) &&
      (!album || song.albumSlug === album) &&
      tagSlugs.every((slug) => song.tagSlugs.includes(slug)) &&
      (!branch || song.tagSlugs.includes(BRANCH_TAGS[branch])));
    const total = songs.length;
    return {
      songs: songs.slice(offset, offset + limit).map(summarizeSong),
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  };

  return {
    async handle(route, request, response, { body, send, sessionId, url }) {
      if (route !== BASE && route !== BASE + "/" && !route.startsWith(BASE + "/")) return false;
      const method = request.method;
      if (!["GET", "HEAD"].includes(method)) {
        const current = people.user(sessionId(request));
        if (!current?.admin) fail(403, "Operazione riservata all'amministratore");
      }
      const isAdmin = () => !!people.user(sessionId(request))?.admin;

      if (method === "GET" && (route === BASE || route === BASE + "/"))
        return send(response, 200, catalog(isAdmin()));

      const match = /^\/api\/canzoniere\/(songs|tags|albums|presets|playlists)(?:\/([a-z0-9-]+))?$/.exec(route);
      if (!match) fail(404, "Risorsa Canzoniere non trovata");
      const kind = match[1];
      const slug = match[2];

      if (method === "GET") {
        if (kind === "songs" && !slug) return send(response, 200, listSongs(url));
        if (kind === "playlists" && !slug) return send(response, 200, publicPlaylists(isAdmin()));
        if (!slug) return send(response, 200, records(kind));
        const result = record(kind, slug);
        if (!result || (kind === "playlists" && !result.published && !isAdmin()))
          fail(404, "Elemento non trovato");
        return send(response, 200, result);
      }

      const value = await body(request, 512 * 1024);
      if (method === "POST" && !slug) return send(response, 201, createRecord(kind, value));
      if (method === "PATCH" && slug) return send(response, 200, updateRecord(kind, slug, value));
      if (method === "DELETE" && slug) return send(response, 200, deleteRecord(kind, slug, value));
      fail(405, "Metodo non consentito");
    },
  };
}

module.exports = { createCanzoniere };
