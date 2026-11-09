/* ---- slide_ordine_del_giorno (punti: stringhe oppure {testo, slide_collegata}) ---- */
const odg = x => (r, D) => {
  band(r, x.titolo_barra || 'ORDINE DEL GIORNO'); cnt.className = '';
  const L = x.punti.map(p => typeof p === 'string' ? { testo: p } : p), gap = Math.min(104, 520 / L.length);
  const list = h('<ol class="odg-list" aria-label="Ordine del giorno"></ol>');
  r.append(list);
  const els = L.map((p, i) => {
    const e = h(`<li class="row odg-row" style="left:90px;width:1100px;height:${gap - 16}px;top:${126 + i * gap}px;border-left:10px solid ${C[i % 5]}"></li>`);
    const content = `<span class="odg-number" aria-hidden="true">${i + 1}</span><span class="odg-text">${p.testo}</span>`;
    const collegata = p.slide_collegata && window.LIVE?.vista !== 'schermo';
    const action = h(
      collegata
        ? `<button type="button" class="odg-action">${content}</button>`
        : `<div class="odg-action">${content}</div>`,
    );
    if (collegata) linkSlide(action, p);
    e.append(action);
    list.append(e);
    return e;
  });
  return { steps: L.length, show(k) { els.forEach((e, i) => {
    e.classList.toggle('on', i < k);
    e.style.background = i === k - 1 ? 'var(--w)' : 'var(--w72)';
    const action = e.querySelector('button');
    if (action) {
      action.tabIndex = i < k ? 0 : -1;
      if (i === k - 1) action.setAttribute('aria-current', 'step');
      else action.removeAttribute('aria-current');
    }
  }) } }
};

LANDSCAPE.slide_ordine_del_giorno = odg;
