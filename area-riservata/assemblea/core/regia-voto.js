/* Regia: apri/chiudi la votazione della slide corrente e leggi i risultati. Visibile solo sulle slide votazione. */
(function () {
  const box = document.getElementById("regia-voto");
  if (!box) return;
  const API = ((window.LIVE || {}).basePath || "") + "/api/vote";
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let pres = 0, tipo = '', slide = null, poll = null, busy = false, firma = "";
  async function chiama(path, data) {
    const r = await fetch(API + "/" + path, data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : { cache: "no-store" });
    const t = await r.text();
    if (!r.ok) throw new Error(t || "Errore " + r.status);
    return t ? JSON.parse(t) : {};
  }
  const rep = document.getElementById("report-voti");
  function abilitate() {
    try { const w = document.getElementById("principale").contentWindow; return !!(w.DATI.votazioni && w.DATI.votazioni.abilitate); } catch (e) { return false; }
  }
  if (rep) rep.onclick = async () => {
    rep.disabled = true;
    try {
      const { polls } = await chiama("report");
      const w = document.getElementById("principale").contentWindow;
      const d = w.DATI || {}, titolo = (d.assemblea && (d.assemblea.titolo || d.assemblea.data)) || "";
      const blob = window.PDF_REPORT.crea("Report votazioni", "Assemblea di Gruppo" + (titolo ? " - " + String(titolo).replace(/<[^>]+>/g, " ") : "") + " - generato il " + new Date().toLocaleString("it-IT"), polls, pres || 0);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "report-votazioni.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { alert(e.message); }
    rep.disabled = false;
  };
  function corrente() {
    const w = document.getElementById("principale").contentWindow;
    try {
      const s = w && w.VISTA && w.VISTA.stato();
      const x = s && s.n && w.VISTA.slide(s.i);
      tipo = x ? x.tipo : '';
      pres = (w.DATI.censimenti && w.DATI.censimenti.presenti_attuali) || 0;
      return x && x.tipo === "slide_votazione" && w.DATI.votazioni && w.DATI.votazioni.abilitate ? x.x || null : null;
    } catch (e) { return null; }
  }
  function disegna(errore) {
    box.hidden = !slide;
    const t = document.getElementById("live-data-slide");
    if (t) t.textContent = slide ? "· votazione" : "";
    if (!slide) return;
    const mio = poll && poll.slide === slide.id ? poll : null;
    const aperta = !!(mio && mio.aperta);
    let h = `<h3>Votazione · ${esc(slide.domanda || "")}</h3>`;
    h += `<p class="vt-st">${!mio ? "Non ancora aperta" : aperta ? "<b>APERTA</b>" : "Chiusa"}${mio ? ` · ${mio.ricevuti} ${mio.ricevuti === 1 ? "voto" : "voti"} su ${pres > 0 ? pres : mio.totale}` : ""}</p>`;
    if (mio && mio.conteggi) {
      const max = Math.max(...mio.conteggi);
      h += '<ul class="vt-ris">' + mio.opzioni.map((o, n) => `<li${!aperta && mio.modalita === "nominativa" && mio.conteggi[n] === max && max > 0 ? ' class="vinc"' : ""}><span>${esc(o)}</span><b>${mio.conteggi[n]}</b></li>`).join("") + "</ul>";
    }
    h += `<div class="vt-az"><button id="vt-avvia" ${aperta || busy ? "disabled" : ""}>${mio ? "Riavvia" : "Avvia"}</button><button id="vt-ferma" class="sec" ${!aperta || busy ? "disabled" : ""}>Ferma</button><button id="vt-reset" class="sec" ${!mio || busy ? "disabled" : ""}>Azzera</button></div>`;
    if (errore) h += `<p class="vt-er" role="alert">${esc(errore)}</p>`;
    const f = h;
    if (f === firma) return;
    firma = f;
    box.innerHTML = h;
    box.querySelector("#vt-ferma").onclick = () => azione("close", {});
    box.querySelector("#vt-avvia").onclick = () => azione("open", { slide: slide.id, domanda: slide.domanda, modalita: slide.modalita, opzioni: slide.modalita === "nominativa" ? slide.opzioni : ["Favorevole", "Contrario", "Astenuto"], live: slide.modalita !== "nominativa" && slide.mostra_live !== false });
    box.querySelector("#vt-reset").onclick = () => confirm("Azzerare la votazione? I voti già espressi verranno cancellati.") && azione("reset", { slide: slide.id });
  }
  async function azione(path, data) {
    busy = true;
    try { await chiama(path, data); await leggi(); disegna(); } catch (e) { busy = false; firma = ""; return disegna(e.message); }
    busy = false;
    firma = "";
    disegna();
  }
  async function leggi() {
    if (rep) rep.hidden = !abilitate();
    slide = corrente();
    if (window.REGIA_DATI && window.REGIA_DATI.slide) window.REGIA_DATI.slide(tipo);
    if (!slide) return disegna();
    try { poll = (await chiama("results?slide=" + encodeURIComponent(slide.id))).poll; disegna(); } catch (e) { disegna(e.message); }
  }
  leggi();
  setInterval(leggi, 2000);
})();
