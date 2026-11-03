/* Motore della presentazione: navigazione, caricamento di dati.js, adattamento dei titoli. */

/* ---- motore ---- */
let BN = 0, D, scenes = [], si = 0, sk = 0, cur = null, saved = null; const nav = h('<div id="nav"></div>'),
  bH = h('<button class="nb" title="Prima slide (H)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg></button>'),
  bM = h('<button class="nb" title="Ordine del giorno (M)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>'),
  bB = h('<button class="nb" title="Torna alla slide da cui eri partito (R)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span></span></button>');
nav.append(bH, bM, bB); st.append(nav); bH.style.display = bM.style.display = bB.style.display = 'none';
const odgIdx = () => Math.max(0, scenes.findIndex(s => s.tipo === 'slide_ordine_del_giorno'));
const home = () => { const i = Math.min(1, scenes.length - 1); if (scenes.length && si !== i) { saved = { i: si, k: sk }; go(i, 0) } };
const menu = () => { const t = odgIdx(); if (si !== t) { saved = { i: si, k: sk }; go(t, 0); go(t, cur.steps) } };
const jump = id => { const t = scenes.findIndex(s => s.id === id); if (t < 0) return; saved = { i: si, k: sk }; go(t, 0) };
const back = () => { if (saved) { const q = saved; saved = null; go(q.i, q.k) } };
bH.onclick = e => { e.stopPropagation(); home() }; bM.onclick = e => { e.stopPropagation(); menu() }; bB.onclick = e => { e.stopPropagation(); back() };
function go(i, k) {
  if (!cur || cur.i !== i) {
    const old = cur, r = h('<div class="slide"></div>'); st.insertBefore(r, HD);
    cur = { i, r, ...scenes[i].f(r, D) };
    if (INST) { r.classList.add('nt', 'in'); requestAnimationFrame(() => requestAnimationFrame(() => r.classList.remove('nt'))) }
    else requestAnimationFrame(() => requestAnimationFrame(() => r.classList.add('in')));
    if (old) { old.r.classList.remove('in'); old.r.classList.add('out'); setTimeout(() => old.r.remove(), 1000) }
    /* barra fissa: appare/scompare, e il testo cambia solo se è diverso */
    const t = r.dataset.hd, was = !HD.classList.contains('off');
    HD.classList.toggle('off', t === undefined);
    if (t !== undefined && HDs.textContent !== t) {
      if (!was || INST) { HDs.textContent = t; fitHd() }
      else { HDs.style.opacity = 0; setTimeout(() => { HDs.textContent = t; fitHd(); HDs.style.opacity = 1 }, 220) }
    }
  }
  if (saved && i === saved.i) saved = null; si = i; sk = k; cur.show(k); ph.style.opacity = scenes[i].ph ? 1 : 0;
  badge(scenes[i].b !== undefined ? scenes[i].b + k + 1 : null, BN);
  bB.style.display = saved && i !== saved.i ? 'flex' : 'none'; if (saved) bB.lastChild.textContent = 'Slide ' + (saved.i + 1); bH.style.display = i !== Math.min(1, scenes.length - 1) ? 'flex' : 'none'; bM.style.display = i !== odgIdx() ? 'flex' : 'none'; prog.style.width = ((i + 1) / scenes.length * 100) + '%';
  [...pm.children].forEach(e => { const j = +e.dataset.i; e.classList.toggle('nx', j === i + 1 && k >= cur.steps) }); cnt.textContent = (i + 1) + ' / ' + scenes.length; history.replaceState(null, '', '#' + i + '.' + k)
}
const next = () => { if (sk < cur.steps) go(si, sk + 1); else if (si < scenes.length - 1) go(si + 1, 0) };
const prev = () => { if (sk > 0) go(si, sk - 1); else if (si > 0) { const n = si - 1; go(n, 0); go(n, cur.steps) } };
addEventListener('keydown', e => { if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); next() } if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) prev(); if (e.key === 'h') home(); if (e.key === 'm') menu(); if (e.key === 'r') back(); if (e.key === 'f') toggleFullscreen() });
addEventListener('click', e => e.clientX < innerWidth * .2 ? prev() : next());
let tx; addEventListener('touchstart', e => tx = e.touches[0].clientX); addEventListener('touchend', e => { const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) { e.preventDefault(); d < 0 ? next() : prev() } });

/* nomi vecchi -> nomi nuovi (i vecchi dati.js continuano a funzionare) */
const ALIAS = { titolo: 'slide_titolo', sezione: 'slide_divisore_sezione', regolamento: 'slide_testo_articoli', testo: 'slide_testo_articoli', odg: 'slide_ordine_del_giorno', odg_stato: 'slide_avanzamento_odg', quorum: 'slide_quorum_convocazioni', organo: 'slide_composizione_organo', bilancio_cassa: 'slide_rendiconto_entrate_uscite', confronto: 'slide_rendiconto_scontrino_esito', andamento: 'slide_rendiconto_andamento_avanzo', patrimonio_barre: 'slide_patrimonio_barre', patrimonio_ciambella: 'slide_patrimonio_ciambella', foto: 'slide_foto_gruppo', grazie: 'slide_grazie' };
/* tipi di slide disponibili: registrati dai file in landscape/ (portrait/base.js li adatta al verticale) */
const T = { ...LANDSCAPE };
function start(data) {
  INST = started; started = true;
  D = { ...data, slide: (data.slide || []).map(x => ({ ...x, tipo: ALIAS[x.tipo] || x.tipo })) };
  document.getElementById('msg').style.display = 'none';
  st.querySelectorAll('.slide').forEach(e => e.remove()); cur = null; saved = null;
  const ST = { slide_rendiconto_entrate_uscite: D => D.entrate.length + 1 + D.uscite.length, slide_rendiconto_scontrino_esito: () => 3, slide_rendiconto_andamento_avanzo: () => 0, slide_patrimonio_barre: D => D.patrimonio.voci.length, slide_patrimonio_ciambella: () => 0 }; let base = 0;
  D.slide.forEach(x => { if (!x.nascosta && !T[x.tipo]) console.warn('Tipo di slide sconosciuto in dati.js:', x.tipo) });
  scenes = D.slide.filter(x => !x.nascosta && T[x.tipo]).map(x => { const o = { f: T[x.tipo](x), ph: x.tipo === 'slide_foto_gruppo' || x.tipo === 'slide_grazie', id: x.id, tipo: x.tipo, x }; if (ST[x.tipo]) { o.b = base; base += ST[x.tipo](D) + 1 } return o }); BN = base;
  pm.innerHTML = ''; const nP = (D.slide.find(q => q.tipo === 'slide_ordine_del_giorno') || { punti: [] }).punti.length;
  scenes.forEach((sc, i) => { if (sc.tipo === 'slide_ordine_del_giorno' || sc.tipo === 'slide_avanzamento_odg') { const n = sc.tipo === 'slide_ordine_del_giorno' ? '1' : (sc.x.completati >= nP ? '✓' : String((sc.x.completati || 0) + 1)); const e = h(`<div class="pmk" style="left:${(i + 1) / scenes.length * 100}%"><b>${n}</b></div>`); e.dataset.i = i; pm.append(e) } });
  const [a, b] = location.hash.slice(1).split('.').map(Number); go(Math.min(a || 0, scenes.length - 1), b || 0); INST = false
}
/* carica dati.js e lo ricontrolla ogni 2 secondi: se cambia, la presentazione si ricostruisce restando dov'eri */
let last = null;
function load(first) { loadDati(first) }
/* dati effettivi = dati.js + eventuali modifiche live da Firebase (common/modifiche.js) */
function refreshDati() {
  const M = window.MODIFICHE, base = window.DATI_BASE;
  if (!base || (M && !M.ready)) return;
  const data = M ? M.applyPatch(base, M.patch) : base, j = JSON.stringify(data);
  window.DATI = data;
  if (j !== last) { last = j; start(data) }
}
function loadDati(first) {
  const s = document.createElement('script'); s.src = 'dati.js?t=' + Date.now();
  s.onload = () => { s.remove(); if (!window.DATI) { if (first) document.getElementById('msg').style.display = 'flex'; return } window.DATI_BASE = window.DATI; refreshDati() };
  s.onerror = () => { s.remove(); if (first) document.getElementById('msg').style.display = 'flex' };
  document.head.append(s);
}

/* titoli: il font si riduce se serve (barra e modifiche: max 2 righe; titolo/sezione: max 3 righe) */
(function () {
  const css = document.createElement('style');
  css.textContent = '.hd span{line-height:1.05;flex:1;min-width:0;padding-right:16px;overflow-wrap:anywhere}.sec h1,.mod .mt{overflow-wrap:anywhere}';
  document.head.append(css);
  const fit = (el, max, min, lines = 2, maxH = 1e9) => {
    for (let f = max; f >= min; f--) {
      el.style.fontSize = f + 'px';
      const lh = parseFloat(getComputedStyle(el).lineHeight) || f * 1.15;
      if (el.offsetHeight <= Math.min(lines * lh, maxH) + 2) break;
    }
  };
  const all = () => {
    fit(HDs, 30, 14, 2);
    st.querySelectorAll('.sec h1').forEach(e => fit(e, 68, 24, 3));
    st.querySelectorAll('.mod .mt').forEach(e => fit(e, 30, 16, 2, 60));
  };
  new MutationObserver(all).observe(HDs, { childList: true, characterData: true });
  new MutationObserver(all).observe(st, { childList: true });
  if (document.fonts) document.fonts.ready.then(all);
})();
