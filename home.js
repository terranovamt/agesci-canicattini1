(function () {
  const stato = document.getElementById('stato');
  window.ASSEMBLEA.osserva(s => {
    if (s?.attiva) location.replace('Assemblea-di-Gruppo/index.html' + location.search + location.hash);
    else {
      stato.dataset.state = 'inactive';
      stato.textContent = 'Nessuna assemblea in corso. La gestione è disponibile nell’area riservata.';
    }
  }, e => {
    stato.dataset.state = 'error';
    stato.textContent = e.message + '. Riprovo automaticamente; l’area riservata resta disponibile.';
    console.error(e);
  });
})();
