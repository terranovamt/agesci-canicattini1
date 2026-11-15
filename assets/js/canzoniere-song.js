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
  const settingsPanel = document.getElementById("song-settings-panel");
  const settingsToggle = document.getElementById("song-settings-toggle");
  const settingsClose = document.getElementById("song-settings-close");
  const autoScrollButton = document.getElementById("auto-scroll");
  const notationButton = document.getElementById("notation-toggle");
  const notationIndicator = document.getElementById("notation-indicator");
  const chordsToggleButton = document.getElementById("chords-toggle");
  const chordsToggleIndicator = document.getElementById("chords-toggle-indicator");
  const showChordsToggle = document.getElementById("show-chords");
  const fontSizeInput = document.getElementById("song-font-size");
  const fontSizeValue = document.getElementById("font-size-value");
  const settingsMedia = window.matchMedia("(max-width: 640px), (max-height: 560px) and (orientation: landscape)");
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
  let settingsOpen = false;
  let notation = "en";
  let manualFontSize = false;

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

  function songInNotation(data) {
    const keyDirective = data.key
      ? model.translateChordPro("{key: " + data.key + "}", notation)
      : "";
    const translatedKey = /^\{key:\s*([^}]+)\}$/.exec(keyDirective);
    return {
      ...data,
      key: translatedKey ? translatedKey[1] : data.key,
      text: model.translateChordPro(data.text, notation),
    };
  }

  function updateNotationButton() {
    notationIndicator.textContent = notation.toUpperCase();
    notationButton.setAttribute("aria-pressed", String(notation === "it"));
    notationButton.setAttribute("aria-label", notation === "it"
      ? "Notazione italiana; passa alla notazione inglese"
      : "Notazione inglese; passa alla notazione italiana");
  }

  function updateChordsToggle() {
    const showChords = showChordsToggle.checked;
    chordsToggleIndicator.textContent = showChords ? "−" : "+";
    chordsToggleButton.setAttribute("aria-pressed", String(!showChords));
    chordsToggleButton.setAttribute("aria-label", showChords ? "Mostra solo il testo" : "Mostra gli accordi");
  }

  function renderCurrentScore() {
    if (!song) return;
    const scrollTop = score.scrollTop;
    const displayedSong = songInNotation(song);
    window.CANZONIERE_VIEW.renderScore(score, displayedSong, transposition, showChordsToggle.checked);
    score.scrollTop = scrollTop;
    renderKey(displayedSong);
    updateChordsToggle();
    updateSongDensity();
  }

  function renderSongInfo(data) {
    song = data;
    notation = model.detectChordNotation(song.text + (song.key ? "\n{key: " + song.key + "}" : ""));
    updateNotationButton();
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
    renderCurrentScore();
    document.getElementById("auto-scroll").disabled = false;
    notationButton.disabled = false;
    chordsToggleButton.disabled = false;
    scrollPlayer.resetForSong();
    updatePlaylistPosition();
  }

  function renderKey(displayedSong = songInNotation(song)) {
    const currentKey = displayedSong.key ? model.transposeKey(displayedSong.key, transposition) : "—";
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
        window.CANZONIERE_VIEW.renderScore(printedScore, songInNotation(item), transposition, true);
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
    button: autoScrollButton,
    correction: document.getElementById("scroll-correction"),
    speedLabel: document.getElementById("scroll-speed"),
    status: document.getElementById("scroll-status"),
    getSong: () => song,
    onEnd: advancePlaylist,
  });

  function syncSettingsVisibility() {
    const compact = settingsMedia.matches;
    settingsPanel.hidden = compact && !settingsOpen;
    content.classList.toggle("song-settings-open", compact && settingsOpen);
    settingsToggle.hidden = !compact;
    settingsClose.hidden = !compact || !settingsOpen;
    settingsToggle.setAttribute("aria-expanded", String(compact && settingsOpen));
    settingsToggle.setAttribute("aria-label", settingsOpen ? "Chiudi impostazioni" : "Apri impostazioni");
  }

  function setFontSize(size) {
    score.style.setProperty("--song-font-size", size + "px");
    fontSizeValue.textContent = size + " px";
  }

  function updateSongDensity() {
    if (!song) return;
    const rows = [...score.querySelectorAll(".song-line")];
    const rowGap = Number.parseFloat(window.getComputedStyle(score).rowGap) || 0;
    const rowsHeight = rows.reduce((height, row) => height + row.getBoundingClientRect().height, 0) +
      Math.max(0, rows.length - 1) * rowGap;
    const emptyText = score.querySelector(".empty-song-text");
    const contentHeight = rowsHeight || emptyText?.getBoundingClientRect().height || Number.POSITIVE_INFINITY;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const compact = settingsMedia.matches && contentHeight <= Math.max(180, viewportHeight * 0.45);
    content.classList.toggle("song-content-compact", compact);
  }

  function updateAutomaticFontSize() {
    if (!manualFontSize) {
      const viewportWidth = Math.round(window.visualViewport?.width ||
        document.documentElement.clientWidth || window.innerWidth);
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      const scale = landscape ? 0.035 : 0.04;
      const minimum = landscape && viewportWidth >= 640 ? 26 : 18;
      const size = Math.max(minimum, Math.min(44, Math.round(viewportWidth * scale / 2) * 2));
      fontSizeInput.value = String(size);
      setFontSize(size);
    }
    if (song) renderCurrentScore();
    else updateSongDensity();
  }

  updateAutomaticFontSize();
  window.addEventListener("resize", updateAutomaticFontSize);
  window.addEventListener("orientationchange", updateAutomaticFontSize);
  window.visualViewport?.addEventListener("resize", updateAutomaticFontSize);

  settingsToggle.addEventListener("click", () => {
    settingsOpen = !settingsOpen;
    syncSettingsVisibility();
    if (settingsOpen) {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      settingsPanel.scrollIntoView({ block: "start", behavior });
    }
  });
  settingsClose.addEventListener("click", () => {
    settingsOpen = false;
    syncSettingsVisibility();
    settingsToggle.focus();
  });
  settingsMedia.addEventListener("change", () => {
    settingsOpen = false;
    syncSettingsVisibility();
  });
  autoScrollButton.addEventListener("click", () => {
    if (settingsMedia.matches && autoScrollButton.getAttribute("aria-pressed") === "true") {
      settingsOpen = false;
      syncSettingsVisibility();
    }
  });
  syncSettingsVisibility();

  notationButton.addEventListener("click", () => {
    if (!song) return;
    if (autoScrollButton.getAttribute("aria-pressed") === "true")
      scrollPlayer.pause("Scorrimento in pausa per la conversione degli accordi.");
    notation = notation === "it" ? "en" : "it";
    const scrollTop = score.scrollTop;
    updateNotationButton();
    renderCurrentScore();
    score.scrollTop = scrollTop;
  });

  showChordsToggle.addEventListener("change", () => {
    renderCurrentScore();
  });
  chordsToggleButton.addEventListener("click", () => {
    if (!song) return;
    showChordsToggle.checked = !showChordsToggle.checked;
    showChordsToggle.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.getElementById("transpose-down").addEventListener("click", () => {
    transposition = Math.max(-12, transposition - 1);
    renderCurrentScore();
  });
  document.getElementById("transpose-up").addEventListener("click", () => {
    transposition = Math.min(12, transposition + 1);
    renderCurrentScore();
  });
  document.getElementById("transpose-original").addEventListener("click", () => {
    transposition = 0;
    renderCurrentScore();
  });
  fontSizeInput.addEventListener("input", (event) => {
    manualFontSize = true;
    setFontSize(Number(event.currentTarget.value));
    renderCurrentScore();
  });
  document.getElementById("scroll-correction").addEventListener("input", (event) => {
    document.getElementById("scroll-correction-value").textContent = event.currentTarget.value + "%";
  });
  document.getElementById("dark-mode").addEventListener("change", (event) => {
    document.body.classList.toggle("canzoniere-dark", event.currentTarget.checked);
  });
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
