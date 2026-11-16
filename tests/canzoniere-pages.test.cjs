const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
    this.dataset = {};
    this.value = "";
    this.hidden = false;
    this.textContent = "";
    this.className = "";
  }
  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }
  append(...children) {
    children.forEach((child) => {
      child.parent = this;
      this.children.push(child);
    });
  }
  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
    this[name] = value;
  }
  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }
  focus() {}
  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const matches = [];
    const visit = (node) => {
      if (className && node.className.split(/\s+/).includes(className)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  remove() {
    this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}

function song(number) {
  return {
    slug: "demo-" + number,
    title: number === 0 ? "Canzone <b>demo</b>" : "Canzone " + number,
    author: "Autore fittizio",
    albumSlug: null,
    key: "C",
    bpm: null,
    meter: "4/4",
    tagSlugs: [],
  };
}

test("public Canzoniere shows songs and published playlists, without leader playlist tools", async () => {
  const html = fs.readFileSync(require.resolve("../canzoniere/index.html"), "utf8");
  const css = fs.readFileSync(require.resolve("../assets/css/canzoniere.css"), "utf8");
  assert.doesNotMatch(html, /La tua scaletta|Genera una scaletta|personal-playlist|playlist-generator|quick-presets/);
  assert.match(html, /id="published-playlists"/);
  assert.match(css, /body\.canzoniere-page \.canzoniere-section\s*\{\s*margin:\s*0 0 20px;/);

  const ids = [
    "song-list",
    "song-filters",
    "song-filter-toggle",
    "song-filter-count",
    "song-search",
    "song-tag",
    "song-branch",
    "song-album",
    "song-status",
    "songs-more",
    "songs-retry",
    "clear-song-filters",
    "published-playlist-status",
    "published-playlists",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element(id === "song-list" ? "div" : "input")]));
  elements["song-list"].append(...Array.from({ length: 3 }, () => {
    const node = new Element("article");
    node.className = "loading-skeleton song-skeleton";
    return node;
  }));
  let releaseCatalog;
  let releaseSecondPage;
  const allSongs = Array.from({ length: 26 }, (_, number) => song(number));
  const filterMedia = { matches: true, addEventListener() {} };
  const catalogResponse = new Promise((resolve) => {
    releaseCatalog = resolve;
  });
  const requests = [];
  const fetch = (requestUrl) => {
    const url = new URL(requestUrl);
    requests.push(url);
    if (url.pathname.endsWith("/api/canzoniere/")) return catalogResponse;
    const offset = Number(url.searchParams.get("offset"));
    if (offset === 24)
      return new Promise((resolve) => {
        releaseSecondPage = resolve;
      });
    const limit = Number(url.searchParams.get("limit")) || 24;
    return Promise.resolve({
      ok: true,
      json: async () => ({
        songs: allSongs.slice(offset, offset + limit),
        total: allSongs.length,
        hasMore: offset + limit < allSongs.length,
      }),
    });
  };
  const window = {
    location: {
      href: "http://localhost/agesci-canicattini1/canzoniere/",
      search: "",
      pathname: "/agesci-canicattini1/canzoniere/",
    },
    history: { replaceState() {} },
    addEventListener() {},
    matchMedia: () => filterMedia,
    setTimeout,
    clearTimeout,
  };
  const source = fs.readFileSync(require.resolve("../assets/js/canzoniere.js"), "utf8");
  vm.runInNewContext(source, {
    document: {
      getElementById: (id) => elements[id],
      createElement: (tagName) => new Element(tagName),
    },
    window,
    URL,
    URLSearchParams,
    AbortController,
    fetch,
    console,
  });

  assert.equal(elements["song-list"].children.length, 3);
  assert.equal(elements["song-list"]["aria-busy"], "true");
  assert.equal(elements["song-filters"].hidden, true);
  assert.equal(elements["song-filter-toggle"].hidden, false);
  elements["song-filter-toggle"].listeners.get("click")();
  assert.equal(elements["song-filters"].hidden, false);
  assert.equal(elements["song-filter-toggle"].attributes["aria-expanded"], "true");
  releaseCatalog({
    ok: true,
    json: async () => ({
      tags: [{ slug: "ingresso", name: "Ingresso", category: "momento" }],
      albums: [],
      playlists: [{ slug: "pubblicata-demo", title: "Scaletta demo", songSlugs: ["demo-0"] }],
    }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements["song-list"].children.length, 24);
  assert.equal(elements["song-list"]["aria-busy"], "false");
  assert.equal(elements["song-status"].textContent, "Mostrate 24 di 26 canzoni.");
  assert.equal(elements["song-list"].children[0].children[0].children[0].textContent, "Canzone <b>demo</b>");
  assert.equal(elements["song-list"].querySelectorAll(".song-card-add").length, 0);
  assert.equal(elements["song-list"].querySelectorAll(".song-card-open").length, 0);
  assert.equal(elements["songs-more"].hidden, false);
  assert.match(elements["song-list"].children[0].children[0].href, /canzone\.html\?slug=demo-0/);
  assert.equal(elements["published-playlists"].children.length, 1);
  assert.match(elements["published-playlists"].children[0].children[0].href,
    /canzone\.html\?playlist=pubblicata-demo/);
  const playlistPreview = elements["published-playlists"].children[0].children[2];
  assert.equal(playlistPreview.className, "published-playlist-songs");
  assert.equal(playlistPreview.children[0].children[0].textContent, "Canzone <b>demo</b>");
  assert.match(playlistPreview.children[0].children[0].href, /canzone\.html\?slug=demo-0/);

  const loadingMore = elements["songs-more"].listeners.get("click")();
  assert.equal(elements["song-list"].children.length, 26);
  assert.equal(elements["song-list"]["aria-busy"], "true");
  releaseSecondPage({
    ok: true,
    json: async () => ({ songs: [song(24), song(25)], total: 26, hasMore: false }),
  });
  await loadingMore;
  assert.equal(elements["song-list"].children.length, 26);
  assert.equal(elements["song-list"]["aria-busy"], "false");
  assert.equal(elements["songs-more"].hidden, true);
  assert.ok(requests.some((url) => url.searchParams.get("limit") === "24" && url.searchParams.get("offset") === "24"));
});

test("public song scores wrap long lyrics within the available width and retain chord positions", () => {
  class ScoreNode {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.className = "";
      this.textContent = "";
      this.clientWidth = 0;
      this.classList = { add: name => { this.className = [this.className, name].filter(Boolean).join(" "); } };
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this[name] = value; }
    getContext() {
      return { font: "", measureText: text => ({ width: text.length * 6 }) };
    }
  }
  const document = { createElement: tagName => new ScoreNode(tagName) };
  const window = {
    document,
    CANZONIERE_MODEL: require("../assets/js/canzoniere-model.js"),
    getComputedStyle: () => ({ font: "10px monospace", fontSize: "10px", paddingLeft: "6px", paddingRight: "6px" }),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../assets/js/canzoniere-view.js"), "utf8"), { window, document });
  const score = new ScoreNode("div");
  score.clientWidth = 132;
  const lyric = "This is a very long lyric phrase that should wrap automatically without horizontal scrolling";
  window.CANZONIERE_VIEW.renderScore(score, {
    text: "[Am]This is a very long lyric phrase [F]that should wrap automatically without horizontal scrolling",
  });
  const rows = score.children;
  assert.ok(rows.length > 2, "long lyrics split into readable rows");
  assert.ok(rows.every(row => row.children[1].textContent.length <= 20), "each row fits the measured 20-character line");
  assert.ok(rows.every(row => Number(row.dataset.scrollFraction) > 0),
    "each visual row records its share of the musical line");
  assert.ok(Math.abs(rows.reduce((total, row) => total + Number(row.dataset.scrollFraction), 0) - 1) < 1e-8,
    "wrapped visual rows add up to one musical line");
  assert.equal(rows.map(row => row.children[1].textContent).join(" "), lyric);
  assert.deepEqual(rows.flatMap(row => row.children[0].children.map(marker => marker.textContent)), ["Am", "F"]);
  assert.ok(rows.flatMap(row => row.children[0].children)
    .every(marker => Number.parseFloat(marker.style.left) <= 20), "chord markers stay within their wrapped rows");
});

test("public song page groups settings and adapts notation, scroll and reading layout", () => {
  const html = fs.readFileSync(require.resolve("../canzoniere/canzone.html"), "utf8");
  const css = fs.readFileSync(require.resolve("../assets/css/canzoniere.css"), "utf8");
  const script = fs.readFileSync(require.resolve("../assets/js/canzoniere-song.js"), "utf8");
  const mobileStyles = css.split("@media (max-width: 640px) {")[1];
  const landscapeStyles = css.split("@media (max-height: 560px) and (orientation: landscape) {")[1];
  const compactReadingStyles = css.split("@media (max-width: 640px), (max-height: 560px) and (orientation: landscape) {")[1];

  assert.doesNotMatch(html, /add-song-to-playlist|Aggiungi alla scaletta/);
  assert.match(html, /id="song-settings-panel" class="song-settings-panel" hidden/);
  assert.match(html, /id="song-settings-toggle"[\s\S]*?aria-controls="song-settings-panel"/);
  assert.match(html, /id="song-settings-close"[^>]*aria-label="Chiudi impostazioni"/);
  assert.match(html, /class="fa-solid fa-xmark song-settings-close-icon" aria-hidden="true"/);
  assert.match(html, /fontawesome-free@7\.2\.0\/css\/solid\.min\.css/);
  for (const section of ["Accordi e tonalità", "Testo e schermo", "Scorrimento automatico", "Stampa"])
    assert.match(html, new RegExp(`<legend>${section}</legend>`));
  assert.equal((html.match(/<fieldset class="song-settings-group/g) || []).length, 4);
  assert.doesNotMatch(html, /<details class="song-settings-group/);
  for (const id of ["show-chords", "display-mode-toggle", "transpose-down", "transpose-up", "transpose-original",
    "song-font-size", "dark-mode", "wake-lock", "scroll-correction", "scroll-speed", "print-chords", "print-song"])
    assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="display-mode-indicator"[^>]*>EN<\/span>/);
  assert.doesNotMatch(html, /id="notation-toggle"|id="chords-toggle"/);
  assert.match(html, /id="auto-scroll"[^>]*aria-label="Avvia lo scorrimento automatico"/);
  assert.match(html, /id="scroll-reduced-motion" type="checkbox"/);
  assert.match(html, /id="song-meta" class="song-meta" aria-label="Dettagli della canzone"/);
  assert.match(html, /id="font-size-value"[^>]*>18 px<\/output>/);
  assert.match(html, /id="song-font-size" type="range" min="16" max="48"/);
  assert.match(mobileStyles, /\.song-detail-heading\s*\{\s*order:\s*1;/);
  assert.match(mobileStyles, /#song-score\s*\{\s*order:\s*2;/);
  assert.match(mobileStyles, /\.song-settings-panel\s*\{\s*order:\s*3;/);
  assert.match(css, /\.song-settings-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(mobileStyles, /\.song-settings-panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(mobileStyles, /\.song-card-meta\s*\{\s*display:\s*block;/s);
  assert.match(mobileStyles, /\.song-detail-heading \.song-byline,\s*\.song-detail-heading \.song-meta\s*\{\s*display:\s*block;/s);
  assert.match(css, /\.scroll-controls\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.scroll-controls\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.song-settings-close-icon::before\s*\{[^}]*content:\s*var\(--fa,/s);
  assert.match(css, /#song-content\.song-settings-open \.scroll-controls #display-mode-toggle/);
  assert.doesNotMatch(css, /#chords-toggle/);
  assert.match(css, /#song-content\.song-settings-open \.scroll-controls #auto-scroll/);
  assert.match(css, /\.song-score\s*\{[^}]*min-height:\s*min\(45vh,\s*560px\)/s);
  assert.match(css, /\.song-score\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /\.lyric-line\s*\{[^}]*white-space:\s*pre-wrap/);
  assert.match(css, /body\.song-page #song-status:empty\s*\{\s*display:\s*none;/);
  assert.match(mobileStyles, /body\.song-page main#contenuto\s*\{[^}]*display:\s*flex/s);
  assert.match(mobileStyles, /\.song-detail-card\s*\{[^}]*flex:\s*1 1 auto/s);
  assert.match(mobileStyles, /#song-score\s*\{[^}]*flex:\s*1 1 0/s);
  assert.match(html, /Velocità di scorrimento/);
  assert.match(html, /Movimento ridotto/);
  assert.ok(landscapeStyles, "short landscape screens have a dedicated reading layout");
  assert.match(landscapeStyles, /#song-score\s*\{[\s\S]*?flex:\s*1 1 0/s);
  assert.match(script, /model\.detectChordNotation/);
  assert.match(script, /model\.translateChordPro/);
  assert.match(script, /addMeta\("Tonalità", song\.key/);
  assert.match(script, /addMeta\("Battute\/riga"/);
  assert.match(script, /song-meta-key/);
  assert.match(script, /settingsToggle\.hidden = !compact/);
  assert.match(script, /settingsClose\.hidden = !compact \|\| !settingsOpen/);
  assert.match(script, /content\.classList\.toggle\("song-settings-open", compact && settingsOpen\)/);
  assert.match(script, /function updateAutomaticFontSize\(\)/);
  assert.doesNotMatch(script, /updateSongDensity|song-content-compact/);
  assert.match(script, /matchMedia\("\(orientation: landscape\)"\)/);
  assert.match(script, /const minimum = landscape && viewportWidth >= 640 \? 26 : 18/);
  assert.match(script, /Math\.max\(minimum,/);
  assert.match(script, /window\.visualViewport/);
  assert.match(compactReadingStyles, /justify-content:\s*flex-start/);
  assert.match(compactReadingStyles, /padding:\s*0 0 2px/);
});
