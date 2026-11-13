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
  querySelectorAll(selector) {
    if (selector !== ".song-skeleton") return [];
    return this.children.filter((child) => child.className.split(/\s+/).includes("song-skeleton"));
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
    "song-search",
    "song-tag",
    "song-branch",
    "song-album",
    "song-status",
    "songs-more",
    "songs-retry",
    "clear-song-filters",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element(id === "song-list" ? "div" : "input")]));
  elements["song-list"].append(...Array.from({ length: 3 }, () => {
    const node = new Element("article");
    node.className = "loading-skeleton song-skeleton";
    return node;
  }));
  let releaseCatalog;
  let releaseSecondPage;
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
    const songs = Array.from({ length: 26 }, (_, number) => song(number));
    return Promise.resolve({
      ok: true,
      json: async () => ({ songs: songs.slice(offset, offset + 24), total: songs.length, hasMore: true }),
    });
  };
  const window = {
    location: { href: "http://localhost/agesci-canicattini1/canzoniere/", search: "", pathname: "/agesci-canicattini1/canzoniere/" },
    history: { replaceState() {} },
    addEventListener() {},
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
  releaseCatalog({
    ok: true,
    json: async () => ({ tags: [], albums: [], presets: [], playlists: [] }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements["song-list"].children.length, 24);
  assert.equal(elements["song-list"]["aria-busy"], "false");
  assert.equal(elements["song-status"].textContent, "Mostrate 24 di 26 canzoni.");
  assert.equal(elements["song-list"].children[0].children[0].children[0].textContent, "Canzone <b>demo</b>");
  assert.equal(elements["songs-more"].hidden, false);

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
