# agesci-canicattini1

Presentazione dell'**Assemblea di Gruppo AGESCI Canicattini 1**, con regia live,
spettatori sincronizzati sul telefono e modifiche ai dati in tempo reale.

> 📘 Guida illustrata (stesso stile della presentazione):
> https://terranovamt.github.io/agesci-canicattini1/Assemblea-di-Gruppo/guida.html

## Indirizzi

| Chi | Indirizzo |
| --- | --- |
| Home / pubblico | https://terranovamt.github.io/agesci-canicattini1/ (presentazione solo durante l'assemblea) |
| Area riservata | `.../area-riservata.html` (accesso con chiave) |
| Regia | `.../Assemblea-di-Gruppo/?regia=LA-TUA-CHIAVE` |
| Setup (modifiche live) | https://terranovamt.github.io/agesci-canicattini1/setup (chiede la chiave) |
| Guida | `.../Assemblea-di-Gruppo/guida.html` |

La home propone **Area riservata**, non il setup: dopo la verifica della chiave
su Firebase compare **Assemblea di Gruppo**, che apre il pannello.
Anche aprendo direttamente `/setup` la chiave viene verificata prima di mostrare
campi e pulsanti. Una chiave sbagliata non apre il pannello.
La sessione dura nella scheda del browser (`sessionStorage`); **Esci**
cancella la chiave e il token GitHub eventualmente memorizzato. Nel setup la
chiave viene rimossa dall'URL dopo la verifica.
La regia usa ancora `?regia=`: non condividere mai questi link.

Il login usa la stessa chiave condivisa della regia, non account personali:
Firebase verifica il permesso scrivendo soltanto `modifiche/k`, senza toccare
contenuti, orario di pubblicazione o stato dell'assemblea. Le regole Firebase
proteggono le scritture anche se qualcuno aggira l'interfaccia. Il repository
e i contenuti destinati al pubblico restano pubblici: non inserire dati riservati.

## Pubblicazione (GitHub Pages)

In **Settings > Pages**: **Deploy from a branch**, branch `main`, cartella `/docs`.
Ogni commit su `main` viene pubblicato in circa 1 minuto. L'indirizzo principale
del sito mostra normalmente la home del gruppo. Durante l'assemblea reindirizza
a `Assemblea-di-Gruppo/index.html`, conservando parametri e posizione (`#slide.passo`).

### Aprire e chiudere l'assemblea

1. Dalla home premi **Area riservata**, inserisci la chiave e poi scegli
   **Assemblea di Gruppo** per aprire il setup.
2. Prepara i contenuti, poi premi **Inizia assemblea**. Con una sola scrittura
   Firebase salva le modifiche live, azzera la posizione e attiva l'assemblea;
   se la scrittura fallisce non avvia nulla e mostra l'errore.
   Si apre la regia; da questo momento la home manda tutti alla presentazione.
3. Nell'ultima slide la regia ha **Termina assemblea**, accanto a **PDF**.
   Dopo la conferma salva lo stato inattivo: home e link alla presentazione
   tornano alla pagina del gruppo entro 10 secondi. Il bottone della home
   torna all'area riservata. I contenuti preparati non vengono cancellati.

Lo stato è in `assemblea/stato/attiva`, separato dalla posizione `live/stato`:
gli aggiornamenti della regia non possono riattivare un'assemblea terminata.
Il setup resta sempre raggiungibile da `/setup`. Con rete assente viene
mostrato un errore e il controllo riprova automaticamente.
**Aggiorna le regole Firebase** dal file del repository: il nuovo nodo
`assemblea` richiede la stessa chiave degli altri due nodi.

## Durante l'assemblea

**Regia** (PC collegato al proiettore): clic o frecce per avanzare (clic nel 20%
sinistro = indietro). Tasti: `→ ↓ spazio Invio PagGiù` avanti, `← ↑ PagSu
Backspace` indietro, `H` slide 1, `M` ordine del giorno, `R` torna alla slide di
partenza, `F` schermo intero, `P` PDF (sull'ultima slide). Il pallino in alto a
destra è verde se Firebase riceve la posizione, rosso se c'è un problema. Il
setup si apre da `…/agesci-canicattini1/setup`.

**Pubblico** (telefono): segue la regia e può tornare indietro, ma non andare
oltre il limite di `config.js` (`limite: 'corrente'` = la slide mostrata ora,
`'massimo'` = la più avanzata raggiunta). Barra in basso: indietro, ODG, contatore
o **Slide attuale** (quando si è rimasti indietro), Ruota, avanti; swipe per
cambiare slide. Su touch la slide occupa tutto lo schermo e i controlli si
nascondono dopo 3 secondi: il primo tocco li fa solo ricomparire. Con **Ruota**
slide, icone e swipe passano in orizzontale; la barra resta in basso.

**iPhone senza barra dell'indirizzo**: Safari non permette a una pagina di
nasconderla. Aprire il sito in Safari → Condividi → **Aggiungi alla schermata
Home** e avviarlo dall'icona (a schermo intero).

## Modificare i contenuti

| Modo | Quando | Tempo | Durata |
| --- | --- | --- | --- |
| **Setup** (`setup.html?regia=…`) | durante l'assemblea: nomi, orari, slide nascoste, testi, numeri | ~1 s regia, ≤10 s pubblico | finché non premi "Togli tutte le modifiche live" |
| **`dati.js` su GitHub** (matita ✏️ → Commit) | prima dell'assemblea, modifiche definitive | ~1 min (Pages) + ≤30 s | per sempre |

La pagina di setup è divisa in schede:

| Scheda | Cosa contiene |
| --- | --- |
| **Generale** | anno, data, luogo, orari delle convocazioni |
| **Slide** | ordine delle slide (trascina o ↑ ↓), 👁 nascondi/mostra, ✎ apre i contenuti |
| **Contenuti** | testi e nomi di ogni slide (anche Progetto Educativo) |
| **Bilancio** | censimenti, soglie, entrate, uscite, storico avanzi, patrimonio |
| **JSON** | tutti i dati in JSON, per aggiungere slide o modifiche avanzate |
| **Guida** / **Limiti** | questa guida e i limiti del piano Firebase gratuito |

I campi diversi da `dati.js` sono evidenziati in giallo e ↺ li riporta
all'originale; ✕ e **+ Aggiungi** tolgono o aggiungono elementi alle liste.
Premi **Pubblica**: su Firebase va solo la differenza rispetto a `dati.js`, così
le modifiche fatte poi su GitHub agli altri campi continuano ad arrivare.
Le modifiche live **non cambiano `dati.js`**: restano su Firebase, sopra il file.
Per renderle definitive: **⋯ → Salva su GitHub (dati.js)**. Il setup riscrive
`dati.js` cambiando solo le righe modificate (commenti e formattazione restano)
e fa il commit; dopo ~1 minuto GitHub Pages lo pubblica e il setup toglie da
solo le modifiche live, ormai inutili. La prima volta chiede un **token GitHub**
(salvato solo su quel dispositivo; **⋯ → Dimentica token GitHub** lo cancella):

1. <https://github.com/settings/personal-access-tokens/new> (Fine-grained token).
2. *Repository access* → *Only select repositories* → `agesci-canicattini1`.
3. *Permissions* → **Contents: Read and write** → *Generate token*, copialo nel setup.

In alternativa **⋯ → Scarica dati.js aggiornato** e caricalo a mano su GitHub,
poi **⋯ → Togli tutte le modifiche live**. Repository, ramo e cartella sono in
`config.js` (`github`).

Con un errore di sintassi in `dati.js` gli schermi già aperti restano alla
versione precedente; chi apre la pagina vede "Non trovo dati.js".

## Firebase

Realtime Database: `assemblea-canicattini1` (europe-west1), URL in `config.js`.

| Nodo | Scrive | Legge | Contenuto |
| --- | --- | --- | --- |
| `live/stato` | regia | tutti | `pos`, `max` = slide × 1000 + passo |
| `live/k`, `modifiche/k` | regia / setup | nessuno | chiave inviata a ogni scrittura |
| `modifiche/patch` | setup | tutti | differenze rispetto a `dati.js` (JSON in una stringa) |
| `modifiche/t` | setup | tutti | ora dell'ultima pubblicazione |
| `assemblea/stato` | setup / regia | tutti | `attiva`: home o presentazione |

### Configurare Firebase da zero

Serve solo un account Google; il piano gratuito (Spark) basta, nessuna carta.

1. Vai su <https://console.firebase.google.com> → **Crea un progetto** (o
   *Aggiungi progetto*), dagli un nome (es. `assemblea-canicattini1`).
   Google Analytics non serve: puoi disattivarlo.
2. Nel menu a sinistra: **Build → Realtime Database → Crea database**.
   Posizione: **Belgio (europe-west1)**. Modalità: **blocco** (locked).
   *Non* serve Firestore, né Authentication, né Hosting.
3. In alto nella scheda **Dati** copia l'URL del database, es.
   `https://assemblea-canicattini1-default-rtdb.europe-west1.firebasedatabase.app/`.
4. Scheda **Regole**: cancella tutto, incolla il contenuto di
   [`firebase/database.rules.json`](firebase/database.rules.json), sostituisci
   tutte e tre le `LA-TUA-CHIAVE` con la stessa chiave inventata da te (es. `lupo-rosso-42`;
   solo lettere, numeri e trattini) e premi **Pubblica**.
   La chiave va **solo nella console**, mai nel repository.
5. Su GitHub apri `docs/Assemblea-di-Gruppo/config.js` (matita ✏️) e metti
   l'URL del punto 3 in `url:`, poi Commit. Dopo ~1 minuto è online.
6. Prova: apri `…/Assemblea-di-Gruppo/?regia=LA-TUA-CHIAVE` sul PC (pallino
   verde in basso) e `…/Assemblea-di-Gruppo/` sul telefono: avanzando in regia
   il telefono segue. Poi apri `setup.html?regia=LA-TUA-CHIAVE`, cambia un
   orario e premi **Pubblica**.

Non servono chiavi API, SDK o `npm`: la presentazione parla con Firebase via
REST (`fetch` + `EventSource`). Per cambiare chiave basta modificarla nelle
regole (punto 4). Per disattivare il live: `url: ''` in `config.js`.

Se il setup risponde "Chiave non valida o regole Firebase non aggiornate":
chiave diversa da quella nelle regole, oppure regole vecchie senza il nodo
`modifiche` (ripeti il punto 4).

### Limiti del piano gratuito (Spark)

| Risorsa | Limite Spark | Uso della presentazione |
| --- | --- | --- |
| Connessioni simultanee | **100** | 1 per spettatore (stato live), 1 regia, 1 setup → **~97 spettatori** |
| Dati archiviati | 1 GB | pochi KB |
| Download | 10 GB / mese | ~0,5 MB/ora per spettatore → 100 persone × 3 ore ≈ 150 MB |
| Database | 1 per progetto | 1 |

Oltre 100 connessioni Firebase rifiuta le nuove: alcuni telefoni potrebbero
non seguire la regia (possono comunque tornare indietro e ricaricare). Per
assemblee più numerose passare al piano **Blaze** (a consumo, 200.000
connessioni; per un'assemblea il costo resta praticamente nullo) o proiettare
senza far collegare tutti. Il pubblico non apre una seconda connessione per le
modifiche: controlla `modifiche/t` ogni 10 s. Limiti aggiornati:
https://firebase.google.com/pricing.

## Layout verticale

Sui telefoni in verticale le slide titolo, divisore, chiusura, foto e grazie
vengono adattate dal CSS; articoli, modifiche ai documenti, prima/dopo, ordine
del giorno, avanzamento, composizione dell'organo, quorum, rendiconto e
patrimonio hanno un layout dedicato. Le altre slide mantengono il layout
orizzontale ridimensionato. L'esportazione PDF resta orizzontale.

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
- `setup.html`, `common/setup.js`, `common/setup.css`: pagina di setup;
  `common/salva-dati.js`: riscrive `dati.js` mantenendo i commenti.
- `guida.html`: guida illustrata; `manifest.webmanifest`: avvio a schermo intero
  dalla schermata Home.
- `firebase/database.rules.json` (radice del repository): regole Firebase.
- `tests/`: `node --test tests/*.test.cjs`.
- `portrait/base.js` e `portrait/base.css`: rilevamento del verticale, palco,
  funzioni comuni e ripiego orizzontale per i tipi senza layout verticale.

Per aggiungere un tipo nuovo: creare `landscape/<tipo>.js` che registra
`LANDSCAPE.slide_<tipo>`, ed eventualmente `portrait/<tipo>.js` che registra
`PORTRAIT.slide_<tipo>`, poi aggiungere i file in `index.html`.
