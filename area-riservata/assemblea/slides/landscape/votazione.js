/* Come un divisore di sezione (titolo.js/titolo.css); con le votazioni abilitate mostra stato e risultati.
   Il markup è prodotto da VOTO_RENDER (riusato anche dall'anteprima): solo presentazione, nessuna logica di voto. */
window.VOTO_RENDER = (function () {
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plain = t => String(t || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
  // percentuali arrotondate con il metodo del resto più grande: la somma fa 100
  function percents(counts) {
    const sum = counts.reduce((a, b) => a + b, 0);
    if (!sum) return counts.map(() => 0);
    const raw = counts.map(n => n / sum * 100), out = raw.map(Math.floor);
    let rest = 100 - out.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest-- > 0) out[i]++; });
    return out;
  }
  const state = p => p ? (p.aperta ? 'Aperta' : 'Chiusa') : 'Non ancora aperta';
  const head = (x, p, tag) => `<div class="vt-lab">${esc(plain(x.titolo))} · ${state(p)}</div><${tag} class="vt-q">${esc(x.domanda || '')}</${tag}>`;

  function scelta(x, p) {
    const tot = p.totale, [f, c, a] = p.conteggi || [0, 0, 0], [lf, lc, la] = p.opzioni;
    const base = f + c + a, w = n => base ? n / base * 100 : 0;
    const left = base ? (f + (base - f - c - a) / 2) / base * 100 : 0;
    const label = `${lf} ${f}, ${la} ${a}, ${lc} ${c} su ${tot}`;
    const hor = `<div class="vt-h"><div class="vt-top"><div>${head(x, p, 'div')}</div>
      <div class="vt-tot"><span><b>${p.ricevuti}</b><i>/${tot}</i></span><small>voti ricevuti</small></div></div>
      <div class="vt-bar" role="img" aria-label="${esc(label)}">
        <span class="vs vf" style="left:0;width:${w(f)}%"></span>
        <span class="vs vc" style="right:0;width:${w(c)}%"></span>
        <span class="vs va" style="left:${left}%;width:${w(a)}%;opacity:${a ? 1 : 0}"></span></div>
      <div class="vt-nums"><div class="vn vf"><b>${f}</b><span>${esc(lf)}</span></div>
        <div class="vn va"><b>${a}</b><span>${esc(la)}</span></div><div class="vn vc"><b>${c}</b><span>${esc(lc)}</span></div></div></div>`;
    const mob = `<div class="vt-m"><i class="vt-line"></i><div class="vt-title">${esc(plain(x.titolo))}</div>
      <div class="vt-st">${state(p)}</div><div class="vt-q">${esc(x.domanda || '')}</div>
      <span class="vt-pill">${p.ricevuti} su ${tot}</span>
      <div class="vt-r first"><span>${esc(lf)}</span><b>${f}</b></div><div class="vt-r"><span>${esc(lc)}</span><b>${c}</b></div>
      <div class="vt-r hl"><span>${esc(la)}</span><b>${a}</b></div></div>`;
    return hor + mob;
  }

  function nominativa(x, p) {
    const hidden = !p.conteggi;
    const items = p.opzioni.map((n, i) => ({ n, v: hidden ? 0 : p.conteggi[i] })).sort((a, b) => b.v - a.v);
    const pc = percents(items.map(i => i.v)), max = items.length ? items[0].v : 0;
    items.forEach((it, i) => { it.p = pc[i]; it.top = max > 0 && it.v === max; });
    const ties = items.filter(i => i.top).length > 1, dense = items.length > 4 ? ' dense' : '';
    const status = `${state(p)} · ${p.ricevuti} voti su ${p.totale}`;
    const bar = (it, cls) => `<div class="vt-pb ${cls}" role="progressbar" aria-label="${esc(it.n)}" aria-valuemin="0" aria-valuemax="${Math.max(1, items.reduce((a, b) => a + b.v, 0))}" aria-valuenow="${it.v}"><i style="width:${it.p}%"></i></div>`;
    const rows = hidden ? `<div class="vt-hid">${items.map(i => `<span>${esc(i.n)}</span>`).join('')}</div>` :
      items.map((it, i) => {
        const last = i === items.length - 1 && items.length > 3 && !it.top;
        const cls = it.top ? 'top' : last ? 'dim' : '';
        return `<div class="vt-c ${cls}"><div class="vt-cr"><span class="nm">${esc(it.n)}</span>${it.top ? `<span class="v"><b>${it.v}</b><i>${it.p}%</i></span>` : `<span class="v">${it.v} · ${it.p}%</span>`}</div>${bar(it, cls)}</div>`;
      }).join('');
    const hor = `<div class="vt-h nom${dense}"><div class="vt-lab">${esc(plain(x.titolo))}</div><div class="vt-q">${esc(x.domanda || '')}</div><div class="vt-status">${status}</div>${rows}</div>`;
    const first = items[0], others = items.slice(max > 0 ? (ties ? items.filter(i => i.top).length : 1) : 0);
    const lead = hidden || !max ? '' : `<div class="vt-lab">${ties ? 'In parità' : 'In testa'}</div>` +
      items.filter(i => i.top).map(i => `<div class="vt-lead"><div class="nm">${esc(i.n)}</div><div class="num"><b>${i.v}</b><i>${i.p}%</i></div></div>`).join('');
    const rest = hidden ? `<div class="vt-hid">${items.map(i => `<span>${esc(i.n)}</span>`).join('')}</div>` :
      (others.length ? `<div class="vt-rest">${others.map(i => `<div><span class="nm">${esc(i.n)}</span><span>${i.v} · ${i.p}%</span></div>`).join('')}</div>` : '');
    void first;
    const mob = `<div class="vt-m nom${dense}"><i class="vt-line"></i><div class="vt-title">${esc(plain(x.titolo))}</div>
      <div class="vt-st">${status}</div><div class="vt-q">${esc(x.domanda || '')}</div>${lead}${rest}</div>`;
    return hor + mob;
  }

  function html(x, p) {
    if (!p) return '';
    return p.modalita === 'scelta' && p.opzioni.length === 3 ? scelta(x, p) : nominativa(x, p);
  }
  return { html, percents };
})();

if (typeof LANDSCAPE !== 'undefined') LANDSCAPE.slide_votazione = x => (r, D) => {
  const base = sec(x.titolo, x.sottotitolo)(r, D);
  if (!D.votazioni || !D.votazioni.abilitate || !window.VOTO) return base;
  const rr = r.querySelector('.rr'), box = document.createElement('div');
  box.className = 'vt';
  box.setAttribute('aria-live', 'polite');
  rr.insertBefore(box, r.querySelector('.d'));
  let off = null;
  const draw = poll => {
    if (off && !box.isConnected) return off();
    const mine = poll && poll.slide === x.id ? poll : null;
    rr.classList.toggle('vt-on', !!mine);
    box.innerHTML = VOTO_RENDER.html(x, mine);
  };
  off = window.VOTO.on(draw);
  return base;
};
