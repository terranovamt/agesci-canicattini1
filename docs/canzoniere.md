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
riconosciute. La tonalita' usa la stessa trasposizione.

`secondsPerLine(song, correctionPercent)` applica
`(battiti per battuta × battute per riga) × 60 / BPM`. Per `6/8` il modello
conta sei battiti per battuta (BPM riferito alla suddivisione in ottavi).
Il valore iniziale di battute per riga e' 2; se manca il BPM il default e' 8
secondi per riga. La correzione e' un moltiplicatore percentuale tra 50 e 200.
La ricerca usa Unicode NFD, rimuove i segni diacritici e non distingue le
maiuscole.

## API

Prefisso: `/api/canzoniere` (il backend applica il prefisso di deploy
`/agesci-canicattini1`). Le letture sono pubbliche. L'endpoint di elenco
restituisce solo metadati; il dettaglio della canzone include il testo.

| Metodo | Percorso | Contratto |
| --- | --- | --- |
| GET | `/` | Tag, album, preset e scalette pubblicate |
| GET | `/songs` | Elenco paginato; `q`, `tag`, `album`, `branch`, `limit`, `offset`, `slugs` |
| GET | `/songs/:slug` | Scheda completa, incluso testo ChordPro |
| GET | `/tags`, `/albums`, `/presets` | Collezioni pubbliche |
| GET | `/playlists` | Scalette pubblicate; con sessione admin include anche le bozze |
| GET | `/playlists/:slug` | Scaletta pubblicata; bozze non visibili al pubblico |
| POST | `/songs`, `/tags`, `/albums`, `/presets`, `/playlists` | Crea record; slug facoltativo e generato dal titolo |
| PATCH | `/:collection/:slug` | Aggiornamento completo/parziale con `revision` |
| DELETE | `/:collection/:slug` | Eliminazione con `revision` nel body |

Per piu' filtri `tag`, il risultato deve contenere tutte le tag selezionate;
album e branca si combinano con gli altri filtri. La ricerca cerca titolo,
autore e testo senza distinzione di accenti. Una scaletta pubblicata deve
contenere almeno una canzone. Se si elimina una canzone usata da una scaletta,
il riferimento viene rimosso; una scaletta rimasta vuota viene ritirata dalla
pubblicazione. Eliminazioni di tag e album rimuovono i rispettivi riferimenti.

Ogni scrittura richiede una sessione dell'amministratore effettivo verificata lato server; una sessione in modalita' "Visualizza come"
non mantiene i permessi admin. Le scritture senza sessione o di utenti non
admin restituiscono 403. Si applicano inoltre il controllo same-origin del
backend e le revisioni ottimistiche; revisioni obsolete restituiscono 409.

## Pagine pubbliche

`canzoniere/index.html` e' l'elenco pubblico mobile-first, raggiungibile da
`/agesci-canicattini1/canzoniere/` e dalla navigazione della home. Cerca nel
titolo, nell'autore e nel testo, filtra per un tag, branca e album e carica
risultati successivi a blocchi; i dati arrivano solo dalle API, mai da testi
inclusi nell'HTML. `canzoniere/canzone.html?slug=...` e' la scheda pubblica.

La scheda visualizza gli accordi sopra le posizioni ChordPro, permette di
nasconderli, trasporre tonalita' e accordi con ripristino all'originale,
regolare la dimensione del testo, attivare il tema scuro e richiedere il
Wake Lock quando il browser lo supporta. Gli input di ricerca e i risultati
sono creati con API DOM e `textContent`; i caricamenti segnalano `aria-busy`,
e gli skeleton rispettano `prefers-reduced-motion`.

Lo scorrimento automatico calcola i secondi per riga dal BPM e da
`barsPerLine`, con correzione 50–200%, countdown di tre secondi e velocita'
predefinita senza BPM. Tocco o scorrimento manuale mettono in pausa. La
scaletta personale conserva in `localStorage` soltanto gli slug, con errori
di lettura/scrittura comunicati (chiave `agesci-canicattini1.canzoniere.playlist.v1`);
il link `canzone.html?slugs=...` contiene solo gli slug, senza titoli o testi.
Le scalette pubblicate si aprono con `canzone.html?playlist=...`. La scheda
supporta la navigazione sequenziale e l'avanzamento automatico tra le canzoni.
La home mostra i preset rapidi e le scalette pubblicate; la stampa offre
l'opzione di includere gli accordi.

## Verifica locale

```sh
node --test tests/canzoniere.test.cjs tests/canzoniere-pages.test.cjs tests/canzoniere-playlist-store.test.cjs tests/canzoniere-scroll.test.cjs
node tools/nas-demo.cjs
```

La demo usa un SQLite temporaneo, due esempi inventati e una scaletta pubblicata;
non connette il NAS e rimuove il database alla chiusura. L'area admin resta da
completare nella fase successiva.
