/* ============ CONFIGURAZIONE LIVE ============
   Se "url" è vuoto la presentazione funziona come prima (solo locale). */
window.LIVE = {
  nas: true,
  url: location.origin + "/api/state/",
  // 'corrente' = il pubblico non supera MAI la slide che mostri ora (anche se torni indietro)
  // 'massimo'  = il pubblico non supera la slide più avanzata che hai raggiunto
  limite: "corrente",
  ruolo: "locale",
  // dove la pagina di setup salva dati.js con "Salva su GitHub"
  github: { repo: "terranovamt/agesci-canicattini1", ramo: "NAS", cartella: "area-riservata/assemblea" },
};
/* Solo chi apre index.html?regia=LA-TUA-CHIAVE è il presentatore.
   Senza il parametro, anche nello stesso browser, il ruolo è sempre "pubblico". */
(function () {
  const L = window.LIVE;
  if (!L.url) return;
  const q = new URLSearchParams(location.search),
    c = q.get("regia");
  L.chiave = c || null;
  L.ruolo = c ? "regia" : "pubblico";
  /* dashboard regia (regia.html): principale = regia nascosta che pubblica,
     anteprima = slide successiva, schermo = finestra solo slide per proiettore/condivisione */
  L.vista = ["principale", "anteprima", "schermo"].includes(q.get("vista")) ? q.get("vista") : null;
  if (L.vista && L.vista !== "principale") {
    L.ruolo = "locale";
    L.chiave = null;
  }
  /* il vecchio link index.html?regia=… apre la dashboard */
  if (c && !L.vista && document.getElementById("stage")) {
    sessionStorage.setItem("canicattini-area-chiave", c);
    location.replace("regia.html");
    L.ruolo = "locale";
    L.chiave = null;
  }
})();
