# Modificare i contenuti

[README](../README.md) · [Assemblea](assemblea.md) · [Contenuti](contenuti.md) · [Firebase](firebase.md) · [Sviluppo](sviluppo.md)

Setup live, `dati.js` su GitHub e salvataggio definitivo.

| Modo | Quando | Tempo | Durata |
| --- | --- | --- | --- |
| **Setup** (`/setup`, chiede la chiave) | durante l'assemblea: nomi, orari, slide nascoste, testi, numeri | ~1 s regia, ≤10 s pubblico | finché non premi "Togli tutte le modifiche live" |
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
Premi **Pubblica**: su Firebase va solo la differenza rispetto a `dati.js`, così
le modifiche fatte poi su GitHub agli altri campi continuano ad arrivare.
Le modifiche live **non cambiano `dati.js`**: restano su Firebase, sopra il file.
Per renderle definitive: **⋯ → Salva su GitHub (dati.js)**. Il setup riscrive
`dati.js` cambiando solo le righe modificate (commenti e formattazione restano)
e fa il commit; dopo ~1 minuto GitHub Pages lo pubblica e il setup toglie da
solo le modifiche live, ormai inutili. La prima volta chiede un **token GitHub**
(salvato solo su quel dispositivo; **⋯ → Dimentica token GitHub** lo cancella):

1. <https://github.com/settings/personal-access-tokens/new> (Fine-grained token).
2. *Repository access* → *Only select repositories* → `agesci-canicattini1`.
3. *Permissions* → **Contents: Read and write** → *Generate token*, copialo nel setup.

In alternativa **⋯ → Scarica dati.js aggiornato** e caricalo a mano su GitHub,
poi **⋯ → Togli tutte le modifiche live**. Repository, ramo e cartella sono in
`config.js` (`github`).

Con un errore di sintassi in `dati.js` gli schermi già aperti restano alla
versione precedente; chi apre la pagina vede "Non trovo dati.js".
