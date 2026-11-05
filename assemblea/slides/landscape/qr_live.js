/* ---- slide_qr_live: QR code + conto alla rovescia (layout: qr_live.css, valido anche in verticale) ---- */
/* parametri: { titolo, sottotitolo, data_ora: "2026-11-20T20:30:00", immagine } */
LANDSCAPE.slide_qr_live = x => (r, D) => {
  cnt.className = 'w';
  r.classList.add('qrl');
  const t = x.titolo || 'Scansiona il QR code<br><b>e segui l\'assemblea live</b>';
  r.innerHTML = `<div class="qra"><h1>${t}</h1><div class="qrs">${x.sottotitolo || D.assemblea.titolo}</div></div>
<div class="qrq"><img src="${x.immagine || '../assets/img/qr.svg'}" alt="QR code"></div>
<div class="qrc"><div class="qrl2"></div><div class="qrt"></div></div>`;
  const target = new Date(x.data_ora || '2026-11-20T20:30:00').getTime();
  const lab = r.querySelector('.qrl2'), box = r.querySelector('.qrt');
  const cell = (n, l) => `<div><b>${String(n).padStart(2, '0')}</b><span>${l}</span></div>`;
  const tick = () => {
    if (!r.isConnected) return clearInterval(id);
    const s = Math.floor((target - Date.now()) / 1000);
    if (s <= 0) { lab.textContent = ''; box.innerHTML = '<div class="qrn">Si comincia!</div>'; return }
    lab.textContent = 'L\'assemblea inizia tra';
    box.innerHTML = cell(Math.floor(s / 86400), 'giorni') + cell(Math.floor(s % 86400 / 3600), 'ore') + cell(Math.floor(s % 3600 / 60), 'minuti') + cell(s % 60, 'secondi');
  };
  const id = setInterval(tick, 1000); tick();
  return { steps: 0, show() { } };
};
