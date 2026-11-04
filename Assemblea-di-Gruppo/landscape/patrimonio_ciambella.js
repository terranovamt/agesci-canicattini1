/* ---- slide_patrimonio_ciambella: esplosione a raggiera.
   1. i pezzi si colorano e il totale conta  2. i pezzi si staccano  3. compaiono icona, linea e importo
   Le casse a zero non hanno pezzo: compaiono per ultime, staccate, in alto a destra. */
function relax(ys, gap = 76, lo = 100, hi = 620) {
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  const ex = ys.length ? ys[ys.length - 1] - hi : 0;
  if (ex > 0) for (let i = 0; i < ys.length; i++) ys[i] -= ex;
  if (ys.length && ys[0] < lo) ys[0] = lo;
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  return ys;
}
const pie = (r, D) => {
  const P = D.patrimonio; band(r, 'STATO PATRIMONIALE DI GRUPPO'); cnt.className = '';
  const cx = 640, cy = 395, R = 150, W = 105, EX = 24, L = 2 * Math.PI * R;
  const cols = [1, 2, 3, 4, 5, 6].map(i => V('--pie' + i));
  const ord = [5, 1, 4, 3, 2, 0].map(i => P.voci[i]);   /* ordine dei pezzi: C/C, Co.Ca., E/G, R/S, L/C, Beni durevoli */
  const T = sum(ord.map(x => x.importo_anno_corrente)); let a = 0;
  const S = ord.map((x, i) => ({ x, col: cols[i], v: x.importo_anno_corrente })).filter(s => s.v > 0);
  S.forEach(s => { s.f = s.v / T; s.a0 = a; a += s.f; s.mid = (s.a0 + s.f / 2) * 2 * Math.PI - Math.PI / 2; s.cos = Math.cos(s.mid); s.sin = Math.sin(s.mid) });
  const zero = ord.filter(x => !x.importo_anno_corrente);
  const mk = (t, o) => { const e = document.createElementNS(NS, t); Object.entries(o).forEach(([k, v]) => e.setAttribute(k, v)); return e };
  const svg = mk('svg', { width: 1280, height: 720 });
  svg.append(mk('circle', { cx, cy, r: R, fill: 'none', stroke: V('--track'), 'stroke-width': W, opacity: .55 }));
  const segs = S.map(s => {
    const g = mk('g', {}); g.style.transition = 'transform .9s cubic-bezier(.2,.9,.3,1.25)';
    const c = mk('circle', { cx, cy, r: R, fill: 'none', stroke: s.col, 'stroke-width': W, transform: `rotate(-90 ${cx} ${cy})`, 'stroke-dasharray': `0 ${L}`, 'stroke-dashoffset': -s.a0 * L });
    c.style.transition = 'stroke-dasharray .7s ease'; g.append(c); svg.append(g); return { g, c, s }
  });
  r.append(svg);
  const ls = mk('svg', { width: 1280, height: 720 }); r.append(ls);
  const ct = centre(r, cx, cy, 'Totale');
  const items = [], G = [[], []];
  S.forEach(s => G[s.cos < 0 ? 0 : 1].push(s));
  G.forEach((g, k) => {
    g.sort((p, q) => p.sin - q.sin);
    const ys = relax(g.map(s => cy + (R + W / 2 + EX + 30) * s.sin - 34));
    g.forEach((s, j) => {
      const ax = cx + (R + W / 2 + EX) * s.cos, ay = cy + (R + W / 2 + EX) * s.sin, mx = cx + (R + EX) * s.cos, my = cy + (R + EX) * s.sin;
      const lx = k ? cx + 300 : cx - 300, ly = ys[j] + 34;
      const ln = mk('path', { d: `M${ax} ${ay} L${k ? cx + 270 : cx - 270} ${ly} L${lx} ${ly}`, fill: 'none', stroke: s.col, 'stroke-width': 3, 'stroke-linecap': 'round', pathLength: 1 });
      ln.style.strokeDasharray = 1; ln.style.strokeDashoffset = 1; ln.style.transition = 'stroke-dashoffset .7s ease'; ls.append(ln);
      const lb = h(`<div class="lb" style="left:${k ? lx + 8 : lx - 258}px;top:${ys[j]}px;text-align:${k ? 'left' : 'right'}"><div class="bv">${fmt(s.v)}</div><div class="bn">${s.x.nome} · <b>${Math.round(s.f * 1000) / 10}%</b></div></div>`);
      const md = h(`<div class="md" style="left:${mx - 27}px;top:${my - 27}px;border-color:${s.col}"><img src="${s.x.icona}" onerror="this.style.display='none'"></div>`);
      r.append(lb, md); items.push({ s, ln, lb, md });
    })
  });
  let zb = null;
  if (zero.length) {
    zb = h('<div class="zbox"></div>');
    zero.forEach(x => zb.append(h(`<div class="zb fade"><div class="md" style="border-color:var(${x.colore_css || '--vl'})"><img src="${x.icona}" onerror="this.style.display='none'"></div><div><div class="bv">${fmt(0)}</div><div class="bn">${x.nome}</div></div></div>`)));
    r.append(zb);
  }
  if (D.nota_beni_durevoli) r.append(h(`<div class="a" style="left:140px;right:140px;bottom:14px;text-align:center;font-size:13px;opacity:.65">${D.nota_beni_durevoli}</div>`));
  const tm = [], at = (ms, f) => tm.push(setTimeout(f, ms));
  const full = sg => sg.c.setAttribute('stroke-dasharray', `${Math.max(0, sg.s.f * L - 3)} ${L}`);
  return {
    steps: 0, show() {
      tm.forEach(clearTimeout); tm.length = 0;
      r.classList.add('nt');
      segs.forEach(sg => { sg.c.setAttribute('stroke-dasharray', `0 ${L}`); sg.g.style.transform = 'none' });
      items.forEach(o => { o.ln.style.strokeDashoffset = 1; o.lb.classList.remove('on'); o.md.classList.remove('on') });
      if (zb) [...zb.children].forEach(e => e.classList.remove('on'));
      ct._v = 0; ct.textContent = fmt(0); r.offsetWidth; r.classList.remove('nt');
      const tE = 400 + segs.length * 220 + 900;
      at(400, () => counter(ct, T, 1600));
      segs.forEach((sg, i) => at(400 + i * 220, () => full(sg)));
      at(tE, () => segs.forEach(sg => { sg.g.style.transform = `translate(${sg.s.cos * EX}px,${sg.s.sin * EX}px)` }));
      items.forEach(o => { const i = S.indexOf(o.s), t = tE + 500 + i * 350; at(t, () => o.md.classList.add('on')); at(t + 250, () => { o.ln.style.strokeDashoffset = 0; o.lb.classList.add('on') }) });
      if (zb) at(tE + 500 + items.length * 350 + 600, () => [...zb.children].forEach(e => e.classList.add('on')));
    }
  }
};

LANDSCAPE.slide_patrimonio_ciambella = () => pie;
