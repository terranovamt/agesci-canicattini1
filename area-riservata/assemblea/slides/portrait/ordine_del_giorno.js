(function () {
  const { HEAD, norm, mkBody, fitBox, link } = PORTRAIT_UTIL;
  /* ===== ORDINE DEL GIORNO: come l'orizzontale, schede con bordo colorato e numero nel cerchio ===== */
  PORTRAIT.slide_ordine_del_giorno = (x) => (r, D) => {
    HEAD(r, x.titolo_barra || 'ORDINE DEL GIORNO');
    const L = x.punti.map(norm),
      box = mkBody(r);
    box.classList.add('odp');
    const list = h('<ol class="odp-list" aria-label="Ordine del giorno"></ol>');
    box.append(list);
    const els = L.map((p, i) => {
      const e = h(`<li class="odc" style="border-left-color:${C[i % 5]}"></li>`);
      const content = `<b aria-hidden="true">${i + 1}</b><span class="odt">${p.testo}</span>`;
      const collegata = p.slide_collegata && window.LIVE?.vista !== 'schermo';
      const action = h(
        collegata
          ? `<button type="button" class="odp-action" tabindex="-1">${content}</button>`
          : `<div class="odp-action">${content}</div>`,
      );
      if (collegata) link(action, p);
      e.append(action);
      list.append(e);
      return e;
    });
    fitBox(box, 40, 15, '.odt');
    return {
      steps: L.length,
      show(k) {
        els.forEach((e, i) => {
          e.classList.toggle('on', i < k);
          e.classList.toggle('hl', i === k - 1);
          const action = e.querySelector('button');
          if (action) {
            action.tabIndex = i < k ? 0 : -1;
            if (i === k - 1) action.setAttribute('aria-current', 'step');
            else action.removeAttribute('aria-current');
          }
        });
      },
    };
  };
})();
