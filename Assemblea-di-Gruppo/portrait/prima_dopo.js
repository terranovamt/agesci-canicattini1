(function () {
  const { HEAD, mkBody, fitBox } = PORTRAIT_UTIL;
  /* ===== COME ERA / COME DIVENTA: le due card della versione orizzontale, una sotto l'altra ===== */
  PORTRAIT.slide_prima_dopo = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'COME ERA, COME DIVENTA');
    const segs = frasi(diffSegs(tok(x.prima), tok(x.dopo)));
    const eq = (s) => ({ h: joinT(s.q), f: s.q[0], l: s.q[s.q.length - 1] });
    const left = render(segs, (s) =>
      s.ty === 'eq' ? eq(s) : s.d && s.d.length ? { h: `<del>${joinT(s.d)}</del>`, f: s.d[0], l: s.d[s.d.length - 1] } : null,
    );
    const right = render(segs, (s) =>
      s.ty === 'eq' ? eq(s) : s.a && s.a.length ? { h: `<ins>${joinT(s.a)}</ins>`, f: s.a[0], l: s.a[s.a.length - 1] } : null,
    );
    const box = mkBody(r);
    box.classList.add('pdp');
    if (x.titolo) box.append(h(`<div class="pdt">${x.titolo}</div>`));
    const card = (cls, lab, html) => {
      const e = h(`<div class="pdc ${cls}"><div class="pdg">${lab}</div><div class="pdx">${html}</div></div>`);
      e.style.flexGrow = html.replace(/<[^>]+>/g, '').length + 160;
      box.append(e);
      return e;
    };
    card('old', x.etichetta_prima || 'COME ERA', left);
    card('new', x.etichetta_dopo || 'COME DIVENTA', right);
    if (x.nota) box.append(h(`<div class="pdn">${x.nota}</div>`));
    const fit = () => {
      box.classList.add('dif');
      fitBox(box, 40, 14, '.pdx');
      box.classList.remove('dif');
    };
    fit();
    return {
      steps: 1,
      show(k) {
        box.classList.toggle('dif', k >= 1);
      },
    };
  };
})();
