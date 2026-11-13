(function () {
  const list = document.getElementById("song-list");
  if (!list) return;

  const form = document.getElementById("song-filters");
  const search = document.getElementById("song-search");
  const tagFilter = document.getElementById("song-tag");
  const branchFilter = document.getElementById("song-branch");
  const albumFilter = document.getElementById("song-album");
  const status = document.getElementById("song-status");
  const more = document.getElementById("songs-more");
  const retry = document.getElementById("songs-retry");
  const clear = document.getElementById("clear-song-filters");
  const apiRoot = new URL("../api/canzoniere/", window.location.href);
  const pageSize = 24;
  let catalog = null;
  let offset = 0;
  let requestId = 0;
  let activeController = null;
  let loading = false;
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

  function applyLocation() {
    const params = new URLSearchParams(window.location.search);
    search.value = params.get("q") || "";
    tagFilter.value = params.get("tag") || "";
    branchFilter.value = params.get("branch") || "";
    albumFilter.value = params.get("album") || "";
  }

  function populateFilters(data) {
    if (!Array.isArray(data.tags) || !Array.isArray(data.albums))
      throw new Error("Catalogo del Canzoniere non valido.");
    catalog = data;
    const selected = {
      tag: new URLSearchParams(window.location.search).get("tag") || "",
      branch: new URLSearchParams(window.location.search).get("branch") || "",
      album: new URLSearchParams(window.location.search).get("album") || "",
    };

    tagFilter.replaceChildren();
    addOption(tagFilter, "Tutti i tag", "");
    [...data.tags]
      .sort((a, b) => a.name.localeCompare(b.name, "it"))
      .forEach((tag) => addOption(tagFilter, tag.name, tag.slug));
    branchFilter.value = selected.branch;

    albumFilter.replaceChildren();
    addOption(albumFilter, "Tutti gli album", "");
    [...data.albums]
      .sort((a, b) => a.title.localeCompare(b.title, "it"))
      .forEach((album) => addOption(albumFilter, album.title, album.slug));

    tagFilter.value = [...tagFilter.options].some((option) => option.value === selected.tag) ? selected.tag : "";
    albumFilter.value = [...albumFilter.options].some((option) => option.value === selected.album) ? selected.album : "";
    [tagFilter, branchFilter, albumFilter].forEach((select) => {
      select.disabled = false;
    });
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
    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = "canzone.html?slug=" + encodeURIComponent(song.slug);
    link.textContent = song.title;
    heading.append(link);
    article.append(heading);

    const details = [];
    if (song.author) details.push("di " + song.author);
    const album = catalog.albums.find((item) => item.slug === song.albumSlug);
    if (album) details.push(album.title);
    if (details.length) {
      const byline = document.createElement("p");
      byline.className = "song-card-byline";
      byline.textContent = details.join(" · ");
      article.append(byline);
    }

    const metadata = [song.key, song.bpm ? song.bpm + " BPM" : "", song.meter]
      .filter(Boolean)
      .join(" · ");
    if (metadata) {
      const summary = document.createElement("p");
      summary.className = "song-card-meta";
      summary.textContent = metadata;
      article.append(summary);
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
      if (tags.children.length) article.append(tags);
    }

    const open = document.createElement("a");
    open.className = "button button-secondary song-card-open";
    open.href = link.href;
    open.textContent = "Apri la canzone";
    article.append(open);
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
        populateFilters(data);
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    load(true);
  });
  search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => load(true), 250);
  });
  [tagFilter, branchFilter, albumFilter].forEach((select) => {
    select.addEventListener("change", () => load(true));
  });
  clear.addEventListener("click", () => {
    search.value = "";
    tagFilter.value = "";
    branchFilter.value = "";
    albumFilter.value = "";
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
