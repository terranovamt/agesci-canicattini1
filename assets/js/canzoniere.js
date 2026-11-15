(function () {
  const list = document.getElementById("song-list");
  if (!list) return;

  const form = document.getElementById("song-filters");
  const filterToggle = document.getElementById("song-filter-toggle");
  const filterCount = document.getElementById("song-filter-count");
  const search = document.getElementById("song-search");
  const tagFilter = document.getElementById("song-tag");
  const branchFilter = document.getElementById("song-branch");
  const albumFilter = document.getElementById("song-album");
  const status = document.getElementById("song-status");
  const more = document.getElementById("songs-more");
  const retry = document.getElementById("songs-retry");
  const clear = document.getElementById("clear-song-filters");
  const publishedStatus = document.getElementById("published-playlist-status");
  const publishedList = document.getElementById("published-playlists");
  const apiRoot = new URL("../api/canzoniere/", window.location.href);
  const pageSize = 24;
  const filterMedia = window.matchMedia("(max-width: 640px)");
  let catalog = null;
  let offset = 0;
  let requestId = 0;
  let activeController = null;
  let loading = false;
  let filterPanelOpen = false;
  let searchTimer = 0;

  function skeleton(count) {
    return Array.from({ length: count }, () => {
      const card = document.createElement("article");
      card.className = "loading-skeleton song-skeleton";
      card.setAttribute("aria-hidden", "true");
      return card;
    });
  }

  async function getJson(path, signal) {
    let response;
    try {
      response = await fetch(new URL(path, apiRoot), { cache: "no-store", signal });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error("Impossibile raggiungere il Canzoniere. Controlla la connessione e riprova.");
    }
    if (!response.ok) throw new Error("Canzoniere non disponibile (HTTP " + response.status + ").");
    return response.json();
  }

  function addOption(select, label, value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function syncFilterPanel() {
    const compact = filterMedia.matches;
    filterToggle.hidden = !compact;
    form.hidden = compact && !filterPanelOpen;
    filterToggle.setAttribute("aria-expanded", String(compact && filterPanelOpen));
  }

  function updateFilterCount() {
    const count = [search.value.trim(), tagFilter.value, branchFilter.value, albumFilter.value]
      .filter(Boolean).length;
    filterCount.textContent = count ? count + " attivi" : "";
  }

  function applyLocation() {
    const params = new URLSearchParams(window.location.search);
    search.value = params.get("q") || "";
    tagFilter.value = params.get("tag") || "";
    branchFilter.value = params.get("branch") || "";
    albumFilter.value = params.get("album") || "";
    updateFilterCount();
  }

  async function loadPlaylistSongs(playlists, signal) {
    const slugs = [...new Set(playlists.flatMap((playlist) => {
      if (!Array.isArray(playlist.songSlugs)) throw new Error("Scaletta pubblicata non valida.");
      return playlist.songSlugs;
    }))];
    const songs = new Map();
    for (let offset = 0; offset < slugs.length; offset += 100) {
      const params = new URLSearchParams({
        slugs: slugs.slice(offset, offset + 100).join(","),
        limit: "100",
      });
      const page = await getJson("songs?" + params.toString(), signal);
      if (!Array.isArray(page.songs)) throw new Error("Brani delle scalette non validi.");
      for (const song of page.songs) songs.set(song.slug, song);
    }
    return songs;
  }

  function renderPublishedPlaylists(playlists, songs, errorMessage = "") {
    publishedList.replaceChildren();
    publishedList.setAttribute("aria-busy", "false");
    if (!playlists.length) {
      publishedStatus.textContent = "Non ci sono ancora scalette pubblicate.";
      return;
    }
    publishedStatus.textContent = errorMessage || playlists.length + " scalette pubblicate.";
    playlists.forEach((playlist) => {
      const songSlugs = Array.isArray(playlist.songSlugs) ? playlist.songSlugs : [];
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = "canzone.html?playlist=" + encodeURIComponent(playlist.slug);
      link.textContent = playlist.title;
      const count = document.createElement("span");
      count.textContent = songSlugs.length + " canzoni";
      item.append(link, count);
      const songList = document.createElement("ul");
      songList.className = "published-playlist-songs";
      songList.setAttribute("aria-label", "Canzoni nella scaletta " + playlist.title);
      songSlugs.forEach((slug) => {
        const song = songs.get(slug);
        if (!song) return;
        const entry = document.createElement("li");
        const songLink = document.createElement("a");
        songLink.href = "canzone.html?slug=" + encodeURIComponent(song.slug);
        songLink.textContent = song.title;
        entry.append(songLink);
        songList.append(entry);
      });
      if (songList.children.length) item.append(songList);
      publishedList.append(item);
    });
  }

  async function populateFilters(data, signal) {
    if (!Array.isArray(data.tags) || !Array.isArray(data.albums) || !Array.isArray(data.playlists))
      throw new Error("Catalogo del Canzoniere non valido.");
    const selected = new URLSearchParams(window.location.search);

    tagFilter.replaceChildren();
    addOption(tagFilter, "Tutti i tag", "");
    [...data.tags]
      .sort((a, b) => a.name.localeCompare(b.name, "it"))
      .forEach((tag) => addOption(tagFilter, tag.name, tag.slug));

    albumFilter.replaceChildren();
    addOption(albumFilter, "Tutti gli album", "");
    [...data.albums]
      .sort((a, b) => a.title.localeCompare(b.title, "it"))
      .forEach((album) => addOption(albumFilter, album.title, album.slug));

    tagFilter.value = [...tagFilter.options].some((option) => option.value === selected.get("tag"))
      ? selected.get("tag") : "";
    branchFilter.value = selected.get("branch") || "";
    albumFilter.value = [...albumFilter.options].some((option) => option.value === selected.get("album"))
      ? selected.get("album") : "";
    [tagFilter, branchFilter, albumFilter].forEach((select) => { select.disabled = false; });
    let songs = new Map();
    let playlistSongError = "";
    try {
      songs = await loadPlaylistSongs(data.playlists, signal);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      playlistSongError = "Brani delle scalette non disponibili: " + error.message;
      console.error("Caricamento dei brani delle scalette non riuscito", error);
    }
    catalog = data;
    renderPublishedPlaylists(data.playlists, songs, playlistSongError);
  }

  function updateLocation() {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    for (const key of ["q", "tag", "branch", "album"]) params.delete(key);
    if (search.value.trim()) params.set("q", search.value.trim());
    if (tagFilter.value) params.set("tag", tagFilter.value);
    if (branchFilter.value) params.set("branch", branchFilter.value);
    if (albumFilter.value) params.set("album", albumFilter.value);
    window.history.replaceState(null, "", url.pathname + (params.size ? "?" + params.toString() : "") + url.hash);
  }

  function card(song) {
    const article = document.createElement("article");
    article.className = "song-card";
    article.setAttribute("role", "listitem");
    const link = document.createElement("a");
    link.className = "song-card-link";
    link.href = "canzone.html?slug=" + encodeURIComponent(song.slug);
    const heading = document.createElement("h2");
    heading.textContent = song.title;
    link.append(heading);

    const details = [];
    if (song.author) details.push("di " + song.author);
    const album = catalog.albums.find((item) => item.slug === song.albumSlug);
    if (album) details.push(album.title);
    if (details.length) {
      const byline = document.createElement("p");
      byline.className = "song-card-byline";
      byline.textContent = details.join(" · ");
      link.append(byline);
    }

    const metadata = [song.key, song.bpm ? song.bpm + " BPM" : "", song.meter]
      .filter(Boolean)
      .join(" · ");
    if (metadata) {
      const summary = document.createElement("p");
      summary.className = "song-card-meta";
      summary.textContent = metadata;
      link.append(summary);
    }

    if (song.tagSlugs?.length) {
      const tags = document.createElement("ul");
      tags.className = "song-tags";
      tags.setAttribute("aria-label", "Tag");
      song.tagSlugs.forEach((slug) => {
        const tag = catalog.tags.find((item) => item.slug === slug);
        if (!tag) return;
        const item = document.createElement("li");
        item.textContent = tag.name;
        tags.append(item);
      });
      if (tags.children.length) link.append(tags);
    }
    article.append(link);
    return article;
  }

  function filters() {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (search.value.trim()) params.set("q", search.value.trim());
    if (tagFilter.value) params.set("tag", tagFilter.value);
    if (branchFilter.value) params.set("branch", branchFilter.value);
    if (albumFilter.value) params.set("album", albumFilter.value);
    return params;
  }

  async function load(reset = true) {
    if (!reset && loading) return;
    if (reset) {
      activeController?.abort();
      offset = 0;
      list.replaceChildren(...skeleton(3));
      updateLocation();
    } else {
      list.append(...skeleton(2));
    }

    const id = ++requestId;
    const controller = new AbortController();
    activeController = controller;
    loading = true;
    list.setAttribute("aria-busy", "true");
    status.textContent = reset ? "Caricamento delle canzoni…" : "Caricamento di altre canzoni…";
    retry.hidden = true;
    more.hidden = true;

    try {
      if (!catalog) {
        const data = await getJson("", controller.signal);
        if (id !== requestId) return;
        await populateFilters(data, controller.signal);
        if (id !== requestId) return;
        applyLocation();
      }
      const page = await getJson("songs?" + filters().toString(), controller.signal);
      if (id !== requestId) return;
      if (!Array.isArray(page.songs) || !Number.isSafeInteger(page.total))
        throw new Error("Elenco del Canzoniere non valido.");
      list.querySelectorAll(".song-skeleton").forEach((placeholder) => placeholder.remove());
      page.songs.forEach((song) => list.append(card(song)));
      offset += page.songs.length;
      more.hidden = !page.hasMore;
      status.textContent = page.total
        ? "Mostrate " + offset + " di " + page.total + " canzoni."
        : "Nessuna canzone corrisponde alla ricerca.";
    } catch (error) {
      if (id !== requestId || error.name === "AbortError") return;
      list.querySelectorAll(".song-skeleton").forEach((placeholder) => placeholder.remove());
      status.textContent = error.message;
      retry.hidden = false;
      console.error("Caricamento Canzoniere non riuscito", error);
    } finally {
      if (id === requestId) {
        list.setAttribute("aria-busy", "false");
        loading = false;
        activeController = null;
      }
    }
  }

  filterToggle.addEventListener("click", () => {
    filterPanelOpen = !filterPanelOpen;
    syncFilterPanel();
    if (filterPanelOpen) search.focus();
  });
  filterMedia.addEventListener("change", () => {
    filterPanelOpen = false;
    syncFilterPanel();
  });
  syncFilterPanel();
  updateFilterCount();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    load(true);
  });
  search.addEventListener("input", () => {
    updateFilterCount();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => load(true), 250);
  });
  [tagFilter, branchFilter, albumFilter].forEach((select) => {
    select.addEventListener("change", () => {
      updateFilterCount();
      load(true);
    });
  });
  clear.addEventListener("click", () => {
    search.value = "";
    tagFilter.value = "";
    branchFilter.value = "";
    albumFilter.value = "";
    updateFilterCount();
    load(true);
    search.focus();
  });
  more.addEventListener("click", () => load(false));
  retry.addEventListener("click", () => load(true));
  window.addEventListener("popstate", () => {
    applyLocation();
    load(true);
  });

  load();
})();
