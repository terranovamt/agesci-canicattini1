# Istruzioni per gli assistenti di codice

## Riferimento del progetto

- Per le modifiche a questo progetto, partire dal branch `NAS`; le pull request
  dirette a questo ambiente hanno come base `NAS`. Non usare `main` come base
  senza una richiesta esplicita.
- `NAS` è distribuito sul Synology, non su GitHub Pages. Il deploy è gestito
  dall'attività DSM descritta in `docs/ottimizzazione-synology.md`; non
  cambiare il flusso di deploy o i dati persistenti senza aggiornare quella
  documentazione.
- Prima di modificare un comportamento, verificare il codice e la
  documentazione di questo branch. Alcune guide, come `docs/firebase.md` e
  parti di `docs/contenuti.md`, descrivono il ramo storico basato su Firebase
  o GitHub e non il runtime NAS.

## Regole di modifica

- Preferire modifiche mirate e coerenti con JavaScript, HTML e CSS esistenti;
  non introdurre framework o dipendenze senza necessità.
- Mantenere separati i dati persistenti del NAS dagli asset statici generati
  dalla build. Non includere nel repository password, token, dati personali
  riservati o copie del database runtime.
- Riutilizzare i moduli e i test esistenti. Aggiungere o aggiornare test per i
  comportamenti cambiati e verificare la build prevista dal progetto.
- Non aggiornare documentazione del ramo storico come se descrivesse il NAS:
  indicare chiaramente a quale flusso appartiene.
- Organizzare cambiamenti indipendenti in pull request distinte e usare
  messaggi di commit descrittivi.
- **Non indicare mai Copilot come autore o coautore**, nei commit, nelle pull
  request o nelle note di attribuzione. Non aggiungere trailer
  `Co-authored-by: Copilot`.

Per i dettagli operativi sul Synology, seguire la
[guida Synology](../docs/ottimizzazione-synology.md); per il codice delle
slide, consultare [`docs/sviluppo.md`](../docs/sviluppo.md).
