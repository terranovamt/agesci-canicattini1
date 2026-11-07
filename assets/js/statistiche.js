(function () {
  if (!window.ACCESSO.verificata()) {
    location.replace("index.html");
    return;
  }
  const $ = (id) => document.getElementById(id);
  if (!window.LIVE?.nas) {
    $("statistics-status").textContent = "Statistiche disponibili sul NAS";
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
  const counters = [
    "stats-visits",
    "stats-views",
    "stats-people",
    "stats-live-unique",
    "stats-online",
    "stats-errors",
    "stats-site-tabs",
    "stats-site-visible",
    "stats-presentation",
    "stats-streams",
    "stats-latency",
    "stats-api-errors",
    "stats-limited",
  ];
  const count = (value) => (Number.isFinite(value) ? value.toLocaleString("it-IT") : "-");
  const time = (value) => new Date(value).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" });
  const date = (value) =>
    new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
  const chartNamespace = "http://www.w3.org/2000/svg";
  const performanceSeries = [
    { key: "online", id: "online", name: "Persone collegate al sito", color: "online", unit: "", peakUnit: "" },
    { key: "p95Ms", id: "latency", name: "Tempo di risposta API p95", color: "latency", unit: " ms", peakUnit: " ms" },
    { key: "cpuPercent", id: "cpu", name: "Utilizzo CPU del NAS", color: "cpu", unit: "%", peakUnit: "%" },
    { key: "memoryPercent", id: "ram", name: "Utilizzo RAM del NAS", color: "ram", unit: "%", peakUnit: "%" },
  ];
  let historyDays = 30;
  let checkedRelease = "";
  let checkingRelease = false;
  let dailySignature = "";
  let dailyHistory = [];
  let performanceSignature = "";
  const chart = $("stats-history-chart");
  const chartElement = (name, attributes = {}) => {
    const element = document.createElementNS(chartNamespace, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  function drawChart(target, rows, series, options = {}) {
    const { width, height, xStart, xEnd, yStart, yEnd } = options;
    target.replaceChildren();
    delete target.dataset.latest;
    delete target.dataset.peak;
    delete target.dataset.points;
    delete target.dataset.lastX;
    delete target.dataset.lastY;
    const title = chartElement("title");
    title.textContent = series.name;
    target.append(title);
    const available = rows
      .map((row, index) => ({ index, value: row[series.key], sampledAt: row.sampledAt, day: row.day }))
      .filter((point) => Number.isFinite(point.value));
    if (!available.length) {
      const empty = chartElement("text", {
        x: width / 2,
        y: (yStart + yEnd) / 2,
        "text-anchor": "middle",
        class: "statistics-chart-empty",
      });
      empty.textContent = "In attesa dei campioni";
      target.append(empty);
      return;
    }
    const maxValue = options.maxValue ?? Math.max(1, ...available.map((point) => point.value));
    const ticks = options.ticks || 4;
    const x = (index) => (rows.length > 1 ? xStart + ((xEnd - xStart) * index) / (rows.length - 1) : xStart + (xEnd - xStart) / 2);
    const y = (value) => yEnd - ((yEnd - yStart) * value) / maxValue;
    for (let tick = 0; tick <= ticks; tick++) {
      const value = (maxValue * (ticks - tick)) / ticks;
      const position = y(value);
      target.append(chartElement("line", { x1: xStart, y1: position, x2: xEnd, y2: position, class: "chart-grid" }));
      const label = chartElement("text", { x: xStart - 7, y: position + 4, "text-anchor": "end", class: "chart-axis-label" });
      label.textContent = count(Math.round(value)) + series.unit;
      target.append(label);
    }
    let segment = [];
    const segments = [];
    for (let index = 0; index < rows.length; index++) {
      const value = rows[index][series.key];
      if (!Number.isFinite(value)) {
        if (segment.length) segments.push(segment);
        segment = [];
        continue;
      }
      segment.push({ index, value });
    }
    if (segment.length) segments.push(segment);
    const last = available.at(-1);
    const lastX = x(last.index);
    const lastY = y(last.value);
    for (const points of segments) {
      const path = points
        .map((point, index) => (index ? "L" : "M") + x(point.index).toFixed(1) + "," + y(point.value).toFixed(1))
        .join(" ");
      target.append(chartElement("path", { d: path, class: "chart-series chart-" + series.color }));
      for (const point of points) {
        const titleText =
          (point.day || time(point.sampledAt)) + ": " + series.name + " " + count(point.value) + series.unit;
        const circle = chartElement("circle", {
          cx: x(point.index),
          cy: y(point.value),
          r: rows.length < 32 ? 3 : 1.8,
          class: "chart-point chart-" + series.color,
          tabindex: 0,
          "aria-label": titleText,
        });
        const tooltip = chartElement("title");
        tooltip.textContent = titleText;
        circle.append(tooltip);
        target.append(circle);
      }
    }
    if (options.fill && segments.length) {
      for (const points of segments) {
        if (points.length < 2) continue;
        const d =
          points
            .map((point, index) => (index ? "L" : "M") + x(point.index).toFixed(1) + "," + y(point.value).toFixed(1))
            .join(" ") +
          " L" +
          x(points.at(-1).index).toFixed(1) +
          "," +
          yEnd +
          " L" +
          x(points[0].index).toFixed(1) +
          "," +
          yEnd +
          " Z";
        const fill = chartElement("path", { d, class: "chart-area chart-" + series.color + "-area" });
        target.insertBefore(fill, target.children[2]);
      }
    }
    const first = available[0];
    const middle = available[Math.floor((available.length - 1) / 2)];
    for (const [index, point] of [first, middle, last].entries()) {
      const label = chartElement("text", {
        x: x(point.index),
        y: height - 11,
        "text-anchor": index === 0 ? "start" : index === 2 ? "end" : "middle",
        class: "chart-axis-label",
      });
      label.textContent = options.daily ? point.day.slice(5) : time(point.sampledAt);
      target.append(label);
    }
    const description = chartElement("desc");
    description.textContent =
      available.length +
      " campioni. Ultimo: " +
      count(last.value) +
      series.unit +
      "; massimo: " +
      count(Math.max(...available.map((point) => point.value))) +
      series.unit +
      ".";
    target.append(description);
    target.dataset.latest = String(last.value);
    target.dataset.peak = String(Math.max(...available.map((point) => point.value)));
    target.dataset.points = String(available.length);
    target.dataset.lastX = String(lastX);
    target.dataset.lastY = String(lastY);
  }
  function renderHistory(data) {
    const selected = data.slice(0, historyDays).reverse();
    const values = selected.flatMap((day) => [day.visits, day.views, day.people]).filter(Number.isFinite);
    const maximum = Math.max(1, ...values);
    chart.replaceChildren();
    const title = chartElement("title");
    title.textContent = "Andamento giornaliero: visite, pagine viste e persone uniche sull’intero sito";
    chart.append(title);
    for (let tick = 0; tick <= 4; tick++) {
      const y = 20 + (202 * tick) / 4;
      chart.append(chartElement("line", { x1: 58, y1: y, x2: 700, y2: y, class: "chart-grid" }));
      const label = chartElement("text", { x: 50, y: y + 4, "text-anchor": "end", class: "chart-axis-label" });
      label.textContent = count(Math.round((maximum * (4 - tick)) / 4));
      chart.append(label);
    }
    for (const [key, color] of [
      ["visits", "visits"],
      ["views", "views"],
      ["people", "connections"],
    ]) {
      const series = { key, name: key === "visits" ? "Visite sito" : key === "views" ? "Pagine viste" : "Persone uniche", color, unit: "" };
      const values = selected.map((day) => day[key]);
      let segment = [];
      const segments = [];
      for (let index = 0; index < selected.length; index++) {
        if (!Number.isFinite(values[index])) {
          if (segment.length) segments.push(segment);
          segment = [];
          continue;
        }
        segment.push({ index, value: values[index] });
      }
      if (segment.length) segments.push(segment);
      for (const points of segments) {
        const path = points.map((point, index) => {
          const x = selected.length > 1 ? 58 + (642 * point.index) / (selected.length - 1) : 379;
          const y = 222 - (202 * point.value) / maximum;
          return (index ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
        }).join(" ");
        if (key === "visits" && points.length > 1) {
          const area =
            path +
            " L" +
            (selected.length > 1 ? 58 + (642 * points.at(-1).index) / (selected.length - 1) : 379) +
            ",222 L" +
            (selected.length > 1 ? 58 + (642 * points[0].index) / (selected.length - 1) : 379) +
            ",222 Z";
          chart.append(chartElement("path", { d: area, class: "chart-area chart-visits-area" }));
        }
        chart.append(chartElement("path", { d: path, class: "chart-series chart-" + color }));
        if (selected.length <= 31)
          for (const point of points) {
            const x = selected.length > 1 ? 58 + (642 * point.index) / (selected.length - 1) : 379;
            const y = 222 - (202 * point.value) / maximum;
            const circle = chartElement("circle", {
              cx: x,
              cy: y,
              r: 3,
              class: "chart-point chart-" + color,
              tabindex: 0,
              "aria-label": selected[point.index].day + ": " + series.name + " " + count(point.value),
            });
            const tooltip = chartElement("title");
            tooltip.textContent = selected[point.index].day + ": " + series.name + " " + count(point.value);
            circle.append(tooltip);
            chart.append(circle);
          }
      }
    }
    if (selected.length) {
      for (const [index, position] of [0, Math.floor((selected.length - 1) / 2), selected.length - 1].entries()) {
        const label = chartElement("text", {
          x: selected.length > 1 ? 58 + (642 * position) / (selected.length - 1) : 379,
          y: 261,
          "text-anchor": index === 0 ? "start" : index === 2 ? "end" : "middle",
          class: "chart-axis-label",
        });
        label.textContent = selected[position].day.slice(5);
        chart.append(label);
      }
    }
    const description = chartElement("desc");
    description.textContent =
      "Intervallo di " +
      historyDays +
      " giorni. Visite e pagine viste; le persone uniche sono disponibili dalla data di attivazione del conteggio.";
    chart.append(description);
    $("stats-history-note").textContent = selected.some((day) => day.people === null)
      ? "Il conteggio delle persone uniche parte dall’attivazione; i giorni precedenti sono indicati come non raccolti."
      : "Ogni browser conta una volta al giorno: più schede o pagine dello stesso browser non aumentano le persone uniche.";
    const body = $("stats-days");
    body.replaceChildren();
    for (const day of selected.slice().reverse()) {
      const row = document.createElement("tr");
      for (const value of [
        date(Date.parse(day.day + "T12:00:00Z")),
        Number.isFinite(day.people) ? count(day.people) : "Non raccolto",
        day.visits === null ? "Non raccolto" : count(day.visits),
        day.views === null ? "Non raccolto" : count(day.views),
        day.liveUnique === null ? "Non raccolto" : count(day.liveUnique),
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
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
      : "Nessuna pagina vista oggi.";
    $("stats-distribution-total").textContent =
      count(pageViews) + " visualizzazioni oggi · le visite contano browser, non pagine.";
    for (const page of pages.slice(0, 5)) {
      const item = document.createElement("div");
      item.className = "statistics-page-bar";
      const heading = document.createElement("div");
      heading.className = "statistics-page-bar-heading";
      const name = document.createElement("span");
      name.textContent = labels[page.page] || page.page;
      const value = document.createElement("strong");
      value.textContent = count(page.views);
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
    let validSamples = 0;
    const signature = data
      .map((sample) =>
        sample
          ? [sample.sampledAt, ...performanceSeries.map((series) => sample[series.key])].join(":")
          : "",
      )
      .join("|");
    if (signature === performanceSignature) return;
    performanceSignature = signature;
    for (const series of performanceSeries) {
      const values = data.map((sample) => sample?.[series.key]);
      validSamples = Math.max(validSamples, values.filter(Number.isFinite).length);
      const svg = $("stats-hour-" + series.id);
      drawChart(
        svg,
        data,
        series,
        {
          width: 340,
          height: 170,
          xStart: 48,
          xEnd: 330,
          yStart: 16,
          yEnd: 125,
          maxValue: series.key.endsWith("Percent") ? 100 : undefined,
          ticks: 2,
        },
      );
      const latest = svg.dataset.latest;
      const peak = svg.dataset.peak;
      $("stats-hour-" + series.id + "-current").textContent =
        latest === undefined ? "-" : count(Number(latest)) + series.unit;
      $("stats-hour-" + series.id + "-peak").textContent =
        peak === undefined ? "Nessun campione" : "Picco " + count(Number(peak)) + series.peakUnit;
    }
    $("stats-hour-note").textContent = validSamples < 60
      ? "Campioni reali raccolti: " + validSamples + " su 60 minuti. Il grafico si completa dopo un’ora."
      : "Campioni reali del NAS: uno al minuto. Nessun dato mancante viene sostituito con zero.";
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
      timestamp.textContent = time(event.time);
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
  async function checkRelease(revision) {
    if (checkingRelease) return;
    checkingRelease = true;
    const button = $("stats-release-check");
    const status = $("stats-release-status");
    const latestVersion = $("stats-release-latest");
    const latestLink = $("stats-release-latest-commit");
    button.disabled = true;
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
    } catch (error) {
      status.textContent = "Confronto non riuscito: " + error.message;
      latestVersion.hidden = true;
    } finally {
      checkingRelease = false;
      button.disabled = false;
    }
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
  $("statistics-content").hidden = false;
  window.NAS_METRICS.watch({
    render(data) {
      const { traffic, api } = data;
      $("statistics-status").textContent =
        (data.enabled ? "Aggiornato · " : "Raccolta browser disattivata · ") + time(data.sampledAt) + " Europe/Rome";
      $("statistics-status").className = "metrics-status";
      const release = data.service?.release;
      const releaseLink = $("stats-release-commit");
      if (typeof release === "string" && /^[a-f0-9]{40}$/i.test(release)) {
        releaseLink.hidden = false;
        releaseLink.textContent = release.slice(0, 12);
        releaseLink.href = "https://github.com/terranovamt/agesci-canicattini1/commit/" + release;
        releaseLink.target = "_blank";
        releaseLink.rel = "noopener";
        $("stats-release-branch").textContent = "Branch NAS · revisione completa " + release;
        if (checkedRelease !== release) {
          checkedRelease = release;
          checkRelease(release);
        }
      } else {
        releaseLink.hidden = true;
        $("stats-release-branch").textContent = "Branch NAS";
        $("stats-release-status").textContent =
          typeof release === "string" && release ? "Revisione: " + release + " (non identificata come commit Git)." : "Versione deployata non disponibile.";
      }
      for (const [id, value] of Object.entries({
        "stats-visits": traffic.today.visits,
        "stats-views": traffic.today.views,
        "stats-people": traffic.today.people,
        "stats-live-unique": traffic.today.liveUnique,
        "stats-online": data.enabled ? traffic.people : null,
        "stats-errors": traffic.today.errors,
        "stats-site-tabs": data.enabled ? traffic.online : null,
        "stats-site-visible": data.enabled ? traffic.visible : null,
        "stats-presentation": traffic.presentationDevices,
        "stats-streams": traffic.liveStreams,
        "stats-api-errors": api.errors5xx,
        "stats-limited": api.limited,
      }))
        $(id).textContent = count(value);
      $("stats-latency").textContent = Number.isFinite(api.p95Ms) ? Math.round(api.p95Ms) + " ms" : "-";
      $("stats-totals").textContent =
        "Dall’" +
        traffic.totals.started +
        " · " +
        count(traffic.totals.visits) +
        " visite al sito · " +
        count(traffic.totals.views) +
        " pagine viste.";
      const nextDaily = Array.isArray(traffic.daily) ? traffic.daily : [];
      const nextSignature = nextDaily.map((day) => [day.day, day.visits, day.views, day.people, day.liveUnique].join(":")).join("|");
      dailyHistory = nextDaily;
      if (nextSignature !== dailySignature) {
        dailySignature = nextSignature;
        renderHistory(nextDaily);
      }
      renderDistribution(traffic.pages, traffic.today.views);
      renderPerformance(data.performance?.hourly);
      const sessions = traffic.sessions.map((session) => [
        labels[session.page] || session.page,
        session.visible ? "In primo piano" : "In background",
        Number.isFinite(session.latencyMs) ? Math.round(session.latencyMs) + " ms" : "-",
        time(session.lastSeen),
      ]);
      rows("stats-sessions", sessions);
      const events = $("stats-events");
      if (!events.dataset.signature || events.dataset.signature !== JSON.stringify(data.events)) {
        events.dataset.signature = JSON.stringify(data.events);
        renderEvents(data.events);
      }
      $("stats-no-events").hidden = data.events.length > 0;
      $("stats-no-events").textContent = data.events.length
        ? data.events.length + " segnalazioni recenti · apri ogni riga per i dettagli."
        : "Nessuna segnalazione recente.";
    },
    error(message) {
      $("statistics-status").textContent = message;
      $("statistics-status").className = "metrics-status err";
      for (const id of counters) $(id).textContent = "-";
      $("stats-totals").textContent = "Dati non aggiornati";
      dailySignature = "";
      dailyHistory = [];
      renderHistory([]);
      renderDistribution([], 0);
      renderPerformance([]);
      rows("stats-sessions", [], "Dati non disponibili");
      renderEvents([]);
      $("stats-no-events").hidden = false;
      $("stats-no-events").textContent = "Segnalazioni non disponibili.";
    },
  });
})();
