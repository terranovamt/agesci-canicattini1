# agesci-canicattini1

Presentazione dell'**Assemblea di Gruppo AGESCI Canicattini 1**, con regia live,
spettatori sincronizzati sul telefono e modifiche ai dati in tempo reale.

> 📘 Guida illustrata (stesso stile della presentazione):
> https://terranovamt.github.io/agesci-canicattini1/Assemblea-di-Gruppo/guida.html

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [docs/assemblea.md](docs/assemblea.md) | aprire e chiudere l'assemblea, dashboard regia, schermo proiettore, pubblico |
| [docs/contenuti.md](docs/contenuti.md) | setup solo GitHub, `dati.js`, Salva su GitHub |
| [docs/firebase.md](docs/firebase.md) | nodi, configurazione da zero, regole, limiti del piano gratuito |
| [docs/sviluppo.md](docs/sviluppo.md) | struttura del codice e dei tipi di slide |
| [docs/struttura-repository.md](docs/struttura-repository.md) | gerarchia completa del repository e criteri di organizzazione |
| [docs/audit-ui-ux.md](docs/audit-ui-ux.md) | audit UI/UX e priorità di manutenzione |

## Indirizzi

| Chi | Indirizzo |
| --- | --- |
| Home / pubblico | https://terranovamt.github.io/agesci-canicattini1/ (presentazione solo durante l'assemblea) |
| Area riservata | `.../area-riservata.html` (accesso con chiave) |
| Regia (dashboard) | `.../Assemblea-di-Gruppo/regia.html` (chiede la chiave) |
| Setup (solo GitHub) | https://terranovamt.github.io/agesci-canicattini1/setup (nessun accesso Firebase) |
| Guida | `.../Assemblea-di-Gruppo/guida.html` |

La home propone **Area riservata**: dopo la verifica della chiave
su Firebase compare **Regia Assemblea di Gruppo**, con **Avvia live** e
**Termina assemblea**. Dall'area riservata si apre anche il setup: richiede
un accesso già verificato nella sessione della scheda, senza ripetere
richieste Firebase. Il link diretto `/setup` rimanda al login se manca la sessione.
Modifica solo `dati.js` e richiede un token GitHub autorizzato per
fare il commit. Non legge né scrive Firebase, non conta presenze e non legge
le modifiche live pubblicate dalla regia.
La sessione dura nella scheda del browser (`sessionStorage`); **Esci**
cancella la chiave e il token GitHub eventualmente memorizzato. Nel setup i
parametri dell'URL vengono rimossi e **Dimentica token GitHub** cancella il token.
Anche la regia chiede la chiave; il vecchio link `?regia=LA-TUA-CHIAVE`
funziona ancora e apre la dashboard: non condividerlo mai.

Il login usa la stessa chiave condivisa della regia, non account personali:
Firebase verifica il permesso scrivendo soltanto `modifiche/k`, senza toccare
contenuti, orario di pubblicazione o stato dell'assemblea. Le regole Firebase
proteggono le scritture anche se qualcuno aggira l'interfaccia. Il repository
e i contenuti destinati al pubblico restano pubblici: non inserire dati riservati.

## Anteprima locale

Avvia il sito con hot reload senza installare dipendenze:

```sh
node tools/preview.cjs
```

Apri `http://127.0.0.1:4173`. Nell’anteprima l’area riservata si apre senza
chiave, Firebase e gestione documenti sono simulati in memoria e i salvataggi su GitHub sono bloccati;
nessuna modifica viene inviata ai servizi reali. Il server ascolta solo su
`127.0.0.1` e ricarica la pagina quando cambiano i file del progetto.
Le modifiche ai PDF della simulazione sono visibili ricaricando la home e si
perdono al riavvio del server: i file del repository non vengono modificati.

## Documenti pubblici

Nell'area riservata apri **Gestisci documenti PDF**. Inserisci il token GitHub
(lo stesso del setup, con permesso **Contents: Read and write**) e premi
**Ricarica da GitHub**. Puoi caricare un PDF con titolo e descrizione, modificare
i testi o sostituire il PDF, ed eliminare un documento con conferma.
File e indice vengono pubblicati insieme in un unico commit sul ramo
`LIVE.github.ramo` di `config.js` (in produzione `main`).
Non vengono modificate le impostazioni del setup o i dati dell'assemblea.

La home legge `documents/index.json` e mostra solo i PDF elencati, con apertura
e download. I file sono in `documents/pdf/`; per aggiungerli manualmente,
aggiorna anche l'indice con `file`, `title` e `description`. Sono inclusi i due
PDF forniti: PEG 2026-2028 e Rendiconto per cassa - Modello D.
Non caricare informazioni riservate: repository e documenti sono pubblici.
Dopo il salvataggio attendi il deployment di GitHub Pages.

## Calendario personalizzato

La home riunisce cinque feed pubblici senza iframe: **Gruppo Canicattini 1**
azzurro (Outlook), **Branca E/G** verde, **Branca L/C** giallo, **Branca R/S**
rosso e **Zona Aretusea** viola. Le festività italiane sono escluse.
I checkbox filtrano sia il mese sia i prossimi appuntamenti. Selezionando un
giorno vengono mostrati gli eventi di quel giorno, inclusi quelli di più giorni;
**Mostra tutti** riattiva tutti i calendari. Le etichette testuali accompagnano
sempre i colori. Tutti gli orari sono mostrati in Europe/Rome.

La selezione usa etichette compatte: Canicattini 1, E/G, L/C, R/S e Zona.
I calendari non aggiornati sono grigi con un simbolo **!**, ma restano
selezionabili per consultare gli ultimi dati noti. Stato dettagliato, collegamenti
originali, conteggio selezioni e **Mostra tutti** sono nel pannello
**Informazioni** (icona **i** in alto), normalmente chiuso.
La home non mostra un messaggio quando l'assemblea è inattiva: evidenzia
soltanto il prossimo evento con “assemblea” nel titolo del calendario del gruppo,
se futuro e a meno di 30 giorni. L'avviso non dipende dai filtri; viene omesso
se i dati del gruppo non sono aggiornati. L'accesso alla diretta quando attiva
resta invariato; gli errori di connessione sono nel pannello Informazioni.

I feed e i nomi sono configurati in `calendars/sources.json`. Il browser legge
soltanto `calendars/events.json`, evitando CORS, token e API key nel sito.
Il workflow **Sync public calendars** legge i cinque feed ogni ora al minuto
17 (GitHub può ritardare gli orari), al cambio della configurazione su `main`,
oppure manualmente dalla scheda Actions. Parte **solo dopo il merge su main**.
Pubblica un commit con il solo snapshot e richiede una build Pages; ha permessi
Contents e Pages in scrittura, senza segreti esterni né crediti AI. Regole di
protezione del branch che vietano il push del bot richiedono un adeguamento
esplicito dell'amministratore: lo script non aggira tali regole.

La sincronizzazione considera circa un anno passato e due futuri, espande
ricorrenze, esclusioni, eccezioni e cancellazioni, gestisce eventi giornalieri,
durate e fusi orari. Pubblica solo titolo, luogo, date e calendario, non
organizzatori, invitati o descrizioni. Se un feed fallisce, conserva gli ultimi
eventi noti, li segnala come non aggiornati e fa fallire il workflow dopo aver
pubblicato lo stato d'errore. La home segnala anche snapshot vecchi oltre tre ore
e il periodo coperto; un errore non viene presentato come assenza di eventi.

I due pacchetti Python in `tools/calendar-requirements.txt` sono usati
**solo dalla sincronizzazione**, per non implementare un parser ICS incompleto.
Non sono dipendenze del browser o del server preview. Per aggiornare in locale:

```sh
python3 -m venv .venv-calendar
.venv-calendar/bin/pip install -r tools/calendar-requirements.txt
.venv-calendar/bin/python tools/sync-calendars.py
```

In PowerShell usa `py -m venv .venv-calendar` e gli eseguibili
`.venv-calendar\Scripts\pip.exe` / `.venv-calendar\Scripts\python.exe`.
Non committare l'ambiente virtuale. Per i test del sincronizzatore:
`python -m unittest discover -s tests -p test_calendar_sync.py`.
La preview legge lo snapshot locale: non contatta i feed.

I feed devono essere pubblici con i dettagli visibili; non usare indirizzi
segreti iCal. In Outlook controlla **Impostazioni > Calendario > Calendari
condivisi > Pubblica un calendario**; in Google **Impostazioni > Autorizzazioni
di accesso per gli eventi > Rendi disponibile pubblicamente**, quindi usa
l'indirizzo pubblico iCal in **Integra calendario**. Restano i link per aprire
i calendari originali e per iscriversi al gruppo. La prima lettura reale da
questo ambiente ha fallito per DNS: lo snapshot incluso riporta gli errori,
senza inventare eventi. La disponibilità dei feed va verificata dalla prima
esecuzione Actions dopo il merge.

## Pubblicazione (GitHub Pages)

In **Settings > Pages**: **Deploy from a branch**, branch `main`, cartella **`/ (root)`**.
Ogni commit su `main` viene pubblicato in circa 1 minuto. L'indirizzo principale
del sito mostra normalmente la home del gruppo. Durante l'assemblea reindirizza
a `Assemblea-di-Gruppo/index.html`, conservando parametri e posizione (`#slide.passo`).
Il file `.nojekyll` fa pubblicare i file così come sono, senza elaborazione Jekyll.

## Struttura del repository

La gerarchia completa, il ruolo di ogni cartella e le ragioni per mantenere
le pagine pubbliche alla radice sono descritti in
[docs/struttura-repository.md](docs/struttura-repository.md). Le pagine
principali sono servite direttamente da GitHub Pages dalla radice del ramo
`main`; spostarle richiede di aggiornare insieme link, script, test e URL.

Nel setup le sezioni sono raccolte nella barra laterale (su telefono diventano
una griglia). Ogni sezione ha titolo e indicazioni contestuali; la barra di
salvataggio resta visibile, con stato delle modifiche e accesso a download e
uscita. Il collegamento alla gestione PDF non modifica i dati dell'assemblea.

## Setup nuovo anno

Il blocco viola **Setup nuovo anno**, tra **Limiti** e **Apri regia**, apre una
procedura guidata di sette passaggi: anno, assemblea, censimenti, entrate e
uscite, patrimonio, contenuti delle slide e riepilogo.

La procedura parte dai dati aperti nel setup, comprese le modifiche locali.
Richiede tutti i nuovi importi (zero va inserito esplicitamente), i nuovi
censiti e **un solo campo data/ora** dell'assemblea e del conto alla rovescia.
Da questo campo ricava la data scritta, per esempio **20 Novembre 2027**,
e la data/ora di tutte le slide QR; non occorre reinserirle separatamente.
L'anno scout viene registrato separatamente dall'esercizio. Titoli, ordine del
giorno, persone, regolamento e PEG sono rivedibili al passaggio Contenuti:
nessuna sostituzione automatica degli anni nei testi.

Solo **OK, applica nuovo anno**, dopo il controllo del riepilogo, aggiorna la
bozza del setup. Gli importi correnti diventano precedenti, i censimenti e
l'avanzo/disavanzo entrano negli storici, gli anni del patrimonio e gli orari
delle prime due convocazioni nelle slide quorum vengono aggiornati. I presenti
del nuovo anno tornano “da rilevare”. Gli storici più vecchi restano intatti;
uno storico dello stesso anno già presente ma diverso blocca la procedura.
L'esercizio deve essere immediatamente successivo e l'ordine delle sei voci
del patrimonio non cambia.

**Annulla procedura** scarta soltanto la bozza annuale. Dopo l'applicazione,
**Annulla** nella barra del setup ripristina tutti i dati all'ultima versione
caricata/salvata, incluse altre modifiche locali: non è un annullamento limitato
al cambio anno. **Salva su GitHub** rimane necessario per pubblicare.

## Dashboard dell'area riservata

Dopo l'accesso, la dashboard mostra titolo, esercizio, data, convocazioni e
numero di slide visibili dell'assemblea, oltre al numero di PDF e ai primi
tre documenti pubblicati. Questi riepiloghi leggono i file del sito: non
indicano lo stato della diretta né le modifiche locali ancora da pubblicare.
Eventuali errori di caricamento hanno un pulsante per riprovare.

Le schede **Prepara l'assemblea**, **Condividi i documenti** e **Accompagna la
diretta** spiegano i rispettivi strumenti; il percorso **Prepara → Pubblica →
Vai in regia** chiarisce quando i contenuti diventano visibili al pubblico.
I dati della dashboard vengono caricati solo dopo l'accesso verificato.
