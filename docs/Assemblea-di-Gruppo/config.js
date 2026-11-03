/* ============ CONFIGURAZIONE LIVE ============
   Se "url" è vuoto la presentazione funziona come prima (solo locale). */
window.LIVE = {
  // URL del Realtime Database Firebase, es. https://assemblea-xxxx-default-rtdb.europe-west1.firebasedatabase.app
  url: 'https://assemblea-canicattini1-default-rtdb.europe-west1.firebasedatabase.app/',
  // 'corrente' = il pubblico non supera MAI la slide che mostri ora (anche se torni indietro)
  // 'massimo'  = il pubblico non supera la slide più avanzata che hai raggiunto
  limite: 'corrente',
  ruolo: 'locale'
};
/* Solo chi apre index.html?regia=LA-TUA-CHIAVE è il presentatore.
   Senza il parametro, anche nello stesso browser, il ruolo è sempre "pubblico". */
(function () {
  const L = window.LIVE; if (!L.url) return;
  const c = new URLSearchParams(location.search).get('regia');
  L.chiave = c || null; L.ruolo = c ? 'regia' : 'pubblico';
})();
