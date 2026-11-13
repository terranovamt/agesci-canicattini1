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
  assert.equal(M.transposeChordPro("{key: Am}\n[Am]nota", 2), "{key: Bm}\n[Bm]nota");
  assert.equal(M.transposeChordPro("{key:Am}\n[Am]nota", 0), "{key:Am}\n[Am]nota");
  assert.equal(M.transposeChordPro("[N.C.]pausa", 5), "[N.C.]pausa");
  assert.equal(M.matchesSearch({ title: "Canzióne di prova" }, "canzione"), true);
  assert.equal(M.secondsPerLine({ bpm: 120, meter: "4/4", barsPerLine: 2 }), 4);
  assert.equal(M.secondsPerLine({ bpm: 120, meter: "6/8", barsPerLine: 2 }), 6);
  assert.equal(M.secondsPerLine({ bpm: null, meter: "3/4", barsPerLine: 2 }), M.DEFAULT_SECONDS_PER_LINE);
  assert.equal(M.secondsPerLine({ bpm: 120, meter: "4/4", barsPerLine: 2 }, 50), 2);
  assert.throws(() => M.secondsPerLine({ bpm: 120, meter: "4/4", barsPerLine: 2 }, 201), RangeError);
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

test("public Canzoniere CRUD is admin-only for writes and public for reading", async () => {
  const directory = await temporaryDirectory("canzoniere-api-");
  let app;
  try {
    app = await openServer(directory);
    assert.equal((await app.api("", "GET", undefined, "")).status, 200);
    assert.equal((await app.api("/songs", "POST", demoSong(), "")).status, 403);
    const adminCookie = await app.login();
    const configuredPeople = await (await app.request("/api/people", "GET", undefined, adminCookie)).json();
    const chief = configuredPeople.people.find((person) => person.code === "7654321");
    assert.equal((await app.request("/api/people/" + chief.id, "PATCH", { serviceBranch: "E/G" }, adminCookie)).status, 200);
    assert.equal((await app.request("/api/auth/view-as", "POST", { personId: chief.id }, adminCookie)).status, 200);
    assert.equal((await app.api("/songs", "POST", demoSong(), adminCookie)).status, 403);
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
    const deniedWrites = [
      ["POST", "/songs", demoSong()],
      ["PATCH", "/songs/" + song.slug, { revision: 2, title: "No" }],
      ["DELETE", "/songs/" + song.slug, { revision: 2 }],
      ["POST", "/tags", { name: "No", category: "altro" }],
      ["PATCH", "/tags/tag-demo", { revision: 1, name: "No" }],
      ["DELETE", "/tags/tag-demo", { revision: 1 }],
      ["POST", "/albums", { title: "No" }],
      ["PATCH", "/albums/album-demo", { revision: 1, title: "No" }],
      ["DELETE", "/albums/album-demo", { revision: 1 }],
      ["POST", "/presets", { title: "No" }],
      ["PATCH", "/presets/preset-demo", { revision: 1, title: "No" }],
      ["DELETE", "/presets/preset-demo", { revision: 1 }],
      ["POST", "/playlists", { title: "No" }],
      ["PATCH", "/playlists/scaletta-pubblica", { revision: 2, title: "No" }],
      ["DELETE", "/playlists/scaletta-pubblica", { revision: 2 }],
    ];
    for (const [method, route, value] of deniedWrites)
      assert.equal((await app.api(route, method, value)).status, 403, method + " " + route);
    assert.equal((await app.api("/songs", "GET")).status, 200);

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
    const allPlaylists = await (await app.api("/playlists", "GET", undefined, adminCookie)).json();
    const playlist = allPlaylists.find((item) => item.slug === "scaletta-pubblica");
    assert.deepEqual(playlist.songSlugs, []);
    assert.equal(playlist.published, false);
    assert.equal((await app.api("/songs/" + song.slug, "GET", undefined, "")).status, 404);

    assert.equal((await app.api("/presets/preset-demo", "DELETE", { revision: preset.revision }, adminCookie)).status, 200);
    assert.equal((await app.api("/playlists/scaletta-pubblica", "DELETE", { revision: playlist.revision }, adminCookie)).status, 200);
    const draft = allPlaylists.find((item) => item.slug === "scaletta-bozza");
    assert.equal((await app.api("/playlists/scaletta-bozza", "DELETE", { revision: draft.revision }, adminCookie)).status, 200);
    assert.equal((await app.api("/tags/tag-demo", "DELETE", { revision: 1 }, adminCookie)).status, 404);
    assert.equal((await app.api("/unknown", "POST", {})).status, 404);
  } finally {
    if (app) await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
