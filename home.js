(function () {
  const stato = document.getElementById('stato');
  window.ASSEMBLEA.osserva(s => {
    if (s?.attiva) location.replace('Assemblea-di-Gruppo/index.html' + location.search + location.hash);
    else if (stato) stato.textContent = 'Assemblea non in corso. Consulta gli eventi e i documenti del gruppo.';
  }, e => {
    if (stato) stato.textContent = e.message + '. Riprovo automaticamente; l’area riservata resta disponibile.';
    console.error(e);
  });
})();
