(function () {
  function watch({ render, error, view = "full" }) {
    const endpoint = (window.LIVE?.basePath || "") + "/api/metrics";
    let loading = false,
      stopped = false,
      controller;
    async function refresh() {
      if (loading || stopped || document.visibilityState === "hidden") return;
      loading = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(view === "full" ? endpoint : endpoint + "?view=" + encodeURIComponent(view), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sessione scaduta: accedi di nuovo"
              : "Monitoraggio non disponibile (HTTP " + response.status + ")",
          );
        const data = await response.json();
        if (!stopped) render(data);
      } catch (failure) {
        if (!stopped)
          error(failure.name === "AbortError" ? "Monitoraggio: tempo di risposta scaduto" : failure.message);
      } finally {
        clearTimeout(timeout);
        loading = false;
      }
    }
    const resume = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    document.addEventListener("visibilitychange", resume);
    const timer = setInterval(refresh, 5000);
    function stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", resume);
    }
    const leave = (event) => {
      if (!event.persisted) stop();
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", resume);
    refresh();
    return { refresh, stop };
  }
  window.NAS_METRICS = { watch };
})();
