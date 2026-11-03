(function () {
  const { HEAD, mkBody, fitBox } = PORTRAIT_UTIL;
  /* ===== CAMBIO DATE - C: pannello esplicativo in alto, PRIMA (barrato) e DOPO sotto ===== */
  PORTRAIT.slide_cambio_date = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'ALLINEAMENTO ANNO SCOUT');
    const p = x.pannello || {},
      box = mkBody(r);
    box.classList.add('cdp');
    const pn = h(
      `<div class="cdi"><div class="cdl1">${p.etichetta || ''}</div><div class="cdt">${p.titolo || ''}</div><i></i><div class="cdx">${p.testo || ''}</div></div>`,
    );
    const mk = (cls, lab, yr) =>
      h(`<div class="cdc ${cls}"><div class="cdk">${lab}</div><div class="cdy"><span>${yr || ''}</span><u></u></div></div>`);
    const a = mk('old', x.etichetta_prima || 'PRIMA', x.prima),
      arr = h('<div class="cda">↓</div>'),
      b = mk('new', x.etichetta_dopo || 'DOPO', x.dopo);
    box.append(pn, a, arr, b);
    fitBox(box, 40, 18, '.cdi');
    let tm = [];
    const set = (on) => {
      [a, b, arr].forEach((e) => e.classList.toggle('on', on));
      a.querySelector('u').style.transform = on ? 'scaleX(1)' : 'scaleX(0)';
    };
    const play = () => {
      tm.forEach(clearTimeout);
      tm = [];
      set(false);
      if (INST) return set(true);
      r.offsetWidth;
      tm.push(setTimeout(() => a.classList.add('on'), 300));
      tm.push(setTimeout(() => (a.querySelector('u').style.transform = 'scaleX(1)'), 1000));
      tm.push(setTimeout(() => arr.classList.add('on'), 1700));
      tm.push(setTimeout(() => b.classList.add('on'), 2100));
    };
    return { steps: 0, show: play };
  };
})();
