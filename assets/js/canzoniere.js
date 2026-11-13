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
  const personalStatus = document.getElementById("personal-playlist-status");
  const personalItems = document.getElementById("personal-playlist-items");
  const shareButton = document.getElementById("share-playlist");
  const shareControls = document.getElementById("share-playlist-controls");
  const shareInput = document.getElementById("share-playlist-link");
  const copyShareButton = document.getElementById("copy-playlist-link");
  const openPlaylist = document.getElementById("open-playlist");
  const clearPlaylist = document.getElementById("clear-playlist");
  const momentFilter = document.getElementById("playlist-moment");
  const generateMomentButton = document.getElementById("generate-moment");
  const regenerateButton = document.getElementById("regenerate-playlist");
  const quickPresets = document.getElementById("quick-presets");
  const generatedStatus = document.getElementById("generated-playlist-status");
  const generatedItems = document.getElementById("generated-playlist-items");
  const useGeneratedButton = document.getElementById("use-generated-playlist");
  const publishedStatus = document.getElementById("published-playlist-status");
  const publishedList = document.getElementById("published-playlists");
  const playlistStore = window.CANZONIERE_PLAYLIST_STORE;
  const apiRoot = new URL("../api/canzoniere/", window.location.href);
  const pageSize = 24;
  const storedPlaylist = playlistStore.read();
  let catalog = null;
  let personalSlugs = storedPlaylist.slugs;
  let storageError = storedPlaylist.error;
  let generatedSlugs = [];
  let lastGenerator = null;
  let personalRequest = 0;
  let personalMessage = "";
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
    if (!Array.isArray(data.tags) || !Array.isArray(data.albums) ||
        !Array.isArray(data.presets) || !Array.isArray(data.playlists))
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
    momentFilter.replaceChildren();
    addOption(momentFilter, "Scegli un momento", "");
    data.tags
      .filter((tag) => tag.category === "momento")
      .sort((a, b) => a.name.localeCompare(b.name, "it"))
      .forEach((tag) => addOption(momentFilter, tag.name, tag.slug));
    momentFilter.disabled = momentFilter.options.length < 2;
    generateMomentButton.disabled = momentFilter.disabled;
    renderQuickPresets(data.presets);
    renderPublishedPlaylists(data.playlists);
    renderPersonalPlaylist();
    if (storedPlaylist.error) {
      personalStatus.textContent = "Non è stato possibile leggere la scaletta salvata in questo browser.";
      console.error("Lettura scaletta locale non riuscita", storedPlaylist.error);
    }
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

    const add = document.createElement("button");
    add.className = "button button-secondary song-card-add";
    add.type = "button";
    add.dataset.playlistSlug = song.slug;
    add.disabled = personalSlugs.includes(song.slug);
    add.textContent = add.disabled ? "Già nella tua scaletta" : "Aggiungi alla scaletta";
    add.addEventListener("click", () => addToPersonalPlaylist(song.slug));
    article.append(add);
    return article;
  }

  function updateCardButtons() {
    list.querySelectorAll(".song-card-add").forEach((button) => {
      button.disabled = personalSlugs.includes(button.dataset.playlistSlug);
      button.textContent = button.disabled ? "Già nella tua scaletta" : "Aggiungi alla scaletta";
    });
  }

  function persistPersonalPlaylist(slugs, message) {
    if (slugs.length > 100) {
      personalStatus.textContent = "La scaletta può contenere al massimo 100 canzoni.";
      return;
    }
    const result = playlistStore.write(slugs);
    personalSlugs = [...slugs];
    storageError = result.error;
    personalMessage = message;
    if (!result.ok) console.error("Salvataggio scaletta locale non riuscito", result.error);
    updateCardButtons();
    renderPersonalPlaylist();
  }

  function addToPersonalPlaylist(slug) {
    if (personalSlugs.includes(slug)) return;
    persistPersonalPlaylist([...personalSlugs, slug], "Canzone aggiunta alla scaletta.");
  }

  async function renderPersonalPlaylist() {
    const request = ++personalRequest;
    personalItems.replaceChildren();
    personalItems.setAttribute("aria-busy", "true");
    shareButton.disabled = personalSlugs.length === 0;
    clearPlaylist.disabled = personalSlugs.length === 0;
    openPlaylist.hidden = personalSlugs.length === 0;
    shareControls.hidden = true;
    if (personalSlugs.length)
      openPlaylist.href = playlistStore.shareUrl(personalSlugs, window.location.href);
    if (!personalSlugs.length) {
      personalItems.setAttribute("aria-busy", "false");
      personalStatus.textContent = storageError
        ? "La scaletta non è disponibile in questo browser: " + storageError.message
        : personalMessage || "Aggiungi una canzone per creare la tua scaletta.";
      personalMessage = "";
      updateCardButtons();
      return;
    }

    personalStatus.textContent = "Caricamento della scaletta locale…";
    try {
      const params = new URLSearchParams({ slugs: personalSlugs.join(","), limit: "100" });
      const response = await getJson("songs?" + params.toString());
      if (request !== personalRequest) return;
      if (!Array.isArray(response.songs)) throw new Error("Scaletta locale non valida.");
      const songs = new Map(response.songs.map((song) => [song.slug, song]));
      personalSlugs.forEach((slug, index) => {
        const row = document.createElement("li");
        row.className = "playlist-item";
        const song = songs.get(slug);
        const label = song ? song.title : "Canzone non disponibile";
        const link = document.createElement(song ? "a" : "span");
        link.textContent = label;
        if (song) link.href = "canzone.html?slug=" + encodeURIComponent(slug);
        const position = document.createElement("span");
        position.className = "playlist-item-position";
        position.textContent = String(index + 1);
        const remove = document.createElement("button");
        remove.className = "button button-secondary playlist-remove";
        remove.type = "button";
        remove.setAttribute("aria-label", "Rimuovi " + label + " dalla scaletta");
        remove.textContent = "Rimuovi";
        remove.addEventListener("click", () => {
          persistPersonalPlaylist(personalSlugs.filter((item) => item !== slug), "Canzone rimossa dalla scaletta.");
        });
        row.append(position, link, remove);
        personalItems.append(row);
      });
      const link = playlistStore.shareUrl(personalSlugs, window.location.href);
      openPlaylist.href = link;
      personalStatus.textContent = storageError
        ? "Scaletta disponibile finché questa pagina resta aperta: " + storageError.message
        : personalMessage || personalSlugs.length + " canzoni nella scaletta di questo browser.";
      personalMessage = "";
      updateCardButtons();
    } catch (error) {
      if (request !== personalRequest) return;
      personalStatus.textContent = error.message;
      updateCardButtons();
      console.error("Caricamento scaletta locale non riuscito", error);
    } finally {
      if (request === personalRequest) personalItems.setAttribute("aria-busy", "false");
    }
  }

  function renderQuickPresets(presets) {
    quickPresets.replaceChildren();
    if (!presets.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nessun preset rapido pubblicato.";
      quickPresets.append(empty);
      return;
    }
    presets.forEach((preset) => {
      const button = document.createElement("button");
      button.className = "button button-secondary";
      button.type = "button";
      button.textContent = preset.title;
      button.addEventListener("click", () => generatePlaylist(preset));
      quickPresets.append(button);
    });
  }

  function renderPublishedPlaylists(playlists) {
    publishedList.replaceChildren();
    publishedList.setAttribute("aria-busy", "false");
    if (!playlists.length) {
      publishedStatus.textContent = "Non ci sono ancora scalette pubblicate.";
      return;
    }
    publishedStatus.textContent = playlists.length + " scalette pubblicate.";
    playlists.forEach((playlist) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = "canzone.html?playlist=" + encodeURIComponent(playlist.slug);
      link.textContent = playlist.title;
      const count = document.createElement("span");
      count.textContent = playlist.songSlugs.length + " canzoni";
      item.append(link, count);
      publishedList.append(item);
    });
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function renderGeneratedPlaylist(songs) {
    generatedItems.replaceChildren();
    generatedSlugs = songs.map((song) => song.slug);
    songs.forEach((song, index) => {
      const item = document.createElement("li");
      const position = document.createElement("span");
      position.className = "playlist-item-position";
      position.textContent = String(index + 1);
      const link = document.createElement("a");
      link.href = "canzone.html?slug=" + encodeURIComponent(song.slug);
      link.textContent = song.title;
      item.append(position, link);
      generatedItems.append(item);
    });
    useGeneratedButton.hidden = !songs.length;
  }

  async function generatePlaylist(preset) {
    lastGenerator = preset;
    regenerateButton.hidden = false;
    useGeneratedButton.hidden = true;
    generatedStatus.textContent = "Composizione della scaletta…";
    generatedItems.replaceChildren();
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (preset.songSlugs?.length) params.set("slugs", preset.songSlugs.join(","));
      else (preset.tagSlugs || []).forEach((slug) => params.append("tag", slug));
      const response = await getJson("songs?" + params.toString());
      if (!Array.isArray(response.songs)) throw new Error("Risultati del generatore non validi.");
      const candidates = preset.songSlugs?.length ? response.songs : shuffled(response.songs);
      const songs = candidates.slice(0, preset.limit || 12);
      renderGeneratedPlaylist(songs);
      generatedStatus.textContent = songs.length
        ? "Proposta di " + songs.length + " canzoni per «" + preset.title + "». Puoi rigenerarla o aggiungerla alla tua scaletta."
        : "Nessuna canzone disponibile per «" + preset.title + "».";
    } catch (error) {
      generatedStatus.textContent = error.message;
      console.error("Generazione scaletta non riuscita", error);
    }
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
  shareButton.addEventListener("click", async () => {
    try {
      shareInput.value = playlistStore.shareUrl(personalSlugs, window.location.href);
      shareControls.hidden = false;
      shareInput.focus();
      shareInput.select();
      if (!navigator.clipboard?.writeText) {
        personalStatus.textContent = "Link pronto: copialo dal campo qui sopra.";
        return;
      }
      await navigator.clipboard.writeText(shareInput.value);
      personalStatus.textContent = "Link copiato negli appunti.";
    } catch (error) {
      personalStatus.textContent = "Non è stato possibile copiare il link. Puoi copiarlo dal campo qui sopra.";
      console.error("Copia link scaletta non riuscita", error);
    }
  });
  copyShareButton.addEventListener("click", async () => {
    try {
      shareInput.focus();
      shareInput.select();
      if (!navigator.clipboard?.writeText) {
        personalStatus.textContent = "Seleziona e copia il link dal campo qui sopra.";
        return;
      }
      await navigator.clipboard.writeText(shareInput.value);
      personalStatus.textContent = "Link copiato negli appunti.";
    } catch (error) {
      personalStatus.textContent = "Non è stato possibile copiare il link. Puoi copiarlo dal campo qui sopra.";
      console.error("Copia link scaletta non riuscita", error);
    }
  });
  clearPlaylist.addEventListener("click", () => persistPersonalPlaylist([], "Scaletta svuotata."));
  generateMomentButton.addEventListener("click", () => {
    const tag = catalog?.tags.find((item) => item.slug === momentFilter.value);
    if (!tag) {
      generatedStatus.textContent = "Scegli un momento per generare la scaletta.";
      return;
    }
    generatePlaylist({ title: tag.name, tagSlugs: [tag.slug], songSlugs: [], limit: 12 });
  });
  regenerateButton.addEventListener("click", () => {
    if (lastGenerator) generatePlaylist(lastGenerator);
  });
  useGeneratedButton.addEventListener("click", () => {
    if (!generatedSlugs.length) return;
    const next = [...new Set([...personalSlugs, ...generatedSlugs])];
    if (next.length > 100) {
      generatedStatus.textContent = "La scaletta personale può contenere al massimo 100 canzoni.";
      return;
    }
    persistPersonalPlaylist(next, "Scaletta generata aggiunta alla tua scaletta.");
  });
  window.addEventListener("popstate", () => {
    applyLocation();
    load(true);
  });

  load();
})();
