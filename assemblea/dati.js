// =========================================================================
// DATI.JS - ASSEMBLEA DI GRUPPO
// Salva il file: la presentazione si ricostruisce da sola, con controllo ogni 2 secondi.
// =========================================================================

// COME È ORGANIZZATO IL FILE, dall'alto in basso:
// 1. DATI GENERALI: anno, data e orari.
// 2. SLIDE: l'ordine qui determina l'ordine della presentazione.
// 3. CENSIMENTI: soci censiti e presenti, usati nella slide quorum.
// 4. BILANCIO: entrate, uscite e storico avanzo.
// 5. PATRIMONIO: casse, conto corrente e beni durevoli.

// COME SI MODIFICA LA PRESENTAZIONE:
// - Per spostare una slide, taglia e incolla il suo blocco { ... }.
// - Per duplicarla, copia il blocco.
// - Per eliminarla, cancella il blocco.
// - Per saltarla senza cancellarla, aggiungi "nascosta": true.
// - Per collegarla all'ODG, assegna alla slide un "id": "nome" e inserisci "slide_collegata": "nome" nel punto dell'ODG.
// - Ogni blocco è separato dal successivo da una virgola.
// - Per andare a capo nei titoli usa <br>; per il grassetto usa <b>testo</b>.

// PARAMETRI VALIDI PER TUTTE LE SLIDE:
// - "id": nome da usare per collegare la slide, opzionale.
// - "nascosta": true per saltare la slide, opzionale.
// - "titolo_barra": testo nella barra viola in alto, opzionale dove è presente la barra.

// TIPI DI SLIDE E PARAMETRI:
// - slide_qr_live: { titolo, sottotitolo, data_ora, immagine }; QR (../assets/img/qr.svg) e conto alla rovescia fino a "data_ora" (es. "2026-11-20T20:30:00"); tutti i parametri sono opzionali.
// - slide_titolo: { titolo, sottotitolo }.
// - slide_divisore_sezione: { titolo, sottotitolo }; se il sottotitolo manca, mostra il titolo dell'assemblea.
// - slide_ordine_del_giorno: { punti: [ { testo, slide_collegata } ] }.
// - slide_avanzamento_odg: { completati: N }; i primi N punti sono contrassegnati come "FATTI".
// - slide_quorum_convocazioni: { convocazioni: [ { nome, orario, regola, riferimento_articolo } ] }; gli orari mostrati provengono da "assemblea".
// - slide_composizione_organo: { persone: [ { ruolo, icona, nome, nota } ], nota_generale }; "nota_generale" è opzionale.
// - slide_testo_articoli: { articoli: [ { titolo, paragrafi: [ ... ] } ] }.
// - Nei paragrafi di slide_testo_articoli, usa una stringa per il testo semplice oppure { testo, sottopunti: ["a", "b"] }; la dimensione del testo si adatta automaticamente.
// - slide_modifiche_documento: { titolo, prima, dopo, nota, etichetta_prima, etichetta_dopo }; "nota", "etichetta_prima" ed "etichetta_dopo" sono opzionali.
// - In slide_modifiche_documento, "prima" è il testo attuale a sinistra e "dopo" è il testo proposto a destra.
// - Al clic, le differenze vengono evidenziate: rosso barrato per il testo tolto, verde per il testo aggiunto.
// - Il confronto è parola per parola: "50%" e "50%," sono considerate parole diverse.
// - slide_rendiconto_entrate_uscite: nessun parametro, usa i dati di BILANCIO.
// - slide_rendiconto_scontrino_esito: nessun parametro.
// - slide_rendiconto_andamento_avanzo: nessun parametro.
// - slide_patrimonio_barre: nessun parametro, usa i dati di PATRIMONIO.
// - slide_patrimonio_ciambella: nessun parametro.
// - slide_foto_gruppo: usa il file "../assets/img/foto-gruppo.jpg".
// - slide_grazie: { testo }; se manca, il testo predefinito è "Grazie".

window.DATI = {
  // 1. DATI GENERALI
  "anno_esercizio": 2026,

  "assemblea": {
    "data": "20 Novembre 2026",
    "titolo": "Assemblea di Gruppo 2026",
    "prima_convocazione": "20:30",
    "seconda_convocazione": "21:00"
  },

  // 2. SLIDE: l'ordine di questa lista determina l'ordine della presentazione.
  "slide": [
    {
      "tipo": "slide_divisore_sezione",
      "titolo": "Inizio",
      "sottotitolo": "",
      "nascosta": true
    },
    // Slide 0: QR code e conto alla rovescia
    { "tipo": "slide_qr_live", "data_ora": "2026-11-20T20:30:00" },

    // Apertura
    {
      "tipo": "slide_titolo",
      "titolo": "Assemblea<br><b>di GRUPPO </b><br>2026",
      "sottotitolo": ""
    },

    // Ordine del giorno e quorum
    {
      "tipo": "slide_ordine_del_giorno",
      "punti": [
        { "testo": "Composizione organo assembleare", "slide_collegata": "organo" },
        { "testo": "Presentazione del Regolamento assembleare", "slide_collegata": "regolamento" },
        { "testo": "Conto Economico Consuntivo 2025-2026", "slide_collegata": "bilancio" },
        { "testo": "Elezione dell’organo esecutivo e di amministrazione del Gruppo 2026/2027", "slide_collegata": "esecutivo" },
        { "testo": "Contributo economico aggiuntivo destinato al Gruppo", "slide_collegata": "contributo" }
      ]
    },
    {
      "tipo": "slide_quorum_convocazioni",
      "convocazioni": [
        { "nome": "Prima convocazione", "orario": "20:30", "regola": "Valida con il 50% + 1 degli aventi diritto", "riferimento_articolo": "Art. 4" },
        { "nome": "Seconda convocazione", "orario": "21:00", "regola": "Valida con qualsiasi numero di presenti", "riferimento_articolo": "Art. 4" }
      ]
    },

    // Punto 1: composizione organo assembleare
    {
      "tipo": "slide_divisore_sezione",
      "id": "organo",
      "titolo": "Composizione<br>Organo Assembleare"
    },
    {
      "tipo": "slide_composizione_organo",
      "persone": [
        { "ruolo": "Presidente", "icona": "🎙️", "nome": "[NOME]", "nota": "" },
        { "ruolo": "Scrutatore", "icona": "🗳️", "nome": "[NOME 1]", "nota": "" },
        { "ruolo": "Scrutatore", "icona": "🗳️", "nome": "[NOME 2]", "nota": "" },
        { "ruolo": "Segretario", "icona": "✍️", "nome": "Matteo<br>Terranova", "nota": "Proposto dai Capi Gruppo" }
      ]
    },
    { "tipo": "slide_avanzamento_odg", "completati": 1 }, // Punto 1 fatto

    // Punto 2: regolamento assembleare
    {
      "tipo": "slide_divisore_sezione",
      "id": "regolamento",
      "titolo": "Regolamento<br>Assembleare"
    },
    {
      "tipo": "slide_testo_articoli",
      "articoli": [
        {
          "titolo": "Art. 1 – Funzioni e composizione",
          "paragrafi": [
            {
              "testo": "Le funzioni dell’Assemblea di Gruppo sono definite dagli art. 23 e 29 dello Statuto. In particolare, l’Assemblea:",
              "sottopunti": [
                "elegge la Comunità capi, esclusivamente per l’espletamento dei compiti dell’organo esecutivo e di amministrazione del livello di Gruppo, di cui all’art. 30 comma 2 dello Statuto;",
                "approva il bilancio dell’esercizio precedentemente concluso;",
                "delibera la quota associativa di Gruppo."
              ]
            },
            "L’Assemblea di Gruppo è composta da tutti i soci appartenenti al Gruppo; i soci minorenni sono rappresentati da coloro che ne esercitano la responsabilità genitoriale."
          ]
        }
      ]
    },
    {
      "tipo": "slide_testo_articoli",
      "articoli": [
        {
          "titolo": "Art. 4 – Costituzione dell’Assemblea",
          "paragrafi": [
            "L’Assemblea è validamente costituita con la presenza del 50% più uno degli aventi diritto, cioè gli associati regolarmente censiti al giorno in cui si tiene l’Assemblea.",
            "Sono considerati presenti coloro che sono iscritti e registrati personalmente presso la Segreteria dell’Assemblea.",
            "Qualora l’Assemblea non risulti validamente costituita verrà convocata nuovamente con le modalità sopra esposte nello stesso giorno, con validità indipendente dal numero degli aventi diritto presenti.",
            "L’Assemblea può essere svolta anche avvalendosi dei mezzi telematici secondo quanto previsto dall’art. 23 comma 8 dello Statuto."
          ]
        }
      ]
    },
    {
      // Due articoli brevi nella stessa slide
      "tipo": "slide_testo_articoli",
      "articoli": [
        {
          "titolo": "Art. 5 – Delega",
          "paragrafi": [
            "Non è ammessa alcuna forma di delega."
          ]
        },
        {
          "titolo": "Art. 6 – Ufficio di presidenza",
          "paragrafi": [
            {
              "testo": "All’inizio dei lavori l’Assemblea procede a:",
              "sottopunti": [
                "ratificare, con voto palese, la nomina del Presidente e di un Segretario, su proposta dei Capi Gruppo;",
                "ratificare, con voto palese, la nomina di uno o più scrutatori, su proposta del Presidente."
              ]
            },
            "I Capi Gruppo non possono far parte dell’Ufficio di Presidenza, mentre gli altri membri della Comunità capi possono ricoprire i ruoli di Segretario e scrutatore/i."
          ]
        }
      ]
    },
    {
      "tipo": "slide_testo_articoli",
      "articoli": [
        {
          "titolo": "Art. 8 – Funzioni del Segretario e verbalizzazione",
          "paragrafi": [
            "Il Segretario ha il compito di redigere il verbale che deve indicare un breve cenno dei fatti, l’enunciazione delle questioni proposte e le deliberazioni dell’Assemblea; qualora queste siano redatte in forma scritta, al verbale dovrà essere allegata copia.",
            "Ogni avente diritto può richiedere che si inserisca nel resoconto per intero una sua dichiarazione.",
            "Il verbale, firmato per presa visione dal Presidente della sessione e dai Capi Gruppo, è conservato a cura della Comunità capi, come previsto dall’art. 25 del Regolamento associativo."
          ]
        }
      ]
    },
    {
      "tipo": "slide_testo_articoli",
      "articoli": [
        {
          "titolo": "Art. 11 – Diritto di parola",
          "paragrafi": [
            "Nella discussione nessuno può prendere la parola se non dopo averla ottenuta dal Presidente.",
            "Il Presidente può altresì revocare la facoltà di parlare quando l’intervento non sia pertinente all’argomento in discussione o per necessità funzionali allo svolgimento assembleare, anche eventualmente contingentando i tempi dell’intervento.",
            "Coloro che chiedono di parlare hanno la parola – salvo diverso avviso del Presidente – nell’ordine di iscrizione."
          ]
        }
      ]
    },
    {
      "tipo": "slide_testo_articoli",
      "articoli": [
        {
          "titolo": "Art. 15 – Diritto di voto",
          "paragrafi": [
            "Ciascun membro dell’Assemblea ha diritto ad un voto.",
            "Per gli associati minorenni, il cui voto è espresso da coloro che esercitano la responsabilità genitoriale.",
            "Per gli associati minorenni, anche se presenti più persone che esercitano la responsabilità genitoriale, il voto sarà sempre uno, poiché riferito appunto al singolo socio."
          ]
        }
      ]
    },

    // Modifiche al regolamento: rosso = tolto, verde = aggiunto.
    // Per usare questa slide, imposta "nascosta": false oppure elimina la riga "nascosta".
    // Modifica "titolo", "prima" e "dopo"; copia il blocco per aggiungere altre modifiche.
    {
      "nascosta": true,
      "tipo": "slide_modifiche_documento",
      "titolo": "Art. 5 – Delega",
      "titolo_barra": "MODIFICHE AL REGOLAMENTO",
      "etichetta_prima": "TESTO ATTUALE",
      "etichetta_dopo": "TESTO PROPOSTO",
      "prima": "Non è ammessa alcuna forma di delega.",
      "dopo": "È ammessa una sola delega per ciascun avente diritto, conferita per iscritto.",
      "nota": "Clicca per evidenziare le differenze"
    },
    {
      "nascosta": true,
      "tipo": "slide_modifiche_documento",
      "titolo": "Art. 6 – Ufficio di presidenza",
      "titolo_barra": "MODIFICHE AL REGOLAMENTO",
      "etichetta_prima": "TESTO ATTUALE",
      "etichetta_dopo": "TESTO PROPOSTO",
      "prima": "I Capi Gruppo non possono far parte dell’Ufficio di Presidenza, mentre gli altri membri della Comunità capi possono ricoprire i ruoli di Segretario e scrutatore/i.",
      "dopo": "I Capi Gruppo non possono far parte dell’Ufficio di Presidenza, mentre gli altri membri della Comunità capi possono ricoprire il ruolo di Segretario.",
      "nota": "Clicca per evidenziare le differenze"
    },

    { "tipo": "slide_avanzamento_odg", "completati": 2 }, // Punto 2 fatto

    // Punto 3: bilancio consuntivo
    {
      "tipo": "slide_divisore_sezione",
      "id": "bilancio",
      "titolo": "BILANCIO<br>CONSUNTIVO"
    },
    { "tipo": "slide_rendiconto_entrate_uscite" },
    { "tipo": "slide_rendiconto_scontrino_esito" },
    { "tipo": "slide_rendiconto_andamento_avanzo" },
    { "tipo": "slide_patrimonio_barre" },
    { "tipo": "slide_patrimonio_ciambella" },
    { "tipo": "slide_foto_gruppo" },
    { "tipo": "slide_grazie" },
    { "tipo": "slide_foto_gruppo" },
    {
      "tipo": "slide_divisore_sezione",
      "titolo": "Votazione<br>Bilancio"
    },
    { "tipo": "slide_avanzamento_odg", "completati": 3 }, // Punto 3 fatto

    // Punto 4: organo esecutivo
    {
      "tipo": "slide_divisore_sezione",
      "id": "esecutivo",
      "titolo": "Organo<br>Esecutivo"
    },

    // Progetto Educativo di Gruppo 2026-2028
    {
      "id": "pe_apertura",
      "tipo": "slide_divisore_sezione",
      "titolo": "Progetto Educativo di Gruppo",
      "sottotitolo": "Educare alla scelta · 2026-2028"
    },
    {
      "id": "pe_cambio_date",
      "tipo": "slide_cambio_date",
      "titolo_barra": "ALLINEAMENTO ANNO SCOUT",
      "pannello": {
        "etichetta": "NOMENCLATURA",
        "titolo": "Il PEG si allinea all’anno scout",
        "testo": "L'anno scout prende come riferimento il secondo anno del bienno, anno 2027/2028 "
      },
      "etichetta_prima": "PRIMA",
      "prima": "2025 – 2027",
      "etichetta_dopo": "DOPO",
      "dopo": "2026 – 2028"
    },
    {
      "id": "pe_differenze",
      "tipo": "slide_differenze",
      "titolo_barra": "PROGETTO EDUCATIVO 2026-2028: COSA CAMBIA",
      "colonne": [
        {
          "titolo": "Resta uguale",
          "sottotitolo": "TUTTO IL RESTO",
          "colore": "var(--g)",
          "simbolo": "✓",
          "larghezza": 330,
          "voci": [
            "Premessa",
            "Analisi esterna",
            "Analisi interna – Branca L/C",
            "Fondamenta del progetto",
            "Le 3 aree, gli obiettivi e i percorsi"
          ]
        },
        {
          "titolo": "Cambia",
          "sottotitolo": "ANALISI INTERNA",
          "colore": "var(--y)",
          "larghezza": 834,
          "voci": [
            "<b>Branca E/G · il reparto:</b> tolta la composizione delle squadriglie (2 maschili e 3 femminili) e il passaggio al noviziato-clan",
            "<b>Branca E/G · i ragazzi:</b> aggiunta qualche criticità (motivazione limitata, ma buona partecipazione)",
            "<b>Branca E/G · coeducazione e fede:</b> la fede come scelta, la vita all’aria aperta",
            "<b>Branca R/S:</b> tolto il passaggio sul rinnovo della comunità e sui tanti novizi"
          ]
        }
      ],
      "nota": { "etichetta": "RITOCCHI MINORI", "testo": "errori lessicali e impaginazione" }
    },
    {
      "id": "pe_diff_eg_reparto",
      "tipo": "slide_prima_dopo",
      "titolo_barra": "2026-2028 · COME ERA, COME DIVENTA",
      "titolo": "Analisi interna › Branca E/G › 1ª parte: il reparto",
      "prima": "Il Reparto misto “Cassarino-Ciarcià” è composto da cinque squadriglie, 2 maschili e 3 femminili. In questo nuovo anno scout abbiamo avuto il passaggio di molti ragazzi di ultimo anno al noviziato - clan e, pertanto, ci ritroviamo con un reparto molto giovane e con tanti novizi provenienti dal branco. Lo staff di reparto ha deciso di lavorare molto sul Con.Ca e sulle relazioni all’interno delle squadriglie e del reparto tutto.",
      "dopo": "Il Reparto misto “Cassarino-Ciarcià” è composto da cinque squadriglie. Lo staff di reparto ha deciso di concentrarsi sul lavoro con il Con.Ca e sul rafforzamento delle relazioni all’interno delle squadriglie e dell’intero reparto.",
      "etichetta_prima": "COME ERA",
      "etichetta_dopo": "COME DIVENTA"
    },
    {
      "id": "pe_diff_eg_ragazzi",
      "tipo": "slide_prima_dopo",
      "titolo_barra": "2026-2028 · COME ERA, COME DIVENTA",
      "titolo": "Analisi interna › Branca E/G › 2ª parte: i ragazzi",
      "prima": "In generale, i nostri ragazzi comunque sembrano abbastanza motivati e desiderosi di affrontare nuove avventure, cercando nel capo una figura di riferimento con cui confrontarsi e sentirsi compresi. Nonostante riscontrino molteplici problematiche in famiglia, scuola e nei diversi contesti ricreativi, non manca in loro la fantasia e la voglia di mettersi in gioco, dimostrando grande partecipazione durante le attività.",
      "dopo": "In generale, i ragazzi mostrano una motivazione e un desiderio di avventura limitati, apparendo a volte svogliati e carenti di spirito di iniziativa, cercando nel capo una figura di riferimento con cui confrontarsi e sentirsi compresi. Nonostante riscontrino molteplici problematiche in famiglia, scuola e nei diversi contesti ricreativi, dimostrano comunque una buona partecipazione durante le attività.",
      "etichetta_prima": "COME ERA",
      "etichetta_dopo": "COME DIVENTA"
    },
    {
      "id": "pe_diff_eg_fede",
      "tipo": "slide_prima_dopo",
      "titolo_barra": "2026-2028 · COME ERA, COME DIVENTA",
      "titolo": "Analisi interna › Branca E/G › 3ª parte: coeducazione e fede",
      "prima": "Purtroppo, si riscontra una scarsa collaborazione nella coeducazione con i genitori e con le altre realtà educative. Inoltre, dopo aver ricevuto i sacramenti della prima Comunione e della Santa Cresima, si nota un allontanamento dalla Chiesa e una minore testimonianza della propria fede. Cercheremo di lavorare sulle lacune riscontrate per una sana crescita e autonomia dei nostri ragazzi.",
      "dopo": "Purtroppo, si rileva una scarsa collaborazione nella coeducazione con i genitori e con le altre realtà educative. Inoltre, dopo aver ricevuto i sacramenti della prima Comunione e della Santa Cresima, si nota un progressivo allontanamento dalla Chiesa e una minore testimonianza della propria fede. L’obbiettivo sarà lavorare sulle lacune riscontrate per favorire una sana crescita e autonomia dei ragazzi valorizzando la vita all’aria aperta secondo la metodologia della branca.",
      "etichetta_prima": "COME ERA",
      "etichetta_dopo": "COME DIVENTA"
    },
    {
      "id": "pe_diff_rs",
      "tipo": "slide_prima_dopo",
      "titolo_barra": "2026-2028 · COME ERA, COME DIVENTA",
      "titolo": "Analisi interna › Branca R/S › prima parte: la comunità",
      "prima": "La Branca RS “Falchi Pellegrini” è composta da Clan e Noviziato, accogliendo ragazzi e ragazze che hanno intrapreso il loro cammino scout sin dai lupetti e che, pur con qualche discontinuità hanno vissuto l’esperienza scout. […] Si tratta di una comunità che nell’ultimo anno si è fortemente rinnovata, in quanto gran parte dei ragazzi vive fuori sede per motivi di studio e che si basa soprattutto su un elevato numero di novizi che ancora devono coltivare il senso di appartenenza alla comunità R/S.",
      "dopo": "La Branca RS “Falchi Pellegrini” accoglie ragazzi e ragazze che hanno intrapreso il loro cammino scout sin dai lupetti e che, pur con qualche discontinuità hanno vissuto l’esperienza scout. […]",
      "etichetta_prima": "COME ERA",
      "etichetta_dopo": "COME DIVENTA",
      "nota": "[…] = parte intermedia del testo, rimasta invariata."
    },
    {
      "id": "pe_area1",
      "tipo": "slide_area_obiettivi",
      "numero": "1",
      "titolo": "Educare alla scelta giusta",
      "colore": "var(--v)",
      "citazione": "Ogni giorno, quello che scegli, quello che pensi e quello che fai è ciò che diventi.",
      "autore": "Eraclito",
      "obiettivi": [
        {
          "titolo": "Valorizzare i principi dello scoutismo",
          "percorso": "Costruire la propria vita secondo i valori proposti dallo scoutismo"
        },
        { "titolo": "Sviluppare abilità decisionali", "percorso": "Fornire strumenti per prendere decisioni" },
        {
          "titolo": "Attuare la scelta consapevole",
          "percorso": "Sostenere il ragazzo a raggiungere autonomamente una scelta responsabile"
        }
      ]
    },
    {
      "id": "pe_area2",
      "tipo": "slide_area_obiettivi",
      "numero": "2",
      "titolo": "Custodi del nostro tempo",
      "colore": "var(--v)",
      "citazione": "La Terra va contemplata e protetta e spetta a ciascuno di noi.",
      "autore": "Papa Francesco",
      "obiettivi": [
        {
          "titolo": "Riscoprire le radici",
          "percorso": "Riscoprire le nostre radici, conoscendo il nostro territorio in tutti i suoi aspetti, dall’ambiente, alla cultura, alle tradizioni"
        },
        {
          "titolo": "Cambiare se stessi",
          "percorso": "Modificare il proprio stile di vita in un’ottica di rispetto, salvaguardia e cura del Creato"
        }
      ]
    },
    {
      "id": "pe_area3",
      "tipo": "slide_area_obiettivi",
      "numero": "3",
      "titolo": "Futuri cittadini attivi",
      "colore": "var(--v)",
      "citazione": "La cittadinanza è un atteggiamento, uno stato d’animo, una convinzione che il tutto sia più grande della parte…",
      "autore": "Robert A. Heinlein",
      "obiettivi": [
        {
          "titolo": "Io nella società d’oggi",
          "percorso": "Educare alla conoscenza e valorizzazione del ruolo che ognuno ricopre nella realtà che lo circonda, per meglio conoscere, anche, come è organizzata la società di oggi"
        },
        { "titolo": "Io con gli altri", "percorso": "Educare all’accoglienza, integrazione ed inclusione" },
        {
          "titolo": "Fare rete",
          "percorso": "Condividere esperienze, intrecciare solidi rapporti con tutte le realtà e “gli attori” del nostro territorio"
        }
      ]
    },
    {
      "tipo": "slide_divisore_sezione",
      "titolo": "Votazione<br>Organo Esecutivo"
    },
    { "tipo": "slide_avanzamento_odg", "completati": 4 }, // Punto 4 fatto

    // Punto 5: contributo economico
    {
      "tipo": "slide_divisore_sezione",
      "id": "contributo",
      "titolo": "Contributo Economico<br>Integrativo di Gruppo"
    },
    { "tipo": "slide_divisore_sezione", "titolo": "Votazione<br>Contributo Economico" },
    { "tipo": "slide_avanzamento_odg", "completati": 5 }, // Punto 5 fatto: tutto completato

    // Chiusura
    { "tipo": "slide_chiusura", "titolo": "Assemblea conclusa", "sottotitolo": "Grazie a tutti!" },
    { "tipo": "slide_grazie" },
    { "tipo": "slide_foto_gruppo" },
    {
      "tipo": "slide_titolo",
      "titolo": "Assemblea<br><b>di GRUPPO </b><br>2026",
      "sottotitolo": ""
    }
  ],

  // 3. CENSIMENTI: dati usati dalla slide quorum.
  // "censiti_attuali" indica i soci censiti il giorno dell'assemblea.
  // "presenti_attuali" indica i presenti in sala; lascia null finché non lo sai.
  // Il quorum del 50% + 1 si calcola automaticamente.
  // I numeri sono di esempio: sostituiscili con i dati corretti.
  // Se cancelli tutto il blocco, la slide quorum mostra solo le due carte.
  "censimenti": {
    "censiti_attuali": 100,
    "presenti_attuali": null,
    "storico_per_anno": {
      "2022": { "censiti": 95, "presenti": 29 },
      "2023": { "censiti": 109, "presenti": 20 },
      "2024": { "censiti": 104, "presenti": 20 },
      "2025": { "censiti": 100, "presenti": 32 }
    }
  },

  // 4. BILANCIO.
  // "importo" è l'importo dell'anno corrente.
  // "importo_anno_precedente" è l'importo dell'anno precedente.
  // Per aggiungere una voce, copia una riga { ... }; le slide si adattano.
  // Soglie percentuali delle fasce dell'esito sulle entrate: pareggio, piccolo, medio.
  "soglie_percentuali_esito": [5, 10, 20],

  "entrate": [
    { "descrizione": "Entrate dagli associati<br>(uscite, campi e uniformi)", "importo": 9665.00, "importo_anno_precedente": 16835.20 },
    { "descrizione": "Quote associative", "importo": 4520.00, "importo_anno_precedente": 4315.00 },
    { "descrizione": "Erogazioni liberali (ristorni zona/regione, donazioni, contributi)", "importo": 32.30, "importo_anno_precedente": 700 },
    { "descrizione": "Raccolta fondi occasionali", "importo": 4607.60, "importo_anno_precedente": 2543 },
    { "descrizione": "Da rapporti bancari", "importo": 0.00, "importo_anno_precedente": 0 }
  ],

  "uscite": [
    { "descrizione": "Materie prime, sussidiarie, di consumi e di merci (beni non durevoli)", "importo": 3093.67, "importo_anno_precedente": 2104.5 },
    { "descrizione": "Servizi (spese per campo e attività, uniformi, censimenti)", "importo": 7767.59, "importo_anno_precedente": 15407.32 },
    { "descrizione": "Godimento beni terzi (Affitti)", "importo": 1500.00, "importo_anno_precedente": 2632 },
    { "descrizione": "Uscite diverse di gestione (Censimenti)", "importo": 4011.00, "importo_anno_precedente": 4044 },
    { "descrizione": "Uscite per raccolta fondi occasionali", "importo": 1109.80, "importo_anno_precedente": 250 }
  ],

  // Avanzo (+) o disavanzo (−) degli anni passati.
  // L'avanzo o disavanzo dell'anno corrente si calcola automaticamente: entrate meno uscite.
  "storico_avanzo_per_anno": {
    "2020": -713.25,
    "2021": 774.10,
    "2022": -115.99,
    "2023": 1649.34,
    "2024": -665.70,
    "2025": -45.12
  },

  // 5. PATRIMONIO.
  // Attenzione: la slide a ciambella si aspetta sempre queste sei voci, in quest'ordine:
  // 0 Beni durevoli, 1 Co.Ca., 2 L/C, 3 E/G, 4 R/S, 5 C/C.
  // Non cambiare l'ordine e non rimuovere voci: modifica solo gli importi.
  // "colore_css" indica il colore della barra; le variabili sono definite nell'HTML.
  "patrimonio": {
    "anno_precedente": 2025,
    "anno_corrente": 2026,
    "data_riferimento": "30 Settembre",
    "voci": [
      { "nome": "Beni Durevoli", "icona": "../assets/img/casa.png", "colore_css": "--vl", "importo_anno_precedente": 279, "importo_anno_corrente": 279 },
      { "nome": "Cassa di Co.Ca.", "icona": "../assets/img/coca.png", "colore_css": "--v2", "importo_anno_precedente": 0, "importo_anno_corrente": 0 },
      { "nome": "Cassa branca L/C", "icona": "../assets/img/lc.png", "colore_css": "--y", "importo_anno_precedente": 505.43, "importo_anno_corrente": 587.72 },
      { "nome": "Cassa branca E/G", "icona": "../assets/img/eg.png", "colore_css": "--g", "importo_anno_precedente": 522.22, "importo_anno_corrente": 1423.25 },
      { "nome": "Cassa branca R/S", "icona": "../assets/img/rs.png", "colore_css": "--r", "importo_anno_precedente": 56.5, "importo_anno_corrente": 97.75 },
      { "nome": "C/C di gruppo", "icona": "../assets/img/cc.png", "colore_css": "--v", "importo_anno_precedente": 1622, "importo_anno_corrente": 1790.27 }
    ]
  },

  "nota_beni_durevoli": "Beni durevoli: Stampante 279,00€ (in dote al gruppo dal bilancio Settembre 2024)"
};