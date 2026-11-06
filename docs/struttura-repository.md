# Gerarchia del sito e del repository

[README](../README.md) · [Sviluppo](sviluppo.md) · [Contenuti](contenuti.md)

Il primo livello separa **sezioni del sito**, **risorse e dati** e **strumenti
di manutenzione**. Dentro una sezione si separano pagine, logica comune e
componenti specifici. Non occorre un framework o una compilazione: GitHub
Pages continua a pubblicare direttamente dalla radice di `main`.

## Albero e responsabilità

```text
/
├── index.html                      Home pubblica, unico HTML alla radice
├── manifest.webmanifest            Installazione della home
├── area-riservata/                 Accesso e gestione del sito
│   ├── index.html                 Login e dashboard
│   ├── documenti.html             Gestione e pubblicazione dei PDF
│   └── assemblea/                 Strumenti e applicazione assemblea
│       ├── index.html             Presentazione per pubblico e proiettore
│       ├── regia.html             Dashboard della diretta
│       ├── setup.html             Editor dei contenuti e nuovo anno
│       ├── guida.html             Guida illustrata
│       ├── dati.js                Contenuti modificabili dal setup
│       ├── manifest.webmanifest   Installazione della presentazione
│       ├── core/                  Motore, live, PDF, regia, setup e stili
│       └── slides/                Componenti dei singoli tipi di slide
│           ├── landscape/         Renderer e CSS orizzontali
│           └── portrait/          Renderer e CSS verticali
├── assemblea/                     Sezione pubblica dell'assemblea
│   └── index.html                 Quattro schede dei documenti preparatori
├── documenti/                     Archivio pubblico di tutti i documenti
│   └── index.html                 Ricerca per anno e testo
├── peg/                           Progetto Educativo di Gruppo
│   ├── index.html                 Ingresso che rimanda all'edizione corrente
│   └── edizioni/
│       └── 2026-2028.html          Testo dell'edizione, con URL stabile nel tempo
├── assets/                        Risorse condivise dal sito
│   ├── css/                       Tema, home, PEG e gestione documenti
│   ├── js/                        Logica delle pagine, calendari e documenti
│   │   └── shared/                Accesso e stato assemblea usati da più sezioni
│   ├── img/                       Loghi, icone, QR, texture e foto di gruppo
│   ├── peg/                       Fotografie del progetto educativo
│   └── fonts/                     Font locali e relative licenze
├── config/
│   └── site.js                    Firebase e destinazione dei salvataggi GitHub
├── calendars/                     Dati pubblici dei calendari
│   ├── sources.json               Feed da sincronizzare
│   └── events.json                Snapshot letto dal browser
├── documents/                     Biblioteca pubblica
│   ├── index.json                 Metadati dei documenti
│   └── pdf/                       PDF pubblicati
├── firebase/
│   └── database.rules.json        Regole da configurare nella console Firebase
├── deploy/
│   └── synology/                  Container e configurazione Nginx per il NAS
├── docs/                          Documentazione tecnica e operativa, audit
├── design-system/                 Specifiche visive, non codice runtime
├── tests/                         Test automatici Node e Python
├── tools/                         Preview locale e sincronizzatore dei calendari
├── .github/
│   ├── workflows/                 Automazioni GitHub Actions
│   └── prompts/                   Istruzioni, cataloghi e strumenti degli agenti
├── README.md                      Ingresso per chi lavora al repository
└── .gitignore, .dockerignore, .nojekyll  Configurazione Git, build e sito statico
```

Le cartelle obsolete e gli HTML di compatibilita' sono stati rimossi.
`assemblea/` contiene soltanto la pagina dei documenti preparatori;
il PEG esiste soltanto in `peg/`, con il nome minuscolo anche su Windows.
I manifest restano alla radice e nella presentazione che li utilizza.
Soltanto sul NAS Nginx mantiene i vecchi indirizzi con redirect HTTP.
GitHub Pages e la preview non applicano queste regole: usare i percorsi
canonici nelle sottocartelle.

## Come leggere la gerarchia

**Le pagine sono organizzate per funzione**, non tutte alla radice.
`assemblea/` raccoglie i documenti preparatori pubblici, senza login e senza
chiamate Firebase; `peg/` conserva i progetti educativi pubblici per edizione.
`documenti/` è l'archivio pubblico con filtro per anno e ricerca testuale.
La home mostra solo i quattro documenti più recenti per data di pubblicazione.
`area-riservata/` raccoglie login e gestione del sito, con setup, regia e
applicazione delle slide nella sottosezione `area-riservata/assemblea/`.
Il nome `index.html` identifica l'ingresso
di ciascuna sezione, accessibile anche con il solo nome della cartella.

**Il codice specifico resta nella propria sezione.** I componenti delle slide
vivono in `area-riservata/assemblea/slides/`, mentre il motore e gli strumenti che lavorano
su quelle slide sono in `area-riservata/assemblea/core/`. Regia e setup restano insieme
alla presentazione perché condividono `dati.js`, renderer e flusso live.
I servizi realmente usati da più sezioni, come accesso e stato assemblea,
sono invece in `assets/js/shared/`: la home non dipende più dal codice
interno della presentazione.

**Risorse, configurazione e contenuti sono distinti.** `assets/` contiene
stili, script e media; `config/site.js` configura il comportamento pubblico;
`calendars/` e `documents/` contengono dati. Gli URL di snapshot, indice e PDF
non sono cambiati: non si interrompono download già condivisi, salvataggi
GitHub e workflow. `area-riservata/assemblea/dati.js` resta vicino alle pagine che lo
caricano e viene salvato dal setup nel percorso `LIVE.github.cartella`,
ora impostato a `area-riservata/assemblea`.

**Gli strumenti del repository non sono pagine del sito.** Test, guide
tecniche, specifiche visive e automazioni hanno ciascuno la propria cartella.
Con la pubblicazione dalla radice anche i file raggiungibili di queste
cartelle possono essere pubblici: la separazione organizzativa non costituisce
un controllo di accesso. Non inserire segreti o dati riservati in alcuna parte
pubblicata; la chiave Firebase resta nella console, il token GitHub nel browser.
Setup e regia mantengono i controlli di accesso già previsti. La presentazione
resta leggibile dal pubblico durante la diretta anche se il suo codice è
raggruppato sotto l'area riservata: il percorso non è un vincolo di sicurezza.
I PDF pubblici restano in `documents/pdf/`; `area-riservata/documenti.html`
è esclusivamente l'interfaccia di gestione.

## Migrazione degli indirizzi

| Vecchio indirizzo | Nuova destinazione |
| --- | --- |
| `area-riservata.html` | `area-riservata/index.html` |
| `gestione-documenti.html` | `area-riservata/documenti.html` |
| `Assemblea-di-Gruppo/` | `area-riservata/assemblea/` |
| `Assemblea-di-Gruppo/regia.html` | `area-riservata/assemblea/regia.html` |
| `Assemblea-di-Gruppo/setup.html`, `setup.html` | `area-riservata/assemblea/setup.html` |
| `Assemblea-di-Gruppo/guida.html` | `area-riservata/assemblea/guida.html` |
| `assemblea/setup.html` | `area-riservata/assemblea/setup.html` |
| `assemblea/regia.html` | `area-riservata/assemblea/regia.html` |
| `assemblea/guida.html` | `area-riservata/assemblea/guida.html` |
| `PEG.html` | `peg/index.html`, quindi l'edizione corrente |
| `PEG/PEG2628.html` | `peg/edizioni/2026-2028.html` |
| `PEG/`, `PEG/index.html` | `peg/index.html` |
| `assemblea/manifest.webmanifest`, `Assemblea-di-Gruppo/manifest.webmanifest` | `area-riservata/assemblea/manifest.webmanifest` |

La navigazione interna usa direttamente le destinazioni attuali.
Per tutti i vecchi ingressi della tabella, `deploy/synology/nginx.conf`
definisce redirect HTTP 308 con conservazione dei parametri; il browser
mantiene il frammento. Questi indirizzi non sono piu' disponibili su Pages
o nella preview. `peg/index.html` resta un ingresso funzionale che seleziona
l'edizione corrente, non una copia storica del sito.
`assemblea/index.html` ora mostra i documenti preparatori pubblici, non le
slide. La home continua ad aprire la presentazione durante la diretta, nel
nuovo percorso `area-riservata/assemblea/index.html`.

Quando si pubblica questa migrazione, chiudere e riaprire eventuali schede
di setup e regia già aperte prima del deployment: il vecchio JavaScript
potrebbe conservare in memoria la precedente destinazione dei salvataggi.
Le nuove pagine degli strumenti caricano `config/site.js` con
`github.cartella: 'area-riservata/assemblea'`.

I percorsi relativi permettono di servire lo stesso sito sia sotto
`/agesci-canicattini1/` su GitHub Pages sia nella preview locale. Le URL CSS
sono risolte rispetto al foglio di stile; i collegamenti generati dagli
script classici sono invece relativi alla pagina HTML che li esegue.
Per questo uno spostamento richiede di verificare entrambi, non solo i tag
`script` e `link`.

## Regole per le prossime modifiche

1. Aggiungere una nuova pagina nella sezione che la possiede, non alla radice.
2. Tenere un solo sorgente per contenuto o funzione; condividere solo ciò che
   viene davvero usato da più sezioni.
3. Per un nuovo PEG aggiungere una pagina in `peg/edizioni/` e aggiornare
   `peg/index.html`, senza sovrascrivere l'edizione precedente.
4. Per una nuova slide aggiungere i renderer in `area-riservata/assemblea/slides/` e
   registrarli in `area-riservata/assemblea/index.html`, secondo [Sviluppo](sviluppo.md).
5. Aggiornare insieme link, immagini, chiamate dinamiche, manifest,
   configurazione di salvataggio, preview e test quando cambia un percorso.

## Fonti e verifiche

La gerarchia per funzionalità è una scelta progettuale per questo sito, non
una struttura di cartelle obbligatoria imposta da uno standard.
La [documentazione ufficiale di GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
descrive la pubblicazione statica di HTML, CSS e JavaScript.
La [guida alle sorgenti di pubblicazione](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
conferma che si può continuare a pubblicare dalla radice senza introdurre
compilazione o cambiare le impostazioni Pages.

Comandi di verifica: `node --test tests/*.test.cjs` per il sito,
`python -m unittest discover -s tests -p test_calendar_sync.py` per il
sincronizzatore e `node tools/preview.cjs` per l'anteprima.
I test della struttura controllano risorse, link interni, manifest,
destinazioni dei salvataggi e assenza delle vecchie cartelle. I test Synology
controllano le destinazioni dei redirect nella configurazione Nginx;
il funzionamento HTTP effettivo richiede il collaudo sul NAS.
