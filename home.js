(function () {
  const menuToggle = document.getElementById('menu-toggle');
  const header = document.querySelector('.site-header');
  const closeMenu = () => {
    header.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Apri il menu');
  };
  menuToggle.onclick = () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    header.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
  };
  header.querySelectorAll('nav a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 640) closeMenu();
  });

  const stato = document.getElementById('assembly-connection-status');
  window.ASSEMBLEA.osserva(s => {
    if (s?.attiva) location.replace('Assemblea-di-Gruppo/index.html' + location.search + location.hash);
    else if (stato) { stato.textContent = ''; stato.hidden = true }
  }, e => {
    if (stato) { stato.textContent = e.message + '. Riprovo automaticamente; l’area riservata resta disponibile.'; stato.hidden = false }
    console.error(e);
  });
})();
