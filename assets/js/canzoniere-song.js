(function () {
  const detail = document.getElementById("song-detail");
  if (!detail) return;

  const model = window.CANZONIERE_MODEL;
  const playlistStore = window.CANZONIERE_PLAYLIST_STORE;
  const loading = document.getElementById("song-loading");
  const content = document.getElementById("song-content");
  const status = document.getElementById("song-status");
  const retry = document.getElementById("song-retry");
  const score = document.getElementById("song-score");
  const playlistControls = document.getElementById("playlist-controls");
  const playlistTitleNode = document.getElementById("playlist-title");
  const playlistPosition = document.getElementById("playlist-position");
  const previousSong = document.getElementById("playlist-previous");
  const nextSong = document.getElementById("playlist-next");
  const printChords = document.getElementById("print-chords");
  const printButton = document.getElementById("print-song");
  const printList = document.getElementById("playlist-print");
  const apiRoot = new URL("../api/canzoniere/", window.location.href);
  const params = new URLSearchParams(window.location.search);
  const singleSlug = params.get("slug") || "";
  const requestedPlaylistSlug = params.get("playlist") || "";
  const requestedSlugs = params.get("slugs");
  let catalog = null;
  let song = null;
  let transposition = 0;
  let playlistMode = false;
  let playlistTitle = "";
  let playlistSlugs = [];
  let currentIndex = 0;
  let wakeLock = null;
  let wakeLockRequested = false;

  async function getJson(path) {
    let response;
    try {
      response = await fetch(new URL(path, apiRoot), { cache: "no-store" });
    } catch {
      throw new Error("Impossibile raggiungere il Canzoniere. Controlla la connessione e riprova.");
    }
    if (!response.ok) throw new Error("Canzoniere non disponibile (HTTP " + response.status + ").");
    return response.json();
  }

  function textNode(tagName, text, className) {
    const node = document.createElement(tagName);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function addMeta(label, value, href) {
    if (!value) return;
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = value;
      description.append(link);
    } else description.textContent = value;
    document.getElementById("song-meta").append(term, description);
  }

  function renderScore(target, sourceSong, semitones, showChords) {
    const source = model.transposeChordPro(sourceSong.text, semitones);
    const lines = model.parseChordPro(source);
    target.replaceChildren();
    let printableLines = 0;
    lines.forEach((line) => {
      if (line.directive) return;
      const row = document.createElement("div");
      row.className = "song-line";
      const chordLine = document.createElement("div");
      chordLine.className = "chord-line";
      const lyricLine = document.createElement("div");
      lyricLine.className = "lyric-line";
      lyricLine.textContent = line.lyric || "\u00a0";
      if (line.chords.length) {
        row.classList.add("has-chords");
        const groups = new Map();
        line.chords.forEach((chord) => {
          const current = groups.get(chord.position) || [];
          current.push(chord.chord);
          groups.set(chord.position, current);
        });
        let lineWidth = line.lyric.length;
        for (const [position, chords] of groups) {
          const label = chords.join(" / ");
          const marker = textNode("span", label, "chord-marker");
          marker.style.left = position + "ch";
          chordLine.append(marker);
          lineWidth = Math.max(lineWidth, position + label.length);
        }
        chordLine.style.width = Math.max(1, lineWidth) + "ch";
        lyricLine.style.width = Math.max(1, lineWidth) + "ch";
      }
      row.append(chordLine, lyricLine);
      target.append(row);
      printableLines++;
    });
    if (!printableLines) target.append(textNode("p", "Testo non disponibile.", "empty-song-text"));
    target.dataset.chords = showChords ? "on" : "off";
  }

  function renderSongInfo(data) {
    song = data;
    document.title = (playlistMode ? playlistTitle + " · " : "") +
      song.title + " · Canzoniere · AGESCI Canicattini 1";
    document.getElementById("song-title").textContent = song.title;
    document.getElementById("song-byline").textContent = song.author ? "di " + song.author : "";
    const metadata = document.getElementById("song-meta");
    metadata.replaceChildren();

    const album = catalog.albums.find((item) => item.slug === song.albumSlug);
    if (album) addMeta("Album", album.title, "./?album=" + encodeURIComponent(album.slug));
    addMeta("Tempo", song.meter, null);
    addMeta("BPM", song.bpm ? String(song.bpm) : "", null);
    addMeta("Capotasto", song.capo ? String(song.capo) : "", null);
    addMeta("Diritti", song.rights, null);

    const tags = document.getElementById("song-tags");
    tags.replaceChildren();
    song.tagSlugs.forEach((tagSlug) => {
      const tag = catalog.tags.find((item) => item.slug === tagSlug);
      if (!tag) return;
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = "./?tag=" + encodeURIComponent(tag.slug);
      link.textContent = tag.name;
      item.append(link);
      tags.append(item);
    });

    const extra = document.getElementById("song-extra");
    const notes = document.getElementById("song-notes");
    const source = document.getElementById("song-source");
    notes.textContent = song.notes ? "Note: " + song.notes : "";
    source.textContent = song.source ? "Fonte: " + song.source : "";
    extra.hidden = !(song.notes || song.source);
    content.hidden = false;
    loading.hidden = true;
    retry.hidden = true;
    status.textContent = "";
    detail.setAttribute("aria-busy", "false");
    renderScore(score, song, transposition, document.getElementById("show-chords").checked);
    renderKey();
    document.getElementById("auto-scroll").disabled = false;
    scrollPlayer.resetForSong();
    updatePlaylistPosition();
  }

  function renderKey() {
    const currentKey = song.key ? model.transposeKey(song.key, transposition) : "—";
    document.getElementById("song-key").textContent = currentKey;
    document.getElementById("transpose-value").textContent = transposition
      ? (transposition > 0 ? "+" : "") + transposition + " semitoni"
      : "Originale";
    document.getElementById("transpose-down").disabled = transposition <= -12;
    document.getElementById("transpose-up").disabled = transposition >= 12;
  }

  function updatePlaylistPosition() {
    if (!playlistMode) return;
    playlistTitleNode.textContent = playlistTitle;
    playlistPosition.textContent = "Canzone " + (currentIndex + 1) + " di " + playlistSlugs.length;
    previousSong.disabled = currentIndex === 0;
    nextSong.disabled = currentIndex >= playlistSlugs.length - 1;
    printButton.textContent = "Stampa scaletta";
  }

  function updateWakeButton() {
    const button = document.getElementById("wake-lock");
    button.setAttribute("aria-pressed", String(wakeLockRequested));
    button.textContent = wakeLockRequested ? "Disattiva schermo sempre acceso" : "Schermo sempre acceso";
  }

  async function acquireWakeLock() {
    if (!navigator.wakeLock?.request) {
      document.getElementById("song-controls-status").textContent =
        "Lo schermo sempre acceso non è supportato da questo browser.";
      wakeLockRequested = false;
      updateWakeButton();
      return;
    }
    try {
      const lock = await navigator.wakeLock.request("screen");
      wakeLock = lock;
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
        if (wakeLockRequested && document.visibilityState === "visible") wakeLockRequested = false;
        updateWakeButton();
      }, { once: true });
      document.getElementById("song-controls-status").textContent = "Schermo sempre acceso attivo.";
    } catch (error) {
      wakeLockRequested = false;
      updateWakeButton();
      document.getElementById("song-controls-status").textContent =
        "Non è stato possibile mantenere acceso lo schermo.";
      console.error("Wake Lock non disponibile", error);
    }
  }

  function updatePersonalSongStatus(message) {
    document.getElementById("song-controls-status").textContent = message;
  }

  function addCurrentSongToPlaylist() {
    const saved = playlistStore.read();
    if (saved.error) {
      updatePersonalSongStatus("Impossibile leggere la scaletta locale: " + saved.error.message);
      console.error("Lettura scaletta locale non riuscita", saved.error);
      return;
    }
    if (saved.slugs.includes(song.slug)) {
      updatePersonalSongStatus("Questa canzone è già nella tua scaletta.");
      return;
    }
    const result = playlistStore.write([...saved.slugs, song.slug]);
    if (!result.ok) {
      updatePersonalSongStatus("Impossibile salvare la scaletta locale: " + result.error.message);
      console.error("Salvataggio scaletta locale non riuscito", result.error);
      return;
    }
    updatePersonalSongStatus("Canzone aggiunta alla scaletta di questo browser.");
  }

  async function loadPlaylistSong(index) {
    currentIndex = index;
    detail.setAttribute("aria-busy", "true");
    status.textContent = "Caricamento della canzone " + (index + 1) + "…";
    try {
      const data = await getJson("songs/" + encodeURIComponent(playlistSlugs[index]));
      if (!Array.isArray(data.tagSlugs)) throw new Error("Dati della canzone non validi.");
      renderSongInfo(data);
    } catch (error) {
      detail.setAttribute("aria-busy", "false");
      status.textContent = error.message;
      throw error;
    }
  }

  async function advancePlaylist() {
    if (!playlistMode || currentIndex + 1 >= playlistSlugs.length) return false;
    await loadPlaylistSong(currentIndex + 1);
    return true;
  }

  async function buildPrintPlaylist() {
    printList.replaceChildren();
    printList.setAttribute("aria-busy", "true");
    const songs = [];
    try {
      for (let offset = 0; offset < playlistSlugs.length; offset += 10) {
        const batch = playlistSlugs.slice(offset, offset + 10);
        songs.push(...await Promise.all(batch.map((slug) => getJson("songs/" + encodeURIComponent(slug)))));
      }
      songs.forEach((item) => {
        const section = document.createElement("section");
        section.className = "playlist-print-song";
        section.append(textNode("h2", item.title));
        if (item.author) section.append(textNode("p", "di " + item.author));
        const printedScore = document.createElement("div");
        printedScore.className = "song-score";
        renderScore(printedScore, item, transposition, true);
        section.append(printedScore);
        printList.append(section);
      });
    } finally {
      printList.setAttribute("aria-busy", "false");
    }
  }

  async function printSongOrPlaylist() {
    scrollPlayer.pause("Scorrimento in pausa per la stampa.");
    document.body.classList.toggle("print-without-chords", !printChords.checked);
    try {
      if (playlistMode) {
        await buildPrintPlaylist();
        printList.hidden = false;
        printList.setAttribute("aria-hidden", "false");
        document.body.classList.add("print-playlist");
      }
      window.print();
    } catch (error) {
      updatePersonalSongStatus("Impossibile preparare la stampa: " + error.message);
      console.error("Preparazione stampa scaletta non riuscita", error);
      document.body.classList.remove("print-without-chords", "print-playlist");
      printList.hidden = true;
      printList.setAttribute("aria-hidden", "true");
    }
  }

  async function initialize() {
    detail.setAttribute("aria-busy", "true");
    loading.hidden = false;
    content.hidden = true;
    retry.hidden = true;
    status.textContent = "Caricamento della canzone…";
    try {
      if ([singleSlug, requestedPlaylistSlug, requestedSlugs].filter(Boolean).length !== 1)
        throw new Error("Seleziona una canzone o una scaletta valida.");
      catalog = await getJson("");
      if (!Array.isArray(catalog.tags) || !Array.isArray(catalog.albums))
        throw new Error("Catalogo del Canzoniere non valido.");

      if (requestedSlugs !== null || requestedPlaylistSlug) {
        playlistMode = true;
        if (requestedPlaylistSlug) {
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedPlaylistSlug))
            throw new Error("Slug della scaletta non valido.");
          const playlist = await getJson("playlists/" + encodeURIComponent(requestedPlaylistSlug));
          playlistTitle = playlist.title;
          playlistSlugs = playlistStore.validate(playlist.songSlugs);
        } else {
          playlistTitle = "Scaletta condivisa";
          playlistSlugs = playlistStore.validate(requestedSlugs.split(","));
        }
        if (!playlistSlugs.length) throw new Error("La scaletta non contiene canzoni.");
        playlistControls.hidden = false;
        await loadPlaylistSong(0);
      } else {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(singleSlug)) throw new Error("Slug della canzone non valido.");
        const data = await getJson("songs/" + encodeURIComponent(singleSlug));
        if (!Array.isArray(data.tagSlugs)) throw new Error("Dati della canzone non validi.");
        playlistControls.hidden = true;
        renderSongInfo(data);
      }
    } catch (error) {
      detail.setAttribute("aria-busy", "false");
      loading.hidden = true;
      content.hidden = true;
      status.textContent = error.message;
      retry.hidden = false;
      console.error("Caricamento canzone/scaletta non riuscito", error);
    }
  }

  const scrollPlayer = window.CANZONIERE_SCROLL.createScrollPlayer({
    score,
    button: document.getElementById("auto-scroll"),
    correction: document.getElementById("scroll-correction"),
    speedLabel: document.getElementById("scroll-speed"),
    status: document.getElementById("scroll-status"),
    getSong: () => song,
    onEnd: advancePlaylist,
  });

  document.getElementById("show-chords").addEventListener("change", (event) => {
    score.dataset.chords = event.currentTarget.checked ? "on" : "off";
  });
  document.getElementById("transpose-down").addEventListener("click", () => {
    transposition = Math.max(-12, transposition - 1);
    renderKey();
    renderScore(score, song, transposition, document.getElementById("show-chords").checked);
  });
  document.getElementById("transpose-up").addEventListener("click", () => {
    transposition = Math.min(12, transposition + 1);
    renderKey();
    renderScore(score, song, transposition, document.getElementById("show-chords").checked);
  });
  document.getElementById("transpose-original").addEventListener("click", () => {
    transposition = 0;
    renderKey();
    renderScore(score, song, transposition, document.getElementById("show-chords").checked);
  });
  document.getElementById("song-font-size").addEventListener("input", (event) => {
    const size = Number(event.currentTarget.value);
    score.style.setProperty("--song-font-size", size + "px");
    document.getElementById("font-size-value").textContent = size + " px";
  });
  document.getElementById("scroll-correction").addEventListener("input", (event) => {
    document.getElementById("scroll-correction-value").textContent = event.currentTarget.value + "%";
  });
  document.getElementById("dark-mode").addEventListener("change", (event) => {
    document.body.classList.toggle("canzoniere-dark", event.currentTarget.checked);
  });
  document.getElementById("add-song-to-playlist").addEventListener("click", addCurrentSongToPlaylist);
  document.getElementById("wake-lock").addEventListener("click", async () => {
    if (wakeLockRequested) {
      wakeLockRequested = false;
      if (wakeLock) {
        try {
          await wakeLock.release();
        } catch (error) {
          console.error("Rilascio Wake Lock non riuscito", error);
          updatePersonalSongStatus("Non è stato possibile rilasciare lo schermo sempre acceso.");
        }
      }
      wakeLock = null;
      updatePersonalSongStatus("Schermo sempre acceso disattivato.");
      updateWakeButton();
      return;
    }
    wakeLockRequested = true;
    updateWakeButton();
    await acquireWakeLock();
  });
  document.getElementById("print-song").addEventListener("click", printSongOrPlaylist);
  previousSong.addEventListener("click", () => {
    if (currentIndex > 0) {
      scrollPlayer.pause("Scorrimento in pausa.");
      loadPlaylistSong(currentIndex - 1).catch((error) => {
        status.textContent = error.message;
      });
    }
  });
  nextSong.addEventListener("click", () => {
    if (currentIndex + 1 < playlistSlugs.length) {
      scrollPlayer.pause("Scorrimento in pausa.");
      loadPlaylistSong(currentIndex + 1).catch((error) => {
        status.textContent = error.message;
      });
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (wakeLockRequested && document.visibilityState === "visible" && !wakeLock) acquireWakeLock();
    if (document.visibilityState === "hidden") scrollPlayer.pause("Scorrimento in pausa: pagina non visibile.");
  });
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-without-chords", "print-playlist");
    printList.hidden = true;
    printList.setAttribute("aria-hidden", "true");
  });
  retry.addEventListener("click", initialize);
  initialize();
})();
