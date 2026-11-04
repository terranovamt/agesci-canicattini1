/* ---- slide_foto_gruppo / slide_grazie ---- */
const photo = (g, s) => (r) => { r.classList.add('photo'); if (g) r.innerHTML = `<div class="gr"><h1>${s.testo || 'Grazie'}</h1><div class="bb"></div><img src="img/logo-grande.png"></div>`; cnt.className = 'w'; return { steps: 0, show() { } } };

/* foto di gruppo: file esterno, nome 'foto di gruppo' */
(function () {
  const c = [];['', 'img/'].forEach(d => ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG'].forEach(e => c.push(d + 'foto di gruppo.' + e)));
  (function t(i) { if (i >= c.length) return; const im = new Image(); im.onload = () => ph.style.backgroundImage = `url("${c[i]}")`; im.onerror = () => t(i + 1); im.src = c[i] })(0)
})();

LANDSCAPE.slide_foto_gruppo = x => photo(0, x);
