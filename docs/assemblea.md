# Assemblea: avvio, regia e pubblico

[README](../README.md) · [Assemblea](assemblea.md) · [Sviluppo](sviluppo.md)

Come si apre e chiude l'assemblea e come si usano dashboard regia, schermo e telefoni.

## Aprire e chiudere l'assemblea

1. Accedi all'area riservata con il codice censimento e la password, poi apri
   **Setup Assemblea**. Prepara i contenuti e premi **Salva dati base**:
   il server NAS salva la bozza con la sessione autorizzata.
2. Apri la regia dall'area riservata e premi il grande
   **Avvia live** in alto, sopra le anteprime.
   il server azzera le votazioni della sessione precedente, mantiene le
   modifiche live esistenti, azzera la posizione e attiva l'assemblea;
   se la scrittura fallisce non avvia nulla e mostra l'errore.
   la regia riparte dalla slide QR senza ricaricare la presentazione e passa
   in onda alla conferma del server. Chi apre la home entra entro circa 10 secondi.
3. Durante il live la dashboard mostra **Termina assemblea**, anche prima dell'ultima slide.
   Dopo la conferma chiude tutte le votazioni eventualmente ancora aperte e
   salva lo stato inattivo: home e link alla presentazione tornano alla pagina
   del gruppo entro 10 secondi. I risultati restano disponibili fino al nuovo
   avvio live, che riparte da zero. I contenuti preparati non vengono cancellati.

Lo stato dell'assemblea è separato dalla posizione live: gli aggiornamenti
della regia non possono riattivare un'assemblea terminata. Con rete assente
in regia viene mostrato un errore e il controllo riprova automaticamente.

## Durante l'assemblea

**Regia** (`regia.html`, sul PC): una dashboard con

- **In onda**: la slide che vede il pubblico, con numero e passo. Quando
  l'assemblea non è attiva diventa **Anteprima**, senza bordo rosso o spia live;
- **Prossima**: anteprima del passo successivo (o "Fine presentazione");
- due grandi pulsanti **‹ Indietro** / **Avanti ›**, più Inizio e Ordine del giorno;
  tastiera e clicker: `→ ↓ spazio PagGiù` avanti, `← ↑ PagSu` indietro;
- l'elenco delle slide: un clic ci salta sopra;
- stato: assemblea attiva, pubblico allineato alla regia e server raggiungibile;
- pannello **Server**: flussi SSE, dispositivi della presentazione, visitatori
  del sito, CPU e memoria del backend e del NAS, ritardo dell'event loop e
  volume dati. **Apri monitor** mostra i dettagli e gli avvisi del server;
- **Avvia live** quando l'assemblea è inattiva, **Termina assemblea** durante
  il live e **PDF** sull'ultima slide.

Il pannello **Presenti e ufficio di presidenza** permette di inserire il
numero dei presenti nella slide quorum e i nomi del presidente e degli
scrutatori nelle slide di composizione, senza aprire il setup.
**Pubblica live** salva i campi modificati nella patch live sul NAS:
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
- Scheda **Censiti** → «Scarica PDF codici di voto» genera (una sola volta) un codice di 6 cifre per ogni socio visibile secondo anno, branca e ricerca selezionati; scarica un PDF A4 orizzontale con griglia 5×4 di cartoncini ad angoli vivi (20 per pagina, da ritagliare) con nome, codice socio e codice di voto. I nomi lunghi vanno su due righe, con caratteri adattati allo spazio disponibile per non invadere i cartoncini vicini. La platea di voto comprende i soci inclusi nei PDF generati; più PDF filtrati aggiungono i rispettivi soci. Dopo l'aggiornamento, riscarica i PDF già in uso per registrare la platea: i codici assegnati vengono mantenuti. «Rigenera codici», con conferma, invalida globalmente tutti i codici precedenti e riparte dai censiti visibili nel PDF rigenerato.
- Il socio tocca «Vota» sul proprio telefono; compare subito un'attesa mentre si verifica che la votazione sia ancora aperta. Inserito il codice, l'attesa compare anche durante la verifica e l'invio, impedendo i doppi tocchi; le richieste si possono annullare. Se si annulla l'invio o non si riceve risposta, il server potrebbe aver già registrato il voto: reinserire il codice per verificarne l'esito prima di riprovare. Toccata una scelta, una schermata separata, «Hai selezionato…», chiede di **Conferma il voto** oppure di **Annulla** per tornare alle opzioni senza reinserire il codice. Un codice vota una sola volta.
- Quando la regia apre una votazione, i dispositivi del pubblico e la vista **Schermo** si spostano sulla relativa slide e bloccano la navigazione finché la votazione non viene chiusa; la regia resta libera di gestirla.
- La branca Adulti è indicata come **CO.CA.** nell'elenco censiti, nel filtro branca e nei cartoncini PDF.
- Dalla regia, sulla slide di votazione, si usano **Avvia**, **Ferma** e **Azzera** (nella card «Live Data», che segue la slide mostrata: presenti, nomi di presidente e scrutatori o votazione). Scelta singola: conteggi in diretta (se abilitato); a chiusura la slide mostra il timbro APPROVATO / NON APPROVATO / PARITÀ (favorevoli contro contrari). Nominativa: solo i voti ricevuti; il totale di riferimento sono i presenti attuali oppure, se non indicati, i soci inclusi nei PDF dei codici di voto, non tutti i censiti del Libro soci. Si è eletti con almeno il 50% + 1 dei presenti (badge «Eletto» e timbro ELETTO / NESSUN ELETTO); i risultati compaiono alla chiusura, visibili anche sulla slide. A fine assemblea, in regia, **Report votazioni (PDF)** scarica tutte le votazioni con voti, percentuali ed esito (visibile se il voto online è abilitato).
- Segretezza: il server salva separatamente chi ha votato e i totali per opzione, senza alcun legame tra i due. Il codice a 6 cifre ha pochi tentativi possibili (limite per IP).
