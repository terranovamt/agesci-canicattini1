(function () {
  const $ = (id) => document.getElementById(id);
  let started = false;
  function metrics() {
    if (!window.LIVE?.nas || !window.NAS_METRICS) return;
    const ids = [
      "dashboard-visits",
      "dashboard-connections",
      "dashboard-streams",
      "dashboard-cpu",
      "dashboard-ram",
      "dashboard-errors",
    ];
    const count = (value) => (Number.isFinite(value) ? value.toLocaleString("it-IT") : "-");
    const percent = (value) =>
      Number.isFinite(value) ? value.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "%" : "-";
    $("dashboard-metrics").hidden = false;
    window.NAS_METRICS.watch({
      view: "summary",
      render(data) {
        $("dashboard-visits").textContent = count(data.traffic.today.visits);
        $("dashboard-connections").textContent = count(data.traffic.today.connections);
        $("dashboard-streams").textContent = count(data.traffic.liveStreams);
        $("dashboard-errors").textContent = count(data.traffic.today.errors);
        $("dashboard-cpu").textContent = percent(data.resources.host?.cpuPercent);
        $("dashboard-ram").textContent = percent(data.resources.host?.memoryPercent);
        $("dashboard-metrics-status").textContent =
          (data.enabled ? "Aggiornato · " : "Raccolta browser disattivata · ") +
          new Date(data.sampledAt).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" });
        $("dashboard-metrics-status").className = "metrics-status";
      },
      error(message) {
        for (const id of ids) $(id).textContent = "-";
        $("dashboard-metrics-status").textContent = message;
        $("dashboard-metrics-status").className = "metrics-status err";
      },
    });
  }
  async function assembly() {
    $("dashboard-assembly-retry").hidden = true;
    $("dashboard-assembly-title").textContent = "Caricamento…";
    $("dashboard-assembly-details").textContent = "Lettura dei dati pubblicati.";
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "assemblea/dati.js?t=" + Date.now();
        script.onload = () => {
          script.remove();
          resolve();
        };
        script.onerror = () => {
          script.remove();
          reject(new Error("Impossibile caricare dati.js"));
        };
        document.head.append(script);
      });
      const data = window.DATI;
      if (!data?.assemblea || !Number.isSafeInteger(data.anno_esercizio) || !Array.isArray(data.slide)) {
        throw new Error("Dati dell’assemblea incompleti");
      }
      const plain = (value) =>
        String(value || "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      $("dashboard-assembly-title").textContent = plain(data.assemblea.titolo);
      const visible = data.slide.filter((slide) => !slide.nascosta && slide.tipo !== "slide_gruppo_invisibile").length;
      $("dashboard-assembly-details").textContent = [
        "Esercizio " + data.anno_esercizio,
        data.anno_scout ? "Anno scout " + data.anno_scout : "",
        plain(data.assemblea.data),
        "Convocazioni: " + data.assemblea.prima_convocazione + " / " + data.assemblea.seconda_convocazione,
        visible + " slide visibili",
      ]
        .filter(Boolean)
        .join(" · ");
    } catch (error) {
      $("dashboard-assembly-title").textContent = "Riepilogo non disponibile";
      $("dashboard-assembly-details").textContent = error.message;
      $("dashboard-assembly-retry").hidden = false;
    }
  }
  async function documents() {
    $("dashboard-documents-retry").hidden = true;
    $("dashboard-documents-status").textContent = "Caricamento dell’indice PDF…";
    $("dashboard-document-links").replaceChildren();
    try {
      const response = await fetch("../documents/index.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Caricamento PDF non riuscito (HTTP " + response.status + ")");
      const items = await response.json();
      if (
        !Array.isArray(items) ||
        items.some(
          (item) =>
            typeof item?.file !== "string" ||
            !/^[^/\\]+\.pdf$/i.test(item.file) ||
            item.file.startsWith(".") ||
            typeof item.title !== "string",
        )
      ) {
        throw new Error("Indice PDF non valido");
      }
      $("dashboard-documents-status").textContent = items.length
        ? items.length + " documenti disponibili sul sito."
        : "Nessun PDF pubblicato. Aggiungi il primo dalla gestione documenti.";
      items.slice(0, 3).forEach((item) => {
        const li = document.createElement("li"),
          link = document.createElement("a");
        link.textContent = item.title;
        link.href = "../documents/pdf/" + encodeURIComponent(item.file);
        link.target = "_blank";
        link.rel = "noopener";
        link.setAttribute("aria-label", item.title + " (PDF, nuova scheda)");
        li.append(link);
        $("dashboard-document-links").append(li);
      });
    } catch (error) {
      $("dashboard-documents-status").textContent = error.message;
      $("dashboard-documents-retry").hidden = false;
    }
  }
  window.AREA_DASHBOARD = {
    load() {
      if (started || !window.ACCESSO.verificata()) return;
      started = true;
      $("dashboard-assembly-retry").onclick = assembly;
      $("dashboard-documents-retry").onclick = documents;
      assembly();
      documents();
      metrics();
    },
  };
})();
