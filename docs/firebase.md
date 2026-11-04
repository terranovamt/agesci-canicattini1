# Firebase

[README](../README.md) · [Assemblea](assemblea.md) · [Contenuti](contenuti.md) · [Firebase](firebase.md) · [Sviluppo](sviluppo.md)

Nodi del database, configurazione da zero e limiti del piano gratuito.

Realtime Database: `assemblea-canicattini1` (europe-west1), URL in `config.js`.

| Nodo | Scrive | Legge | Contenuto |
| --- | --- | --- | --- |
| `live/stato` | regia | tutti | `pos`, `max` = slide × 1000 + passo |
| `live/k`, `modifiche/k` | regia / setup | nessuno | chiave inviata a ogni scrittura |
| `modifiche/patch` | setup | tutti | differenze rispetto a `dati.js` (JSON in una stringa) |
| `modifiche/t` | setup | tutti | ora dell'ultima pubblicazione |
| `assemblea/stato` | setup / regia | tutti | `attiva`: home o presentazione |
| `presenza/{id}` | ogni dispositivo | tutti | `t` ora, `r` ruolo (p/s/r): conteggio dispositivi in regia |

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
5. Su GitHub apri `Assemblea-di-Gruppo/config.js` (matita ✏️) e metti
   l'URL del punto 3 in `url:`, poi Commit. Dopo ~1 minuto è online.
6. Prova: apri `…/Assemblea-di-Gruppo/regia.html` sul PC, inserisci la chiave,
   e `…/Assemblea-di-Gruppo/` sul telefono: avanzando in regia il telefono segue
   e il pannello Firebase conta 1 pubblico. Poi apri il setup, cambia un orario
   e premi **Pubblica**.

Non servono chiavi API, SDK o `npm`: la presentazione parla con Firebase via
REST (`fetch` + `EventSource`). Per cambiare chiave basta modificarla nelle
regole (punto 4). Per disattivare il live: `url: ''` in `config.js`.

Se il setup risponde "Chiave non valida o regole Firebase non aggiornate":
chiave diversa da quella nelle regole, oppure regole vecchie senza il nodo
`modifiche` (ripeti il punto 4).

## Limiti del piano gratuito (Spark)

| Risorsa | Limite Spark | Uso della presentazione |
| --- | --- | --- |
| Connessioni simultanee | **100** | 1 per spettatore (stato live), 1 regia, 1 setup → **~97 spettatori** |
| Dati archiviati | 1 GB | pochi KB |
| Download | 10 GB / mese | ~1 MB/ora per spettatore → 100 persone × 3 ore ≈ 300 MB |
| Database | 1 per progetto | 1 |

Oltre 100 connessioni Firebase rifiuta le nuove: alcuni telefoni potrebbero
non seguire la regia (possono comunque tornare indietro e ricaricare). Per
assemblee più numerose passare al piano **Blaze** (a consumo, 200.000
connessioni; per un'assemblea il costo resta praticamente nullo) o proiettare
senza far collegare tutti. Il pubblico non apre una seconda connessione per le
modifiche: controlla `modifiche/t` ogni 10 s. Limiti aggiornati:
https://firebase.google.com/pricing.
