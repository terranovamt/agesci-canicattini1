(function () {
  const { HEAD, norm, mkFl, mkBody, fitBox, cnum, link } = PORTRAIT_UTIL;
  /* ===== AVANZAMENTO ODG - C: fatti (compatti) / prossimo (grande, giallo) / da fare ===== */
  PORTRAIT.slide_avanzamento_odg = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'ORDINE DEL GIORNO');
    const base = (D.slide || []).find((s) => s.tipo === 'slide_ordine_del_giorno') || { punti: [] };
    const L = base.punti.map(norm),
      n = Math.min(Math.max(x.completati || 0, 0), L.length),
      box = mkFl(r);
    const pb = h('<div class="pbar gr2"><i></i></div>');
    box.append(pb);
    L.forEach((p, i) => {
      let cls, html;
      if (i < n) {
        cls = 'dn';
        html = `<span class="ck">✓</span><span class="tt">${p.testo}</span>`;
      } else if (i === n) {
        cls = 'nxr';
        html = `<span class="pt">PROSSIMO</span><div class="nxt">${i + 1}. ${p.testo}</div>`;
      } else {
        cls = 'td';
        html = `<b class="no">${i + 1}</b><span class="tt">${p.testo}</span>`;
      }
      const e = h(`<div class="rw ent ${cls}">${html}</div>`);
      link(e, p);
      box.append(e);
      setTimeout(() => e.classList.add('on'), INST ? 0 : 250 + i * 160);
    });
    setTimeout(
      () => {
        pb.firstChild.style.width = (L.length ? (n / L.length) * 100 : 0) + '%';
      },
      INST ? 0 : 300,
    );
    fitBox(box, 40, 14, '.rw');
    return { steps: 0, show() {} };
  };
})();
