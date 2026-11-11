/* core/votazione.js — votazioni segrete: stato condiviso (window.VOTO) e modulo "Vota" per il pubblico.
   Attivo solo se DATI.votazioni.abilitate è true: altrimenti non fa nulla. */
(function () {
  const L = window.LIVE || {};
  let attiva = false;
  const API = (L.basePath || "") + "/api/vote";
  const subs = new Set();
  const VOTO = (window.VOTO = {
    poll: null,
    api: API,
    // chiamato dal motore a ogni caricamento dei dati: senza "votazioni.abilitate" non parte nulla
    config(dati) {
      attiva = !!(dati && dati.votazioni && dati.votazioni.abilitate);
      if (attiva) VOTO.aggiorna();
      else if (VOTO.poll) { VOTO.poll = null; subs.forEach(fn => fn(null)); }
    },
    on(fn) { subs.add(fn); fn(VOTO.poll); return () => subs.delete(fn); },
    async post(path, data) {
      const r = await fetch(API + "/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });
      const t = await r.text();
      if (!r.ok) throw new Error(t || "Errore " + r.status);
      return t ? JSON.parse(t) : {};
    },
    async aggiorna() {
      if (!attiva) return;
      try {
        const r = await fetch(API + "/state", { cache: "no-store" });
        if (!r.ok) return;
        const poll = (await r.json()).poll;
        if (JSON.stringify(poll) === JSON.stringify(VOTO.poll)) return;
        VOTO.poll = poll;
        subs.forEach(fn => fn(poll));
      } catch (e) { /* rete assente: riprova al prossimo giro */ }
    },
  });
  const loop = () => { if (attiva && !document.hidden) VOTO.aggiorna(); };
  setInterval(loop, 2500);
  document.addEventListener("visibilitychange", loop);
  if (L.ruolo !== "pubblico") return;

  const css = document.createElement("style");
  css.textContent = `#vt-btn{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:60;min-height:52px;min-width:180px;padding:0 32px;border:0;border-radius:24px;background:#f5c400;color:#1d2a1d;font:700 16px system-ui,sans-serif;box-shadow:0 4px 14px #0006}
#vt-btn[hidden],#vt-box[hidden]{display:none}
#vt-box{position:fixed;inset:0;z-index:70;background:#000b;display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif}
#vt-box .m{box-sizing:border-box;width:min(520px,100%);max-height:92%;overflow:auto;background:#fff;color:#1d2a1d;border-radius:18px 18px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom,0px))}
#vt-box h2{margin:0 0 6px;font-size:20px}#vt-box p{margin:6px 0 14px;font-size:16px}
#vt-box input{box-sizing:border-box;width:100%;height:56px;font:700 28px/1 monospace;letter-spacing:.3em;text-align:center;border:2px solid #888;border-radius:12px}
#vt-box button{box-sizing:border-box;width:100%;min-height:52px;margin-top:10px;border:2px solid #1d6b3a;border-radius:12px;background:#fff;color:#1d6b3a;font:700 17px system-ui,sans-serif}
#vt-box button.c0{border-color:#1f8a4a;color:#1f8a4a}#vt-box button.c1{border-color:#c93036;color:#c93036}#vt-box button.c2{border-color:#6f6f80;color:#55555f}
#vt-box button.c0.sel{background:#1f8a4a;color:#fff}#vt-box button.c1.sel{background:#c93036;color:#fff}#vt-box button.c2.sel{background:#6f6f80;color:#fff}
#vt-box button.go{background:#1d6b3a;color:#fff}#vt-box button.sel{background:#1d6b3a;color:#fff}
#vt-box .er{color:#b00020;min-height:1.2em;font-size:15px}`;
  document.head.append(css);
  const btn = Object.assign(document.createElement("button"), { id: "vt-btn", type: "button", textContent: "Vota", hidden: true });
  const box = Object.assign(document.createElement("div"), { id: "vt-box", hidden: true });
  btn.setAttribute("data-live-control", "");
  box.setAttribute("data-live-control", "");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  document.body.append(btn, box);
  let code = "", who = null;
  const h = (t, c) => Object.assign(document.createElement(t), c || {});
  const chiudi = () => { box.hidden = true; code = ""; who = null; };
  function mostra(...nodes) { const m = h("div", { className: "m" }); m.append(...nodes); box.replaceChildren(m); box.hidden = false; return m; }
  const annulla = (t = "Chiudi") => Object.assign(h("button", { type: "button", textContent: t }), { onclick: chiudi });
  function schermataCodice(err) {
    const i = h("input", { type: "text", inputMode: "numeric", maxLength: 6, autocomplete: "off", placeholder: "••••••" });
    i.setAttribute("aria-label", "Codice di voto di 6 cifre");
    const e = h("div", { className: "er", textContent: err || "", role: "alert" });
    const ok = h("button", { type: "button", className: "go", textContent: "Continua" });
    const vai = async () => {
      if (!/^\d{6}$/.test(i.value)) { e.textContent = "Inserisci le 6 cifre del tuo codice"; return; }
      ok.disabled = true;
      try { const r = await VOTO.post("identify", { code: i.value }); code = i.value; who = r; schermataVoto(); }
      catch (x) { e.textContent = x.message; ok.disabled = false; }
    };
    ok.onclick = vai;
    i.onkeydown = ev => { if (ev.key === "Enter") vai(); };
    mostra(h("h2", { textContent: "Vota" }), h("p", { textContent: "Inserisci il codice di voto personale di 6 cifre." }), i, e, ok, annulla("Annulla"));
    i.focus();
  }
  function schermataVoto() {
    const p = VOTO.poll;
    const nome = h("h2", { textContent: "Ciao " + who.nome });
    if (!p || !p.aperta) return mostra(nome, h("p", { textContent: "Al momento non c'è nessuna votazione aperta." }), annulla());
    if (who.haVotato && who.poll && who.poll.id === p.id) return mostra(nome, h("p", { textContent: "Hai già votato: il tuo voto è registrato e segreto." }), annulla());
    let scelta = null;
    const e = h("div", { className: "er", role: "alert" });
    const ok = h("button", { type: "button", className: "go", textContent: "Conferma il voto", disabled: true });
    const bs = p.opzioni.map((o, n) => Object.assign(h("button", { type: "button", textContent: o, className: p.modalita === "scelta" ? "c" + n : "" }), {
      onclick() { scelta = n; bs.forEach((b, k) => b.classList.toggle("sel", k === n)); ok.disabled = false; },
    }));
    ok.onclick = async () => {
      ok.disabled = true;
      try { await VOTO.post("cast", { code, poll: p.id, scelta }); mostra(h("h2", { textContent: "Voto registrato" }), h("p", { textContent: "Grazie " + who.nome + ": nessuno potrà vedere cosa hai votato." }), annulla()); setTimeout(() => { if (!box.hidden) chiudi(); }, 4000); }
      catch (x) { e.textContent = x.message; ok.disabled = false; }
    };
    mostra(nome, h("p", { textContent: p.domanda }), ...bs, e, ok, annulla("Annulla"));
  }
  btn.onclick = () => schermataCodice();
  VOTO.on(p => { btn.hidden = !(p && p.aperta); if (who && !box.hidden && !(p && p.aperta)) schermataVoto(); });
})();
