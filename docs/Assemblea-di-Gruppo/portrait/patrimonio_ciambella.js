(function () {
  const { HEAD, mkBody, zfit } = PORTRAIT_UTIL;
  /* ===== PATRIMONIO CIAMBELLA - A: ciambella grande in alto, lista a righe con icona ===== */
  PORTRAIT.slide_patrimonio_ciambella = () => (r, D) => {
    const P = D.patrimonio;
    HEAD(r, 'STATO PATRIMONIALE DI GRUPPO');
    const R = 150,
      Wd = 105,
      L = 2 * Math.PI * R,
      cols = [1, 2, 3, 4, 5, 6].map((i) => V('--pie' + i)),
      ord = [5, 1, 4, 3, 2, 0].map((i) => P.voci[i]),
      T = sum(ord.map((x) => x.importo_anno_corrente));
    const box = mkBody(r);
    box.classList.add('fp');
    const wrap = h('<div class="fdw big"></div>');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-12 -12 424 424');
    svg.setAttribute('width', 520);
    svg.setAttribute('height', 520);
    const mk = (a) => {
      const c = document.createElementNS(NS, 'circle');
      Object.entries({ cx: 200, cy: 200, r: R, fill: 'none', 'stroke-width': Wd, ...a }).forEach(([k, v]) => c.setAttribute(k, v));
      return c;
    };
    svg.append(mk({ stroke: V('--track'), opacity: 0.55 }));
    let a = 0;
    const segs = [];
    ord.forEach((x, i) => {
      if (x.importo_anno_corrente <= 0) return;
      const f = x.importo_anno_corrente / T,
        c = mk({ stroke: cols[i], transform: 'rotate(-90 200 200)', 'stroke-dasharray': `0 ${L}`, 'stroke-dashoffset': -a * L });
      c.style.transition = 'stroke-dasharray .7s ease';
      svg.append(c);
      segs.push({ c, f });
      a += f;
    });
    const ct = h('<div class="fdc"><div class="k">Totale</div><div class="num"></div></div>');
    wrap.append(svg, ct);
    const lst = h('<div class="frs"></div>');
    const rows = P.voci.map((x) => {
      const i = ord.indexOf(x);
      const e = h(
        `<div class="fpr ent"><span class="fpi" style="border-color:${cols[i]}"><img src="${x.icona}" onerror="this.style.display='none'"></span><span class="fpn1">${x.nome}</span><div><b>${fmt(x.importo_anno_corrente)}</b><small>${Math.round((x.importo_anno_corrente / T) * 1000) / 10}%</small></div></div>`,
      );
      lst.append(e);
      return e;
    });
    box.append(wrap, lst);
    if (D.nota_beni_durevoli) box.append(h(`<div class="fnote">${D.nota_beni_durevoli}</div>`));
    zfit(box);
    const tm = [],
      at = (ms, f) => tm.push(setTimeout(f, ms));
    return {
      steps: 0,
      show() {
        tm.forEach(clearTimeout);
        tm.length = 0;
        segs.forEach((s) => s.c.setAttribute('stroke-dasharray', `0 ${L}`));
        rows.forEach((e) => e.classList.remove('on'));
        ct.lastChild._v = 0;
        ct.lastChild.textContent = fmt(0);
        const run = () => {
          counter(ct.lastChild, T, 1600);
          segs.forEach((s, i) => at(i * 220, () => s.c.setAttribute('stroke-dasharray', `${Math.max(0, s.f * L - 3)} ${L}`)));
          rows.forEach((e, i) => at(600 + i * 250, () => e.classList.add('on')));
        };
        if (INST) {
          counter(ct.lastChild, T);
          segs.forEach((s) => s.c.setAttribute('stroke-dasharray', `${Math.max(0, s.f * L - 3)} ${L}`));
          rows.forEach((e) => e.classList.add('on'));
        } else at(400, run);
      },
    };
  };
})();
