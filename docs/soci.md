# Libro soci di gruppo

Il libro soci funziona sul backend NAS, con accesso amministrativo o di un
capo con branca di servizio assegnata. La
simulazione statica non contiene anagrafiche. Dalla dashboard scegliere
**Apri il libro soci**; **Persone e accessi** resta dedicato a tipologia
account e reset delle password.

L'amministratore assegna la branca di servizio L/C, E/G o R/S in **Persone e
accessi**. I capi vedono e modificano solo i soci della propria branca locale;
possono gestirne campi e macro.
La gestione accessi elenca esclusivamente i capi (amministratore incluso);
i ragazzi restano nel Libro soci. Il modulo di aggiunta accessi crea solo capi.
Nessuna assegnazione significa nessun accesso
al libro soci, anche con login abilitato. Import, nuovi account e modelli
documentali restano amministrativi. L'assegnazione non cambia la branca
anagrafica Adulti e non concede il login.

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

Di default sono esclusi da elenco, conteggi ed export i soci il cui ultimo
censimento ha codice **D** (AGESCI: sospeso da oltre un anno), oppure **S**
con anno precedente all'anno di riferimento. Quest'ultimo e il massimo anno
dei censimenti presenti nel database, uguale per tutte le branche; non
dipende dal filtro anno. **Mostra anche sospesi da oltre un anno** li include
senza cancellare o riattivare nessuno. Tornando alla vista predefinita vengono
anche rimossi dalla selezione.

Il filtro **Anno di nascita** e **Raggruppa per anno di nascita** permettono
di selezionare insieme le annate. Nessun ruolo, progressione o passaggio
viene assegnato automaticamente in base all'eta.

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
| L/C | sestiglia, ruolo (capo, vice, sestigliere, novizio), primo/secondo/terzo anno, progressione (lupo della legge, della rupe, anziano), pista/sentiero, specialita, data promessa |
| E/G | squadriglia, ruolo (capo, vice, squadrigliere), anno in branca, piede tenero, tappa, specialita, brevetti di competenza, data promessa |
| R/S | noviziato/clan, punto della strada, servizio, data partenza |
| Adulti | servizio in gruppo, formazione |

In **Campi personalizzati e modelli di gruppo** si aggiungono campi testo,
data o scelta. La chiave e univoca nella branca, composta da lettere minuscole,
cifre e trattini; inizia con una lettera. Le definizioni sono aggiunte, non
rinominate o eliminate dall'interfaccia.

Selezionare soci e aprire **Azioni rapide** per assegnare un valore educativo
o proporre un passaggio alla branca successiva. La selezione comprende anche soci
non piu visibili dopo un cambio dei filtri; il conteggio lo segnala.
L'aggiornamento educativo richiede soci della stessa branca. Un valore vuoto
cancella il campo. In R/S non ci sono sestiglie, squadriglie, ruoli,
specialita o brevetti; restano i campi del percorso R/S.

La successione e **L/C → E/G → R/S**, senza salti e senza passaggio automatico
da R/S ad Adulti. Il capo della provenienza propone il passaggio; fino alla
conferma la branca locale non cambia. Un altro capo assegnato alla
destinazione puo confermare o rifiutare in **Passaggi in attesa**; la provenienza
puo annullare. L'amministratore gestisce tutte le branche, ma non puo confermare
una propria proposta. Prima dell'ingresso, la destinazione vede solo nome,
codice e anno di nascita nella proposta, non la scheda completa.
La conferma conserva tutti i percorsi precedenti, senza modificare censimento
o account. Dopo il passaggio la provenienza perde l'accesso alla scheda.
Il capo vede solo i valori educativi della branca corrente; l'amministratore
puo vedere quelli storici delle altre branche.

Le macro sono atomiche: una scheda modificata nel frattempo o una selezione
non valida annulla tutta l'operazione. Ricaricare e verificare prima di
riprovare. Anche le modifiche singole rilevano i conflitti; la UI avvisa
prima di abbandonare una scheda non salvata.
Una scheda modificata dopo la proposta impedisce la conferma: annullare o
rifiutare la proposta e riproporla dopo aver verificato i dati. Le proposte
sopravvivono al riavvio. Non usare la modifica anagrafica o una macro diretta
per aggirare la conferma.

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
