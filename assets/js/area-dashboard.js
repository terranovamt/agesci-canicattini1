(function () {
  const $ = (id) => document.getElementById(id);
  const AM = window.ACTIVITIES_MODEL;
  let started = false, agenda = null;
  function personalize() {
    const user = window.NAS?.user;
    const profiles = {
      "L/C": { title: "Area capi L/C", intro: "Il branco, le sestiglie e il cammino di ogni lupetto.",
        tools: [["Riunioni e cacce", "attivita.html"], ["Torneo delle sestiglie", "attivita.html#tournament-panel"],
          ["Stagione di caccia e specialità", "attivita.html#paths-panel"], ["Lupetti e sestiglie", "soci.html"]] },
      "E/G": { title: "Area capi E/G", intro: "Il reparto, le squadriglie e le imprese da preparare.",
        tools: [["Riunioni, uscite e campi", "attivita.html"], ["Specialità e brevetti", "attivita.html#paths-panel"],
          ["Esploratori, guide e squadriglie", "soci.html"]] },
      "R/S": { title: "Area capi R/S", intro: "Il clan, le riunioni e la prossima route.",
        tools: [["Riunioni e route", "attivita.html"], ["Rover e scolte", "soci.html"]] },
    };
    const profile = !user?.admin && profiles[user?.serviceBranch];
    if (!profile) return;
    $("reserved-content").setAttribute("data-branch", user.serviceBranch);
    $("dashboard-title").textContent = profile.title;
    $("dashboard-branch-intro").textContent = profile.intro;
    $("dashboard-branch-intro").hidden = false;
    const tools = $("dashboard-branch-tools");
    tools.replaceChildren(...profile.tools.map(([label, href]) => {
      const link = document.createElement("a");
      link.className = "button button-secondary";
      link.href = href; link.textContent = label;
      return link;
    }));
    tools.hidden = false;
  }
  function metrics() {
    if (!window.LIVE?.nas || !window.NAS?.user?.admin || !window.NAS_METRICS) return;
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
        $("dashboard-connections").textContent = count(data.traffic.today.people);
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
  async function groupOverview() {
    if (!window.NAS?.user?.admin || !window.ACCESSO?.request) return;
    const panel = $("dashboard-group-overview"), retry = $("dashboard-group-retry");
    panel.hidden = false;
    retry.hidden = true;
    $("dashboard-group-status").textContent = "Caricamento dei censimenti…";
    $("dashboard-group-counts").replaceChildren();
    try {
      const data = await window.ACCESSO.request("members/overview");
      if (!data || !Array.isArray(data.branches) || !Number.isSafeInteger(data.total) || data.total < 0 ||
          data.branches.some(item => !Number.isSafeInteger(item.count) || item.count < 0)) {
        throw new Error("Riepilogo censimenti non valido");
      }
      const makeCount = (label, count, className, branch) => {
        const item = document.createElement("div");
        if (className) item.className = className;
        if (branch && window.SOCI_MODEL.branchColors[branch]) {
          item.style.setProperty("--census-color", window.SOCI_MODEL.branchColors[branch]);
        }
        const term = document.createElement("dt"), value = document.createElement("dd");
        term.textContent = label;
        value.textContent = count.toLocaleString("it-IT");
        item.append(term, value);
        return item;
      };
      $("dashboard-group-counts").append(
        makeCount("Totale censiti", data.total, "group-census-total"),
        ...data.branches.map(item => makeCount(window.SOCI_MODEL.branchLabel(item.branch), item.count, "group-census-branch", item.branch)),
      );
      $("dashboard-group-status").textContent = data.year
        ? `Censimenti AGESCI · anno ${data.year} · esclusi i sospesi da oltre un anno.`
        : "Nessun censimento AGESCI importato.";
    } catch (error) {
      $("dashboard-group-status").textContent = error.message;
      retry.hidden = false;
    }
  }
  function renderEvent() {
      const panel = $("dashboard-event-panel");
      const user = window.NAS?.user;
      const events = user?.admin ? agenda : agenda.filter(event => event.branch === user?.serviceBranch);
      const event = AM.nextEvent(events);
      const action = $("dashboard-event-action");
      $("dashboard-event-now").hidden = true;
      $("dashboard-attendance-action").hidden = true;
      panel.setAttribute("data-active", "false");
      $("dashboard-event-heading").textContent = "Prossimo evento";
      if (!event) {
        $("dashboard-event-title").textContent = "Nessun prossimo evento";
        $("dashboard-event-details").textContent = "Aggiungi una riunione o un campo per la tua branca.";
        $("dashboard-event-preparation").textContent = "";
        $("dashboard-event-finances").textContent = "";
        action.href = "attivita.html";
        action.textContent = "Crea un’attività →";
        return;
      }
      const endDate = event.endDate || event.date;
      const live = AM.liveProgram(event), active = live.active;
      panel.setAttribute("data-active", String(active));
      $("dashboard-event-heading").textContent = active ? "Attività in corso · oggi" : "Prossimo evento";
      const dateText = start => new Date(start + "T12:00:00").toLocaleDateString("it-IT", {
        day: "numeric", month: "long", year: "numeric",
      });
      $("dashboard-event-title").textContent = event.title;
      $("dashboard-event-details").textContent = (active ? "Oggi · " : "") +
        (event.date === endDate ? dateText(event.date) : dateText(event.date) + " – " + dateText(endDate)) +
        " · " + event.branch + " · " + event.kind;
      const preparation = (event.program || []).filter(item => item.title).length;
      const outstanding = [...(event.materials || []), ...(event.shopping || []), ...(event.tasks || [])]
        .filter(item => !item.done).length;
      $("dashboard-event-preparation").textContent =
        `${preparation} momenti in programma · ${outstanding} cose da preparare o completare`;
      const missing = (event.attendance || []).filter(person => person.due &&
        Math.max(0, (event.feeCents || 0) - (person.paidCents || 0)) > 0).length;
      const money = cents => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
      const hasFees = event.feeCents || (event.attendance || []).some(person => person.due || person.paidCents);
      $("dashboard-event-finances").textContent = hasFees
        ? `${missing} ${missing === 1 ? "quota" : "quote"} da completare · ${money(event.totals?.paid || 0)} incassati su ${money(event.totals?.expected || 0)} attesi · ${money(event.totals?.remaining || 0)} ancora da ricevere`
        : "Nessuna quota prevista";
      action.href = `attivita.html?event=${encodeURIComponent(event.id)}&presenze=1`;
      action.textContent = "Apri programma e presenze →";
      if (active) {
        $("dashboard-event-now").hidden = false;
        $("dashboard-event-clock").textContent = "Adesso · " + live.time + " · ora italiana";
        const moment = live.current || live.next;
        $("dashboard-event-moment").textContent = live.current
          ? `${moment.time} · ${moment.title}`
          : live.next ? `Si comincia alle ${moment.time} · ${moment.title}` : "Programma di oggi da definire";
        $("dashboard-event-place").textContent = moment?.place ? "Dove: " + moment.place : "";
        $("dashboard-event-description").textContent = moment?.description ||
          (!moment ? "Aggiungi i momenti con giorno e ora per vedere qui cosa fare adesso." : "");
        $("dashboard-event-materials").textContent = moment?.materials ? "Materiali: " + moment.materials : "";
        $("dashboard-event-next").textContent = live.current && live.next
          ? `A seguire · ${live.next.time} · ${live.next.title}`
          : live.current ? "Ultimo momento con orario previsto per oggi." : "";
        action.href = `attivita.html?event=${encodeURIComponent(event.id)}&ora=1`;
        action.textContent = "Attività in corso →";
        $("dashboard-attendance-action").hidden = false;
        $("dashboard-attendance-action").href = `attivita.html?event=${encodeURIComponent(event.id)}&presenze=1`;
      }
  }
  async function upcomingEvent() {
    const panel = $("dashboard-event-panel"), retry = $("dashboard-event-retry");
    if (!window.NAS?.user?.admin && !window.NAS?.user?.serviceBranch) return;
    panel.hidden = false;
    retry.hidden = true;
    agenda = null;
    panel.setAttribute("data-active", "false");
    $("dashboard-event-now").hidden = true;
    $("dashboard-attendance-action").hidden = true;
    $("dashboard-event-action").hidden = true;
    $("dashboard-event-title").textContent = "Caricamento…";
    $("dashboard-event-details").textContent = "Lettura del programma e delle quote.";
    $("dashboard-event-preparation").textContent = "";
    $("dashboard-event-finances").textContent = "";
    try {
      const data = await window.ACCESSO.request("activities");
      if (!data || !Array.isArray(data.events)) throw new Error("Agenda delle attività non valida");
      agenda = data.events;
      renderEvent();
      $("dashboard-event-action").hidden = false;
    } catch (error) {
      $("dashboard-event-title").textContent = "Agenda non disponibile";
      $("dashboard-event-details").textContent = error.message;
      retry.hidden = false;
    }
  }
  window.AREA_DASHBOARD = {
    load() {
      if (started || !window.ACCESSO.verificata()) return;
      started = true;
      personalize();
      $("dashboard-assembly-retry").onclick = assembly;
      $("dashboard-documents-retry").onclick = documents;
      $("dashboard-group-retry").onclick = groupOverview;
      $("dashboard-event-retry").onclick = upcomingEvent;
      assembly();
      documents();
      groupOverview();
      upcomingEvent();
      metrics();
      window.setInterval?.(() => { if (agenda) renderEvent(); }, 30000);
      window.addEventListener?.("focus", () => { if (agenda) renderEvent(); });
    },
  };
})();
