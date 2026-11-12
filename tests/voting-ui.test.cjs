const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.hidden = false;
    this.disabled = false;
    this.classList = { toggle() {}, add() {} };
  }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() { return this._textContent || ""; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() {}
}

function find(root, predicate) {
  for (const child of root.children) {
    if (predicate(child)) return child;
    const nested = find(child, predicate);
    if (nested) return nested;
  }
}

function text(root) {
  return root.textContent + root.children.map(text).join("");
}

test("voting UI uses the identified poll, separates choice from confirmation and cancel returns to the choices", async () => {
  const poll = { id: 12, domanda: "Approvi la proposta?", modalita: "scelta",
    opzioni: ["Favorevole", "Contrario", "Astenuto"], aperta: true };
  const requests = [];
  const document = {
    head: new Element("head"),
    body: new Element("body"),
    hidden: false,
    createElement: tag => new Element(tag),
    addEventListener() {},
  };
  const context = {
    window: { LIVE: { ruolo: "pubblico", basePath: "" } },
    document,
    fetch: async (url, options) => {
      const request = { url, body: options && JSON.parse(options.body) };
      requests.push(request);
      return { ok: true, text: async () => JSON.stringify(url.endsWith("/identify")
        ? { nome: "Ada", poll, haVotato: false }
        : { ok: true }) };
    },
    setInterval() {},
    setTimeout() {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/core/votazione.js"), "utf8"), context);

  const openButton = find(document.body, element => element.id === "vt-btn");
  const dialog = find(document.body, element => element.id === "vt-box");
  openButton.onclick();
  const codeInput = find(dialog, element => element.tagName === "INPUT");
  codeInput.value = "123456";
  await find(dialog, element => element.textContent === "Continua").onclick();

  let buttons = [];
  const collectButtons = node => {
    for (const child of node.children) {
      if (child.tagName === "BUTTON") buttons.push(child);
      collectButtons(child);
    }
  };
  collectButtons(dialog);
  assert.deepEqual(buttons.map(button => button.textContent), poll.opzioni);
  assert.match(text(dialog), /Approvi la proposta\?/);
  assert.doesNotMatch(text(dialog), /Conferma il voto|Annulla/);

  await buttons[0].onclick();
  buttons = [];
  collectButtons(dialog);
  assert.match(text(dialog), /Hai selezionato: Favorevole/);
  assert.deepEqual(buttons.map(button => button.textContent), ["Conferma il voto", "Annulla"]);

  await buttons[1].onclick();
  assert.equal(requests.filter(request => request.url.endsWith("/cast")).length, 0, "cancel does not send a vote");
  buttons = [];
  collectButtons(dialog);
  assert.deepEqual(buttons.map(button => button.textContent), poll.opzioni, "cancel returns to the choices");

  await buttons[1].onclick();
  buttons = [];
  collectButtons(dialog);
  assert.match(text(dialog), /Hai selezionato: Contrario/);
  await buttons[0].onclick();
  assert.equal(requests.filter(request => request.url.endsWith("/cast")).length, 1);
  assert.deepEqual(requests.find(request => request.url.endsWith("/cast")).body,
    { code: "123456", poll: poll.id, scelta: 1 });
});
