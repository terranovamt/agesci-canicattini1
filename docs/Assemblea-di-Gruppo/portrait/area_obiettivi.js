(function () {
  const { HEAD, mkBody, fitBox, norm } = PORTRAIT_UTIL;
  /* ===== AREA OBIETTIVI - C: testata con numero e citazione fissa, obiettivi in schede ===== */
  PORTRAIT.slide_area_obiettivi = (x) => (r, D) => {
    HEAD(r, 'AREA DI INTERVENTO ' + (x.numero || ''));
    const L = x.obiettivi || [],
      P = (x.punti || []).map(norm),
      box = mkBody(r);
    box.classList.add('aop');
    box.style.setProperty('--ac', x.colore || 'var(--v)');
    box.append(
      h(
        `<div class="aot"><div class="aon">${x.numero || ''}</div><div class="aoh"><div class="aoa">AREA DI INTERVENTO</div><div class="aoi">${x.titolo || ''}</div></div></div>`,
      ),
      h(`<div class="aoq">“${(x.citazione || '').replace(/^[“"]|[”"]$/g, '')}”<small>${x.autore || ''}</small></div>`),
    );
    const els = L.map((o, i) => {
      const e = h(
        `<div class="aoc ent"><div class="aob">OBIETTIVO ${i + 1}</div><div class="aog">${o.titolo}</div><div class="aop2">${o.percorso || ''}</div></div>`,
      );
      box.append(e);
      return e;
    });
    const pe = P.length
      ? h(`<div class="aoc ent aopt"><ul>${P.map((p) => `<li>${p.testo}</li>`).join('')}</ul></div>`)
      : null;
    if (pe) box.append(pe);
    fitBox(box, 46, 14);
    return {
      steps: L.length,
      show(k) {
        els.forEach((e, i) => e.classList.toggle('on', i < k));
        if (pe) pe.classList.toggle('on', k === 0);
      },
    };
  };
})();
