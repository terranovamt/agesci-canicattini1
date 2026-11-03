/* ---- slide_rendiconto_entrate_uscite: entrate -> uscite (un'unica scena) ---- */
const cassa = () => (r, D) => {
  band(r, 'RENDICONTO DI GRUPPO'); cnt.className = ''; const En = D.entrate, Us = D.uscite, Ap = D.anno_esercizio - 1, pE = En.map(x => x.importo_anno_precedente ?? 0), pU = Us.map(x => x.importo_anno_precedente ?? 0), nE = En.length, E = sum(En.map(x => x.importo)), U = sum(Us.map(x => x.importo)), L = 2 * Math.PI * 150, cx = 950, cy = 400, EAS = 'cubic-bezier(.6,0,.2,1)';
  const card = h(`<div class="card" style="left:56px;top:110px;width:600px;height:170px;padding:26px 32px;transition:left 1.1s ${EAS},width 1.1s ${EAS}"><div class="k"></div></div>`);
  const lab = card.firstChild, big = h('<div class="num" style="font-size:72px;margin-top:6px"></div>'), suf = h(`<div class="k" style="margin-top:2px"><span data-t></span><span style="margin-left:14px;opacity:.8">· nel ${Ap}: <b data-p style="color:var(--vd)"></b></span></div>`), sufT = suf.querySelector('[data-t]'), sufP = suf.querySelector('[data-p]'); card.append(big, suf); r.append(card);
  const rw = (x, i, c, l, w, ex, up, pv) => { const e = h(`<div class="row ${ex}" style="left:${l}px;width:${w}px;top:${300 + i * 68}px"><i style="background:${C[i % 5]}"></i><span>${x.descrizione}</span><div style="text-align:right;flex:none"><b>${fmt(x.importo)}</b><div class="pv">${Ap}: ${fmt(pv)}</div></div></div>`); r.append(e); return e };
  const rE = En.map((x, i) => rw(x, i, 0, 56, 600, '', true, pE[i])), rU = Us.map((x, i) => rw(x, i, 0, 660, 564, 'rt', false, pU[i]));
  donut(r, cx, cy, 150, 115, nE + 1, C); const svg = r.lastChild, cs = [...svg.querySelectorAll('circle')];
  cs.forEach((c, i) => c.setAttribute('stroke', i < nE ? C[i % 5] : V('--ko'))); cs[nE].setAttribute('transform', `scale(-1,1) translate(${-2 * cx},0) rotate(-90 ${cx} ${cy})`);
  const tr = document.createElementNS(NS, 'circle'); Object.entries({ cx, cy, r: 150, fill: 'none', stroke: V('--track'), 'stroke-width': 115 }).forEach(([k, v]) => tr.setAttribute(k, v)); svg.prepend(tr);
  const ct = centre(r, cx, cy, 'Entrate'), cw = ct.parentNode, cl = cw.firstChild; ct.style.fontSize = '40px'; svg.style.transition = cw.style.transition = `transform 1.1s ${EAS}`;
  let ph = null, pr = L;
  return {
    steps: nE + 1 + Us.length, show(k) {
      const p2 = k > nE, nu = Math.max(0, k - nE - 1), Uk = sum(Us.slice(0, nu).map(x => x.importo));
      rE.forEach((e, i) => { e.classList.toggle('on', i < Math.min(k, nE)); e.classList.toggle('gone', p2) }); rU.forEach((e, i) => e.classList.toggle('on', i < nu));
      card.style.left = p2 ? '660px' : '56px'; card.style.width = p2 ? '564px' : '600px'; svg.style.transform = cw.style.transform = p2 ? 'translateX(-620px)' : 'none';
      if (p2 !== ph) { big._v = 0; sufP._v = 0; ph = p2 }
      lab.textContent = p2 ? 'Le Uscite sono state:' : 'Quest’anno il gruppo scout ha avuto'; sufT.textContent = p2 ? (nu < Us.length ? 'finora' : 'in totale') : 'di Entrate'; counter(sufP, p2 ? sum(pU.slice(0, nu)) : sum(pE.slice(0, Math.min(k, nE))));
      const vE = En.map((x, i) => i < k ? x.importo : 0), tE = sum(vE), dis = E - Uk < 0; let a = 0;
      if (!p2) { pr = L; cs.forEach(c => c.style.transition = ''); const t = tE || 1; En.forEach((x, i) => { const l = vE[i] / t * L; cs[i].setAttribute('stroke-dasharray', `${Math.max(0, l - 3)} ${L}`); cs[i].setAttribute('stroke-dashoffset', -a); a += l }); cs[nE].setAttribute('stroke-dasharray', `0 ${L}`) }
      else {
        const rem = (E - Uk) / E * L, D = 1.2;
        const tr = (s, e, el) => {
          const lo = Math.max(Math.min(pr, rem), s), hi = Math.min(Math.max(pr, rem), e);
          if (pr === rem || hi <= lo) { el.style.transition = 'none'; return }
          const d = Math.abs(pr - rem), t0 = (pr > rem ? pr - hi : lo - pr) / d, t1 = (pr > rem ? pr - lo : hi - pr) / d;
          el.style.transition = `stroke-dasharray ${(t1 - t0) * D}s linear ${t0 * D}s`
        };
        let s0 = 0; En.forEach((x, i) => { const l = x.importo / E * L, vis = Math.min(l, Math.max(0, rem - s0)); tr(s0, s0 + l, cs[i]); cs[i].setAttribute('stroke-dasharray', `${Math.max(0, vis - 3)} ${L}`); cs[i].setAttribute('stroke-dashoffset', -s0); s0 += l });
        tr(-1e9, 0, cs[nE]);
        cs[nE].setAttribute('stroke-dasharray', `${dis ? Math.min(L, Math.max((Uk - E) / E * L, 10)) : 0} ${L}`);
        pr = rem
      }
      counter(big, p2 ? Uk : tE); cl.textContent = !p2 ? 'Entrate' : dis ? 'Disavanzo' : 'Saldo'; ct.classList.toggle('red', p2 && dis); counter(ct, p2 ? E - Uk : tE)
    }
  }
};

LANDSCAPE.slide_rendiconto_entrate_uscite = cassa;
