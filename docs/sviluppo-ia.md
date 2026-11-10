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
- **Setup e regia:** le modifiche locali del setup sono una bozza; chiudere
  l'editor o premere **Applica alla bozza** nel JSON non salva i contenuti di
  base. **Salva dati base** aggiorna `dati.js` sul NAS oppure su GitHub nella
  modalità statica.
  La regia pubblica invece una patch live separata, che prevale sui campi
  corrispondenti della base. Il setup non legge né cancella questa patch.
  Nella guida distinguere i due contesti: token GitHub, regole e quote Firebase
  non sono requisiti universali del NAS.
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
| `server/people.cjs` | identita account, password, allowlist e branca di servizio, non percorso educativo |
| `server/nas.cjs` | dispatch del modulo dopo `people.handle`; origine, sessione e risposte no-store condivise |
| `server/Dockerfile` | copia sia `members.cjs` sia il modello condiviso nell'immagine Node |
| `deploy/synology/nginx.conf` | pagina `soci.html` tra quelle protette; API inoltrate al backend |

### Navigazione per sezioni delle interfacce

- Il setup del bilancio in `area-riservata/assemblea/setup.html` separa entrate,
  uscite, soglie, avanzi, censimenti e patrimonio tramite `data-balance`; la
  selezione cambia solo il gruppo renderizzato e i dati non selezionati restano
  intatti.
- La scheda socio mantiene nel DOM le sezioni Attività, Percorso, Anagrafica,
  Contatti, Genitori e Censimenti, nell'ordine indicato e con apertura su
  Attività. Sono pannelli distinti: non riunire gli ultimi tre in Anagrafica.
  Non ricreare i campi al cambio sezione: valori e bozze devono sopravvivere;
  il salvataggio resta esplicito. Un pannello nascosto per navigazione non
  rende inapplicabili i suoi campi e non deve escluderli dal salvataggio.
  I percorsi appartengono al singolo socio: `?member=ID#paths-panel` apre la
  gestione individuale; `soci.html?member=ID&section=education` ritorna alla
  sua scheda. Entrambi verificano il roster autorizzato, senza cambiare permessi.
- Gli accessi amministrativi sono presentati per branca e filtrabili senza
  ampliare l'allowlist: il server continua a esporre solo i capi di
  `NAS_CAPO_CODES` e consente solo cambio branca e reset password.
- Le assegnazioni di branca non salvate restano in `branchDrafts` passando
  tra filtri. Eliminarle solo dopo un PATCH riuscito o conferma di ricarica.
- `assets/js/shared/section-nav.js` controlla pulsanti `data-section-target`
  e pannelli `data-section-panel` mantenuti nel DOM. La selezione usa
  `aria-pressed`/`aria-controls`; l'evento `section-select` apre un pannello
  dai flussi applicativi (modifica PDF, analisi import). La validazione
  mostra il pannello del primo campo non valido.
- Statistiche sito non usa tab: versione NAS, visite, server e segnalazioni
  restano visibili insieme nella stessa pagina, anche su mobile.
- `data-section-mobile` limita il cambio visibilita a 760px: in regia
  anteprime e comandi diretta restano sempre disponibili, mentre Slide,
  Dati live e Server sono alternativi su telefono e affiancati su desktop.
- Le voci entrate/uscite hanno importi affiancati e descrizione richiudibile;
  aggiunta e rimozione restano esplicite. Le sei voci del patrimonio mantengono
  posizione e identita senza comandi di aggiunta/rimozione. Altri dati
  rende accessibili anche eventuali chiavi di bilancio non standard.
- Audit schermate: dashboard a pagina unica, senza tab: attivita di oggi
  prima degli strumenti e dei censimenti admin; Attivita in corso e Presenze
  affiancati, Quote diretto ai debitori e 3–4 scorciatoie. Libro soci,
  Documenti, Assemblea, Biblioteca e metriche sono in Altro, chiuso all'avvio;
  al suo interno due colonne da 800px, altrimenti in pila.
  La home dei capi e personalizzata per `serviceBranch`: L/C giallo con
  torneo e prede, E/G verde con specialita/brevetti, R/S rosso con route.
  Le scorciatoie aprono tab esistenti senza estendere le autorizzazioni.
  Titolo e dettagli assemblea non rappresentano lo stato della diretta.
  Biblioteca, gestione PDF e assemblea restano disponibili a tutti i capi,
  anche senza branca; Libro soci e Attività solo admin/capi con branca, accessi,
  censimenti e statistiche solo admin. Restano retry per dati/PDF/censimenti
  e aggiornamento automatico delle metriche. Gestione
  PDF (Biblioteca/Carica), statistiche (sezioni simultanee, non tab),
  Libro soci (Ricerca/Passaggi/Campi e modelli), import (CSV/Controllo).
  Macro e stampa restano flussi brevi a singola attivita; setup conserva
  editor slide, wizard nuovo anno e strumenti avanzati separati.
  Home, archivio, assemblea pubblica, PEG e guida mantengono lettura libera
  e navigazione ad ancore; player, alias PEG e 404 non richiedono tab.
  La guida mantiene tutti i contenuti ricercabili nel browser, con indice
  completo anche per Home e assemblea; il toggle mobile richiude solo l'indice.
  Quando lo spazio lo consente l'indice è laterale e resta nel viewport;
  testo a misura di lettura e tabelle etichettate su schermi stretti evitano
  righe troppo lunghe o caratteri ridotti per far entrare i contenuti.
  Preservare deep-link e modalità `?embed` / `solo=limiti`, senza coprire i
  titoli con gli elementi sticky.
  Non inserire una seconda intestazione su documenti, regia, guida o player.
- Verificare le interazioni browser in
  `tests/documents-browser.test.cjs`, `tests/members-browser.test.cjs` e
  `tests/people-ui.test.cjs`, oltre a `tests/setup.test.cjs`.
  `tests/section-navigation-browser.test.cjs` copre l'inventario completo
  a 375/768/1024/1440px (markup/CSS/controller condiviso); i test specifici
  coprono dati, salvataggi, import e autorizzazioni con servizi simulati.
  `tests/guida-browser.test.cjs` verifica indice, ancore e contesti della guida
  su desktop, laptop, tablet e telefono nelle due orientazioni applicabili,
  comprese le varianti embed e `solo=limiti`.

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
| `member_assignment_history` | persona + branca + anno; ultima assegnazione locale e ruolo dell'anno, distinta dai censimenti AGESCI |
| `member_group` | singolo record; metadati di gruppo e anno piu recente |
| `member_templates` | titolo e testo del modello interno |
| `member_transfers` | proposta persona, source/target, proponente, revisione scheda, stato/revisione, revisore; indice univoco parziale per una sola proposta pending |

Il modulo non sostituisce o ricrea `people`; le tabelle e i campi iniziali
sono creati senza cancellare dati. Gli account preesistenti senza profilo
vengono restituiti con `revision: 0`, profilo vuoto e branca Adulti per i capi,
vuota per i ragazzi. Completare la scheda prima di applicare macro.

### API con autorizzazione per branca

Prefisso pubblico: `${NAS.basePath}/api/members`. Il browser riusa
`ACCESSO.request`, con credenziali same-origin e no-store. Tutte le operazioni,
anche GET, verificano sessione e ambito server-side. `people.service_branch`
e una colonna TEXT migrata con default vuoto, esposta come `serviceBranch`;
solo l'amministratore puo assegnarla tramite `/api/people/:id`, con un payload
limitato al solo `serviceBranch`. La gestione accessi mostra esclusivamente i
capi presenti in `NAS_CAPO_CODES` (l'amministratore resta fuori dall'elenco);
non permette di creare account o modificare nome e tipologia. Il reset password
e disponibile solo per questi capi e revoca tutte le loro sessioni. Un capo abilitato
al login senza branca assegnata non ottiene accesso all'anagrafe.
"Visualizza come" salva solo `sessions.view_as_id` sulla sessione admin:
`people.user()` restituisce il capo come utente effettivo per ogni endpoint,
con `actorId` non serializzato per gli audit (proposer/reviewer dei passaggi);
`people.client()` alimenta `window.NAS.viewAs`. `POST/DELETE
/api/auth/view-as` richiedono l'admin reale; target non piu' valido = 409.
L'amministratore ha accesso completo; un capo assegnato legge/modifica solo
schede della stessa branca locale e vede solo i valori educativi di quella
branca. Anche macro e aggiunta campi rispettano questo ambito. Import, nuove
persone e creazione modelli sono amministrativi. Le assegnazioni sono
rilette server-side a ogni operazione: una sessione esistente non conserva
permessi della precedente branca.

| Metodo / suffisso | Contratto |
| --- | --- |
| GET `/` | `{members, fields, templates, group, currentYear, transfers, visibility?}` filtrato per ambito; mai hash o password |
| POST `/` | `{code, branch, profile, values}`; nuova persona e scheda nella stessa transazione |
| PATCH `/:id` | `{revision, branch, profile, values}`; salva il profilo e i valori della sola branca scelta |
| POST `/import` | `{csv}` per anteprima; `{csv, confirm:true, version}` per conferma |
| POST `/fields` | `{branch, key, label, type, options}`; aggiunta, non modifica/eliminazione |
| POST `/templates` | `{title, body}`; aggiunta modello testuale |
| POST `/macro` | UI: `{action:'passage', members:[{id,revision}]}`; destinazione derivata server-side. Compatibilita API: `branch` opzionale verificata per passage; `action:'field'` con branch/key/value e alias `action:'branch'` restano supportati ma non proposti dalla UI |
| PATCH `/transfers/:id` | `{revision, action:'confirm'|'reject'|'cancel'}`; altro capo destinatario oppure admin anche proponente; vista admin-come-capo confinata alla destinazione; annullamento della provenienza |

Anteprima e conferma sono separate: SHA256 del CSV esatto e dello snapshot
del DB impedisce di confermare dopo modifiche concorrenti. Import e macro
sono transazioni sincrone `BEGIN IMMEDIATE` dopo lettura del body asincrono.
Un errore annulla tutto. Profilo e macro richiedono la revisione corrente;
un conflitto restituisce 409, non un salvataggio silenzioso.

### Invarianti dell'import e della UI

- L'amministratore, identificato dal medesimo `ADMIN_CODE` esportato da
  `server/people.cjs`, e escluso server-side dallo snapshot soci e dai
  passaggi visibili. Non cancellarne account, censimenti o profilo: l'import
  puo continuare ad aggiornarli, ma UI, conteggi ed export non li ricevono.
- `profile.guardianContacts` e un array (massimo 20) di oggetti con
  `fullName`, `givenName`, `surname`, `taxCode`, `birthTown`, `birthDate`,
  `email`, `phone`. `M.parseGuardians` separa la sintassi AGESCI con CF tra
  parentesi quadre e marcatori nascita/email/cellulare; ritorna anche
  `unparsed`, mai scartare silenziosamente questi record. Il testo
  `profile.guardians` resta intatto e consultabile. Per profili precedenti
  il GET deriva i contatti senza modificare il DB; Salva scheda li persiste.
- Non dividere automaticamente nomi completi e non unire responsabili
  con stesso CF. Reimportando, abbinare ciascuna occorrenza una sola volta
  per conservare i nomi/cognomi verificati senza propagare il primo duplicato.
- La UI genitori usa solo `fullName`, senza i due input `givenName`/`surname`;
  legge ancora i nomi verificati preesistenti. Il reimport per CF conserva anche
  il nome completo corretto localmente.
- `M.pendingCoca` esclude dalle viste dei soli capi i profili adulti con FoCa
  valorizzato e CoCa assente/No. Se `member.kind === 'ragazzo'` il filtro
  non si applica mai, indipendentemente dai valori importati.
  L'admin riceve tutte le schede, senza questo filtro.
  Non eliminare profili o cambiare permessi. I consensi elencati
  in `M.ignoredProfileFields` sono ignorati da import, API profilo e export;
  eventuali JSON storici non richiedono cancellazioni massive.
- Nella scheda, assegnazione e ruolo sono un riepilogo in sola lettura;
  le macro UI li escludono. Gli spostamenti aggiornano lo storico annuale in SQL
  nella stessa transazione. Usare l'anno massimo importato; checkpoint prima e
  dopo gli import, senza ricostruire anni precedenti dai censimenti.
- Il vecchio campo L/C standard `pista` e nascosto dagli input e dalle macro;
  valori gia salvati restano note consultabili, non cancellarli. Le definizioni
  personalizzate non devono essere riscritte.
- `M.defaultFields` contiene cataloghi `multiselect` L/C ed E/G e brevetti
  E/G. I valori sono array di stringhe; `M.selectedChoices` legge i vecchi
  testi separati da punto e virgola. Ricerca, export, stampa, macro,
  raccolta delle bozze e validazione devono gestire entrambe le forme.
  Valori precedenti fuori catalogo restano visibili e possono essere
  conservati, non assegnati ex novo ad altri soci.
- Migrare solo definizioni standard riconosciute, mai quelle
  personalizzate. Il vecchio E/G `progressione="Si"`/`"Piede tenero"` diventa
  `ruolo="Piede tenero"` se il ruolo era vuoto/Squadrigliere; capo e vice
  espliciti hanno precedenza. Eliminare soltanto il campo flag standard.
  `Novizio` L/C diventa `Cucciolo` solo con lo schema standard precedente.
  Migrazioni atomiche e idempotenti, con revisione dei profili modificati.
  Momenti L/C e tappe E/G
  sono selezioni singole; R/S ha `passi` e nessun catalogo di specialita.
  Fonti e conteggi dei cataloghi sono documentati in `docs/soci.md`.
- `server/member-units.cjs` gestisce `member_units` e
  `member_branch_settings`. Identita univoca `(branch, M.unitKey(name))`;
  nascondere non elimina immagini, colori o `member_values`.
  POST con lo stesso nome ripristina senza sovrascrivere l'aspetto.
  Non ripristinare implicitamente un gruppo da una modifica educativa.
  `validateAssignment` si applica a schede, macro, board e rientro tramite
  passaggio; capo/vice singoli, transazioni con rollback integrale.
  Il modulo deve essere incluso in `server/Dockerfile`: i test Synology
  controllano anche le dipendenze locali transitive di `server/nas.cjs`,
  per evitare immagini compilate correttamente ma non avviabili.
- L'ambiente L/C e condiviso: Branco/Cerchio, con revisione propria.
  `M.lcMoments` e `M.unitRoles` sono la fonte comune per UI e server.
  Cambio ambiente: mappa i momenti per indice, Cucciolo/Cocci e revisioni
  dei profili, conservando tutto il resto, compresi i percorsi storici.
  Le definizioni vengono adattate nello snapshot, non riscritte a ogni GET.
- `assets/js/soci-units.js` e il controller della vista, montato da `soci.js`.
- La board usa righe compatte C/VC, membri senza titoli e nuovi ingressi
  su fondo distinto. Conservare `data-role`, aria-label completi e bersagli
  drag/tastiera da almeno 44px anche senza intestazioni per ogni ruolo.
  Nomi, ruoli e conteggio per unità devono restare leggibili a colpo d'occhio.
  Le assegnazioni restano nella schermata gruppi, senza nuovi dialoghi
  «Sposta» dalle card o dalla scheda personale. Presenze/assenze alle attività sono
  requisiti futuri, non ancora implementati.
- `M.patrolCatalog`/`M.patrolIdentity` fissano colori e alias singolare/plurale
  forniti dal gruppo; API e UI applicano lo stesso catalogo senza cancellare
  i dati locali precedenti. Gallo ha tre varianti esplicite; non indovinarne una.
  Guidoni in `assets/img/guidoni/<plurale>.svg`, caricati come immagini esterne
  con fallback al guidone vuoto. `base.svg` e il modello, `leoni.svg` un esempio.
  Mai inserire contenuti SVG arbitrari tramite innerHTML.
  Trascinamento e modulo touch/tastiera usano lo stesso endpoint
  `PATCH members/units/assign` con revisione del socio.
  Non nascondere soci con ruolo precedente o gruppo archiviato.
  Guidone e triangolo sono SVG generati, emblemi solo PNG raster salvati nel
  DB (upload browser ridimensionato). Non usare URL esterni o SVG caricati.
- `GET /api/members/overview` e riservato all'admin e ritorna solo conteggi
  aggregati (anno massimo importato e numero di record per branca ufficiale),
  escludendo sempre i sospesi da oltre un anno con `M.longSuspended`,
  senza PII; la dashboard NAS lo usa per il riepilogo censimenti. Non sostituire
  questa API con `GET /api/members` nella dashboard.
- Nel Libro soci le schede branca filtrano a toggle; i chip anno e status
  riflettono i select esistenti e si combinano. `Ricerca avanzata` raggruppa
  controlli meno usati. Specialita/brevetti restano multiselect con search in
  `details` collassato (checkbox, non radio/pulsanti per voce); test UX coprono
  preview scelte, ricerca e viewport mobile.
- `area-riservata/attivita.html` gestisce incontri, presenze e cose da fare
  per branca, piu percorsi individuali L/C ed E/G. `server/activities.cjs`
  espone `/api/activities` con sessione e perimetro di branca, anche in
  Visualizza come; salva nella tabella `activities` di `site.sqlite` con
  revisioni ottimistiche. Zero tappe completate significa Definito, alcune
  In lavorazione, tutte (non vuote) Conquistato. La stagione L/C richiede
  chiusura esplicita dopo tutte le prede; solo dopo si avviano specialita.
  I campi multiselect del Libro soci restano indipendenti e preservati.
  Le schede attivita elencano i presenti e collegano `soci.html?member=ID`;
  la scheda socio carica `/api/activities/members/ID` (solo dati di quel
  socio, perimetro di branca invariato), con link `attivita.html?event=ID`.
  `activities-model.js` condivide parsing euro e totali fra UI e server:
  denaro solo in centesimi interi, quota dovuta esplicita e versato totale
  indipendenti dalla presenza. Il residuo somma i debiti individuali senza
  compensarli con eccessi di altri soci. I vecchi client non devono cancellare
  quote e versamenti omessi dal payload. Lo storico UI e isolato in
  `member-activities.js`, con retry ed esclusione delle risposte obsolete.
  Eventi multi-giorno conservano `endDate`, `program` ordinato per giorno/ora,
  `materials` e `shopping`; ogni momento include luogo, descrizione, materiali
  strutturati (nome, quantita e unita) e, se presente, la nota testuale legacy.
  Il riepilogo raggruppa i nomi senza distinzione di maiuscole o spazi; i
  materiali riusati sommano il massimo per momento, gli altri la somma. Se una
  quantita manca, il totale resta da definire. `shopping` legacy resta conservato.
  Il form precompila una bozza Campo EG 2–5 gennaio 2027 (`?new=campo-invernale`),
  ma la persistenza avviene solo al salvataggio. Gli elenchi presenze sono
  raggruppati usando l'assegnazione `sestiglia`/`squadriglia` in `member_values`.
  La dashboard usa la stessa API: `attivita.html?event=ID&vista=presenze`
  apre il registro, `vista=quote&filtro=unpaid` apre i debitori,
  `vista=programma` il programma; `ora=1` apre il momento corrente.
  Il vecchio `presenze=1` resta compatibile. Le viste mantengono montati
  gli stessi controlli: cambiare vista o aggiornare l'orologio non resetta
  una bozza. Una sola barra Salva attivita resta raggiungibile.
  Giorni ripiegabili, momenti in timeline ordinati per ora e dettagli opzionali
  evitano il lungo modulo; ricerca soci solo oltre 12, filtri sotto un riepilogo.
  Le tappe dei percorsi sono modificabili in linea, con bozze in memoria,
  revisioni invariate e Salva percorsi; errori e filtri non le cancellano.
  La scheda socio apre lo storico cronologico e mostra il residuo vicino al nome.
  `activities-model.js` condivide selezione evento e momento corrente:
  date finali incluse, fuso Europe/Rome, solo momenti della giornata,
  ultimo orario raggiunto fino al successivo. Orari mancanti non si
  inventano. Home e scheda aggiornano il momento ogni 30 secondi e al
  focus, senza ricaricare il form o perdere presenze non salvate.
  Il tab torneo L/C persiste per riunione punteggi per persona e presentazione
  per sestiglia; `tournament-model.js` normalizza ogni categoria in percentuale
  (presenza sul roster fotografato, puntualita e giudizi sui presenti valutati,
  presentazione una volta per sestiglia) e calcola la media delle categorie
  disponibili per la classifica, non la somma grezza dei punti. La tabella
  contiene tutte le categorie e il totale, ordinabili da intestazione,
  con regione scorribile da tastiera; i giudizi si inseriscono in griglia.
  Campi,
  sincronizzazione calendari e promemoria restano futuri. La pagina account reale e
  `area-riservata/persone.html`. Per gli screenshot riproducibili usare
  `ACTIVITIES_SCREENSHOTS=/percorso/assoluto node --test tests/activities-browser.test.cjs`;
  vengono usati esclusivamente dati sintetici e un NAS temporaneo.
- Il collegamento `Carica e gestisci documenti` resta disponibile in Altro nella dashboard
  per tutti i capi, anche senza branca di servizio. L'API PDF richiede la
  sessione ma non i privilegi admin; non confonderla con i modelli interni soci.
- Libro soci: intestazioni con ciclo crescente/decrescente/nessun ordinamento,
  eta numerica e mancanti in fondo; i badge Branca usano `branchColors`.
  La board gruppi non ha frecce o form di spostamento: `Soci disponibili`
  e aperto, sticky e nascosto se vuoto, con evidenziazione letterale dei nomi.
  La maniglia e le righe supportano anche lo spostamento da tastiera.
- `DOCUMENTS_MODEL.preparatorySlots` produce le cinque posizioni
  Convocazione/Regolamento/PEG/Bilancio/Verbale per anno, indipendentemente
  dall'ordine latest della home. `assemblyType` esplicito prevale sul
  riconoscimento storico titolo/file; una posizione assente non ha link.
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
  propone la branca successiva L/C → E/G → R/S, senza modificarla subito.
  Conferma da altro capo della destinazione oppure dall'amministratore,
  anche autore della proposta. In vista come capo l'admin puo confermare
  soltanto per la destinazione effettiva; audit con actorId reale.
  La revisione della scheda deve coincidere con quella della proposta:
  altrimenti annullare/rifiutare e riproporre. PATCH del profilo non puo
  cambiare una branca gia inizializzata per aggirare il flusso.
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
- `currentYear` e il massimo anno censimento globale, non della sola branca.
  `SOCI_MODEL.longSuspended` usa sempre l'ultimo censimento: D significa gia
  sospeso da oltre un anno; S viene escluso se il suo anno e precedente a
  currentYear. La UI li omette da elenco, conteggi, export e selezione di
  default. Il filtro esplicito li include; non eliminare record dal DB.
- `GET members` per capi aggiunge `visibility:{branch,total,
  excludedPendingCoca,excludedLongSuspended}` limitato alla loro branca.
  `total` precede i filtri; sospesi conteggiati dopo FoCa/Co.Ca. per evitare
  duplicazioni. I dettagli diagnostici UI sono riservati all'admin, in un
  blocco richiudibile sotto la lista, aggregato dai soci gia disponibili.
  I capi non vedono il riepilogo tecnico; la CTA passaggi resta separata.
- L'unica azione rapida UI e `Proponi passaggio`, senza select di azione,
  campo o destinazione. Gli aggiornamenti educativi UI sono individuali.
- Anno di nascita, anno in branca, ruolo e progressione sono distinti.
  Filtrare/raggruppare per nascita senza assegnazioni automatiche.
  L/C ha ruoli di sestiglia e progressione legge/rupe/anziano; E/G ha ruoli
  di squadriglia, piede tenero, specialita e brevetti. R/S non ha questi campi.
  La migrazione del ruolo E/G converte solo la definizione testo iniziale,
  conservando le vecchie scelte gia compilate; non riscrive campi personalizzati.
- Le proposte pending visibili alla destinazione espongono solo identita
  minima e anno di nascita, non anagrafica o percorsi prima della conferma.
  Dopo l'ingresso la provenienza perde accesso alla scheda.
- I PDF generati restano una stampa locale del browser. Non usare
  `/api/documents` per pubblicare schede personali nell'archivio pubblico.

### Verifiche mirate

```sh
node --test tests/members.test.cjs tests/members-browser.test.cjs tests/members-staff-browser.test.cjs tests/people.test.cjs tests/synology.test.cjs
node tools/build-site.cjs
```

`members.test.cjs` usa dati sintetici e database temporanei: CSV ufficiale
con wrapper Excel, validazione, autorizzazione, import senza scritture in
anteprima, conflitti, rollback, storico, permessi per branca e riavvio,
conferma a due capi, rifiuto/annullamento e sospesi.
`members-browser.test.cjs` segue il pattern dei test browser esistenti:
Chromium/Chrome headless se installato, fixture con API simulate, viewport
375/1440, schede, filtri, payload, selezione, stampa e testo non eseguibile.
`members-staff-browser.test.cjs` verifica strumenti amministrativi nascosti,
campi per branca, proposta e conferma nel browser. Questi test non
sostituiscono il collaudo del container sul NAS. Per verificare l'interfaccia
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
