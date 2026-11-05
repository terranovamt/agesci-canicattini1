/* ---- slide_composizione_organo ---- */
const organo = x => (r, D) => {
  band(r, x.titolo_barra || 'COMPOSIZIONE ORGANO ASSEMBLEARE'); cnt.className = '';
  const P = x.persone, n = P.length, cw = 250, g = 30, x0 = (1280 - (n * cw + (n - 1) * g)) / 2;
  const els = P.map((p, i) => {
    const e = h(`<div class="card fade" style="left:${x0 + i * (cw + g)}px;top:140px;width:${cw}px;height:360px;padding:26px 18px;text-align:center"><div style="display:inline-block;background:var(--y);color:var(--vd);font-weight:800;font-size:14px;letter-spacing:1.5px;padding:6px 16px;border-radius:20px">${p.ruolo.toUpperCase()}</div><div style="width:120px;height:120px;margin:24px auto 20px;border-radius:50%;background:linear-gradient(135deg,var(--v),var(--v2));display:flex;align-items:center;justify-content:center;font-size:58px;box-shadow:0 10px 24px var(--shadow-strong)">${p.icona}</div><div style="font-size:26px;font-weight:800;color:var(--vd)">${p.nome}</div><div style="font-size:14px;font-weight:500;margin-top:10px;opacity:.75;line-height:1.4">${p.nota || ''}</div></div>`);
    r.append(e); return e
  });
  if (x.nota_generale) r.append(h(`<div class="card fade on" style="left:${x0}px;top:545px;width:${n * cw + (n - 1) * g}px;height:76px;display:flex;align-items:center;justify-content:center;padding:0 28px;background:var(--note);font-size:16px;font-weight:600;text-align:center">${x.nota_generale}</div>`));
  return { steps: n, show(k) { els.forEach((e, i) => e.classList.toggle('on', i < k)) } }
};

LANDSCAPE.slide_composizione_organo = organo;
