/* core/votazione.js — votazioni segrete: stato condiviso (window.VOTO) e modulo "Vota" per il pubblico.
   Attivo solo se DATI.votazioni.abilitate è true: altrimenti non fa nulla. */
(function () {
  const L = window.LIVE || {};
  let attiva = false;
  const API = (L.basePath || "") + "/api/vote";
  const subs = new Set();
  const slug = t => String(t == null ? "" : t).replace(/<[^>]*>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 60).replace(/-+$/, "");
  // Il server registra i voti per id della slide: alle votazioni senza id ne serve uno ricavato
  // dal quesito, uguale su regia, schermo e telefoni perché calcolato dagli stessi dati.
  function chiavi(slide) {
    if (!Array.isArray(slide)) return;
    const usati = new Set(slide.map(x => x && x.id));
    for (const x of slide) {
      if (!x || x.tipo !== "slide_votazione" || (typeof x.id === "string" && x.id.trim())) continue;
      const s = slug(x.domanda) || slug(x.titolo);
      const base = /^votazione(-|$)/.test(s) ? s : "votazione" + (s ? "-" + s : "");
      let id = base;
      for (let n = 2; usati.has(id); n++) id = base + "-" + n;
      usati.add(id);
      x.id = id;
    }
  }
  const VOTO = (window.VOTO = {
    poll: null,
    api: API,
    // chiamato dal motore a ogni caricamento dei dati: senza "votazioni.abilitate" non parte nulla
    config(dati) {
      chiavi(dati && dati.slide);
      attiva = !!(dati && dati.votazioni && dati.votazioni.abilitate);
      if (attiva) VOTO.aggiorna();
      else if (VOTO.poll) { VOTO.poll = null; subs.forEach(fn => fn(null)); }
    },
    on(fn) { subs.add(fn); fn(VOTO.poll); return () => subs.delete(fn); },
    async post(path, data, signal) {
      const r = await fetch(API + "/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}), signal });
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
#vt-box .er{color:#b00020;min-height:1.2em;font-size:15px}
#vt-box .loading{display:flex;align-items:center;gap:12px;min-height:44px;font-weight:600}
#vt-box .spinner{box-sizing:border-box;flex:0 0 24px;width:24px;height:24px;border:3px solid #d5e4d8;border-top-color:#1d6b3a;border-radius:50%;animation:vt-spin .8s linear infinite}
@keyframes vt-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#vt-box .spinner{animation:none}}`;
  document.head.append(css);
  const btn = Object.assign(document.createElement("button"), { id: "vt-btn", type: "button", textContent: "Vota", hidden: true });
  const box = Object.assign(document.createElement("div"), { id: "vt-box", hidden: true });
  btn.setAttribute("data-live-control", "");
  box.setAttribute("data-live-control", "");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  document.body.append(btn, box);
  let code = "", who = null, activeRequest = null;
  const h = (t, c) => Object.assign(document.createElement(t), c || {});
  const chiudi = () => {
    const request = activeRequest;
    activeRequest = null;
    if (request) request.abort();
    box.hidden = true;
    code = "";
    who = null;
  };
  function mostra(...nodes) { const m = h("div", { className: "m" }); m.append(...nodes); box.replaceChildren(m); box.hidden = false; return m; }
  const annulla = (t = "Chiudi") => Object.assign(h("button", { type: "button", textContent: t }), { onclick: chiudi });
  function schermataAttesa(titolo, messaggio, testoAnnulla, annullaRichiesta) {
    const spinner = h("span", { className: "spinner" });
    spinner.setAttribute("aria-hidden", "true");
    const stato = h("div", { className: "loading" });
    stato.setAttribute("role", "status");
    stato.setAttribute("aria-live", "polite");
    stato.append(spinner, h("span", { textContent: messaggio }));
    const cancel = h("button", { type: "button", textContent: testoAnnulla });
    cancel.onclick = annullaRichiesta;
    mostra(h("h2", { textContent: titolo }), stato, cancel);
    cancel.focus();
  }
  function schermataCodice(err, valore = "") {
    const i = h("input", { type: "text", inputMode: "numeric", maxLength: 6, autocomplete: "off", placeholder: "••••••", value: valore });
    i.setAttribute("aria-label", "Codice di voto di 6 cifre");
    const e = h("div", { className: "er", textContent: err || "", role: "alert" });
    const ok = h("button", { type: "button", className: "go", textContent: "Continua" });
    const vai = async () => {
      if (activeRequest) return;
      if (!/^\d{6}$/.test(i.value)) { e.textContent = "Inserisci le 6 cifre del tuo codice"; return; }
      const submittedCode = i.value;
      const controller = new AbortController();
      activeRequest = controller;
      schermataAttesa("Verifica del codice", "Attendo la risposta del server…", "Annulla", () => {
        if (activeRequest !== controller) return;
        activeRequest = null;
        controller.abort();
        schermataCodice("Richiesta annullata.", submittedCode);
      });
      try {
        const r = await VOTO.post("identify", { code: submittedCode }, controller.signal);
        if (activeRequest !== controller) return;
        activeRequest = null;
        code = submittedCode;
        who = r;
        VOTO.poll = r.poll;
        schermataVoto();
      } catch (x) {
        if (activeRequest !== controller) return;
        activeRequest = null;
        schermataCodice(x.message, submittedCode);
      }
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
    if (who.haVotato && who.poll && who.poll.id === p.id) return schermataGiaVotato();
    const bs = p.opzioni.map((o, n) => Object.assign(h("button", { type: "button", textContent: o, className: p.modalita === "scelta" ? "c" + n : "" }), {
      onclick() { schermataConferma(n); },
    }));
    mostra(nome, h("p", { textContent: p.domanda }), ...bs);
  }
  function schermataGiaVotato() {
    mostra(h("h2", { textContent: "Ciao " + who.nome }),
      h("p", { textContent: "Hai già votato: il tuo voto è registrato e segreto." }), annulla());
  }
  function schermataConferma(scelta) {
    const p = VOTO.poll;
    if (!p || !p.aperta) return schermataVoto();
    const e = h("div", { className: "er", role: "alert" });
    const ok = h("button", { type: "button", className: "go", textContent: "Conferma il voto" });
    // Annulla torna alle opzioni: dopo un tocco sbagliato non serve rifare "Vota" e reinserire il codice.
    const indietro = Object.assign(h("button", { type: "button", textContent: "Annulla" }), { onclick: () => schermataVoto() });
    const mostraConferma = () => mostra(h("h2", { textContent: "Hai selezionato: " + p.opzioni[scelta] }),
      h("p", { textContent: p.domanda }), e, ok, indietro);
    ok.onclick = async () => {
      if (activeRequest) return;
      const submittedCode = code;
      const controller = new AbortController();
      activeRequest = controller;
      schermataAttesa("Invio del voto", "Attendo la risposta del server…", "Annulla invio", () => {
        if (activeRequest !== controller) return;
        activeRequest = null;
        controller.abort();
        code = "";
        who = null;
        schermataCodice("Attesa interrotta. Il server potrebbe aver ricevuto il voto: reinserisci il codice per verificarne l'esito.", submittedCode);
      });
      try {
        await VOTO.post("cast", { code: submittedCode, poll: p.id, scelta }, controller.signal);
        if (activeRequest !== controller) return;
        activeRequest = null;
        mostra(h("h2", { textContent: "Voto registrato" }), h("p", { textContent: "Grazie " + who.nome + ": nessuno potrà vedere cosa hai votato." }), annulla());
        setTimeout(() => { if (!box.hidden) chiudi(); }, 4000);
      }
      catch (x) {
        if (activeRequest !== controller) return;
        activeRequest = null;
        if (x.message === "Hai già votato") {
          who.haVotato = true;
          who.poll = p;
          schermataGiaVotato();
          return;
        }
        code = "";
        who = null;
        schermataCodice("Esito del voto non verificato (" + x.message + "). Reinserisci il codice per controllare.", submittedCode);
      }
    };
    mostraConferma();
  }
  btn.onclick = () => schermataCodice();
  VOTO.on(p => { btn.hidden = !(p && p.aperta); if (who && !box.hidden && !activeRequest && !(p && p.aperta)) schermataVoto(); });
})();
