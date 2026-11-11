const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createNasServer } = require("../server/nas.cjs");

const columns = ["ANNO SCOUT", "CODICE SOCIO", "NOME", "COGNOME", "BRANCA", "ORDINALE",
  "DATA NASCITA", "EMAIL", "CELLULARE", "RESP.GENITORIALE DATI", "STATUS SOCIO", "CODICE STATUS SOCIO",
  "GRUPPO", "CODICE AREA"];
const base = { "ANNO SCOUT": "2026", "CODICE SOCIO": "012345", NOME: "Persona", COGNOME: "Esempio",
  BRANCA: "Branca E/G", ORDINALE: "R2053", "DATA NASCITA": "2/3/2012", EMAIL: "test@example.invalid",
  CELLULARE: "000 123;000123", "RESP.GENITORIALE DATI": 'Responsabile "Esempio", contatto\nDa verificare',
  "STATUS SOCIO": "Attivo", "CODICE STATUS SOCIO": "A", GRUPPO: "Gruppo esempio", "CODICE AREA": "ignora" };
function csv(rows = [{}], headers = columns) {
  const cell = value => '="' + String(value ?? "").replace(/"/g, '""') + '"';
  return "\uFEFFsep=,\r\n" + headers.join(",") + "\r\n" +
    rows.map(row => headers.map(key => cell({ ...base, ...row }[key])).join(",") + ",").join("\r\n");
}
const password = "Test-only-password1!";
const guardianSource = "Esempio Responsabile [C.F.ABCDEF80A01H501U] - Nato/a a: Comune Esempio (XX) il: 1/1/1980 e-mail: guardian@example.invalid Cellulare: 000 123";
async function start(directory, censusCodes = "7654321") {
  const server = await createNasServer({ dataDir: directory, password, censusCodes,
    basePath: "/agesci-canicattini1", publicOrigin: "http://localhost", secureCookie: false });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let cookie = "";
  return {
    cookie: () => cookie,
    async request(route, method = "GET", data, origin = "http://localhost", suppliedCookie = cookie) {
      return fetch(`http://127.0.0.1:${server.address().port}/agesci-canicattini1/api/${route}`, {
        method, headers: { Cookie: suppliedCookie, Origin: origin, "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    },
    async login(code = "23816938") {
      const r = await this.request("auth/login", "POST", { code, password, confirmation: password, temporary: "Canicattini1" });
      assert.equal(r.status, 200, await r.text());
      cookie = r.headers.get("set-cookie").split(";")[0];
    },
    async snapshot() {
      const r = await this.request("members");
      assert.equal(r.status, 200);
      return r.json();
    },
    async import(content) {
      const r = await this.request("members/import", "POST", { csv: content });
      assert.equal(r.status, 200, await r.clone().text());
      const preview = await r.json();
      const saved = await this.request("members/import", "POST", { csv: content, confirm: true, version: preview.version });
      assert.equal(saved.status, 200, await saved.text());
      return preview;
    },
    async close() { server.stop(); await once(server, "close"); },
  };
}

test("secret votes: codes, one vote per member, tallies without links, results after close", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-votes-"));
  const app = await start(directory);
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await app.login();
  await app.import(csv([{ "CODICE SOCIO": "100001", NOME: "Anna", COGNOME: "Uno" }, { "CODICE SOCIO": "100002", NOME: "Bruno", COGNOME: "Due" }, { "CODICE SOCIO": "100003", NOME: "Carla", COGNOME: "Tre" }]));
  const poll = { slide: "votazione-test", domanda: "Approvi?", modalita: "scelta", opzioni: ["Favorevole", "Contrario", "Astenuto"], live: true };
  assert.equal((await app.request("vote/open", "POST", poll)).status, 409);
  const codes = await (await app.request("vote/codes", "POST", { anno: "2026" })).json();
  assert.equal(codes.righe.length, 3);
  assert.ok(codes.righe.every(r => /^\d{6}$/.test(r.personale)));
  assert.equal(new Set(codes.righe.map(r => r.personale)).size, 3);
  const again = await (await app.request("vote/codes", "POST", { anno: "2026" })).json();
  assert.deepEqual(again.righe.map(r => r.personale), codes.righe.map(r => r.personale));
  const [a, b] = codes.righe.map(r => r.personale);
  assert.equal((await app.request("vote/codes", "POST", { anno: "2026" }, "https://foreign.invalid")).status, 403);

  assert.equal((await app.request("vote/open", "POST", poll)).status, 200);
  const state = await (await app.request("vote/state")).json();
  assert.equal(state.poll.aperta, true); assert.equal(state.poll.totale, 3); assert.deepEqual(state.poll.conteggi, [0, 0, 0]);
  const id = await (await app.request("vote/identify", "POST", { code: a })).json();
  assert.equal(id.haVotato, false); assert.ok(id.nome.includes("Anna"));
  assert.equal((await app.request("vote/identify", "POST", { code: "000000" })).status, 401);
  assert.equal((await app.request("vote/cast", "POST", { code: a, poll: state.poll.id, scelta: 9 })).status, 400);
  assert.equal((await app.request("vote/cast", "POST", { code: a, poll: state.poll.id, scelta: 0 })).status, 200);
  assert.equal((await app.request("vote/cast", "POST", { code: a, poll: state.poll.id, scelta: 1 })).status, 409);
  assert.equal((await app.request("vote/cast", "POST", { code: b, poll: state.poll.id, scelta: 0 })).status, 200);
  const live = (await (await app.request("vote/state")).json()).poll;
  assert.deepEqual(live.conteggi, [2, 0, 0]); assert.equal(live.ricevuti, 2);
  assert.equal((await (await app.request("vote/identify", "POST", { code: a })).json()).haVotato, true);

  await app.request("vote/close", "POST", {});
  assert.equal((await app.request("vote/cast", "POST", { code: codes.righe[2].personale, poll: state.poll.id, scelta: 2 })).status, 409);
  const closed = (await (await app.request("vote/state")).json()).poll;
  assert.equal(closed.aperta, false); assert.equal(closed.conteggi, null);
  const results = (await (await app.request("vote/results?slide=votazione-test")).json()).poll;
  assert.deepEqual(results.conteggi, [2, 0, 0]);

  const db = new DatabaseSync(path.join(directory, "nas.sqlite"));
  const columns = db.prepare("PRAGMA table_info(vote_tally)").all().concat(db.prepare("PRAGMA table_info(vote_cast)").all()).map(c => c.name);
  assert.ok(!columns.includes("person_id") || !columns.includes("option"));
  db.close();

  await app.request("vote/open", "POST", { ...poll, slide: "nom", modalita: "nominativa", opzioni: ["C1", "C2"] });
  const nom = (await (await app.request("vote/state")).json()).poll;
  assert.equal(nom.conteggi, null);
  await app.request("vote/cast", "POST", { code: a, poll: nom.id, scelta: 1 });
  assert.equal((await (await app.request("vote/results?slide=nom")).json()).poll.conteggi, null);
  await app.request("vote/close", "POST", {});
  assert.deepEqual((await (await app.request("vote/results?slide=nom")).json()).poll.conteggi, [0, 1]);
});
