/* ---- slide_foto_gruppo / slide_grazie ---- */
const photo = (g, s) => (r) => { r.classList.add('photo'); if (g) r.innerHTML = `<div class="gr"><h1>${s.testo || 'Grazie'}</h1><div class="bb"></div><img src="../../assets/img/logo-grande.png"></div>`; cnt.className = 'w'; return { steps: 0, show() { } } };

/* La foto condivisa viene precaricata per le slide fotografiche. */
(function () {
  const src = '../../assets/img/foto-gruppo.jpg', im = new Image();
  im.onload = () => ph.style.backgroundImage = `url("${src}")`;
  im.onerror = () => console.error('Impossibile caricare la foto di gruppo:', src);
  im.src = src;
})();

LANDSCAPE.slide_foto_gruppo = x => photo(0, x);
