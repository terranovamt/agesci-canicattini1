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
    assemblea: "Slide assemblea",
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
    "stats-connections",
    "stats-online",
    "stats-streams",
    "stats-errors",
    "stats-latency",
    "stats-api-errors",
    "stats-limited",
  ];
  const count = (value) => (Number.isFinite(value) ? value.toLocaleString("it-IT") : "-");
  const time = (value) => new Date(value).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" });
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
  $("statistics-content").hidden = false;
  window.NAS_METRICS.watch({
    render(data) {
      const { traffic, api } = data;
      $("statistics-status").textContent =
        (data.enabled ? "Aggiornato · " : "Raccolta browser disattivata · ") + time(data.sampledAt) + " Europe/Rome";
      $("statistics-status").className = "metrics-status";
      for (const [id, value] of Object.entries({
        "stats-visits": traffic.today.visits,
        "stats-views": traffic.today.views,
        "stats-connections": traffic.today.connections,
        "stats-online": data.enabled ? traffic.online : null,
        "stats-streams": traffic.liveStreams,
        "stats-errors": traffic.today.errors,
        "stats-api-errors": api.errors5xx,
        "stats-limited": api.limited,
      }))
        $(id).textContent = count(value);
      $("stats-latency").textContent = Number.isFinite(api.p95Ms) ? Math.round(api.p95Ms) + " ms" : "-";
      $("stats-totals").textContent =
        "Visite: " +
        count(traffic.totals.visits) +
        " · Pagine: " +
        count(traffic.totals.views) +
        " · Dal " +
        traffic.totals.started +
        " · Connessioni live registrate: " +
        count(traffic.totals.connections);
      rows(
        "stats-days",
        traffic.daily.map((day) => [day.day, count(day.visits), count(day.views), count(day.connections)]),
      );
      rows(
        "stats-pages",
        traffic.pages.map((page) => [labels[page.page] || page.page, count(page.views)]),
      );
      rows(
        "stats-sessions",
        traffic.sessions.map((session) => [
          labels[session.page] || session.page,
          Number.isFinite(session.latencyMs) ? Math.round(session.latencyMs) + " ms" : "-",
          time(session.lastSeen),
        ]),
      );
      const events = $("stats-events");
      events.replaceChildren();
      for (const event of data.events) {
        const row = document.createElement("li");
        row.textContent =
          time(event.time) +
          " · " +
          (kinds[event.kind] || event.kind) +
          " · " +
          (labels[event.page] || event.page) +
          (event.status ? " · HTTP " + event.status : "");
        events.append(row);
      }
      $("stats-no-events").hidden = data.events.length > 0;
    },
    error(message) {
      $("statistics-status").textContent = message;
      $("statistics-status").className = "metrics-status err";
      for (const id of counters) $(id).textContent = "-";
      $("stats-totals").textContent = "Dati non aggiornati";
      for (const id of ["stats-days", "stats-pages", "stats-sessions"]) rows(id, [], "Dati non disponibili");
      $("stats-events").replaceChildren();
      $("stats-no-events").hidden = true;
    },
  });
})();
