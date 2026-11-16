# Canzoniere

Il Canzoniere e' una sezione pubblica: le letture non richiedono login. I dati
strutturati risiedono nel `site.sqlite` gia' usato dal backend; testo e metadati
non sono fixture del sito, salvo brevi esempi inventati in
`tools/nas-demo.cjs`. Non aggiungere al repository testi reali o protetti.

## Modello e persistenza

All'avvio `server/canzoniere.cjs` crea le tabelle mancanti e applica una
migrazione versionata e idempotente. Non sostituisce le tabelle esistenti.
La prima migrazione inserisce una sola volta i tag per momento e branca e i
preset rapidi iniziali; le modifiche o eliminazioni successive non vengono
annullate al riavvio.

| Tabella | Contenuto |
| --- | --- |
| `canzoniere_songs` | slug stabile, record JSON, revisione |
| `canzoniere_tags` | slug, nome e categoria (`momento`, `branca`, `altro`) |
| `canzoniere_albums` | slug, titolo, autore, anno e note |
| `canzoniere_presets` | selettori per tag/canzoni e limite per i preset rapidi |
| `canzoniere_playlists` | titolo, descrizione, slug delle canzoni e stato pubblicazione |
| `canzoniere_migrations` | versioni applicate automaticamente |

Una canzone contiene titolo, autore, `albumSlug`, testo ChordPro, tonalita',
BPM, tempo (`4/4`, `3/4`, `6/8`), capotasto, battute per riga, note, fonte,
diritti e `tagSlugs`. I diritti ammessi sono `pubblico dominio`, `autorizzato`
e `da verificare`. Il testo viene mantenuto come testo semplice; l'interfaccia
deve inserirlo nel DOM come testo, non come HTML.

I tag iniziali sono Ingresso, Uscita, Fuoco di bivacco, Marcia, Preghiera,
Messa, Buonanotte, Giochi, Promessa, Chiusura e le branche L/C, E/G, R/S.
L'amministratore puo' aggiungere tag e altre categorie supportate.
I preset iniziali sono Uscita e Fuoco di bivacco.

## Modello JavaScript

`assets/js/canzoniere-model.js` e' condiviso tra browser e Node e non dipende
da framework. `parseChordPro` restituisce righe con testo, simboli di accordo
e posizioni in UTF-16, senza generare HTML; le direttive `{nome: valore}`
sono restituite separatamente. `transposeChord` e `transposeChordPro`
traspongono radice e basso degli accordi, lasciando intatte le etichette non
riconosciute. Sono riconosciute le note italiane e inglesi; `translateChordPro`
converte gli accordi e la direttiva di tonalita' tra le due notazioni senza
modificare testo, suffissi o bassi. La tonalita' usa la stessa trasposizione.

`secondsPerLine(song, speedPercent)` applica
`(battiti per battuta × battute per riga) × 60 / BPM × 100 / speedPercent`.
Il 100% e' la velocita' di riferimento: aumentare la percentuale riduce il
tempo per riga, diminuirla lo allunga. Per `6/8` il modello
conta sei battiti per battuta (BPM riferito alla suddivisione in ottavi).
Il valore iniziale di battute per riga e' 2; se manca il BPM il default e' 8
secondi per riga. La velocita' selezionabile va dal 50% al 200%.
La ricerca usa Unicode NFD, rimuove i segni diacritici e non distingue le
maiuscole.

## API

Prefisso: `/api/canzoniere` (il backend applica il prefisso di deploy
`/agesci-canicattini1`). Le letture sono pubbliche. L'endpoint di elenco
restituisce solo metadati; il dettaglio della canzone include il testo.

| Metodo | Percorso | Contratto |
| --- | --- | --- |
| GET | `/` | Tag, album, preset e sole scalette pubblicate |
| GET | `/songs` | Elenco paginato; `q`, `tag`, `album`, `branch`, `limit`, `offset`, `slugs` |
| GET | `/songs/:slug` | Scheda completa, incluso testo ChordPro |
| GET | `/tags`, `/albums`, `/presets` | Collezioni pubbliche |
| GET | `/playlists`, `/playlists/:slug` | Sole scalette pubblicate, anche con una sessione di capo |
| GET | `/manage` | Catalogo completo, incluse le bozze; riservato ad admin e capi con branca di servizio |
| POST | `/songs`, `/tags`, `/albums`, `/presets`, `/playlists` | Crea record; slug facoltativo e generato dal titolo |
| PATCH | `/:collection/:slug` | Aggiornamento completo/parziale con `revision` |
| DELETE | `/:collection/:slug` | Eliminazione con `revision` nel body |

Per piu' filtri `tag`, il risultato deve contenere tutte le tag selezionate;
album e branca si combinano con gli altri filtri. La ricerca cerca titolo,
autore e testo senza distinzione di accenti. Una scaletta pubblicata deve
contenere almeno una canzone. Se si elimina una canzone usata da una scaletta,
il riferimento viene rimosso; una scaletta rimasta vuota viene ritirata dalla
pubblicazione. Eliminazioni di tag e album rimuovono i rispettivi riferimenti.

Ogni scrittura richiede una sessione verificata di un amministratore o di un
capo con branca di servizio L/C, E/G o R/S. In **Visualizza come** valgono i
permessi effettivi del capo selezionato. Le scritture senza sessione o senza
branca di servizio restituiscono 403. Si applicano inoltre il controllo
same-origin del backend e le revisioni ottimistiche; revisioni obsolete
restituiscono 409. La rotta pubblica `/playlists` non mostra mai le bozze;
admin e capi le gestiscono tramite `/manage`.

## Pagine pubbliche

`canzoniere/index.html` e' l'elenco pubblico mobile-first, raggiungibile da
`/agesci-canicattini1/canzoniere/` e dalla navigazione della home. Cerca nel
titolo, nell'autore e nel testo, filtra per un tag, branca e album e carica
risultati successivi a blocchi; i dati arrivano solo dalle API, mai da testi
inclusi nell'HTML. Su telefono i filtri si aprono dal menu dedicato e i
risultati sono righe compatte cliccabili. La pagina pubblica non contiene
scaletta personale o generatore: mostra solo il catalogo e le scalette
pubblicate.
`canzoniere/canzone.html?slug=...` e' la scheda pubblica.

La scheda visualizza gli accordi sopra le posizioni ChordPro, permette di
nasconderli, trasporre tonalita' e accordi con ripristino all'originale,
convertire rapidamente gli accordi tra notazione ITA ed EN, regolare la
dimensione del testo, attivare il tema scuro e richiedere il Wake Lock quando
il browser lo supporta. Le impostazioni sono raggruppate in Accordi e tonalita',
Testo e schermo, Scorrimento automatico e Stampa. I brani brevi restano compatti;
quelli lunghi occupano l'area disponibile e mantengono lo scorrimento interno.
Su telefono tutte le impostazioni restano visibili in una colonna compatta;
su schermi ampi sono disposte in due colonne. Le righe sono ravvicinate e usano
tutta la larghezza utile. La dimensione predefinita si adatta al viewport e
cresce in orizzontale, mentre il cursore consente una regolazione manuale. Gli input di
ricerca e i risultati sono creati con API DOM e `textContent`; i caricamenti
segnalano `aria-busy`, e gli skeleton rispettano `prefers-reduced-motion`. Su
telefono il testo segue subito il titolo. Le impostazioni si aprono dal
pulsante in basso e si chiudono con lo stesso pulsante o con la X in alto; in
lettura i controlli rapidi IT/EN e avvio/pausa sono impilati in basso a destra.

Lo scorrimento automatico interpola gradualmente la posizione tra una riga e
la successiva per tutta la durata calcolata da BPM e `barsPerLine`; include un
countdown di tre secondi e una velocita' predefinita senza BPM. La percentuale
piu' alta accelera lo scorrimento. Con `prefers-reduced-motion` attivo avanza
una riga alla volta. Tocco o scorrimento manuale mettono in pausa. I capi
compongono la scaletta personale nell'area riservata; `localStorage` conserva
solo gli slug (chiave `agesci-canicattini1.canzoniere.playlist.v1`) e i link
`canzone.html?slugs=...` non contengono titoli o testi. Le scalette pubblicate
si aprono con `canzone.html?playlist=...`. La scheda
supporta la navigazione sequenziale e l'avanzamento automatico tra le canzoni.
Il Canzoniere pubblico mostra le canzoni e le sole scalette pubblicate; la home
mostra i preset rapidi e le scalette pubblicate. La stampa offre l'opzione di
includere gli accordi.

`area-riservata/canzoniere.html` e' l'interfaccia riservata agli amministratori
e ai capi con branca di servizio, raggiungibile dalla dashboard e dalla navbar
riservata. Offre anteprima ChordPro, conversione rapida ITA ⇄ EN degli
accordi, import locale con anteprima/conferma e aree di testo con altezza
limitata e scorrimento interno su telefono. Qui i capi trovano **La tua
scaletta** (salvata solo nel browser) e **Genera una scaletta**; l'editor
permette inoltre la gestione di canzoni, tag, album, preset e scalette
pubblicate o in bozza, oltre al backup JSON e all'esportazione `.cho`.
Il server resta l'autorita' per ogni permesso; le revisioni ottimistiche
ripristinano lo snapshot locale se l'API rifiuta una scrittura.

## Verifica locale

```sh
node --test tests/canzoniere.test.cjs tests/canzoniere-pages.test.cjs tests/canzoniere-playlist-store.test.cjs tests/canzoniere-scroll.test.cjs tests/canzoniere-admin-browser.test.cjs
node tools/nas-demo.cjs
```

La demo usa un SQLite temporaneo, due esempi inventati e una scaletta pubblicata;
non connette il NAS e rimuove il database alla chiusura.
