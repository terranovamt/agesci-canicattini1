(function () {
  if (!window.ACCESSO.verificata()) {
    location.replace("./");
    return;
  }
  const $ = (id) => document.getElementById(id);
  const D = window.DOCUMENTS;
  const M = window.DOCUMENTS_MODEL;
  const limitMiB = 20;
  const currentYear = new Date().getFullYear();
  const currentUser = window.NAS?.user || {};
  const typeLabel = (type) => (M.assemblyTypes.find(([value]) => value === type) || [])[1] || "";
  let items = [],
    privateItems = [],
    loadState = "loading",
    loadError = "",
    privateLoadState = "loading",
    privateLoadError = "",
    editing = null,
    editingPrivate = null,
    pending = null,
    busy = false,
    formDirty = false;
  const pdfHref = (file) => "../documents/pdf/" + encodeURIComponent(file);
  const privatePdfHref = (id) => D.privatePdfHref(id);
  const sorted = (list) =>
    [...list].sort(
      (a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || "") || a.title.localeCompare(b.title, "it"),
    );
  const formatDate = (iso) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(text, className, label, onclick) {
    const element = node("button", className, text);
    element.type = "button";
    if (label) element.setAttribute("aria-label", label);
    element.onclick = onclick;
    return element;
  }
  function renderCategoryFilter() {
    const filter = $("documents-category-filter");
    const all = node("option", "", "Tutte le categorie");
    all.value = "all";
    filter.replaceChildren(all, ...M.documentCategories.map(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      return option;
    }));
    filter.value = M.defaultCategory(currentUser);
    $("documents-category-hint").textContent = currentUser.admin
      ? "Scegli una categoria oppure visualizzale tutte."
      : ["L/C", "E/G", "R/S"].includes(currentUser.serviceBranch)
        ? "Sono mostrati prima i documenti della tua branca; scegli “Tutte le categorie” per ampliare la ricerca."
        : "Scegli una categoria oppure visualizzale tutte.";
    filter.onchange = () => {
      render();
      renderPrivate();
    };
  }
  function selectedCategory() {
    return $("documents-category-filter").value || "all";
  }
  function configureCategoryChoices() {
    const editable = new Set(M.editableCategories(currentUser).map(([value]) => value));
    [...$("document-category").options].forEach((option) => {
      if (M.branchCategories.includes(option.value) || option.value === "group")
        option.disabled = !editable.has(option.value);
    });
  }

  function canChangeVisibility() {
    const category = $("document-category").value;
    const sourceCategory = editing ? M.categoryOf(editing) : editingPrivate?.category;
    return M.privateCategories.includes(category) &&
      (sourceCategory === undefined || M.privateCategories.includes(sourceCategory));
  }

  $("documents-app").hidden = false;
  renderCategoryFilter();
  configureCategoryChoices();
  $("preparatory-year").textContent = currentYear;
  $("documents-source").textContent = "Sorgente: NAS del gruppo";
  $("upload-hint").textContent = "PDF inferiore a " + limitMiB + " MiB (limite NAS).";
  $("publish-timing").textContent = "La visibilità viene impostata per ogni documento.";

  function message(text, kind = "") {
    $("documents-message").textContent = text;
    $("documents-message").className = kind;
  }
  function syncDisabled() {
    $("documents-app")
      .querySelectorAll("input,textarea,select,button")
      .forEach((element) => {
        if (!element.closest("[data-section-nav]")) element.disabled = busy;
      });
    $("document-category").disabled = busy;
    $("document-category").querySelector('option[value="public"]').disabled = !!editingPrivate;
    $("document-category").querySelector('option[value="preparatory"]').disabled = !!editingPrivate;
    $("document-visibility").disabled = busy || !canChangeVisibility();
    $("document-visibility-toggle").disabled = busy || !canChangeVisibility();
    $("save-document").disabled = busy || ($("document-visibility").value === "public" ? loadState : privateLoadState) !== "ready";
    $("managed-documents").setAttribute("aria-busy", String(busy || loadState === "loading"));
    $("private-documents-list").setAttribute("aria-busy", String(busy || privateLoadState === "loading"));
    $("preparatory-slots").setAttribute("aria-busy", String(loadState === "loading"));
  }
  function lock(value) {
    busy = value;
    syncDisabled();
  }
  function showPanel(id) {
    $("documents-section-nav")?.dispatchEvent(new CustomEvent("section-select", { detail: id }));
    if (id === "documents-edit-panel") $(id).scrollTop = 0;
  }
  function discardDraft(text = "Scartare le modifiche al documento aperto?") {
    return !formDirty || confirm(text);
  }

  function updateVisibility() {
    const category = $("document-category").value;
    const supportsVisibility = canChangeVisibility();
    const visibility = supportsVisibility ? $("document-visibility").value : "public";
    $("document-visibility-field").hidden = !supportsVisibility;
    $("document-category-row").classList.toggle("has-visibility", supportsVisibility);
    $("document-visibility-toggle").textContent = visibility === "private" ? "Privato" : "Pubblico";
    $("document-visibility-toggle").setAttribute("aria-pressed", String(visibility === "private"));
    $("visibility-hint").textContent = visibility === "private"
      ? "Questo PDF è accessibile solo ai capi autorizzati."
      : "Questo PDF è accessibile a chiunque.";
    $("publish-timing").textContent = visibility === "private"
      ? "Il PDF privato resterà nel database NAS e non comparirà nell’archivio pubblico."
      : "Il PDF sarà disponibile nell’archivio pubblico.";
    const originalVisibility = editingPrivate ? "private" : editing ? "public" : "";
    const changingVisibility = originalVisibility && originalVisibility !== visibility;
    $("save-document").textContent = changingVisibility
      ? "Salva e rendi " + (visibility === "private" ? "privato" : "pubblico")
      : editing || editingPrivate ? "Salva modifiche"
        : visibility === "private" ? "Salva documento privato" : "Pubblica documento";
    syncDisabled();
  }
  function setCategory(category, resetVisibility = true) {
    $("document-category").value = category;
    const preparatory = category === "preparatory";
    const supportsVisibility = M.privateCategories.includes(category);
    if (supportsVisibility && resetVisibility && !editing && !editingPrivate)
      $("document-visibility").value = "private";
    if (!supportsVisibility) $("document-visibility").value = "public";
    $("assembly-fields").hidden = !preparatory;
    $("document-assembly-year").required = preparatory;
    $("document-assembly-type").required = preparatory;
    let warning = "";
    if (!preparatory && editing && M.categoryOf(editing) === "preparatory")
      warning = "Salvando in un'altra categoria, il documento non comparirà più tra i preparatori assemblea.";
    else if (preparatory && editing && editing.assemblyYear === undefined && editing.assemblyType !== undefined)
      warning = "Questo documento ha un tipo preparatorio ma nessun anno: indica l’anno dell’assemblea.";
    if (!preparatory) {
      $("document-assembly-year").value = "";
      $("document-assembly-type").value = "";
    }
    $("kind-warning").textContent = warning;
    $("kind-warning").hidden = !warning;
    updateVisibility();
  }
  function reset() {
    editing = null;
    editingPrivate = null;
    formDirty = false;
    $("document-file").value = "";
    $("document-file").required = true;
    $("file-label").firstChild.textContent = "File PDF ";
    $("file-hint").textContent = "(obbligatorio)";
    $("current-file").hidden = true;
    $("document-title").value = "";
    delete $("document-title").dataset.auto;
    $("document-description").value = "";
    $("document-year").value = currentYear;
    $("document-published-at").value = new Date().toLocaleDateString("sv-SE");
    $("document-assembly-year").value = "";
    $("document-assembly-type").value = "";
    $("document-category").querySelectorAll('option[value="public"],option[value="preparatory"]')
      .forEach((option) => { option.disabled = false; });
    setCategory("public");
    $("edit-heading").textContent = "Nuovo documento";
    $("cancel-document").hidden = true;
  }
  function startEdit(item) {
    if (busy || !discardDraft()) return;
    reset();
    editing = { ...item };
    setCategory(M.categoryOf(item), false);
    $("document-visibility").value = "public";
    $("document-file").value = "";
    $("document-file").required = false;
    $("file-label").firstChild.textContent = "Sostituisci PDF ";
    $("file-hint").textContent = "(facoltativo, mantiene il nome " + item.file + ")";
    $("current-file").hidden = false;
    $("current-file-link").href = pdfHref(item.file);
    $("current-file-link").textContent = item.file;
    $("document-title").value = item.title;
    $("document-description").value = item.description;
    $("document-year").value = item.year ?? "";
    $("document-published-at").value = item.publishedAt || "";
    $("document-assembly-year").value = item.assemblyYear ?? "";
    $("document-assembly-type").value =
      item.assemblyType || (item.assemblyYear !== undefined ? M.assemblyType(item) : "");
    updateVisibility();
    $("edit-heading").textContent = "Modifica documento";
    $("save-document").textContent = "Salva modifiche";
    $("cancel-document").hidden = false;
    formDirty = false;
    showPanel("documents-edit-panel");
    $("document-title").focus();
    $("document-form").scrollIntoView({ block: "start", behavior: "instant" });
    syncDisabled();
  }
  function startPrivateEdit(item) {
    if (busy || !discardDraft()) return;
    reset();
    editingPrivate = { ...item };
    $("document-category").querySelectorAll('option[value="public"],option[value="preparatory"]')
      .forEach((option) => { option.disabled = true; });
    $("document-visibility").value = "private";
    setCategory(item.category, false);
    $("document-file").value = "";
    $("document-file").required = false;
    $("file-label").firstChild.textContent = "Sostituisci PDF ";
    $("file-hint").textContent = "(facoltativo, mantiene il PDF attuale)";
    $("current-file").hidden = false;
    $("current-file-link").href = privatePdfHref(item.id);
    $("current-file-link").textContent = "Apri PDF privato";
    $("document-title").value = item.title;
    $("document-description").value = item.description;
    $("document-year").value = item.year ?? "";
    $("document-published-at").value = item.publishedAt || "";
    $("document-assembly-year").value = "";
    $("document-assembly-type").value = "";
    $("edit-heading").textContent = "Modifica documento privato";
    $("save-document").textContent = "Salva modifiche";
    $("cancel-document").hidden = false;
    formDirty = false;
    showPanel("documents-edit-panel");
    $("document-title").focus();
    $("document-form").scrollIntoView({ block: "start", behavior: "instant" });
    syncDisabled();
  }
  function startNew(type) {
    if (busy || !discardDraft()) return;
    reset();
    if (type) {
      setCategory("preparatory");
      $("document-assembly-year").value = currentYear;
      $("document-assembly-type").value = type;
      $("edit-heading").textContent = "Nuovo preparatorio: " + typeLabel(type) + " " + currentYear;
    }
    showPanel("documents-edit-panel");
    $("document-file").focus();
    syncDisabled();
  }
  function startPrivateDocument() {
    if (busy || !discardDraft()) return;
    reset();
    const category = M.branchCategories.includes(currentUser.serviceBranch) ? currentUser.serviceBranch : "group";
    setCategory(category);
    $("edit-heading").textContent = "Nuovo documento privato";
    showPanel("documents-edit-panel");
    $("document-file").focus();
    syncDisabled();
  }

  function renderSlots() {
    const list = $("preparatory-slots");
    const category = selectedCategory();
    $("preparatory-section").hidden = category !== "all" && category !== "preparatory";
    list.replaceChildren();
    const ready = loadState === "ready";
    const slots = ready ? M.preparatorySlots(items, currentYear) : [];
    const available = ready ? M.preparatory(items, currentYear) : [];
    M.assemblyTypes.forEach(([type, label], index) => {
      const slot = node("li", "slot");
      slot.dataset.type = type;
      slot.append(node("span", "slot-type", label));
      if (!ready) {
        slot.classList.add("is-unknown");
        slot.append(node("span", "slot-state", loadState === "error" ? "Non verificato" : "Verifica in corso…"));
      } else if (slots[index].document) {
        const item = slots[index].document;
        const link = node("a", "slot-document", item.title);
        link.href = pdfHref(item.file);
        link.target = "_blank";
        link.rel = "noopener";
        slot.append(link);
        const versions = available.filter((other) => M.assemblyType(other) === type).length - 1;
        if (versions > 0)
          slot.append(node("span", "slot-state", "+" + versions + (versions === 1 ? " versione" : " versioni") + " nell’elenco"));
        slot.append(button("Modifica", "secondary", "Modifica " + label + " " + currentYear, () => startEdit(item)));
      } else {
        slot.classList.add("is-missing");
        slot.append(node("span", "slot-state", "Mancante"));
        slot.append(button("Carica", "secondary", "Carica " + label + " " + currentYear, () => startNew(type)));
      }
      list.append(slot);
    });
    const untyped = available.filter((item) => !M.assemblyType(item)).length;
    $("preparatory-untyped")?.remove();
    if (untyped) {
      const note = node("p", "hint warning", untyped + " preparatori " + currentYear + " senza tipo: correggili dall’elenco.");
      note.id = "preparatory-untyped";
      list.after(note);
    }
  }
  function renderItem(item) {
    const article = node("article", "managed-document");
    article.dataset.file = item.file;
    const main = node("div", "doc-main");
    main.append(node("h3", "", item.title));
    const meta = node("p", "doc-meta");
    const category = M.categoryOf(item);
    meta.append(node("span", category === "preparatory" ? "chip chip-prep" : "chip chip-category",
      M.categoryLabel(category)));
    if (M.privateCategories.includes(category))
      meta.append(node("span", "chip chip-visibility-public", "Pubblico"));
    if (item.year !== undefined) meta.append(node("span", "chip", "Anno " + item.year));
    if (item.publishedAt) meta.append(node("span", "chip", "Pubblicato " + formatDate(item.publishedAt)));
    if (item.assemblyYear !== undefined) {
      const type = typeLabel(M.assemblyType(item));
      meta.append(
        node("span", "chip chip-prep", "Preparatorio " + item.assemblyYear + " · " + (type || "tipo mancante")),
      );
    } else if (item.assemblyType !== undefined) {
      meta.append(node("span", "chip chip-warn", typeLabel(item.assemblyType) + " senza anno assemblea"));
    }
    if (pending?.file === item.file) {
      article.classList.add("is-pending");
      article.setAttribute("aria-busy", "true");
      meta.append(
        node(
          "span",
          "chip chip-pending",
          pending.operation === "delete" ? "Eliminazione in attesa di conferma…" : "Modifica in attesa di conferma…",
        ),
      );
    }
    main.append(meta, node("p", "doc-description", item.description));
    const tech = node("details", "doc-tech");
    tech.append(node("summary", "", "Dettagli tecnici"));
    const facts = node("dl");
    [
      ["File", item.file],
      ["Percorso", "documents/pdf/" + item.file],
    ].forEach(([term, value]) => facts.append(node("dt", "", term), node("dd", "", value)));
    tech.append(facts);
    main.append(tech);
    const actions = node("div", "doc-actions");
    const open = node("a", "doc-open", "Apri PDF");
    open.href = pdfHref(item.file);
    open.target = "_blank";
    open.rel = "noopener";
    open.setAttribute("aria-label", "Apri PDF " + item.title);
    actions.append(open);
    if (currentUser.admin || !M.branchCategories.includes(category) || category === currentUser.serviceBranch)
      actions.append(
        button("Modifica", "secondary", "Modifica " + item.title, () => startEdit(item)),
        button("Elimina", "danger", "Elimina " + item.title, () => remove(item)),
      );
    article.append(main, actions);
    return article;
  }
  function renderPrivateItem(item) {
    const article = node("article", "managed-document");
    article.dataset.privateId = item.id;
    const main = node("div", "doc-main");
    main.append(node("h3", "", item.title));
    const meta = node("p", "doc-meta");
    meta.append(
      node("span", "chip chip-category", M.categoryLabel(item.category)),
      node("span", "chip chip-visibility-private", "Privato · Solo capi"),
      node("span", "chip", "Anno " + item.year),
      node("span", "chip", "Pubblicato " + formatDate(item.publishedAt)),
    );
    main.append(meta, node("p", "doc-description", item.description));
    const actions = node("div", "doc-actions");
    const open = node("a", "doc-open", "Apri PDF");
    open.href = privatePdfHref(item.id);
    open.target = "_blank";
    open.rel = "noopener";
    open.setAttribute("aria-label", "Apri PDF privato " + item.title);
    actions.append(
      open,
      button("Modifica", "secondary", "Modifica " + item.title, () => startPrivateEdit(item)),
      button("Elimina", "danger", "Elimina " + item.title, () => removePrivate(item)),
    );
    article.append(main, actions);
    return article;
  }
  function renderPrivate() {
    const list = $("private-documents-list");
    const status = $("private-documents-status");
    const category = selectedCategory();
    const selected = M.filterCategory(privateItems, category);
    $("private-library").hidden = category !== "all" && !M.privateCategories.includes(category);
    list.replaceChildren();
    $("private-documents-retry").hidden = privateLoadState !== "error";
    status.className = privateLoadState === "error" ? "error" : "";
    if (privateLoadState === "loading") {
      status.textContent = "Caricamento documenti privati…";
      for (let index = 0; index < 2; index++) {
        const placeholder = node("article", "loading-skeleton");
        placeholder.setAttribute("aria-hidden", "true");
        list.append(placeholder);
      }
    } else if (privateLoadState === "error") {
      status.textContent = "Impossibile caricare i documenti privati: " + privateLoadError;
    } else {
      status.textContent = selected.length + (selected.length === 1 ? " documento privato." : " documenti privati.");
      if (!selected.length) list.append(node("p", "state-empty", "Nessun documento privato in questa categoria."));
      else {
        const categories = category === "all" ? M.privateCategories : [category];
        categories.forEach((value) => {
          const group = selected.filter((item) => item.category === value);
          if (!group.length) return;
          list.append(node("h3", "document-category-heading", M.categoryLabel(value)));
          group.forEach((item) => list.append(renderPrivateItem(item)));
        });
      }
    }
    syncDisabled();
  }
  function render() {
    const list = $("managed-documents");
    const category = selectedCategory();
    const visibleItems = M.filterCategory(items, category);
    list.replaceChildren();
    $("documents-list-heading").childNodes[0].textContent =
      (category === "all" ? "Tutte le categorie" : M.categoryLabel(category)) + " ";
    $("documents-count").textContent = loadState === "ready" ? "(" + visibleItems.length + ")" : "";
    if (loadState === "loading") {
      for (let index = 0; index < 3; index++) {
        const placeholder = node("article", "loading-skeleton");
        placeholder.setAttribute("aria-hidden", "true");
        list.append(placeholder);
      }
    } else if (loadState === "error") {
      const box = node("div", "state-error");
      box.setAttribute("role", "alert");
      box.append(
        node("p", "", "Impossibile caricare i documenti: " + loadError),
        button("Riprova", "secondary", "", reload),
      );
      list.append(box);
    } else if (!visibleItems.length) {
      list.append(node("p", "state-empty", "Nessun PDF pubblicato. Usa “Nuovo documento” per caricare il primo."));
    } else visibleItems.forEach((item) => list.append(renderItem(item)));
    renderSlots();
    syncDisabled();
  }

  async function reload() {
    if (busy || !discardDraft("Scartare le modifiche al modulo e ricaricare?")) return;
    loadState = "loading";
    privateLoadState = "loading";
    lock(true);
    render();
    renderPrivate();
    message("Caricamento dei documenti…", "pending");
    const [publicResult, privateResult] = await Promise.allSettled([D.load(), D.loadPrivate()]);
    if (publicResult.status === "fulfilled") {
      items = sorted(publicResult.value);
      loadState = "ready";
      loadError = "";
      reset();
      message("Documenti aggiornati dal NAS.");
    } else {
      loadState = "error";
      loadError = publicResult.reason.message;
      message(loadError, "error");
    }
    if (privateResult.status === "fulfilled") {
      privateItems = sorted(privateResult.value);
      privateLoadState = "ready";
      privateLoadError = "";
    } else {
      privateLoadState = "error";
      privateLoadError = privateResult.reason.message;
    }
    busy = false;
    render();
    renderPrivate();
  }
  async function reloadPrivate() {
    if (busy) return;
    privateLoadState = "loading";
    renderPrivate();
    try {
      privateItems = sorted(await D.loadPrivate());
      privateLoadState = "ready";
      privateLoadError = "";
    } catch (error) {
      privateLoadState = "error";
      privateLoadError = error.message;
    }
    renderPrivate();
  }
  async function publish(change) {
    const deleting = change.operation === "delete";
    pending = { operation: change.operation, file: (change.previous || change.document).file };
    lock(true);
    render();
    message(
      "Invio al NAS in corso: non ancora pubblicato.",
      "pending",
    );
    try {
      D.apply(items, change);
      const next = await D.save(change);
      items = sorted(next);
      if (!deleting) $("documents-category-filter").value = M.categoryOf(change.document);
      pending = null;
      if (!deleting || editing?.file === change.previous.file) reset();
      message(deleting ? "Eliminato dal sito." : "Pubblicato sul sito.", "success");
    } catch (error) {
      pending = null;
      message((deleting ? "Non eliminato: " : "Non salvato: ") + error.message, "error");
    } finally {
      busy = false;
      render();
    }
  }
  async function remove(item) {
    if (busy || !confirm('Eliminare definitivamente "' + item.title + '"? Il PDF sparirà dall’archivio pubblico.'))
      return;
    if (editing?.file === item.file && !discardDraft("Il modulo aperto su questo documento verrà chiuso. Continuare?"))
      return;
    await publish({ operation: "delete", previous: item });
  }
  async function publishPrivate(change) {
    const deleting = change.operation === "delete";
    let notice = "";
    lock(true);
    try {
      const saved = await D.savePrivate(change);
      privateItems = deleting
        ? privateItems.filter((item) => item.id !== change.previous.id)
        : sorted([saved, ...privateItems.filter((item) => item.id !== saved.id)]);
      if (!deleting && selectedCategory() !== "all") $("documents-category-filter").value = saved.category;
      privateLoadState = "ready";
      privateLoadError = "";
      if (!deleting || editingPrivate?.id === change.previous.id) reset();
      notice = deleting ? "Documento privato eliminato." : "Documento privato salvato.";
    } catch (error) {
      notice = (deleting ? "Non eliminato: " : "Non salvato: ") + error.message;
    } finally {
      busy = false;
      render();
      renderPrivate();
    }
    $("private-documents-status").textContent = notice;
    $("private-documents-status").className = notice.startsWith("Non ") ? "error" : "success";
  }

  async function changeVisibility(change) {
    const targetVisibility = change.source === "public" ? "private" : "public";
    lock(true);
    message("Aggiornamento della visibilità in corso…", "pending");
    try {
      const result = await D.changeVisibility(change);
      if (!result || result.visibility !== targetVisibility || result.document?.visibility !== targetVisibility) {
        throw new Error("Risposta di cambio visibilità non valida");
      }
      if (targetVisibility === "public") D.validate([result.document]);
      else if (!M.privateCategories.includes(result.document.category) || typeof result.document.id !== "string") {
        throw new Error("Risposta di documento privato non valida");
      }
      if (targetVisibility === "private") {
        items = items.filter((item) => item.file !== change.previous.file);
        privateItems = sorted([result.document, ...privateItems.filter((item) => item.id !== result.document.id)]);
        privateLoadState = "ready";
        privateLoadError = "";
      } else {
        privateItems = privateItems.filter((item) => item.id !== change.previous.id);
        items = sorted([result.document, ...items.filter((item) => item.file !== result.document.file)]);
      }
      if (selectedCategory() !== "all") $("documents-category-filter").value = result.document.category;
      reset();
      message("Visibilità aggiornata: documento " + targetVisibility + ".", "success");
    } catch (error) {
      message("Non salvato: " + error.message, "error");
    } finally {
      busy = false;
      render();
      renderPrivate();
    }
  }

  async function removePrivate(item) {
    if (busy || !confirm('Eliminare definitivamente "' + item.title + '" dall’archivio privato?'))
      return;
    if (editingPrivate?.id === item.id && !discardDraft("Il modulo aperto su questo documento verrà chiuso. Continuare?"))
      return;
    await publishPrivate({ operation: "delete", previous: item });
  }
  async function readPdf(file) {
    if (!D.safeName(file.name)) throw new Error("Seleziona un file con estensione .pdf e un nome valido");
    if (file.size >= limitMiB * 1024 * 1024)
      throw new Error("Il PDF supera il limite NAS di 20 MiB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Il file selezionato non è un PDF valido");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  $("document-form").oninput = () => {
    formDirty = true;
  };
  $("document-visibility-toggle").onclick = () => {
    if ($("document-visibility-toggle").disabled) return;
    const visibility = $("document-visibility");
    visibility.value = visibility.value === "private" ? "public" : "private";
    formDirty = true;
    updateVisibility();
  };
  $("document-form").onchange = (event) => {
    formDirty = true;
    if (event.target.id === "document-category") setCategory(event.target.value);
    if (event.target.id === "document-file" && !editing && !editingPrivate) {
      const title = $("document-title");
      const name = (event.target.files[0]?.name || "").replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
      if (name && (!title.value.trim() || title.dataset.auto === title.value)) {
        title.value = name.charAt(0).toUpperCase() + name.slice(1);
        title.dataset.auto = title.value;
      }
    }
  };
  $("document-form").onsubmit = async (event) => {
    event.preventDefault();
    const category = $("document-category").value;
    const visibility = canChangeVisibility() ? $("document-visibility").value : "public";
    if (busy || (visibility === "public" ? loadState : privateLoadState) !== "ready") return;
    const file = $("document-file").files[0];
    const title = $("document-title").value.trim();
    const description = $("document-description").value.trim() || title;
    if (!title) {
      message("Inserisci un titolo.", "error");
      return;
    }
    lock(true);
    let change;
    try {
      const content = file ? await readPdf(file) : undefined;
      const preparatory = category === "preparatory";
      const assemblyYear = $("document-assembly-year").value.trim();
      const assemblyType = $("document-assembly-type").value;
      if (preparatory && !assemblyYear) throw new Error("Indica l’anno dell’assemblea.");
      if (preparatory && !assemblyType) throw new Error("Scegli il tipo di documento preparatorio.");
      const originalVisibility = editingPrivate ? "private" : editing ? "public" : "";
      if (originalVisibility && originalVisibility !== visibility) {
        const document = { title, description, year: Number($("document-year").value),
          publishedAt: $("document-published-at").value, category, visibility };
        if (visibility === "public" && file) document.file = file.name;
        if (preparatory) {
          document.assemblyYear = Number(assemblyYear);
          document.assemblyType = assemblyType;
        }
        change = {
          source: originalVisibility,
          previous: editing || editingPrivate,
          document,
          content,
        };
      } else if (visibility === "private") {
        if (editing) throw new Error("La visibilità di un documento esistente non può essere cambiata.");
        if (!file && !editingPrivate) throw new Error("Seleziona un PDF da caricare");
        const privateDocument = {
          ...editingPrivate,
          title,
          description,
          year: Number($("document-year").value),
          publishedAt: $("document-published-at").value,
          category,
          visibility: "private",
        };
        change = {
          operation: "save",
          previous: editingPrivate || undefined,
          document: privateDocument,
          content,
        };
      } else {
        if (editingPrivate) throw new Error("La visibilità di un documento esistente non può essere cambiata.");
        if (!file && !editing) throw new Error("Seleziona un PDF da caricare");
        const metadata = {
          ...editing,
          file: editing?.file || file.name,
          title,
          description,
          year: Number($("document-year").value),
          publishedAt: $("document-published-at").value,
          category,
          visibility: "public",
        };
        delete metadata.assemblyYear;
        delete metadata.assemblyType;
        if (preparatory) {
          metadata.assemblyYear = Number(assemblyYear);
          metadata.assemblyType = assemblyType;
        }
        change = { operation: "save", previous: editing || undefined, document: metadata, content };
        D.apply(items, change);
      }
    } catch (error) {
      message("Non salvato: " + error.message, "error");
      lock(false);
      return;
    }
    if (change.source) await changeVisibility(change);
    else if (visibility === "public") await publish(change);
    else await publishPrivate(change);
  };
  $("cancel-document").onclick = () => {
    if (discardDraft("Scartare le modifiche?")) {
      reset();
      showPanel("documents-library-panel");
    }
  };
  $("new-document").onclick = () => startNew();
  $("new-private-document").onclick = startPrivateDocument;
  $("reload-documents").onclick = reload;
  $("private-documents-retry").onclick = reloadPrivate;
  addEventListener("beforeunload", (event) => {
    if (formDirty || busy) event.preventDefault();
  });
  reload();
})();
