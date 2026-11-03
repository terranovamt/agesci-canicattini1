/* Avvio: caricato per ultimo, quando tutti i tipi di slide sono pronti */

load(true); setInterval(load, window.LIVE && LIVE.ruolo === 'pubblico' ? 30000 : 1000);
