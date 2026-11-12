# agesci-canicattini1

Presentazione dell'**Assemblea di Gruppo AGESCI Canicattini 1**, con regia live,
spettatori sincronizzati sul telefono e modifiche ai dati in tempo reale.

## Branch NAS

**NAS gia' installato:** basta pubblicare un commit sul branch `NAS`; l'attivita'
DSM aggiorna e riavvia il progetto esistente, senza ZIP o reinstallazione.
In `releases` conserva soltanto la release corrente e la precedente funzionante;
la pulizia avviene dopo un deployment riuscito, senza toccare `data`.
Per le credenziali puoi aggiungere `.env` nella cartella `NAS_ROOT`: integra
la configurazione esistente `nas.env`, senza sostituire origine o percorso dati.
Gli account personali (ragazzi/capi) e gli hash scrypt sono nel database SQLite
esistente, tranne la password admin: viene verificata da `NAS_ADMIN_PASSWORD`
in `nas.env` (o `.env`), senza conservarne l'hash nel database.
Solo i capi abilitati possono accedere; solo `23816938` gestisce persone
e reset delle password. La navbar pubblica resta bianca e quella riservata viola.
Il precedente codice amministratore `1238005` diventa un capo normale:
per abilitarlo aggiungilo a `NAS_CAPO_CODES` e imposta la sua password personale
al primo accesso. I capi senza password personale (nuovi o resettati dall'admin)
accedono solo con la password provvisoria `Canicattini1` e devono sceglierne subito
una nuova; senza questo passaggio non ottengono nessuna sessione. L'account
amministratore usa sempre `NAS_ADMIN_PASSWORD`.

Questo branch usa **Node 24 e SQLite sul Synology** per login, diretta,
contenuti e PDF. Setup e gestione documenti salvano direttamente sul NAS.
GitHub resta la sorgente del codice: un'attivita' DSM
controlla `NAS` ogni minuto e distribuisce l'ultimo commit preservando i dati.
Non pubblicare questo branch su GitHub Pages.

`main` mantiene soltanto il reindirizzamento d'ingresso da GitHub Pages al
Synology; per continuare lo sviluppo usare `NAS`. Non unire i due branch:
la home di `NAS` deve restare il sito completo, non il reindirizzamento.
Il deploy DSM scarica il branch `NAS` con un fetch forzato e funziona anche
dopo la riscrittura della cronologia, senza sovrascrivere i dati persistenti.

La pubblicazione predefinita usa **Synology DDNS (`nomegruppo.synology.me`)
e reverse proxy HTTPS DSM**, senza acquistare un dominio o usare Cloudflare.
Con Sky WiFi verificare prima che la propria linea consenta la porta TCP 443
in ingresso su un IP pubblico. Il solo DDNS non supera CGNAT o porte condivise.

**Installazione DDNS, configurazione Sky WiFi, aggiornamenti e backup:**
[guida Synology](docs/ottimizzazione-synology.md).

In regia, **Server live > Apri monitor** mostra gli spettatori simultanei della
presentazione e le connessioni SSE tecniche separatamente, oltre a CPU/RAM di
backend e NAS. Si aggiorna automaticamente, senza pulsante Aggiorna. La pagina
**Statistiche sito** mostra persone collegate ora e persone uniche al giorno
sull'intero sito, visite, pagine viste, spettatori unici della diretta,
distribuzione delle pagine e segnalazioni; la dashboard
ne mostra un riepilogo. Include grafici dell'ultima ora per le persone
collegate (browser/dispositivi distinti, schede in background comprese),
risposta API p95, CPU e RAM, oltre allo storico giornaliero
aggregato conservato sul NAS per 365 giorni. Persone e unici della diretta partono dal
deploy che attiva il conteggio e i campioni dell'ultima ora si accumulano al
ritmo di uno al minuto; i dati precedenti sono indicati come non raccolti.
La pagina mostra anche il commit deployato e permette di confrontarlo con
l'ultimo commit del branch `NAS`. La raccolta browser e' disattivabile e le API
dei report richiedono una sessione amministrativa.

**Libro soci:** dalla dashboard amministrativa apri **Libro soci**
(`area-riservata/soci.html`). Importa il CSV ufficiale AGESCI con anteprima e
conferma, consulta e modifica le schede, filtra ed esporta i risultati.
Il censimento annuale resta distinto dalla branca locale e dai percorsi
educativi L/C, E/G, R/S e adulti. Sono disponibili campi personalizzati, macro
di gruppo e modelli interni stampabili anche in PDF. Tutti i dati restano nel
database SQLite esistente; nessun elenco soci viene pubblicato nel repository.
L'importazione non abilita nuovi account al login. Per il flusso operativo
e i limiti della fonte vedere [gestione soci](docs/soci.md).
I sospesi da oltre un anno sono esclusi di default da elenco, conteggi ed
estrazioni del libro soci, con un filtro per includerli. I capi con branca
di servizio assegnata gestiscono solo le schede di quella branca. I passaggi
L/C → E/G → R/S sono proposte: richiedono conferma di un altro capo della
destinazione. Raggruppamento per anno di nascita e progressioni sono manuali.

> 📘 [Guida illustrata](area-riservata/assemblea/guida.html) (stesso stile della presentazione).

## Documentazione

| Documento                                                          | Contenuto                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [docs/assemblea.md](docs/assemblea.md)                             | aprire e chiudere l'assemblea, dashboard regia, schermo proiettore, pubblico |
| [docs/sviluppo.md](docs/sviluppo.md)                               | struttura del codice e dei tipi di slide                                     |
| [docs/struttura-repository.md](docs/struttura-repository.md)       | gerarchia completa del repository e criteri di organizzazione                |
| [docs/audit-ui-ux.md](docs/audit-ui-ux.md)                         | audit UI/UX e priorità di manutenzione                                       |
| [docs/ottimizzazione-synology.md](docs/ottimizzazione-synology.md) | backend NAS, DDNS Sky WiFi, auto-deployment, calendari DSM e backup          |
| [docs/sviluppo-ia.md](docs/sviluppo-ia.md)                         | architettura NAS, comandi verificati, invarianti e checklist per lo sviluppo con IA |
| [docs/soci.md](docs/soci.md)                                     | importazione AGESCI, schede, filtri, campi educativi, macro e documenti |

## Indirizzi

Tutti gli indirizzi seguenti sono sotto `/agesci-canicattini1/` sul dominio
configurato in `NAS_PUBLIC_ORIGIN` (che resta senza percorso).
Home: `https://terranovamtt.synology.me/agesci-canicattini1/`.
La radice `/index.html` resta libera per il futuro portfolio e al momento
restituisce 404; non viene creato un portfolio da questo repository.

| Chi                          | Indirizzo                                                      |
| ---------------------------- | -------------------------------------------------------------- |
| Home / pubblico              | `.../` sotto il prefisso `/agesci-canicattini1/`                |
| Area riservata               | `.../area-riservata/` (codice censimento e password)           |
| Gestione PDF                 | `.../area-riservata/documenti.html`                            |
| Libro soci                   | `.../area-riservata/soci.html` (amministratore e capi assegnati) |
| Documenti pubblici assemblea | `.../assemblea/` (nessun login)                                |
| Archivio documenti           | `.../documenti/` (pubblico, ricerca per anno e testo)          |
| PEG corrente                 | `.../peg/` (edizione attuale in `peg/edizioni/2026-2028.html`) |
| Regia (dashboard)            | `.../area-riservata/assemblea/regia.html` (sessione personale) |
| Slide per il pubblico        | `.../area-riservata/assemblea/`                                |
| Statistiche del sito         | `.../area-riservata/statistiche.html` (accesso riservato)      |
| Setup (NAS)                  | `.../area-riservata/assemblea/setup.html` (salvataggio SQLite) |
| Guida                        | `.../area-riservata/assemblea/guida.html`                      |

Sul NAS attuale le slide sono all'indirizzo
`https://terranovamtt.synology.me/agesci-canicattini1/area-riservata/assemblea/` e la regia
in `https://terranovamtt.synology.me/agesci-canicattini1/area-riservata/assemblea/regia.html`.
Per il proiettore usare **Apri schermo presentazione** dalla regia.
`assemblea/` resta la sezione dei documenti preparatori, non il link alle slide.
Il QR fornito e ottimizzato in `assets/img/qr-live.png` punta alla home AGESCI:
48.461 byte, circa il 92% in meno del sorgente SVG, decodificato a quattro dimensioni.

La home propone **Area riservata**: il backend NAS verifica codice censimento
(da 5 a 9 cifre senza spazi) e password e crea una sessione HttpOnly/Secure di otto ore.
Le nuove password richiedono 8-128 caratteri, maiuscola, minuscola, numero e
carattere speciale (es. `@`). Il browser non
conserva la password; **Esci** revoca la sessione. Il server protegge le scritture
anche se qualcuno aggira l'interfaccia. Il reset della password revoca tutte le
sessioni della persona; il pubblico riconnette la diretta dopo un riavvio.
Il setup modifica i contenuti persistenti di base, separati dalle modifiche live.
Il percorso sotto `area-riservata/` non rende private slide, PDF o codice:
non inserire informazioni riservate. Non condividere vecchi URL con password.

## Anteprima locale

### Demo con dati fittizi (branch `dev`)

Installa **Node.js 24 o successivo**, poi scarica il branch `dev` oppure esegui:

```sh
git clone --branch dev --single-branch https://github.com/terranovamt/agesci-canicattini1.git
cd agesci-canicattini1
node tools/nas-demo.cjs
```

Non serve `npm install`. Apri l'indirizzo locale stampato nel terminale
(`http://127.0.0.1:PORTA/agesci-canicattini1/area-riservata/`).
La porta viene scelta automaticamente fra quelle libere.

| Vista | Codice censimento |
| --- | --- |
| Amministratore | `23816938` |
| Capo L/C | `7654321` |
| Capo E/G | `7654322` |
| Capo R/S | `7654323` |

Password comune, valida **solo per questa demo**: `Nas-local-test-password1-only!`.

Il comando ricrea da zero un database SQLite temporaneo che simula un anno
di vita del gruppo: 30 soci L/C in 6 sestiglie, 35 soci E/G in 5 squadriglie
e 17 soci R/S. Nomi e cognomi italiani, date di nascita, indirizzi e famiglie
sono **inventati**; le email usano il dominio riservato `example.test`.
Trovi oltre 150 attivita': riunioni settimanali, uscite mensili, campi estivi
e invernali, programmi con inizio/fine e materiali, presenze e assenze,
quote saldate, acconti, debiti e versamenti in eccesso. Il torneo L/C ha uno
storico di valutazioni; i percorsi comprendono cacce aperte e concluse,
specialita' e brevetti in vari stati, con riconoscimenti gia' assegnati.
Sono presenti anche una riunione oggi e un'uscita nei prossimi giorni.
Le date si adattano al giorno di avvio in Europe/Rome. Puoi modificare e
salvare i dati normalmente: rimangono disponibili finche' il comando e' in
esecuzione. **Ctrl+C** chiude il server ed elimina il database della demo;
al prossimo avvio si riparte dai dati di esempio.
Il server ascolta solo sul tuo computer e non usa configurazioni, database
o credenziali del NAS. Non copiare questo database sul NAS e non eseguire
il comando sul server di produzione.

### Altre anteprime

Per collaudare backend NAS e monitor con database temporaneo, usare Node 24:
`node tools/nas-dev.cjs`. Il comando stampa URL e password di solo test;
nessun dato reale del NAS viene modificato. CPU/RAM host richiedono Linux/NAS.
Per confrontare le pagine dell'area riservata sui sette schermi, apri
`<URL stampato>/design-system/area-riservata-responsive.html`: il selettore e i link
nelle anteprime sincronizzano la navigazione. La pagina e' solo uno strumento
locale di confronto e non viene servita dal sito pubblicato.
Per provare **Visualizza come** con un capo per ciascuna branca, avvia invece
`node tools/nas-demo.cjs` e apri lo stesso percorso di confronto dall'URL
stampato. Accedi come amministratore, apri Visualizza come, scegli il capo
L/C, E/G o R/S e premi **Ricarica** nel confronto per applicare la sessione a
tutti e sette gli schermi. La demo contiene un account per branca e solo dati
inventati; al riavvio il database temporaneo viene ricreato.

Per provare il backend in locale con database temporaneo usa
`node tools/nas-dev.cjs`; per le viste dimostrative con dati fittizi usa
`node tools/nas-demo.cjs`. Entrambi sono isolati dai dati del NAS.

## Prestazioni e build statica

`node tools/build-site.cjs` produce la cartella `dist/` con soli file pubblicabili.
Il container Nginx usa questa build in uno stage Node separato: le pagine sono
HTML statico gia' renderizzato, senza framework o SSR per richiesta. Documenti,
calendari e dati modificabili continuano a essere letti dal NAS; la build non
sovrascrive SQLite o i PDF caricati. Non viene generata una copia statica dei
dati persistenti che rischierebbe di diventare obsoleta.

Logo/link home, footer e pulsante del menu sono definiti una sola volta in
`tools/partials/`. Le pagine li richiamano con `<!-- include:brand -->`,
`<!-- include:footer -->` e `<!-- include:menu-toggle -->`.
Il footer accetta `caption` e `top`, per esempio
`<!-- include:footer {"top":"reserved-content"} -->`; i percorsi del logo e della
home sono calcolati dalla posizione della pagina. Build, preview e anteprima NAS
espandono gli stessi frammenti. Per pubblicare usare l'HTML generato in `dist/`,
non i sorgenti con direttive; i frammenti non vengono copiati nel sito pubblico.
I menu e le barre operative specifici delle singole sezioni restano distinti.

- Skeleton durante il caricamento di documenti e calendari, con `aria-busy`
  e animazioni disattivate quando e' richiesta una riduzione del movimento.
- Salvataggi PDF ottimistici: lista aggiornata subito, conferma dal server e
  rollback su errore. Il modulo resta disponibile per riprovare.
- Archivio iniziale di 48 elementi, caricamento a blocchi e `content-visibility`
  per saltare il rendering delle righe fuori schermo. E' rendering differito
  nativo con caricamento progressivo, non virtualizzazione DOM React.
- Filtri invariati non ricostruiscono le schede. Script separati per pagina
  con `defer`, in ordine di dipendenza; immagini fuori dal primo schermo lazy.
- La build versiona CSS e JavaScript statici con hash del contenuto, evitando
  asset vecchi dopo gli aggiornamenti senza rinunciare alla cache del browser.
- Loghi e icone WebP lossless; foto AVIF con fallback WebP, richiesta soltanto
  dalle slide fotografiche. Favicon e QR rimangono PNG.
- Montserrat e Caveat WOFF2 locali, soli caratteri latini e stile normale,
  `font-display: swap`; nessuna richiesta runtime a Google Fonts.

Non e' stata aggiunta una chat IA: lo streaming token-by-token e' escluso
per scelta, perche' il sito attuale non contiene un servizio IA.

## Gestione documenti

Nell'area riservata apri **Gestisci documenti PDF**. Dopo l'accesso puoi caricare,
modificare o eliminare PDF inferiori a 20 MiB. File e metadati vengono salvati
insieme in una transazione SQLite e sono subito disponibili sul NAS.
Non servono token o commit GitHub; conflitti concorrenti richiedono una ricarica.

La sezione pubblica **Documenti preparatori all'assemblea 2026**, in
`assemblea/index.html`, legge
`documents/index.json` e presenta quattro schede ordinate: PEG 2026-2028,
Bilancio 2026 - Modello D, Convocazione assemblea 2026 e Regolamento assembleare.
Il PEG si legge anche nella pagina dedicata; tutte le schede permettono di
scaricare il PDF. Le altre tre aprono il PDF in una nuova scheda.
I file in `documents/pdf/` e l'indice nel repository inizializzano SQLite solo
al primo avvio. Poi usare la gestione documenti: nuovi commit non sovrascrivono
il database. L'archivio `documenti/index.html` mostra tutti i
PDF, con filtro per anno di riferimento e ricerca in titolo e descrizione.
La sezione «Gli ultimi documenti» della home mostra soltanto quattro PDF, ordinati per
`publishedAt` (data ISO `YYYY-MM-DD`, decrescente). A parità di data rimane
l'ordine nell'indice. `year` è l'anno di riferimento, distinto dalla data di
pubblicazione; entrambi si impostano nella gestione documenti. Le voci
precedenti senza metadati restano disponibili nell'archivio sotto “Senza anno”
e vengono dopo quelle datate nella home. Ordine, icone e collegamento al PEG sono definiti in
`assets/js/home-documents.js`.
La selezione «Documenti preparatori» resta distinta: mostra soltanto i PDF
con `assemblyYear` uguale all'anno corrente (Europe/Rome), anche nella pagina
`assemblea/index.html`. Il relativo anno si imposta separatamente nella gestione.
Nella home la sezione compare solo dai 15 giorni di calendario (Europe/Rome)
precedenti un evento «Assemblea di Gruppo» del calendario del gruppo fino alla
sua fine, in linea con l'invio del bilancio previsto dall'art. 3 del Regolamento
assembleare; resta nascosta se i calendari non si caricano. Contiene anche la
card «Cos'è l'Assemblea di Gruppo?», un breve testo in `index.html` che cita
articolo e comma di `documents/pdf/RegolamentoAssembleaCanicattini1.pdf`, con
«Scopri di più» che apre i quattro punti principali (artt. 1, 3, 10–11, 14–15).
La stessa card compare in `assemblea/index.html`.
Non caricare informazioni riservate: repository e documenti sono pubblici.
I salvataggi aggiornano il sito sul NAS tramite il backend.

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
se futuro e a meno di 30 giorni, con titolo e conto alla rovescia (in giorni di
calendario) in evidenza. L'avviso non dipende dai filtri; viene omesso
se i dati del gruppo non sono aggiornati. L'accesso alla diretta quando attiva
resta invariato; gli errori di connessione sono nel pannello Informazioni.

I feed e i nomi sono configurati in `calendars/sources.json`. Il browser legge
soltanto `calendars/events.json`, evitando CORS, token e API key nel sito.
Sul NAS una seconda attivita' DSM esegue `sync-calendars.sh` ogni ora usando
un container di manutenzione e uno snapshot persistente. Non richiede GitHub
Actions o commit dello snapshot.

La sincronizzazione considera circa un anno passato e due futuri, espande
ricorrenze, esclusioni, eccezioni e cancellazioni, gestisce eventi giornalieri,
durate e fusi orari. Pubblica solo titolo, luogo, date e calendario, non
organizzatori, invitati o descrizioni. Se un feed fallisce, conserva gli ultimi
eventi noti e li segnala come non aggiornati; la sincronizzazione sul NAS è
eseguita dall'attività DSM. La home segnala anche snapshot vecchi oltre tre ore
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
senza inventare eventi. Verificare i feed alla prima esecuzione sul NAS.

## Pubblicazione NAS

L'attivita' DSM controlla l'ultimo commit di `NAS` ogni minuto, costruisce la
release e attende gli healthcheck. Se l'avvio fallisce tenta il ripristino del
codice precedente; non ripristina il database. Dati e secret restano fuori
dalle release. Sono necessari prima configurazione e collaudo sul NAS:
vedere la [guida](docs/ottimizzazione-synology.md). Il branch `main` e la sua
eventuale pubblicazione GitHub Pages restano separati.

## Struttura del repository

`index.html` e' l'unico file HTML alla radice. I vecchi HTML di ingresso
e le cartelle di compatibilita' sono stati rimossi: sul NAS i loro indirizzi sono reindirizzati da Nginx,
mentre sulle pagine statiche GitHub occorre usare i percorsi canonici.
Esistono soltanto `peg/` per il PEG e `assemblea/` per i documenti pubblici;
regia, setup e guida restano in `area-riservata/assemblea/`.

La home resta in `index.html`; le altre pagine sono raggruppate per funzione:
`assemblea/` per i documenti preparatori pubblici, `peg/edizioni/` per i
progetti educativi pubblici, `area-riservata/` per dashboard e gestione PDF.
Dentro `area-riservata/assemblea/` vivono setup, regia, guida e presentazione
con il relativo motore. `config/` contiene
la configurazione pubblica e `assets/` le risorse condivise. Calendari e PDF
restano in `calendars/` e `documents/`, separati dalla logica che li legge.
La [gerarchia completa](docs/struttura-repository.md) spiega anche la struttura
interna, i criteri e i reindirizzamenti dai vecchi URL.

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
al cambio anno. **Salva sul NAS** rimane necessario per pubblicare.

## Dashboard dell'area riservata

Dopo l'accesso, la dashboard mostra prima l'attivita di oggi o la prossima:
**Attivita in corso** e **Presenze** sono affiancati, **Quote** apre i debitori.
Seguono le scorciatoie della branca; **Altro** raccoglie strumenti di gruppo,
assemblea, documenti e metriche admin. I riepiloghi assemblea e PDF leggono i file del sito: non
indicano lo stato della diretta né le modifiche locali ancora da pubblicare.
Eventuali errori di caricamento hanno un pulsante per riprovare.

I dati della dashboard vengono caricati solo dopo l'accesso verificato.
