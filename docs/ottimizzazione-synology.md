# Ottimizzazione e deployment Synology DS1522+

[README](../README.md) | [Sviluppo](sviluppo.md) | [Firebase](firebase.md)

## Architettura e ambito

Questo progetto serve HTML, CSS, JavaScript, immagini, PDF e snapshot JSON.
La diretta usa Firebase; i salvataggi usano le API GitHub. Non esistono un
backend Node/Next, un database SQL o risposte IA. Le pagine sono gia' statiche:
non occorre introdurre SSR o un framework SSG per pubblicarle.

Il deployment aggiunto in `deploy/synology/` e' alternativo a GitHub Pages,
non lo sostituisce automaticamente. Implementa Gzip, cache browser prudente,
limiti di risorse, healthcheck e un tunnel opzionale. Le ottimizzazioni nella
roadmap seguente sono proposte, non funzionalita' gia' implementate.

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
consumerebbe risorse senza velocizzare il sito. Se viene introdotto un backend:

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

1. Installare Container Manager e creare la cartella condivisa `docker` in DSM.
2. Copiare o clonare l'intero repository in `/volume1/docker/agesci-canicattini1`
   (adattare `volume1` al volume reale). Conservare maiuscole/minuscole dei percorsi.
3. Il Compose e' in `deploy/synology/compose.yaml`; il contesto di build `../..`
   deve restare la radice del repository. Non copiare soltanto il Compose.
4. Non usare `tools/preview.cjs` come server pubblico: simula accesso e servizi.

Non servono cartelle Redis o PostgreSQL. Un volume SSD puo' ridurre latenza I/O,
non azzerarla; verificare compatibilita' SSD/M.2, versione DSM e backup prima
di spostare dati. Il DS1522+ deve comunque avere risorse per le altre funzioni NAS.

## Avvio con Container Manager

Nella sezione Progetto creare `agesci-site`, con percorso
`/volume1/docker/agesci-canicattini1/deploy/synology`, usando il file Compose
esistente. Se la versione DSM non accetta `compose.yaml`, selezionarlo nella
procedura oppure usare i comandi seguenti via SSH dal repository:

```sh
docker compose -f deploy/synology/compose.yaml config --quiet
docker compose -f deploy/synology/compose.yaml up -d --build web
docker compose -f deploy/synology/compose.yaml ps
curl -I http://127.0.0.1:8080/
```

Il listener e' solo loopback sul NAS, non sul PC. La porta 8080 deve essere
libera. Per una prova dal PC via SSH: `ssh -L 8080:127.0.0.1:8080 utente@IP_NAS`,
poi aprire `http://127.0.0.1:8080`. Evitare di aprire porte sul router.

Ogni container ha 128 MiB e 0,5 CPU come limiti iniziali, filesystem in sola
lettura e log ruotati. Verificare consumi e stato healthcheck sotto carico;
questi valori non sono un dimensionamento certificato. Aggiornare periodicamente
i tag delle immagini a versioni verificate; per build riproducibili fissare anche
i digest. La build e il collaudo effettivi richiedono Docker in esecuzione.

## Pubblicazione con Cloudflare Tunnel

Un tunnel nominato richiede un account e, per un hostname pubblico stabile,
normalmente un dominio gestito su Cloudflare. Il servizio puo' rientrare nel
piano gratuito, ma dominio, NAS, elettricita' e disponibilita' non sono gratis.
I Quick Tunnel temporanei `trycloudflare.com` non sono una soluzione di
produzione. Verificare limiti e condizioni correnti del piano.

1. In Cloudflare Zero Trust creare un tunnel di tipo Cloudflared.
2. Salvare **solo il token**, localmente sul NAS, in
   `deploy/synology/tunnel-token.txt`. Non inserirlo nel Compose, nei comandi,
   nel repository o nei messaggi. Il file e' escluso da Git e dal contesto Docker.
3. Proteggere il file con le ACL DSM; assicurarsi che il processo non root del
   container possa leggerlo. I secrets Compose locali sono file montati, non
   un vault cifrato. Chi ha accesso amministrativo al NAS puo' leggerli.
4. Avviare il profilo tunnel via SSH (oppure configurare il profilo nella UI
   se la versione Container Manager lo supporta):

```sh
docker compose -f deploy/synology/compose.yaml --profile tunnel up -d --build
docker compose -f deploy/synology/compose.yaml --profile tunnel ps
```

5. Configurare l'hostname, per esempio `gruppo.example.org`, con servizio
   `http://web:8080`: Cloudflared raggiunge Nginx nella rete Compose, non
   `localhost` del proprio container. TLS e' terminato da Cloudflare;
   questo collegamento HTTP interno non equivale a TLS fino all'origine.
6. Verificare HTTPS, home, `/setup`, archivio, PDF, login e diretta da una rete
   esterna. La sincronizzazione Firebase resta esterna al NAS.

Cloudflared usa connessioni in uscita: non occorrono IP statico o port forwarding;
il firewall deve consentire le connessioni richieste dal servizio. Non esporre
la dashboard DSM. Nginx Proxy Manager non e' necessario per questo percorso:
aggiungerlo solo se serve a gestire altri host, con dashboard limitata a LAN/VPN.

Il cambio hostname cambia anche l'origine di `sessionStorage`: rifare il login
e verificare eventuali vincoli di dominio dei servizi. I documenti e il codice
restano pubblici. La chiave condivisa non e' un controllo di accesso ai file
statici: protezioni aggiuntive richiedono un progetto di autenticazione dedicato.

## Compressione e cache

Nginx abilita **Gzip**, con `Vary: Accept-Encoding`. Brotli non e' disponibile
automaticamente in tutte le immagini Nginx/Nginx Proxy Manager: aggiungere
`brotli on` senza il modulo impedisce l'avvio. Cloudflare puo' negoziare la
compressione al bordo secondo piano e impostazioni; verificarla via HTTPS,
non dichiararla attiva solo perche' il tunnel funziona.

- HTML, JSON, manifest, PDF, `config/site.js` e tutti i `dati.js`: `no-cache`,
  cioe' rivalidazione prima del riuso, non divieto assoluto di memorizzazione.
- CSS, JS restanti, immagini e font: cache pubblica di un'ora, con rivalidazione
  alla scadenza. Non sono file con hash: niente `immutable` di un anno.
- Le risposte 404 non diventano la home: non e' una SPA. Sono supportati
  directory, redirect esistenti e URL HTML senza estensione, come `/setup`.
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
curl -I http://127.0.0.1:8080/config/site.js
curl -I http://127.0.0.1:8080/area-riservata/assemblea/dati.js
curl -I http://127.0.0.1:8080/calendars/events.json
curl -I http://127.0.0.1:8080/assets/css/home.css
curl -I -H 'Accept-Encoding: gzip' http://127.0.0.1:8080/assets/css/home.css
```

Controllare rispettivamente `Cache-Control: no-cache`, cache di 3600 secondi
per CSS e `Content-Encoding: gzip` quando la risorsa supera la soglia.
Ripetere sul dominio pubblico; verificare 404, MIME e navigazione sul telefono.

## Aggiornamenti e rollback

I commit dal setup e dalla gestione PDF continuano a essere pubblicati su GitHub,
**non sul NAS**. Anche lo snapshot calendario e' aggiornato da GitHub Actions.
Per renderli visibili sul NAS occorre aggiornare la copia locale del repository
e ricostruire l'immagine. Nessun auto-deploy NAS e' incluso:

```sh
git pull --ff-only
docker compose -f deploy/synology/compose.yaml --profile tunnel up -d --build
```

Usare `--profile tunnel` solo se configurato. Prima di aggiornare salvare commit
e identificativo dell'immagine precedente, verificare che non ci siano modifiche
locali e predisporre un backup. Per rollback distribuire il commit precedente
da una copia separata, senza cancellare modifiche locali o il file token.
Rispettare la finestra di cache degli asset; se necessario invalidare la cache
CDN dopo il deployment. Ruotare immediatamente un token esposto.

## Verifiche locali

Con Node 22 o successivo:

```sh
node --test tests/synology.test.cjs tests/site-structure.test.cjs
docker compose -f deploy/synology/compose.yaml config --quiet
docker compose -f deploy/synology/compose.yaml build web
```

I test Node verificano i vincoli dei file, non eseguono Nginx o Cloudflared.
La build, gli header HTTP effettivi, i permessi del secret, il tunnel e le
misure RUM devono essere collaudati nell'ambiente di destinazione.
