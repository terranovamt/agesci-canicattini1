# Audit UI/UX del repository

## Ambito e stack rilevato

- Prodotto: sito e strumenti per l'assemblea del gruppo AGESCI Canicattini 1:
  home, area riservata, setup dei contenuti, regia live, presentazione pubblica
  e guida.
- Stack: HTML statico, CSS e JavaScript senza framework o bundler; pubblicazione
  su GitHub Pages. La regia usa Firebase; il setup salva `dati.js` tramite GitHub.
  Non ci sono `package.json`, Tailwind o component library. I test sono Node
  (`node --test tests/*.test.cjs`).
- Stili: fogli CSS distinti per home, setup, regia e presentazione; la
  presentazione carica un foglio comune e stili per slide orizzontali/verticali.
  I token CSS esistenti sono principalmente `--v`, `--vd`, `--y`, `--v2`,
  `--vl`, `--g`, `--r` e `--bg`.
- Identità ricavata dagli asset e dal codice: viola `#462678`, viola scuro
  `#211638`, giallo `#FDC500`; Montserrat nella presentazione e negli strumenti,
  con Georgia/serif per alcuni titoli della home e della presentazione. Asset
  esistenti, da non modificare: `Assemblea-di-Gruppo/img/logo-grande.png`,
  `Assemblea-di-Gruppo/img/logo.png` e `Assemblea-di-Gruppo/img/texture.svg`.
  Le specifiche di brand non compilate nella richiesta sono state quindi
  dedotte esclusivamente da questi riferimenti presenti nel repository.

## Pagine e componenti riutilizzabili

| Pagina / flusso | File principali | Elementi riutilizzabili |
|---|---|---|
| Home del gruppo | `index.html`, `home.css`, `home.js` | header/footer, hero con logo, CTA, stato assemblea |
| Accesso e gestione | `area-riservata.html`, `area-riservata.js` | form chiave, messaggio di stato, CTA e link di ritorno |
| Alias `/setup` | `setup.html` | redirect preservando query e hash |
| Setup contenuti | `Assemblea-di-Gruppo/setup.html`, `common/setup.css`, `common/setup.js` | header/stato, tab, form, campi, editor dialog, toast, barra azioni, dettagli/menu, lista riordinabile |
| Regia live | `Assemblea-di-Gruppo/regia.html`, `common/regia.css`, `common/regia.js` | header, badge, avviso, anteprime iframe, controlli slide, card, KPI, meter, form live, elenco slide |
| Presentazione pubblica | `Assemblea-di-Gruppo/index.html`, `common/base.css`, `portrait/base.css`, `landscape/`, `portrait/` | palco, barra titolo, navigazione/progresso, righe e card; varianti per decine di tipi di slide e due orientamenti |
| Guida | `Assemblea-di-Gruppo/guida.html` | header sticky, hero, indice, sezioni, card, tabelle, note, pulsanti |

## Riscontri e priorità

### Alta

- **Accessibilità tastiera/focus non uniforme.** La home espone un focus visibile
  sulla CTA e il setup evidenzia input e textarea; la regia non definisce uno
  stile focus generale per pulsanti/link. La lista slide della regia usa `<li>`
  cliccabili con hover e `cursor: pointer`, senza semantica/focus da tastiera
  visibile. Verificare che ogni azione sia raggiungibile e comprensibile da
  tastiera prima di modificare la struttura esistente.
- **Contrasto di alcuni colori di stato.** Misure WCAG calcolate sui colori
  correnti: `#462678` su `#F4F1EA` 10,29:1; `#6B478D` su `#F4F1EA` 6,40:1;
  `#211638` su `#FDC500` 10,65:1. Invece bianco su verde `#21A067` è 3,34:1,
  bianco su rosso `#E74030` 4,06:1, e `#AEB0D9` su bianco 2,10:1: non usare
  queste combinazioni per testo normale o indicatori essenziali senza
  correggere il contrasto mantenendo la palette.
- **Animazioni senza riduzione del movimento.** La presentazione usa transizioni
  di slide e la regia anima la spia live; non è stato trovato
  `prefers-reduced-motion` nei fogli CSS esaminati. Ridurre/disattivare solo gli
  effetti decorativi e mantenere invariato lo stato funzionale.
- **Responsive degli strumenti amministrativi da provare.** Il setup interviene
  a 520 px, la regia passa a una colonna a 900 px. La barra fissa del setup,
  tab, form e anteprime regia vanno verificati ai viewport 375, 768, 1024 e
  1440 px, in particolare per evitare sovrapposizioni e scroll orizzontale.

### Media

- **Valori visivi ripetuti tra fogli e pagine.** Palette e superfici sono
  dichiarate separatamente in `home.css`, `common/setup.css`,
  `common/regia.css`, `common/base.css` e negli stili inline della guida. Le
  slide hanno anche geometrie fisse 1280×720, intenzionali per la scalatura del
  palco; non vanno convertite indiscriminatamente in valori fluidi.
- **Testi lunghi nel setup.** `.ord .t b` e `.ord .t small` vengono troncati a
  una riga con ellissi. Provare nomi e titoli lunghi su schermi piccoli e
  garantire un modo accessibile per leggere il valore intero.
- **Gerarchia e densità.** Home e guida hanno un'impostazione centrata e
  leggibile; regia e setup sono strumenti densi ma già raggruppati in card.
  Migliorare spaziatura, distinzione delle azioni primarie e leggibilità senza
  spostare controlli che supportano il flusso operativo durante il live.
- **Inventario dei valori letterali.** La ricerca ampia di colori hex,
  dimensioni `px`, font, focus e breakpoint ha restituito 756 occorrenze in
  48 file CSS/HTML/JS. Il totale include coordinate e misure dei layout delle
  slide, non equivale a 756 colori: i valori vanno classificati per contesto e
  convertiti in token solo quando sono davvero condivisi.

### Bassa

- La home combina system font e Georgia mentre gli strumenti usano Montserrat;
  preservare questa distinzione esistente salvo una decisione esplicita di
  brand.
- La guida usa glifi/emoji come etichette decorative e descrive comandi con
  glifi testuali. Rivedere gli elementi che funzionano da icone, evitando di
  sostituire contenuti editoriali o simboli non interattivi in modo meccanico.
- È presente un solo tema chiaro; non risultano regole `prefers-color-scheme`
  o tema scuro. Non introdurre una nuova modalità senza requisiti di brand e
  verifica completa di presentazione, regia e setup.

## Piano di migrazione per batch

1. **Token e componenti base:** consolidare i token esistenti senza creare una
   palette parallela; definire stati coerenti per pulsanti, input, card, dialog,
   focus e movimento ridotto.
2. **Layout globali strumenti:** allineare home/accesso, header, footer, barra
   fissa, regia e setup; migliorare responsività senza modificare flussi o
   nomi/strutture dei dati.
3. **Presentazione e guida:** applicare le regole comuni alle superfici
   pubbliche e alla guida, mantenendo loghi, texture, layout proiettore/PDF e
   comportamento verticale.
4. **Slide in batch mirati:** uniformare i tipi di slide dove i test e
   l'ispezione mostrano incoerenze, senza riscrivere le geometrie che dipendono
   dal palco 1280×720. Verificare ciascun batch con la suite Node e test visuali
   ai viewport disponibili.

## Limiti dell'audit

- La verifica visiva nei browser alle quattro larghezze richieste e il controllo
  di ogni tipo di slide restano da eseguire durante i batch; il repository
  contiene un test mobile basato su Chromium che viene saltato se il browser non
  è disponibile.
- La richiesta lascia nome, colori, font e tono del brand come segnaposto; i
  valori sopra sono quelli rilevati nel codice e negli asset e prevalgono sulle
  raccomandazioni generiche della skill.
