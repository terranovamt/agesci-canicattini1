(function () {
  const stato = document.getElementById('stato');
  const link = document.getElementById('assemblea');
  link.href = 'setup.html' + location.search;
  window.ASSEMBLEA.osserva(s => {
    if (s?.attiva) location.replace('Assemblea-di-Gruppo/index.html' + location.search + location.hash);
    else stato.textContent = 'Assemblea non in corso. Il pulsante apre la preparazione.';
  }, e => {
    stato.textContent = e.message + '. Riprovo automaticamente; il setup resta disponibile.';
    console.error(e);
  });
})();
