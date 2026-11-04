# Modificare i contenuti

[README](../README.md) · [Assemblea](assemblea.md) · [Contenuti](contenuti.md) · [Firebase](firebase.md) · [Sviluppo](sviluppo.md)

Setup statico, `dati.js` su GitHub e salvataggio definitivo.

| Modo | Quando | Tempo | Durata |
| --- | --- | --- | --- |
| **Setup** (`/setup`, dopo accesso all'area riservata) | preparazione di nomi, orari, slide, testi, numeri | ~1 min (Pages) + ≤30 s | commit permanente su GitHub |
| **Regia** (chiave Firebase) | presenti, presidente e scrutatori durante l'assemblea | subito regia, ≤10 s pubblico | patch live su Firebase |
| **`dati.js` su GitHub** (matita ✏️ → Commit) | prima dell'assemblea, modifiche definitive | ~1 min (Pages) + ≤30 s | per sempre |

La pagina di setup è divisa in schede:

| Scheda | Cosa contiene |
| --- | --- |
| **Generale** | anno, data, luogo, orari delle convocazioni |
| **Slide** | ordine delle slide (trascina o ↑ ↓), 👁 nascondi/mostra, ✎ apre i contenuti |
| **Contenuti** | testi e nomi di ogni slide (anche Progetto Educativo) |
| **Bilancio** | censimenti, soglie, entrate, uscite, storico avanzi, patrimonio |
| **JSON** | tutti i dati in JSON, per aggiungere slide o modifiche avanzate |
| **Guida** / **Limiti** | questa guida e i limiti del piano Firebase gratuito |

I campi diversi da `dati.js` sono evidenziati in giallo e ↺ li riporta
all'originale; ✕ e **+ Aggiungi** tolgono o aggiungono elementi alle liste.
Premi **Salva su GitHub (dati.js)**. Il setup riscrive
`dati.js` cambiando solo le righe modificate (commenti e formattazione restano)
e fa il commit; dopo ~1 minuto GitHub Pages lo pubblica. Il setup non usa
Firebase: controlla solo la sessione già verificata nell'area riservata,
senza ripetere il login Firebase, né aprire ascoltatori, presenze o letture periodiche.
La prima volta chiede un **token GitHub**
(salvato solo su quel dispositivo; **⋯ → Dimentica token GitHub** lo cancella):

1. <https://github.com/settings/personal-access-tokens/new> (Fine-grained token).
2. *Repository access* → *Only select repositories* → `agesci-canicattini1`.
3. *Permissions* → **Contents: Read and write** → *Generate token*, copialo nel setup.

In alternativa **⋯ → Scarica dati.js aggiornato** e caricalo a mano su GitHub.
Repository, ramo e cartella sono in
`config.js` (`github`).

Il setup legge solo il file statico pubblicato, non le modifiche live della
regia; non le importa, non le salva e non le cancella. Una patch live su
Firebase continua a prevalere sullo stesso campo di `dati.js`. Per avviare
l'assemblea, attendi la pubblicazione, apri la regia con la chiave e premi
**Avvia live**. Il pulsante mantiene le modifiche live esistenti e riparte
dalla slide QR. La chiusura si fa con **Termina assemblea** in regia.

Con un errore di sintassi in `dati.js` gli schermi già aperti restano alla
versione precedente; chi apre la pagina vede "Non trovo dati.js".
