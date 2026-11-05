/* ---- slide_rendiconto_andamento_avanzo ---- */
const trend = (r, D) => {
  const AUTO = true;      /* true = parte da sola all'apertura della slide; false = parte con 1 click */
  const DUR = 2400;       /* durata dell'animazione in ms */
  band(r, 'RENDICONTO DI GRUPPO'); cnt.className = '';
  const y = Object.entries(D.storico_avanzo_per_anno).map(([a, v]) => [+a, v]);
  y.push([D.anno_esercizio, Math.round((sum(D.entrate.map(x => x.importo)) - sum(D.uscite.map(x => x.importo))) * 100) / 100]);
  const mn = Math.min(...y.map(p => p[1])), mx = Math.max(...y.map(p => p[1])),
    X = i => 150 + i * (980 / (y.length - 1)), Y = v => 610 - (v - mn) / (mx - mn) * 340;
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('width', 1280); s.setAttribute('height', 720);
  s.innerHTML = `<defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v)" stop-opacity=".35"/><stop offset="1" style="stop-color:var(--v)" stop-opacity="0"/></linearGradient></defs><line x1="60" x2="1220" y1="${Y(0)}" y2="${Y(0)}" style="stroke:var(--v)" stroke-dasharray="6 8" opacity=".5"/><path id="ar" fill="url(#gf)"/><path id="ln" fill="none" style="stroke:var(--v)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  r.append(s);
  const ln = s.querySelector('#ln'), ar = s.querySelector('#ar'),
    els = y.map((p, i) => {
      const neg = p[1] < 0;
      const e = h(`<div class="fade"><div class="a" style="left:${X(i) - 60}px;top:100px;width:120px;text-align:center;font-size:26px;font-weight:800;line-height:1.15">${i === y.length - 1 && D.patrimonio.data_riferimento ? `<div style="font-size:14px;font-weight:600;opacity:.7">${D.patrimonio.data_riferimento}</div>` : ''}${p[0]}</div><div class="a" style="left:${X(i) - 8}px;top:${Y(p[1]) - 8}px;width:16px;height:16px;border-radius:50%;background:${neg ? 'var(--ko)' : 'var(--ok)'};border:4px solid var(--w);box-shadow:0 2px 8px var(--dot-shadow)"></div><div class="a ${neg ? 'red' : ''}" style="left:${X(i) - 80}px;top:${Y(p[1]) + (neg ? 18 : -50)}px;width:160px;text-align:center;font-size:25px;font-weight:700">${fmt(p[1])}</div></div>`);
      r.append(e); return e
    });

  /* disegna la linea fino alla posizione orizzontale cx (con interpolazione sull'ultimo tratto) */
  const draw = cx => {
    const P = [];
    for (let i = 0; i < y.length; i++) {
      const px = X(i), py = Y(y[i][1]);
      if (px <= cx + 0.01) P.push([px, py]);
      else {
        if (i > 0) { const x0 = X(i - 1), y0 = Y(y[i - 1][1]), f = (cx - x0) / (px - x0); P.push([cx, y0 + (py - y0) * f]) }
        break
      }
    }
    ln.setAttribute('d', P.length > 1 ? P.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ') : '');
    ar.setAttribute('d', P.length > 1 ? `M${P[0][0]} 650 ` + P.map(p => 'L' + p[0] + ' ' + p[1]).join(' ') + ` L${P[P.length - 1][0]} 650Z` : '');
    els.forEach((e, i) => e.classList.toggle('on', X(i) <= cx + 0.01));
  };
  const x0 = X(0), x1 = X(y.length - 1), ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  let raf = 0, tok = 0;
  const reset = () => { tok++; cancelAnimationFrame(raf); draw(x0 - 1) };
  const end = () => { tok++; cancelAnimationFrame(raf); draw(x1) };
  const play = () => {
    const my = ++tok; cancelAnimationFrame(raf); draw(x0 - 1);
    const t0 = performance.now() + 250; /* piccola pausa iniziale */
    const step = now => {
      if (my !== tok) return;
      const t = Math.min(1, Math.max(0, (now - t0) / DUR));
      draw(x0 + (x1 - x0) * ease(t));
      if (t < 1) raf = requestAnimationFrame(step)
    };
    raf = requestAnimationFrame(step)
  };
  reset();
  return {
    steps: AUTO ? 0 : 1,
    show(k) {
      if (INST) { k >= (AUTO ? 0 : 1) ? end() : reset(); return }
      if (AUTO || k >= 1) play(); else reset()
    }
  }
};

LANDSCAPE.slide_rendiconto_andamento_avanzo = () => trend;
