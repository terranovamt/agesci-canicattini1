(function () {
  const detail = document.getElementById("song-detail");
  if (!detail) return;

  const model = window.CANZONIERE_MODEL;
  const loading = document.getElementById("song-loading");
  const content = document.getElementById("song-content");
  const status = document.getElementById("song-status");
  const retry = document.getElementById("song-retry");
  const apiRoot = new URL("../api/canzoniere/", window.location.href);
  const slug = new URLSearchParams(window.location.search).get("slug") || "";
  let song = null;
  let transposition = 0;
  let wakeLock = null;
  let wakeLockRequested = false;

  async function getJson(path) {
    let response;
    try {
      response = await fetch(new URL(path, apiRoot), { cache: "no-store" });
    } catch {
      throw new Error("Impossibile raggiungere il Canzoniere. Controlla la connessione e riprova.");
    }
    if (!response.ok) throw new Error("Canzone non disponibile (HTTP " + response.status + ").");
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

  function renderSongInfo(data, catalog) {
    song = data;
    document.title = song.title + " · Canzoniere · AGESCI Canicattini 1";
    document.getElementById("song-title").textContent = song.title;
    document.getElementById("song-byline").textContent = song.author ? "di " + song.author : "";
    const metadata = document.getElementById("song-meta");
    metadata.replaceChildren();

    const album = catalog.albums.find((item) => item.slug === song.albumSlug);
    if (album)
      addMeta("Album", album.title, "./?album=" + encodeURIComponent(album.slug));
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
    renderScore();
    renderKey();
  }

  function renderScore() {
    const score = document.getElementById("song-score");
    const source = model.transposeChordPro(song.text, transposition);
    const lines = model.parseChordPro(source);
    score.replaceChildren();
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
      score.append(row);
      printableLines++;
    });
    if (!printableLines) score.append(textNode("p", "Testo non disponibile.", "empty-song-text"));
    score.dataset.chords = document.getElementById("show-chords").checked ? "on" : "off";
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

  async function load() {
    detail.setAttribute("aria-busy", "true");
    loading.hidden = false;
    content.hidden = true;
    retry.hidden = true;
    status.textContent = "Caricamento della canzone…";
    try {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Slug della canzone non valido.");
      const [data, catalog] = await Promise.all([getJson("songs/" + encodeURIComponent(slug)), getJson("")]);
      if (!Array.isArray(catalog.tags) || !Array.isArray(catalog.albums) || !Array.isArray(data.tagSlugs))
        throw new Error("Dati della canzone non validi.");
      renderSongInfo(data, catalog);
    } catch (error) {
      detail.setAttribute("aria-busy", "false");
      loading.hidden = true;
      content.hidden = true;
      status.textContent = error.message;
      retry.hidden = false;
      console.error("Caricamento canzone non riuscito", error);
    }
  }

  document.getElementById("show-chords").addEventListener("change", (event) => {
    document.getElementById("song-score").dataset.chords = event.currentTarget.checked ? "on" : "off";
  });
  document.getElementById("transpose-down").addEventListener("click", () => {
    transposition = Math.max(-12, transposition - 1);
    renderKey();
    renderScore();
  });
  document.getElementById("transpose-up").addEventListener("click", () => {
    transposition = Math.min(12, transposition + 1);
    renderKey();
    renderScore();
  });
  document.getElementById("transpose-original").addEventListener("click", () => {
    transposition = 0;
    renderKey();
    renderScore();
  });
  document.getElementById("song-font-size").addEventListener("input", (event) => {
    const size = Number(event.currentTarget.value);
    document.getElementById("song-score").style.setProperty("--song-font-size", size + "px");
    document.getElementById("font-size-value").textContent = size + " px";
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
          document.getElementById("song-controls-status").textContent =
            "Non è stato possibile rilasciare lo schermo sempre acceso.";
        }
      }
      wakeLock = null;
      document.getElementById("song-controls-status").textContent = "Schermo sempre acceso disattivato.";
      updateWakeButton();
      return;
    }
    wakeLockRequested = true;
    updateWakeButton();
    await acquireWakeLock();
  });
  document.addEventListener("visibilitychange", () => {
    if (wakeLockRequested && document.visibilityState === "visible" && !wakeLock) acquireWakeLock();
  });
  retry.addEventListener("click", load);
  load();
})();
