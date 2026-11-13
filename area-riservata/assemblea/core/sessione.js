(function () {
  const A = window.ASSEMBLEA, L = window.LIVE;
  if (!L?.url || L.vista === 'principale' || L.vista === 'anteprima') return;
  const errore = document.createElement('p');
  errore.setAttribute('role', 'alert');
  errore.style.cssText = 'position:fixed;bottom:calc(84px + env(safe-area-inset-bottom,0px));left:5%;right:5%;z-index:100;background:#fff0e8;color:#8b2400;padding:10px 14px;border-radius:12px;font:13px system-ui';
  errore.hidden = true;
  document.body.append(errore);
  A.osserva(s => {
    errore.hidden = true;
    if (s?.attiva === false) location.replace('../../');
  }, e => {
    errore.textContent = e.message + '. Riprovo automaticamente.';
    errore.hidden = false;
    console.error(e);
  });
  if (L.ruolo !== 'regia') return;
  const fine = document.createElement('button');
  fine.className = 'nb';
  fine.id = 'termina-assemblea';
  fine.title = 'Termina assemblea e ripristina la home del gruppo';
  fine.innerHTML = '<span>Termina assemblea</span>';
  fine.style.display = 'none';
  nav.append(fine);
  const originalGo = go;
  go = (i, k, sincronizzata) => {
    originalGo(i, k, sincronizzata);
    fine.style.display = si === scenes.length - 1 ? 'flex' : 'none';
  };
  fine.onclick = async e => {
    e.stopPropagation();
    if (!confirm('Terminare l’assemblea e riportare il sito alla home del gruppo?')) return;
    fine.disabled = true;
    try { await A.salva(false); location.replace('../../') }
    catch (err) {
      fine.disabled = false;
      errore.textContent = err.message;
      errore.hidden = false;
    }
  };
})();
