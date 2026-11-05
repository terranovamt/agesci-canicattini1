# Struttura del repository

[README](../README.md) · [Sviluppo](sviluppo.md) · [Audit UI/UX](audit-ui-ux.md)

Questa mappa descrive dove vive ogni parte del progetto, come si collegano i
file e quali percorsi sono intenzionalmente stabili. Non esiste un unico schema
di cartelle obbligatorio per tutti i siti: qui la gerarchia segue prima le
funzioni del prodotto e poi i suoi strumenti di manutenzione.

## Gerarchia

```text
/
├── index.html, home.css, home.js, home-*.js, site-menu.js
│   Home pubblica e moduli JavaScript che la alimentano.
├── area-riservata.html / area-riservata.js
│   Accesso agli strumenti riservati.
├── gestione-documenti.html / gestione-documenti.css / gestione-documenti.js
│   Gestione dei documenti, con documents-store.js per la persistenza GitHub.
├── PEG.html, setup.html, peg.css, peg.js
│   Pagina PEG e scorciatoia pubblica /setup.
├── manifest.webmanifest, .nojekyll
│   Installazione PWA e configurazione della pubblicazione statica.
├── Assemblea-di-Gruppo/
│   ├── index.html, regia.html, setup.html, guida.html
│   │   Pagine della presentazione, regia, configurazione e guida.
│   ├── common/
│   │   Motore e servizi condivisi, accesso, live, setup e stili comuni.
│   ├── landscape/, portrait/
│   │   Implementazioni e stili delle slide per orientamento.
│   ├── img/
│   │   Immagini e icone della presentazione.
│   ├── config.js, dati.js
│   │   Configurazione applicativa e contenuti delle slide.
│   └── altri file .js e .css
│       Codice condiviso della presentazione.
├── PEG/
│   Versione pubblica del Progetto Educativo.
├── assets/
│   Font e immagini riutilizzati dalle pagine del sito.
├── calendars/
│   Configurazione delle fonti e snapshot pubblico degli eventi.
├── documents/
│   Indice JSON e PDF pubblicati.
├── firebase/
│   Regole del Realtime Database, da configurare nella console.
├── tests/
│   Test automatici Node.js e Python.
├── tools/
│   Preview locale e strumenti di sincronizzazione dei calendari.
├── docs/
│   Guide operative, sviluppo, struttura e audit del progetto.
├── design-system/
│   Specifiche dell'identità e del sistema visivo.
└── .github/
    ├── workflows/
    │   Automazioni GitHub Actions.
    └── prompts/
        Prompt, istruzioni riutilizzabili, dati e script di supporto.
```

I nomi sopra raggruppano le responsabilità principali; per i file dettagliati
della presentazione, vedere [Sviluppo](sviluppo.md).

## Perché le pagine sono alla radice

Il repository pubblica direttamente il ramo `main` dalla cartella `/ (root)`
tramite GitHub Pages. L'HTML della home e le sue risorse hanno quindi percorsi
pubblici espliciti, e la preview locale e i test caricano gli stessi file.
GitHub Pages consente anche di pubblicare dalla cartella `/docs`, ma cambiare
la sorgente o spostare file in questo progetto non è una semplice
riorganizzazione: va trattato come una modifica agli URL, aggiornata in tutti
i riferimenti e verificata sulla preview e sulla pubblicazione.

Per questo la radice contiene le pagine e i moduli che sono già parte
dell'interfaccia web. I file relativi a una funzionalità complessa, come la
presentazione dell'assemblea, sono invece raccolti nella propria cartella.
Test, documentazione, automazioni, dati pubblici e strumenti locali sono
separati dal codice eseguito dal browser.

## Criteri di buona organizzazione applicati

- **Separare per responsabilità:** pagine e componenti dell'assemblea stanno
  insieme; documentazione, test, automazioni e tool non si mescolano al codice
  runtime del sito.
- **Tenere le risorse vicino alla funzionalità:** CSS e JavaScript specifici
  delle slide sono raggruppati per orientamento; gli script condivisi sono in
  `common/`.
- **Distinguere sorgenti e dati pubblici:** configurazione dei calendari,
  snapshot eventi, indice documenti e PDF hanno cartelle dedicate. Sono
  pubblici insieme al sito: non inserirvi credenziali o dati riservati.
- **Evitare duplicati e percorsi impliciti:** mantenere un solo file sorgente
  per funzione e aggiornare i riferimenti HTML/test quando si rinomina o sposta
  una risorsa.
- **Verificare le modifiche strutturali:** eseguire i test Node con
  `node --test tests/*.test.cjs`, i test Python del sincronizzatore con
  `python -m unittest discover -s tests -p test_calendar_sync.py` e provare il
  sito con `node tools/preview.cjs`.

Queste scelte seguono il modello attuale, statico e senza bundler. Se in futuro
si introduce una compilazione o si cambia la sorgente di GitHub Pages, si potrà
separare il sorgente in `src/` e pubblicare gli artefatti con un workflow, ma
solo con una migrazione esplicita di URL, test e processo di deploy.

## Riferimenti

- [GitHub Pages: configurare una sorgente di pubblicazione](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site):
  consente come sorgente una cartella della radice del repository o `/docs`.
- [GitHub Pages: che cos'è GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages):
  descrive la pubblicazione di file HTML, CSS e JavaScript direttamente dal
  repository.
