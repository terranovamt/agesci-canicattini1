/* ---- slide_foto_gruppo / slide_grazie ---- */
const photo = (g, s) => (r) => {
  r.classList.add("photo");
  if (!ph.style.backgroundImage) {
    ph.style.backgroundImage = 'url("../../assets/img/foto-gruppo.webp")';
    if (CSS.supports("background-image", 'image-set(url("image.avif") type("image/avif"))'))
      ph.style.backgroundImage =
        'image-set(url("../../assets/img/foto-gruppo.avif") type("image/avif"), url("../../assets/img/foto-gruppo.webp") type("image/webp"))';
  }
  if (g)
    r.innerHTML = `<div class="gr"><h1>${s.testo || "Grazie"}</h1><div class="bb"></div><img src="../../assets/img/logo-grande.webp" decoding="async"></div>`;
  cnt.className = "w";
  return { steps: 0, show() {} };
};

LANDSCAPE.slide_foto_gruppo = (x) => photo(0, x);
