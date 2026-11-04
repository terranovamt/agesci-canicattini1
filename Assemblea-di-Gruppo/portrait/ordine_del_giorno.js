(function () {
  const { HEAD, norm, mkBody, fitBox, link } = PORTRAIT_UTIL;
  /* ===== ORDINE DEL GIORNO: come l'orizzontale, schede con bordo colorato e numero nel cerchio ===== */
  PORTRAIT.slide_ordine_del_giorno = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'ORDINE DEL GIORNO');
    const L = x.punti.map(norm),
      box = mkBody(r);
    box.classList.add('odp');
    const els = L.map((p, i) => {
      const e = h(
        `<div class="odc ent" style="border-left-color:${C[i % 5]}"><b>${i + 1}</b><span>${p.testo}</span></div>`,
      );
      link(e, p);
      box.append(e);
      return e;
    });
    fitBox(box, 40, 15);
    return {
      steps: L.length,
      show(k) {
        els.forEach((e, i) => {
          e.inert = i >= k;
          e.classList.toggle('on', i < k);
          e.classList.toggle('hl', i === k - 1);
        });
      },
    };
  };
})();
