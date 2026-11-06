/* layout di slides/landscape/titolo.css */
/* ---- slide_chiusura: assemblea conclusa + orario live ---- */
const chiusura = x => (r, D) => {
  cnt.className = 'w'; r.classList.add('sec');
  r.innerHTML = `<div class="l"><img src="../../assets/img/logo-grande.webp"><div>Associazione<br>Guide e Scouts<br>Cattolici Italiani</div></div><div class="rr"><h1><b>${x.titolo || 'Assemblea conclusa'}</b></h1><h2>${x.sottotitolo ?? D.assemblea.titolo}</h2><div style="margin-top:34px;font-size:22px;font-weight:600;letter-spacing:3px;opacity:.85">ORE</div><div class="ck2" style="font-size:150px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-2px"></div><div class="d">${D.assemblea.data}</div></div>`;
  const el = r.querySelector('.ck2');
  const tick = () => {
    if (!r.isConnected) { clearInterval(iv); return }
    const n = new Date();
    el.textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0')
  };
  const iv = setInterval(tick, 1000); tick();
  return { steps: 0, show() { } }
};

LANDSCAPE.slide_chiusura = chiusura;
