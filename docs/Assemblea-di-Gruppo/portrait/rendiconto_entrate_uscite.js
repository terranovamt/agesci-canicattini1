(function () {
  const { HEAD, mkBody, zfit } = PORTRAIT_UTIL;
  /* ===== ENTRATE / USCITE - ciambella fissa + scheda totale + righe ===== */
  PORTRAIT.slide_rendiconto_entrate_uscite = () => (r, D) => {
    HEAD(r, 'RENDICONTO DI GRUPPO');
    const En = D.entrate,
      Us = D.uscite,
      Ap = D.anno_esercizio - 1,
      nE = En.length,
      E = sum(En.map((x) => x.importo)),
      pE = En.map((x) => x.importo_anno_precedente ?? 0),
      pU = Us.map((x) => x.importo_anno_precedente ?? 0),
      S = 440,
      R = 150,
      L = 2 * Math.PI * R;
    const box = mkBody(r);
    box.classList.add('fp');
    const wrap = h(`<div class="fdw"></div>`);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-12 -12 424 424');
    svg.setAttribute('width', S);
    svg.setAttribute('height', S);
    const mk = (a) => {
      const c = document.createElementNS(NS, 'circle');
      Object.entries({ cx: 200, cy: 200, r: R, fill: 'none', 'stroke-width': 115, ...a }).forEach(([k, v]) => c.setAttribute(k, v));
      return c;
    };
    svg.append(mk({ stroke: V('--track') }));
    const cs = En.map((x, i) => mk({ stroke: C[i % 5], transform: 'rotate(-90 200 200)', 'stroke-dasharray': `0 ${L}` }));
    const dis = mk({ stroke: V('--ko'), transform: 'rotate(-90 200 200) scale(1,-1) translate(0,-400)', 'stroke-dasharray': `0 ${L}` });
    cs.forEach((c) => (c.style.transition = 'stroke-dasharray .9s ease, stroke-dashoffset .9s ease'));
    dis.style.transition = 'stroke-dasharray .9s ease';
    svg.append(...cs, dis);
    const ct = h('<div class="fdc"><div class="k"></div><div class="num"></div></div>');
    wrap.append(svg, ct);
    const cd = h(
      `<div class="fcard"><div class="ft"></div><div class="fbig"></div><div class="fs"><span data-t></span> · nel ${Ap}: <b data-p></b></div></div>`,
    );
    const ft = cd.querySelector('.ft'),
      fbig = cd.querySelector('.fbig'),
      fT = cd.querySelector('[data-t]'),
      fP = cd.querySelector('[data-p]');
    const mkRows = (A, P, cls) => {
      const lst = h(`<div class="frl ${cls}"></div>`);
      const els = A.map((x, i) => {
        const e = h(
          `<div class="frw ent"><i style="background:${C[i % 5]}"></i><span>${x.descrizione}</span><div><b>${fmt(x.importo)}</b><small>${Ap}: ${fmt(P[i])}</small></div></div>`,
        );
        lst.append(e);
        return e;
      });
      return { lst, els };
    };
    const rE = mkRows(En, pE, 'en'),
      rU = mkRows(Us, pU, 'ue');
    const rows = h('<div class="frs"></div>');
    rows.append(rE.lst, rU.lst);
    box.append(wrap, cd, rows);
    zfit(box);
    let ph = null,
      pr = L,
      swap;
    return {
      steps: nE + 1 + Us.length,
      show(k) {
        const p2 = k > nE,
          nu = Math.max(0, k - nE - 1),
          Uk = sum(Us.slice(0, nu).map((x) => x.importo));
        clearTimeout(swap);
        const inn = p2 ? rU : rE,
          out = p2 ? rE : rU,
          setOn = () => {
            rE.els.forEach((e, i) => e.classList.toggle('on', i < Math.min(k, nE)));
            rU.els.forEach((e, i) => e.classList.toggle('on', i < nu));
          };
        /* al cambio entrate/uscite le card escono una dopo l'altra prima che arrivino le nuove */
        if (ph !== null && p2 !== ph && !INST && out.lst.style.display !== 'none') {
          const vis = out.els.filter((e) => e.classList.contains('on'));
          vis.forEach((e, i) => {
            e.style.transitionDelay = i * 70 + 'ms';
            e.classList.add('gone');
          });
          inn.lst.style.display = 'none';
          swap = setTimeout(() => {
            out.els.forEach((e) => {
              e.classList.remove('gone', 'on');
              e.style.transitionDelay = '';
            });
            out.lst.style.display = 'none';
            inn.lst.style.display = '';
            inn.lst.offsetWidth;
            setOn();
          }, 450 + vis.length * 70);
        } else {
          [rE, rU].forEach((x) => x.els.forEach((e) => {
            e.classList.remove('gone');
            e.style.transitionDelay = '';
          }));
          inn.lst.style.display = '';
          out.lst.style.display = 'none';
          setOn();
        }
        if (p2 !== ph) {
          fbig._v = 0;
          fP._v = 0;
          ph = p2;
        }
        const vE = En.map((x, i) => (i < k ? x.importo : 0)),
          tE = sum(vE);
        ft.textContent = p2 ? 'Le Uscite sono state:' : 'Quest’anno il gruppo scout ha avuto';
        fT.textContent = p2 ? (nu < Us.length ? 'finora' : 'in totale') : 'di Entrate';
        counter(fP, p2 ? sum(pU.slice(0, nu)) : sum(pE.slice(0, Math.min(k, nE))));
        counter(fbig, p2 ? Uk : tE);
        const rem = (E - Uk) / E * L,
          neg = E - Uk < 0;
        let a = 0;
        if (!p2) {
          pr = L;
          cs.forEach((c) => (c.style.transition = 'stroke-dasharray .9s ease, stroke-dashoffset .9s ease'));
          dis.style.transition = 'stroke-dasharray .9s ease';
        }
        En.forEach((x, i) => {
          const l = p2 ? (x.importo / E) * L : tE ? (vE[i] / tE) * L : 0;
          const vis = p2 ? Math.min(l, Math.max(0, rem - a)) : l;
          if (p2) pieTransition(pr, rem, a, a + l, cs[i]);
          cs[i].setAttribute('stroke-dasharray', `${Math.max(0, vis - 3)} ${L}`);
          cs[i].setAttribute('stroke-dashoffset', -a);
          a += l;
        });
        if (p2) {
          pieTransition(pr, rem, -1e9, 0, dis);
          pr = rem;
        }
        dis.setAttribute('stroke-dasharray', `${p2 && neg ? Math.min(L, Math.max(((Uk - E) / E) * L, 10)) : 0} ${L}`);
        ct.firstChild.textContent = !p2 ? 'Entrate' : neg ? 'Disavanzo' : 'Saldo';
        ct.classList.toggle('red', p2 && neg);
        counter(ct.lastChild, p2 ? E - Uk : tE);
      },
    };
  };
})();
