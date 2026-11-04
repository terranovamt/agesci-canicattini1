/* common/live.js — sincronizzazione live regia → pubblico (Firebase Realtime Database, via REST + SSE).
   Si appoggia al motore di index.html (go, next, prev, scenes, si, sk). */
(function () {
  const L = window.LIVE;
  if (!L || !L.url || L.ruolo === 'locale') return;
  const U = L.url.replace(/\/$/, '');
  const enc = (i, k) => i * 1000 + k;
  const dec = p => ({ i: Math.floor(p / 1000), k: p % 1000 });
  const __go = go;

  /* ---------------- REGIA: pubblica la posizione ---------------- */
  if (L.ruolo === 'regia') {
    document.title += ' (regia)';
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;top:6px;right:6px;width:9px;height:9px;border-radius:50%;background:#888;z-index:99;opacity:.7;pointer-events:none';
    document.body.append(dot);
    let t, maxP = 0, inviato = null, invio = false;
    const pub = async () => {
      if (!scenes.length) return;
      const p = enc(si, sk); maxP = Math.max(maxP, p);
      const body = JSON.stringify({ stato: { pos: p, max: maxP }, k: L.chiave });
      if (invio || body === inviato) return;
      invio = true;
      try {
        const r = await fetch(U + '/live.json', { method: 'PUT', body });
        if (!r.ok) throw new Error('Pubblicazione live non riuscita (Firebase ' + r.status + ')');
        inviato = body;
        dot.style.background = '#21A067';
      } catch (e) {
        dot.style.background = '#E74030';
        console.warn('Errore sincronizzazione live', e);
      } finally { invio = false }
      if (inviato === body && enc(si, sk) !== p) pub();
    };
    go = (i, k) => { __go(i, k); clearTimeout(t); t = setTimeout(pub, 150) };
    setInterval(pub, 10000);   /* ritenta solo le scritture fallite o ancora da inviare */
    return;
  }

  /* ---------------- PUBBLICO: segue, ma non può superare il limite ---------------- */
  let S = {}, lim = 0, pend = true, rot = false;
  const limOf = s => L.limite === 'massimo' ? Math.max(s.max || 0, s.pos || 0) : (s.pos || 0);

  const css = document.createElement('style');
  css.textContent = `
    #nav,#cnt{display:none!important}
    #lv-bar [hidden]{display:none!important}
    #lv-bar{position:fixed;left:0;right:0;bottom:0;height:64px;display:flex;align-items:center;gap:8px;padding:0 10px;
      background:var(--vd);color:#fff;z-index:50;font:600 14px Montserrat,sans-serif;user-select:none}
    #lv-bar button{border:0;border-radius:12px;height:46px;min-width:52px;font:700 22px Montserrat,sans-serif;
      background:var(--v);color:#fff;cursor:pointer}
    #lv-bar button:disabled{opacity:.3;cursor:not-allowed}
    [data-slide-link][aria-disabled="true"]{cursor:not-allowed!important}
    #lv-bar button:active:not(:disabled){background:var(--v2)}
    #lv-m{display:flex;align-items:center;justify-content:center}
    #lv-m svg{position:static;flex:none}
    #lv-bar button,#lv-n{transition:transform .3s}
    body.lv-rot #lv-bar button,body.lv-rot #lv-n{transform:rotate(90deg)}
    @media(max-width:360px){#lv-bar{gap:4px;padding:0 6px}#lv-bar button{min-width:40px}}
    #lv-c{flex:1;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
    #lv-l{height:40px!important;min-width:0!important;max-width:100%;font-size:14px!important;padding:0 12px;background:var(--y)!important;color:var(--vd)!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:360px){#lv-l{font-size:12px!important;padding:0 8px}}
    #lv-l svg{position:static;vertical-align:-3px;margin-right:6px}
    body.lv-rot #lv-l{width:46px;height:46px!important;padding:0;border-radius:50%!important}
    body.lv-rot #lv-l svg{margin:0}
    body.lv-rot #lv-l span{display:none}`;
  document.head.append(css);

  const bar = document.createElement('div'); bar.id = 'lv-bar';
  bar.innerHTML = '<button id="lv-p" aria-label="Indietro">‹</button><button id="lv-m" aria-label="Ordine del giorno" title="Vai ai punti dell’ordine del giorno" style="min-width:44px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button><div id="lv-c"><span id="lv-n">…</span><button id="lv-l" hidden aria-label="Vai alla slide attuale"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg><span>Slide attuale</span></button></div><button id="lv-r" aria-label="Ruota">⟳</button><button id="lv-x" aria-label="Avanti">›</button>';
  document.body.append(bar);
  ['click', 'touchstart', 'touchend'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation()));
  const $ = id => bar.querySelector('#' + id);
  const bp = $('lv-p'), bx = $('lv-x'), bl = $('lv-l'), bn = $('lv-n');
  const mobile = matchMedia('(pointer: coarse) and (max-width: 1024px)');
  function deviceUi() {
    $('lv-r').hidden = !mobile.matches;
    if (!mobile.matches) rot = false;
    myFit();
  }
  mobile.addEventListener('change', deviceUi);

  /* ogni spostamento, da qualunque parte arrivi (swipe, menu, salti), passa da qui */
  go = (i, k) => {
    const l = dec(lim); i = Math.max(0, Math.min(i, scenes.length - 1));
    if (i > l.i || (i === l.i && k > l.k)) { i = l.i; k = l.k }
    if (cur && cur.i === i && si === i && sk === k) { ui(); return }
    __go(i, k); ui();
  };
  function ui() {
    if (!scenes.length) return;
    const here = enc(si, sk);
    bn.textContent = (si + 1) + ' / ' + scenes.length;
    bp.disabled = !si && !sk; bx.disabled = here >= lim; bl.hidden = here >= lim; bn.hidden = here < lim;
    $('lv-m').disabled = enc(odgIdx(), 0) > lim;
    document.querySelectorAll('[data-slide-link]').forEach(el => {
      const i = scenes.findIndex(sc => sc.id === el.dataset.slideLink);
      el.setAttribute('aria-disabled', String(i < 0 || enc(i, 0) > lim));
    });
  }
  function on() {
    const old = lim; lim = limOf(S);
    if (!scenes.length) { pend = true; return }
    const here = enc(si, sk);
    if (pend || here === old || here > lim) { const d = dec(lim); pend = false; go(d.i, d.k) }
    ui();
  }
  setInterval(() => { if (pend && scenes.length) on() }, 300);

  bp.onclick = () => { if (cur) prev() };
  bx.onclick = () => { if (cur) next() };
  bl.onclick = () => { const d = dec(lim); go(d.i, d.k) };
  $('lv-m').onclick = () => { if (cur && !$('lv-m').disabled) menu() };
  $('lv-r').onclick = () => { rot = !rot; myFit() };

  /* blocca i comandi originali (click, tastiera, swipe) e usa i nostri */
  let tx = 0, ty = 0;
  ['click', 'keydown', 'touchstart', 'touchend'].forEach(ev => addEventListener(ev, e => {
    if (bar.contains(e.target)) return;
    if (ev === 'click' && e.target.closest?.('[data-live-control]')) return;
    e.stopImmediatePropagation();
    if (!cur) return;
    if (ev === 'keydown') {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); next() }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); prev() }
    }
    if (ev === 'touchstart') { tx = e.touches[0].clientX; ty = e.touches[0].clientY }
    /* in modalita' ruotata lo swipe orizzontale per chi guarda e' verticale sullo schermo */
    if (ev === 'touchend') { const d = rot ? e.changedTouches[0].clientY - ty : e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) d < 0 ? next() : prev() }
  }, true));

  /* adattamento allo schermo del telefono (con opzione "ruota") */
  function myFit() {
    if (innerWidth > innerHeight) rot = false;
    document.body.classList.toggle('lv-rot', rot);
    window.mobileLayout.rotate(rot);
  }
  addEventListener('resize', myFit); addEventListener('orientationchange', () => setTimeout(myFit, 200)); deviceUi();

  /* SSE invia anche lo stato iniziale; REST serve solo quando il flusso cade. */
  const es = new EventSource(U + '/live/stato.json');
  let connesso = false, lettura = false, versione = 0;
  const put = (m, patch) => { if (m.path === '/') S = patch ? Object.assign(S, m.data) : (m.data || {}); else S[m.path.slice(1)] = m.data; on() };
  const ricevi = (e, patch) => {
    put(JSON.parse(e.data), patch);
    connesso = true; versione++;
    bn.title = 'Sincronizzazione live attiva';
  };
  es.addEventListener('put', e => ricevi(e, false));
  es.addEventListener('patch', e => ricevi(e, true));
  const poll = async () => {
    if (connesso || lettura) return;
    lettura = true;
    const v = versione;
    try {
      const r = await fetch(U + '/live/stato.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('Lettura live non riuscita (Firebase ' + r.status + ')');
      const d = await r.json();
      if (!connesso && v === versione) { S = d || {}; on() }
    } catch (e) {
      bn.title = 'Sincronizzazione non disponibile: nuovo tentativo automatico';
      console.warn('Errore sincronizzazione live', e);
    } finally { lettura = false }
  };
  const errore = () => {
    connesso = false; versione++;
    bn.title = 'Connessione live interrotta: controllo periodico attivo';
    console.warn('Connessione live interrotta; attivo il controllo REST');
    poll();
  };
  es.addEventListener('error', errore);
  es.addEventListener('cancel', errore);
  es.addEventListener('auth_revoked', errore);
  setInterval(poll, 8000);
})();
