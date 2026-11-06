(function () {
  const $ = (id) => document.getElementById(id);
  const labels = {
    home: "Home",
    assemblea: "Assemblea",
    documenti: "Documenti",
    peg: "PEG",
    area: "Area riservata",
    regia: "Regia",
    setup: "Setup",
    guida: "Guida",
    server: "Server",
  };
  const errors = {
    offline: "Browser offline",
    "network-error": "Richiesta non riuscita",
    "http-error": "Errore HTTP",
    "resource-error": "Risorsa non caricata",
    "js-error": "Errore JavaScript",
    "stream-reconnect": "Diretta in riconnessione",
    "server-error": "Errore server",
  };
  const summary = [
    "nas-visits",
    "nas-online",
    "nas-cpu",
    "nas-ram",
    "nas-host-cpu",
    "nas-host-ram",
    "nas-latency",
    "nas-errors",
  ];
  const details = [
    "nas-container",
    "nas-heap",
    "nas-lag",
    "nas-disk",
    "nas-db",
    "nas-api-errors",
    "nas-api-limited",
    "nas-streams",
    "nas-devices",
  ];
  let started = false,
    loading = false,
    timer;
  const numeric = (value) => Number.isFinite(value);
  const percent = (value) => (numeric(value) ? value.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%" : "-");
  const bytes = (value) =>
    numeric(value)
      ? (value / 1024 ** (value >= 1024 ** 3 ? 3 : 2)).toLocaleString("it-IT", { maximumFractionDigits: 1 }) +
        (value >= 1024 ** 3 ? " GiB" : " MiB")
      : "-";
  const milliseconds = (value) => (numeric(value) ? Math.round(value).toLocaleString("it-IT") + " ms" : "-");
  function rows(id, values) {
    const body = $(id);
    body.replaceChildren();
    for (const valuesRow of values) {
      const row = document.createElement("tr");
      for (const value of valuesRow) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      body.append(row);
    }
  }
  function render(data) {
    const { traffic, resources, api } = data;
    $("nas-visits").textContent = data.enabled ? traffic.today.visits.toLocaleString("it-IT") : "-";
    $("nas-online").textContent = data.enabled ? traffic.online.toLocaleString("it-IT") : "-";
    $("nas-cpu").textContent = percent(resources.process.cpuCorePercent);
    $("nas-ram").textContent = bytes(resources.process.rssBytes);
    $("nas-host-cpu").textContent = percent(resources.host?.cpuPercent);
    $("nas-host-ram").textContent = percent(resources.host?.memoryPercent);
    $("nas-latency").textContent = milliseconds(api.p95Ms);
    $("nas-errors").textContent = traffic.today.errors.toLocaleString("it-IT");
    $("nas-streams").textContent = traffic.liveStreams + " / " + traffic.liveLimit;
    $("nas-devices").textContent = traffic.presentationDevices;
    $("nas-container").textContent =
      bytes(resources.container.memoryBytes) + " / " + bytes(resources.container.memoryLimitBytes);
    $("nas-heap").textContent = bytes(resources.process.heapBytes);
    $("nas-lag").textContent = milliseconds(resources.process.eventLoopP95Ms);
    $("nas-disk").textContent = resources.disk ? bytes(resources.disk.availableBytes) + " liberi" : "-";
    $("nas-db").textContent = resources.disk ? bytes(resources.disk.databaseBytes) : "-";
    $("nas-api-errors").textContent = api.errors5xx;
    $("nas-api-limited").textContent = api.limited;
    $("nas-total").textContent =
      traffic.totals.visits + " visite / " + traffic.totals.views + " pagine dal " + traffic.totals.started;
    $("nas-release").textContent =
      data.service.release.slice(0, 12) +
      " · avvio " +
      new Date(data.service.startedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
    $("nas-status").textContent = data.enabled
      ? "Aggiornato alle " + new Date(data.sampledAt).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" })
      : "Telemetria browser disattivata";
    $("nas-status").className = "monitor-status";
    $("nas-alerts").textContent = data.warnings.join(" · ");
    $("nas-alerts").hidden = !data.warnings.length;
    rows(
      "nas-days",
      traffic.daily.map((day) => [day.day, day.visits, day.views]),
    );
    rows(
      "nas-pages",
      traffic.pages.map((page) => [labels[page.page] || page.page, page.views]),
    );
    rows(
      "nas-sessions",
      traffic.sessions.map((session) => [
        labels[session.page] || session.page,
        milliseconds(session.latencyMs),
        new Date(session.lastSeen).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" }),
      ]),
    );
    const list = $("nas-events");
    list.replaceChildren();
    for (const event of data.events) {
      const item = document.createElement("li");
      item.textContent =
        new Date(event.time).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" }) +
        " · " +
        (errors[event.kind] || event.kind) +
        " · " +
        (labels[event.page] || event.page) +
        (event.status ? " · HTTP " + event.status : "");
      list.append(item);
    }
    $("nas-no-events").hidden = data.events.length > 0;
  }
  async function refresh() {
    if (loading || document.visibilityState === "hidden") return;
    loading = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 4000);
    try {
      const response = await fetch("/api/metrics", { cache: "no-store", signal: abort.signal });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Sessione scaduta: accedi di nuovo"
            : "Monitoraggio non disponibile (HTTP " + response.status + ")",
        );
      render(await response.json());
    } catch (error) {
      for (const id of [...summary, ...details]) $(id).textContent = "-";
      $("nas-status").textContent =
        error.name === "AbortError" ? "Monitoraggio: tempo di risposta scaduto" : error.message;
      $("nas-status").className = "monitor-status err";
      rows("nas-sessions", []);
    } finally {
      clearTimeout(timeout);
      loading = false;
    }
  }
  window.NAS_MONITOR = {
    start() {
      if (started || !window.LIVE?.nas) return;
      started = true;
      $("legacy-service-metrics").hidden = true;
      $("nas-monitor").hidden = false;
      $("nas-refresh").onclick = refresh;
      const panel = $("nas-monitor"),
        home = panel.parentElement,
        dialog = $("nas-monitor-dialog");
      $("nas-expand").onclick = () => {
        $("nas-monitor-expanded").append(panel);
        $("nas-expand").hidden = true;
        dialog.showModal();
      };
      $("nas-close").onclick = () => dialog.close();
      dialog.onclose = () => {
        home.append(panel);
        $("nas-expand").hidden = false;
      };
      const tabs = [...document.querySelectorAll("[data-monitor-tab]")];
      for (const tab of tabs)
        tab.onclick = () => {
          for (const other of tabs) {
            const selected = other === tab;
            other.setAttribute("aria-selected", String(selected));
            other.tabIndex = selected ? 0 : -1;
            $("monitor-" + other.dataset.monitorTab).hidden = !selected;
          }
        };
      tabs.forEach(
        (tab, index) =>
          (tab.onkeydown = (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].onclick();
            tabs[next].focus();
          }),
      );
      refresh();
      timer = setInterval(refresh, 5000);
    },
    refresh,
    stop() {
      clearInterval(timer);
      started = false;
    },
  };
})();
