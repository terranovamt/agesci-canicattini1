(function () {
  const { HEAD, norm, mkBody, fitBox } = PORTRAIT_UTIL;
  /* ===== TESTO ARTICOLI: come l'orizzontale, una scheda bianca per articolo, commi che compaiono in sequenza ===== */
  PORTRAIT.slide_testo_articoli = (s) => (r, D) => {
    HEAD(r, s.titolo_barra || 'REGOLAMENTO ASSEMBLEARE');
    const box = mkBody(r),
      lis = [];
    box.classList.add('tap');
    (s.articoli || [{ titolo: s.titolo, paragrafi: s.paragrafi || [] }]).forEach((a) => {
      const e = h(`<div class="tac"><h3>${a.titolo || ''}</h3><ol></ol></div>`),
        ol = e.querySelector('ol');
      (a.paragrafi || []).forEach((p) => {
        const o = norm(p),
          li = h(`<li>${o.testo}</li>`);
        lis.push(li);
        if (o.sottopunti) {
          const sub = h('<ol></ol>');
          o.sottopunti.forEach((t) => {
            const l = h(`<li>${t}</li>`);
            sub.append(l);
            lis.push(l);
          });
          li.append(sub);
        }
        ol.append(li);
      });
      box.append(e);
    });
    fitBox(box, 40, 14);
    lis.forEach((l, k) => (INST ? l.classList.add('on') : setTimeout(() => l.classList.add('on'), 400 + k * 350)));
    return { steps: 0, show() {} };
  };
})();
