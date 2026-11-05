/* ---- slide_differenze: confronto vecchio/nuovo in UNA slide ----
   campi: titolo_barra, colonne: [{titolo, sottotitolo, colore, simbolo, larghezza, voci: []}], nota: {etichetta, testo}
   ad ogni click compare una colonna (poi la nota in fondo) */
const differenze = x => (r, D) => {
  band(r, x.titolo_barra || 'VECCHIO E NUOVO PROGETTO'); cnt.className = '';
  const C = x.colonne || [], tot = 1184, gp = 20, defW = (tot - gp * (C.length - 1)) / (C.length || 1); let lx = 48;
  const els = C.map(c => {
    const w = c.larghezza || defW, e = h(`<div class="card fade pe-d" style="left:${lx}px;top:104px;width:${w}px;height:470px;border-top:12px solid ${c.colore || 'var(--v)'};padding:26px 30px;overflow:hidden"><div style="font-weight:800;font-size:28px;line-height:1.1">${c.titolo}</div><div style="font-size:14px;font-weight:700;opacity:.65;margin-top:4px;letter-spacing:1px">${c.sottotitolo || ''}</div><div class="pe-v">${(c.voci || []).map(v => `<div style="display:flex;gap:12px;margin-top:16px;line-height:1.3;font-weight:500"><span style="color:${c.colore || 'var(--v)'};font-weight:800">${c.simbolo || '●'}</span><span>${v}</span></div>`).join('')}</div></div>`);
    e.querySelector('.pe-v').style.fontSize = '20px'; lx += w + gp; r.append(e); return e
  });
  const nt = x.nota ? h(`<div class="fade" style="position:absolute;left:48px;right:48px;top:594px;height:70px;background:var(--v);color:#fff;border-radius:20px;display:flex;align-items:center;padding:0 30px;font-size:18px;font-weight:600"><span style="color:var(--y);font-weight:800;letter-spacing:1.5px;margin-right:18px;white-space:nowrap">${x.nota.etichetta}</span>${x.nota.testo}</div>`) : null;
  if (nt) r.append(nt);
  const fit = () => els.forEach(e => { const v = e.querySelector('.pe-v'); for (let f = 20; f >= 13; f--) { v.style.fontSize = f + 'px'; if (e.scrollHeight <= e.clientHeight + 1) break } });
  fit(); if (document.fonts) document.fonts.ready.then(fit);
  const N = els.length + (nt ? 1 : 0);
  return { steps: N, show(k) { els.forEach((e, i) => e.classList.toggle('on', i < k)); if (nt) nt.classList.toggle('on', k >= N) } }
};

LANDSCAPE.slide_differenze = differenze;
