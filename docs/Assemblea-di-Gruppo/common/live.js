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
    let t, maxP = 0;
    const pub = () => {
      if (!scenes.length) return;
      const p = enc(si, sk); maxP = Math.max(maxP, p);
      fetch(U + '/live.json', { method: 'PUT', body: JSON.stringify({ stato: { pos: p, max: maxP }, k: L.chiave }) })
        .then(r => { dot.style.background = r.ok ? '#21A067' : '#E74030' })
        .catch(() => { dot.style.background = '#E74030' });
    };
    go = (i, k) => { __go(i, k); clearTimeout(t); t = setTimeout(pub, 150) };
    setInterval(pub, 10000);   /* si autorepara se cade la rete */
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
    [data-slide-link][aria-disabled="true"]{filter:grayscale(1);color:var(--muted)!important;cursor:not-allowed!important}
    #lv-bar button:active:not(:disabled){background:var(--v2)}
    #lv-c{flex:1;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
    #lv-l{height:26px!important;min-width:0!important;font-size:12px!important;padding:0 10px;background:var(--y)!important;color:var(--vd)!important}`;
  document.head.append(css);

  const bar = document.createElement('div'); bar.id = 'lv-bar';
  bar.innerHTML = '<button id="lv-p" aria-label="Indietro">‹</button><button id="lv-m" aria-label="Ordine del giorno" title="Vai ai punti dell’ordine del giorno" style="min-width:44px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button><div id="lv-c"><span id="lv-n">…</span><button id="lv-l" hidden>● Vai alla slide attuale</button></div><button id="lv-r" aria-label="Ruota">⟳</button><button id="lv-x" aria-label="Avanti">›</button>';
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
    __go(i, k); ui();
  };
  function ui() {
    if (!scenes.length) return;
    const here = enc(si, sk);
    bn.textContent = (si + 1) + ' / ' + scenes.length;
    bp.disabled = !si && !sk; bx.disabled = here >= lim; bl.hidden = here >= lim;
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
  let tx = 0;
  ['click', 'keydown', 'touchstart', 'touchend'].forEach(ev => addEventListener(ev, e => {
    if (bar.contains(e.target)) return;
    if (ev === 'click' && e.target.closest?.('[data-live-control]')) return;
    e.stopImmediatePropagation();
    if (!cur) return;
    if (ev === 'keydown') {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); next() }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); prev() }
    }
    if (ev === 'touchstart') tx = e.touches[0].clientX;
    if (ev === 'touchend') { const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) d < 0 ? next() : prev() }
  }, true));

  /* adattamento allo schermo del telefono (con opzione "ruota") */
  function myFit() {
    if (innerWidth > innerHeight) rot = false;
    window.mobileLayout.rotate(rot);
  }
  addEventListener('resize', myFit); addEventListener('orientationchange', () => setTimeout(myFit, 200)); deviceUi();

  /* ascolto in tempo reale (SSE) + controllo di sicurezza ogni 8 s */
  const es = new EventSource(U + '/live/stato.json');
  const put = (m, patch) => { if (m.path === '/') S = patch ? Object.assign(S, m.data) : (m.data || {}); else S[m.path.slice(1)] = m.data; on() };
  es.addEventListener('put', e => put(JSON.parse(e.data), false));
  es.addEventListener('patch', e => put(JSON.parse(e.data), true));
  const poll = () => fetch(U + '/live/stato.json').then(r => r.json()).then(d => { if (d) { S = d; on() } }).catch(() => { });
  setInterval(poll, 8000); poll();
})();
