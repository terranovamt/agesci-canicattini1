(function () {
  const $ = (id) => document.getElementById(id);
  const main = $("canzoniere-admin");
  const accessStatus = $("canzoniere-admin-access-status");
  if (!window.ACCESSO?.verificata()) {
    location.replace("./");
    return;
  }
  if (!window.NAS?.user?.admin) {
    accessStatus.textContent = "Gestione riservata all’amministratore.";
    accessStatus.dataset.state = "error";
    location.replace("./");
    return;
  }
  accessStatus.hidden = true;
  main.hidden = false;

  const M = window.CANZONIERE_MODEL;
  const VIEW = window.CANZONIERE_VIEW;
  const state = { songs: [], tags: [], albums: [], presets: [], playlists: [] };
  const forms = {
    songs: $("admin-song-form"),
    tags: $("admin-tag-form"),
    albums: $("admin-album-form"),
    presets: $("admin-preset-form"),
    playlists: $("admin-playlist-form"),
  };
  let loading = false;
  let writing = false;
  let playlistSongOrder = [];
  let importPreview = "";
  let lastLoadError = "";

  function node(tagName, text, className) {
    const element = document.createElement(tagName);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function actionButton(label, action, kind = "secondary", disabled = false) {
    const button = node("button", label, "button button-" + kind);
    button.type = "button";
    button.disabled = disabled || writing;
    button.addEventListener("click", action);
    return button;
  }

  function setStatus(message, stateName = "") {
    const status = $("canzoniere-admin-status");
    status.textContent = message;
    status.dataset.state = stateName;
  }

  function setFormStatus(id, message, stateName = "") {
    const status = $(id);
    status.textContent = message;
    status.dataset.state = stateName;
  }

  async function request(path, method = "GET", data) {
    return window.ACCESSO.request("canzoniere" + path, method, data);
  }

  async function loadAllSongs() {
    const songs = [];
    let offset = 0;
    while (true) {
      const page = await request("/songs?limit=100&offset=" + offset);
      if (!Array.isArray(page.songs) || !Number.isSafeInteger(page.total))
        throw new Error("Risposta dell’elenco canzoni non valida.");
      songs.push(...page.songs);
      if (!page.hasMore) return songs;
      if (!page.songs.length) throw new Error("Caricamento canzoni interrotto: pagina vuota.");
      offset += page.songs.length;
    }
  }

  function fillBackupSongs(selected = $("admin-backup-song").value) {
    const select = $("admin-backup-song");
    select.replaceChildren();
    option(select, "Scegli una canzone", "");
    state.songs.forEach((song) => option(select, song.title, song.slug, song.slug === selected));
    $("admin-backup-chordpro").disabled = writing || !select.value;
  }

  function fillPlaylistPicker(selected = "") {
    const select = $("admin-playlist-song-picker");
    select.replaceChildren();
    option(select, "Scegli una canzone", "");
    state.songs.forEach((song) => option(select, song.title, song.slug, song.slug === selected));
  }

  function confirmRemove(kind, record) {
    const names = { songs: "canzone", tags: "tag", albums: "album", presets: "preset", playlists: "scaletta" };
    if (!window.confirm("Eliminare " + names[kind] + " «" + (record.title || record.name) + "»?")) return;
    if (forms[kind] && forms[kind].dataset.slug === record.slug) closeForm(kind);
    mutate(kind, "DELETE", record.slug, {}, record.revision, null);
  }

  function renderSongs() {
    const list = $("admin-songs-list");
    const query = M.normalizeSearch($("admin-song-search").value);
    const songs = state.songs.filter((song) =>
      M.normalizeSearch([song.title, song.author].join(" ")).includes(query));
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    $("admin-songs-status").textContent = songs.length + (songs.length === 1 ? " canzone." : " canzoni.");
    if (!songs.length) {
      empty(list, query ? "Nessuna canzone corrisponde alla ricerca." : "Nessuna canzone nel catalogo.");
      return;
    }
    songs.forEach((song) => {
      const album = state.albums.find((item) => item.slug === song.albumSlug);
      const details = [song.author, album?.title, song.key, song.bpm ? song.bpm + " BPM" : "", song.rights]
        .filter(Boolean).join(" · ");
      const actions = node("div", undefined, "admin-record-actions");
      actions.append(
        actionButton("Modifica", () => editSong(song.slug)),
        actionButton("Esporta .cho", () => exportChordPro(song.slug)),
        actionButton("Elimina", () => confirmRemove("songs", song), "danger"),
      );
      list.append(recordNode(song.title, details, actions));
    });
  }

  function renderSimpleList(kind, id, label, details, edit) {
    const list = $(id);
    list.replaceChildren();
    if (!state[kind].length) {
      empty(list, "Nessun elemento in questa sezione.");
      return;
    }
    state[kind].forEach((record) => {
      const actions = node("div", undefined, "admin-record-actions");
      actions.append(
        actionButton("Modifica", () => edit(record)),
        actionButton("Elimina", () => confirmRemove(kind, record), "danger"),
      );
      list.append(recordNode(label(record), details(record), actions));
    });
  }

  function recordNode(title, detail, actions) {
    const article = node("article", undefined, "admin-record");
    const content = node("div", undefined, "admin-record-main");
    content.append(node("strong", title), node("span", detail || ""));
    article.append(content, actions);
    return article;
  }

  function empty(list, text) {
    list.append(node("p", text, "admin-empty"));
  }

  function renderAll() {
    renderSongs();
    renderSimpleList("tags", "admin-tags-list", (tag) => tag.name,
      (tag) => tag.category + " · " + tag.slug, editTag);
    renderSimpleList("albums", "admin-albums-list", (album) => album.title,
      (album) => [album.author, album.year].filter(Boolean).join(" · ") || album.slug, editAlbum);
    renderSimpleList("presets", "admin-presets-list", (preset) => preset.title,
      (preset) => preset.tagSlugs.length + " tag · massimo " + preset.limit + " canzoni", editPreset);
    renderSimpleList("playlists", "admin-playlists-list", (playlist) => playlist.title,
      (playlist) => (playlist.published ? "Pubblicata" : "Bozza") + " · " + playlist.songSlugs.length + " canzoni",
      editPlaylist);
    fillBackupSongs($("admin-backup-song").value);
  }

  function showForm(kind, panel) {
    Object.values(forms).forEach((form) => { form.hidden = true; });
    forms[kind].hidden = false;
    $("admin-section-nav").dispatchEvent(new CustomEvent("section-select", { detail: panel }));
    forms[kind].scrollIntoView({ block: "start", behavior: "instant" });
  }

  function closeForm(kind) {
    const form = forms[kind];
    form.reset();
    form.hidden = true;
    delete form.dataset.slug;
    if (kind === "playlists") {
      playlistSongOrder = [];
      renderPlaylistOrder();
    }
  }

  function option(select, label, value, selected = false) {
    const item = node("option", label);
    item.value = value;
    item.selected = selected;
    select.append(item);
  }

  function fillSongAlbums(selected = "") {
    const select = $("admin-song-album");
    select.replaceChildren();
    option(select, "Nessun album", "");
    state.albums.forEach((album) => option(select, album.title, album.slug, album.slug === selected));
  }

  function renderChecks(id, records, selected, titleFor) {
    const fieldset = $(id);
    const legend = fieldset.querySelector("legend");
    fieldset.replaceChildren(legend);
    const chosen = new Set(selected);
    records.forEach((record) => {
      const label = node("label");
      const checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.name = id;
      checkbox.value = record.slug;
      checkbox.checked = chosen.has(record.slug);
      label.append(checkbox, node("span", titleFor(record)));
      fieldset.append(label);
    });
    if (!records.length) fieldset.append(node("span", "Nessuna voce disponibile.", "admin-hint"));
  }

  function checked(id) {
    return [...$(id).querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  }

  function uniqueSlug(kind, value) {
    const base = M.slugify(value) || "elemento";
    const used = new Set(state[kind].map((record) => record.slug));
    let slug = base;
    for (let suffix = 2; used.has(slug); suffix++) slug = base + "-" + suffix;
    return slug;
  }

  function resetSongForm() {
    forms.songs.reset();
    delete forms.songs.dataset.slug;
    $("admin-song-form-title").textContent = "Nuova canzone";
    $("admin-song-save").textContent = "Salva canzone";
    $("admin-song-export").hidden = true;
    $("admin-song-meter").value = "4/4";
    $("admin-song-capo").value = "0";
    $("admin-song-bars").value = "2";
    $("admin-song-rights").value = "da verificare";
    fillSongAlbums();
    renderChecks("admin-song-tags", state.tags, [], (tag) => tag.name);
    importPreview = "";
    $("admin-import-file").value = "";
    $("admin-import-text").value = "";
    $("admin-import-preview-box").replaceChildren();
    $("admin-import-preview-box").hidden = true;
    $("admin-import-confirm").disabled = true;
    $("admin-import-status").textContent = "";
    setFormStatus("admin-song-form-status", "");
    previewSong();
  }

  function newSong() {
    resetSongForm();
    showForm("songs", "admin-songs-panel");
    $("admin-song-title").focus();
  }

  async function editSong(slug) {
    try {
      setStatus("Caricamento canzone…");
      const song = await request("/songs/" + encodeURIComponent(slug));
      resetSongForm();
      forms.songs.dataset.slug = song.slug;
      $("admin-song-form-title").textContent = "Modifica canzone";
      $("admin-song-save").textContent = "Salva modifiche";
      $("admin-song-export").hidden = false;
      $("admin-song-title").value = song.title;
      $("admin-song-author").value = song.author;
      $("admin-song-key").value = song.key;
      $("admin-song-album").value = song.albumSlug || "";
      $("admin-song-text").value = song.text;
      $("admin-song-bpm").value = song.bpm ?? "";
      $("admin-song-meter").value = song.meter;
      $("admin-song-capo").value = String(song.capo);
      $("admin-song-bars").value = String(song.barsPerLine);
      $("admin-song-rights").value = song.rights;
      $("admin-song-source").value = song.source;
      $("admin-song-notes").value = song.notes;
      renderChecks("admin-song-tags", state.tags, song.tagSlugs, (tag) => tag.name);
      previewSong();
      showForm("songs", "admin-songs-panel");
      $("admin-song-title").focus();
      setStatus("Canzone caricata.");
    } catch (error) {
      setStatus("Impossibile aprire la canzone: " + error.message, "error");
      console.error("Lettura canzone admin non riuscita", error);
    }
  }

  function previewSong() {
    VIEW.renderScore($("admin-chordpro-preview"), { text: $("admin-song-text").value }, 0, true);
  }

  function chordProImport(source) {
    return M.importChordText(source);
  }

  async function previewImport() {
    const source = $("admin-import-text").value;
    try {
      if (!source.trim()) throw new Error("Incolla o seleziona un testo da importare.");
      const converted = chordProImport(source);
      importPreview = converted;
      VIEW.renderScore($("admin-import-preview-box"), { text: converted }, 0, true);
      $("admin-import-preview-box").hidden = false;
      $("admin-import-confirm").disabled = false;
      $("admin-import-status").textContent = "Anteprima pronta. Conferma per inserirla nell’editor.";
    } catch (error) {
      importPreview = "";
      $("admin-import-preview-box").replaceChildren();
      $("admin-import-preview-box").hidden = true;
      $("admin-import-confirm").disabled = true;
      $("admin-import-status").textContent = error.message;
      console.error("Anteprima import non riuscita", error);
    }
  }

  async function readImportFile() {
    const file = $("admin-import-file").files[0];
    if (!file) return;
    if (!/\.(?:txt|cho|pro)$/i.test(file.name)) {
      $("admin-import-status").textContent = "Usa un file .txt, .cho o .pro.";
      return;
    }
    if (file.size > 400000) {
      $("admin-import-status").textContent = "Il file supera il limite di 400000 byte.";
      return;
    }
    try {
      $("admin-import-text").value = await file.text();
      invalidateImportPreview();
      $("admin-import-status").textContent = "File caricato localmente. Mostra l’anteprima prima di confermare.";
    } catch (error) {
      $("admin-import-status").textContent = "Lettura file non riuscita: " + error.message;
      console.error("Lettura file import non riuscita", error);
    }
  }

  function confirmImport() {
    if ($("admin-import-confirm").disabled || !importPreview) return;
    $("admin-song-text").value = importPreview;
    previewSong();
    $("admin-import-status").textContent = "Testo inserito nell’editor. Salva la canzone per pubblicarlo.";
    $("admin-song-text").focus();
  }

  function invalidateImportPreview() {
    importPreview = "";
    $("admin-import-confirm").disabled = true;
    $("admin-import-preview-box").hidden = true;
    $("admin-import-status").textContent = "Il testo è cambiato: genera una nuova anteprima prima di confermare.";
  }

  async function saveSong(event) {
    event.preventDefault();
    if (writing || !forms.songs.reportValidity()) return;
    const currentSlug = forms.songs.dataset.slug || "";
    const current = state.songs.find((song) => song.slug === currentSlug);
    const data = {
      title: $("admin-song-title").value.trim(),
      author: $("admin-song-author").value.trim(),
      albumSlug: $("admin-song-album").value || null,
      text: $("admin-song-text").value,
      key: $("admin-song-key").value.trim(),
      bpm: $("admin-song-bpm").value === "" ? null : Number($("admin-song-bpm").value),
      meter: $("admin-song-meter").value,
      capo: Number($("admin-song-capo").value),
      barsPerLine: Number($("admin-song-bars").value),
      notes: $("admin-song-notes").value.trim(),
      source: $("admin-song-source").value.trim(),
      rights: $("admin-song-rights").value,
      tagSlugs: checked("admin-song-tags"),
    };
    const slug = currentSlug || uniqueSlug("songs", data.title);
    await mutate("songs", current ? "PATCH" : "POST", slug, data, current?.revision, forms.songs);
  }

  function renderPlaylistOrder() {
    const list = $("admin-playlist-song-order");
    list.replaceChildren();
    playlistSongOrder.forEach((slug, index) => {
      const song = state.songs.find((item) => item.slug === slug);
      const item = node("li", undefined, "admin-playlist-order-item");
      item.append(node("span", String(index + 1) + ". " + (song?.title || "Canzone non disponibile")));
      const actions = node("div", undefined, "admin-record-actions");
      actions.append(
        actionButton("↑", () => {
          if (index === 0) return;
          [playlistSongOrder[index - 1], playlistSongOrder[index]] =
            [playlistSongOrder[index], playlistSongOrder[index - 1]];
          renderPlaylistOrder();
        }, "secondary", index === 0),
        actionButton("↓", () => {
          if (index >= playlistSongOrder.length - 1) return;
          [playlistSongOrder[index + 1], playlistSongOrder[index]] =
            [playlistSongOrder[index], playlistSongOrder[index + 1]];
          renderPlaylistOrder();
        }, "secondary", index >= playlistSongOrder.length - 1),
        actionButton("Rimuovi", () => {
          playlistSongOrder = playlistSongOrder.filter((itemSlug) => itemSlug !== slug);
          renderPlaylistOrder();
        }, "danger"),
      );
      item.append(actions);
      list.append(item);
    });
    if (!playlistSongOrder.length) empty(list, "Aggiungi le canzoni nell’ordine di riproduzione.");
  }

  function addPlaylistSong() {
    const slug = $("admin-playlist-song-picker").value;
    if (!slug || playlistSongOrder.includes(slug)) return;
    if (playlistSongOrder.length >= 100) {
      setFormStatus("admin-playlist-form-status", "Una scaletta può contenere al massimo 100 canzoni.", "error");
      return;
    }
    playlistSongOrder.push(slug);
    renderPlaylistOrder();
    $("admin-playlist-song-picker").value = "";
  }

  async function mutate(kind, method, slug, data, revision, form) {
    if (writing || loading) return false;
    const snapshot = [...state[kind]];
    if (method === "DELETE") state[kind] = state[kind].filter((item) => item.slug !== slug);
    else {
      const current = state[kind].find((item) => item.slug === slug);
      upsert(kind, { ...current, ...data, slug, revision: current ? current.revision + 1 : 1 });
    }
    writing = true;
    main.setAttribute("aria-busy", "true");
    renderAll();
    setStatus("Salvataggio in corso…");
    const route = "canzoniere/" + kind + (method === "POST" ? "" : "/" + encodeURIComponent(slug));
    const payload = method === "POST" ? { slug, ...data } : method === "DELETE" ? { revision } : { revision, ...data };
    let saved;
    try {
      saved = await window.ACCESSO.request(route, method, payload);
    } catch (error) {
      state[kind] = snapshot;
      writing = false;
      main.setAttribute("aria-busy", String(loading));
      renderAll();
      setStatus("Non salvato: " + error.message, "error");
      if (form) setFormStatus(formStatusId(kind) || "admin-song-form-status", error.message, "error");
      console.error("Salvataggio admin Canzoniere non riuscito", error);
      return false;
    }
    writing = false;
    if (method !== "DELETE") upsert(kind, summary(kind, saved));
    if (form) closeForm(kind);
    main.setAttribute("aria-busy", "false");
    renderAll();
    setStatus("Salvataggio riuscito. Aggiornamento riferimenti…", "success");
    const refreshed = await loadData(true);
    if (refreshed) setStatus("Salvataggio completato.", "success");
    else setStatus("Salvato, ma non è stato possibile aggiornare i riferimenti: " + lastLoadError, "error");
    return true;
  }

  async function removeRecord(kind, slug, title) {
    const record = state[kind].find((item) => item.slug === slug);
    if (!record || !window.confirm("Eliminare «" + title + "»?")) return;
    await mutate(kind, "DELETE", slug, {}, record.revision, null);
  }

  function formStatusId(kind) {
    return {
      songs: "admin-song-form-status",
      tags: "admin-tag-form-status",
      albums: "admin-album-form-status",
      presets: "admin-preset-form-status",
      playlists: "admin-playlist-form-status",
    }[kind];
  }

  function upsert(kind, record) {
    const index = state[kind].findIndex((item) => item.slug === record.slug);
    if (index === -1) state[kind] = [record, ...state[kind]];
    else state[kind] = state[kind].map((item) => item.slug === record.slug ? record : item);
  }

  function summary(kind, record) {
    if (kind !== "songs") return record;
    const { text, ...result } = record;
    return result;
  }

  function saveSimple(kind, fields) {
    return async (event) => {
      event.preventDefault();
      const form = forms[kind];
      if (writing || !form.reportValidity()) return;
      const data = fields.build();
      const title = kind === "tags" ? data.name : data.title;
      const slug = form.dataset.slug || uniqueSlug(kind, title);
      const current = state[kind].find((record) => record.slug === slug);
      await mutate(kind, current ? "PATCH" : "POST", slug, data, current?.revision, form);
    };
  }

  function setupSimpleForms() {
    $("admin-tag-form").addEventListener("submit", saveSimple("tags", {
      name: true,
      build: () => ({ name: $("admin-tag-name").value.trim(), category: $("admin-tag-category").value }),
    }));
    $("admin-album-form").addEventListener("submit", saveSimple("albums", {
      title: true,
      build: () => ({
        title: $("admin-album-title").value.trim(),
        author: $("admin-album-author").value.trim(),
        year: $("admin-album-year").value === "" ? null : Number($("admin-album-year").value),
        notes: $("admin-album-notes").value.trim(),
      }),
    }));
    $("admin-preset-form").addEventListener("submit", saveSimple("presets", {
      title: true,
      build: () => ({
        title: $("admin-preset-title").value.trim(),
        tagSlugs: checked("admin-preset-tags"),
        songSlugs: checked("admin-preset-songs"),
        limit: Number($("admin-preset-limit").value),
      }),
    }));
    $("admin-playlist-form").addEventListener("submit", saveSimple("playlists", {
      title: true,
      build: () => ({
        title: $("admin-playlist-title").value.trim(),
        description: $("admin-playlist-description").value.trim(),
        songSlugs: [...playlistSongOrder],
        published: $("admin-playlist-published").checked,
      }),
    }));
  }

  function closeFormsExcept(kind) {
    Object.entries(forms).forEach(([name, form]) => {
      if (name !== kind) form.hidden = true;
    });
  }

  function addSimpleFormListeners() {
    const start = (kind, panel, heading, title) => {
      forms[kind].reset();
      delete forms[kind].dataset.slug;
      closeFormsExcept(kind);
      $(heading).textContent = kind === "playlists" ? "Nuova scaletta" : "Nuovo " + title;
      if (kind === "tags") $("admin-tag-category").value = "altro";
      if (kind === "albums") $("admin-album-year").value = "";
      if (kind === "presets") {
        $("admin-preset-limit").value = "12";
        renderChecks("admin-preset-tags", state.tags, [], (tag) => tag.name);
        renderChecks("admin-preset-songs", state.songs, [], (song) => song.title);
      }
      if (kind === "playlists") {
        playlistSongOrder = [];
        fillPlaylistPicker();
        renderPlaylistOrder();
      }
      forms[kind].hidden = false;
      setFormStatus(formStatusId(kind), "");
      showPanel(panel);
      forms[kind].scrollIntoView({ block: "start", behavior: "instant" });
    };
    $("admin-new-tag").addEventListener("click", () =>
      start("tags", "admin-tags-panel", "admin-tag-form-title", "tag"));
    $("admin-new-album").addEventListener("click", () =>
      start("albums", "admin-albums-panel", "admin-album-form-title", "album"));
    $("admin-new-preset").addEventListener("click", () =>
      start("presets", "admin-presets-panel", "admin-preset-form-title", "preset"));
    $("admin-new-playlist").addEventListener("click", () =>
      start("playlists", "admin-playlists-panel", "admin-playlist-form-title", "scaletta"));
    for (const [kind, cancel] of [
      ["tags", "admin-tag-cancel"],
      ["albums", "admin-album-cancel"],
      ["presets", "admin-preset-cancel"],
      ["playlists", "admin-playlist-cancel"],
    ]) $(cancel).addEventListener("click", () => closeForm(kind));
    $("admin-playlist-add-song").addEventListener("click", addPlaylistSong);
  }

  function showPanel(panelId) {
    $("admin-section-nav").dispatchEvent(new CustomEvent("section-select", { detail: panelId }));
  }

  function editTag(tag) {
    const form = forms.tags;
    form.reset();
    form.dataset.slug = tag.slug;
    $("admin-tag-form-title").textContent = "Modifica tag";
    $("admin-tag-name").value = tag.name;
    $("admin-tag-category").value = tag.category;
    closeFormsExcept("tags");
    form.hidden = false;
    showPanel("admin-tags-panel");
    form.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function editAlbum(album) {
    const form = forms.albums;
    form.reset();
    form.dataset.slug = album.slug;
    $("admin-album-form-title").textContent = "Modifica album";
    $("admin-album-title").value = album.title;
    $("admin-album-author").value = album.author;
    $("admin-album-year").value = album.year ?? "";
    $("admin-album-notes").value = album.notes;
    closeFormsExcept("albums");
    form.hidden = false;
    showPanel("admin-albums-panel");
    form.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function editPreset(preset) {
    const form = forms.presets;
    form.reset();
    form.dataset.slug = preset.slug;
    $("admin-preset-form-title").textContent = "Modifica preset";
    $("admin-preset-title").value = preset.title;
    $("admin-preset-limit").value = String(preset.limit);
    renderChecks("admin-preset-tags", state.tags, preset.tagSlugs, (tag) => tag.name);
    renderChecks("admin-preset-songs", state.songs, preset.songSlugs, (song) => song.title);
    closeFormsExcept("presets");
    form.hidden = false;
    showPanel("admin-presets-panel");
    form.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function editPlaylist(playlist) {
    const form = forms.playlists;
    form.reset();
    form.dataset.slug = playlist.slug;
    $("admin-playlist-form-title").textContent = "Modifica scaletta";
    $("admin-playlist-title").value = playlist.title;
    $("admin-playlist-description").value = playlist.description;
    $("admin-playlist-published").checked = playlist.published;
    playlistSongOrder = [...playlist.songSlugs];
    fillPlaylistPicker();
    renderPlaylistOrder();
    closeFormsExcept("playlists");
    form.hidden = false;
    showPanel("admin-playlists-panel");
    form.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function downloadFile(filename, type, content) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = node("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function exportChordPro(slug) {
    try {
      const song = await request("/songs/" + encodeURIComponent(slug));
      const album = state.albums.find((item) => item.slug === song.albumSlug);
      downloadFile(song.slug + ".cho", "text/plain;charset=utf-8", M.formatChordPro(song, album?.title || ""));
      setStatus("Esportazione ChordPro completata.", "success");
    } catch (error) {
      setStatus("Esportazione non riuscita: " + error.message, "error");
      console.error("Esportazione ChordPro non riuscita", error);
    }
  }

  async function exportBackup() {
    setStatus("Preparazione backup JSON…");
    try {
      const songs = [];
      for (let offset = 0; offset < state.songs.length; offset += 10) {
        const batch = state.songs.slice(offset, offset + 10);
        songs.push(...await Promise.all(batch.map((song) => request("/songs/" + encodeURIComponent(song.slug)))));
      }
      const backup = {
        format: "agesci-canicattini1-canzoniere",
        version: 1,
        exportedAt: new Date().toISOString(),
        songs,
        tags: state.tags,
        albums: state.albums,
        presets: state.presets,
        playlists: state.playlists,
      };
      downloadFile("canzoniere-backup.json", "application/json;charset=utf-8", JSON.stringify(backup, null, 2));
      $("admin-backup-status").textContent = "Backup JSON scaricato.";
    } catch (error) {
      $("admin-backup-status").textContent = "Backup non riuscito: " + error.message;
      console.error("Backup Canzoniere non riuscito", error);
    }
  }

  async function loadData(quiet = false) {
    if (loading) return false;
    loading = true;
    main.setAttribute("aria-busy", "true");
    if (!quiet) setStatus("Caricamento del catalogo…");
    try {
      const [catalog, songs] = await Promise.all([request(""), loadAllSongs()]);
      if (!Array.isArray(catalog.tags) || !Array.isArray(catalog.albums) ||
          !Array.isArray(catalog.presets) || !Array.isArray(catalog.playlists))
        throw new Error("Catalogo Canzoniere non valido.");
      Object.assign(state, {
        songs,
        tags: catalog.tags,
        albums: catalog.albums,
        presets: catalog.presets,
        playlists: catalog.playlists,
      });
      renderAll();
      lastLoadError = "";
      if (!quiet) setStatus("Catalogo aggiornato.");
      return true;
    } catch (error) {
      lastLoadError = error.message;
      if (!quiet) setStatus("Caricamento non riuscito: " + error.message, "error");
      console.error("Caricamento gestione Canzoniere non riuscito", error);
      return false;
    } finally {
      loading = false;
      main.setAttribute("aria-busy", String(writing));
    }
  }

  function initialize() {
    $("admin-new-song").addEventListener("click", newSong);
    $("admin-song-search").addEventListener("input", renderSongs);
    $("admin-song-form").addEventListener("submit", saveSong);
    $("admin-song-cancel").addEventListener("click", () => closeForm("songs"));
    $("admin-song-text").addEventListener("input", previewSong);
    $("admin-import-file").addEventListener("change", readImportFile);
    $("admin-import-text").addEventListener("input", invalidateImportPreview);
    $("admin-import-preview").addEventListener("click", previewImport);
    $("admin-import-confirm").addEventListener("click", confirmImport);
    $("admin-song-export").addEventListener("click", (event) => {
      event.preventDefault();
      const slug = forms.songs.dataset.slug;
      if (slug) exportChordPro(slug);
    });
    setupSimpleForms();
    addSimpleFormListeners();
    $("admin-backup-json").addEventListener("click", exportBackup);
    $("admin-backup-song").addEventListener("change", () => {
      $("admin-backup-chordpro").disabled = !$("admin-backup-song").value;
    });
    $("admin-backup-chordpro").addEventListener("click", () => {
      if ($("admin-backup-song").value) exportChordPro($("admin-backup-song").value);
    });
    $("canzoniere-admin-reload").addEventListener("click", () => loadData());
    loadData();
  }

  initialize();
})();
