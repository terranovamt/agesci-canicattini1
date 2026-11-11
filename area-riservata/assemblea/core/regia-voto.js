/* Regia: apri/chiudi la votazione della slide corrente e leggi i risultati. Visibile solo sulle slide votazione. */
(function () {
  const box = document.getElementById("regia-voto");
  if (!box) return;
  const API = ((window.LIVE || {}).basePath || "") + "/api/vote";
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let slide = null, poll = null, busy = false, firma = "";
  async function chiama(path, data) {
    const r = await fetch(API + "/" + path, data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : { cache: "no-store" });
    const t = await r.text();
    if (!r.ok) throw new Error(t || "Errore " + r.status);
    return t ? JSON.parse(t) : {};
  }
  function corrente() {
    const w = document.getElementById("principale").contentWindow;
    try {
      const s = w && w.VISTA && w.VISTA.stato();
      const x = s && s.n && w.VISTA.slide(s.i);
      return x && x.tipo === "slide_votazione" && w.DATI.votazioni && w.DATI.votazioni.abilitate ? x.x || null : null;
    } catch (e) { return null; }
  }
  function disegna(errore) {
    box.hidden = !slide;
    if (!slide) return;
    const mio = poll && poll.slide === slide.id ? poll : null;
    const aperta = !!(mio && mio.aperta);
    let h = `<h3>Votazione · ${esc(slide.domanda || "")}</h3>`;
    h += `<p class="vt-st">${!mio ? "Non ancora aperta" : aperta ? "<b>APERTA</b>" : "Chiusa"}${mio ? ` · ${mio.ricevuti} ${mio.ricevuti === 1 ? "voto" : "voti"} su ${mio.totale}` : ""}</p>`;
    if (mio && mio.conteggi) {
      const max = Math.max(...mio.conteggi);
      h += '<ul class="vt-ris">' + mio.opzioni.map((o, n) => `<li${!aperta && mio.modalita === "nominativa" && mio.conteggi[n] === max && max > 0 ? ' class="vinc"' : ""}><span>${esc(o)}</span><b>${mio.conteggi[n]}</b></li>`).join("") + "</ul>";
    }
    h += `<div class="vt-az"><button id="vt-apri" class="${aperta ? "sec" : ""}" ${busy ? "disabled" : ""}>${aperta ? "Chiudi votazione" : mio ? "Riapri" : "Apri votazione"}</button>${mio ? '<button id="vt-reset" class="sec">Azzera</button>' : ""}</div>`;
    if (errore) h += `<p class="vt-er" role="alert">${esc(errore)}</p>`;
    const f = h;
    if (f === firma) return;
    firma = f;
    box.innerHTML = h;
    const apri = box.querySelector("#vt-apri");
    apri.onclick = () => azione(aperta ? "close" : "open", aperta ? {} : { slide: slide.id, domanda: slide.domanda, modalita: slide.modalita, opzioni: slide.modalita === "nominativa" ? slide.opzioni : ["Favorevole", "Contrario", "Astenuto"], live: slide.modalita !== "nominativa" && slide.mostra_live !== false });
    const rs = box.querySelector("#vt-reset");
    if (rs) rs.onclick = () => confirm("Azzerare la votazione? I voti già espressi verranno cancellati.") && azione("reset", { slide: slide.id });
  }
  async function azione(path, data) {
    busy = true;
    try { await chiama(path, data); await leggi(); disegna(); } catch (e) { busy = false; firma = ""; return disegna(e.message); }
    busy = false;
    firma = "";
    disegna();
  }
  async function leggi() {
    slide = corrente();
    if (!slide) return disegna();
    try { poll = (await chiama("results?slide=" + encodeURIComponent(slide.id))).poll; disegna(); } catch (e) { disegna(e.message); }
  }
  leggi();
  setInterval(leggi, 2000);
})();
