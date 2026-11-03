/* ---- slide_ordine_del_giorno (punti: stringhe oppure {testo, slide_collegata}) ---- */
const odg = x => (r, D) => {
  band(r, x.titolo_barra || 'ORDINE DEL GIORNO'); cnt.className = '';
  const L = x.punti.map(p => typeof p === 'string' ? { testo: p } : p), gap = Math.min(104, 520 / L.length);
  const els = L.map((p, i) => {
    const e = h(`<div class="row" style="left:90px;width:1100px;height:${gap - 16}px;top:${126 + i * gap}px;gap:26px;padding:0 28px;border-left:10px solid ${C[i % 5]}"><div style="width:54px;height:54px;border-radius:50%;background:var(--v);color:var(--y);font:800 28px Montserrat,sans-serif;display:flex;align-items:center;justify-content:center;flex:none">${i + 1}</div><span style="font-size:24px;font-weight:600;color:var(--vd);line-height:1.25">${p.testo}</span></div>`);
    if (p.slide_collegata) { e.style.cursor = 'pointer'; e.onclick = ev => { ev.stopPropagation(); jump(p.slide_collegata) } }
    r.append(e); return e
  });
  return { steps: L.length, show(k) { els.forEach((e, i) => { e.classList.toggle('on', i < k); e.style.background = i === k - 1 ? 'var(--w)' : 'var(--w72)' }) } }
};

LANDSCAPE.slide_ordine_del_giorno = odg;
