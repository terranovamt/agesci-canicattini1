(function () {
  const { HEAD, mkBody } = PORTRAIT_UTIL;
  /* ===== PATRIMONIO BARRE - C: totali a confronto in alto, voci in lista con icona e due barre ===== */
  PORTRAIT.slide_patrimonio_barre = () => (r, D) => {
    const P = D.patrimonio;
    HEAD(r, 'STATO PATRIMONIALE DI GRUPPO');
    const mx = Math.max(...P.voci.flatMap((v) => [v.importo_anno_precedente, v.importo_anno_corrente]));
    const box = mkBody(r);
    box.classList.add('fp');
    const tt = h(
      `<div class="ftw"><div class="fcard"><div class="ft">${P.data_riferimento} ${P.anno_precedente}</div><div class="fbig"></div></div><div class="fcard"><div class="ft">${P.data_riferimento} ${P.anno_corrente}</div><div class="fbig"></div></div></div>`,
    );
    const [t1, t2] = [...tt.querySelectorAll('.fbig')];
    const lst = h('<div class="frs fbl"></div>');
    const els = P.voci.map((v) => {
      const col = v.colore_css ? `var(${v.colore_css})` : v.colori_css[1],
        col0 = v.colore_css ? `color-mix(in srgb,var(${v.colore_css}) 45%,transparent)` : v.colori_css[0];
      const e = h(
        `<div class="fbw ent"><img src="${v.icona}" onerror="this.style.display='none'"><div class="fbm"><div class="fbn"><span>${v.nome}</span><b>${fmt(v.importo_anno_corrente)}</b></div><div class="fbb"><i style="background:${col0}" data-w="${(v.importo_anno_precedente / mx) * 100}"></i></div><div class="fbb"><i style="background:${col}" data-w="${(v.importo_anno_corrente / mx) * 100}"></i></div><div class="fbp">${P.anno_precedente}: ${fmt(v.importo_anno_precedente)}</div></div></div>`,
      );
      lst.append(e);
      return e;
    });
    box.append(tt, lst);
    return {
      steps: P.voci.length,
      show(k) {
        let a = 0,
          b = 0;
        els.forEach((e, i) => {
          const on = i < k;
          e.classList.toggle('on', on);
          e.querySelectorAll('i').forEach((q) => (q.style.width = on ? Math.max(+q.dataset.w, 1) + '%' : '0'));
          if (on) {
            a += P.voci[i].importo_anno_precedente;
            b += P.voci[i].importo_anno_corrente;
          }
        });
        counter(t1, a);
        counter(t2, b);
      },
    };
  };
})();
