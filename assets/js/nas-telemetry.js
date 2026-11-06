(function () {
  if (window.DOCUMENTS_PREVIEW || window.top !== window.self) return;
  const nativeFetch = window.fetch.bind(window);
  const route = location.pathname.toLowerCase();
  const basePath = route.startsWith("/agesci-canicattini1/") ? "/agesci-canicattini1" : "";
  const page = route.endsWith("/statistiche.html")
    ? "statistiche"
    : route.endsWith("/regia.html")
      ? "regia"
      : route.endsWith("/setup.html")
        ? "setup"
        : route.endsWith("/guida.html")
          ? "guida"
          : route.includes("/peg/")
            ? "peg"
            : route.includes("/area-riservata/assemblea/")
              ? "assemblea"
              : route.includes("/assemblea/")
                ? "assemblea-documenti"
                : route.includes("/area-riservata/documenti.html")
                  ? "gestione-documenti"
                  : route.includes("/documenti/")
                    ? "documenti"
                    : route.includes("/area-riservata/")
                      ? "area"
                      : "home";
  const kinds = new Set(["offline", "network-error", "http-error", "resource-error", "js-error", "stream-reconnect"]);
  let enabled = false,
    initializing = true,
    sending = false,
    viewSent = false;
  let id, tab, latencyMs;
  const pending = [];
  function event(kind, status) {
    if ((!enabled && !initializing) || !kinds.has(kind) || pending.length >= 8) return;
    pending.push({ kind, page, ...(Number.isInteger(status) && status >= 400 && status <= 599 ? { status } : {}) });
  }
  window.NAS_TELEMETRY = { event };
  addEventListener("error", (error) => event(error.target?.tagName ? "resource-error" : "js-error"), true);
  addEventListener("unhandledrejection", () => event("js-error"));
  addEventListener("offline", () => event("offline"));
  async function send(type) {
    if (!enabled || (sending && type !== "leave")) return;
    const events = pending.splice(0, 8);
    try {
      localStorage.setItem("nas-visit-time", String(Date.now()));
    } catch {}
    const payload = {
      id,
      tab,
      page,
      type,
      visible: document.visibilityState !== "hidden",
      events,
      ...(Number.isFinite(latencyMs) ? { latencyMs: Math.min(120000, latencyMs) } : {}),
    };
    const started = performance.now();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    sending = true;
    try {
      const response = await nativeFetch(basePath + "/api/telemetry", {
        method: "POST",
        keepalive: type === "leave",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("telemetry");
      latencyMs = performance.now() - started;
      if (type === "view") viewSent = true;
    } catch {
      pending.unshift(...events.slice(0, Math.max(0, 8 - pending.length)));
    } finally {
      clearTimeout(timeout);
      sending = false;
    }
  }
  nativeFetch(basePath + "/api/telemetry/config", { cache: "no-store" })
    .then(async (response) => {
      enabled = response.ok && (await response.json()).enabled === true;
      initializing = false;
      if (!enabled) {
        pending.length = 0;
        return;
      }
      try {
        id = localStorage.getItem("nas-visit-id");
        const seen = Number(localStorage.getItem("nas-visit-time"));
        if (!/^[a-f0-9-]{36}$/i.test(id || "") || !seen || seen < Date.now() - 1800000) {
          id = window.crypto.randomUUID();
          localStorage.setItem("nas-visit-id", id);
        }
        localStorage.setItem("nas-visit-time", String(Date.now()));
      } catch {
        id = window.crypto.randomUUID();
      }
      tab = window.crypto.randomUUID();
      window.fetch = async (...args) => {
        let report = false;
        try {
          const input = args[0];
          const address = new URL(typeof input === "string" ? input : input.url || input.href, location.href);
          report = address.origin === location.origin && !address.pathname.startsWith(basePath + "/api/telemetry");
        } catch {}
        try {
          const response = await nativeFetch(...args);
          if (report && !response.ok) event("http-error", response.status);
          return response;
        } catch (error) {
          if (report && error.name !== "AbortError") event("network-error");
          throw error;
        }
      };
      const first = () => send("view");
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", first, { once: true });
      else first();
      setInterval(() => {
        if (document.visibilityState !== "hidden") send(viewSent ? "heartbeat" : "view");
      }, 30000);
      addEventListener("visibilitychange", () =>
        send(document.visibilityState === "hidden" ? "leave" : viewSent ? "heartbeat" : "view"),
      );
      addEventListener("pagehide", () => send("leave"));
      addEventListener("online", () => send(viewSent ? "heartbeat" : "view"));
    })
    .catch(() => {
      enabled = false;
      initializing = false;
      pending.length = 0;
    });
})();
