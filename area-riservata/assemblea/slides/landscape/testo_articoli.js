/* ---- slide_testo_articoli (auto-adattivo) ---- */
const reg = s => (r, D) => {
  band(r, s.titolo_barra || 'REGOLAMENTO ASSEMBLEARE'); cnt.className = ''; const box = h('<div class="reg"></div>'); r.append(box);
  const lis = []; (s.articoli || [{ titolo: s.titolo, paragrafi: s.paragrafi || [] }]).forEach(a => {
    const e = h(`<div class="art"><h3>${a.titolo}</h3><ol></ol></div>`); const ol = e.querySelector('ol');
    a.paragrafi.forEach(p => { const li = h(`<li>${p.testo || p}</li>`); if (p.sottopunti && typeof p === 'object') { const o = h('<ol></ol>'); p.sottopunti.forEach(s => { const l = h(`<li>${s}</li>`); o.append(l); lis.push(l) }); li.append(o) } ol.append(li); lis.splice(lis.length - (typeof p === 'object' && p.sottopunti ? p.sottopunti.length : 0), 0, li) }); box.append(e)
  });
  const fitT = () => { for (let f = 40; f >= 16; f--) { box.style.setProperty('--fs', f + 'px'); const used = [...box.children].reduce((s, c) => s + c.offsetHeight, 0) + (box.children.length - 1) * f * .8; if (used <= box.clientHeight - 6) break } };
  fitT(); if (document.fonts) document.fonts.ready.then(fitT);
  lis.forEach((l, k) => INST ? l.classList.add('on') : setTimeout(() => l.classList.add('on'), 400 + k * 350)); return { steps: 0, show() { } }
};

LANDSCAPE.slide_testo_articoli = reg;
