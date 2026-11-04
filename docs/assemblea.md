# Assemblea: avvio, regia e pubblico

[README](../README.md) · [Assemblea](assemblea.md) · [Contenuti](contenuti.md) · [Firebase](firebase.md) · [Sviluppo](sviluppo.md)

Come si apre e chiude l'assemblea e come si usano dashboard regia, schermo e telefoni.

## Aprire e chiudere l'assemblea

1. Dalla home premi **Area riservata**, inserisci la chiave e poi scegli
   **Assemblea di Gruppo** per aprire il setup.
2. Prepara i contenuti, poi premi **Inizia assemblea**. Con una sola scrittura
   Firebase salva le modifiche live, azzera la posizione e attiva l'assemblea;
   se la scrittura fallisce non avvia nulla e mostra l'errore.
   Si apre la dashboard regia; da questo momento la home manda tutti alla presentazione.
3. Nell'ultima slide la dashboard mostra **Termina assemblea**, accanto a **PDF**.
   Dopo la conferma salva lo stato inattivo: home e link alla presentazione
   tornano alla pagina del gruppo entro 10 secondi. Il bottone della home
   torna all'area riservata. I contenuti preparati non vengono cancellati.

Lo stato è in `assemblea/stato/attiva`, separato dalla posizione `live/stato`:
gli aggiornamenti della regia non possono riattivare un'assemblea terminata.
Il setup resta sempre raggiungibile da `/setup`. Con rete assente viene
mostrato un errore e il controllo riprova automaticamente.
**Aggiorna le regole Firebase** dal file del repository: il nodo
`assemblea` richiede la stessa chiave degli altri due nodi; il nodo `presenza`
(conteggio dispositivi della dashboard) non richiede chiave ma accetta solo
`{t, r}` con l'ora del server.

## Durante l'assemblea

**Regia** (`regia.html`, sul PC): una dashboard con

- **In onda**: la slide che vede il pubblico, con numero e passo. Quando
  l'assemblea non è attiva diventa **Anteprima**, senza bordo rosso o spia live;
- **Prossima**: anteprima del passo successivo (o "Fine presentazione");
- due grandi pulsanti **‹ Indietro** / **Avanti ›**, più Inizio e Ordine del giorno;
  tastiera e clicker: `→ ↓ spazio PagGiù` avanti, `← ↑ PagSu` indietro;
- l'elenco delle slide: un clic ci salta sopra;
- stato: assemblea attiva, pubblico allineato alla regia, Firebase raggiungibile;
- pannello **Firebase**: dispositivi collegati (pubblico, setup, regia), tempo
  di risposta e connessioni **stimate della presentazione**, su 100, con
  percentuale. La barra diventa arancione al 70% e rossa al 90%.
  Le presenze non misurano tutte le connessioni al database (ad esempio la
  console Firebase o altri client), quindi non coincidono con il dato ufficiale.
  Il budget operativo di download indicato per il progetto è **360 MB/giorno**,
  da confrontare con la quota vigente del servizio in console. Il consumo
  reale di download e lo spazio totale (su 1 GB) sono disponibili
  **solo nella console Firebase**: le API
  pubbliche del Realtime Database non espongono queste metriche.
  La dashboard non inventa consumi né mostra le dimensioni di pochi nodi
  come se fossero l'intero database. Per integrarle servirebbe un backend
  autorizzato a leggere Google Cloud Monitoring, senza credenziali nel sito,
  oppure un login Google OAuth nel browser con i permessi di lettura sul
  progetto. La chiave condivisa dell'assemblea non autorizza queste API;
- **PDF** e **Termina assemblea** sull'ultima slide.

**▣ Apri schermo presentazione** apre una finestra con *solo* le slide: spostala
sul proiettore (Chrome/Edge la aprono già sul secondo schermo se gli dai il
permesso), cliccaci per lo schermo intero, oppure condividila su Meet/Zoom/Teams.
Segue la dashboard all'istante e accetta anche i tasti del clicker. Funziona nello
stesso browser della dashboard; aperta da sola parte dalla posizione live.
Se ricarichi la dashboard riparte dalla slide in onda, non dalla prima.
Il setup si apre da `…/agesci-canicattini1/setup`.

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
