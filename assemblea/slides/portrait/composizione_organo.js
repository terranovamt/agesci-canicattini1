(function () {
  const { HEAD, norm, mkFl, mkBody, fitBox, cnum, link } = PORTRAIT_UTIL;
  /* ===== COMPOSIZIONE ORGANO - C: fila di avatar fissa + righe ruolo/nome ===== */
  PORTRAIT.slide_composizione_organo = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'COMPOSIZIONE ORGANO ASSEMBLEARE');
    const P = x.persone,
      n = P.length,
      box = mkFl(r, 'og');
    const sz = Math.max(48, Math.min(120, Math.floor((720 - 48 - (n - 1) * 12) / n)));
    const av = h('<div class="avr"></div>');
    box.append(av);
    const avs = P.map(() => {
      const e = h(`<div class="avc" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.5)}px">?</div>`);
      av.append(e);
      return e;
    });
    const rows = P.map((p) => {
      const e = h(
        `<div class="rw ogr rv"><span class="rl">${p.ruolo}</span><div class="nm">${p.nome}</div>${p.nota ? `<div class="nt3">${p.nota}</div>` : ''}</div>`,
      );
      box.append(e);
      return e;
    });
    if (x.nota_generale) box.append(h(`<div class="ngn">${x.nota_generale}</div>`));
    fitBox(box, 40, 14, '.rw');
    return {
      steps: n,
      show(k) {
        avs.forEach((e, i) => {
          const on = i < k;
          e.classList.toggle('on', on);
          e.classList.toggle('ac', i === k - 1);
          e.textContent = on ? P[i].icona : '?';
        });
        rows.forEach((e, i) => {
          e.classList.toggle('on', i < k);
          e.classList.toggle('hl', i === k - 1);
        });
      },
    };
  };
})();
