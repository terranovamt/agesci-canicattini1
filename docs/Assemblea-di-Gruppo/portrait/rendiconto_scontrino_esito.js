(function () {
  const { HEAD, mkBody, zfit } = PORTRAIT_UTIL;
  /* ===== SCONTRINO + ESITO - A: scontrino in alto, pannello della percentuale sotto ===== */
  PORTRAIT.slide_rendiconto_scontrino_esito = () => (r, D) => {
    HEAD(r, 'RENDICONTO DI GRUPPO');
    const E = sum(D.entrate.map((x) => x.importo)),
      U = sum(D.uscite.map((x) => x.importo)),
      d = Math.round((E - U) * 100) / 100,
      neg = d < 0,
      ad = Math.abs(d),
      pct = E ? (ad / E) * 100 : 0;
    const S = D.soglie_percentuali_esito && D.soglie_percentuali_esito.length >= 3 ? D.soglie_percentuali_esito : [1, 5, 10];
    const idx = pct < 1 ? -1 : pct < S[0] ? 0 : pct < S[1] ? 1 : pct < S[2] ? 2 : 3,
      sc = neg ? 'var(--ko)' : 'var(--ok)';
    const tier = [
      { n: 'PAREGGIO', m: 'Entrate e uscite praticamente coincidono', c: 'var(--even)' },
      { n: 'QUASI IN PARI', m: 'Una differenza minima', c: 'var(--near)' },
      { n: neg ? 'DISAVANZO CONTENUTO' : 'PICCOLO AVANZO', m: neg ? 'Un disavanzo contenuto' : 'Un piccolo avanzo', c: sc },
      { n: neg ? 'DISAVANZO SIGNIFICATIVO' : 'AVANZO', m: neg ? 'Un disavanzo significativo' : 'Un avanzo', c: sc },
      { n: neg ? 'DISAVANZO ELEVATO' : 'GRANDE AVANZO', m: neg ? 'Un disavanzo elevato' : 'Un grande avanzo', c: sc },
    ][idx + 1];
    const totC = ad ? sc : 'var(--even)',
      pctT = (v) => v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + '%';
    const pc = (el, to, dur = 1000) => {
      if (INST) dur = 1;
      const from = el._v || 0;
      el._v = to;
      const t0 = performance.now();
      cancelAnimationFrame(el._r);
      (function f(t) {
        const p = Math.min(1, (t - t0) / dur),
          e = 1 - Math.pow(1 - p, 3);
        el.textContent = pctT(from + (to - from) * e);
        if (p < 1) el._r = requestAnimationFrame(f);
      })(t0);
    };
    const lo = [0, 1, S[0], S[1], S[2]],
      hi = [1, S[0], S[1], S[2], null],
      j = idx + 1,
      fr = j < 4 ? (pct - lo[j]) / (hi[j] - lo[j]) : Math.min(1, (pct - S[2]) / S[2]);
    const box = mkBody(r);
    box.classList.add('fp');
    const rc = h(`<div class="frc"><div class="rh"><b>ASSEMBLEA DI GRUPPO</b><span>bilancio ${D.anno_esercizio}</span></div>
      <div class="rl1 ent"><span style="color:var(--ok)">Entrate</span><b class="v"></b></div>
      <div class="rl1 ent"><span style="color:var(--ko)">− Uscite</span><b class="v"></b></div>
      <div class="rr"><i></i></div>
      <div class="rl2 ent"><span style="color:${totC}">TOTALE</span><b class="v" style="color:${totC}"></b></div>
      <div class="rk ent">${ad ? (neg ? 'disavanzo' : 'avanzo') + ' di esercizio' : 'esercizio in pareggio'}</div>
      <div class="rs"><span style="color:${tier.c};border-color:${tier.c}">${tier.n}</span></div></div>`);
    const ls = rc.querySelectorAll('.rl1,.rl2,.rk'),
      vE = ls[0].querySelector('.v'),
      vU = ls[1].querySelector('.v'),
      vT = ls[2].querySelector('.v'),
      rule = rc.querySelector('.rr i'),
      stamp = rc.querySelector('.rs span');
    const pn = h(`<div class="fpn ent"><div class="k">In percentuale sulle entrate</div><div class="pb1" style="color:${tier.c}">0%</div><div class="pm1">${tier.m}</div>
      <div class="pbr"><b style="left:0">▼</b><div><i style="background:${tier.c}"></i></div><p><span>${lo[j]}%</span><span>${hi[j] === null ? '' : hi[j] + '%'}</span></p></div>
      <div class="pc">Come si calcola<br><b>${fmt(ad)} ÷ ${fmt(E)} = ${pctT(pct)}</b></div></div>`);
    const big = pn.querySelector('.pb1'),
      mk = pn.querySelector('.pbr b'),
      fill = pn.querySelector('.pbr i');
    box.append(rc, pn);
    zfit(box);
    return {
      steps: 3,
      show(k) {
        ls[0].classList.toggle('on', k >= 1);
        ls[1].classList.toggle('on', k >= 2);
        [ls[2], ls[3]].forEach((e) => e.classList.toggle('on', k >= 3));
        pn.classList.toggle('on', k >= 3);
        rule.style.width = k >= 3 ? '100%' : '0';
        stamp.classList.toggle('on', k >= 3);
        mk.style.left = k >= 3 ? fr * 100 + '%' : '0';
        fill.style.width = k >= 3 ? fr * 100 + '%' : '0';
        if (k >= 1) counter(vE, E);
        else vE._v = 0;
        if (k >= 2) counter(vU, U);
        else vU._v = 0;
        if (k >= 3) {
          counter(vT, d);
          pc(big, pct);
        } else {
          vT._v = 0;
          big._v = 0;
        }
      },
    };
  };
})();
