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
    AbortController,
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

test("voting UI exits the confirmation screen when the server reports an existing vote", async () => {
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
    AbortController,
    fetch: async (url, options) => {
      requests.push({ url, body: options && JSON.parse(options.body) });
      if (url.endsWith("/identify")) {
        return { ok: true, text: async () => JSON.stringify({ nome: "Ada", poll, haVotato: false }) };
      }
      return { ok: false, text: async () => "Hai già votato" };
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

  const selected = find(dialog, element => element.textContent === "Favorevole");
  await selected.onclick();
  await find(dialog, element => element.textContent === "Conferma il voto").onclick();

  assert.match(text(dialog), /Hai già votato: il tuo voto è registrato e segreto\./);
  const buttons = [];
  const collectButtons = node => {
    for (const child of node.children) {
      if (child.tagName === "BUTTON") buttons.push(child);
      collectButtons(child);
    }
  };
  collectButtons(dialog);
  assert.deepEqual(buttons.map(button => button.textContent), ["Chiudi"]);
  assert.equal(requests.filter(request => request.url.endsWith("/cast")).length, 1);
  buttons[0].onclick();
  assert.equal(dialog.hidden, true);
});

test("voting requests show cancellable loading and never overlap", async () => {
  const poll = { id: 12, domanda: "Approvi la proposta?", modalita: "scelta",
    opzioni: ["Favorevole", "Contrario", "Astenuto"], aperta: true };
  let identifyCalls = 0;
  let castCalls = 0;
  let identifySignal;
  let castSignal;
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
    AbortController,
    fetch: (url, options) => {
      if (url.endsWith("/identify")) {
        identifyCalls++;
        if (identifyCalls > 1) {
          return Promise.resolve({ ok: true, text: async () => JSON.stringify({ nome: "Ada", poll, haVotato: false }) });
        }
        identifySignal = options.signal;
        return new Promise((resolve, reject) => {
          identifySignal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })), { once: true });
        });
      }
      castCalls++;
      castSignal = options.signal;
      return new Promise((resolve, reject) => {
        castSignal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })), { once: true });
      });
    },
    setInterval() {},
    setTimeout() {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../area-riservata/assemblea/core/votazione.js"), "utf8"), context);

  const openButton = find(document.body, element => element.id === "vt-btn");
  const dialog = find(document.body, element => element.id === "vt-box");
  openButton.onclick();
  const input = find(dialog, element => element.tagName === "INPUT");
  input.value = "123456";
  const continueButton = find(dialog, element => element.textContent === "Continua");
  const firstIdentification = continueButton.onclick();
  assert.match(text(dialog), /Verifica del codice/);
  assert.equal(identifyCalls, 1);
  await continueButton.onclick();
  assert.equal(identifyCalls, 1, "a second click does not start another request");
  const cancelIdentification = find(dialog, element => element.textContent === "Annulla");
  cancelIdentification.onclick();
  assert.equal(identifySignal.aborted, true);
  await firstIdentification;
  assert.equal(find(dialog, element => element.tagName === "INPUT").value, "123456");

  await find(dialog, element => element.textContent === "Continua").onclick();
  await find(dialog, element => element.textContent === "Favorevole").onclick();
  const confirmation = find(dialog, element => element.textContent === "Conferma il voto");
  const voteRequest = confirmation.onclick();
  assert.match(text(dialog), /Invio del voto/);
  assert.equal(castCalls, 1);
  find(dialog, element => element.textContent === "Annulla invio").onclick();
  assert.equal(castSignal.aborted, true);
  await voteRequest;
  assert.match(text(dialog), /Il server potrebbe aver ricevuto il voto/);
  assert.equal(find(dialog, element => element.tagName === "INPUT").value, "123456");
  assert.equal(castCalls, 1, "cancel stops the pending request without retrying");
});
