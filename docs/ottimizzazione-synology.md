# Synology DS1522+: installazione da zero e monitoraggio

[README](../README.md) | [Sviluppo](sviluppo.md)

## Ordine di installazione

Questa guida riguarda il branch `NAS`, non `main`. Le nuove modifiche devono
essere pubblicate su GitHub prima di installarle sul NAS. Nessun comando di
questa guida installa qualcosa sul NAS dal terminale Windows automaticamente.

1. Verificare che la linea Sky WiFi consenta HTTPS in ingresso su IP pubblico.
2. Registrare il nome gratuito `nomegruppo.synology.me` in DSM.
3. Preparare DSM, volume, pacchetti e accesso amministrativo.
4. Clonare `NAS`, creare configurazione e password amministrativa.
5. Configurare certificato HTTPS, reverse proxy DSM e port forwarding del router.
6. Creare l'attivita' DSM di deployment ed eseguire il primo avvio.
7. Collaudare accesso, PDF, diretta e monitoraggio con almeno due dispositivi.
8. Attivare aggiornamento automatico, calendari e backup.
9. Controllare periodicamente risorse, log, spazio e aggiornamenti.

La modalita' scelta e' **Synology DDNS + reverse proxy DSM**, senza acquistare
un dominio e senza Cloudflare. `nomegruppo` e' un esempio: scegliere un nome
disponibile. Il DDNS non e' un tunnel e non rende raggiungibile una linea
dietro CGNAT. QuickConnect non sostituisce questa pubblicazione del sito.

## Verifica Sky WiFi prima di aprire porte

Non si puo' stabilire dalla sola marca dell'operatore se la singola linea
disponga di IPv4 pubblico dedicato e di porte in ingresso utilizzabili.
La procedura seguente riguarda IPv4 pubblico, anche dinamico; non serve un
indirizzo statico a pagamento per il solo DDNS.

1. Aprire l'app o il pannello del proprio router Sky e cercare indirizzo WAN,
   stato connessione e funzioni di inoltro porte. Menu e funzioni dipendono
   dal modello Hub e dal firmware: non applicare istruzioni di un altro router.
2. Un indirizzo WAN in `100.64.0.0`-`100.127.255.255` indica uno spazio usato
   per NAT condiviso. Indirizzi `10.x`, `192.168.x` e `172.16.x`-`172.31.x`
   non sono IPv4 pubblici. Anche router a monte o meccanismi di condivisione
   delle porte possono impedire l'accesso diretto.
3. Confrontare, personalmente, l'IPv4 WAN con l'IPv4 visto da un servizio
   esterno. Il confronto e' un indizio, non una certificazione che la 443
   sia utilizzabile. Non e' necessario pubblicare il proprio IP in chat.
4. Se non e' chiaro, chiedere all'assistenza Sky:

> Uso Sky WiFi e devo pubblicare un sito HTTPS sul mio NAS. La mia linea ha
> un IPv4 pubblico non condiviso e consente connessioni TCP in ingresso sulla
> porta 443? Sono presenti CGNAT, MAP-T o limitazioni delle porte? Se necessario,
> e' possibile abilitare un IPv4 pubblico raggiungibile e a quali condizioni?

Non presumere che una variazione sia disponibile o gratuita: verificarlo
direttamente con Sky. La disponibilita' di IPv6 da sola non rende il sito
raggiungibile dai visitatori che hanno solo IPv4.

Se la porta non e' utilizzabile, **fermarsi prima del port forwarding**:
il DDNS puo' risultare configurato ma il sito non sara' pubblico. Serve
risolvere la raggiungibilita' con l'operatore o rivalutare la pubblicazione.
La prova conclusiva si fa dalla rete mobile, a servizio HTTPS effettivamente
avviato, non con una porta vuota e non soltanto dalla stessa Wi-Fi.

## Passo zero: pubblicare dal PC

**Se il NAS e' gia' installato e l'attivita' DSM e' attiva, non ripetere
l'installazione:** basta un commit/push su `NAS`. L'updater conserva progetto,
volume, proxy e calendari. I passaggi di preparazione seguenti servono solo
alla prima installazione.

Per gli account personali, compila `NAS_ROOT/nas.env` oppure il file facoltativo
`/volume1/docker/agesci-nas/.env` (o `NAS_ROOT/.env`, se usi una cartella diversa):

```dotenv
NAS_ADMIN_PASSWORD='SostituisciConUnaPassword1@'
NAS_CAPO_CODES=codice1,codice2
```

Sostituisci i segnaposto con i codici capo reali, separati da virgole.
`nas.env` resta la configurazione base: `.env` la integra e ne puo' sovrascrivere
i valori, senza richiedere un nuovo progetto. Le modifiche ai due file vengono
rilevate dall'updater anche quando il commit non cambia e applicate con un
riavvio del progetto esistente. Non committare questi file o le credenziali.
La password amministratore e' sempre verificata da `NAS_ADMIN_PASSWORD`,
senza salvarla o conservarne l'hash nel database. Un vecchio hash admin viene
rimosso al prossimo avvio; il vecchio `admin-password.txt` non viene piu' letto.
Compila quindi `NAS_ADMIN_PASSWORD` prima dell'aggiornamento. Per cambiarla,
modifica lo stesso valore: l'updater riavvia il progetto e applica la nuova
password. Ogni riavvio revoca le sessioni admin; quelle degli altri capi
restano valide. Il reset nell'elenco persone riguarda soltanto gli altri capi.
I codici censimento sono da 5 a 9 cifre senza spazi. Le nuove password (compresa
quella admin) richiedono 8-128 caratteri, maiuscola, minuscola, numero e
carattere speciale, come `@`; le password personali gia' impostate restano valide.
Il codice amministratore e' `23816938` e usa `NAS_ADMIN_PASSWORD`. Il precedente
codice amministratore `1238005` non ha piu' privilegi: aggiungerlo a
`NAS_CAPO_CODES` per abilitarlo come capo e impostare una password personale al
primo accesso. Se e' gia' nell'elenco persone, non va aggiunto una seconda volta.

1. In VS Code verificare che il branch selezionato sia **NAS**, non `main`.
2. Aprire **Controllo codice sorgente**, rivedere i file modificati e preparare
   solo quelli dell'implementazione NAS. Non includere password, token, file
   `.env` reali o database. Il file `nas.env.example` contiene solo esempi.
3. Creare un commit con un messaggio riconoscibile e usare **Push/Sincronizza**.
   Se l'accesso GitHub fallisce, ripristinarlo personalmente, senza condividere
   credenziali in chat. Non unire questo lavoro a `main` per installarlo sul NAS.
4. Verificare su GitHub che il branch `NAS` mostri quel commit e i file
   `server/monitor.cjs`, `deploy/synology/update.sh` e questa guida.
5. Soltanto dopo passare ai comandi sul NAS. Dopo il primo setup, i successivi
   commit pubblicati su questo stesso branch saranno rilevati dall'attivita'.

## Architettura e ambito

Questo progetto serve HTML, CSS, JavaScript, immagini, PDF e snapshot JSON.
Sul branch `NAS`, diretta, login, contenuti e PDF usano Node 24 e SQLite sul
NAS, senza Firebase o token GitHub. Nginx serve le pagine statiche e inoltra
le API al backend. Non occorre SSR. I dati iniziali del repository vengono
importati soltanto al primo avvio; i nuovi deployment non sovrascrivono
contenuti e PDF salvati dall'interfaccia. Le presenze sono temporanee.
GitHub resta la sorgente del codice; Synology DDNS e i feed calendari sono esterni.
Font e librerie di terze parti non sono stati tutti trasferiti sul NAS:
questa non e' una versione completamente offline. La roadmap seguente
riguarda ottimizzazioni ulteriori, non tutte implementate.

## Roadmap architetturale

| Priorita' | Intervento                                                                                      | Criterio di completamento                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0        | Misurare home, archivio, login e regia su mobile con rete lenta e CPU limitata                  | Registrare baseline e p75 di LCP, INP e CLS; obiettivi LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1                                                            |
| P0        | Skeleton per caricamenti reali, con spazio riservato, `aria-busy`, errore e riprova             | Nessun salto di layout; errore distinto da lista vuota; rispettare movimento ridotto                                                                      |
| P0        | Cache e deduplicazione delle letture identiche, timeout e cancellazione delle richieste esterne | Una richiesta in corso per risorsa; errore libera la richiesta per permettere un nuovo tentativo; logout invalida lo stato privato                        |
| P1        | WebP/AVIF con fallback, dimensioni esplicite e immagini responsive                              | Confronto visivo e dei byte; `loading="lazy"` solo fuori schermo, mai sull'immagine LCP                                                                   |
| P1        | Font self-hosted WOFF2, soli pesi necessari, `font-display: swap`                               | Verificare licenze, copertura dei caratteri e richieste font; niente preload di varianti inutilizzate                                                     |
| P1        | Conservare JS per pagina e differire librerie opzionali                                         | PDF e altre librerie pesanti caricate quando servono; mantenere l'ordine delle dipendenze, non applicare `async` indiscriminatamente                      |
| P1        | Debounce della ricerca e riduzione del lavoro DOM                                               | Test con molti documenti; debounce indicativo 150-250 ms; filtri e focus restano coerenti                                                                 |
| P2        | Paginazione o virtualizzazione di liste realmente lunghe                                        | Prima misurare; preservare ricerca, accessibilita', stampa e navigazione da tastiera; React e memoization dei componenti non si applicano al sito vanilla |
| P2        | Aggiornamenti ottimistici di operazioni reversibili                                             | Rollback su errore e conflitto; non dichiarare conclusi login, commit GitHub o comandi live prima della conferma                                          |
| Futuro    | Risposte IA in streaming                                                                        | Solo con backend che custodisce le credenziali, cancellazione, timeout, errori e parsing corretto dello stream; nessuna chiave nel browser                |

Per gli script DOM, evitare ricostruzioni quando lo stato e' invariato; usare
memoization solo se una misura dimostra un costo significativo e definire
esplicitamente invalidazione e durata della cache. Non deduplicare scritture
solo per URL: due aggiornamenti possono avere significati diversi.

### Backend, caching e infrastruttura futuri

Redis, BullMQ e PostgreSQL non sono inclusi nel Compose: aggiungerli ora
consumerebbe risorse senza velocizzare il sito. Per eventuali evoluzioni:

- Separare Redis per cache (`allkeys-lru`, TTL) da Redis per code BullMQ
  (`noeviction`, persistenza e backup): l'eviction puo' distruggere dati delle code.
- Limitare concorrenza dei worker, retry con backoff, durata dei job e chiamate
  esterne; rendere idempotenti i job. Non esporre Redis o PostgreSQL su Internet.
- Eseguire `SELECT` puntuali, verificare indici con `EXPLAIN ANALYZE`, usare un
  pool limitato e collocare applicazione e DB nella stessa rete/area geografica.
- Caching dei dati pubblici con TTL e invalidazione; non memorizzare risposte
  autenticate in cache condivise. Una CDN non accelera automaticamente Firebase
  o GitHub e non rende private le pagine dell'area riservata.
- Introdurre OpenTelemetry per un backend misurabile: limiti di raccolta,
  campionamento e redazione di chiavi, token, URL e dati personali. RUM richiede
  una valutazione privacy, non la registrazione di documenti o credenziali.
- Load balancing tra processi sullo stesso NAS non fornisce alta disponibilita':
  resta un singolo punto di guasto. Prima misurare saturazione e necessita'.

## Preparazione NAS

Questi passi si eseguono **sul NAS**, non su Windows. Prima pubblicare su `NAS`
i file della nuova implementazione. Non usare la preview come server pubblico.

### DSM e accesso

1. In **Pannello di controllo > Aggiornamento e ripristino**, aggiornare DSM
   a una versione che supporta Container Manager. Predisporre prima un backup.
2. In **Gestione archiviazione**, controllare stato del pool/volume e spazio.
   Le build, le immagini e le release richiedono margine: tenere almeno alcuni
   GiB liberi, preferibilmente 10 GiB o piu', e monitorarne la crescita.
3. In **Centro pacchetti**, installare **Container Manager** e, se Git non e'
   disponibile, **Git Server**. Quest'ultimo fornisce Git; non occorre ospitare
   un server Git pubblico sul NAS.
4. In **Pannello di controllo > Cartella condivisa**, creare `docker` sul volume
   scelto. Permessi di manutenzione agli amministratori, non agli utenti generici.
5. In **Pannello di controllo > Opzioni regionali > Ora**, configurare NTP.
   Orari errati compromettono certificati, sessioni e correlazione degli eventi.
6. In **Terminale e SNMP > Terminale**, abilitare SSH per la configurazione.
   Dal PC usare `ssh tuo-utente-admin@IP_LOCALE_NAS`, esclusivamente su LAN/VPN.
   Non aprire la porta SSH sul router. Acquisire personalmente i privilegi
   amministrativi necessari; se il terminale chiede una password, inserirla
   nel proprio terminale, mai in chat.
   Se l'account e' abilitato alla manutenzione amministrativa, eseguire
   personalmente `sudo -i` sul NAS per i comandi che richiedono root.
   Non usare quell'accesso per navigare o eseguire codice non verificato.
7. Verificare questi comandi sul NAS:

```sh
git --version
bash --version
docker compose version
docker compose up --help
```

Serve Compose V2 e l'opzione `--wait`. Se manca, fermarsi e aggiornare i
pacchetti: non sostituire alla cieca lo script con `docker-compose` V1.
Nel piano di backup salvare anche la configurazione DSM e le attivita' pianificate.

### Cartelle e configurazione

1. Installare Container Manager e creare la cartella condivisa `docker`.
   Verificare da SSH `git --version`, `bash --version`, `docker compose version`.
   Git puo' essere fornito da Git Server. Serve Compose V2 con `up --wait`;
   aggiornare DSM/Container Manager se la versione disponibile non lo supporta.
2. Usare `/volume1/docker/agesci-nas` come cartella stabile. Adattare il volume
   in tutti i percorsi, inclusi `nas.env` e le attivita' DSM.
3. Recuperare gli script iniziali dal branch:

```sh
mkdir -p /volume1/docker/agesci-nas
git clone --single-branch --branch NAS https://github.com/terranovamt/agesci-canicattini1.git /volume1/docker/agesci-nas/bootstrap
cp /volume1/docker/agesci-nas/bootstrap/deploy/synology/update.sh /volume1/docker/agesci-nas/update.sh
cp /volume1/docker/agesci-nas/bootstrap/deploy/synology/nas.env.example /volume1/docker/agesci-nas/nas.env
```

4. Modificare `nas.env` con l'origine pubblica reale, per esempio
   `NAS_PUBLIC_ORIGIN=https://nomegruppo.synology.me`, senza slash finale o percorso.
   Mantenere dati in `agesci-nas/data`.
   Lasciare `COMPOSE_PROFILES=` vuoto: Cloudflare non viene avviato.
   Su un'installazione gia' presente rimuovere il vecchio valore `tunnel`.
5. Compilare `NAS_ADMIN_PASSWORD` in `nas.env` con una password unica di almeno 8
   caratteri, con almeno una maiuscola, una minuscola, un numero e un carattere
   speciale, come `@` (massimo 128 caratteri). Una password
   piu' lunga resta consigliata per il sito pubblico. Non serve alcun token
   Cloudflare per DDNS. Inserirla sul NAS, mai in chat o Git.
   Usare una sola riga, testo UTF-8 senza BOM. Non mettere i valori in comandi
   `echo` condivisi o nella cronologia del terminale. Modificare i file con un
   editor locale protetto o caricarli personalmente tramite File Station.
   Se si lavora da terminale, usare un editor disponibile sul NAS, per esempio
   `vi /volume1/docker/agesci-nas/nas.env` per la configurazione. In `vi`:
   `i` per inserire, poi Esc e `:wq` per
   salvare e uscire. Non mostrare o copiare il contenuto dei secret in log/chat.
6. Proteggere cartella, configurazione e script: l'updater gestisce Docker come
   root e non deve essere modificabile da utenti non autorizzati.

Esempio di permessi POSIX da applicare con un terminale NAS gia' autorizzato:

```sh
chown root:root /volume1/docker/agesci-nas
chmod 700 /volume1/docker/agesci-nas
chmod 600 /volume1/docker/agesci-nas/nas.env /volume1/docker/agesci-nas/update.sh
```

Verificare anche le ACL DSM. La password nella configurazione e' in chiaro e
viene passata nell'ambiente del container: l'amministratore NAS/Docker puo'
leggerla. Non pubblicare l'output della configurazione Compose o di inspect.

Non servono cartelle Redis o PostgreSQL. Un volume SSD puo' ridurre latenza I/O,
non azzerarla; verificare compatibilita' SSD/M.2, versione DSM e backup prima
di spostare dati. Il DS1522+ deve comunque avere risorse per le altre funzioni NAS.

## Avvio con Container Manager

Non creare un secondo progetto manualmente: l'updater usa il nome stabile
`agesci-nas`. In **Pannello di controllo > Utilita' di pianificazione** creare
un'attivita' definita dall'utente, eseguita da **root**, con questo script:

```sh
export PATH=/usr/local/bin:/usr/bin:/bin:/var/packages/Git/target/bin:$PATH
export NAS_ROOT=/volume1/docker/agesci-nas
/bin/bash "$NAS_ROOT/update.sh"
```

Eseguirla una volta con **Esegui**, poi pianificarla **ogni giorno, ripetuta
ogni minuto**. Abilitare notifiche per uscita non riuscita e controllare i log.
In DSM selezionare tutti i giorni, l'intera giornata e l'intervallo di un minuto
se disponibile. Se la versione DSM permette soltanto intervalli piu' lunghi,
scegliere il minimo disponibile: il sito si aggiornera' con quella frequenza.
Il listener 8080 e' solo loopback sul NAS e deve essere libero; il backend
3000 non e' esposto. Il pubblico passa dal reverse proxy HTTPS di DSM.

### Primo avvio e verifica

Ogni cartella in `releases` contiene il codice di un commit distribuito o
tentato, non un backup dei dati. Dopo un deployment riuscito, l'updater conserva
soltanto la release corrente (`current-revision`) e la precedente che aveva
superato gli healthcheck (`previous-revision`). Se cambia soltanto `.env`,
la precedente release resta protetta. Un deployment fallito non avvia la pulizia.
Le installazioni vecchie senza `previous-revision` vengono ripulite al primo
deployment riuscito di un nuovo commit, quando la precedente e' identificabile.
Non vengono eliminate cartelle con nomi diversi dagli hash dei commit o link
simbolici. `data`, configurazione e repository Git restano intatti.

Le immagini app, web e calendari hanno tag distinti per commit: una build nuova
non sovrascrive l'immagine della release precedente. La pulizia rimuove anche
i soli tag app, web e calendari delle release eliminate; se un'immagine e'
ancora in uso, Docker la protegge e viene segnalata la mancata rimozione.
Non elimina cache Docker e non esegue prune globale sul NAS, che potrebbe
coinvolgere altri progetti. Conservare comunque un backup separato
dei dati persistenti: il rollback del codice non ripristina il database.

Se il sito non si aggiorna, aprire l'ultimo risultato dell'attivita' DSM:
`NAS gia' aggiornato` significa che commit e configurazione non sono cambiati,
non certifica la salute dei container. Un errore riporta la fase (fetch,
configurazione, build o avvio); un avvio fallito mostra anche lo stato dei
container e tenta il ripristino della release corrente precedente.
Controllare che il commit sia su `NAS`, l'attivita' sia abilitata e lo spazio
libero sia sufficiente. Confrontare il file `current-revision` con la release
visibile nel monitor della regia. Per la diagnosi condividere solo il log
dell'attivita', dopo aver rimosso eventuali credenziali: non condividere `.env`,
`nas.env`, `docker inspect` o l'output completo di `docker compose config`.

1. Eseguire manualmente l'attivita' e aspettare il completamento della build.
2. In Container Manager cercare il progetto/servizi `agesci-nas`: `app` e `web`
   devono essere healthy. Non e' richiesto un container `cloudflared`.
3. Dal terminale NAS controllare `curl http://127.0.0.1:8080/healthz`:
   deve rispondere con `{"ok":true}`. Non e' un test completo del dominio pubblico.
4. Aprire il dominio HTTPS da telefono su rete mobile, non soltanto dalla Wi-Fi.
5. Aprire area riservata con la password scelta, caricare un PDF di prova,
   verificarlo nell'archivio e modificare un contenuto dal setup.
6. Aprire la regia e una pagina pubblica su un secondo dispositivo; avviare la
   diretta e verificare la sincronizzazione delle slide.
7. Aprire **Server live > Apri monitor** in regia: controllare flussi reali, CPU/RAM,
   latenza, release e problemi. La prima misura CPU richiede due campioni;
   attendere almeno 5-10 secondi. I numeri del browser possono aggiornarsi
   con il heartbeat di 30 secondi.
8. Pubblicare un piccolo commit su `NAS` e verificare che cambi la release
   nella regia, ma restino il PDF e il contenuto salvati dall'interfaccia.
9. Provare un riavvio controllato: i dati persistono, gli amministratori devono
   riaccedere e il pubblico deve riconnettersi. Non farlo durante un'assemblea.

Solo dopo questi controlli aggiornare i collegamenti pubblici e dismettere il
vecchio Firebase. Non fare il primo collaudo con documenti o dati riservati.

Limiti RAM iniziali: backend 512 MiB, Nginx e tunnel 128 MiB ciascuno,
job calendari 256 MiB. Il kernel del DS1522+ verificato ha rifiutato le quote
CPU CFS (`NanoCPUs can not be set`): il Compose non imposta `cpus` o quote CFS.
Il carico CPU resta misurato, ma non limitato per container. Misurare sotto
carico: non e' un dimensionamento certificato. I servizi hanno filesystem in sola lettura, volumi espliciti e
healthcheck; aggiornare versioni delle immagini e verificare i digest.

## Pubblicazione con Synology DDNS

### Registrare il nome gratuito

1. Nel router riservare al NAS un IP LAN stabile tramite DHCP, per esempio
   `192.168.1.50` se appartiene alla propria rete. Non usare l'esempio se la
   propria LAN ha un altro intervallo.
2. In DSM aprire **Pannello di controllo > Accesso esterno > DDNS > Aggiungi**.
3. Scegliere provider **Synology**, accedere personalmente al proprio account
   Synology e registrare un nome disponibile, per esempio `nomegruppo.synology.me`.
4. Usare **Test di connessione** e salvare. Verificare stato normale e indirizzo
   esterno corretto. Il NAS aggiornera' il DDNS quando cambia l'IP della linea.
5. Impostare lo stesso nome in `NAS_PUBLIC_ORIGIN`. Non usare l'IP LAN come
   origine pubblica e non inserire credenziali Synology nella configurazione app.

### Certificato HTTPS

1. Nel wizard DDNS Synology, se disponibile, scegliere l'opzione Let's Encrypt.
   In alternativa andare in **Sicurezza > Certificato > Aggiungi > Ottieni un
   certificato da Let's Encrypt**, indicando il nome esatto e la propria e-mail.
2. Completare la convalida indicata da DSM e verificare certificato, dominio e
   scadenza. La documentazione generale Synology richiede TCP 80 per la convalida
   HTTP e il rinnovo Let's Encrypt: se il flusso usato richiede questa porta,
   predisporre anche l'inoltro TCP 80 al NAS e mantenerlo utilizzabile per i
   rinnovi, oppure adottare un metodo di convalida supportato alternativo.
   Non presumere che chiuderla dopo il primo rilascio lasci funzionante il rinnovo.
3. Assegnare il certificato al servizio di reverse proxy del sito da
   **Sicurezza > Certificato > Impostazioni/Configura**. Non cambiare senza motivo
   il certificato di tutti gli altri servizi del NAS.
4. Verificare da un browser esterno che il certificato sia valido e senza avvisi.
   Non risolvere un errore HTTPS chiedendo al pubblico di ignorarlo.

### Reverse proxy DSM

In **Pannello di controllo > Portale di accesso > Avanzate > Proxy inverso**
creare una regola, per esempio `Sito gruppo`:

| Campo                   | Valore                                                   |
| ----------------------- | -------------------------------------------------------- |
| Protocollo sorgente     | HTTPS                                                    |
| Nome host sorgente      | Il nome registrato, per esempio `nomegruppo.synology.me` |
| Porta sorgente          | 443                                                      |
| Protocollo destinazione | HTTP                                                     |
| Nome host destinazione  | `127.0.0.1`                                              |
| Porta destinazione      | 8080                                                     |

Nelle intestazioni della richiesta personalizzate impostare **X-Real-IP** a
**`$remote_addr`**. Deve sostituire l'eventuale valore del client, non aggiungersi
ad esso. Il Nginx dell'app inoltra questo indirizzo al backend per i rate limit.
Non configurare il proxy verso 3000, 5000 o 5001. Non impostare un limite di
upload inferiore a 28 MiB: un PDF di 20 MiB viene trasmesso in base64/JSON.

La diretta usa SSE, non richiede WebSocket. Configurare timeout di lettura
adeguati (almeno 90 secondi) e disabilitare il buffering delle risposte SSE
se DSM offre l'opzione. Con heartbeat ogni 15 secondi lo stream deve restare
attivo: verificarlo con due telefoni e una diretta di alcuni minuti.
Se la versione DSM non espone l'opzione necessaria e gli eventi arrivano a
blocchi, fermare il collaudo e risolvere il proxy; non modificare alla cieca
i file Nginx generati da DSM, che gli aggiornamenti possono riscrivere.

### Router Sky WiFi e firewall

1. Solo dopo aver verificato l'IP pubblico, nel proprio router configurare
   l'inoltro manuale **TCP esterna 443 -> IP LAN del NAS, TCP interna 443**.
   Il menu puo' chiamarsi inoltro porte/port forwarding; consultare le istruzioni
   del proprio modello Sky Hub. Non creare regole automatiche UPnP alla cieca.
2. Se richiesto dal metodo Let's Encrypt adottato, aggiungere TCP 80 -> NAS:80
   per la convalida. La navigazione del sito e il login devono usare HTTPS.
3. Non aprire 5000/5001 (DSM), 22 (SSH), 3000 (backend), 8080 (container),
   porte database o tutta la DMZ verso il NAS. Non attivare amministrazione
   remota del router solo per pubblicare il sito.
4. Nel firewall DSM consentire le sole porte necessarie per il sito e per
   la manutenzione dalla LAN/VPN. Le regole IPv6 sono separate da quelle IPv4:
   non lasciare altri servizi pubblici tramite IPv6 e non pubblicare un record
   AAAA se non si e' verificata quella raggiungibilita'.
5. Con Wi-Fi disattivata sul telefono aprire `https://nomegruppo.synology.me/agesci-canicattini1/`.
   Verificare anche che l'indirizzo pubblico non mostri la dashboard DSM.
   In caso contrario richiudere la pubblicazione e correggere la regola.
6. Se funziona da rete mobile ma non da casa, verificare NAT loopback/hairpin
   del router o usare DNS locale coerente; non cambiare l'origine dell'app a caso.

Il DDNS e il certificato possono essere gratuiti; restano elettricita', NAS,
backup e le eventuali condizioni dell'operatore. Non e' inclusa una CDN.
Il traffico pubblico raggiunge direttamente la connessione Sky e il reverse
proxy: servono aggiornamenti, password robusta, backup e controllo dei log.

Fonti ufficiali: [DDNS Synology](https://kb.synology.com/it-it/DSM/help/DSM/AdminCenter/connection_ddns?version=7)
e [certificati DSM](https://kb.synology.com/it-it/DSM/help/DSM/AdminCenter/connection_certificate?version=7).
Le condizioni della singola linea Sky e la configurazione reale di router/NAS
non sono state verificate da questo ambiente.

La sessione personale usa cookie HttpOnly, Secure e SameSite=Strict, dura otto ore e
non conserva la password nel browser. Il reset revoca tutte le sessioni della persona;
il pubblico riconnette lo stream. Slide e PDF sono pubblici. Il limite di upload
e' inferiore a 20 MiB. Non esporre il backend direttamente: si fida dell'IP
inoltrato da Nginx. Disattivare il vecchio Firebase solo dopo il collaudo e
il cambio dei link pubblici. Non pubblicare questo branch NAS su GitHub Pages.

## Monitoraggio in regia

Il pannello aggiorna i dati ogni cinque secondi quando la regia e' visibile.
Non contiene pulsanti di aggiornamento manuale: riprende subito anche tornando
alla scheda. **Apri monitor** amplia soltanto le risorse e le connessioni live.
Non mostra visite, conteggi giornalieri, tabelle storiche o segnalazioni passate.
La regia usa `/agesci-canicattini1/api/metrics?view=live`, che non restituisce questi dati storici.

### Statistiche e riepilogo

In `area-riservata/statistiche.html` si trovano visite, pagine viste, connessioni
live aperte nel giorno, ultimi sette giorni, pagine visitate e segnalazioni.
La dashboard dell'area riservata mostra automaticamente un riepilogo di visite,
connessioni giornaliere, flussi attuali, CPU/RAM NAS e segnalazioni.
Le tre viste sono aggiornate automaticamente e le rispettive API richiedono
sempre una sessione amministrativa: non renderle pubbliche.

I nuovi conteggi delle connessioni iniziano dall'installazione di questo
aggiornamento; non vengono ricostruiti numeri per i giorni precedenti.
Una connessione SSE aperta o riconnessa e' distinta da una visita o una persona.
Le nuove categorie distinguono slide, documenti preparatori, archivio PDF,
gestione PDF e statistiche; i vecchi dati non vengono rietichettati.

### Link delle slide e QR

- Home: `https://terranovamtt.synology.me/agesci-canicattini1/`.
- Slide per i telefoni: `https://terranovamtt.synology.me/agesci-canicattini1/area-riservata/assemblea/`.
- Regia: `https://terranovamtt.synology.me/agesci-canicattini1/area-riservata/assemblea/regia.html`.
- Proiettore: aprire **Apri schermo presentazione** dalla regia.
- Statistiche: `https://terranovamtt.synology.me/agesci-canicattini1/area-riservata/statistiche.html`.

Il percorso `assemblea/` contiene i documenti preparatori, non le slide.
Il QR fornito punta alla home `/agesci-canicattini1`, non direttamente alle slide.
La versione `assets/img/qr-live.png`, 990 x 990 pixel e 48.461 byte, conserva
moduli, colori e logo, riducendo il sorgente SVG da 594.282 byte di circa il 92%.
Il logo raster e' incorporato direttamente; nessun servizio esterno genera il QR.
La decodifica ZXing e' stata verificata a 256, 320, 640 e 990 pixel.
Lo SVG ottimizzato non superava gli stessi controlli a tutte le dimensioni.
Verificare comunque la scansione fisica dal proiettore e dal telefono.

Tutto il sito, API, PDF, calendari e cookie amministrativo usa il prefisso
`/agesci-canicattini1/`. `NAS_PUBLIC_ORIGIN` resta solo l'origine HTTPS,
senza percorso. `/index.html` alla radice e' riservato al futuro portfolio:
questa immagine Nginx non lo pubblica e restituisce 404. La configurazione DSM
del dominio non cambia. Per aggiungere il portfolio occorrera' una sua
configurazione di pubblicazione; non viene creato da questo progetto.
Gli URL AGESCI precedenti senza prefisso non sono piu' validi. Il database e
i PDF persistenti non vengono spostati, cancellati o importati nuovamente.
`/healthz` rimane disponibile per i controlli interni dei container.

| Indicatore                | Significato e limite                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visite oggi               | Sessioni browser osservate; nuova visita dopo 30 minuti di inattivita'. Una persona puo' generare piu' visite                                                      |
| Pagine                    | Caricamenti delle pagine monitorate, con deduplicazione dei retry                                                                                                 |
| Persone collegate ora     | Browser/dispositivi distinti con almeno una scheda aperta (heartbeat negli ultimi 150 secondi): tre schede sullo stesso PC contano una persona. Campione al minuto nel grafico orario |
| Persone uniche oggi       | Browser/dispositivi distinti che hanno aperto il sito o la diretta nella giornata; conteggio attivo dal deploy che lo ha introdotto                                |
| Schede aperte             | Schede del sito aperte, anche in background, con heartbeat negli ultimi 150 secondi; escono subito alla chiusura                                                   |
| Schede in primo piano     | Parte delle schede aperte visibile sullo schermo negli ultimi 90 secondi                                                                                          |
| Flussi SSE reali          | Connessioni streaming attualmente aperte sul backend; limite globale 500                                                                                          |
| Dispositivi presentazione | Heartbeat della presentazione/regia negli ultimi 60 secondi, distinto dal traffico generale                                                                       |
| CPU backend / un core     | CPU usata dal processo Node nel campione; 100% equivale a un core. Non e' la CPU totale del NAS                                                                   |
| RAM processo              | RSS reale del processo Node; distinta dal heap JavaScript e dalla memoria cgroup                                                                                  |
| RAM container             | Utilizzo e limite letto dai cgroup quando disponibili; non include tutti gli altri container                                                                      |
| CPU/RAM intero NAS        | Lettura dei soli `/proc/stat` e `/proc/meminfo` montati readonly; include gli altri carichi NAS                                                                   |
| Risposta API p95          | 95esimo percentile delle risposte API osservate negli ultimi cinque minuti, con campione limitato; non include il tempo dell'intera pagina o la rete del telefono |
| Ping scheda               | Tempo osservato dal browser per la richiesta diagnostica; include rete e proxy, aggiornamento ogni circa 30 secondi                                               |
| Event loop                | Ritardo p95 nel processo Node; valore elevato puo' indicare lavoro bloccante                                                                                      |
| Volume dati / database    | Spazio disponibile del filesystem e dimensione database/WAL, non una misura delle prestazioni I/O                                                                 |
| Segnalazioni              | Categorie di errori browser/server, non errori unici: lo stesso problema puo' produrre piu' segnalazioni                                                          |

Nella pagina statistiche sono disponibili totale storico, ultimi sette giorni e pagine viste oggi.
La dettagliazione giornaliera viene conservata circa 30 giorni; i totali restano.
Gli eventi conservano al massimo 500 voci delle ultime 24 ore e il pannello
mostra le ultime 20. Le righe di scheda sono anonime, senza nome, IP, URL con
parametri o stack trace; non permettono di identificare una persona specifica.

Ad blocker, JavaScript disabilitato, bot e reti interrotte possono alterare
i conteggi osservati. iPhone e iPad sospendono le pagine con schermo spento o
Safari in background, e i browser possono congelare le schede inattive: queste
schede escono dalle schede aperte dopo 150 secondi e rientrano appena
tornano visibili. Le riconnessioni non dimostrano da sole
un guasto del NAS. Se un telefono non raggiunge il server, puo' non riuscire
neppure a inviare la segnalazione. Un valore `-` significa non disponibile,
non zero utilizzo. Quando il pannello perde la connessione, svuota i valori
live e segnala l'errore, invece di presentarli come aggiornati.

### Privacy e opzioni di raccolta

Il browser usa un identificativo casuale condiviso tra schede, rinnovato dopo
30 minuti di inattivita', e uno separato per caricamento pagina. Per contare le
persone invia anche l'identificativo casuale anonimo gia' usato dalla diretta,
salvato nel browser. Il server memorizza solo hash per deduplicare visite e
persone; niente fingerprint, nomi o IP nei report. Svuotando i dati del sito o
cambiando browser si risulta una persona nuova. Non vengono raccolti messaggi grezzi di errore, password,
token, query string o contenuti dei documenti. I log tecnici non sono report
di visite e devono essere protetti; gli error log possono comunque contenere
dettagli operativi da rimuovere prima di condividerli.

Prima della raccolta pubblica predisporre informativa e valutare base giuridica
ed eventuale consenso con il responsabile privacy. Non e' una certificazione
di conformita'. Per non raccogliere visite o errori browser impostare:

```dotenv
NAS_TELEMETRY_ENABLED=false
```

Il monitor di risorse/API e i flussi reali restano attivi per l'amministratore.
Pubblicare un nuovo commit per ricreare i servizi con la configurazione nuova,
oppure usare i comandi di manutenzione descritti sotto. Disattivare la raccolta
non cancella automaticamente lo storico; l'eventuale rimozione va gestita con
un backup e manutenzione del database, non cancellando l'intero sito.

## Opzioni

### Configurazione disponibile

| Campo di `nas.env`                 | Scelta                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `NAS_PUBLIC_ORIGIN`                | Origine HTTPS esatta, obbligatoria, senza percorso/slash finale         |
| `COMPOSE_PROFILES=`                | Predefinito DDNS Synology: reverse proxy DSM, certificato e IP pubblico |
| `COMPOSE_PROFILES=tunnel`          | Profilo alternativo conservato, non usato dal percorso DDNS             |
| `NAS_DATA_DIR`                     | Percorso assoluto dei dati persistenti sul volume scelto                |
| `NAS_ADMIN_PASSWORD`               | Password admin obbligatoria da `nas.env` o `.env`; sempre verificata dalla configurazione, nessun hash persistito |
| `NAS_CAPO_CODES`                   | Codici censimento capo abilitati, separati da virgole; `23816938` e' sempre admin |
| `NAS_TUNNEL_TOKEN_FILE`            | Solo per il profilo alternativo; non serve con DDNS                     |
| `NAS_TELEMETRY_ENABLED=true/false` | Visite, schede e segnalazioni browser                                   |
| `NAS_HOST_PROC=/host/proc`         | CPU/RAM dell'intero NAS tramite i due file readonly                     |
| `NAS_HOST_PROC=`                   | Non leggere metriche host: restano backend/container                    |

Non fissare `NAS_RELEASE_REVISION` manualmente: viene fornita dall'updater.
Per impedire anche il mount dei due file host, rimuovere le due righe relative
a `/proc/stat` e `/proc/meminfo` dal Compose nel branch `NAS`, mantenendo la
raccolta host disabilitata. Non usare `privileged`, rete host o Docker socket
per fornire metriche al backend pubblico.

### Solo LAN/VPN, senza Cloudflare

1. Impostare `COMPOSE_PROFILES=` e un'origine HTTPS raggiungibile dai dispositivi.
2. Configurare il DNS locale/VPN affinche' quell'hostname risolva all'IP NAS.
3. In **Portale di accesso > Avanzate > Proxy inverso** di DSM creare una regola:
   sorgente HTTPS, hostname scelto, porta 443; destinazione HTTP,
   `127.0.0.1`, porta 8080. Non usare come destinazione la porta del backend.
4. In **Sicurezza > Certificato**, assegnare alla regola un certificato valido
   per l'hostname. Se si usa una CA locale, tutti i telefoni devono fidarsi
   di quella CA; non ignorare semplicemente gli avvisi del browser.
5. Lasciare 443 disponibile solo in LAN/VPN e non aprire porte sul router.
6. Eseguire l'updater e i test di login/diretta da un dispositivo della LAN/VPN.

Il cookie amministrativo richiede HTTPS anche in LAN. Nginx Proxy Manager non
e' necessario; aggiungerlo solo per esigenze separate e senza esporne la dashboard.
Passando da tunnel a LAN, fermare manualmente il vecchio servizio `cloudflared`:
disattivare un profilo non garantisce la rimozione di container gia' avviati.
Lo stesso vale passando da tunnel a DDNS pubblico. Se non hai mai installato
il tunnel, non c'e' nulla da fermare. Il profilo alternativo resta nei sorgenti,
ma non e' parte della configurazione DDNS: l'inoltro IP attuale si aspetta
`X-Real-IP` sovrascritto dal reverse proxy DSM. Prima di scegliere un altro
proxy va verificata nuovamente anche quella catena di fiducia.

### Risorse, volume e monitor esterno

- Per modificare RAM aggiornare `mem_limit` e il limite heap Node nel Compose
  del branch `NAS`, poi pubblicare il commit. Non alzare solo il heap oltre il
  limite del container: lasciare margine per RSS e SQLite. Non aggiungere quote
  CPU senza aver verificato il supporto CFS del kernel: possono impedire l'avvio.
- Per cambiare volume fermare deployment e servizi, fare un backup consistente,
  copiare dati e secret con i permessi corretti e aggiornare tutti i percorsi.
  Non avviare su un percorso vuoto aspettandosi che contenga i dati precedenti.
- **Monitor risorse DSM** mostra CPU, RAM, rete e disco dell'intero NAS.
  **Container Manager** mostra anche carico e log dei singoli container.
  Questi strumenti completano la regia: il pannello non raccoglie SMART,
  temperatura dei dischi o ogni metrica di Nginx/Cloudflared.
- Per storici avanzati/alert esterni si puo' valutare Prometheus/Grafana o un
  servizio RUM separato, con autenticazione e una nuova valutazione privacy.
  Non sono installati da questo Compose e non serve aggiungerli al primo avvio.

## Problemi e controlli

| Sintomo                                   | Controllo e azione                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Un solo telefono lento, API e CPU normali | Confrontare ping della scheda, Wi-Fi/mobile, browser, risparmio energetico e orario della segnalazione              |
| Tutti i telefoni lenti, CPU backend alta  | Controllare event loop, CPU quota e job contemporanei; sospendere build/manutenzione durante la diretta             |
| NAS carico ma backend poco occupato       | Cercare backup, indicizzazione, altri container e carico disco in DSM                                               |
| RAM vicina al limite, riavvii             | Controllare OOMKilled e log del container; ridurre carico o assegnare memoria adeguata                              |
| HTTP 401 nel monitor o nei salvataggi     | Sessione scaduta o backend riavviato: accedere di nuovo                                                             |
| HTTP 403 nelle scritture                  | Verificare origine HTTPS esatta, hostname e DNS; non disabilitare il controllo origine                              |
| HTTP 409                                  | Modifiche concorrenti: ricaricare il contenuto prima di salvare                                                     |
| HTTP 429                                  | Rate limit: controllare traffico condiviso e richieste anomale; non aumentare limiti senza misurare                 |
| HTTP 502/503                              | Controllare healthcheck app/web, tunnel e spazio; il backend puo' essere fermo o al limite                          |
| Diretta che riconnette con CPU normale    | Verificare rete del telefono, tunnel, proxy buffering e disconnessioni; non dedurre automaticamente un problema CPU |
| CPU/RAM NAS mostrate come `-`             | Verificare `NAS_HOST_PROC`, mount readonly e disponibilita' dei file; su Windows non sono metriche NAS              |
| Conteggio schede diverso dai flussi live  | Schede nascoste, iframe, connessioni streaming e scadenze diverse: sono indicatori distinti                         |
| Calendario grigio/non aggiornato          | Controllare ultima attivita' DSM, log del job e disponibilita' feed; non cancellare lo snapshot                     |
| Commit non distribuito                    | Controllare push su `NAS`, attivita' abilitata, Git, DNS, lock, spazio e log build                                  |
| PDF/titoli tornati ai valori iniziali     | Il database/volume e' cambiato o vuoto: fermare servizi e verificare `NAS_DATA_DIR` e backup                        |

Chiedere a chi ha problemi pagina, orario e tipo di rete/browser, non password.
Per dettagli JavaScript serve la console di quel browser: la regia non raccoglie
stack trace grezzi. Nessun pannello puo' conoscere con certezza ogni causa remota.

Per manutenzione da terminale NAS, definire una funzione locale:

```sh
export NAS_ROOT=/volume1/docker/agesci-nas
REVISION=$(cat "$NAS_ROOT/current-revision")
export NAS_RELEASE_REVISION="$REVISION"
compose() {
  docker compose --project-name agesci-nas --env-file "$NAS_ROOT/nas.env" \
   -f "$NAS_ROOT/releases/$REVISION/deploy/synology/compose.yaml" "$@"
}
compose ps
compose logs --tail=100 app web
APP=$(compose ps -q app)
docker stats --no-stream "$APP"
docker inspect --format '{{.State.OOMKilled}}' "$APP"
```

I log del tunnel si consultano con `compose logs --tail=100 cloudflared` solo
se attivo. Non pubblicare `docker inspect` completo o l'intera configurazione:
possono contenere valori operativi sensibili. I log Nginx di accesso includono
solo metodo, percorso senza query, stato e durata, non sono visite uniche.
Gli error log vanno comunque controllati e redatti prima di condividerli.

## Backup e ripristino

1. Creare una destinazione di backup distinta dal volume del sito, per esempio
   USB o altro NAS; valutare Hyper Backup e cifratura della destinazione.
2. Con la funzione `compose` precedente creare una copia consistente SQLite:

```sh
compose exec -T app node -e "const fs=require('node:fs');const {DatabaseSync,backup}=require('node:sqlite');fs.mkdirSync('/data/backups',{recursive:true});const db=new DatabaseSync('/data/site.sqlite');backup(db,'/data/backups/site-'+Date.now()+'.sqlite').finally(()=>db.close()).catch(e=>{console.error(e.message);process.exitCode=1})"
```

3. Salvare quella copia, `data/calendars`, `nas.env` e secret protetti/cifrati
   sulla destinazione esterna. Il database contiene anche i PDF: non basta
   copiare quelli iniziali dal repository. Non copiare soltanto il database
   attivo mentre SQLite usa WAL.
4. Pianificare il backup, applicare una politica di conservazione e controllare
   spazio/esito. Non lasciare accumulare copie e release senza limiti.
5. Per ripristinare, disabilitare temporaneamente le attivita' di aggiornamento
   e calendario, fermare `app`, conservare una copia dell'attuale cartella dati
   e sostituire il database con una copia verificata. Non lasciare il vecchio
   WAL/SHM accanto a un database ripristinato: conservarli separatamente con la
   vecchia copia, a servizi fermi. Ripristinare calendari e permessi.
6. Riavviare il progetto con `compose up -d --wait --force-recreate`, verificare
   login, PDF, contenuti e diretta e solo allora riabilitare le attivita'.

Il rollback del codice non e' il ripristino dei dati. Eseguire una prova di
ripristino prima dell'uso pubblico; un backup mai verificato non e' una garanzia.

## Calendari ogni ora

Dopo il primo avvio creare una seconda attivita' DSM, eseguita da root e
ripetuta ogni ora (per esempio al minuto 17), con questo script:

```sh
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
export NAS_ROOT=/volume1/docker/agesci-nas
/bin/bash "$NAS_ROOT/sync-calendars.sh"
```

Eseguirla una volta manualmente. Il job usa la release corrente, i suoi feed,
un timeout di dieci minuti e uno snapshot persistente. Un errore di feed
conserva i dati precedenti e segnala il problema. Non servono GitHub Actions
o commit dello snapshot. Non lanciare copie sovrapposte manualmente.

## Compressione e cache

Nginx abilita **Gzip**, con `Vary: Accept-Encoding`. Brotli non e' disponibile
automaticamente in tutte le immagini Nginx/Nginx Proxy Manager: aggiungere
`brotli on` senza il modulo impedisce l'avvio. Cloudflare puo' negoziare la
compressione al bordo secondo piano e impostazioni; verificarla via HTTPS,
non dichiararla attiva solo perche' il tunnel funziona.

- Le API e i dati del backend usano `no-store`. HTML e manifest statici usano
  `no-cache`, cioe' rivalidazione prima del riuso.
- CSS, JS restanti, immagini e font: cache pubblica di un'ora, con rivalidazione
  alla scadenza. Non sono file con hash: niente `immutable` di un anno.
- Le risposte 404 non diventano la home: non e' una SPA. Sul NAS mostrano la
  pagina grafica `404.html` e mantengono lo status HTTP 404. La build la include
  e Nginx la serve solo per URL inesistenti sotto `/agesci-canicattini1/`.
  Sono supportati directory, redirect esistenti e URL HTML senza estensione,
  come `/setup`.
  Gli HTML di redirect nella root, le vecchie cartelle e i manifest di
  compatibilita' sono stati rimossi: Nginx mantiene i vecchi ingressi con
  redirect 308. Su GitHub Pages e nella preview usare invece
  direttamente le pagine nelle sottocartelle.

Non attivare una regola Cloudflare "Cache Everything" sull'intero sito.
Configurare il rispetto degli header dell'origine e il bypass per contenuti
aggiornabili; verificare `CF-Cache-Status`. La CDN non mette automaticamente
in cache tutte le pagine o tutti i JSON. Per cache lunga introdurre prima
nomi con hash e aggiornare tutti i riferimenti nella build.

```sh
curl -I http://127.0.0.1:8080/agesci-canicattini1/config/site.js
curl -I http://127.0.0.1:8080/agesci-canicattini1/area-riservata/assemblea/dati.js
curl -I http://127.0.0.1:8080/agesci-canicattini1/calendars/events.json
curl -I http://127.0.0.1:8080/agesci-canicattini1/assets/css/home.css
curl -I -H 'Accept-Encoding: gzip' http://127.0.0.1:8080/agesci-canicattini1/assets/css/home.css
```

Controllare `Cache-Control: no-store` per i dati, cache di 3600 secondi
per CSS e `Content-Encoding: gzip` quando la risorsa supera la soglia.
Ripetere sul dominio pubblico; verificare 404, MIME e navigazione sul telefono.

## Aggiornamenti e rollback

L'updater controlla solo `refs/heads/NAS`, mai `main`. Una nuova versione viene
estratta separatamente, costruita e avviata con `up --wait`. Solo dopo gli
healthcheck registra `current-revision`. Un errore di avvio tenta il ripristino
del codice precedente. I launcher stabili vengono aggiornati dalla release
riuscita. Un lock limita le sovrapposizioni e recupera un PID non piu' attivo.

La latenza e' fino a circa un minuto di controllo, piu' build e avvio. Piu'
commit tra due controlli producono il deployment dell'ultimo, non di ogni
versione intermedia. Puo' esserci una breve interruzione. Il controllo del
tunnel non certifica che il dominio esterno sia configurato correttamente.

```text
/volume1/docker/agesci-nas/
  nas.env, update.sh, sync-calendars.sh  Configurazione e attivita' stabili
  secrets/                            Password e token, mai nel repository
  repository.git/                     Copia Git bare del branch NAS
  releases/<commit>/                  Versioni del codice
  current-revision                     Ultima release riuscita
  data/site.sqlite                    Contenuti, PDF e stato persistenti
  data/calendars/                      Snapshot calendario persistente
```

Le modifiche da setup e gestione documenti non generano commit: salvano subito
in SQLite. Nuovi commit aggiornano codice, pagine e asset, **non sovrascrivono
contenuti o PDF gia' salvati sul NAS**, neppure se cambiano i dati iniziali nel
repository. Limitare chi puo' scrivere su `NAS`: il suo codice viene eseguito
sul NAS. Non modificare i launcher generati; tenere la configurazione in `nas.env`.

SQLite usa WAL: non copiare solo `site.sqlite` mentre e' aperto. Predisporre un
backup consistente tramite l'API backup di SQLite, oppure arrestare il backend
prima di copiare la cartella dati. Conservare backup, calendari e secret protetti
su una destinazione distinta e verificare il ripristino. Non aggiungerli a Git.
Il rollback ripristina **solo il codice**, non il database: future migrazioni
distruttive richiederanno un piano dedicato. Per tornare stabilmente indietro
pubblicare un commit di revert su `NAS`, altrimenti l'updater riproporra' l'ultimo.
Conservare almeno release corrente e precedente; controllare lo spazio delle
release, delle immagini e dei backup. Non cancellare `data/` per aggiornare.
Ruotare immediatamente secret esposti e riavviare i servizi interessati.

## Verifiche locali

Per provare le vere API e il monitor senza Docker, con un database temporaneo:

```sh
node tools/nas-dev.cjs
```

Il comando stampa un URL casuale su `127.0.0.1` e una password di solo test.
Aprire l'URL seguito da `/area-riservata/assemblea/regia.html`. Nessun dato del
NAS viene modificato; il database temporaneo viene rimosso all'arresto normale.
Se il processo viene terminato forzatamente, possono restare file temporanei.
Non pubblicare questo server locale o usare la sua password sul NAS.
In Windows CPU/RAM dell'intero NAS restano non disponibili: serve il collaudo
dei mount Linux reali. La preview tradizionale resta una simulazione separata.

Con Node 24 (Node 22 nei test segnala SQLite come sperimentale):

```sh
node --test tests/nas-server.test.cjs tests/nas-monitor.test.cjs tests/nas-telemetry.test.cjs tests/nas-panel.test.cjs tests/nas-update.test.cjs tests/synology.test.cjs
docker compose --env-file deploy/synology/nas.env.example -f deploy/synology/compose.yaml --profile maintenance config --quiet
docker compose --env-file deploy/synology/nas.env.example -f deploy/synology/compose.yaml --profile maintenance build app web calendar-sync
```

I test Node eseguono il backend via HTTP con dati temporanei e verificano
persistenza, sessioni, conflitti e SSE. I test di configurazione non eseguono
Docker, il deployment o il rollback reale sul NAS.
La build, gli header HTTP effettivi, i permessi del secret, il tunnel e le
misure RUM devono essere collaudati nell'ambiente di destinazione.
