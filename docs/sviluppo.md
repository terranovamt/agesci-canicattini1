# Sviluppo: struttura del codice

[README](../README.md) · [Assemblea](assemblea.md) · [Contenuti](contenuti.md) · [Firebase](firebase.md) · [Sviluppo](sviluppo.md) · [Struttura repository](struttura-repository.md)

Dove si trovano layout, stili e script della presentazione.

## Layout verticale

Sui telefoni in verticale le slide titolo, divisore, chiusura, foto e grazie
vengono adattate dal CSS; articoli, modifiche ai documenti, prima/dopo, ordine
del giorno, avanzamento, composizione dell'organo, quorum, rendiconto e
patrimonio hanno un layout dedicato. Le altre slide mantengono il layout
orizzontale ridimensionato. L'esportazione PDF resta orizzontale.

## Dove modificare cosa

I percorsi sono relativi alla cartella `Assemblea-di-Gruppo/`.
Ogni tipo di slide (campo `tipo` in `dati.js`, senza `slide_`) ha i suoi file:

- `landscape/<tipo>.js` e `landscape/<tipo>.css`: versione orizzontale.
- `portrait/<tipo>.js` e `portrait/<tipo>.css`: versione verticale (se esiste).

Il file `.css` c'è solo se il tipo ha stili propri. Alcuni tipi condividono un
layout: `divisore_sezione` e `chiusura` usano `titolo.css`, `grazie` usa
`photo()` di `landscape/foto_gruppo.js`, `prima_dopo` usa `modifiche_documento`.
Gli stili verticali di rendiconto e patrimonio sono in `portrait/finanze.css`; quelli di cambio date, differenze e area obiettivi in `portrait/aree.css`.
Articoli e ordine del giorno condividono `portrait/testo_articoli.css`: le card
dell'ODG adattano l'altezza al testo, anche per i punti su piu' righe.
Le animazioni comuni del rendiconto sono in `common/base.js`: gli spicchi delle
entrate si riducono in sequenza; nell'ultimo passo dello scontrino compare il
totale, dopo un secondo il timbro e infine la card percentuale, dopo 1,5 secondi.
In verticale il logo della slide Grazie e' sulla stessa riga del testo, a destra.
Home porta alla slide 1 (titolo), saltando la slide 0 con il QR. La barra del
pubblico include ODG: i collegamenti ai punti non ancora consentiti dal limite
live sono disabilitati, mantenendo i colori delle card.
Gli aggiornamenti live che confermano la stessa slide e lo stesso passo non
riavviano le animazioni.
Solo l'ODG iniziale contiene collegamenti: le slide di avanzamento ODG
mostrano lo stato dei punti senza renderli cliccabili.
La slide QR verticale usa lo spazio disponibile per ingrandire l'immagine,
con titolo e countdown compatti; il layout orizzontale resta invariato.

File comuni:

- `index.html`: pagina e ordine di caricamento di stili e script.
- `config.js`: Firebase, limite degli spettatori, repository per "Salva su GitHub";
  `dati.js`: tutti i contenuti (anche le slide del Progetto Educativo).
- `common/base.css`: colori, barra del titolo, navigazione; `common/print.css`: PDF.
- `common/base.js`: funzioni di supporto; `common/differenze-testo.js`:
  confronto parola per parola dei testi.
- `common/motore.js`: navigazione, caricamento di `dati.js`, alias dei tipi.
- `common/pdf.js`: esportazione PDF; `common/live.js`: regia e spettatori
  (Firebase); `common/modifiche.js`: modifiche live sopra `dati.js`;
  `common/avvio.js`: avvio, caricato per ultimo.
- `regia.html`, `common/regia.js`, `common/regia.css`: dashboard regia;
  `common/vista.js`: modalità in onda / anteprima / schermo usate dalla dashboard;
  `common/presenza.js`: conteggio dei dispositivi collegati.
- `setup.html`, `common/setup.js`, `common/setup.css`: pagina di setup;
  nessuna richiesta Firebase o polling; il login avviene nell'area riservata
  e `ACCESSO.verificata()` controlla localmente la sessione della scheda.
  Questo controllo UI non protegge i dati pubblici: i commit richiedono un
  token GitHub autorizzato. Usa solo gli helper puri di
  `common/modifiche.js` per unire le modifiche locali al file GitHub;
  `common/salva-dati.js` riscrive `dati.js` mantenendo i commenti.
- `guida.html`: guida illustrata; `manifest.webmanifest`: avvio a schermo intero
  dalla schermata Home.
- `portrait/base.js` e `portrait/base.css`: rilevamento del verticale, palco,
  funzioni comuni e ripiego orizzontale per i tipi senza layout verticale.

Per aggiungere un tipo nuovo: creare `landscape/<tipo>.js` che registra
`LANDSCAPE.slide_<tipo>`, ed eventualmente `portrait/<tipo>.js` che registra
`PORTRAIT.slide_<tipo>`, poi aggiungere i file in `index.html`.
