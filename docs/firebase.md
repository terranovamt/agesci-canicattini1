# Firebase

[README](../README.md) · [Assemblea](assemblea.md) · [Contenuti](contenuti.md) · [Firebase](firebase.md) · [Sviluppo](sviluppo.md)

Nodi del database, configurazione da zero e limiti del piano gratuito.

Realtime Database: `assemblea-canicattini1` (europe-west1), URL in `config/site.js`.

| Nodo | Scrive | Legge | Contenuto |
| --- | --- | --- | --- |
| `live/stato` | regia | tutti | `pos`, `max` = slide × 1000 + passo |
| `live/k`, `modifiche/k` | regia | nessuno | chiave inviata a ogni scrittura |
| `modifiche/patch` | regia | client della presentazione | differenze rispetto a `dati.js` (JSON in una stringa) |
| `modifiche/t` | regia | client della presentazione | ora dell'ultima pubblicazione |
| `assemblea/stato` | regia | home / presentazione / regia | `attiva`: home o presentazione |
| `presenza/{id}` | pubblico / regia | regia | `t` ora, `r` ruolo (p/r; s legacy): conteggio dispositivi in regia |

Il setup non usa questi nodi: legge il file statico `dati.js` e salva solo
su GitHub tramite token, senza alcuna connessione Firebase.

## Configurare Firebase da zero

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
   [`firebase/database.rules.json`](../firebase/database.rules.json), sostituisci
   tutte e tre le `LA-TUA-CHIAVE` con la stessa chiave inventata da te (es. `lupo-rosso-42`;
   solo lettere, numeri e trattini) e premi **Pubblica**.
   La chiave va **solo nella console**, mai nel repository.
5. Su GitHub apri `config/site.js` (matita ✏️) e metti
   l'URL del punto 3 in `url:`, poi Commit. Dopo ~1 minuto è online.
6. Prova: apri `…/assemblea/regia.html` sul PC, inserisci la chiave e
   premi **Avvia live**. Apri
   `…/assemblea/` sul telefono: avanzando in regia il telefono segue
   e il pannello Firebase conta 1 pubblico. Poi cambia i presenti nella regia
   e premi **Pubblica live**.

Non servono chiavi API, SDK o `npm`: la presentazione parla con Firebase via
REST (`fetch` + `EventSource`). Per cambiare chiave basta modificarla nelle
regole (punto 4). Per disattivare il live: `url: ''` in `config/site.js`.

Se la regia risponde "Chiave non valida o regole Firebase non aggiornate":
chiave diversa da quella nelle regole, oppure regole vecchie senza il nodo
`modifiche` (ripeti il punto 4).

## Limiti del piano gratuito (Spark)

| Risorsa | Limite Spark | Uso della presentazione |
| --- | --- | --- |
| Connessioni simultanee | **100** | 1 SSE per spettatore, 1 SSE per regia; setup: **0**. Lasciare margine per richieste REST e altri client |
| Dati archiviati | 1 GB | pochi KB |
| Download | **360 MB/giorno: budget operativo indicato per il progetto**, quota vigente da verificare in console | consumo reale da misurare; nessuna stima automatica |
| Database | 1 per progetto | 1 |

Oltre 100 connessioni Firebase rifiuta le nuove: alcuni telefoni potrebbero
ricevere gli aggiornamenti solo tramite il controllo REST ogni 8 secondi,
se le richieste REST sono ancora consentite. Questo fallback non supera
le quote di download o un blocco del servizio. Per
assemblee più numerose passare al piano **Blaze** (a consumo, 200.000
connessioni; per un'assemblea il costo resta praticamente nullo) o proiettare
senza far collegare tutti. Il pubblico non apre una seconda connessione per le
modifiche: controlla `modifiche/t` ogni 10 s. Limiti aggiornati:
https://firebase.google.com/pricing.

Le quote sopra si riferiscono a **Realtime Database**, non a Firestore,
Hosting o altri prodotti Firebase. Verificare nella pagina prezzi e nella
console del progetto le quote vigenti. Il budget di 360 MB/giorno e' quello
indicato dal responsabile del progetto, non una quota verificata online.

Per pianificare con questo budget: 100 spettatori per 3 ore equivalgono a
300 ore-spettatore; 360 / 300 = **1,2 MB per spettatore per ora**, prima di
sottrarre il traffico di regia e altri accessi. Il setup attuale non consuma
Firebase. Non e' una previsione
di consumo. La precedente ipotesi di 1 MB/ora darebbe 300 MB, cioe' **83,3%**
del budget giornaliero, lasciando 60 MB; non e' stata misurata e non dimostra
che il sito rimanga sotto quota. Dopo l'ottimizzazione occorre misurare di
nuovo il consumo reale in console, includendo l'overhead di rete.

## Riduzione del traffico live

Il pubblico riceve lo stato iniziale e i cambi di slide attraverso una sola
connessione SSE. Finche' il flusso funziona non effettua letture REST della
posizione: sono eliminate le precedenti 450 richieste/ora per telefono.
Se il flusso cade, legge lo stato ogni 8 secondi senza sovrapporre le richieste;
quando SSE riprende, il controllo REST si ferma. Una risposta REST in ritardo
non sovrascrive gli aggiornamenti SSE piu' recenti.

La regia scrive solo quando cambia la posizione o il massimo raggiunto,
senza ripubblicare uno stato identico ogni 10 secondi. Le scritture sono
serializzate e quelle fallite vengono ritentate. Gli errori sono segnalati
dal punto rosso della regia e nella console del browser; sul pubblico il
titolo del contatore indica lo stato della sincronizzazione.

Restano i controlli di stato assemblea e timestamp delle modifiche, le
presenze e le letture della dashboard: l'ottimizzazione non elimina tutto
il traffico e non aumenta il limite di 100 connessioni. File, immagini e
script della presentazione sono serviti da GitHub Pages, non dal database.
