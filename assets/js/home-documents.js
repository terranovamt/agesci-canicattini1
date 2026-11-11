(function () {
  const list = document.getElementById("documents-list");
  const status = document.getElementById("documents-status");
  const retry = document.getElementById("documents-retry");
  const siteRoot = list.dataset.siteRoot || "";
  const yearFilter = document.getElementById("documents-year");
  const search = document.getElementById("documents-search");
  const more = document.getElementById("documents-more");
  let visibleCount = 48;
  const currentYear = Number(
    new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric" }).format(new Date()),
  );
  const panels = [{ list, status, retry, onlyPreparatory: list.dataset.preparatory === "current" }];
  const preparatoryList = document.getElementById("preparatory-list");
  if (preparatoryList)
    panels.push({
      list: preparatoryList,
      status: document.getElementById("preparatory-status"),
      retry: document.getElementById("preparatory-retry"),
      onlyPreparatory: true,
    });
  let files = [];
  const order = (file) => {
    const index = preparatory.findIndex((item) => item.type === window.DOCUMENTS_MODEL.assemblyType(file));
    return index === -1 ? preparatory.length : index;
  };
  const preparatory = [
    {
      type: "convocazione",
      label: "L’invito a partecipare",
      theme: "invitation",
      icon: ["M4 6h16v13H4z", "m4 7 8 6 8-6"],
    },
    {
      type: "regolamento",
      label: "Le regole condivise",
      theme: "rules",
      icon: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 12h7", "M9 16h7"],
    },
    {
      type: "peg",
      label: "Il nostro percorso",
      theme: "project",
      icon: ["M4 5h6a3 3 0 0 1 3 3v12a4 4 0 0 0-3-1H4z", "M13 8a3 3 0 0 1 3-3h4v14h-4a4 4 0 0 0-3 1"],
    },
    {
      type: "bilancio",
      label: "Trasparenza",
      theme: "finance",
      icon: ["M4 20h16", "M6 16v-4", "M12 16V4", "M18 16V8"],
    },
    {
      type: "verbale",
      label: "Le decisioni dell’assemblea",
      theme: "rules",
      icon: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 12h7", "M9 16h7"],
    },
  ];

  function icon(paths) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    paths.forEach((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  }

  async function load() {
    panels.forEach((panel) => {
      panel.retry.hidden = true;
      panel.status.textContent = "Caricamento dei documenti…";
      panel.list.replaceChildren();
      panel.lastRender = null;
      panel.list.setAttribute("aria-busy", "true");
      for (let index = 0; index < 3; index++) {
        const placeholder = document.createElement("article");
        placeholder.className = "loading-skeleton";
        placeholder.setAttribute("aria-hidden", "true");
        panel.list.append(placeholder);
      }
    });
    files = [];
    if (yearFilter) {
      yearFilter.disabled = true;
      search.disabled = true;
    }
    try {
      const response = await fetch(list.dataset.documentsUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Impossibile leggere i documenti (HTTP " + response.status + ")");
      const entries = await response.json();
      files = window.DOCUMENTS_MODEL.validate(entries).slice();
      if (list.dataset.order === "latest") {
        files.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
      } else {
        files.sort(
          (a, b) =>
            order(a) - order(b) || (a.title || a.file).localeCompare(b.title || b.file, "it", { numeric: true }),
        );
      }
      if (yearFilter) {
        const selected = yearFilter.value;
        yearFilter.replaceChildren(new Option("Tutti gli anni", ""));
        const years = [...new Set(files.filter((file) => Number.isInteger(file.year)).map((file) => file.year))];
        years.sort((a, b) => b - a).forEach((year) => yearFilter.add(new Option(String(year), String(year))));
        if (files.some((file) => !file.year)) yearFilter.add(new Option("Senza anno", "undated"));
        if ([...yearFilter.options].some((option) => option.value === selected)) yearFilter.value = selected;
        yearFilter.disabled = false;
        search.disabled = false;
      }
      render();
    } catch (error) {
      panels.forEach((panel) => {
        panel.list.replaceChildren();
        panel.status.textContent = error.message + ". Riprova tra poco.";
        panel.retry.hidden = false;
      });
      console.error("Caricamento PDF non riuscito", error);
    } finally {
      panels.forEach((panel) => panel.list.setAttribute("aria-busy", "false"));
    }
  }
  function render() {
    panels.forEach((panel) => {
      const { list, status } = panel;
      const query = (search?.value || "").trim().toLocaleLowerCase("it");
      const year = yearFilter?.value || "";
      const renderKey = query + "/" + year + "/" + visibleCount;
      if (panel.lastRender === renderKey) return;
      panel.lastRender = renderKey;
      list.replaceChildren();
      const available = panel.onlyPreparatory ? window.DOCUMENTS_MODEL.preparatory(files, currentYear) : files;
      let shown = panel.onlyPreparatory ? window.DOCUMENTS_MODEL.preparatorySlots(files, currentYear) : available.filter(
        (file) =>
          (!year || (year === "undated" ? !file.year : String(file.year) === year)) &&
          (!query || [file.title, file.description, file.file].join(" ").toLocaleLowerCase("it").includes(query)),
      );
      const total = shown.length;
      if (list.dataset.limit && !panel.onlyPreparatory) shown = shown.slice(0, Number(list.dataset.limit));
      else if (more && panel === panels[0]) shown = shown.slice(0, visibleCount);
      if (more && panel === panels[0]) more.hidden = shown.length >= total;
      status.textContent = panel.onlyPreparatory
        ? shown.filter(slot => slot.document).length + " di 5 documenti preparatori pubblicati per l’assemblea " + currentYear + "." +
          (available.length > shown.filter(slot => slot.document).length ? " Altri file o versioni sono disponibili nell’archivio." : "")
        : !files.length
          ? "Non ci sono ancora documenti PDF pubblicati."
          : !total
            ? "Nessun documento corrisponde alla ricerca."
            : shown.length < total
              ? shown.length + " documenti su " + total + " disponibili nell’archivio."
              : shown.length + " documenti PDF disponibili.";
      shown.forEach((entry) => {
        const file = panel.onlyPreparatory ? entry.document : entry;
        const detail = preparatory.find((item) => item.type === (panel.onlyPreparatory ? entry.type : window.DOCUMENTS_MODEL.assemblyType(file)));
        const card = document.createElement("article");
        card.className = "document-card document-" + (detail?.theme || "rules");
        const top = document.createElement("div");
        top.className = "document-card-top";
        const emblem = document.createElement("span");
        emblem.className = "document-icon";
        emblem.append(icon(detail?.icon || preparatory[3].icon));
        const type = document.createElement("span");
        type.className = "document-number";
        type.textContent = detail ? String(preparatory.indexOf(detail) + 1).padStart(2, "0") : "PDF";
        top.append(emblem, type);
        const label = document.createElement("span");
        label.className = "document-label";
        label.textContent = (detail?.label || "Documenti del gruppo") + (file?.year ? " · " + file.year : "");
        if (list.dataset.order === "latest" && /^\d{4}-\d{2}-\d{2}/.test(file?.publishedAt || ""))
          label.textContent += " · pubblicato il " + file.publishedAt.slice(0, 10).split("-").reverse().join("/");
        const heading = document.createElement("h3");
        heading.textContent = file ? file.title || file.file.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ") : entry.label;
        const description = document.createElement("p");
        description.textContent = file?.description || "Documento non ancora pubblicato.";
        const actions = document.createElement("div");
        actions.className = "document-actions";
        if (!file) {
          card.append(top, label, heading, description, actions);
          panel.list.append(card);
          return;
        }
        const url = siteRoot + "documents/pdf/" + encodeURIComponent(file.file);
        const open = document.createElement("a");
        const pegLink = file.file === "PEG26-28.pdf" ? "peg/" : "";
        open.href = pegLink ? siteRoot + pegLink : url;
        if (!pegLink) {
          open.target = "_blank";
          open.rel = "noopener";
        }
        open.className = "document-primary";
        open.textContent = pegLink ? "Leggi il PEG →" : "Consulta PDF ↗";
        open.setAttribute(
          "aria-label",
          pegLink ? "Leggi " + heading.textContent : "Apri " + heading.textContent + " in una nuova scheda",
        );
        const download = document.createElement("a");
        download.href = url;
        download.download = file.file;
        download.textContent = "Scarica PDF";
        download.setAttribute("aria-label", "Scarica " + heading.textContent);
        actions.append(open, download);
        card.append(top, label, heading, description, actions);
        panel.list.append(card);
      });
    });
  }
  const filter = () => {
    visibleCount = 48;
    render();
  };
  if (yearFilter) yearFilter.onchange = filter;
  if (search) search.oninput = filter;
  if (more)
    more.onclick = () => {
      visibleCount += 48;
      render();
    };
  panels.forEach((panel) => {
    panel.retry.onclick = load;
  });
  load();
})();
