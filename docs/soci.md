# Libro soci di gruppo

Il libro soci funziona sul backend NAS, con accesso amministrativo. La
simulazione statica non contiene anagrafiche. Dalla dashboard scegliere
**Apri il libro soci**; **Persone e accessi** resta dedicato a tipologia
account e reset delle password.

## Primo import e aggiornamenti

1. Fare un backup SQLite secondo la guida Synology prima di un import
   importante. Non copiare il solo file SQLite aperto.
2. Aprire **Importa CSV AGESCI**, caricare `RicercaSoci.csv` o incollarne il
   contenuto; premere **Analizza CSV**.
3. Controllare nuovi soci, aggiornamenti, righe, avvisi e colonne escluse.
   L'anteprima non scrive nulla; solo **Conferma importazione** salva.

Sono supportati BOM, direttiva `sep=,`, campi Excel `="..."`, virgolette,
virgole e ritorni a capo dentro i campi, date italiane e zeri iniziali nei
codici. Limiti: 4 MiB e 5.000 righe. Il file deve appartenere al gruppo R2053;
gli altri gruppi e le intestazioni duplicate sono rifiutati. Le intestazioni
minime sono `ANNO SCOUT`, `CODICE SOCIO`, `NOME`, `COGNOME`, `BRANCA`,
`ORDINALE`; preferire l'export ufficiale completo.

Il codice socio identifica la persona; codice e anno identificano il
censimento. Non si uniscono persone per nome, eta o somiglianza dei dati.
Duplicati dello stesso codice/anno bloccano l'intero import: verificare
eventuali incarichi multipli nella fonte, senza eliminare righe arbitrariamente.
I dati di gruppo sono conservati una volta sola; le colonne territoriali
non utilizzate vengono elencate nell'anteprima.

L'anagrafica viene aggiornata solo dal censimento piu recente, anche quando
si carica uno storico. I valori vuoti delle colonne presenti cancellano quelli
precedenti; le colonne assenti vengono conservate. Reimportare lo stesso
anno aggiorna il record senza duplicarlo. I dati educativi e la branca locale
restano invariati. Password, tipologia di account gia esistente e abilitazione
al login non cambiano: l'import non e un'autorizzazione all'accesso.

Uno status sospeso resta sospeso. Non correggere branca, genitori o contatti
automaticamente in base a eta o nome. I dati dei responsabili genitoriali
rimangono testo da verificare: il sistema elimina soltanto numeri di telefono
esattamente duplicati dopo la rimozione degli spazi.

## Schede, ricerche ed estrazioni

Aprire il nome di un socio per anagrafica, contatti, consensi, dati genitoriali,
percorso educativo e storico annuale AGESCI. Le modifiche manuali non
riscrivono lo storico ufficiale. Gli account preesistenti senza scheda devono
essere completati prima di applicare macro.

La ricerca comprende nome, codice e dati anagrafici. I filtri combinano
branca locale, anno, status ufficiale, eta, campi educativi e verifiche dei
contatti/consensi mancanti. Senza anno esplicito viene usato l'ultimo disponibile
per ogni socio, non un unico anno comune a tutti.

**Esporta risultati** scarica tutte le righe filtrate (non solo quelle
selezionate), con anagrafica, consensi, censimento scelto e campi delle varie
branche. Il CSV protegge le celle che potrebbero essere interpretate come
formule dai fogli di calcolo; non e un CSV di reimportazione AGESCI.
Contiene dati personali: conservarlo in modo sicuro e cancellarlo quando non
serve. Nessun file viene pubblicato automaticamente.

## Campi di branca e macro

Campi iniziali:

| Branca | Percorso |
| --- | --- |
| L/C | sestiglia, pista/sentiero, specialita, data promessa |
| E/G | squadriglia, ruolo, tappa, specialita, brevetti, data promessa |
| R/S | noviziato/clan, punto della strada, servizio, data partenza |
| Adulti | servizio in gruppo, formazione |

In **Campi personalizzati e modelli di gruppo** si aggiungono campi testo,
data o scelta. La chiave e univoca nella branca, composta da lettere minuscole,
cifre e trattini; inizia con una lettera. Le definizioni sono aggiunte, non
rinominate o eliminate dall'interfaccia.

Selezionare soci e aprire **Azioni rapide** per assegnare un valore educativo
o effettuare un passaggio di branca locale. La selezione comprende anche soci
non piu visibili dopo un cambio dei filtri; il conteggio lo segnala.
L'aggiornamento educativo richiede soci della stessa branca. Un valore vuoto
cancella il campo. Il passaggio conserva il percorso precedente, senza
modificare censimento o account.

Le macro sono atomiche: una scheda modificata nel frattempo o una selezione
non valida annulla tutta l'operazione. Ricaricare e verificare prima di
riprovare. Anche le modifiche singole rilevano i conflitti; la UI avvisa
prima di abbandonare una scheda non salvata.

## Modelli e documenti

Selezionare soci, scegliere **Genera documenti** e controllare l'anteprima.
**Stampa / Salva PDF** usa il browser: una scheda per socio, senza inviare i
dati a generatori esterni e senza salvarli nell'archivio PDF pubblico.
Il modello iniziale e interno, non sostituisce documenti ufficiali AGESCI.

Si possono aggiungere modelli di solo testo con questi segnaposto:
`{{nome}}`, `{{cognome}}`, `{{codice}}`, `{{branca}}`, `{{anno}}`,
`{{email}}`, `{{cellulare}}`, `{{data}}`, `{{percorso}}`.
`anno` segue il filtro del censimento; `branca` e `percorso` sono locali.
Non sono supportati HTML, script o macro eseguibili.

Non inserire export reali, dati di minori o genitori nei sorgenti, nei test,
nei log, nella documentazione tecnica o nella memoria dell'assistente.
I backup del NAS comprendono anche queste tabelle e vanno protetti.
