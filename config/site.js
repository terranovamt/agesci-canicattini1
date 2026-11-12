/* ============ CONFIGURAZIONE LIVE ============
   Se "url" è vuoto la presentazione funziona come prima (solo locale). */
window.LIVE = {
  nas: true,
  basePath: location.pathname.startsWith("/agesci-canicattini1/") ? "/agesci-canicattini1" : "",
  url:
    location.origin +
    (location.pathname.startsWith("/agesci-canicattini1/") ? "/agesci-canicattini1" : "") +
    "/api/state/",
  // 'corrente' = il pubblico non supera MAI la slide che mostri ora (anche se torni indietro)
  // 'massimo'  = il pubblico non supera la slide più avanzata che hai raggiunto
  limite: "corrente",
  ruolo: "locale",
};
/* La vista principale incorporata nella dashboard pubblica; anteprima e schermo restano locali. */
(function () {
  const L = window.LIVE;
  if (!L.url) return;
  const q = new URLSearchParams(location.search);
  L.vista = ["principale", "anteprima", "schermo"].includes(q.get("vista")) ? q.get("vista") : null;
  L.ruolo = L.vista === "principale" ? "regia" : L.vista ? "locale" : "pubblico";
})();
