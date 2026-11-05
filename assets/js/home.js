(function () {
  const stato = document.getElementById('assembly-connection-status');
  window.ASSEMBLEA.osserva(s => {
    if (s?.attiva) location.replace('area-riservata/assemblea/index.html' + location.search + location.hash);
    else if (stato) { stato.textContent = ''; stato.hidden = true }
  }, e => {
    if (stato) { stato.textContent = e.message + '. Riprovo automaticamente; l’area riservata resta disponibile.'; stato.hidden = false }
    console.error(e);
  });
})();
