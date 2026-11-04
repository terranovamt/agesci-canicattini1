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
| **Slide** | aggiunta, eliminazione, ordine (trascina o ↑ ↓), sezioni collassabili, 👁 nascondi/mostra, ✎ contenuti |
| **Bilancio** | censimenti, soglie, entrate, uscite, storico avanzi, patrimonio |
| **JSON** | tutti i dati in JSON, per aggiungere slide o modifiche avanzate |
| **Guida** / **Limiti** | questa guida e i limiti del piano Firebase gratuito |

I campi diversi da `dati.js` sono evidenziati in giallo e ↺ li riporta
all'originale; ✕ e **+ Aggiungi** tolgono o aggiungono elementi alle liste.
Nella scheda **Slide**, scegli il tipo tra tutti quelli supportati oppure
una copia di una slide esistente e premi **+ Aggiungi slide**: la nuova slide
viene aggiunta in fondo, senza duplicare l'identificativo dei collegamenti,
e si apre il suo editor.
**✎** apre un dialogo dedicato alla sola slide selezionata: non esiste più
una scheda Contenuti separata. Il selettore **Tipo di slide** cambia i campi
mostrati e, dopo conferma, sostituisce quelli specifici con i valori iniziali
del nuovo tipo; conserva identificativo, visibilità ed eventuale titolo barra.
**Fine modifica** chiude il dialogo mantenendo le modifiche locali; il
salvataggio definitivo richiede sempre **Salva su GitHub**.
**✕** elimina una singola slide dopo conferma; eliminare un divisore non
elimina le slide della sua sezione. L'ultima slide non può essere eliminata.
I collegamenti verso una slide eliminata vanno aggiornati nei contenuti.

**▾ / ▸** collassa o espande un divisore. Una sezione comprende il divisore
e le slide fino al divisore successivo (escluso). Quando è collassata,
trascinamento e **↑ ↓** spostano tutto il blocco, mantenendo l'ordine interno.
Quando è espansa puoi spostare le slide singolarmente. Collassare è solo una
preferenza dell'editor: non nasconde le slide nella presentazione.

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
