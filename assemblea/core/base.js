/* Funzioni comuni: elementi del palco, formattazione, contatori, grafici.
   LANDSCAPE raccoglie i tipi di slide orizzontali (un file per tipo in slides/landscape/). */

const pm = document.getElementById('pm');
const ph = document.getElementById('ph'), st = document.getElementById('stage'), prog = document.getElementById('prog'), cnt = document.getElementById('cnt');
const HD = document.getElementById('hdr'), HDs = HD.querySelector('span');
let INST = false, started = false;   /* INST = ricostruzione "istantanea" (dopo modifica a dati.js) */
const V = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = [1, 2, 3, 4, 5, 6].map(i => V('--c' + i));
const fmt = n => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−') + '€';
const sum = a => a.reduce((s, x) => s + x, 0), NS = 'http://www.w3.org/2000/svg';
const h = s => { const d = document.createElement('div'); d.innerHTML = s.trim(); return d.firstElementChild };
const fitTitle = (el, max, min, lines = 2, maxH = 1e9) => {
  for (let f = max; f >= min; f--) {
    el.style.fontSize = f + 'px';
    const lh = parseFloat(getComputedStyle(el).lineHeight) || f * 1.15;
    if (el.offsetHeight <= Math.min(lines * lh, maxH) + 2) break;
  }
};
const fitHd = () => fitTitle(HDs, 30, 14, 2);
function fit() { const k = Math.min(innerWidth / 1280, innerHeight / 720); st.style.transform = `translate(${(innerWidth - 1280 * k) / 2}px,${(innerHeight - 720 * k) / 2}px) scale(${k})` }
addEventListener('resize', fit); fit();
function counter(el, to, dur = 1000) {
  if (INST) dur = 1;
  const from = el._v || 0; el._v = to; const t0 = performance.now(); cancelAnimationFrame(el._r);
  (function f(t) { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) el._r = requestAnimationFrame(f) })(t0)
}
/* la barra del titolo ora è fissa: la slide dichiara solo il suo titolo */
const band = (r, t) => { r.dataset.hd = t };
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen && document.fullscreenEnabled !== false)
      await document.documentElement.requestFullscreen();
    else alert('Questo browser non supporta lo schermo intero. Su iPhone: apri in Safari, tocca Condividi > Aggiungi alla schermata Home, poi apri la presentazione dalla nuova icona.');
  } catch (error) {
    console.error('Impossibile attivare lo schermo intero:', error);
    alert('Impossibile attivare lo schermo intero. Controlla le impostazioni del browser.');
  }
}
function linkSlide(el, point) {
  if (!point.slide_collegata) return;
  el.dataset.liveControl = '';
  el.dataset.slideLink = point.slide_collegata;
  el.style.cursor = 'pointer';
  el.onclick = ev => {
    ev.stopPropagation();
    if (el.getAttribute('aria-disabled') !== 'true') jump(point.slide_collegata);
  };
}
function pieTransition(from, to, start, end, el) {
  const lo = Math.max(Math.min(from, to), start), hi = Math.min(Math.max(from, to), end);
  if (INST || from === to || hi <= lo) { el.style.transition = 'none'; return }
  const distance = Math.abs(from - to),
    t0 = (from > to ? from - hi : lo - from) / distance,
    t1 = (from > to ? from - lo : hi - from) / distance;
  el.style.transition = `stroke-dasharray ${(t1 - t0) * 1.2}s linear ${t0 * 1.2}s`;
}
function receiptReveal(showStamp, showPanel) {
  let stampTimer, panelTimer;
  return final => {
    clearTimeout(stampTimer); clearTimeout(panelTimer);
    showStamp(final && INST); showPanel(final && INST);
    if (final && !INST) {
      stampTimer = setTimeout(() => showStamp(true), 1000);
      panelTimer = setTimeout(() => showPanel(true), 1500);
    }
  };
}
function donut(r, cx, cy, rad, w, n, cols) {
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('width', 1280); s.setAttribute('height', 720);
  const L = 2 * Math.PI * rad, sg = []; for (let i = 0; i < n; i++) {
    const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'seg');
    Object.entries({ cx, cy, r: rad, fill: 'none', stroke: cols[i % cols.length], 'stroke-width': w, transform: `rotate(-90 ${cx} ${cy})`, 'stroke-dasharray': `0 ${L}`, 'stroke-dashoffset': 0 }).forEach(([k, v]) => c.setAttribute(k, v)); s.append(c); sg.push(c)
  }
  r.append(s); return v => { const t = sum(v) || 1; let a = 0; sg.forEach((c, i) => { const x = v[i] || 0, l = x / t * L; c.setAttribute('stroke-dasharray', `${Math.max(0, l - 3)} ${L}`); c.setAttribute('stroke-dashoffset', -a / t * L); a += x }) }
}
const centre = (r, cx, cy, lab) => { const e = h(`<div class="a" style="left:${cx - 130}px;top:${cy - 45}px;width:260px;text-align:center"><div class="k">${lab}</div><div class="num" style="font-size:27px"></div></div>`); r.append(e); return e.querySelector('.num') };

/* contatore passi: anello di avanzamento nella barra fissa (n = null lo nasconde) */
function badge(n, N) {
  let e = HD.querySelector('.bdg'); const R = 25, Lc = 2 * Math.PI * R;
  if (!e) { e = h(`<div class="bdg"><svg width="60" height="60" style="position:relative;overflow:visible"><circle cx="30" cy="30" r="${R}" fill="none" style="stroke:var(--w)" stroke-opacity=".3" stroke-width="4"/><circle class="pg" cx="30" cy="30" r="${R}" fill="none" stroke-width="4" stroke-linecap="round" transform="rotate(-90 30 30)" stroke-dasharray="0 ${Lc}" style="stroke:var(--y);transition:stroke-dasharray .5s"/><text x="30" y="35" text-anchor="middle" style="fill:var(--w)" font-weight="700" font-family="Montserrat,sans-serif"></text></svg></div>`); HD.insertBefore(e, HD.querySelector('img')) }
  e.style.display = n == null ? 'none' : '';
  if (n == null) return;
  e.querySelector('.pg').setAttribute('stroke-dasharray', `${n / N * Lc} ${Lc}`);
  const t = e.querySelector('text'); t.textContent = n; t.setAttribute('font-size', N > 99 ? 13 : 16)
}

/* tipi di slide orizzontali: ogni file slides/landscape/<tipo>.js aggiunge il suo */
const LANDSCAPE = {};
