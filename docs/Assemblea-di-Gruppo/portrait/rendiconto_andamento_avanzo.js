(function () {
  const { HEAD, mkBody } = PORTRAIT_UTIL;
  /* ===== ANDAMENTO AVANZO - C: valore e grafico in alto, anni in lista sotto ===== */
  PORTRAIT.slide_rendiconto_andamento_avanzo = () => (r, D) => {
    const AUTO = true,
      DUR = 2400;
    HEAD(r, 'RENDICONTO DI GRUPPO');
    const y = Object.entries(D.storico_avanzo_per_anno).map(([a, v]) => [+a, v]);
    y.push([D.anno_esercizio, Math.round((sum(D.entrate.map((x) => x.importo)) - sum(D.uscite.map((x) => x.importo))) * 100) / 100]);
    const mn = Math.min(...y.map((p) => p[1])),
      mx = Math.max(...y.map((p) => p[1])),
      W = 640,
      Hc = 360,
      X = (i) => 40 + (i * (W - 80)) / (y.length - 1),
      Y = (v) => 40 + ((mx - v) / (mx - mn)) * (Hc - 110);
    const box = mkBody(r);
    box.classList.add('fp');
    const cd = h(`<div class="fcard fac"><div class="ft">Avanzo <span data-y></span></div><div class="fbig" data-v></div></div>`);
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${W} ${Hc}`);
    s.innerHTML = `<defs><linearGradient id="gfp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v)" stop-opacity=".35"/><stop offset="1" style="stop-color:var(--v)" stop-opacity="0"/></linearGradient></defs><line x1="10" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" style="stroke:var(--v)" stroke-dasharray="6 8" opacity=".5"/><path id="arp" fill="url(#gfp)"/><path id="lnp" fill="none" style="stroke:var(--v)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`;
    const dots = y.map((p, i) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', X(i));
      c.setAttribute('cy', Y(p[1]));
      c.setAttribute('r', 11);
      c.setAttribute('fill', p[1] < 0 ? 'var(--ko)' : 'var(--ok)');
      c.setAttribute('stroke', '#fff');
      c.setAttribute('stroke-width', 4);
      c.style.opacity = 0;
      c.style.transition = 'opacity .3s';
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', X(i));
      t.setAttribute('y', Hc - 16);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', 26);
      t.setAttribute('font-weight', 800);
      t.setAttribute('fill', 'var(--ink)');
      t.textContent = p[0];
      s.append(c, t);
      return c;
    });
    cd.append(s);
    const lst = h('<div class="frs fyl"></div>');
    const rows = y.map((p) => {
      const e = h(`<div class="frw ent"><span class="fy">${p[0]}</span><b class="${p[1] < 0 ? 'neg' : 'pos'}">${fmt(p[1])}</b></div>`);
      lst.append(e);
      return e;
    });
    box.append(cd, lst);
    const ln = s.querySelector('#lnp'),
      ar = s.querySelector('#arp'),
      vy = cd.querySelector('[data-y]'),
      vv = cd.querySelector('[data-v]');
    let last = -2;
    const draw = (f) => {
      const cx = X(0) + (X(y.length - 1) - X(0)) * f,
        P = [];
      for (let i = 0; i < y.length; i++) {
        const px = X(i),
          py = Y(y[i][1]);
        if (px <= cx + 0.01) P.push([px, py]);
        else {
          if (i > 0) {
            const x0 = X(i - 1),
              y0 = Y(y[i - 1][1]),
              q = (cx - x0) / (px - x0);
            P.push([cx, y0 + (py - y0) * q]);
          }
          break;
        }
      }
      ln.setAttribute('d', P.length > 1 ? P.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ') : '');
      ar.setAttribute('d', P.length > 1 ? `M${P[0][0]} ${Hc - 50} ` + P.map((p) => 'L' + p[0] + ' ' + p[1]).join(' ') + ` L${P[P.length - 1][0]} ${Hc - 50}Z` : '');
      let n = -1;
      y.forEach((p, i) => {
        const on = X(i) <= cx + 0.01;
        dots[i].style.opacity = on ? 1 : 0;
        rows[i].classList.toggle('on', on);
        if (on) n = i;
      });
      if (n !== last) {
        last = n;
        if (n >= 0) {
          vy.textContent = y[n][0];
          vv.className = 'fbig ' + (y[n][1] < 0 ? 'neg' : 'pos');
          counter(vv, y[n][1], 500);
        } else {
          vy.textContent = '';
          vv.textContent = '';
          vv._v = 0;
        }
      }
    };
    let raf = 0,
      tok = 0;
    const reset = () => {
      tok++;
      cancelAnimationFrame(raf);
      last = -2;
      draw(-0.01);
    };
    const end = () => {
      tok++;
      cancelAnimationFrame(raf);
      draw(1);
    };
    const play = () => {
      const my = ++tok;
      cancelAnimationFrame(raf);
      draw(-0.01);
      const t0 = performance.now() + 250,
        ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const step = (now) => {
        if (my !== tok) return;
        const t = Math.min(1, Math.max(0, (now - t0) / DUR));
        draw(ease(t));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    reset();
    return {
      steps: AUTO ? 0 : 1,
      show(k) {
        if (INST) {
          k >= (AUTO ? 0 : 1) ? end() : reset();
          return;
        }
        if (AUTO || k >= 1) play();
        else reset();
      },
    };
  };
})();
