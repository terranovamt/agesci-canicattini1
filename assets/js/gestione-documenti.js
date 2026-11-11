(function () {
  if (!window.ACCESSO.verificata()) {
    location.replace("./");
    return;
  }
  const $ = (id) => document.getElementById(id);
  const D = window.DOCUMENTS;
  const M = window.DOCUMENTS_MODEL;
  const preview = window.DOCUMENTS_PREVIEW === true;
  const nas = window.LIVE?.nas === true && !preview;
  const github = !preview && !nas;
  const branch = window.LIVE?.github?.ramo || "";
  const limitMiB = nas ? 20 : 100;
  const currentYear = new Date().getFullYear();
  const typeLabel = (type) => (M.assemblyTypes.find(([value]) => value === type) || [])[1] || "";
  let items = [],
    loadState = "loading",
    loadError = "",
    editing = null,
    pending = null,
    busy = false,
    formDirty = false;
  const credentials = () => (github ? $("document-token").value.trim() || localStorage.getItem(D.tokenKey) || "" : "");
  const pdfHref = (file) => "../documents/pdf/" + encodeURIComponent(file);
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

  $("documents-app").hidden = false;
  $("github-credentials").hidden = !github;
  $("nas-session").hidden = !nas;
  $("preparatory-year").textContent = currentYear;
  $("documents-source").textContent = preview
    ? "Sorgente: anteprima locale (simulazione)"
    : nas
      ? "Sorgente: NAS del gruppo"
      : "Sorgente: GitHub · " + (window.LIVE?.github?.repo || "") + (branch ? " @ " + branch : "");
  $("upload-hint").textContent =
    "PDF pubblico, inferiore a " + limitMiB + " MiB (limite " + (nas ? "NAS" : "GitHub") + ").";
  $("publish-timing").textContent = preview
    ? "Anteprima: le modifiche restano simulate, nessuna pubblicazione reale."
    : nas
      ? "Al salvataggio il NAS pubblica subito la modifica sul sito."
      : "Il salvataggio crea un commit su GitHub: il sito pubblico cambia solo quando termina il deploy di GitHub Pages.";
  if (github) $("document-token").value = localStorage.getItem(D.tokenKey) || "";

  function message(text, kind = "") {
    $("documents-message").textContent = text;
    $("documents-message").className = kind;
  }
  function tokenState() {
    if (!github) return;
    const stored = Boolean(localStorage.getItem(D.tokenKey));
    $("token-state").textContent = stored ? "· memorizzato in questo browser" : "· nessun token memorizzato";
    if (!stored && !$("document-token").value.trim()) $("github-credentials").open = true;
  }
  function syncDisabled() {
    $("documents-app")
      .querySelectorAll("input,textarea,select,button")
      .forEach((element) => {
        if (!element.closest("[data-section-nav]")) element.disabled = busy;
      });
    $("save-document").disabled = busy || loadState !== "ready";
    $("managed-documents").setAttribute("aria-busy", String(busy || loadState === "loading"));
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

  function setKind(kind) {
    const preparatory = kind === "preparatory";
    $("document-kind-general").checked = !preparatory;
    $("document-kind-preparatory").checked = preparatory;
    $("assembly-fields").hidden = !preparatory;
    $("document-assembly-year").required = preparatory;
    $("document-assembly-type").required = preparatory;
    const wasPreparatory = editing && (editing.assemblyYear !== undefined || editing.assemblyType !== undefined);
    let warning = "";
    if (!preparatory && wasPreparatory)
      warning = "Salvando come generale, il documento non comparirà più tra i preparatori assemblea.";
    else if (preparatory && editing && editing.assemblyYear === undefined && editing.assemblyType !== undefined)
      warning = "Questo documento ha un tipo preparatorio ma nessun anno: indica l’anno dell’assemblea.";
    $("kind-warning").textContent = warning;
    $("kind-warning").hidden = !warning;
  }
  function reset() {
    editing = null;
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
    setKind("general");
    $("edit-heading").textContent = "Nuovo documento";
    $("save-document").textContent = "Pubblica documento";
    $("cancel-document").hidden = true;
  }
  function startEdit(item) {
    if (busy || !discardDraft()) return;
    editing = { ...item };
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
    setKind(item.assemblyYear !== undefined || item.assemblyType !== undefined ? "preparatory" : "general");
    $("edit-heading").textContent = "Modifica documento";
    $("save-document").textContent = "Salva modifiche";
    $("cancel-document").hidden = false;
    formDirty = false;
    showPanel("documents-edit-panel");
    $("document-title").focus();
    $("document-form").scrollIntoView({ block: "start", behavior: "instant" });
  }
  function startNew(type) {
    if (busy || !discardDraft()) return;
    reset();
    if (type) {
      setKind("preparatory");
      $("document-assembly-year").value = currentYear;
      $("document-assembly-type").value = type;
      $("edit-heading").textContent = "Nuovo preparatorio: " + typeLabel(type) + " " + currentYear;
    }
    showPanel("documents-edit-panel");
    $("document-file").focus();
  }

  function renderSlots() {
    const list = $("preparatory-slots");
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
    actions.append(
      open,
      button("Modifica", "secondary", "Modifica " + item.title, () => startEdit(item)),
      button("Elimina", "danger", "Elimina " + item.title, () => remove(item)),
    );
    article.append(main, actions);
    return article;
  }
  function render() {
    const list = $("managed-documents");
    list.replaceChildren();
    $("documents-count").textContent = loadState === "ready" ? "(" + items.length + ")" : "";
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
    } else if (!items.length) {
      list.append(node("p", "state-empty", "Nessun PDF pubblicato. Usa “Nuovo documento” per caricare il primo."));
    } else items.forEach((item) => list.append(renderItem(item)));
    renderSlots();
    syncDisabled();
  }

  async function reload() {
    if (busy || !discardDraft("Scartare le modifiche al modulo e ricaricare?")) return;
    loadState = "loading";
    lock(true);
    render();
    message("Caricamento dei documenti…", "pending");
    try {
      items = sorted(await D.load(credentials()));
      loadState = "ready";
      reset();
      message(
        preview
          ? "Anteprima: modifiche simulate in memoria, nessuna pubblicazione reale."
          : nas
            ? "Documenti aggiornati dal NAS."
            : "Documenti aggiornati da GitHub" + (branch ? " (ramo " + branch + ")." : "."),
      );
    } catch (error) {
      loadState = "error";
      loadError = error.message;
      message(error.message, "error");
      if (github) $("github-credentials").open = true;
    } finally {
      busy = false;
      render();
      tokenState();
    }
  }
  async function publish(change) {
    const deleting = change.operation === "delete";
    pending = { operation: change.operation, file: (change.previous || change.document).file };
    lock(true);
    render();
    message(
      preview
        ? "Salvataggio simulato in corso: non ancora salvato."
        : nas
          ? "Invio al NAS in corso: non ancora pubblicato."
          : "Invio a GitHub in corso: non ancora salvato.",
      "pending",
    );
    try {
      D.apply(items, change);
      const next = await D.save(change, credentials());
      if (github) localStorage.setItem(D.tokenKey, credentials());
      items = sorted(next);
      pending = null;
      if (!deleting || editing?.file === change.previous.file) reset();
      message(
        preview
          ? (deleting ? "Eliminato" : "Salvato") + " nella simulazione locale. Ricarica la home per vedere il risultato."
          : nas
            ? deleting
              ? "Eliminato dal sito."
              : "Pubblicato sul sito."
            : (deleting ? "Eliminazione salvata" : "Salvato") +
              " su GitHub: commit creato" +
              (branch ? " sul ramo " + branch : "") +
              ". Non è ancora online: il sito si aggiorna al termine del deploy di GitHub Pages.",
        "success",
      );
    } catch (error) {
      pending = null;
      message((deleting ? "Non eliminato: " : "Non salvato: ") + error.message, "error");
      if (github && !localStorage.getItem(D.tokenKey)) $("github-credentials").open = true;
    } finally {
      busy = false;
      render();
      tokenState();
    }
  }
  async function remove(item) {
    if (busy || !confirm('Eliminare definitivamente "' + item.title + '"? Il PDF sparirà dall’archivio pubblico.'))
      return;
    if (editing?.file === item.file && !discardDraft("Il modulo aperto su questo documento verrà chiuso. Continuare?"))
      return;
    await publish({ operation: "delete", previous: item });
  }
  async function readPdf(file) {
    if (!D.safeName(file.name)) throw new Error("Seleziona un file con estensione .pdf e un nome valido");
    if (file.size >= limitMiB * 1024 * 1024)
      throw new Error(nas ? "Il PDF supera il limite NAS di 20 MiB" : "Il PDF supera il limite GitHub di 100 MiB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Il file selezionato non è un PDF valido");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  $("document-form").oninput = () => {
    formDirty = true;
  };
  $("document-form").onchange = (event) => {
    formDirty = true;
    if (event.target.name === "document-kind") setKind(event.target.value);
    if (event.target.id === "document-file" && !editing) {
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
    if (busy || loadState !== "ready") return;
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
      const preparatory = $("document-kind-preparatory").checked;
      const assemblyYear = $("document-assembly-year").value.trim();
      const assemblyType = $("document-assembly-type").value;
      if (preparatory && !assemblyYear && !assemblyType)
        throw new Error("Indica anno e tipo del preparatorio, oppure scegli “Generale”.");
      if (preparatory && !assemblyYear) throw new Error("Indica l’anno dell’assemblea per il tipo scelto.");
      if (preparatory && !assemblyType) throw new Error("Scegli il tipo di documento preparatorio.");
      if (!file && !editing) throw new Error("Seleziona un PDF da caricare");
      const content = file ? await readPdf(file) : undefined;
      const metadata = {
        ...editing,
        file: editing?.file || file.name,
        title,
        description,
        year: Number($("document-year").value),
        publishedAt: $("document-published-at").value,
      };
      delete metadata.assemblyYear;
      delete metadata.assemblyType;
      if (preparatory) {
        metadata.assemblyYear = Number(assemblyYear);
        metadata.assemblyType = assemblyType;
      }
      change = { operation: "save", previous: editing || undefined, document: metadata, content };
      D.apply(items, change);
    } catch (error) {
      message("Non salvato: " + error.message, "error");
      lock(false);
      return;
    }
    await publish(change);
  };
  $("cancel-document").onclick = () => {
    if (discardDraft("Scartare le modifiche?")) {
      reset();
      showPanel("documents-library-panel");
    }
  };
  $("new-document").onclick = () => startNew();
  $("reload-documents").onclick = reload;
  $("connect-github").onclick = reload;
  $("forget-token").onclick = () => {
    localStorage.removeItem(D.tokenKey);
    $("document-token").value = "";
    tokenState();
    message("Token GitHub dimenticato da questo browser.");
  };
  addEventListener("beforeunload", (event) => {
    if (formDirty || busy) event.preventDefault();
  });
  reload();
})();
