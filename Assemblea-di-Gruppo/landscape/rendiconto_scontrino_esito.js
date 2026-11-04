/* ---- slide_rendiconto_scontrino_esito: scontrino + scala a fasce ---- */
const cmp = (r, D) => {
  band(r, 'RENDICONTO DI GRUPPO'); cnt.className = ''; const E = sum(D.entrate.map(x => x.importo)), U = sum(D.uscite.map(x => x.importo)), d = Math.round((E - U) * 100) / 100, neg = d < 0, ad = Math.abs(d), pct = E ? ad / E * 100 : 0;
  const S = (D.soglie_percentuali_esito && D.soglie_percentuali_esito.length >= 3) ? D.soglie_percentuali_esito : [1, 5, 10];
  const idx = pct < 1 ? -1 : pct < S[0] ? 0 : pct < S[1] ? 1 : pct < S[2] ? 2 : 3, sc = neg ? ['var(--ko)', 'var(--ko)', 'var(--ko)'] : ['var(--ok)', 'var(--ok)', 'var(--ok)'];
  const tier = [{ n: 'PAREGGIO', m: 'Entrate e uscite praticamente coincidono', c: 'var(--even)' }, { n: 'QUASI IN PARI', m: 'Una differenza minima', c: 'var(--near)' }, { n: neg ? 'DISAVANZO CONTENUTO' : 'PICCOLO AVANZO', m: neg ? 'Un disavanzo contenuto' : 'Un piccolo avanzo', c: sc[0] }, { n: neg ? 'DISAVANZO SIGNIFICATIVO' : 'AVANZO', m: neg ? 'Un disavanzo significativo' : 'Un avanzo', c: sc[1] }, { n: neg ? 'DISAVANZO ELEVATO' : 'GRANDE AVANZO', m: neg ? 'Un disavanzo elevato' : 'Un grande avanzo', c: sc[2] }][idx + 1];
  const totC = ad ? (neg ? 'var(--ko)' : 'var(--ok)') : 'var(--even)', MONO = "'Courier New',Courier,monospace", pctT = v => v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + '%';
  const pc = (el, to, dur = 1000) => { if (INST) dur = 1; const from = el._v || 0; el._v = to; const t0 = performance.now(); cancelAnimationFrame(el._r); (function f(t) { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = pctT(from + (to - from) * e); if (p < 1) el._r = requestAnimationFrame(f) })(t0) };
  const W = 560, H = 540, pts = ['0px 0px', W + 'px 0px']; for (let i = 0; i <= 28; i++)pts.push((W - i * 20) + 'px ' + (i % 2 ? H - 14 : H) + 'px');
  const rc = h(`<div class="a fade" style="left:110px;top:104px;width:${W}px;height:${H}px;filter:drop-shadow(0 12px 26px var(--shadow-chart))"><div style="position:absolute;inset:0;background:var(--w);clip-path:polygon(${pts.join(',')})"></div></div>`);
  const el = (top, html, st = '') => { const e = h(`<div class="fade" style="position:absolute;left:36px;right:36px;top:${top}px;${st}">${html}</div>`); rc.append(e); return e };
  const hd = el(26, `<div style="text-align:center;font:700 26px ${MONO};color:var(--ink)">ASSEMBLEA DI GRUPPO</div><div style="text-align:center;font:400 18px ${MONO};color:var(--muted);margin-top:4px">bilancio ${D.anno_esercizio}</div><div style="border-top:3px dotted var(--line);margin-top:18px"></div>`);
  const line = (top, lab, col) => el(top, `<div style="display:flex;align-items:baseline;justify-content:space-between;font-family:${MONO}"><span style="font-size:28px;color:${col}">${lab}</span><span class="v" style="font-size:36px;font-weight:700;color:var(--ink)"></span></div>`);
  const rE = line(138, 'Entrate', 'var(--ok)'), rU = line(214, '− Uscite', 'var(--ko)');
  const rule = h('<div style="position:absolute;left:36px;right:36px;top:290px;height:5px"><div style="height:100%;width:0;background:var(--vd);border-radius:3px;transition:width .8s ease"></div></div>'); rc.append(rule);
  const rT = el(312, `<div style="display:flex;align-items:baseline;justify-content:space-between;font-family:${MONO}"><span style="font-size:28px;font-weight:700;color:${totC}">TOTALE</span><span class="v ${ad && !neg ? 'plus' : ''}" style="font-size:58px;font-weight:700;color:${totC}"></span></div>`);
  const rK = el(402, `<div style="border-top:3px dotted var(--line)"></div><div style="text-align:center;font:400 19px ${MONO};color:var(--muted);margin-top:12px">${ad ? (neg ? 'disavanzo' : 'avanzo') + ' di esercizio' : 'esercizio in pareggio'}</div>`);
  const stamp = h(`<div style="position:absolute;left:0;right:0;top:470px;text-align:center;opacity:0;transform:scale(2.4) rotate(-22deg);transition:opacity .25s,transform .45s cubic-bezier(.2,1.7,.4,1)"><span style="display:inline-block;border:5px solid ${tier.c};border-radius:10px;padding:8px 18px;font:700 25px ${MONO};color:${tier.c};white-space:nowrap;background:var(--w80)">${tier.n}</span></div>`); rc.append(stamp);
  r.append(rc);
  const pn = h('<div class="card fade" style="left:720px;top:104px;width:504px;height:540px"></div>');
  const pe = (top, html, st = '') => { const e = h(`<div style="position:absolute;left:36px;right:36px;top:${top}px;${st}">${html}</div>`); pn.append(e); return e };
  pe(30, '<div class="k" style="font-size:20px;font-weight:700;opacity:1">In percentuale sulle entrate</div>');
  const big = pe(60, '', 'font-size:104px;font-weight:800;letter-spacing:-2px;white-space:nowrap;color:' + tier.c); big.textContent = '0%';
  pe(190, tier.m, 'font-size:26px;font-weight:700;color:var(--ink)');
  const lb = ['0–1%', `1–${S[0]}%`, `${S[0]}–${S[1]}%`, `${S[1]}–${S[2]}%`, `oltre ${S[2]}%`];
  const lo = [0, 1, S[0], S[1], S[2]], hi = [1, S[0], S[1], S[2], null], sw = 504 - 72, j = idx + 1;
  const fr = j < 4 ? (pct - lo[j]) / (hi[j] - lo[j]) : Math.min(1, (pct - S[2]) / S[2]);
  const tl = lb[j], a = lo[j] + '%', b = hi[j] === null ? '' : hi[j] + '%';
  const bar = pe(318, `<div style="position:absolute;left:0;top:0;height:100%;width:0;background:${tier.c};border-radius:11px;transition:width 1.1s cubic-bezier(.3,1.3,.4,1)"></div>`, 'height:22px;border-radius:11px;background:var(--track);overflow:hidden'), fill = bar.firstChild;
  pe(348, `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;color:var(--ink)"><span>${a}</span><span>${b}</span></div>`);
  const mk = pe(284, '▼', `right:auto;left:36px;width:24px;margin-left:-12px;text-align:center;font-size:22px;color:var(--ink);transition:left 1.1s cubic-bezier(.3,1.3,.4,1)`);
  pe(414, `<div style="font-size:16px;font-weight:600;color:var(--v);opacity:.8">Come si calcola</div><div style="font-size:21px;font-weight:500;color:var(--ink);margin-top:4px">${fmt(ad)} ÷ ${fmt(E)} = <b>${pctT(pct)}</b></div><div style="font-size:14px;color:var(--v);opacity:.7;margin-top:14px">Fascia attuale: ${tl} delle entrate</div>`);
  r.append(pn);
  const vE = rE.querySelector('.v'), vU = rU.querySelector('.v'), vT = rT.querySelector('.v');
  const reveal = receiptReveal(on => {
    stamp.style.opacity = on ? 1 : 0;
    stamp.style.transform = on ? 'rotate(-8deg)' : 'scale(2.4) rotate(-22deg)';
  }, on => {
    pn.classList.toggle('on', on);
    mk.style.left = (on ? 36 + fr * sw : 36) + 'px';
    fill.style.width = on ? fr * 100 + '%' : '0';
    if (on) pc(big, pct);
    else { cancelAnimationFrame(big._r); big._v = 0; big.textContent = '0%' }
  });
  return {
    steps: 3, show(k) {
      rc.classList.add('on'); hd.classList.add('on'); rE.classList.toggle('on', k >= 1); rU.classList.toggle('on', k >= 2);
      rule.firstChild.style.width = k >= 3 ? '100%' : '0'; rT.classList.toggle('on', k >= 3); rK.classList.toggle('on', k >= 3);
      reveal(k >= 3);
      if (k >= 1) counter(vE, E); else vE._v = 0; if (k >= 2) counter(vU, U); else vU._v = 0; if (k >= 3) counter(vT, d); else vT._v = 0;
    }
  }
};

LANDSCAPE.slide_rendiconto_scontrino_esito = () => cmp;
