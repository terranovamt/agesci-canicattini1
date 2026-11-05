/* ---- slide_titolo / slide_divisore_sezione ---- */
const sec = (t, sub) => (r, D) => { cnt.className = 'w'; r.classList.add('sec'); r.innerHTML = `<div class="l"><img src="../assets/img/logo-grande.png"><div>Associazione<br>Guide e Scouts<br>Cattolici Italiani</div></div><div class="rr"><h1>${t}</h1><h2>${sub ?? D.assemblea.titolo}</h2><div class="d">${D.assemblea.data}</div></div>`; return { steps: 0, show() { } } };

/* stesso layout anche per divisore_sezione (layout: titolo.css) */
LANDSCAPE.slide_titolo = x => sec(x.titolo, x.sottotitolo);
