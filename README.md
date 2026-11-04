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
chiave, Firebase è simulato in memoria e i salvataggi su GitHub sono bloccati;
nessuna modifica viene inviata ai servizi reali. Il server ascolta solo su
`127.0.0.1` e ricarica la pagina quando cambiano i file del progetto.
Il feed pubblico degli eventi viene caricato dalla home quando il browser lo
consente; se il servizio blocca la richiesta cross-origin, resta disponibile
il link per aprire o aggiungere il calendario.

## Pubblicazione (GitHub Pages)

In **Settings > Pages**: **Deploy from a branch**, branch `main`, cartella **`/ (root)`**.
Ogni commit su `main` viene pubblicato in circa 1 minuto. L'indirizzo principale
del sito mostra normalmente la home del gruppo. Durante l'assemblea reindirizza
a `Assemblea-di-Gruppo/index.html`, conservando parametri e posizione (`#slide.passo`).
Il file `.nojekyll` fa pubblicare i file così come sono, senza elaborazione Jekyll.

## Struttura del repository

| Percorso | Contenuto |
| --- | --- |
| `index.html`, `home.css`, `home.js`, `manifest.webmanifest` | home del gruppo |
| `area-riservata.html`, `area-riservata.js` | accesso con chiave |
| `setup.html` | scorciatoia `/setup` verso il setup dell'assemblea |
| `Assemblea-di-Gruppo/` | presentazione, regia, setup, guida, `dati.js`, `config.js` |
| `docs/` | documentazione (questi file non servono al sito) |
| `firebase/database.rules.json` | regole da incollare nella console Firebase |
| `tests/` | test: `node --test tests/*.test.cjs` |
