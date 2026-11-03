/* ---- slide_quorum_convocazioni (+ andamento censiti e presenti, se D.censimenti c'è) ---- */
const quorum = x => (r, D) => {
  band(r, x.titolo_barra || 'COSTITUZIONE DELL’ASSEMBLEA'); cnt.className = '';
  const CS = D.censimenti, cm = !!CS;
  const els = x.convocazioni.map((c, i) => {
    const e = h(`<div class="card fade" style="left:${100 + i * 560}px;top:${cm ? 96 : 140}px;width:520px;height:${cm ? 286 : 430}px;padding:${cm ? '18px 40px' : '34px 40px'};text-align:center;border-top:12px solid ${i ? 'var(--g)' : 'var(--y)'}"><div class="k" style="font-size:20px;font-weight:700;opacity:1">${c.nome}</div><div class="num" style="font-size:${cm ? 72 : 110}px;margin:${cm ? '4px 0 0' : '14px 0 6px'}">${[D.assemblea.prima_convocazione, D.assemblea.seconda_convocazione][i] ?? c.orario}</div><div style="font-size:14px;font-weight:600;opacity:.6;letter-spacing:2px">ORE</div><div style="height:3px;width:80px;background:var(--y);margin:${cm ? '10px auto' : '22px auto'};border-radius:2px"></div><div style="font-size:${cm ? 20 : 23}px;font-weight:700;color:var(--vd);line-height:1.3">${c.regola}</div><div style="font-size:14px;margin-top:${cm ? 8 : 14}px;opacity:.65">${c.riferimento_articolo || ''}</div></div>`);
    r.append(e); return e
  });
  if (!cm) return { steps: els.length, show(k) { els.forEach((e, i) => e.classList.toggle('on', i < k)) } };
  const N = CS.censiti_attuali, Q = Math.floor(N / 2) + 1;
  const nrm = v => typeof v === 'object' ? v : { censiti: v }, hist = Object.entries(CS.storico_per_anno || {}).map(([a, v]) => [a, nrm(v).censiti, nrm(v).presenti ?? null]); hist.push([String(D.anno_esercizio), N, CS.presenti_attuali ?? null]);
  const mx = Math.max(1, ...hist.map(p => p[1])), CW = 600, CH = 232, base = 190, MH = 120, gap = CW / hist.length, bw = Math.min(54, gap * .56);
  const pn = h(`<div class="card fade" style="left:100px;top:402px;width:1080px;height:272px"></div>`);
  const put = (html, st) => { const e = h(`<div style="position:absolute;${st}">${html}</div>`); pn.append(e); return e };
  const PA = CS.presenti_attuali, hp = PA != null, L1 = '<div class="k" style="font-weight:700;opacity:1">';
  const nS = (sz, col) => `font-size:${sz}px;font-weight:800;color:${col};font-variant-numeric:tabular-nums;letter-spacing:-1px;line-height:1`;
  let vN, vQ, vP = null;
  if (!hp) {
    put(`${L1}Associati censiti ${D.anno_esercizio}</div>`, 'left:40px;top:22px');
    vN = put('0', `left:40px;top:44px;${nS(62, 'var(--vd)')}`);
    put('<div style="height:3px;width:60px;background:var(--y);border-radius:2px"></div>', 'left:40px;top:128px');
    put(`${L1}Quorum in prima convocazione</div><div style="font-size:13px;opacity:.65;margin-top:1px">50% + 1 dei censiti</div>`, 'left:40px;top:142px');
    vQ = put('0', `left:40px;top:182px;${nS(62, 'var(--g)')}`);
  } else {
    const ok = PA >= Q, sm = t => `<span style="font-weight:500;opacity:.7"> ${t}</span>`;
    put(`${L1}Associati censiti ${D.anno_esercizio}</div>`, 'left:40px;top:14px');
    vN = put('0', `left:40px;top:34px;${nS(44, 'var(--vd)')}`);
    put(`${L1}Quorum 1ª convocazione${sm('(50% + 1)')}</div>`, 'left:40px;top:98px');
    vQ = put('0', `left:40px;top:118px;${nS(44, 'var(--g)')}`);
    put(`${L1}Presenti${sm('(' + Math.round(PA / N * 100) + '% dei censiti)')}</div>`, 'left:40px;top:182px');
    vP = put('0', `left:40px;top:202px;${nS(44, 'var(--v)')}`);
    put(`<div style="background:${ok ? 'var(--g)' : 'var(--y)'};color:${ok ? '#fff' : 'var(--vd)'};border-radius:16px;padding:6px 14px;font-size:14px;font-weight:800;white-space:nowrap">${ok ? '✓ Quorum raggiunto' : 'Mancano ' + (Q - PA) + ' per il quorum'}</div>`, 'left:150px;top:212px');
  }
  put('', 'left:400px;top:30px;width:1px;height:212px;background:var(--line);opacity:.6');
  put('<div class="k" style="font-weight:700;opacity:1;text-align:center">Censiti e presenti all’assemblea</div>', `left:440px;top:18px;width:${CW}px`);
  const sq = c => `<i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c};margin-right:6px;vertical-align:-1px"></i>`;
  put(`<span>${sq('var(--vl)')}Censiti</span><span>${sq('var(--v)')}Presenti</span>`, `left:440px;top:46px;width:${CW}px;display:flex;gap:20px;justify-content:center;font-size:12px;font-weight:600`);
  const bs = hist.map((p, i) => {
    const x = 440 + i * gap + (gap - bw) / 2, hh = Math.max(p[1] / mx * MH, 4), last = i === hist.length - 1, B = base + 30;
    const b = put('', `left:${x}px;top:${B}px;width:${bw}px;height:0;border-radius:10px 10px 0 0;background:var(--vl);transition:height .9s cubic-bezier(.2,.8,.2,1),top .9s cubic-bezier(.2,.8,.2,1)`);
    const v = put(p[1], `left:${x - 20}px;width:${bw + 40}px;text-align:center;top:${B - hh - 24}px;font-size:15px;font-weight:700;color:var(--vd);opacity:0;transition:opacity .6s .5s`);
    let pb = null, pv = null, ph = 0;
    if (p[2] != null) {
      ph = Math.min(Math.max(p[2] / mx * MH, 4), hh - 2);
      pb = put('', `left:${x}px;top:${B}px;width:${bw}px;height:0;border-radius:8px 8px 0 0;background:var(--v);transition:height .9s .35s cubic-bezier(.2,.8,.2,1),top .9s .35s cubic-bezier(.2,.8,.2,1)`);
      pv = put(p[2], `left:${x}px;width:${bw}px;text-align:center;top:${B - ph + 5}px;font-size:13px;font-weight:700;color:#fff;opacity:0;transition:opacity .6s .9s`);
    }
    put(p[0], `left:${x - 20}px;width:${bw + 40}px;text-align:center;top:${base + 36}px;font-size:12px;font-weight:${last ? 800 : 500};opacity:${last ? 1 : .65}`);
    return { b, v, hh, B, pb, pv, ph }
  });
  r.append(pn);
  const cint = (el, to, dur = 900) => { if (INST) dur = 1; const from = el._v || 0; el._v = to; const t0 = performance.now(); cancelAnimationFrame(el._r); (function f(t) { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(from + (to - from) * e); if (p < 1) el._r = requestAnimationFrame(f) })(t0) };
  return {
    steps: els.length + 1, show(k) {
      els.forEach((e, i) => e.classList.toggle('on', i < k));
      const on = k > els.length; pn.classList.toggle('on', on);
      bs.forEach(o => { o.b.style.height = on ? o.hh + 'px' : '0'; o.b.style.top = (on ? o.B - o.hh : o.B) + 'px'; o.v.style.opacity = on ? 1 : 0; if (o.pb) { o.pb.style.height = on ? o.ph + 'px' : '0'; o.pb.style.top = (on ? o.B - o.ph : o.B) + 'px'; o.pv.style.opacity = on ? 1 : 0 } });
      [[vN, N], [vQ, Q], [vP, PA]].forEach(([el, v]) => { if (!el) return; if (on) cint(el, v); else { el._v = 0; el.textContent = '0' } })
    }
  }
};

LANDSCAPE.slide_quorum_convocazioni = quorum;
