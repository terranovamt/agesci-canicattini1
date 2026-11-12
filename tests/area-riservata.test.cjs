const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/area-riservata.js"), "utf8");

function load(authenticated = false, loginFailure = false) {
  const elements = new Map(), calls = [];
  const get = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: "",
        textContent: "",
        hidden: id === "riservata" || id === "esci",
        disabled: false,
        type: "password",
        dataset: {},
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = String(value);
          if (name === "data-state") this.dataset.state = value;
        },
        removeAttribute(name) {
          delete this.attributes[name];
          delete this.dataset[name];
        },
        focus() { this.focused = true; },
        querySelector(selector) {
          if (selector.startsWith("label")) return get("nas-password-label");
          if (selector.includes("submit")) return get("submit");
          return get(id + "-button");
        },
        querySelectorAll() { return []; },
      });
    }
    return elements.get(id);
  };
  const window = {
    NAS: { user: authenticated ? { code: "12345" } : null },
    AREA_DASHBOARD: { load() { calls.push("dashboard"); } },
    ACCESSO: {
      verificata: () => !!window.NAS.user,
      async request(route, method, data) {
        calls.push({ route, method, data });
        return { firstAccess: false };
      },
      async entra(password, code) {
        calls.push({ password, code });
        if (loginFailure) throw new Error("Credenziali non valide");
        window.NAS.user = { code };
      },
      async esci() {},
    },
  };
  vm.runInNewContext(source, {
    document: { getElementById: get },
    location: { replace() {} },
    window,
  });
  return { get, calls };
}

test("returning to the reserved area reuses the authenticated NAS session", () => {
  const t = load(true);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0], "dashboard");
  assert.equal(t.get("login").hidden, true);
  assert.equal(t.get("riservata").hidden, false);
  assert.equal(t.get("esci").hidden, false);
});

test("a new login verifies the census code before authenticating", async () => {
  const t = load();
  assert.equal(t.get("nas-login-form").hidden, false);
  assert.equal(t.get("riservata").hidden, true);
  const form = t.get("nas-login-form");
  t.get("census-code").value = "12345";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(t.calls[0].route, "auth/status");
  assert.equal(t.calls[0].method, "POST");
  assert.equal(t.calls[0].data.code, "12345");
  assert.equal(t.get("password-fields").hidden, false);
  t.get("nas-password").value = "password";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(t.calls[1].password, "password");
  assert.equal(t.calls[1].code, "12345");
  assert.equal(t.calls[2], "dashboard");
  assert.equal(t.get("login").hidden, true);
  assert.equal(t.get("riservata").hidden, false);
});

test("failed NAS login reports an error without opening reserved tools", async () => {
  const t = load(false, true);
  t.get("census-code").value = "12345";
  const form = t.get("nas-login-form");
  await form.onsubmit({ preventDefault() {} });
  t.get("nas-password").value = "wrong";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(t.calls.includes("dashboard"), false);
  assert.equal(t.get("riservata").hidden, true);
  assert.match(t.get("accesso-stato").textContent, /Credenziali non valide/);
  assert.equal(t.get("accesso-stato").dataset.state, "error");
});
