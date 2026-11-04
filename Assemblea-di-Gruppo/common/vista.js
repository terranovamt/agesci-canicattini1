/* common/vista.js — modalità usate dalla dashboard regia (regia.html).
   ?vista=principale&regia=…  regia vera (pubblica su Firebase), comandata dalla dashboard
   ?vista=anteprima            slide successiva, solo da guardare
   ?vista=schermo              finestra con sole slide per proiettore o condivisione schermo
   Le finestre dello stesso browser si parlano con BroadcastChannel. */
(function () {
  const L = window.LIVE || {}, V = L.vista;
  if (!V) return;
  document.documentElement.classList.add('vista', 'vista-' + V);
  const css = document.createElement('style');
  css.textContent = `#nav,#cnt,#lv-bar{display:none!important}
    .vista-schermo.idle,.vista-schermo.idle *{cursor:none!important}
    #vs-hint{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;background:rgba(33,22,56,.85);color:#fff;
      font:600 15px Montserrat,sans-serif;padding:10px 18px;border-radius:99px;pointer-events:none;transition:opacity .4s}
    :fullscreen #vs-hint,#vs-hint.off{opacity:0}`;
  document.head.append(css);
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('assemblea-schermo') : null;
  const send = m => { try { ch && ch.postMessage(m) } catch (e) { } };
  const clamp = (i, k) => {
    i = Math.max(0, Math.min(i | 0, scenes.length - 1));
    return [i, Math.max(0, k | 0)];
  };
  let pending = null;
  const vai = (i, k, istantaneo) => {
    if (!scenes.length) { pending = [i, k, istantaneo]; return }
    [i, k] = clamp(i, k);
    if (cur && si === i && sk === k) return;
    const was = INST; if (istantaneo) INST = true;
    try { go(i, k) } finally { INST = was }
  };
  const __start = start;
  start = data => { __start(data); if (pending) { const p = pending; pending = null; vai(...p) } };

  /* blocca click, tastiera e swipe originali: comanda solo la dashboard */
  const KEYS = { ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next', Enter: 'next', ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev' };
  ['click', 'keydown', 'touchstart', 'touchend', 'wheel'].forEach(ev => addEventListener(ev, e => {
    e.stopImmediatePropagation();
    if (ev === 'keydown' && KEYS[e.key]) { e.preventDefault(); if (V === 'schermo') send({ tipo: 'cmd', c: KEYS[e.key] }) }
    if (ev === 'click' && V === 'schermo') {
      if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => { });
    }
  }, true));

  const stato = () => ({
    i: si, k: sk, steps: cur ? cur.steps : 0, n: scenes.length,
    titoli: scenes.map(s => {
      const t = (s.x.titolo || s.x.titolo_barra || s.x.nome || s.tipo.replace(/^slide_/, '').replace(/_/g, ' '));
      return String(t).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
    })
  });
  const API = { stato, vai, onchange: null };

  if (V === 'principale') {
    const __go = go;
    go = (i, k) => {
      __go(i, k);
      send({ tipo: 'pos', i: si, k: sk });
      try { API.onchange && API.onchange(stato()) } catch (e) { }
    };
    const __refresh = refreshDati;
    let ultima;
    refreshDati = () => {
      __refresh();
      const M = window.MODIFICHE, j = M && M.ready ? JSON.stringify(M.patch === undefined ? null : M.patch) : undefined;
      if (j !== undefined && j !== ultima) { ultima = j; send({ tipo: 'patch', patch: JSON.parse(j) }) }
    };
    if (ch) ch.onmessage = e => {
      const m = e.data || {};
      if (m.tipo === 'ciao') {
        const M = window.MODIFICHE;
        if (M && M.ready) send({ tipo: 'patch', patch: M.patch === undefined ? null : M.patch });
        if (scenes.length) send({ tipo: 'pos', i: si, k: sk });
      }
      if (m.tipo === 'cmd' && cur) { if (m.c === 'next') next(); if (m.c === 'prev') prev() }
    };
    Object.assign(API, {
      next: () => cur && next(), prev: () => cur && prev(), home: () => cur && home(), menu: () => cur && menu(),
      pdf: () => typeof exportPdf === 'function' && exportPdf()
    });
  }

  /* le modifiche live arrivano subito dalla regia, senza aspettare il controllo ogni 10 s */
  function applicaPatch(m) {
    const M = window.MODIFICHE;
    if (m.tipo !== 'patch' || !M) return;
    M.patch = m.patch === null ? undefined : m.patch; M.ready = true; refreshDati();
  }
  if (V === 'anteprima' && ch) ch.onmessage = e => applicaPatch(e.data || {});

  if (V === 'schermo') {
    document.title = 'Schermo — Assemblea di Gruppo';
    const hint = document.createElement('div'); hint.id = 'vs-hint';
    hint.textContent = 'Clicca per lo schermo intero';
    document.body.append(hint);
    setTimeout(() => hint.classList.add('off'), 6000);
    let idle;
    addEventListener('mousemove', () => {
      document.documentElement.classList.remove('idle'); clearTimeout(idle);
      idle = setTimeout(() => document.documentElement.classList.add('idle'), 2000);
    }, true);
    let seguito = false;
    if (ch) ch.onmessage = e => {
      const m = e.data || {};
      if (m.tipo === 'pos') { seguito = true; vai(m.i, m.k) }
      applicaPatch(m);
    };
    send({ tipo: 'ciao' });
    /* senza dashboard aperta nello stesso browser: parte dalla posizione live */
    setTimeout(() => {
      if (seguito || !L.url) return;
      fetch(L.url.replace(/\/$/, '') + '/live/stato.json').then(r => r.json())
        .then(s => { if (!seguito && s && typeof s.pos === 'number') vai(Math.floor(s.pos / 1000), s.pos % 1000, true) }).catch(() => { });
    }, 1500);
  }

  window.VISTA = API;
})();
