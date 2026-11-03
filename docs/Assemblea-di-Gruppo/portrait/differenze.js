(function () {
  const { HEAD, mkBody, fitBox } = PORTRAIT_UTIL;
  /* ===== DIFFERENZE - C: una scheda a colori per colonna, impilate, poi la nota ===== */
  PORTRAIT.slide_differenze = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'VECCHIO E NUOVO PROGETTO');
    const C = x.colonne || [],
      box = mkBody(r);
    box.classList.add('dfp');
    const maxV = Math.max(0, ...C.map((c) => (c.voci || []).length));
    const els = C.map((c) => {
      const e = h(
        `<div class="dfc ent" style="--c:${c.colore || 'var(--v)'};${(c.voci || []).length === maxV ? 'flex-grow:1' : ''}"><div class="dfh"><b>${c.simbolo ? c.simbolo + ' ' : ''}${c.titolo}</b><small>${c.sottotitolo || ''}</small></div><ul>${(c.voci || []).map((v) => `<li>${v}</li>`).join('')}</ul></div>`,
      );
      box.append(e);
      return e;
    });
    const nt = x.nota
      ? h(`<div class="dfn ent"><b>${x.nota.etichetta}</b><span>${x.nota.testo}</span></div>`)
      : null;
    if (nt) box.append(nt);
    fitBox(box, 44, 14);
    const N = els.length + (nt ? 1 : 0);
    return {
      steps: N,
      show(k) {
        els.forEach((e, i) => e.classList.toggle('on', i < k));
        if (nt) nt.classList.toggle('on', k >= N);
      },
    };
  };
})();
