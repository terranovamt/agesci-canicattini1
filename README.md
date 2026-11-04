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

## Calendario Outlook

La home incorpora la vista pubblicata `calendar.html`; il link `calendar.ics`
serve invece per iscriversi dagli strumenti calendario. Il feed ICS può
essere pubblico ma non leggibile tramite JavaScript per i vincoli CORS.
In Outlook verifica **Impostazioni > Calendario > Calendari condivisi >
Pubblica un calendario**, scegli il calendario del gruppo e rendi visibili i
dettagli degli eventi. Confronta il link HTML pubblicato con quello nella home.
Se l'incorporamento è bloccato, usa il link per aprire il calendario in una
nuova scheda. L'URL HTML è stato derivato dal link ICS: la sua disponibilità
non è stata verificata perché l'ambiente di lavoro non risolve il dominio
Outlook; non possiamo quindi confermare la condivisione né la presenza di eventi.

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
| `gestione-documenti.html`, `gestione-documenti.js`, `documents-store.js` | gestione PDF con pubblicazione GitHub |
| `documents/index.json`, `documents/pdf/`, `home-documents.js` | indice, PDF pubblici e lista della home |
| `setup.html` | scorciatoia `/setup` verso il setup dell'assemblea |
| `Assemblea-di-Gruppo/` | presentazione, regia, setup, guida, `dati.js`, `config.js` |
| `docs/` | documentazione (questi file non servono al sito) |
| `firebase/database.rules.json` | regole da incollare nella console Firebase |
| `tests/` | test: `node --test tests/*.test.cjs` |

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
censiti, la data dell'assemblea e il conto alla rovescia delle slide QR.
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
