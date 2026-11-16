const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { createNasServer } = require("../server/nas.cjs");
const M = require("../assets/js/canzoniere-model.js");

const password = "Canzoniere-test-password1!";
const basePath = "/agesci-canicattini1";

async function openServer(directory) {
  const server = await createNasServer({
    dataDir: directory,
    password,
    censusCodes: "7654321",
    basePath,
    publicOrigin: "http://localhost",
    secureCookie: false,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = async (route, method = "GET", value, session = cookie) => {
    const response = await fetch(origin + basePath + route, {
      method,
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
        ...(session ? { Cookie: session } : {}),
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
    return response;
  };
  return {
    api: (route = "", method = "GET", value, session = cookie) =>
      request("/api/canzoniere" + route, method, value, session),
    request,
    async login(code = "23816938") {
      const response = await request("/api/auth/login", "POST", {
        code,
        password,
        confirmation: password,
        temporary: "Canicattini1",
      }, "");
      assert.equal(response.status, 200, await response.clone().text());
      cookie = response.headers.get("set-cookie").split(";")[0];
      return cookie;
    },
    async close() {
      server.stop();
      await once(server, "close");
    },
  };
}

async function temporaryDirectory(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

const demoSong = (overrides = {}) => ({
  slug: "canzone-demo",
  title: "Canzióne Demo",
  author: "Autore fittizio",
  albumSlug: "album-demo",
  text: "[Am]Riga di prova\n[G]Seconda riga",
  key: "Am",
  bpm: 90,
  meter: "4/4",
  capo: 0,
  barsPerLine: 2,
  notes: "",
  source: "Dati sintetici",
  rights: "autorizzato",
  tagSlugs: ["ingresso", "eg", "tag-demo"],
  ...overrides,
});

test("ChordPro parsing, transposition, accent-insensitive search and scroll timing", () => {
  const lines = M.parseChordPro("[Am]Sole [G]alto\r\n{comment: nota}\n[C/E]");
  assert.deepEqual(lines[0], {
    lyric: "Sole alto",
    chords: [
      { chord: "Am", position: 0 },
      { chord: "G", position: 5 },
    ],
  });
  assert.deepEqual(lines[1], {
    lyric: "",
    chords: [],
    directive: { name: "comment", value: "nota" },
  });
  assert.deepEqual(lines[2], { lyric: "", chords: [{ chord: "C/E", position: 0 }] });
  assert.equal(M.transposeChord("Bb", 2), "C");
  assert.equal(M.transposeKey("Am", 2), "Bm");
  assert.equal(M.transposeChordPro("[Bb]Piano [F#m7/C#]alto", 2), "[C]Piano [G#m7/D#]alto");
  assert.equal(M.transposeChord("Dom", 2), "Rem");
  assert.equal(M.transposeChord("Fa#m7/Do#", 2), "Sol#m7/Re#");
  assert.equal(M.translateChordPro("[Do]Sole [Rem7] [Fa#m7/Do#]\n{key: Sib}", "en"),
    "[C]Sole [Dm7] [F#m7/C#]\n{key: Bb}");
  assert.equal(M.translateChordPro("[C]Sole [Dm7] [F#m7/C#]\n{key: Bb}", "it"),
    "[Do]Sole [Rem7] [Fa#m7/Do#]\n{key: Sib}");
  assert.equal(M.detectChordNotation("[Do]Sole [C]"), "it");
  assert.equal(M.detectChordNotation("[C]Sole [Dm7]"), "en");
  assert.equal(M.detectChordNotation("{key: Sib}"), "it");
  assert.deepEqual(M.parseChordPro("[Do]Sole [Fa#m7/Do#]alto")[0], {
    lyric: "Sole alto",
    chords: [
      { chord: "Do", position: 0 },
      { chord: "Fa#m7/Do#", position: 5 },
    ],
  });
  assert.equal(M.transposeChordPro("{key: Am}\n[Am]nota", 2), "{key: Bm}\n[Bm]nota");
  assert.equal(M.transposeChordPro("{key:Am}\n[Am]nota", 0), "{key:Am}\n[Am]nota");
  assert.equal(M.transposeChordPro("[N.C.]pausa", 5), "[N.C.]pausa");
  assert.equal(M.importChordText("C     G\nHello, world"), "[C]Hello,[G] world");
  assert.equal(M.importChordText("[Am]Testo già in ChordPro"), "[Am]Testo già in ChordPro");
  const imported = M.parseChordProDocument([
    "{title: Brano importato}",
    "{subtitle: Sottotitolo}",
    "{artist: Canti Scout}",
    "{composer: Compositore}",
    "{lyricist: Paroliere}",
    "{album: Album importato}",
    "{year: 2001}",
    "{key: Do}",
    "{tempo: 110 (Stimato)}",
    "{time: 4/4}",
    "{capo: Nessuno}",
    "{source: Fonte di prova}",
    "{comment: Nota di prova}",
    "{start_of_verse: Strofa}",
    "[Do]Riga di prova",
    "{end_of_verse}",
    "# Fonte verificabile",
    "# ====================",
  ].join("\n"));
  assert.deepEqual({
    title: imported.title,
    author: imported.author,
    albumTitle: imported.albumTitle,
    key: imported.key,
    bpm: imported.bpm,
    meter: imported.meter,
    capo: imported.capo,
    source: imported.source,
    notes: imported.notes,
    text: imported.text,
  }, {
    title: "Brano importato",
    author: "Canti Scout",
    albumTitle: "Album importato",
    key: "C",
    bpm: 110,
    meter: "4/4",
    capo: 0,
    source: "Fonte di prova",
    notes: [
      "Sottotitolo: Sottotitolo",
      "Compositore: Compositore",
      "Paroliere: Paroliere",
      "Anno: 2001",
      "Indicazione tempo: 110 (Stimato)",
      "Nota di prova",
      "Fonte verificabile",
    ].join("\n"),
    text: "{start_of_verse: Strofa}\n[Do]Riga di prova\n{end_of_verse}",
  });
  assert.equal(M.parseChordProDocument("[Am]Testo semplice").text, "[Am]Testo semplice");
  const descriptiveKey = M.parseChordProDocument("{key: LA maggiore (arrangiamento pubblicato)}");
  assert.equal(descriptiveKey.key, "A");
  assert.equal(descriptiveKey.notes, "Tonalità indicata nel file: LA maggiore (arrangiamento pubblicato)");
  assert.match(M.formatChordPro({
    title: "Titolo demo",
    author: "Autore demo",
    key: "C",
    bpm: 90,
    meter: "4/4",
    capo: 0,
    rights: "da verificare",
    text: "[C]Testo",
  }), /\{title: Titolo demo\}[\s\S]*\[C\]Testo/);
  assert.equal(M.matchesSearch({ title: "Canzióne di prova" }, "canzione"), true);
  assert.equal(M.secondsPerLine({ bpm: 120, meter: "4/4", barsPerLine: 2 }), 4);
  assert.equal(M.secondsPerLine({ bpm: 120, meter: "6/8", barsPerLine: 2 }), 6);
  assert.equal(M.secondsPerLine({ bpm: null, meter: "3/4", barsPerLine: 2 }), M.DEFAULT_SECONDS_PER_LINE);
  assert.equal(M.secondsPerLine({ bpm: 120, meter: "4/4", barsPerLine: 2 }, 50), 8);
  assert.equal(M.secondsPerLine({ bpm: 120, meter: "4/4", barsPerLine: 2 }, 150), 8 / 3);
  assert.throws(() => M.secondsPerLine({ bpm: 120, meter: "4/4", barsPerLine: 2 }, 201), RangeError);
});

test("admin song editor wires chord translation and bounds mobile text areas", async () => {
  const [html, css, script] = await Promise.all([
    fs.readFile(path.join(__dirname, "../area-riservata/canzoniere.html"), "utf8"),
    fs.readFile(path.join(__dirname, "../assets/css/canzoniere-admin.css"), "utf8"),
    fs.readFile(path.join(__dirname, "../assets/js/canzoniere-admin.js"), "utf8"),
  ]);
  assert.match(html, /id="admin-song-translate-chords"[^>]*aria-label="Converti gli accordi tra notazione italiana e inglese"/);
  assert.match(html, /id="admin-leader-tools-panel"/);
  assert.match(html, /id="leader-playlist-add-form"/);
  assert.match(html, /id="leader-playlist-moment"/);
  assert.match(script, /request\("\/manage"\)/);
  assert.match(script, /M\.detectChordNotation\(field\.value\)/);
  assert.match(script, /M\.translateChordPro\(field\.value, notation\)/);
  assert.match(script, /addEventListener\("click", translateSongChords\)/);
  assert.match(script, /function renderLeaderTools\(\)/);
  const textareaRules = /#admin-song-form textarea\s*\{([^}]+)\}/s.exec(css)?.[1];
  assert.ok(textareaRules);
  assert.match(textareaRules, /width:\s*100%/);
  assert.match(textareaRules, /max-width:\s*100%/);
  assert.match(textareaRules, /max-height:\s*min\(45vh,\s*360px\)/);
  assert.match(textareaRules, /overflow:\s*auto/);
});

test("Canzoniere migration preserves the existing SQLite database and runs only once", async () => {
  const directory = await temporaryDirectory("canzoniere-migration-");
  let app;
  try {
    const legacy = new DatabaseSync(path.join(directory, "site.sqlite"));
    legacy.exec(`
      CREATE TABLE content(name TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO content(name,value) VALUES('legacy-check','keep-me');
    `);
    legacy.close();

    app = await openServer(directory);
    const catalog = await (await app.api("", "GET", undefined, "")).json();
    assert.equal(catalog.tags.length, 13);
    assert.equal(catalog.presets.length, 2);
    assert.deepEqual(catalog.tags.filter((tag) => tag.category === "branca").map((tag) => tag.name), ["E/G", "L/C", "R/S"]);
    await app.close();
    app = null;

    const database = new DatabaseSync(path.join(directory, "site.sqlite"));
    assert.equal(database.prepare("SELECT value FROM content WHERE name='legacy-check'").get().value, "keep-me");
    assert.equal(database.prepare("SELECT count(*) AS total FROM canzoniere_migrations").get().total, 1);
    database.prepare("DELETE FROM canzoniere_tags WHERE slug='ingresso'").run();
    database.close();

    app = await openServer(directory);
    const tags = await (await app.api("/tags", "GET", undefined, "")).json();
    assert.equal(tags.some((tag) => tag.slug === "ingresso"), false);
    assert.equal(tags.length, 12);
  } finally {
    if (app) await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("branch chiefs manage the Canzoniere while public playlists expose only published records", async () => {
  const directory = await temporaryDirectory("canzoniere-api-");
  let app;
  try {
    app = await openServer(directory);
    assert.equal((await app.api("", "GET", undefined, "")).status, 200);
    assert.equal((await app.api("/songs", "POST", demoSong(), "")).status, 403);
    assert.equal((await app.api("/manage", "GET", undefined, "")).status, 403);
    const adminCookie = await app.login();
    const configuredPeople = await (await app.request("/api/people", "GET", undefined, adminCookie)).json();
    const chief = configuredPeople.people.find((person) => person.code === "7654321");
    assert.equal((await app.request("/api/people/" + chief.id, "PATCH", { serviceBranch: "E/G" }, adminCookie)).status, 200);
    assert.equal((await app.request("/api/auth/view-as", "POST", { personId: chief.id }, adminCookie)).status, 200);
    assert.equal((await app.api("/manage", "GET", undefined, adminCookie)).status, 200);

    assert.equal((await app.api("/tags", "POST", {
      slug: "chief-tag", name: "Tag capo", category: "momento",
    }, adminCookie)).status, 201);
    assert.equal((await app.api("/albums", "POST", {
      slug: "chief-album", title: "Album capo", author: "Capi", year: 2026,
    }, adminCookie)).status, 201);
    const chiefSongResponse = await app.api("/songs", "POST", demoSong({
      slug: "canzone-capo", title: "Canzone capo", albumSlug: "chief-album", tagSlugs: ["chief-tag"],
    }), adminCookie);
    assert.equal(chiefSongResponse.status, 201);
    const chiefSong = await chiefSongResponse.json();
    assert.equal((await app.api("/songs/" + chiefSong.slug, "PATCH", {
      revision: chiefSong.revision, title: "Canzone capo modificata",
    }, adminCookie)).status, 200);
    assert.equal((await app.api("/presets", "POST", {
      slug: "preset-capo", title: "Preset capo", tagSlugs: ["chief-tag"], songSlugs: [chiefSong.slug], limit: 5,
    }, adminCookie)).status, 201);
    assert.equal((await app.api("/playlists", "POST", {
      slug: "scaletta-capo-bozza", title: "Scaletta capo bozza",
      songSlugs: [chiefSong.slug], published: false,
    }, adminCookie)).status, 201);
    const chiefPlaylist = await (await app.api("/playlists", "POST", {
      slug: "scaletta-capo-pubblicata", title: "Scaletta capo pubblicata",
      songSlugs: [chiefSong.slug], published: false,
    }, adminCookie)).json();
    const chiefPublished = await app.api("/playlists/" + chiefPlaylist.slug, "PATCH", {
      revision: chiefPlaylist.revision, published: true,
    }, adminCookie);
    assert.equal(chiefPublished.status, 200);
    const managerCatalog = await (await app.api("/manage", "GET", undefined, adminCookie)).json();
    assert.ok(managerCatalog.playlists.some(item => item.slug === "scaletta-capo-bozza"));
    const chiefPublicCatalog = await (await app.api("", "GET", undefined, adminCookie)).json();
    assert.ok(!chiefPublicCatalog.playlists.some(item => item.slug === "scaletta-capo-bozza"));
    assert.ok(chiefPublicCatalog.playlists.some(item => item.slug === "scaletta-capo-pubblicata"));
    assert.equal((await app.api("/playlists/scaletta-capo-bozza", "GET", undefined, adminCookie)).status, 404);
    assert.equal((await app.api("/playlists", "GET", undefined, "")).status, 200);
    assert.equal((await app.api("/playlists/scaletta-capo-bozza", "DELETE", { revision: 1 }, adminCookie)).status, 200);
    assert.equal((await app.api("/playlists/scaletta-capo-pubblicata", "DELETE", { revision: 2 }, adminCookie)).status, 200);
    assert.equal((await app.api("/presets/preset-capo", "DELETE", { revision: 1 }, adminCookie)).status, 200);
    assert.equal((await app.api("/songs/" + chiefSong.slug, "DELETE", { revision: 2 }, adminCookie)).status, 200);
    assert.equal((await app.api("/albums/chief-album", "DELETE", { revision: 1 }, adminCookie)).status, 200);
    assert.equal((await app.api("/tags/chief-tag", "DELETE", { revision: 1 }, adminCookie)).status, 200);
    assert.equal((await app.request("/api/auth/view-as", "DELETE", undefined, adminCookie)).status, 200);

    const albumResponse = await app.api("/albums", "POST", {
      slug: "album-demo",
      title: "Album demo",
      author: "Gruppo fittizio",
      year: 2026,
    });
    assert.equal(albumResponse.status, 201);
    const tagResponse = await app.api("/tags", "POST", {
      slug: "tag-demo",
      name: "Tag demo",
      category: "momento",
    });
    assert.equal(tagResponse.status, 201);
    const songResponse = await app.api("/songs", "POST", demoSong());
    assert.equal(songResponse.status, 201);
    const song = await songResponse.json();
    assert.equal(song.revision, 1);
    assert.equal(song.text, "[Am]Riga di prova\n[G]Seconda riga");

    const presetResponse = await app.api("/presets", "POST", {
      slug: "preset-demo",
      title: "Preset demo",
      tagSlugs: ["tag-demo"],
      songSlugs: [song.slug],
      limit: 5,
    });
    assert.equal(presetResponse.status, 201);
    const playlistResponse = await app.api("/playlists", "POST", {
      slug: "scaletta-pubblica",
      title: "Scaletta demo",
      description: "",
      songSlugs: [song.slug],
      published: true,
    });
    assert.equal(playlistResponse.status, 201);
    const draftResponse = await app.api("/playlists", "POST", {
      slug: "scaletta-bozza",
      title: "Bozza demo",
      songSlugs: [],
      published: false,
    });
    assert.equal(draftResponse.status, 201);

    const publicCatalog = await (await app.api("", "GET", undefined, "")).json();
    assert.equal(publicCatalog.playlists.length, 1);
    assert.equal(publicCatalog.playlists[0].slug, "scaletta-pubblica");
    assert.equal((await app.api("/playlists/scaletta-bozza", "GET", undefined, "")).status, 404);
    const listed = await (await app.api("/songs?q=canzione", "GET", undefined, "")).json();
    assert.equal(listed.total, 1);
    assert.equal(listed.songs[0].slug, song.slug);
    assert.equal(Object.hasOwn(listed.songs[0], "text"), false);
    const lyricSearch = await (await app.api("/songs?q=riga%20di%20prova", "GET", undefined, "")).json();
    assert.equal(lyricSearch.total, 1);
    const filtered = await (await app.api(
      "/songs?tag=tag-demo&branch=E%2FG&album=album-demo",
      "GET",
      undefined,
      "",
    )).json();
    assert.equal(filtered.total, 1);
    assert.equal((await (await app.api("/songs/" + song.slug, "GET", undefined, "")).json()).text, song.text);

    const updatedSongResponse = await app.api("/songs/" + song.slug, "PATCH", {
      revision: 1,
      title: "Titolo demo aggiornato",
    });
    assert.equal(updatedSongResponse.status, 200);
    const updatedSong = await updatedSongResponse.json();
    assert.equal(updatedSong.revision, 2);
    assert.equal((await app.api("/songs/" + song.slug, "PATCH", { revision: 1, title: "Titolo obsoleto" })).status, 409);

    const updatedPlaylist = await (await app.api("/playlists/scaletta-pubblica", "PATCH", {
      revision: 1,
      title: "Scaletta aggiornata",
    })).json();
    assert.equal(updatedPlaylist.revision, 2);
    assert.equal((await app.api("/songs", "POST", demoSong({ rights: "diritti ignoti" }))).status, 400);
    assert.equal((await app.api("/songs", "POST", demoSong({ meter: "5/4" }))).status, 400);

    await app.login("7654321");
    const directChiefSong = await (await app.api("/songs", "POST", demoSong({
      slug: "canzone-capo-diretto", title: "Canzone capo diretto", tagSlugs: [],
    }))).json();
    assert.equal(directChiefSong.slug, "canzone-capo-diretto");
    assert.equal((await app.api("/manage", "GET")).status, 200);
    assert.equal((await app.api("/songs/" + directChiefSong.slug, "DELETE", { revision: directChiefSong.revision })).status, 200);

    await app.login("23816938");
    const deletedAlbum = await app.api("/albums/album-demo", "DELETE", { revision: 1 }, adminCookie);
    assert.equal(deletedAlbum.status, 200);
    let currentSong = await (await app.api("/songs/" + song.slug, "GET", undefined, adminCookie)).json();
    assert.equal(currentSong.albumSlug, null);
    await app.api("/tags/tag-demo", "DELETE", { revision: 1 }, adminCookie);
    currentSong = await (await app.api("/songs/" + song.slug, "GET", undefined, adminCookie)).json();
    assert.equal(currentSong.tagSlugs.includes("tag-demo"), false);
    const deletedSong = await app.api("/songs/" + song.slug, "DELETE", { revision: currentSong.revision }, adminCookie);
    assert.equal(deletedSong.status, 200);
    const updatedPresets = await (await app.api("/presets", "GET", undefined, adminCookie)).json();
    const preset = updatedPresets.find((item) => item.slug === "preset-demo");
    assert.deepEqual(preset.songSlugs, []);
    assert.equal(preset.tagSlugs.includes("tag-demo"), false);
    const allPlaylists = await (await app.api("/manage", "GET", undefined, adminCookie)).json();
    const playlist = allPlaylists.playlists.find((item) => item.slug === "scaletta-pubblica");
    assert.deepEqual(playlist.songSlugs, []);
    assert.equal(playlist.published, false);
    assert.equal((await app.api("/songs/" + song.slug, "GET", undefined, "")).status, 404);

    assert.equal((await app.api("/presets/preset-demo", "DELETE", { revision: preset.revision }, adminCookie)).status, 200);
    assert.equal((await app.api("/playlists/scaletta-pubblica", "DELETE", { revision: playlist.revision }, adminCookie)).status, 200);
    const draft = allPlaylists.playlists.find((item) => item.slug === "scaletta-bozza");
    assert.equal((await app.api("/playlists/scaletta-bozza", "DELETE", { revision: draft.revision }, adminCookie)).status, 200);
    assert.equal((await app.api("/tags/tag-demo", "DELETE", { revision: 1 }, adminCookie)).status, 404);
    assert.equal((await app.api("/unknown", "POST", {})).status, 404);
  } finally {
    if (app) await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
