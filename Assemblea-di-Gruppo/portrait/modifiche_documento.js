(function () {
  const { HEAD, norm, mkFl, mkBody, fitBox, cnum, link } = PORTRAIT_UTIL;
  /* ===== MODIFICHE AL DOCUMENTO - C: selettore fisso + testo + elenco modifiche ===== */
  PORTRAIT.slide_modifiche_documento = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'MODIFICHE AL DOCUMENTO');
    const A = tok(x.prima),
      B = tok(x.dopo),
      segs = frasi(diffSegs(A, B));
    const unico = modoModifiche(x, A, B, segs) === 'unico';
    const sp = (f, pl, out) => (out && !isP(f) && !isO(pl) ? ' ' : '');
    const W = (t) => `<span class="w">${t}</span>`,
      last = (a) => a[a.length - 1];
    let out = '',
      pl = '';
    segs.forEach((s) => {
      if (s.ty === 'eq') {
        out += sp(s.q[0], pl, out) + joinT(s.q);
        pl = last(s.q);
      } else if (s.ty === 'del') {
        out += `<del>${sp(s.d[0], pl, out)}${W(joinT(s.d))}</del>`;
      } else if (s.ty === 'ins') {
        out += `<ins>${sp(s.a[0], pl, out)}${W(joinT(s.a))}</ins>`;
        pl = last(s.a);
      } else {
        out += `<s>${sp(s.d[0], pl, out)}${W(joinT(s.d))}</s><b>${sp(s.a[0], pl, out)}${W(joinT(s.a))}</b>`;
        pl = last(s.a);
      }
    });
    const ch = [],
      nC = segs.filter((s) => s.ty !== 'eq').length;
    segs.forEach((s) => {
      if (s.ty === 'eq') return;
      if (s.d && s.d.length) ch.push(['−', 'r', joinT(s.d)]);
      if (s.a && s.a.length) ch.push(['+', 'g', joinT(s.a)]);
    });
    const LB = [x.etichetta_prima || 'Attuale', x.etichetta_modifiche || 'Modifiche', x.etichetta_dopo || 'Proposto'];
    const box = mkFl(r, 'mc nt');
    box.dataset.s = 0;
    box.innerHTML = `<div class="mh">${x.titolo ? `<div class="mtt">${x.titolo}</div>` : ''}<div class="seg">${LB.map((t) => `<span>${t}</span>`).join('')}</div></div><div class="tx">${out}</div><div class="cl"><div class="cn">${nC} ${nC === 1 ? 'cambiamento' : 'cambiamenti'}</div>${ch.map((c) => `<div class="cr"><span class="sg ${c[1]}">${c[0]}</span><span>${c[2]}</span></div>`).join('')}</div>${x.nota ? `<div class="mn">${x.nota}</div>` : ''}`;
    const tabs = [...box.querySelectorAll('.seg span')];
    let kk = -1;
    tabs.forEach(
      (t, i) =>
        (t.onclick = (ev) => {
          ev.stopPropagation();
          go(si, unico ? i : i === 1 ? 1 : 0);
          if (!unico) setS(i === 1 && sk < 1 ? 0 : i);
        }),
    );
    tabs.forEach((t) => {
      t.dataset.liveControl = '';
    });
    const setS = (k) => {
      box.dataset.s = k;
      tabs.forEach((t, i) => t.classList.toggle('on', i === k));
    };
    /* misura col passo 1 (testo piu' lungo), senza transizioni */ const fitM = () => {
      box.classList.add('nt');
      box.dataset.s = 1;
      for (let f = 38; f >= 14; f--) {
        box.style.setProperty('--fs', f + 'px');
        if (box.scrollHeight <= box.clientHeight + 1) break;
      }
      setS(Math.max(kk, 0));
      void box.offsetWidth;
      requestAnimationFrame(() => {
        if (!INST) box.classList.remove('nt');
      });
    };
    fitM();
    if (document.fonts) document.fonts.ready.then(fitM);
    return {
      steps: unico ? 2 : 1,
      show(k) {
        k = unico ? k : k > 0 ? 1 : 0;
        if (k === kk) return;
        const first = kk < 0;
        kk = k;
        if (first || INST) box.classList.add('nt');
        else box.classList.remove('nt');
        setS(k);
      },
    };
  };
})();
