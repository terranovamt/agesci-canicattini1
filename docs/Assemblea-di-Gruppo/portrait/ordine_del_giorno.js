(function () {
  const { HEAD, norm, mkFl, mkBody, fitBox, cnum, link } = PORTRAIT_UTIL;
  /* ===== ORDINE DEL GIORNO - C: righe piene, ultimo punto comparso evidenziato ===== */
  PORTRAIT.slide_ordine_del_giorno = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'ORDINE DEL GIORNO');
    const L = x.punti.map(norm),
      box = mkFl(r),
      pb = h('<div class="pbar"><i></i></div>');
    box.append(pb);
    const els = L.map((p, i) => {
      const e = h(`<div class="rw rv"><b class="no">${i + 1}</b><span class="tt">${p.testo}</span></div>`);
      link(e, p);
      box.append(e);
      return e;
    });
    fitBox(box, 46, 16, '.rw');
    return {
      steps: L.length,
      show(k) {
        els.forEach((e, i) => {
          e.classList.toggle('on', i < k);
          e.classList.toggle('hl', i === k - 1);
        });
        pb.firstChild.style.width = (L.length ? (k / L.length) * 100 : 0) + '%';
      },
    };
  };
})();
