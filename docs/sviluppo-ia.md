# Guida tecnica per lo sviluppo assistito da IA

Questa guida orienta le modifiche sul branch `NAS`: descrive i confini tra
componenti e le verifiche da fare prima di una modifica. Per installazione,
segreti, backup, aggiornamenti e diagnosi operativa sul Synology, seguire la
[guida Synology](ottimizzazione-synology.md); qui non ne viene ripetuta la
procedura.

## Architettura e responsabilità

- **Sito e interfacce:** le pagine sono in `index.html`, `area-riservata/`,
  `assemblea/`, `documenti/` e `peg/`. Gli script e gli stili condivisi sono
  in `assets/`; configurazione client in `config/site.js`. I contenuti delle
  slide sono in `area-riservata/assemblea/dati.js`; motore, setup, regia,
  rendering e sincronizzazione live sono separati in `core/` e `slides/`
  della stessa cartella. Per dettagli sui tipi di slide, vedere
  [sviluppo.md](sviluppo.md).
- **API e persistenza NAS:** `server/nas.cjs` implementa HTTP, autenticazione,
  stato dell'assemblea, endpoint dei contenuti e dei PDF; riusa il modello di
  validazione documenti `assets/js/documents-model.js`. `server/monitor.cjs`
  registra telemetria, statistiche e campioni risorse. Le letture pubbliche di
  configurazione, dati delle slide, calendari e documenti passano dal backend
  quando richiesto da `deploy/synology/nginx.conf`; il resto delle pagine è
  servito staticamente.
- **Sviluppo locale:** `tools/nas-dev.cjs` avvia il gateway e il backend con
  database di test temporaneo; `tools/preview.cjs` serve una simulazione
  statica con alcune funzioni simulate, non il backend NAS. `tools/build-site.cjs`
  copia gli ingressi pubblicabili in `dist/` e aggiunge hash agli asset CSS/JS
  locali.
- **Deploy:** `server/Dockerfile` definisce il backend Node 24; il
  `deploy/synology/Dockerfile` costruisce e serve il sito tramite Nginx.
  `deploy/synology/compose.yaml` coordina i servizi e il volume dati;
  `deploy/synology/update.sh` crea release dal branch `NAS` e attende gli
  healthcheck. Evitare di confondere questa modalità con la pubblicazione
  statica o il flusso Firebase storico.

## Setup e comandi di verifica

Usare Node 24, come nelle immagini Docker del progetto. Non è definito uno
script `npm` per build o test: i comandi sono diretti e non richiedono un
passo di installazione delle dipendenze Node.

```sh
# Simulazione delle pagine, senza backend NAS reale
node tools/preview.cjs

# Backend NAS locale, con password e dati temporanei stampati dal comando
node tools/nas-dev.cjs

# Build statica in dist/
node tools/build-site.cjs

# Suite Node del sito e del backend
node --test tests/*.test.cjs

# Test del sincronizzatore dei calendari
python -m unittest discover -s tests -p test_calendar_sync.py
```

La build può ricevere una destinazione come argomento, ma non deve sovrascrivere
i sorgenti pubblici. Per una verifica mirata del server e del deploy si possono
eseguire i test `tests/nas-server.test.cjs`, `tests/nas-monitor.test.cjs`,
`tests/nas-telemetry.test.cjs`, `tests/nas-panel.test.cjs`,
`tests/nas-update.test.cjs` e `tests/synology.test.cjs`. Il codice Python di
sincronizzazione ha test in `tests/test_calendar_sync.py`; UI e logica browser
hanno test omonimi o specifici in `tests/`. Un test che verifica file/config
non equivale a un collaudo di rete o di container sul NAS.

## Invarianti da mantenere

- **SQLite e dati:** `server/nas.cjs` usa `node:sqlite`, `site.sqlite` in
  `NAS_DATA_DIR` (default `/data`) e WAL. Lo stato di assemblea, le modifiche,
  `dati.js`, indice e PDF sono persistenti. I dati iniziali del repository
  vengono importati solo quando il corrispondente contenuto non esiste nel
  database: un nuovo deploy non sovrascrive i dati operativi. Le scritture
  correlate ai documenti sono transazionali. Non copiare il solo file SQLite
  mentre è aperto; per backup e ripristino seguire
  [ottimizzazione Synology](ottimizzazione-synology.md).
- **PDF e upload:** API di gestione riservata; `documents-model.js` valida le
  modifiche, il server limita il PDF a meno di 20 MiB e ne verifica la firma
  `%PDF-`. Il payload JSON ha un limite distinto (28 MiB). L'indice e i PDF
  pubblicati sono pubblici: il percorso dell'area riservata non rende privati
  né i file né il codice.
- **Sessione e autorizzazione:** password letta da secret esterno, confronto
  con `scrypt`; il cookie `nas-session` è HttpOnly, SameSite Strict e, in
  produzione, Secure. Le sessioni durano otto ore e vengono cancellate
  all'avvio del backend; pertanto un riavvio richiede un nuovo login. Le
  scritture non devono basarsi solo sui controlli della UI: verificare la
  sessione server-side e il controllo dell'origine per le richieste mutative.
- **Live e stato volatile:** lo stato dell'assemblea/della presentazione e la
  patch persistono in SQLite e sono trasmessi con SSE. I flussi SSE, le
  presenze e i tentativi di rate limit sono invece in memoria: non presumere
  che sopravvivano al riavvio. Solo i percorsi pubblici previsti da
  `PUBLIC_STATE` sono leggibili senza login; le modifiche allo stato richiedono
  sessione. Monitoraggio e presenze live hanno contatori distinti.
- **Deploy:** i file persistenti stanno fuori dalla release sotto il volume
  dati; la release è codice statico/backend. In caso di healthcheck fallito,
  `update.sh` tenta il ripristino del codice precedente, ma non ripristina
  SQLite. Il container Node ascolta sulla rete Docker, Nginx pubblica il
  prefisso `/agesci-canicattini1/` e inoltra API, documenti e file dinamici al
  backend. Verificare sempre prefissi e regole Nginx quando si cambia un URL.

## Libro soci: mappa tecnica e contratti

Il flusso operativo e in [soci.md](soci.md). Non copiare un export reale in
questa guida, nei test o nella memoria dell'assistente.

| Superficie | Responsabilita |
| --- | --- |
| `assets/js/soci-model.js` | modello browser/CommonJS, intestazioni AGESCI, parser CSV, date, campi iniziali, export anti-formule |
| `server/members.cjs` | schema SQLite idempotente, validazione, import, revisioni, macro e modelli |
| `area-riservata/soci.html`, `assets/js/soci.js`, `assets/css/soci.css` | schede, filtri, import con anteprima, selezione, campi, stampa |
| `server/people.cjs` | identita account, password e allowlist, non percorso educativo |
| `server/nas.cjs` | dispatch del modulo dopo `people.handle`; origine, sessione e risposte no-store condivise |
| `server/Dockerfile` | copia sia `members.cjs` sia il modello condiviso nell'immagine Node |
| `deploy/synology/nginx.conf` | pagina `soci.html` tra quelle protette; API inoltrate al backend |

### Persistenza

Tutto risiede nel `site.sqlite` esistente, non in un nuovo file o in JSON
pubblici. `people.id` collega i dati alla persona e `people.census_code` resta
univoco e testuale (preservare gli zeri iniziali).

| Tabella | Chiave / contenuto |
| --- | --- |
| `member_profiles` | persona; branca locale, anagrafica JSON, revisione incrementale |
| `member_censuses` | persona + anno; solo dati ufficiali annuali, non lo storico completo dell'anagrafica |
| `member_fields` | branca + chiave; definizione testo/data/scelta JSON |
| `member_values` | persona + branca; valori educativi JSON, preservati nei passaggi |
| `member_group` | singolo record; metadati di gruppo e anno piu recente |
| `member_templates` | titolo e testo del modello interno |

Il modulo non sostituisce o ricrea `people`; le tabelle e i campi iniziali
sono creati senza cancellare dati. Gli account preesistenti senza profilo
vengono restituiti con `revision: 0`, profilo vuoto e branca Adulti per i capi,
vuota per i ragazzi. Completare la scheda prima di applicare macro.

### API riservate all'amministratore

Prefisso pubblico: `${NAS.basePath}/api/members`. Il browser riusa
`ACCESSO.request`, con credenziali same-origin e no-store. Tutte le operazioni,
anche GET, verificano l'amministratore server-side; un capo abilitato al login
non ottiene automaticamente accesso all'anagrafe.

| Metodo / suffisso | Contratto |
| --- | --- |
| GET `/` | `{members, fields, templates, group}`; mai hash o password |
| POST `/` | `{code, branch, profile, values}`; nuova persona e scheda nella stessa transazione |
| PATCH `/:id` | `{revision, branch, profile, values}`; salva il profilo e i valori della sola branca scelta |
| POST `/import` | `{csv}` per anteprima; `{csv, confirm:true, version}` per conferma |
| POST `/fields` | `{branch, key, label, type, options}`; aggiunta, non modifica/eliminazione |
| POST `/templates` | `{title, body}`; aggiunta modello testuale |
| POST `/macro` | `{action, branch, members:[{id,revision}], key?, value?}`; `action` branch o field |

Anteprima e conferma sono separate: SHA256 del CSV esatto e dello snapshot
del DB impedisce di confermare dopo modifiche concorrenti. Import e macro
sono transazioni sincrone `BEGIN IMMEDIATE` dopo lettura del body asincrono.
Un errore annulla tutto. Profilo e macro richiedono la revisione corrente;
un conflitto restituisce 409, non un salvataggio silenzioso.

### Invarianti dell'import e della UI

- Identificare per codice e anno, non per nome o eta. Gruppo atteso R2053.
  Rifiutare duplicati dello stesso socio/anno e dati di gruppo discordanti:
  non eliminare incarichi senza verificare la fonte.
- Il censimento piu recente aggiorna l'anagrafica; file storici non devono
  farla regredire. Le colonne assenti non cancellano dati; quelle presenti
  e vuote li cancellano. Lo storico ufficiale resta separato dal profilo locale.
- Non cambiare `people.kind`, password o allowlist per persone esistenti.
  L'import non abilita il login. La branca locale non determina l'account.
- Conservare tutti i valori educativi delle altre branche. Una macro di
  campo deve selezionare solo persone nella branca indicata; un passaggio
  modifica la branca locale, mai quella del censimento.
- Non inferire consensi o correggere status sospesi. Genitori in testo grezzo
  da verificare, non deduplicati per somiglianza. Solo telefoni esattamente
  duplicati sono normalizzati.
- Nessun dato personale in storage browser persistente, sorgenti statici,
  fixture reali o log. Schede e modelli sono inseriti nel DOM con `textContent`,
  non `innerHTML`; nessun HTML/script da CSV o segnaposto.
- Il filtro anno seleziona il censimento ufficiale; senza filtro, l'ultimo
  disponibile per ciascun socio. Branca locale distinta dalla branca AGESCI.
  L'export comprende tutti i risultati; le macro usano la selezione, anche
  fuori dai filtri correnti.
- I PDF generati restano una stampa locale del browser. Non usare
  `/api/documents` per pubblicare schede personali nell'archivio pubblico.

### Verifiche mirate

```sh
node --test tests/members.test.cjs tests/members-browser.test.cjs tests/people.test.cjs tests/synology.test.cjs
node tools/build-site.cjs
```

`members.test.cjs` usa dati sintetici e database temporanei: CSV ufficiale
con wrapper Excel, validazione, autorizzazione, import senza scritture in
anteprima, conflitti, rollback, storico, permessi e riavvio.
`members-browser.test.cjs` segue il pattern dei test browser esistenti:
Chromium/Chrome headless se installato, fixture con API simulate, viewport
375/1440, schede, filtri, payload, selezione, stampa e testo non eseguibile.
Non sostituisce il collaudo del container sul NAS. Per verificare l'interfaccia
con API reali usare `tools/nas-dev.cjs`, non `tools/preview.cjs`.

## Checklist pre-merge

- [ ] Ho seguito il confine di responsabilità esistente e aggiornato i
  riferimenti solo se il percorso o il contratto è cambiato.
- [ ] Ho aggiunto o aggiornato test pertinenti: validazione, accesso,
  persistenza dopo riavvio, conflitti, limiti o aggiornamento live, secondo il
  comportamento toccato.
- [ ] Ho eseguito i test mirati e, per modifiche trasversali, `node --test
  tests/*.test.cjs`; per il sincronizzatore, i test Python dedicati.
- [ ] Se ho cambiato API, URL, sottopercorso o asset, ho controllato client,
  configurazione Nginx, preview/build e test di struttura/deploy interessati.
- [ ] Ho verificato che nessun dato riservato o segreto finisca nel codice,
  nei file pubblici o nei log; ho considerato la persistenza e l'effetto di un
  riavvio.
- [ ] Non ho considerato i test automatici sostitutivi del collaudo sul NAS:
  immagine/container, healthcheck, SSE attraverso Nginx e backup/ripristino
  richiedono verifica nell'ambiente previsto.
