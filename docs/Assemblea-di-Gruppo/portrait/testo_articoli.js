(function () {
  const { HEAD, norm, mkFl, mkBody, fitBox, cnum, link } = PORTRAIT_UTIL;
  /* ===== TESTO ARTICOLI - C: titolo fisso + commi in lista, tutti insieme ===== */
  PORTRAIT.slide_testo_articoli = (s) => (r, D) => {
    HEAD(r, s.titolo_barra || 'REGOLAMENTO ASSEMBLEARE');
    const box = mkFl(r);
    (s.articoli || [{ titolo: s.titolo, paragrafi: s.paragrafi || [] }]).forEach((a) => {
      if (a.titolo) box.append(h(`<div class="th">${a.titolo}</div>`));
      (a.paragrafi || []).forEach((p, i) => {
        const o = norm(p),
          sub = (o.sottopunti || [])
            .map((t, j) => `<div><b>${String.fromCharCode(97 + j)})</b><span>${t}</span></div>`)
            .join('');
        box.append(
          h(
            `<div class="rw"><b class="no">${i + 1}</b><div class="tt">${o.testo}${sub ? `<div class="sb">${sub}</div>` : ''}</div></div>`,
          ),
        );
      });
    });
    fitBox(box, 40, 15);
    return { steps: 0, show() {} };
  };
})();
