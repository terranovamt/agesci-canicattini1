# agesci-canicattini1

La presentazione dell'Assemblea di Gruppo si trova in
`docs/Assemblea-di-Gruppo/`.

Per pubblicarla, in **Settings > Pages** scegliere **Deploy from a branch**,
branch `main` e cartella `/docs`, quindi salvare.

Dopo il deploy, la presentazione sara disponibile all'indirizzo
https://terranovamt.github.io/agesci-canicattini1/Assemblea-di-Gruppo/.
L'indirizzo principale del sito reindirizza direttamente a
`Assemblea-di-Gruppo/index.html`, conservando parametri URL e posizione della slide.

## Regia e spettatori

Aprire `Assemblea-di-Gruppo/?regia=LA-TUA-CHIAVE` per la regia, usando la chiave
prevista dalle regole del Realtime Database Firebase. Il parametro deve restare
nell'URL anche quando si ricarica la pagina: la chiave non viene salvata nel browser.

Condividere con gli spettatori l'indirizzo senza `?regia=...`: seguono la regia
e possono tornare indietro, ma non superare la posizione consentita da `config.js`.
Sui dispositivi mobili touch appare anche il pulsante per ruotare la presentazione.
Il ruolo nell'interfaccia non sostituisce le regole Firebase, che devono impedire
scritture senza una chiave valida.

## Layout verticale

Sui telefoni in verticale le slide titolo, divisore, chiusura, foto e grazie
vengono adattate dal CSS; articoli, modifiche ai documenti, prima/dopo, ordine
del giorno, avanzamento, composizione dell'organo e quorum hanno un layout
dedicato. Le altre slide mantengono il layout orizzontale ridimensionato.
Ruotando il telefono o usando il pulsante di rotazione si torna al layout
orizzontale, mantenendo la posizione e i limiti dello spettatore.
L'esportazione PDF resta orizzontale.

## Dove modificare cosa

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
live sono grigi e disabilitati.
Solo l'ODG iniziale contiene collegamenti: le slide di avanzamento ODG
mostrano lo stato dei punti senza renderli cliccabili.
La slide QR verticale usa lo spazio disponibile per ingrandire l'immagine,
con titolo e countdown compatti; il layout orizzontale resta invariato.

File comuni:

- `index.html`: pagina e ordine di caricamento di stili e script.
- `config.js`: Firebase e limite degli spettatori; `dati.js` e
  `progetto_educativo.js`: contenuti.
- `common/base.css`: colori, barra del titolo, navigazione; `common/print.css`: PDF.
- `common/base.js`: funzioni di supporto; `common/differenze-testo.js`:
  confronto parola per parola dei testi.
- `common/motore.js`: navigazione, caricamento di `dati.js`, alias dei tipi.
- `common/pdf.js`: esportazione PDF; `common/live.js`: regia e spettatori
  (Firebase); `common/avvio.js`: avvio, caricato per ultimo.
- `portrait/base.js` e `portrait/base.css`: rilevamento del verticale, palco,
  funzioni comuni e ripiego orizzontale per i tipi senza layout verticale.

Per aggiungere un tipo nuovo: creare `landscape/<tipo>.js` che registra
`LANDSCAPE.slide_<tipo>`, ed eventualmente `portrait/<tipo>.js` che registra
`PORTRAIT.slide_<tipo>`, poi aggiungere i file in `index.html`.
