(function () {
  if (window.top !== window.self) return;
  const nativeFetch = window.fetch.bind(window);
  const route = location.pathname.toLowerCase();
  const basePath = route.startsWith("/agesci-canicattini1/") ? "/agesci-canicattini1" : "";
  function visitorId() {
    const key = "nas-live-visitor-id";
    try {
      let value = localStorage.getItem(key);
      if (!/^[a-f0-9-]{36}$/i.test(value || "")) {
        value = crypto.randomUUID();
        localStorage.setItem(key, value);
      }
      return value;
    } catch {
      try {
        let value = sessionStorage.getItem(key);
        if (!/^[a-f0-9-]{36}$/i.test(value || "")) {
          value = crypto.randomUUID();
          sessionStorage.setItem(key, value);
        }
        return value;
      } catch {
        return null;
      }
    }
  }
  window.NAS_VISITOR = { id: visitorId };
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
  // Anonymous usage counters: fixed action names only, no content and no member data.
  const tracked = {
    "#open-macro": "soci.proponi-passaggio", "#open-documents": "soci.genera-documenti", "#print-documents": "soci.stampa-documenti",
    "#select-results": "soci.seleziona-risultati", "#new-member": "soci.nuovo-socio", "#member-save": "soci.salva-scheda",
    "#import-csv": "soci.importa-csv", "#new-unit": "soci.nuova-squadriglia", ".unit-grip": "soci.sposta-socio",
    ".member-name": "soci.apri-scheda", "#new-event": "attivita.nuova-attivita", "#new-winter-camp": "attivita.nuovo-campo",
    "#new-path": "attivita.nuovo-percorso", "#save-paths": "attivita.salva-percorsi", "#event-live-attendance": "attivita.presenze",
    "#new-document": "documenti.nuovo", "#save-document": "documenti.pubblica", "#nuovo-anno": "assemblea.nuovo-anno",
    "#inizia": "regia.avvia-live", "#next": "regia.avanti", "#prev": "regia.indietro", "#termina": "regia.termina",
    "#pdf": "regia.pdf", "[data-row-toggle]": "attivita.dettagli-momento", ".program-day-select": "attivita.cambia-giorno",
  };
  const actions = [];
  function action(name) {
    if ((!enabled && !initializing) || !/^[a-z0-9]{2,20}\.[a-z0-9-]{2,40}$/.test(name) || actions.length >= 16) return;
    actions.push(name);
  }
  addEventListener("click", (click) => {
    const target = click.target?.closest ? click.target : click.target?.parentElement;
    if (!target) return;
    for (const [selector, name] of Object.entries(tracked)) if (target.closest(selector)) return action(name);
    const section = target.closest("[data-section-target]")?.dataset.sectionTarget;
    if (section) action("sezione." + section.replace(/-panel$/, "").replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 40));
  }, true);
  window.NAS_TELEMETRY = { event, action };
  addEventListener("error", (error) => event(error.target?.tagName ? "resource-error" : "js-error"), true);
  addEventListener("unhandledrejection", () => event("js-error"));
  addEventListener("offline", () => event("offline"));
  async function send(type, urgent = type === "leave") {
    if (!enabled || (sending && !urgent)) return;
    const events = pending.splice(0, 8);
    const used = actions.splice(0, 8);
    try {
      localStorage.setItem("nas-visit-time", String(Date.now()));
    } catch {}
    const visitor = visitorId();
    const payload = {
      id,
      tab,
      ...(visitor ? { visitor } : {}),
      page,
      type,
      visible: document.visibilityState !== "hidden",
      events,
      ...(used.length ? { actions: used } : {}),
      ...(Number.isFinite(latencyMs) ? { latencyMs: Math.min(120000, latencyMs) } : {}),
    };
    const started = performance.now();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    sending = true;
    try {
      const response = await nativeFetch(basePath + "/api/telemetry", {
        method: "POST",
        keepalive: urgent,
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("telemetry");
      latencyMs = performance.now() - started;
      if (type === "view") viewSent = true;
    } catch {
      pending.unshift(...events.slice(0, Math.max(0, 8 - pending.length)));
      actions.unshift(...used.slice(0, Math.max(0, 16 - actions.length)));
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
      const beat = (urgent = false) => send(viewSent ? "heartbeat" : "view", urgent);
      setInterval(() => beat(), 30000);
      addEventListener("visibilitychange", () => beat(document.visibilityState === "hidden"));
      addEventListener("pagehide", () => send("leave"));
      addEventListener("pageshow", (event) => event.persisted && beat());
      addEventListener("online", () => beat());
    })
    .catch(() => {
      enabled = false;
      initializing = false;
      pending.length = 0;
    });
})();
