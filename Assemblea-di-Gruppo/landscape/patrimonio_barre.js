/* ---- slide_patrimonio_barre ---- */
const bars = (r, D) => {
  const P = D.patrimonio; band(r, 'STATO PATRIMONIALE DI GRUPPO'); cnt.className = '';
  const mx = Math.max(...P.voci.flatMap(v => [v.importo_anno_precedente, v.importo_anno_corrente])), H = 290, base = 640, GW = 1040 / P.voci.length, bw = GW * .34;
  const stat = (x, a) => { const e = h(`<div class="card" style="left:${x}px;top:104px;width:430px;height:100px;padding:16px 28px"><div class="k">${P.data_riferimento} ${a}</div><div class="num" style="font-size:42px"></div></div>`); r.append(e); return e.querySelector('.num') };
  const t1 = stat(110, P.anno_precedente), t2 = stat(740, P.anno_corrente);
  const els = P.voci.map((v, i) => {
    const x = 120 + i * GW, o = [], bc = v.colore_css ? [`color-mix(in srgb,var(${v.colore_css}) 50%,transparent)`, `var(${v.colore_css})`] : v.colori_css;
    [[v.importo_anno_precedente, bc[0], 0, P.anno_precedente], [v.importo_anno_corrente, bc[1], bw + 6, P.anno_corrente]].forEach(([val, col, dx, yr]) => {
      const hh = Math.max(val / mx * H, 4);
      const b = h(`<div class="bar" style="left:${x + dx}px;bottom:${720 - base}px;width:${bw}px;background:${col}"></div>`); b.dataset.h = hh;
      const l = h(`<div class="a fade" style="left:${x + dx - 20}px;width:${bw + 40}px;text-align:center;bottom:${720 - base + hh + 6}px;font-size:13px;font-weight:700;color:var(--vd)">${val.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>`);
      r.append(b, l); o.push(b, l); r.append(h(`<div class="a" style="left:${x + dx}px;width:${bw}px;text-align:center;top:${base + 6}px;font-size:11px;opacity:.6">${yr}</div>`))
    });
    const ic = h(`<img class="a fade" src="${v.icona}" style="width:62px;left:${x + bw - 25}px;bottom:${720 - base + Math.max(v.importo_anno_precedente, v.importo_anno_corrente) / mx * H + 32}px">`); r.append(ic, h(`<div class="a" style="left:${x - 10}px;width:${2 * bw + 26}px;text-align:center;top:${base + 26}px;font-size:12px;font-weight:600">${v.nome}</div>`)); o.push(ic); return o
  });
  return { steps: P.voci.length, show(k) { let a = 0, b = 0; els.forEach((o, i) => { const on = i < k; o.forEach(e => { if (e.classList.contains('bar')) { e.style.height = on ? e.dataset.h + 'px' : '0'; e.style.opacity = on ? 1 : 0 } else e.classList.toggle('on', on) }); if (on) { a += P.voci[i].importo_anno_precedente; b += P.voci[i].importo_anno_corrente } }); counter(t1, a); counter(t2, b) } }
};

LANDSCAPE.slide_patrimonio_barre = () => bars;
