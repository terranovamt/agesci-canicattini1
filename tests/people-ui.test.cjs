const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("access management renders only chiefs and the creation form creates a chief", async () => {
  const elements = new Map();
  function element() {
    return {
      children: [], value: "", hidden: false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const root = path.join(__dirname, "..");
  const context = {
    window: {
      NAS: { user: { admin: true } },
      ACCESSO: { request: async () => ({ people: [
        { id: 1, name: "Admin example", code: "012345", kind: "capo", admin: true },
        { id: 2, name: "Chief example", code: "012346", kind: "capo", serviceBranch: "E/G" },
        { id: 3, name: "Youth example", code: "012347", kind: "ragazzo" },
      ] }) },
    },
    document: { getElementById: get, createElement: element, createTextNode: text => ({ textContent: text }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets/js/persone.js"), "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  const cards = get("people-list").children;
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(card => card.children[0].textContent), ["Admin example · 012345", "Chief example · 012346"]);
  assert.equal(get("people-app").hidden, false);
  const html = fs.readFileSync(path.join(root, "area-riservata/persone.html"), "utf8");
  assert.match(html, /name="kind" type="hidden" value="capo"/);
  assert.doesNotMatch(html, /<option value="ragazzo">/);
});
