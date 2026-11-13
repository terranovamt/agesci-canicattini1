const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(require.resolve("../assets/js/canzoniere-playlist-store.js"), "utf8");

function createStore(localStorage) {
  const window = { localStorage };
  vm.runInNewContext(source, { window, URL, JSON, Object, Array, Set, Error });
  return window.CANZONIERE_PLAYLIST_STORE;
}

test("personal playlist storage persists only valid slugs and shares a slug-only URL", () => {
  const values = new Map();
  const store = createStore({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  assert.deepEqual(Array.from(store.read().slugs), []);
  const saved = store.write(["la-lanterna", "il-ponte"]);
  assert.equal(saved.ok, true);
  assert.deepEqual(JSON.parse(values.values().next().value), ["la-lanterna", "il-ponte"]);
  assert.deepEqual(Array.from(store.read().slugs), ["la-lanterna", "il-ponte"]);

  const shared = new URL(store.shareUrl(["la-lanterna", "il-ponte"], "https://site.test/agesci-canicattini1/canzoniere/"));
  assert.equal(shared.pathname, "/agesci-canicattini1/canzoniere/canzone.html");
  assert.deepEqual([...shared.searchParams.keys()], ["slugs"]);
  assert.deepEqual(shared.searchParams.get("slugs").split(","), ["la-lanterna", "il-ponte"]);
  const invalid = store.write(["slug invalido"]);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error.message, /Scaletta locale non valida/);
});

test("localStorage failures are surfaced to the caller instead of escaping or silently succeeding", () => {
  const store = createStore({
    getItem() {
      throw new Error("storage disabled");
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  });
  assert.match(store.read().error.message, /storage disabled/);
  const result = store.write(["la-lanterna"]);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /quota exceeded/);
  assert.throws(() => store.shareUrl([], "https://site.test/canzoniere/"), /Aggiungi almeno una canzone/);
});
