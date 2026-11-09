# Synology: solo i passaggi da fare sul NAS

Il pacchetto e' pronto per Container Manager. Non servono Git, SSH, Python
installato sul NAS o comandi da terminale. Serve accesso Internet dal NAS
per scaricare le immagini Node e Nginx durante la prima creazione.

## 1. Carica il pacchetto e compila due valori

In **File Station**, carica il file ZIP nella cartella condivisa `docker` e
scegli **Estrai qui**. Apri la cartella estratta `canicattini1`.
Con Text Editor del NAS (o dal computer prima di caricarlo), apri `.env` e
compila solamente:

```dotenv
NAS_ADMIN_PASSWORD='la-tua-password-di-almeno-12-caratteri'
NAS_CAPO_CODES=codice1,codice2,codice3
```

I codici devono essere sette cifre, separati da virgole; sostituisci i
segnaposto con i tuoi codici reali. `1238005` e' gia' l'unico amministratore.
Indirizzo e sottocartella sono gia' configurati. Non cambiare i nomi dei file.
La password iniziale non viene sovrascritta agli aggiornamenti.

**Non mettere questa cartella in `web`**: `.env` contiene una password.
Limita i permessi della cartella agli amministratori del NAS.

**Se stai sostituendo un progetto NAS gia' in uso**, conserva il suo database:
aggiungi in `.env` anche `NAS_DATA_DIR` con il percorso dati della vecchia
installazione (il valore nel suo `nas.env`). Ferma il vecchio progetto prima
di avviare il nuovo: non devono usare contemporaneamente la stessa porta o
lo stesso database. Senza questa impostazione il pacchetto crea un database
nuovo nel proprio volume, non importa i salvataggi del progetto precedente.
Se avevi un'attivita' DSM che ricreava automaticamente il vecchio progetto,
disattivala prima della sostituzione per evitare che riparta. La sincronizzazione
oraria dei calendari resta un'attivita' separata, documentata in `DETTAGLI.md`:
puoi mantenerla se scrive nella stessa cartella dati.

## 2. Crea e avvia il progetto

In **Container Manager > Progetto > Crea**:

- Nome: `canicattini1`.
- Percorso: la cartella `docker/canicattini1` appena estratta.
- Origine: **Usa docker-compose.yml esistente** (la dicitura puo' variare).
- File: seleziona `docker-compose.yml`.

Conferma e avvia. Il progetto costruisce il container, crea il database e
importa automaticamente la password admin e i capi configurati.
Attendi che i container `app` e `web` siano **in esecuzione / healthy**.
`initialize-data` termina normalmente dopo aver preparato il volume del
database: nessun permesso o comando deve essere impostato a mano.
La porta locale riservata al progetto e' `8080`: se e' gia' occupata sul NAS,
scegli una porta libera nel lato sinistro di `127.0.0.1:8080:8080` e usa
la stessa porta nella destinazione del passo 3.

## 3. Collega l'indirizzo HTTPS

In **Pannello di controllo > Portale di accesso > Avanzate > Proxy inverso**,
crea (o adegua la regola che gestisce gia' questo hostname):

| Campo | Valore |
| --- | --- |
| Nome | Canicattini 1 |
| Origine / protocollo | HTTPS |
| Origine / hostname | terranovamtt.synology.me |
| Origine / porta | 443 |
| Destinazione / protocollo | HTTP |
| Destinazione / hostname | 127.0.0.1 |
| Destinazione / porta | 8080 |

In **Sicurezza > Certificato > Impostazioni**, assegna a questa regola il
certificato valido per `terranovamtt.synology.me`. Non occorre modificare
il router se l'indirizzo HTTPS e' gia' raggiungibile dall'esterno.
Non esporre la porta HTTP 8080 nel router.

La regola Synology instrada **l'intero hostname**, non soltanto una cartella:
il server conserva `/agesci-canicattini1/` internamente. Se lo stesso hostname
serve altre applicazioni o Web Station e non puoi sostituirne la regola
esistente, **non modificarla**: occorre integrare il percorso nel proxy che
lo gestisce gia' o assegnare un hostname separato. Il progetto non modifica
automaticamente DSM, Web Station, certificati o firewall.

Apri:

`https://terranovamtt.synology.me/agesci-canicattini1/index.html`

Entra nell'area riservata con `123 8005` e la password scritta in `.env`.
I capi configurati compaiono gia' nell'elenco: puoi completarne i nomi.

## Aggiornamenti successivi

Scarica il nuovo pacchetto. Ferma il progetto, sostituisci solo la cartella
`site` e, quando indicato, `docker-compose.yml`, poi scegli **Azione > Compila**
e avvia. **Conserva `.env` e il volume del database**: non eliminare il volume
`gruppo-data`. Nessuna nuova configurazione del proxy e' necessaria.
Per cambiare i codici modifica `.env` e ricrea il progetto senza cancellare
i volumi. Il file `DETTAGLI.md` contiene informazioni su sicurezza e backup.

## Account e sicurezza

Il database relazionale SQLite e' quello gia' presente sul branch `NAS`:
documenti, contenuti, statistiche e diretta restano gestiti localmente, senza
token GitHub o Firebase. Le credenziali sono hash scrypt con salt casuale
individuale; nessuna password e' leggibile dall'elenco persone.
Per gli account precedenti con password condivisa viene revocato l'accesso:
ora serve codice censimento e password personale.

Solo i capi presenti in `NAS_CAPO_CODES` possono accedere; i ragazzi non
hanno credenziali. I codici configurati vengono aggiunti come capi con nomi
provvisori, modificabili dall'amministratore. Togliere un codice da `.env`
revoca il login senza eliminare la persona. L'unico amministratore resta
`1238005`, sempre abilitato.

**Cancella password** revoca tutte le sessioni della persona e rende
obbligatorie password e conferma al prossimo accesso, anche per l'admin.
Il codice censimento non e' un segreto: supervisiona il primo accesso e i
reset, perche' chi conosce un codice abilitato senza password puo' attivarlo.
Non pubblicare dati personali, elenchi o `.env` nel repository.
