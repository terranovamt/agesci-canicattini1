/* core/live.js — sincronizzazione live regia → pubblico (Firebase Realtime Database, via REST + SSE).
   Si appoggia al motore di index.html (go, next, prev, scenes, si, sk). */
(function () {
  const L = window.LIVE;
  if (!L || !L.url || L.ruolo === "locale") return;
  const U = L.url.replace(/\/$/, "");
  const enc = (i, k) => i * 1000 + k;
  const dec = (p) => ({ i: Math.floor(p / 1000), k: p % 1000 });
  const __go = go;

  /* ---------------- REGIA: pubblica la posizione ---------------- */
  if (L.ruolo === "regia") {
    document.title += " (regia)";
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;top:6px;right:6px;width:9px;height:9px;border-radius:50%;background:#888;z-index:99;opacity:.7;pointer-events:none";
    document.body.append(dot);
    let t,
      maxP = 0,
      inviato = null,
      invio = false;
    let sospeso = false,
      fineInvio = Promise.resolve();
    const pub = async () => {
      if (!scenes.length || sospeso) return;
      const p = enc(si, sk);
      maxP = Math.max(maxP, p);
      const body = JSON.stringify({ stato: { pos: p, max: maxP }, k: L.chiave });
      if (invio || body === inviato) return;
      invio = true;
      let completa;
      fineInvio = new Promise((resolve) => {
        completa = resolve;
      });
      try {
        const r = await fetch(U + "/live.json", { method: "PUT", body });
        if (!r.ok) throw new Error("Pubblicazione live non riuscita (Firebase " + r.status + ")");
        inviato = body;
        dot.style.background = "#21A067";
      } catch (e) {
        dot.style.background = "#E74030";
        console.warn("Errore sincronizzazione live", e);
      } finally {
        invio = false;
        completa();
      }
      if (inviato === body && enc(si, sk) !== p) pub();
    };
    go = (i, k) => {
      __go(i, k);
      clearTimeout(t);
      t = setTimeout(pub, 150);
    };
    L.avviaLive = async (salva) => {
      if (sospeso) throw new Error("Avvio live già in corso");
      sospeso = true;
      clearTimeout(t);
      try {
        await fineInvio;
        await salva();
        maxP = 0;
        inviato = JSON.stringify({ stato: { pos: 0, max: 0 }, k: L.chiave });
        go(0, 0);
      } finally {
        sospeso = false;
      }
    };
    setInterval(pub, 10000); /* ritenta solo le scritture fallite o ancora da inviare */
    return;
  }

  /* ---------------- PUBBLICO: segue, ma non può superare il limite ---------------- */
  let S = {},
    lim = 0,
    pend = true,
    rot = false;
  const limOf = (s) => (L.limite === "massimo" ? Math.max(s.max || 0, s.pos || 0) : s.pos || 0);

  const css = document.createElement("style");
  css.textContent = `
    #nav,#cnt{display:none!important}
    #lv-bar [hidden]{display:none!important}
    #lv-bar{position:fixed;left:0;right:0;bottom:0;height:calc(76px + env(safe-area-inset-bottom,0px));display:flex;
      align-items:flex-end;justify-content:center;gap:6px;padding:0 max(10px,env(safe-area-inset-right,0px)) calc(4px + env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px));
      background:var(--vd);color:#fff;z-index:50;font:600 14px Montserrat,sans-serif;user-select:none}
    #lv-bar button{box-sizing:border-box;border:0;border-radius:12px;height:44px;min-width:44px;flex:0 0 auto;
      font:700 20px Montserrat,sans-serif;background:var(--v);color:#fff;cursor:pointer}
    #lv-bar button:disabled{opacity:.3;cursor:not-allowed}
    [data-slide-link][aria-disabled="true"]{cursor:not-allowed!important}
    #lv-bar button:active:not(:disabled){background:var(--v2)}
    #lv-bar button:focus-visible{outline:3px solid var(--y);outline-offset:2px}
    #lv-m{display:flex;align-items:center;justify-content:center}
    #lv-m svg{position:static;flex:none}
    #lv-bar button,#lv-n{transition:transform .3s}
    body.lv-rot #lv-bar button,body.lv-rot #lv-n{transform:rotate(90deg)}
    #lv-c{position:absolute;left:10px;right:10px;top:3px;height:26px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:1px;min-width:0;pointer-events:none}
    #lv-status{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:14px;
      text-align:center}
    #lv-n{font-size:11px;line-height:12px;font-variant-numeric:tabular-nums}
    #lv-l{height:44px!important;width:auto;min-width:44px!important;max-width:180px;padding:0 10px;
      background:var(--y)!important;color:var(--vd)!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #lv-l[aria-hidden="true"]{visibility:hidden}
    #lv-l svg{position:static;vertical-align:-3px;margin-right:6px}
    body.lv-rot #lv-l{width:44px;height:44px!important;padding:0;border-radius:12px!important}
    body.lv-rot #lv-l svg{margin:0}
    body.lv-rot #lv-l span{display:none}
    @media(max-width:560px){
      #lv-bar{gap:4px;padding-left:max(6px,env(safe-area-inset-left,0px));padding-right:max(6px,env(safe-area-inset-right,0px))}
      #lv-l{width:44px;padding:0!important}
      #lv-l svg{display:none}
      #lv-l span{font-size:0}
      #lv-l span:after{content:"LIVE";font-size:12px}
    }
    @media(max-width:1024px){
      body.lv-rot #lv-l{width:44px;padding:0!important}
      body.lv-rot #lv-l svg{display:none}
      body.lv-rot #lv-l span{display:inline;font-size:0}
      body.lv-rot #lv-l span:after{content:"LIVE";font-size:12px}
    }
    @media(prefers-reduced-motion:reduce){#lv-bar button,#lv-n{transition:none!important}}`;
  document.head.append(css);

  const bar = document.createElement("div");
  bar.id = "lv-bar";
  bar.innerHTML =
    '<button id="lv-p" aria-label="Slide precedente" title="Slide precedente">‹</button><button id="lv-m" aria-label="Apri ordine del giorno" title="Vai ai punti dell’ordine del giorno"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button><div id="lv-c"><span id="lv-status" role="status" aria-live="polite">In attesa della diretta</span><span id="lv-n">…</span></div><button id="lv-l" aria-label="Torna alla diretta" title="Torna alla diretta" aria-hidden="true" tabindex="-1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg><span>Torna alla diretta</span></button><button id="lv-r" aria-label="Ruota la presentazione" title="Ruota la presentazione">⟳</button><button id="lv-x" aria-label="Slide successiva" title="Slide successiva">›</button>';
  document.body.append(bar);
  ["click", "touchstart", "touchend"].forEach((ev) => bar.addEventListener(ev, (e) => e.stopPropagation()));
  const $ = (id) => bar.querySelector("#" + id);
  const bp = $("lv-p"),
    bx = $("lv-x"),
    bl = $("lv-l"),
    bn = $("lv-n");
  const mobile = matchMedia("(pointer: coarse) and (max-width: 1024px)");
  function deviceUi() {
    $("lv-r").hidden = !mobile.matches;
    if (!mobile.matches) rot = false;
    myFit();
  }
  mobile.addEventListener("change", deviceUi);

  /* ogni spostamento, da qualunque parte arrivi (swipe, menu, salti), passa da qui */
  go = (i, k) => {
    const l = dec(lim);
    i = Math.max(0, Math.min(i, scenes.length - 1));
    if (i > l.i || (i === l.i && k > l.k)) {
      i = l.i;
      k = l.k;
    }
    if (cur && cur.i === i && si === i && sk === k) {
      ui();
      return;
    }
    __go(i, k);
    ui();
  };
  function ui() {
    if (!scenes.length) return;
    const here = enc(si, sk);
    const behind = here < lim;
    bn.textContent = si + 1 + " / " + scenes.length;
    bp.disabled = !si && !sk;
    bx.disabled = here >= lim;
    bl.setAttribute("aria-hidden", String(!behind));
    bl.tabIndex = behind ? 0 : -1;
    const status = $("lv-status");
    const message = !ricevuto
      ? connesso
        ? "Collegato · in attesa della diretta"
        : erroreLive
          ? "Connessione interrotta · nuovo tentativo automatico"
          : "Connessione alla diretta in corso"
      : !connesso
        ? fallback
          ? behind
            ? "Aggiornamento automatico · stai rivedendo"
            : "Aggiornamento automatico · sei alla diretta"
          : "Connessione interrotta · nuovo tentativo automatico"
        : behind
          ? "Stai rivedendo · tocca LIVE per tornare"
          : "Collegato · sei alla diretta";
    if (status.textContent !== message) status.textContent = message;
    $("lv-m").disabled = enc(odgIdx(), 0) > lim;
    document.querySelectorAll("[data-slide-link]").forEach((el) => {
      const i = scenes.findIndex((sc) => sc.id === el.dataset.slideLink);
      el.setAttribute("aria-disabled", String(i < 0 || enc(i, 0) > lim));
    });
  }
  function on() {
    const old = lim;
    lim = limOf(S);
    if (!scenes.length) {
      pend = true;
      return;
    }
    const here = enc(si, sk);
    if (pend || here === old || here > lim) {
      const d = dec(lim);
      pend = false;
      go(d.i, d.k);
    }
    ui();
  }
  setInterval(() => {
    if (pend && scenes.length) on();
  }, 300);

  bp.onclick = () => {
    if (cur) prev();
  };
  bx.onclick = () => {
    if (cur) next();
  };
  bl.onclick = () => {
    const d = dec(lim);
    go(d.i, d.k);
  };
  $("lv-m").onclick = () => {
    if (cur && !$("lv-m").disabled) menu();
  };
  $("lv-r").onclick = () => {
    rot = !rot;
    myFit();
  };

  /* blocca i comandi originali (click, tastiera, swipe) e usa i nostri */
  let tx = 0,
    ty = 0;
  ["click", "keydown", "touchstart", "touchend"].forEach((ev) =>
    addEventListener(
      ev,
      (e) => {
        if (bar.contains(e.target)) return;
        if (ev === "click" && e.target.closest?.("[data-live-control]")) return;
        if (ev === "keydown" && e.target.closest?.("[data-live-control]") && ["Enter", " "].includes(e.key)) return;
        e.stopImmediatePropagation();
        if (!cur) return;
        if (ev === "keydown") {
          if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) {
            e.preventDefault();
            next();
          }
          if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
            e.preventDefault();
            prev();
          }
        }
        if (ev === "touchstart") {
          tx = e.touches[0].clientX;
          ty = e.touches[0].clientY;
        }
        /* in modalita' ruotata lo swipe orizzontale per chi guarda e' verticale sullo schermo */
        if (ev === "touchend") {
          const d = rot ? e.changedTouches[0].clientY - ty : e.changedTouches[0].clientX - tx;
          if (Math.abs(d) > 50) d < 0 ? next() : prev();
        }
      },
      true,
    ),
  );

  /* adattamento allo schermo del telefono (con opzione "ruota") */
  function myFit() {
    if (innerWidth > innerHeight) rot = false;
    document.body.classList.toggle("lv-rot", rot);
    window.mobileLayout.rotate(rot);
  }
  addEventListener("resize", myFit);
  addEventListener("orientationchange", () => setTimeout(myFit, 200));
  deviceUi();

  /* SSE invia anche lo stato iniziale; REST serve solo quando il flusso cade. */
  const visitor = L.nas ? window.NAS_VISITOR?.id() : null;
  const es = new EventSource(
    U + "/live/stato.json" + (visitor ? "?visitor=" + encodeURIComponent(visitor) : ""),
  );
  let connesso = false,
    lettura = false,
    ricevuto = false,
    fallback = false,
    erroreLive = false,
    versione = 0;
  const put = (m, patch) => {
    if (m.path === "/") S = patch ? Object.assign(S, m.data) : m.data || {};
    else S[m.path.slice(1)] = m.data;
    on();
  };
  const ricevi = (e, patch) => {
    connesso = true;
    ricevuto = true;
    fallback = false;
    erroreLive = false;
    versione++;
    put(JSON.parse(e.data), patch);
    bn.title = "Sincronizzazione live attiva";
    ui();
  };
  es.addEventListener("open", () => {
    connesso = true;
    fallback = false;
    erroreLive = false;
    ui();
  });
  es.addEventListener("put", (e) => ricevi(e, false));
  es.addEventListener("patch", (e) => ricevi(e, true));
  const poll = async () => {
    if (connesso || lettura) return;
    lettura = true;
    const v = versione;
    try {
      const r = await fetch(U + "/live/stato.json", { cache: "no-store" });
      if (!r.ok) throw new Error("Lettura live non riuscita (Firebase " + r.status + ")");
      const d = await r.json();
      if (!connesso && v === versione) {
        S = d || {};
        ricevuto = true;
        fallback = true;
        on();
      }
    } catch (e) {
      bn.title = "Sincronizzazione non disponibile: nuovo tentativo automatico";
      console.warn("Errore sincronizzazione live", e);
    } finally {
      lettura = false;
    }
  };
  const errore = () => {
    window.NAS_TELEMETRY?.event("stream-reconnect");
    connesso = false;
    fallback = false;
    erroreLive = true;
    versione++;
    bn.title = "Connessione live interrotta: controllo periodico attivo";
    console.warn("Connessione live interrotta; attivo il controllo REST");
    ui();
    poll();
  };
  es.addEventListener("error", errore);
  es.addEventListener("cancel", errore);
  es.addEventListener("auth_revoked", errore);
  setInterval(poll, 8000);
})();
