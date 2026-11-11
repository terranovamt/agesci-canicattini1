# Assemblea: avvio, regia e pubblico

[README](../README.md) · [Assemblea](assemblea.md) · [Contenuti](contenuti.md) · [Firebase](firebase.md) · [Sviluppo](sviluppo.md)

Come si apre e chiude l'assemblea e come si usano dashboard regia, schermo e telefoni.

## Aprire e chiudere l'assemblea

1. Entra nell'area riservata con la chiave e apri **Setup dati.js**.
   La chiave viene verificata una volta per sessione della scheda; il setup
   controlla la sessione localmente senza richieste Firebase.
   Prepara i contenuti e premi **Salva su GitHub (dati.js)** con un token GitHub.
   Attendi la pubblicazione su GitHub Pages.
2. Apri la regia dall'area riservata con la chiave e premi il grande
   **Avvia live** in alto, sopra le anteprime.
   Con una sola scrittura Firebase mantiene le modifiche live esistenti,
   azzera la posizione e attiva l'assemblea;
   se la scrittura fallisce non avvia nulla e mostra l'errore.
   la regia riparte dalla slide QR senza ricaricare la presentazione.
   Il pulsante indica subito l'avvio in corso; alla conferma Firebase la
   dashboard passa in onda senza attendere il controllo periodico.
   La home manda tutti alla presentazione entro circa 10 secondi, senza
   aumentare la frequenza delle richieste Firebase.
3. Durante il live la dashboard mostra **Termina assemblea**, anche prima dell'ultima slide.
   Dopo la conferma salva lo stato inattivo: home e link alla presentazione
   tornano alla pagina del gruppo entro 10 secondi. Il bottone della home
   torna all'area riservata. I contenuti preparati non vengono cancellati.

Lo stato è in `assemblea/stato/attiva`, separato dalla posizione `live/stato`:
gli aggiornamenti della regia non possono riattivare un'assemblea terminata.
Il setup resta sempre raggiungibile da `/setup`, senza accessi Firebase.
Con rete assente in regia viene
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
- pannello **Firebase**: dispositivi collegati (pubblico, regia ed eventuali setup
  legacy ancora aperti), tempo
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
- **Avvia live** quando l'assemblea è inattiva, **Termina assemblea** durante
  il live e **PDF** sull'ultima slide.

Il pannello **Presenti e ufficio di presidenza** permette di inserire il
numero dei presenti nella slide quorum e i nomi del presidente e degli
scrutatori nelle slide di composizione, senza aprire il setup.
**Pubblica live** salva i campi modificati nella patch Firebase:
regia e proiettore si aggiornano subito, i telefoni entro circa
10 secondi. Il numero deve essere un intero non negativo; lasciare il campo
vuoto indica che non è ancora noto. Il segretario e gli altri contenuti
restano invariati. I nomi sono testo semplice, non HTML.

**Ricarica valori** recupera i dati pubblicati e chiede conferma prima di
scartare modifiche non salvate. Se un campo modificato è stato cambiato anche
in un'altra regia, la pubblicazione viene fermata e occorre ricaricare. Evitare
pubblicazioni simultanee da più regie: lettura e scrittura della patch
sono richieste distinte. Il setup non legge né cambia questa patch.
In caso di errore i campi restano
compilati e il pannello non dichiara l'avvenuta pubblicazione.
I dati inseriti diventano pubblici nelle slide, non sono informazioni riservate.

**▣ Apri schermo presentazione** apre una finestra con *solo* le slide: spostala
sul proiettore (Chrome/Edge la aprono già sul secondo schermo se gli dai il
permesso), cliccaci per lo schermo intero, oppure condividila su Meet/Zoom/Teams.
Segue la dashboard all'istante e accetta anche i tasti del clicker. Funziona nello
stesso browser della dashboard; aperta da sola parte dalla posizione live.
Se ricarichi la dashboard riparte dalla slide in onda, non dalla prima.
Il setup si apre da `…/agesci-canicattini1/setup`.

**Pubblico** (telefono): segue la regia e può tornare indietro, ma non andare
oltre il limite di `config/site.js` (`limite: 'corrente'` = la slide mostrata ora,
`'massimo'` = la più avanzata raggiunta). Barra in basso: indietro, ODG, contatore
o **Slide attuale** (quando si è rimasti indietro), Ruota, avanti; swipe per
cambiare slide. Su touch la slide occupa tutto lo schermo e i controlli si
nascondono dopo 3 secondi: il primo tocco li fa solo ricomparire. Con **Ruota**
slide, icone e swipe passano in orizzontale; la barra resta in basso.
In verticale il QR mantiene un fondo bianco quadrato, adattato allo spazio
disponibile. Nella composizione dell'organo le note, come «Proposto dai Capi
Gruppo», compaiono insieme alla rispettiva card e si nascondono tornando indietro.

**iPhone senza barra dell'indirizzo**: Safari non permette a una pagina di
nasconderla. Aprire il sito in Safari → Condividi → **Aggiungi alla schermata
Home** e avviarlo dall'icona (a schermo intero).

## Votazioni segrete (opzionali)

- Si attivano dal setup, scheda **Generale** → «Votazioni abilitate». Se sono spente, le slide restano come prima.
- Le slide «Votazione…» sono di tipo `slide_votazione`: stesso aspetto del divisore di sezione. In setup si definiscono quesito, tipo (scelta singola o nominativa), opzioni/candidati e se mostrare i conteggi in diretta.
- Scheda **Censiti** → «Scarica PDF codici di voto» (e «Rigenera codici», con conferma, per invalidare i vecchi codici e ristampare): genera (una sola volta) un codice di 6 cifre per ogni socio e scarica un PDF A4 orizzontale con griglia 4×4 di cartoncini ad angoli vivi (16 per pagina, da ritagliare) con nome, codice socio e codice di voto.
- Il socio tocca «Vota» sul proprio telefono, inserisce il codice, vede il quesito e vota. Un codice vota una sola volta.
- Dalla regia, sulla slide di votazione, si usano **Apri/Chiudi votazione** e **Azzera**. Scelta singola: conteggi in diretta (se abilitato); a chiusura la slide mostra il timbro APPROVATO / NON APPROVATO / PARITÀ (favorevoli contro contrari). Nominativa: solo i voti ricevuti; i risultati compaiono alla chiusura, visibili anche sulla slide.
- Segretezza: il server salva separatamente chi ha votato e i totali per opzione, senza alcun legame tra i due. Il codice a 6 cifre ha pochi tentativi possibili (limite per IP).
