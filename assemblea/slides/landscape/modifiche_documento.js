/* ---- slide_modifiche_documento ----
 Confronta "prima" e "dopo" parola per parola e sceglie da sola come mostrarli:
 - testi SIMILI   -> UNA card (3 passi): testo attuale -> differenze -> testo proposto
                     (la card resta la stessa: cambiano solo le classi, le parole
                      si espandono/comprimono con transizione fluida)
 - testi DIVERSI  -> DUE card affiancate (attuale a sinistra, proposto a destra)
 Si può forzare con  "modalita": "unico"  oppure  "affiancato".
 Nel passo "Modifiche" la legenda prende il posto della nota (stessa dimensione). */
/* confronto dei testi: core/differenze-testo.js */

const modifiche = x => (r, D) => {
  band(r, x.titolo_barra || 'MODIFICHE AL DOCUMENTO'); cnt.className = ''; r.classList.add('mod');
  const A = tok(x.prima), B = tok(x.dopo), segs = frasi(diffSegs(A, B));
  const mode = modoModifiche(x, A, B, segs);
  r.append(h(`<h2 class="mt">${x.titolo || ''}</h2>`));
  const noteEl = x.nota ? h(`<div class="nt2">${x.nota}</div>`) : null;
  if (noteEl) r.append(noteEl);
  const eq = s => ({ h: joinT(s.q), f: s.q[0], l: s.q[s.q.length - 1] });

  /* ---- UNA card: attuale -> differenze -> proposto ---- */
  if (mode === 'unico') {
    const diff = render(segs, s => s.ty === 'eq' ? eq(s)
      : s.ty === 'del' ? { h: `<del>${joinT(s.d)}</del>`, f: s.d[0], l: s.d[s.d.length - 1] }
        : s.ty === 'ins' ? { h: `<ins>${joinT(s.a)}</ins>`, f: s.a[0], l: s.a[s.a.length - 1] }
          : { h: `<span class="ch"><s>${joinT(s.d)}</s> <b>${joinT(s.a)}</b></span>`, f: s.d[0], l: s.a[s.a.length - 1] });
    const views = [
      { tag: x.etichetta_prima || 'TESTO ATTUALE', col: 'var(--r)', ink: 'var(--r)' },
      { tag: x.etichetta_modifiche || 'MODIFICHE', col: 'var(--y)', ink: 'var(--vd)' },
      { tag: x.etichetta_dopo || 'TESTO PROPOSTO', col: 'var(--g)', ink: 'var(--g)' }
    ];
    /* la card viene creata UNA volta sola: il testo con le differenze resta sempre nel DOM */
    const c = h(`<div class="col one nt" data-s="0" style="left:50px;width:1180px"><div class="tg"></div><div class="tx"></div></div>`);
    r.append(c);
    const lg = h(`<div class="lg2"><span><i style="background:color-mix(in srgb,var(--r) 40%,transparent)"></i>Tolto</span><span><i style="background:color-mix(in srgb,var(--g) 45%,transparent)"></i>Aggiunto</span><span><i style="background:color-mix(in srgb,var(--y) 80%,transparent)"></i>Modificato</span></div>`);
    r.append(lg);
    /* la legenda copia dimensione e posizione della nota (se non c'è la nota: valori di riserva) */
    const matchNote = () => {
      if (noteEl) {
        const cs = getComputedStyle(noteEl);
        lg.style.fontSize = cs.fontSize; lg.style.fontWeight = cs.fontWeight; lg.style.fontFamily = cs.fontFamily;
        lg.style.letterSpacing = cs.letterSpacing; lg.style.color = cs.color;
        if (cs.position === 'absolute') { lg.style.top = cs.top; lg.style.bottom = 'auto'; lg.style.height = cs.height }
        else { lg.style.bottom = '16px' }
      } else { lg.style.fontSize = '24px'; lg.style.bottom = '16px' }
    };
    matchNote(); if (document.fonts) document.fonts.ready.then(matchNote);

    const tag = c.querySelector('.tg'), tx = c.querySelector('.tx'); let kk = -1;
    tx.innerHTML = diff;
    const setTag = k => { const v = views[k]; tag.textContent = v.tag; tag.style.background = `color-mix(in srgb,${v.col} 22%,transparent)`; tag.style.color = v.ink; c.style.borderColor = v.col };
    /* passo 1: legenda visibile e nota nascosta; altri passi: nota visibile e legenda nascosta */
    const setState = k => { c.dataset.s = k; lg.classList.toggle('on', k === 1); if (noteEl) noteEl.style.opacity = k === 1 ? 0 : 1 };
    /* misura la dimensione del font col testo più lungo (passo 1: tutto visibile), senza transizioni */
    const fitU = () => {
      c.classList.add('nt'); c.dataset.s = 1;
      for (let f = 40; f >= 16; f--) { r.style.setProperty('--fs', f + 'px'); if (tx.scrollHeight <= tx.clientHeight + 1) break }
      const k = Math.max(kk, 0); setState(k); setTag(k); void c.offsetWidth;
      requestAnimationFrame(() => { if (!INST) c.classList.remove('nt') });
    };
    fitU(); if (document.fonts) document.fonts.ready.then(fitU);
    return {
      steps: 2, show(k) {
        if (k === kk) return;
        const first = kk < 0; kk = k;
        if (first || INST) { c.classList.add('nt'); setState(k); setTag(k); return }
        c.classList.remove('nt'); setState(k);
        /* etichetta: piccola dissolvenza, la card non viene toccata */
        tag.style.opacity = 0;
        setTimeout(() => { if (kk === k) { setTag(k); tag.style.opacity = 1 } }, 160);
      }
    };
  }

  /* ---- DUE card affiancate: attuale | proposto (al click si evidenziano le differenze) ---- */
  const left = render(segs, s => s.ty === 'eq' ? eq(s) : (s.d && s.d.length) ? { h: `<del>${joinT(s.d)}</del>`, f: s.d[0], l: s.d[s.d.length - 1] } : null);
  const right = render(segs, s => s.ty === 'eq' ? eq(s) : (s.a && s.a.length) ? { h: `<ins>${joinT(s.a)}</ins>`, f: s.a[0], l: s.a[s.a.length - 1] } : null);
  const mk = (lf, lab, col, html) => { const c = h(`<div class="col" style="left:${lf}px;border-color:${col}"><div class="tg" style="background:color-mix(in srgb,${col} 18%,transparent);color:${col}">${lab}</div><div class="tx">${html}</div></div>`); r.append(c); return c.querySelector('.tx') };
  const a = mk(50, x.etichetta_prima || 'TESTO ATTUALE', 'var(--r)', left), b = mk(655, x.etichetta_dopo || 'TESTO PROPOSTO', 'var(--g)', right);
  let K = 0;
  const fitM = () => { r.classList.add('dif'); for (let f = 34; f >= 14; f--) { r.style.setProperty('--fs', f + 'px'); if (a.scrollHeight <= a.clientHeight + 1 && b.scrollHeight <= b.clientHeight + 1) break } r.classList.toggle('dif', K >= 1) };
  fitM(); if (document.fonts) document.fonts.ready.then(fitM);
  return { steps: 1, show(k) { K = k; r.classList.toggle('dif', k >= 1) } }
};

LANDSCAPE.slide_modifiche_documento = modifiche;
