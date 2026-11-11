(function () {
  if (!window.ACCESSO.verificata()) {
    location.replace("./");
    return;
  }
  const $ = (id) => document.getElementById(id);
  if (!window.LIVE?.nas) {
    $("statistics-status").textContent = "Statistiche disponibili sul NAS";
    return;
  }
  if (!window.NAS?.user?.admin) {
    $("statistics-status").textContent = "Statistiche riservate all’amministratore.";
    return;
  }
  const labels = {
    home: "Home",
    assemblea: "Presentazione",
    "assemblea-documenti": "Documenti preparatori",
    documenti: "Archivio documenti",
    "gestione-documenti": "Gestione PDF",
    peg: "PEG",
    area: "Area riservata",
    regia: "Regia",
    setup: "Setup",
    guida: "Guida",
    statistiche: "Statistiche",
    server: "Server",
  };
  const kinds = {
    offline: "Browser offline",
    "network-error": "Richiesta non riuscita",
    "http-error": "Errore HTTP",
    "resource-error": "Risorsa non caricata",
    "js-error": "Errore JavaScript",
    "stream-reconnect": "Diretta in riconnessione",
    "server-error": "Errore server",
  };
  // Live values describe "now" and are cleared on failure; daily aggregates stay visible but marked stale.
  const liveCounters = [
    "stats-online",
    "stats-site-tabs",
    "stats-site-visible",
    "stats-presentation",
    "stats-streams",
    "stats-latency",
    "stats-api-errors",
    "stats-limited",
  ];
  const dayCounters = ["stats-visits", "stats-views", "stats-people", "stats-live-unique", "stats-errors"];
  const NBSP = "\u00a0";
  const MISSING = "n.d.";
  const FAILED = "—";
  const formats = {
    count: (value) => Math.round(value).toLocaleString("it-IT"),
    ms: (value) => Math.round(value).toLocaleString("it-IT") + NBSP + "ms",
    percent: (value) => value.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%",
  };
  const format = (value, kind = "count") => (Number.isFinite(value) ? formats[kind](value) : MISSING);
  const romeTime = { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Rome" };
  const time = (value) => new Date(value).toLocaleTimeString("it-IT", romeTime);
  const date = (value) =>
    new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
  const dateTime = (value) => date(value) + " " + time(value);
  const isoDay = (day, year = false) =>
    typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? day.slice(8, 10) + "/" + day.slice(5, 7) + (year ? "/" + day.slice(0, 4) : "")
      : "n.d.";
  const plural = (value, one, many) => format(value) + " " + (value === 1 ? one : many);
  function setValue(id, value, kind = "count") {
    const element = $(id);
    element.textContent = format(value, kind);
    element.dataset.state = Number.isFinite(value) ? "measured" : "missing";
    if (Number.isFinite(value)) element.removeAttribute?.("title");
    else element.setAttribute("title", "Dato non disponibile per questo periodo");
  }
  function setFailed(id) {
    const element = $(id);
    element.textContent = FAILED;
    element.dataset.state = "error";
    element.setAttribute("title", "Dato non aggiornato: lettura delle statistiche non riuscita");
  }
  function setStale(id) {
    const element = $(id);
    if (element.dataset.state !== "measured" && element.dataset.state !== "stale") return setFailed(id);
    element.dataset.state = "stale";
    element.setAttribute("title", "Ultimo valore ricevuto, non aggiornato");
  }
  const chartNamespace = "http://www.w3.org/2000/svg";
  const performanceSeries = [
    { key: "online", id: "online", name: "Persone collegate al sito", color: "online", kind: "count" },
    { key: "p95Ms", id: "latency", name: "Tempo di risposta API p95", color: "latency", kind: "ms" },
    { key: "cpuPercent", id: "cpu", name: "Utilizzo CPU del NAS", color: "cpu", kind: "percent" },
    { key: "memoryPercent", id: "ram", name: "Utilizzo RAM del NAS", color: "ram", kind: "percent" },
  ];
  const historySeries = [
    { key: "visits", name: "Visite sito", color: "visits", kind: "count", fill: true },
    { key: "views", name: "Pagine viste", color: "views", kind: "count", axis: "right" },
    { key: "people", name: "Persone uniche", color: "connections", kind: "count" },
  ];
  let historyDays = 30;
  let checkedRelease = "";
  let checkingRelease = false;
  let dailySignature = null;
  let dailyHistory = [];
  let performanceSignature = null;
  let performanceHistory = [];
  let lastSuccess = null;
  let failed = false;
  const unavailable = () => (failed ? "Dati non disponibili" : "In attesa dei dati");
  const chart = $("stats-history-chart");
  const chartElement = (name, attributes = {}) => {
    const element = document.createElementNS(chartNamespace, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  // Integer-only steps for counts and ms keep tick labels unique; percentages use divisors of 100.
  function axis(maximum, kind, maxTicks) {
    const target = Math.max(kind === "percent" ? 10 : 1, maximum);
    const steps =
      kind === "percent"
        ? [1, 2, 5, 10, 20, 25, 50, 100]
        : Array.from({ length: 30 }, (_, index) => [1, 2, 5][index % 3] * 10 ** Math.floor(index / 3));
    const step = steps.find((value) => Math.ceil(target / value - 1e-9) <= maxTicks) || steps.at(-1);
    const top = Math.min(kind === "percent" ? 100 : Infinity, Math.ceil(target / step - 1e-9) * step);
    const ticks = [];
    for (let value = top; value >= 0; value -= step) ticks.push(Math.round(value * 10) / 10);
    return { top, ticks };
  }
  function chartWidth(target, fallback) {
    const measured = Math.round(target.getBoundingClientRect?.().width || target.clientWidth || 0);
    return measured >= 200 ? measured : fallback;
  }
  function drawChart(target, rows, seriesList, options) {
    const width = chartWidth(target, options.width);
    const height = options.height(width);
    target.setAttribute("viewBox", "0 0 " + width + " " + height);
    target.replaceChildren();
    for (const key of ["latest", "peak", "points", "lastX", "lastY"]) delete target.dataset[key];
    const title = chartElement("title");
    title.textContent = options.title;
    target.append(title);
    const description = chartElement("desc");
    description.textContent = options.description + (options.axes
      ? " Asse sinistro: visite e persone uniche. Asse destro: pagine viste. Scale indipendenti, entrambe da zero; le altezze delle serie su assi diversi non sono confrontabili direttamente."
      : "");
    target.append(description);
    const values = seriesList.flatMap((series) => rows.map((row) => row?.[series.key]).filter(Number.isFinite));
    if (!values.length) {
      const empty = chartElement("text", {
        x: width / 2,
        y: height / 2,
        "text-anchor": "middle",
        class: "statistics-chart-empty",
      });
      empty.textContent = options.empty;
      target.append(empty);
      return null;
    }
    const kind = seriesList[0].kind;
    const valuesFor = (side) => seriesList
      .filter((series) => (series.axis || "left") === side)
      .flatMap((series) => rows.map((row) => row?.[series.key]).filter(Number.isFinite));
    const scale = axis(Math.max(0, ...valuesFor("left")), kind, options.ticks);
    const rightScale = options.axes ? axis(Math.max(0, ...valuesFor("right")), kind, options.ticks) : null;
    const tickLabels = scale.ticks.map((value) => format(value, kind));
    const rightLabels = rightScale?.ticks.map((value) => format(value, kind));
    const xStart = 14 + Math.max(...tickLabels.map((label) => label.length)) * 7;
    const xEnd = width - 14 - (rightLabels ? Math.max(...rightLabels.map((label) => label.length)) * 7 : 0);
    const yStart = options.axes ? 40 : 14;
    const yEnd = height - 32;
    const x = (index) => (rows.length > 1 ? xStart + ((xEnd - xStart) * index) / (rows.length - 1) : (xStart + xEnd) / 2);
    const y = (value, selectedScale = scale) => yEnd - ((yEnd - yStart) * value) / selectedScale.top;
    scale.ticks.forEach((value, index) => {
      const position = y(value);
      target.append(chartElement("line", { x1: xStart, y1: position, x2: xEnd, y2: position, class: "chart-grid" }));
      const label = chartElement("text", { x: xStart - 7, y: position + 4, "text-anchor": "end", class: "chart-axis-label", "data-axis": "left" });
      label.textContent = tickLabels[index];
      target.append(label);
    });
    if (rightScale) {
      rightScale.ticks.forEach((value, index) => {
        const label = chartElement("text", {
          x: xEnd + 7, y: y(value, rightScale) + 4, "text-anchor": "start",
          class: "chart-axis-label", "data-axis": "right",
        });
        label.textContent = rightLabels[index];
        target.append(label);
      });
      for (const [side, text] of Object.entries(options.axes)) {
        const label = chartElement("text", {
          x: side === "left" ? 7 : width - 7, y: 16,
          "text-anchor": side === "left" ? "start" : "end", class: "chart-axis-title",
        });
        label.textContent = text;
        target.append(label);
      }
    }
    const positions = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
    let previous = "";
    for (const position of positions) {
      const text = options.xLabel(rows[position]);
      if (!text || text === previous) continue;
      previous = text;
      const label = chartElement("text", {
        x: x(position),
        y: height - 10,
        "text-anchor": position === 0 ? "start" : position === rows.length - 1 ? "end" : "middle",
        class: "chart-axis-label",
      });
      label.textContent = text;
      target.append(label);
    }
    const summaries = [];
    for (const series of seriesList) {
      const seriesY = (value) => y(value, series.axis === "right" && rightScale ? rightScale : scale);
      const segments = [];
      let segment = [];
      rows.forEach((row, index) => {
        const value = row?.[series.key];
        if (Number.isFinite(value)) segment.push({ index, value, row });
        else if (segment.length) segments.push(segment), (segment = []);
      });
      if (segment.length) segments.push(segment);
      for (const points of segments) {
        const path = points
          .map((point, index) => (index ? "L" : "M") + x(point.index).toFixed(1) + "," + seriesY(point.value).toFixed(1))
          .join(" ");
        if (series.fill && points.length > 1) {
          const area =
            path + " L" + x(points.at(-1).index).toFixed(1) + "," + yEnd + " L" + x(points[0].index).toFixed(1) + "," + yEnd + " Z";
          target.append(chartElement("path", { d: area, class: "chart-area chart-" + series.color + "-area" }));
        }
        target.append(chartElement("path", { d: path, class: "chart-series chart-" + series.color }));
        if (rows.length > options.maxPoints) continue;
        for (const point of points) {
          const text = options.pointLabel(point.row) + ": " + series.name + " " + format(point.value, series.kind);
          const circle = chartElement("circle", {
            cx: x(point.index),
            cy: seriesY(point.value),
            r: rows.length < 32 ? 3.5 : 2,
            class: "chart-point chart-" + series.color,
            tabindex: 0,
            "aria-label": text,
          });
          const tooltip = chartElement("title");
          tooltip.textContent = text;
          circle.append(tooltip);
          target.append(circle);
        }
      }
      const available = segments.flat();
      if (!available.length) continue;
      const last = available.at(-1);
      const peak = Math.max(...available.map((point) => point.value));
      summaries.push({ series, last, peak, count: available.length, lastX: x(last.index), lastY: seriesY(last.value) });
    }
    description.textContent +=
      " " +
      summaries
        .map(
          (summary) =>
            summary.series.name +
            ": " +
            summary.count +
            " valori su " +
            rows.length +
            ", ultimo " +
            format(summary.last.value, summary.series.kind) +
            " (" +
            options.pointLabel(summary.last.row) +
            "), massimo " +
            format(summary.peak, summary.series.kind) +
            ".",
        )
        .join(" ");
    const single = summaries.length === 1 ? summaries[0] : null;
    if (single) {
      target.dataset.latest = String(single.last.value);
      target.dataset.peak = String(single.peak);
      target.dataset.points = String(single.count);
      target.dataset.lastX = String(single.lastX);
      target.dataset.lastY = String(single.lastY);
    }
    return single;
  }
  function renderHistory(data) {
    const selected = data.slice(0, historyDays).reverse();
    $("stats-history-description").textContent =
      "Persone uniche, visite e pagine viste sull’intero sito · " +
      (historyDays === 365 ? "ultimi 12 mesi" : "ultimi " + historyDays + " giorni") +
      ", un valore al giorno (ora italiana). Asse sinistro: visite e persone uniche; asse destro: pagine viste (scala separata).";
    drawChart(chart, selected, historySeries, {
      width: 720,
      height: (width) => (width < 520 ? 230 : 280),
      ticks: 4,
      axes: { left: "Visite / persone uniche", right: "Pagine viste" },
      maxPoints: 31,
      title: "Andamento giornaliero: visite, pagine viste e persone uniche sull’intero sito",
      empty: lastSuccess !== null ? "Nessun dato giornaliero" : unavailable(),
      xLabel: (day) => isoDay(day?.day),
      pointLabel: (day) => isoDay(day?.day, true),
      description: "Intervallo di " + historyDays + " giorni; i giorni non raccolti restano vuoti e non valgono zero.",
    });
    $("stats-history-note").textContent = selected.some((day) => day.people === null)
      ? "Il conteggio delle persone uniche parte dall’attivazione; i giorni precedenti sono indicati come non raccolti."
      : "Ogni browser conta una volta al giorno: più schede o pagine dello stesso browser non aumentano le persone uniche.";
    const body = $("stats-days");
    body.replaceChildren();
    for (const day of selected.slice().reverse()) {
      const row = document.createElement("tr");
      for (const value of [
        isoDay(day.day, true),
        Number.isFinite(day.people) ? format(day.people) : "Non raccolto",
        Number.isFinite(day.visits) ? format(day.visits) : "Non raccolto",
        Number.isFinite(day.views) ? format(day.views) : "Non raccolto",
        Number.isFinite(day.liveUnique) ? format(day.liveUnique) : "Non raccolto",
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
  }
  function renderActions(actions) {
    const body = $("stats-actions");
    body.replaceChildren();
    if (!actions.length) {
      $("stats-actions-note").textContent = "Nessuna azione registrata finora: i conteggi compaiono man mano che si usa l’area riservata.";
      return;
    }
    $("stats-actions-note").textContent = "Solo conteggi anonimi per giorno, senza nomi, dati dei soci o contenuti. Tra parentesi gli ultimi 7 giorni.";
    for (const action of actions.slice(0, 12)) {
      const item = document.createElement("div");
      item.className = "statistics-page-bar";
      const heading = document.createElement("div");
      heading.className = "statistics-page-bar-heading";
      const name = document.createElement("span");
      name.textContent = action.action.replace(".", " · ").replace(/-/g, " ");
      const value = document.createElement("strong");
      value.textContent = format(action.month) + " (" + format(action.week) + ")";
      heading.append(name, value);
      const track = document.createElement("div");
      track.className = "statistics-page-bar-track";
      const bar = document.createElement("span");
      bar.style.width = Math.max(2, Math.min(100, (action.month / Math.max(1, actions[0].month)) * 100)) + "%";
      track.append(bar);
      item.append(heading, track);
      body.append(item);
    }
  }
  function renderDistribution(pages, pageViews) {
    const body = $("stats-pages");
    body.replaceChildren();
    const total = pages.reduce((sum, page) => sum + (Number.isFinite(page.views) ? page.views : 0), 0);
    const lead = pages.slice(0, 2).reduce((sum, page) => sum + page.views, 0);
    $("stats-distribution-title").textContent = total
      ? labels[pages[0]?.page] && pages[1]
        ? labels[pages[0].page] + " e " + labels[pages[1].page] + " raccolgono il " + Math.round((lead / total) * 100) + "% delle pagine viste."
        : "Le pagine più viste oggi."
      : Number.isFinite(pageViews)
        ? "Nessuna pagina vista oggi."
        : "Distribuzione non disponibile.";
    $("stats-distribution-total").textContent = Number.isFinite(pageViews)
      ? plural(pageViews, "pagina vista", "pagine viste") + " oggi · le visite contano browser, non pagine."
      : "Totale pagine viste non disponibile.";
    for (const page of pages.slice(0, 5)) {
      const item = document.createElement("div");
      item.className = "statistics-page-bar";
      const heading = document.createElement("div");
      heading.className = "statistics-page-bar-heading";
      const name = document.createElement("span");
      name.textContent = labels[page.page] || page.page;
      const value = document.createElement("strong");
      value.textContent = format(page.views);
      heading.append(name, value);
      const track = document.createElement("div");
      track.className = "statistics-page-bar-track";
      const bar = document.createElement("span");
      bar.style.width = Math.max(0, Math.min(100, (page.views / Math.max(1, pages[0].views)) * 100)) + "%";
      track.append(bar);
      item.append(heading, track);
      body.append(item);
    }
  }
  function renderPerformance(history) {
    const data = Array.isArray(history) ? history : [];
    performanceHistory = data;
    const signature = data
      .map((sample) => (sample ? [sample.sampledAt, ...performanceSeries.map((series) => sample[series.key])].join(":") : ""))
      .join("|");
    if (signature === performanceSignature) return;
    performanceSignature = signature;
    const windowSize = data.length || 60;
    const counts = [];
    for (const series of performanceSeries) {
      const summary = drawChart($("stats-hour-" + series.id), data, [series], {
        width: 340,
        height: () => 180,
        ticks: 3,
        maxPoints: 60,
        title: series.name + " nell’ultima ora",
        empty: data.length ? "Nessun campione in questa finestra" : unavailable(),
        xLabel: (sample) => (Number.isFinite(sample?.sampledAt) ? time(sample.sampledAt) : ""),
        pointLabel: (sample) => (Number.isFinite(sample?.sampledAt) ? dateTime(sample.sampledAt) : "orario non disponibile"),
        description: "Un campione al minuto; i minuti senza campione restano vuoti e non valgono zero.",
      });
      const current = $("stats-hour-" + series.id + "-current");
      const sample = $("stats-hour-" + series.id + "-sample");
      counts.push(summary ? summary.count : 0);
      if (summary) {
        current.textContent = format(summary.last.value, series.kind);
        current.dataset.state = "measured";
        $("stats-hour-" + series.id + "-peak").textContent = "Picco 60 min: " + format(summary.peak, series.kind);
        sample.textContent =
          "Ultimo campione " +
          (Number.isFinite(summary.last.row.sampledAt) ? time(summary.last.row.sampledAt) : "n.d.") +
          " · " +
          summary.count +
          "/" +
          windowSize +
          " minuti con dati";
      } else {
        current.textContent = data.length ? MISSING : failed ? FAILED : "-";
        current.dataset.state = data.length ? "missing" : failed ? "error" : "pending";
        $("stats-hour-" + series.id + "-peak").textContent = data.length || failed ? "Nessun campione" : "-";
        sample.textContent = data.length
          ? "0/" + windowSize + " minuti con dati: misura non rilevata in questa finestra"
          : unavailable();
      }
    }
    $("stats-hour-note").textContent = data.length
      ? "Campioni per serie su " +
        windowSize +
        " minuti: " +
        performanceSeries.map((series, index) => series.name.replace(/ del NAS| al sito/, "") + " " + counts[index]).join(", ") +
        ". I minuti senza campione restano vuoti; uno zero nel grafico è un valore misurato."
      : failed
        ? "Campioni dell’ultima ora non disponibili."
        : "";
  }
  function rows(id, values, empty = "Nessun dato registrato") {
    const body = $(id);
    body.replaceChildren();
    for (const cells of values.length ? values : [[empty]]) {
      const row = document.createElement("tr");
      for (const value of cells) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      body.append(row);
    }
  }
  function renderEvents(values) {
    const list = $("stats-events");
    list.replaceChildren();
    for (const event of values) {
      const item = document.createElement("li");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const badge = document.createElement("span");
      badge.className = "metrics-event-badge" + (event.status >= 500 ? " is-error" : "");
      badge.textContent = event.status >= 500 ? "Server" : event.status ? "HTTP " + event.status : "Avviso";
      const label = document.createElement("span");
      label.className = "metrics-event-title";
      label.textContent = kinds[event.kind] || event.kind;
      const timestamp = document.createElement("time");
      timestamp.dateTime = new Date(event.time).toISOString();
      timestamp.textContent = dateTime(event.time);
      summary.append(badge, label, timestamp);
      const description = document.createElement("p");
      description.className = "metrics-event-detail";
      description.textContent =
        "Pagina: " +
        (labels[event.page] || event.page) +
        (event.status ? " · risposta HTTP " + event.status : "") +
        ". Per tutela della privacy non vengono registrati URL completi, messaggi browser o contenuti personali.";
      details.append(summary, description);
      item.append(details);
      list.append(item);
    }
  }
  function setReleaseCheck(enabled, reason) {
    const button = $("stats-release-check");
    const note = $("stats-release-check-reason");
    button.disabled = !enabled;
    note.hidden = enabled;
    note.textContent = enabled ? "" : reason;
  }
  async function checkRelease(revision) {
    if (checkingRelease) return;
    checkingRelease = true;
    const status = $("stats-release-status");
    const latestVersion = $("stats-release-latest");
    const latestLink = $("stats-release-latest-commit");
    $("stats-release-check").disabled = true;
    latestVersion.hidden = true;
    status.textContent = "Confronto con l’ultimo commit del branch NAS…";
    try {
      const response = await fetch("https://api.github.com/repos/terranovamt/agesci-canicattini1/commits/NAS", {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error("GitHub ha risposto con HTTP " + response.status);
      const latest = await response.json();
      if (typeof latest.sha !== "string" || !/^[a-f0-9]{40}$/i.test(latest.sha))
        throw new Error("Versione del branch NAS non valida");
      latestLink.textContent = latest.sha.slice(0, 12);
      latestLink.href = "https://github.com/terranovamt/agesci-canicattini1/commit/" + latest.sha;
      latestLink.title = latest.sha;
      latestVersion.hidden = false;
      status.textContent =
        revision.toLowerCase() === latest.sha.toLowerCase()
          ? "Il NAS è all’ultimo commit del branch NAS."
          : "È disponibile un aggiornamento rispetto al branch NAS.";
      status.textContent += " Verificato alle " + time(Date.now()) + ".";
    } catch (error) {
      status.textContent = "Confronto con GitHub non riuscito: " + error.message + ". La versione del NAS resta quella indicata sopra.";
      latestVersion.hidden = true;
    } finally {
      checkingRelease = false;
      $("stats-release-check").disabled = !checkedRelease;
    }
  }
  function renderRelease(release) {
    const releaseLink = $("stats-release-commit");
    const revision = $("stats-release-revision");
    if (typeof release === "string" && /^[a-f0-9]{40}$/i.test(release)) {
      releaseLink.hidden = false;
      revision.hidden = true;
      releaseLink.textContent = release.slice(0, 12);
      releaseLink.title = release;
      releaseLink.href = "https://github.com/terranovamt/agesci-canicattini1/commit/" + release;
      releaseLink.target = "_blank";
      releaseLink.rel = "noopener";
      $("stats-release-branch").textContent = "Branch NAS · revisione completa " + release;
      setReleaseCheck(!checkingRelease, "");
      if (checkedRelease !== release) {
        checkedRelease = release;
        checkRelease(release);
      }
      return;
    }
    checkedRelease = "";
    releaseLink.hidden = true;
    revision.hidden = false;
    $("stats-release-branch").textContent = "Branch NAS";
    $("stats-release-latest").hidden = true;
    if (typeof release === "string" && release) {
      revision.textContent = "«" + release + "» · versione locale";
      $("stats-release-status").textContent =
        "Versione locale non confrontabile con il branch NAS: la revisione non è un commit Git completo.";
    } else {
      revision.textContent = "non comunicato dal server";
      $("stats-release-status").textContent = "Il server non ha indicato la versione deployata.";
    }
    setReleaseCheck(false, "Verifica disattivata: serve l’hash completo (40 caratteri) del commit deployato.");
  }
  $("stats-release-check").addEventListener("click", () => {
    if (checkedRelease) checkRelease(checkedRelease);
  });
  document.querySelectorAll("[data-history-days]").forEach((button) => {
    button.addEventListener("click", () => {
      historyDays = Number(button.getAttribute("data-history-days"));
      document.querySelectorAll("[data-history-days]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderHistory(dailyHistory);
    });
  });
  $("statistics-data").hidden = false;
  let layoutKey = "";
  const relayout = () => {
    const key = [chart, ...performanceSeries.map((series) => $("stats-hour-" + series.id))]
      .map((target) => chartWidth(target, 0))
      .join(",");
    if (key === layoutKey) return;
    layoutKey = key;
    renderHistory(dailyHistory);
    performanceSignature = null;
    renderPerformance(performanceHistory);
  };
  if (typeof ResizeObserver === "function") new ResizeObserver(relayout).observe($("statistics-data"));
  else window.addEventListener?.("resize", relayout);
  window.NAS_METRICS.watch({
    render(data) {
      const traffic = data.traffic || {};
      const today = traffic.today || {};
      const api = data.api || {};
      const sampledAt = Number.isFinite(data.sampledAt) ? data.sampledAt : Date.now();
      lastSuccess = sampledAt;
      failed = false;
      $("statistics-data").dataset.state = "fresh";
      $("statistics-status").textContent =
        (data.enabled
          ? "Dati attuali delle " + time(sampledAt) + " (ora italiana) · aggiornamento automatico ogni 5 secondi."
          : "Raccolta dal browser disattivata: presenze e schede non vengono rilevate · dati server delle " +
            time(sampledAt) +
            " (ora italiana).");
      $("statistics-status").className = "metrics-status";
      renderRelease(data.service?.release);
      for (const [id, value] of Object.entries({
        "stats-visits": today.visits,
        "stats-views": today.views,
        "stats-people": today.people,
        "stats-live-unique": today.liveUnique,
        "stats-online": data.enabled ? traffic.people : null,
        "stats-errors": today.errors,
        "stats-site-tabs": data.enabled ? traffic.online : null,
        "stats-site-visible": data.enabled ? traffic.visible : null,
        "stats-presentation": traffic.presentationDevices,
        "stats-api-errors": api.errors5xx,
        "stats-limited": api.limited,
      }))
        setValue(id, value);
      setValue("stats-latency", api.p95Ms, "ms");
      setValue("stats-streams", traffic.liveStreams);
      if (Number.isFinite(traffic.liveStreams) && Number.isFinite(traffic.liveLimit))
        $("stats-streams").textContent = format(traffic.liveStreams) + NBSP + "/" + NBSP + format(traffic.liveLimit);
      if (!Number.isFinite(api.p95Ms) && Number.isFinite(api.sampleCount) && api.sampleCount === 0)
        $("stats-latency").setAttribute("title", "Nessuna richiesta API negli ultimi 5 minuti");
      const totals = traffic.totals || {};
      $("stats-totals").textContent =
        "Dal " +
        isoDay(totals.started, true) +
        " · " +
        plural(totals.visits, "visita", "visite") +
        " al sito · " +
        plural(totals.views, "pagina vista", "pagine viste") +
        ".";
      const nextDaily = Array.isArray(traffic.daily) ? traffic.daily : [];
      const nextSignature = nextDaily.map((day) => [day.day, day.visits, day.views, day.people, day.liveUnique].join(":")).join("|");
      dailyHistory = nextDaily;
      if (nextSignature !== dailySignature) {
        dailySignature = nextSignature;
        renderHistory(nextDaily);
      }
      renderDistribution(Array.isArray(traffic.pages) ? traffic.pages : [], today.views);
      renderActions(Array.isArray(data.actions) ? data.actions : []);
      renderPerformance(data.performance?.hourly);
      const sessions = (Array.isArray(traffic.sessions) ? traffic.sessions : []).map((session) => [
        labels[session.page] || session.page,
        session.visible ? "In primo piano" : "In background",
        Number.isFinite(session.latencyMs) ? formats.ms(session.latencyMs) : MISSING,
        time(session.lastSeen),
      ]);
      rows("stats-sessions", sessions, "Nessuna scheda aperta adesso");
      const eventsList = Array.isArray(data.events) ? data.events : [];
      const events = $("stats-events");
      if (!events.dataset.signature || events.dataset.signature !== JSON.stringify(eventsList)) {
        events.dataset.signature = JSON.stringify(eventsList);
        renderEvents(eventsList);
      }
      $("stats-no-events").hidden = false;
      $("stats-no-events").textContent = eventsList.length
        ? plural(eventsList.length, "segnalazione recente", "segnalazioni recenti") + " (più recenti in alto) · apri ogni riga per i dettagli."
        : "Nessuna segnalazione recente.";
    },
    error(message) {
      const failure = message + ". Il problema riguarda la lettura delle statistiche e non indica di per sé un guasto del NAS.";
      failed = true;
      $("statistics-status").className = "metrics-status err";
      for (const id of liveCounters) setFailed(id);
      rows("stats-sessions", [], "Dati non disponibili");
      if (lastSuccess !== null) {
        $("statistics-data").dataset.state = "stale";
        $("statistics-status").textContent =
          failure + " Grafici e totali del giorno restano quelli delle " + time(lastSuccess) + ", non aggiornati.";
        for (const id of dayCounters) setStale(id);
        return;
      }
      $("statistics-data").dataset.state = "error";
      $("statistics-status").textContent = failure + " Nessun dato ricevuto finora.";
      for (const id of dayCounters) setFailed(id);
      $("stats-totals").textContent = "Totali non disponibili.";
      dailySignature = null;
      dailyHistory = [];
      renderHistory([]);
      renderDistribution([], null);
      renderActions([]);
      renderPerformance([]);
      renderEvents([]);
      $("stats-no-events").hidden = false;
      $("stats-no-events").textContent = "Segnalazioni non disponibili.";
    },
  });
})();
