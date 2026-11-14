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
  select() {}
  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const matches = [];
    const visit = (node) => {
      if (node.className.split(/\s+/).includes(className)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  remove() {
    this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  focus() {}
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

test("public list shows accessible skeletons, fetches in blocks, and inserts titles as text", async () => {
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
    "personal-playlist-status",
    "personal-playlist-items",
    "playlist-add-form",
    "playlist-song-search",
    "playlist-add-status",
    "playlist-add-results",
    "share-playlist",
    "share-playlist-controls",
    "share-playlist-link",
    "copy-playlist-link",
    "open-playlist",
    "clear-playlist",
    "playlist-moment",
    "generate-moment",
    "regenerate-playlist",
    "quick-presets",
    "generated-playlist-status",
    "generated-playlist-items",
    "use-generated-playlist",
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
  let savedSlugs = [];
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
    const slugs = url.searchParams.get("slugs")?.split(",");
    const selected = slugs ? allSongs.filter((item) => slugs.includes(item.slug)) : allSongs;
    return Promise.resolve({
      ok: true,
      json: async () => ({
        songs: selected.slice(offset, offset + limit),
        total: selected.length,
        hasMore: offset + limit < selected.length,
      }),
    });
  };
  const window = {
    location: { href: "http://localhost/agesci-canicattini1/canzoniere/", search: "", pathname: "/agesci-canicattini1/canzoniere/" },
    history: { replaceState() {} },
    addEventListener() {},
    matchMedia: () => filterMedia,
    setTimeout,
    clearTimeout,
    CANZONIERE_PLAYLIST_STORE: {
      read: () => ({ slugs: [], error: null }),
      write: (slugs) => {
        savedSlugs = [...slugs];
        return { ok: true, error: null };
      },
      shareUrl: (slugs, currentUrl) => {
        const url = new URL("canzone.html", currentUrl);
        url.searchParams.set("slugs", slugs.join(","));
        return url.href;
      },
    },
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
    presets: [{ slug: "preset-demo", title: "Preset demo", tagSlugs: ["ingresso"], songSlugs: [], limit: 2 }],
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
  elements["playlist-song-search"].value = "Canzone";
  await elements["playlist-add-form"].listeners.get("submit")({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(requests.some((url) => url.searchParams.get("q") === "Canzone"));
  const addFirstSong = elements["playlist-add-results"].children[0].children[1];
  addFirstSong.listeners.get("click")();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(savedSlugs, ["demo-0"]);
  assert.equal(elements["playlist-add-results"].children[0].children[1].disabled, true);
  assert.equal(elements["personal-playlist-items"].children.length, 1);
  assert.match(elements["open-playlist"].href, /canzone\.html\?slugs=demo-0/);
  assert.match(elements["published-playlists"].children[0].children[0].href, /canzone\.html\?playlist=pubblicata-demo/);

  elements["quick-presets"].children[0].listeners.get("click")();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements["generated-playlist-items"].children.length, 2);
  assert.equal(elements["use-generated-playlist"].hidden, false);
  const generatedSlugs = elements["generated-playlist-items"].children
    .map((item) => item.children[1].href.split("slug=")[1]);
  elements["use-generated-playlist"].listeners.get("click")();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(savedSlugs, [...new Set(["demo-0", ...generatedSlugs])]);
  assert.match(elements["open-playlist"].href, /canzone\.html\?slugs=/);

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

test("mobile song reading keeps lyrics first and places controls behind the bottom settings menu", () => {
  const html = fs.readFileSync(require.resolve("../canzoniere/canzone.html"), "utf8");
  const css = fs.readFileSync(require.resolve("../assets/css/canzoniere.css"), "utf8");
  const mobileStyles = css.split("@media (max-width: 640px) {")[1];

  assert.doesNotMatch(html, /add-song-to-playlist|Aggiungi alla scaletta/);
  assert.match(html, /id="song-settings-panel" class="song-settings-panel" hidden/);
  assert.match(html, /id="song-settings-toggle"[\s\S]*?aria-controls="song-settings-panel"/);
  assert.match(mobileStyles, /\.song-detail-heading\s*\{\s*order:\s*1;/);
  assert.match(mobileStyles, /#song-score\s*\{\s*order:\s*2;/);
  assert.match(mobileStyles, /\.song-settings-panel\s*\{\s*order:\s*3;/);
  assert.match(mobileStyles, /\.scroll-controls\s*\{\s*position:\s*fixed/);
});
