# Libro soci di gruppo

Il libro soci funziona sul backend NAS, con accesso amministrativo o di un
capo con branca di servizio assegnata. La
simulazione statica non contiene anagrafiche. Dalla dashboard scegliere
**Apri il libro soci**; **Gestisci accessi capi** permette solo assegnazione
della branca di servizio e reset delle password.

L'amministratore assegna la branca di servizio L/C, E/G o R/S in **Persone e
accessi**. I capi vedono e modificano solo i soci della propria branca locale;
possono gestirne campi e macro.
La gestione accessi elenca esclusivamente i capi configurati in
`NAS_CAPO_CODES`, escluso l'amministratore; non permette di creare account
o cambiare tipologia. Anche il Libro soci esclude l'amministratore da elenco,
conteggi, ricerca, selezioni ed estrazioni, senza cancellarne dati o accesso.
Nessuna assegnazione significa nessun accesso
al libro soci, anche con login abilitato. Import, nuovi account e modelli
documentali restano amministrativi. L'assegnazione non cambia la branca
anagrafica Co.Ca. (Comunità Capi) e non concede il login. L'interfaccia usa
**Co.Ca.**; il valore interno `Adulti` e il CSV AGESCI `Branca Adulti`
restano compatibili, senza migrazioni dei dati.

Nella lista l'intestazione **Branca** e i badge usano i colori della branca.
Le intestazioni ordinabili (Socio, Branca, Eta, Censimento AGESCI, Contatti)
ciclano tra crescente, decrescente e nessun ordinamento. Eta e ordinata
numericamente, con i valori mancanti in fondo in entrambe le direzioni.
L'eventuale raggruppamento per anno di nascita resta prioritario; l'ordinamento
si applica all'interno di ciascun gruppo. I controlli sono disponibili anche
nella visualizzazione a schede su telefono.

**Visualizza come** (in alto, accanto ad Area riservata) e' riservato
all'amministratore: elenca i capi configurati con branca di servizio e apre la
stessa sessione con i permessi server del capo scelto, senza password del capo e
senza modificarne credenziali o branca. Le azioni amministrative restano negate
finche' non si preme **Torna admin**, sempre visibile nell'header. I passaggi
possono essere confermati anche se proposti dallo stesso admin, ma soltanto
nella vista della branca di destinazione (o tornando admin). I passaggi
proposti o confermati in questa vista restano attribuiti all'amministratore.
Se il capo perde abilitazione o branca, le API rispondono 409 finche' non si
torna admin; ogni riavvio chiude comunque le sessioni admin.

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
automaticamente in base a eta o nome.

### Responsabili genitoriali

Nella scheda, **Genitori** separa i responsabili del campo AGESCI
`RESP.GENITORIALE DATI`: nome completo originale, CF, comune e data di
nascita, email e cellulare. Il nome completo non permette di distinguere con
certezza nomi e cognomi composti: si modifica solo **Nome completo**, senza
campi Nome/Cognome separati e senza suddivisioni automatiche. Eventuali nomi
verificati delle vecchie schede restano leggibili nel campo unico; CF,
luogo/data di nascita, email e cellulare restano preservati e modificabili.

Si possono aggiungere o rimuovere responsabili (massimo 20) e modificare i
campi prima di **Salva scheda**. Il testo originale resta consultabile,
senza unioni automatiche dei duplicati; CF ripetuti e formati non separabili
sono segnalati. Le date non valide non vengono convertite silenziosamente.
I responsabili strutturati sono conservati nel profilo SQLite ed esportati
in una colonna JSON del CSV risultati.

Un nuovo import della colonna aggiorna i contatti dalla fonte; conserva il
nome completo corretto localmente e i precedenti nomi verificati per i
responsabili con lo stesso CF, abbinando ciascuna occorrenza una sola volta.
Una colonna assente non cancella i responsabili;
una presente ma vuota li azzera. L'import non elimina record duplicati.

## Schede, ricerche ed estrazioni

Aprire il nome di un socio per anagrafica, contatti, dati genitoriali,
percorso educativo e storico annuale AGESCI. Le modifiche manuali non
riscrivono lo storico ufficiale. Gli account preesistenti senza scheda devono
essere completati prima di applicare macro.

Le schede Co.Ca. e quelle con tipologia account **capo**, anche se registrate
in L/C, E/G o R/S, mostrano soltanto **Anagrafica**, **Contatti** e
**Censimenti**. **Genitori** e **Percorso** non compaiono nella navigazione;
i dati già salvati restano conservati anche dopo una modifica anagrafica.
Le schede dei ragazzi mantengono tutte e cinque le sezioni. La branca di
servizio e i ruoli di capo/vice sestiglia o squadriglia non cambiano la
tipologia della scheda.

L'amministratore vede tutte le schede, anche quelle con livello FoCa
valorizzato e ingresso CoCa assente (o No). Il filtro FoCa/CoCa si applica
solo ai profili di tipo adulto nelle viste dei capi, sempre limitate alla propria
branca. Per il tipo **ragazzo**, FoCa e ingresso CoCa non influenzano mai la
visibilita, anche se valorizzati nell'import. I dati e gli
accessi restano conservati. FoCa e CoCa non occupano campi nella scheda dei ragazzi.
I consensi non sono gestiti da questa interfaccia: le relative colonne CSV
sono ignorate, non vengono esportate o salvate con il profilo. Gli eventuali
valori gia presenti nel JSON SQL restano inerti, senza cancellazioni massive.

La ricerca comprende nome, codice e dati anagrafici. Le schede numeriche per
branca sono filtri rapidi: premere la branca selezionata una seconda volta
rimuove il filtro. I chip di anno e status sono indipendenti e combinabili;
selezionarli di nuovo li azzera. Gli stessi filtri sono disponibili nei campi
select. **Ricerca avanzata** contiene eta, anno di nascita, verifiche
anagrafiche e criteri sul percorso educativo; senza anno esplicito viene usato
l'ultimo disponibile per ogni socio, non un unico anno comune a tutti.

La dashboard amministrativa mostra il totale dei censimenti AGESCI importati
nell'anno piu recente e la ripartizione per branca ufficiale. Il riepilogo
espone solo conteggi, non dati anagrafici; comprende gli status presenti
nell'import senza riattivare o modificare le schede.

Specialita e brevetti mostrano subito le voci assegnate, ciascuna rimovibile.
**Aggiungi o modifica** apre un catalogo ricercabile con caselle multiselezione,
conteggio e messaggio per ricerche senza risultati. Non esiste un pulsante per
ogni voce del catalogo. Su mobile la lista e scorrevole.

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
selezionate), con anagrafica, censimento scelto e campi delle varie
branche. Il CSV protegge le celle che potrebbero essere interpretate come
formule dai fogli di calcolo; non e un CSV di reimportazione AGESCI.
Contiene dati personali: conservarlo in modo sicuro e cancellarlo quando non
serve. Nessun file viene pubblicato automaticamente.

## Campi di branca e macro

Campi iniziali:

| Branca | Percorso |
| --- | --- |
| L/C | sestiglia e ruolo in sola lettura, primo/secondo/terzo anno, momento della progressione, specialita, data promessa |
| E/G | squadriglia, ruolo (capo, vice, squadrigliere, piede tenero), anno in branca, tappa (scoperta, competenza, responsabilita), specialita, brevetti di competenza, data promessa |
| R/S | comunita (Noviziato per i novizi del primo anno, oppure Clan), passi (scoperta, competenza, responsabilita), punto della strada, servizio, data partenza |
| Co.Ca. (Comunità Capi) | servizio in gruppo, formazione (conservati; non mostrati nella scheda) |

In **Campi personalizzati e modelli di gruppo** si aggiungono campi testo,
data o scelta. La chiave e univoca nella branca, composta da lettere minuscole,
cifre e trattini; inizia con una lettera. Le definizioni sono aggiunte, non
rinominate o eliminate dall'interfaccia.

Nel Branco i momenti L/C sono **Lupo della legge**, **Lupo della rupe**,
**Lupo anziano**; nel Cerchio **Coccinella del prato**, **Coccinella del bosco**,
**Coccinella della montagna**.
La comunita R/S e una scelta tra **Noviziato** e **Clan**: chi e nel primo anno
R/S appartiene al Noviziato ed e un novizio. Le tappe E/G e i passi R/S sono
selezioni singole. Specialita L/C (39 voci),
E/G (65 voci) e brevetti E/G (15 voci) sono elenchi ricercabili a selezione
multipla nelle schede individuali; nessun brevetto o specialita viene proposto in
R/S. Le scelte gia salvate non presenti nel catalogo restano visibili come
valori precedenti e non vengono cancellate durante l'aggiornamento.

Il momento L/C e la scelta strutturata del percorso. Il vecchio campo libero
standard Pista/Sentiero non viene piu proposto come secondo percorso:
eventuali valori precedenti restano consultabili come nota, senza perderli.

Il catalogo L/C e quello fornito dal gruppo. Gli elenchi E/G e brevetti sono
stati riscontrati nell'applicazione pubblica di
[AGESCI Campania, plancia](https://github.com/AGESCI-Campania/plancia/blob/ef1e5b39ff74bbec7133680a8ec25db0b5641041/apps/diaries/models.py),
che li riferisce agli allegati del regolamento metodologico. Non vengono
inventate relazioni tra brevetti e specialita.

### Sestiglie e squadriglie

La sezione mostra **Sestiglie** per L/C e **Squadriglie** per E/G; titolo e
navigazione seguono la branca selezionata. L'amministratore sceglie L/C o E/G;
i capi vedono solo la propria branca. R/S non usa questa vista. I sospesi da
oltre un anno restano esclusi.

Sestiglia/squadriglia e ruolo si assegnano da questa vista, non dalla scheda
personale o dalle macro. La scheda li riepiloga in sola lettura e permette di
aprire **Storico assegnazioni per anno**. L'anno di riferimento e il massimo
anno censimento importato (o l'anno corrente se mancano censimenti): viene
conservata l'ultima assegnazione registrata in ogni anno. Un import successivo
o un riavvio non riscrive gli anni passati. Lo storico parte dalle informazioni
oggi disponibili: i censimenti ufficiali non contengono le vecchie sestiglie,
quindi gli anni precedenti non vengono inventati.

Le righe sono compatte: **C** su fondo viola per il capo, **VC** su fondo
lilla per il vice, poi membri senza etichette ripetute e nuovi ingressi
(Cuccioli/Cocci o Piedi teneri) in fondo su giallo chiaro.
Requisito stabile della board: nomi, ruoli e conteggio dei soci di ciascuna
unità devono essere leggibili a colpo d'occhio, anche su telefono.
Le assegnazioni restano nella schermata gruppi: non introdurre un nuovo
dialogo «Sposta» dalle card o dalla scheda personale. Presenze e assenze alle
attività sono sviluppi futuri, non funzioni già implementate.
Trascinare il nome di un socio (o la maniglia ⋮⋮) sulla riga desiderata di
un'altra sestiglia/squadriglia o su **Soci disponibili**: il trascinamento usa
Pointer Events e funziona con mouse, penna e touch (sul nome serve una breve
pressione prolungata, cosi lo scorrimento della pagina resta libero; la
maniglia parte subito). Il rilascio trasferisce l'assegnazione esistente con il
ruolo della riga, con revisione e storico gestiti dal server; non crea soci.
Rilasciare fuori dalle righe o premere Esc annulla. Lo spostamento non cambia branca e conserva gli altri
campi educativi. Capo e vice ammettono una sola persona: prima liberare il
posto occupato. Le stesse regole valgono per schede e macro; duplicati
precedenti e ruoli non riconosciuti sono segnalati, non cancellati.

**Nascondi** conserva identita, colori, simbolo e assegnazioni.
**Gruppi nascosti** consente il ripristino; anche **Crea** con lo stesso nome
(ignorando maiuscole e spazi superflui) recupera il gruppo esistente senza
sovrascriverne l'aspetto. I suoi soci restano raggiungibili nell'area
**Soci disponibili**, con l'assegnazione conservata indicata.
Il blocco resta aperto in alto ed e fisso durante lo scorrimento (tranne negli
schermi molto bassi, per non coprire le destinazioni); sparisce quando e vuoto.
La ricerca accanto al titolo evidenzia tutte le occorrenze nei nomi, senza
nascondere gli altri soci. Trascinare un nome su questo blocco rimuove
esplicitamente l'assegnazione. Non ci sono frecce o form separati per spostare.
Da tastiera, premere Invio sulla maniglia, raggiungere una riga di destinazione
con Tab e confermare con Invio o Spazio; Esc annulla.

Le sestiglie hanno un triangolo equilatero con punta in alto, bordato di giallo, con il proprio colore al
centro. I nomi colore proposti selezionano automaticamente il colore
corrispondente; per un nome locale si puo scegliere il colore.
I colori delle squadriglie sono fissati nel catalogo `patrolCatalog` in
`assets/js/soci-model.js`, condiviso tra UI e server. Sono mostrati come
rettangolo diviso in due sotto il nome; le voci monocolore usano due meta
uguali. Nome singolare e plurale sono equivalenti per colori e immagini,
non per l'identita del gruppo. Le tre varianti Gallo sono esplicite: non
si sceglie arbitrariamente un abbinamento per un vecchio nome ambiguo.
Panda (giallo/nero) e solo E/G. Il Blu condiviso da sestiglie e squadriglie
e `#2e64ab`, piu chiaro e distinto da Blu reale e Blu marino; le sestiglie Blu
esistenti mostrano il nuovo colore canonico.
I colori locali dei nomi fuori catalogo restano conservati.
Per creare una nuova squadriglia fuori catalogo occorre aggiungerne prima
nome e colori nel codice; quelle locali gia archiviate restano ripristinabili.
Il rettangolo descrive colori e significati al passaggio del mouse.
Non c'e un pulsante per modificare colori e simbolo.

I guidoni completi SVG si aggiungono in `assets/img/guidoni/`, con nome
plurale minuscolo: `leoni.svg`, `aquile.svg`, `volpi.svg`, ecc.
Il caricamento usa file statici come immagini, senza iniettare SVG nel DOM.
Se manca il file viene mostrato un guidone bianco vuoto; i colori restano
nel rettangolo sotto il nome. `base.svg` e la base riutilizzabile, con il
gruppo centrale `simbolo`; `leoni.svg` e un esempio originale sostituibile.
Le immagini precedentemente salvate nel database non vengono eliminate,
ma la nuova vista usa i file SVG del codice.

Un capo L/C puo scegliere **Branco · Lupetti** o **Cerchio · Coccinelle**
aprendo **Ambiente L/C**, chiuso normalmente per lasciare spazio ai nomi.
L'ambiente e condiviso da tutta la branca, non personale. Il cambio aggiorna
terminologia, momenti corrispondenti per posizione e Cucciolo/Cocci, anche nei
percorsi L/C conservati; non elimina specialita, gruppi o altre informazioni.
Le schede interessate cambiano revisione per impedire salvataggi su bozze obsolete.

L'aggiornamento converte il vecchio flag E/G Si/Piede tenero nel ruolo
**Piede tenero**, se il ruolo era vuoto o Squadrigliere; un capo/vice esplicito
ha precedenza. Il flag standard viene rimosso. Il precedente ruolo L/C
**Novizio** diventa **Cucciolo** soltanto con la definizione standard
riconosciuta. Le definizioni personalizzate non vengono riscritte.

Selezionare soci e aprire **Proponi passaggio**. Per ora questa e l'unica
azione rapida: non e disponibile l'aggiornamento collettivo di campi educativi.
Provenienza e destinazione sono determinate dai soci selezionati e mostrate
in sola lettura, senza menu di scelta. Selezioni miste, R/S e Co.Ca. sono
bloccate con un messaggio esplicito. La selezione comprende anche soci
non piu visibili dopo un cambio dei filtri; il conteggio lo segnala.
I campi educativi restano modificabili nella scheda individuale.
In R/S non ci sono sestiglie, squadriglie, ruoli,
specialita o brevetti; restano i campi del percorso R/S.

La successione e **L/C → E/G → R/S**, senza salti e senza passaggio automatico
da R/S a Co.Ca. Il capo della provenienza propone il passaggio; fino alla
conferma la branca locale non cambia. Un altro capo assegnato alla
destinazione puo confermare o rifiutare in **Passaggi in attesa**; la provenienza
puo annullare. L'amministratore gestisce tutte le branche e puo confermare
anche una propria proposta, inclusa la vista come capo della destinazione.
Il controllo di una persona diversa rimane per i capi non admin; le operazioni
in vista capo restano attribuite all'admin reale.
La scheda **Passaggi** indica il numero di proposte; nel Libro soci un
collegamento porta ai passaggi da accettare o rifiutare, anche se la lista soci
e vuota. Prima dell'ingresso, la destinazione vede solo nome,
codice e anno di nascita nella proposta, non la scheda completa.
La conferma conserva tutti i percorsi precedenti, senza modificare censimento
o account. Dopo il passaggio la provenienza perde l'accesso alla scheda.
Se un percorso precedente della destinazione conserva un gruppo nascosto o
un posto di capo/vice ora occupato, la conferma viene bloccata: ripristinare
il gruppo o liberare il posto prima di riprovare, senza sovrascrivere altri soci.
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
