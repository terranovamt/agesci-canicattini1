(function () {
  const $ = (id) => document.getElementById(id);
  const summary = ["nas-online", "nas-cpu", "nas-ram", "nas-host-cpu", "nas-host-ram", "nas-streams"];
  const details = ["nas-container", "nas-lag", "nas-disk", "nas-devices"];
  let started = false,
    watcher;
  const numeric = (value) => Number.isFinite(value);
  const percent = (value) => (numeric(value) ? value.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%" : "-");
  const bytes = (value) =>
    numeric(value)
      ? (value / 1024 ** (value >= 1024 ** 3 ? 3 : 2)).toLocaleString("it-IT", { maximumFractionDigits: 1 }) +
        (value >= 1024 ** 3 ? " GiB" : " MiB")
      : "-";
  const milliseconds = (value) => (numeric(value) ? Math.round(value).toLocaleString("it-IT") + " ms" : "-");
  function render(data) {
    const { traffic, resources } = data;
    $("nas-online").textContent = traffic.presentationDevices.toLocaleString("it-IT");
    $("nas-cpu").textContent = percent(resources.process.cpuCorePercent);
    $("nas-ram").textContent = bytes(resources.process.rssBytes);
    $("nas-host-cpu").textContent = percent(resources.host?.cpuPercent);
    $("nas-host-ram").textContent = percent(resources.host?.memoryPercent);
    $("nas-streams").textContent = traffic.liveStreams + " / " + traffic.liveLimit;
    $("nas-devices").textContent = (data.enabled ? traffic.people : 0).toLocaleString("it-IT");
    $("nas-container").textContent =
      bytes(resources.container.memoryBytes) + " / " + bytes(resources.container.memoryLimitBytes);
    $("nas-lag").textContent = milliseconds(resources.process.eventLoopP95Ms);
    $("nas-disk").textContent = resources.disk ? bytes(resources.disk.availableBytes) + " liberi" : "-";
    $("nas-status").textContent =
      "Live · " + new Date(data.sampledAt).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" });
    $("nas-status").className = "monitor-status";
    $("nas-alerts").textContent = data.warnings.join(" · ");
    $("nas-alerts").hidden = !data.warnings.length;
  }
  async function refresh() {
    return watcher?.refresh();
  }
  function unavailable(message) {
    for (const id of [...summary, ...details]) $(id).textContent = "-";
    $("nas-status").textContent = message;
    $("nas-status").className = "monitor-status err";
    $("nas-alerts").hidden = true;
  }
  window.NAS_MONITOR = {
    start() {
      if (started || !window.LIVE?.nas) return;
      started = true;
      $("legacy-service-metrics").hidden = true;
      $("nas-monitor").hidden = false;
      $("nas-statistics-link").hidden = !window.NAS?.user?.admin;
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
      watcher = window.NAS_METRICS.watch({ render, error: unavailable, view: "live" });
    },
    refresh,
    stop() {
      watcher?.stop();
      started = false;
    },
  };
})();
