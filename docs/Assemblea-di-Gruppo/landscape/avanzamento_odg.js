/* ---- slide_avanzamento_odg: prende i punti da slide_ordine_del_giorno; "completati": N = i primi N sono FATTI ---- */
const odgStato = x => (r, D) => {
  band(r, x.titolo_barra || 'ORDINE DEL GIORNO'); cnt.className = ''; r.classList.add('os');
  const base = (D.slide || []).find(s => s.tipo === 'slide_ordine_del_giorno') || { punti: [] };
  const L = base.punti.map(p => typeof p === 'string' ? { testo: p } : p), n = Math.min(Math.max(x.completati || 0, 0), L.length), gap = Math.min(104, 520 / L.length);
  const els = L.map((p, i) => {
    const st = i < n ? 'done' : i === n ? 'next' : 'todo';
    const col = { done: 'var(--g)', next: 'var(--y)', todo: 'var(--vl)' }[st];
    const circ = { done: 'background:var(--g);color:#fff', next: 'background:var(--y);color:var(--vd)', todo: 'background:var(--vl);color:#fff' }[st];
    const tag = { done: '<div class="tag" style="background:color-mix(in srgb,var(--g) 15%,transparent);color:var(--g)">✓ FATTO</div>', next: '<div class="tag" style="background:var(--y);color:var(--vd)">PROSSIMO</div>', todo: '<div class="tag" style="background:color-mix(in srgb,var(--vl) 30%,transparent);color:var(--v2)">DA FARE</div>' }[st];
    const e = h(`<div class="row ${st === 'next' ? 'nx' : ''}" style="left:90px;width:1100px;height:${gap - 16}px;top:${126 + i * gap}px;gap:26px;padding:0 28px;border-left:10px solid ${col};${st === 'next' ? 'background:var(--w);outline:3px solid var(--y)' : ''}"><div class="${i === n - 1 ? 'ck' : ''}" style="width:54px;height:54px;border-radius:50%;${circ};font:800 28px Montserrat,sans-serif;display:flex;align-items:center;justify-content:center;flex:none">${st === 'done' ? '✓' : i + 1}</div><span style="flex:1;font-size:24px;font-weight:600;color:${st === 'done' ? 'var(--v2)' : 'var(--vd)'};opacity:${st === 'done' ? .6 : 1};line-height:1.25">${p.testo}</span>${tag}</div>`);
    linkSlide(e, p);
    r.append(e); setTimeout(() => e.classList.add('on'), INST ? 0 : 250 + i * 160); return e
  });
  return { steps: 0, show() { } }
};

LANDSCAPE.slide_avanzamento_odg = odgStato;
