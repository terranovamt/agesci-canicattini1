/* Come un divisore di sezione (titolo.js/titolo.css); con le votazioni abilitate aggiunge lo stato del voto. */
LANDSCAPE.slide_votazione = x => (r, D) => {
  const base = sec(x.titolo, x.sottotitolo)(r, D);
  if (!D.votazioni || !D.votazioni.abilitate || !window.VOTO) return base;
  const box = document.createElement('div');
  box.className = 'vt';
  r.querySelector('.rr').insertBefore(box, r.querySelector('.d'));
  let off = null;
  const draw = poll => {
    if (off && !box.isConnected) return off();
    const mine = poll && poll.slide === x.id ? poll : null;
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let h = `<div class="vt-q">${esc(x.domanda || '')}</div>`;
    if (!mine) h += `<div class="vt-s">Votazione non ancora aperta</div>`;
    else {
      const left = Math.max(0, mine.totale - mine.ricevuti);
      h += `<div class="vt-s ${mine.aperta ? 'on' : ''}">${mine.aperta ? 'Votazione aperta' : 'Votazione chiusa'} · ${mine.ricevuti} ${mine.ricevuti === 1 ? "voto ricevuto" : "voti ricevuti"} su ${mine.totale}</div>`;
      if (mine.conteggi) {
        h += '<div class="vt-c">' + mine.opzioni.map((o, n) => `<span><b>${mine.conteggi[n]}</b>${esc(o)}</span>`).join('') +
          `<span><b>${left}</b>Mancanti</span></div>`;
      }
    }
    box.innerHTML = h;
  };
  off = window.VOTO.on(draw);
  return base;
};
