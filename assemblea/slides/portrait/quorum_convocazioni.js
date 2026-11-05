(function () {
  const { HEAD, norm, mkFl, mkBody, fitBox, cnum, link } = PORTRAIT_UTIL;
  /* ===== QUORUM E CONVOCAZIONI - A: due schede, poi pannello con grafico ===== */
  PORTRAIT.slide_quorum_convocazioni = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'COSTITUZIONE DELL’ASSEMBLEA');
    const CS = D.censimenti,
      cm = !!CS,
      b = mkBody(r),
      ore = [D.assemblea.prima_convocazione, D.assemblea.seconda_convocazione];
    const els = x.convocazioni.map((c, i) => {
      const e = h(
        `<div class="pc pp qcv" style="border-top:.25em solid ${i ? 'var(--g)' : 'var(--y)'}"><div class="num">${ore[i] ?? c.orario}</div><div class="qt"><b>${c.nome}</b><div class="rg">${c.regola}</div>${c.riferimento_articolo ? `<div class="rf">${c.riferimento_articolo}</div>` : ''}</div></div>`,
      );
      b.append(e);
      return e;
    });
    let panel = null,
      vals = [];
    if (cm) {
      const N = CS.censiti_attuali,
        Q = Math.floor(N / 2) + 1,
        PA = CS.presenti_attuali,
        hp = PA != null;
      const nrm = (v) => (typeof v === 'object' ? v : { censiti: v });
      const hist = Object.entries(CS.storico_per_anno || {}).map(([a, v]) => [
        a,
        nrm(v).censiti,
        nrm(v).presenti ?? null,
      ]);
      hist.push([String(D.anno_esercizio), N, PA ?? null]);
      const mx = Math.max(1, ...hist.map((p) => p[1]));
      const stat = (lab, cls) => `<div><div class="ql">${lab}</div><div class="qn ${cls}">0</div></div>`;
      panel = h(
        `<div class="pc pp qpn"><div class="qs">${stat('Censiti ' + D.anno_esercizio, '')}${stat('Quorum 1ª conv. <small>(50% + 1)</small>', 'g')}${hp ? stat(`Presenti <small>(${Math.round((PA / N) * 100)}%)</small>`, 'v') : ''}</div>${hp ? `<div style="text-align:center;margin-top:.5em"><span class="pt" style="background:${PA >= Q ? 'var(--g)' : 'var(--y)'};color:${PA >= Q ? '#fff' : 'var(--vd)'}">${PA >= Q ? '✓ Quorum raggiunto' : 'Mancano ' + (Q - PA) + ' per il quorum'}</span></div>` : ''}<div class="qlg"><span><i style="background:var(--vl)"></i>Censiti</span><span><i style="background:var(--v)"></i>Presenti</span></div><div class="qc">${hist.map((p, i) => `<div class="qb"><div class="qw"><div class="qi"><div class="qbar" data-h="${(p[1] / mx) * 100}"><span class="qv">${p[1]}</span>${p[2] != null ? `<i data-h="${Math.min(100, Math.max((p[2] / p[1]) * 100, 6))}"><em>${p[2]}</em></i>` : ''}</div></div></div><div class="qy${i === hist.length - 1 ? ' b' : ''}">${p[0]}</div></div>`).join('')}</div></div>`,
      );
      b.append(panel);
      vals = [N, Q, PA];
    }
    /* font piu' grande possibile; poi il pannello occupa tutto lo spazio rimasto e il grafico si allunga */ const run =
      () => {
        if (panel) panel.style.flex = 'none';
        if (!cm) els.forEach((e) => (e.style.flex = '1 1 0'));
        const g = parseFloat(getComputedStyle(b).rowGap) || 0;
        for (let f = 40; f >= 13; f--) {
          b.style.setProperty('--fs', f + 'px');
          const ok = cm
            ? [...b.children].reduce((s, c) => s + c.offsetHeight, 0) + g * (b.children.length - 1) <=
              b.clientHeight - 2
            : els.every((c) => c.scrollHeight <= c.clientHeight + 1);
          if (ok) break;
        }
        if (panel) panel.style.flex = '1 1 0';
      };
    run();
    if (document.fonts) document.fonts.ready.then(run);
    return {
      steps: els.length + (cm ? 1 : 0),
      show(k) {
        els.forEach((e, i) => e.classList.toggle('on', i < k));
        if (!cm) return;
        const on = k > els.length;
        panel.classList.toggle('on', on);
        panel.querySelectorAll('.qbar,.qbar i').forEach((e) => (e.style.height = on ? e.dataset.h + '%' : '0'));
        [...panel.querySelectorAll('.qn')].forEach((el, i) => {
          if (on) cnum(el, vals[i]);
          else {
            el._v = 0;
            el.textContent = '0';
          }
        });
      },
    };
  };
})();
