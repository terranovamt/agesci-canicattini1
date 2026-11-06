(function () {
  const $ = (id) => document.getElementById(id);
  const M = window.CALENDAR_MODEL;
  const now = new Date();
  let data,
    selected = new Set(),
    chosenDay = null,
    showAllUpcoming = false;
  let month = new Date(M.dateKey(now).slice(0, 7) + "-01T12:00:00Z");
  const format = (date, options) =>
    new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", ...options }).format(date);
  const element = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const addDays = (key, days) => {
    const date = new Date(key + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const filtered = () => data.events.filter((event) => selected.has(event.calendar));
  const stale = () => Date.now() - Date.parse(data.generatedAt) > 3 * 60 * 60 * 1000;
  function warning(visible) {
    $("calendar-info-warning").hidden = !visible;
    $("calendar-info")
      .querySelector("summary")
      .setAttribute(
        "aria-label",
        visible
          ? "Informazioni calendari: dati non aggiornati o non disponibili"
          : "Informazioni e stato dei calendari",
      );
  }
  function renderAssembly() {
    const banner = $("stato");
    if (!banner) return;
    const upcoming = data ? M.nextAssembly(data, new Date()) : null;
    banner.hidden = !upcoming;
    banner.replaceChildren();
    if (upcoming) {
      const { event } = upcoming;
      const date = event.allDay ? new Date(event.start + "T12:00:00Z") : new Date(event.start);
      const days = M.calendarDaysUntil(event, new Date());
      const title = /^assemblea di gruppo$/i.test(event.title.trim()) ? "Assemblea di Gruppo" : event.title;
      banner.append(
        element("strong", title, "assembly-status-title"),
        element("span", " · ", "visually-hidden"),
        element(
          "span",
          format(date, { day: "numeric", month: "long", year: "numeric" }) +
            (days <= 0 ? " · Oggi" : " · Tra " + days + (days === 1 ? " giorno" : " giorni")),
          "assembly-status-meta",
        ),
      );
    }
  }
  function renderPreparatory() {
    const section = $("documenti-preparatori");
    if (section) section.hidden = !(data && M.preparatoryAssembly(data, new Date()));
  }
  function renderStatus() {
    const messages = data.calendars
      .filter((calendar) => calendar.status !== "ok")
      .map(
        (calendar) =>
          calendar.name +
          ": sincronizzazione non riuscita." +
          (calendar.lastSuccess
            ? " Ultimi dati disponibili del " +
              format(new Date(calendar.lastSuccess), { dateStyle: "short", timeStyle: "short" }) +
              "."
            : " Nessun evento ancora scaricato."),
      );
    if (stale()) messages.push("Aggiornamento in ritardo: gli eventi potrebbero essere cambiati.");
    messages.push(
      "Ultimo tentativo: " +
        format(new Date(data.generatedAt), { dateStyle: "short", timeStyle: "short" }) +
        ". Orari Europe/Rome.",
    );
    messages.push(
      "Periodo sincronizzato: " +
        format(new Date(data.rangeStart), { dateStyle: "short" }) +
        " – " +
        format(new Date(data.rangeEnd), { dateStyle: "short" }) +
        " (fine esclusa).",
    );
    $("calendar-status").textContent = messages.join(" ");
    $("calendar-retry").hidden = !data.calendars.some((calendar) => calendar.status !== "ok");
    warning(stale() || data.calendars.some((calendar) => calendar.status !== "ok"));
  }
  function renderList() {
    const list = $("calendar-agenda");
    list.replaceChildren();
    $("calendar-agenda-title").textContent = chosenDay
      ? "Appuntamenti · " + format(new Date(chosenDay + "T12:00:00Z"), { day: "numeric", month: "long" })
      : "Prossimi appuntamenti";
    $("calendar-upcoming").hidden = !chosenDay;
    const today = M.dateKey(new Date());
    const upcoming = chosenDay
      ? filtered().filter((event) => M.onDay(event, chosenDay))
      : M.upcoming(filtered(), new Date());
    const byDay = new Map();
    upcoming.forEach((event) => {
      const startDay = event.allDay ? event.start : M.dateKey(new Date(event.start));
      const endDay = event.allDay ? addDays(event.end, -1) : M.dateKey(new Date(Date.parse(event.end) - 1));
      const firstDay = chosenDay ? chosenDay : startDay < today ? today : startDay;
      const lastDay = chosenDay ? chosenDay : endDay;
      for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
        if (!M.onDay(event, day)) continue;
        const calendar = data.calendars.find((item) => item.id === event.calendar);
        const entry = { event, calendar, continuesBefore: day > startDay, continuesAfter: day < endDay };
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(entry);
      }
    });
    const days = [...byDay.keys()].sort();
    const visibleDays = chosenDay || showAllUpcoming ? days : days.slice(0, 5);
    const moreButton = $("calendar-more");
    moreButton.hidden = Boolean(chosenDay) || days.length <= 5;
    moreButton.textContent = showAllUpcoming ? "Mostra meno" : "Mostra tutti gli appuntamenti";
    moreButton.setAttribute("aria-expanded", String(showAllUpcoming));
    if (!days.length) {
      const failed = data.calendars.some((calendar) => selected.has(calendar.id) && calendar.status !== "ok");
      list.append(
        element(
          "p",
          !selected.size
            ? "Seleziona almeno un calendario."
            : failed
              ? "Eventi non disponibili. Dettagli in ⓘ."
              : chosenDay
                ? "Nessun appuntamento in questo giorno."
                : "Nessun prossimo appuntamento nel periodo sincronizzato.",
        ),
      );
    }
    visibleDays.forEach((day) => {
      const entries = byDay.get(day);
      const group = element("section", undefined, "agenda-day");
      const date = new Date(day + "T12:00:00Z");
      const label = element("h4", format(date, { weekday: "long", day: "numeric" }), "agenda-day-label");
      label.append(element("span", entries.length + (entries.length === 1 ? " appuntamento" : " appuntamenti")));
      const timeline = element("div", undefined, "agenda-day-events calendar-" + entries[0].calendar.color);
      if (entries.some((entry) => entry.continuesBefore)) group.classList.add("has-continuation-before");
      if (entries.some((entry) => entry.continuesAfter)) group.classList.add("has-continuation-after");
      entries.forEach(({ event, calendar, starts, ends, continuesBefore, continuesAfter }) => {
        const card = element("article", undefined, "agenda-event calendar-" + calendar.color);
        const badge = element("span", calendar.name, "event-source");
        const time = element("time");
        time.dateTime = event.start;
        const multiDay = continuesBefore || continuesAfter;
        if (event.allDay) {
          time.textContent = multiDay
            ? (continuesBefore ? "Continua da ieri" : "Tutto il giorno") +
              (continuesAfter ? " · Continua domani" : " · Termina oggi")
            : "Tutto il giorno";
        } else if (continuesBefore) {
          time.textContent =
            "Continua da ieri · Termina alle " + format(new Date(event.end), { hour: "2-digit", minute: "2-digit" });
        } else if (continuesAfter) {
          time.textContent =
            "Inizia alle " +
            format(new Date(event.start), { hour: "2-digit", minute: "2-digit" }) +
            " · Continua domani";
        } else {
          time.textContent =
            format(new Date(event.start), { hour: "2-digit", minute: "2-digit" }) +
            " – " +
            format(new Date(event.end), { hour: "2-digit", minute: "2-digit" });
        }
        const title = continuesBefore ? "↳ " + event.title : event.title;
        card.append(badge, element("h5", title), time);
        if (event.location) card.append(element("p", event.location));
        timeline.append(card);
      });
      group.append(label, timeline);
      list.append(group);
    });
  }
  function renderMonth(focusDay) {
    $("calendar-month").textContent = format(month, { month: "long", year: "numeric" });
    const grid = $("calendar-days");
    grid.replaceChildren();
    const year = month.getUTCFullYear(),
      index = month.getUTCMonth();
    const first = new Date(Date.UTC(year, index, 1, 12));
    const offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const events = filtered();
    for (let i = 0; i < offset; i++) grid.append(element("span", "", "calendar-spacer"));
    for (let day = 1; day <= days; day++) {
      const date = new Date(Date.UTC(year, index, day, 12));
      const key = M.dateKey(date);
      const matches = events
        .filter((event) => M.onDay(event, key))
        .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "it"));
      const column = (offset + day - 1) % 7;
      const button = element("button", undefined, "calendar-day");
      button.type = "button";
      button.dataset.day = key;
      button.append(element("span", String(day)));
      const markers = element("span", undefined, "day-markers");
      matches.slice(0, 6).forEach((event, markerIndex) => {
        const calendar = data.calendars.find((item) => item.id === event.calendar);
        const previousDay = addDays(key, -1);
        const followingDay = addDays(key, 1);
        const classes = ["day-marker", "calendar-" + calendar.color];
        if (column > 0 && M.onDay(event, previousDay)) classes.push("is-continuation");
        if (column < 6 && M.onDay(event, followingDay)) classes.push("is-continuing");
        const dot = element("i", undefined, classes.join(" "));
        dot.style.setProperty("--marker-column", (markerIndex % 3) + 1);
        dot.style.setProperty("--marker-row", Math.floor(markerIndex / 3) + 1);
        dot.setAttribute("aria-hidden", "true");
        markers.append(dot);
      });
      button.append(markers);
      if (matches.length > 6) button.append(element("span", "+" + (matches.length - 6), "day-event-overflow"));
      const titles = matches.length ? ": " + matches.map((event) => event.title).join("; ") : "";
      button.setAttribute(
        "aria-label",
        format(date, { dateStyle: "full" }) + ": " + matches.length + " appuntamenti" + titles,
      );
      button.setAttribute("aria-pressed", String(chosenDay === key));
      if (key === M.dateKey(new Date())) button.setAttribute("aria-current", "date");
      button.onclick = () => {
        chosenDay = key;
        showAllUpcoming = false;
        renderMonth(key);
        renderList();
      };
      grid.append(button);
    }
    const rangeStart = M.dateKey(new Date(data.rangeStart)).slice(0, 7);
    const rangeEnd = M.dateKey(new Date(data.rangeEnd)).slice(0, 7);
    $("calendar-prev").disabled = M.dateKey(month).slice(0, 7) <= rangeStart;
    const following = new Date(Date.UTC(year, index + 1, 1, 12));
    $("calendar-next").disabled = M.dateKey(following).slice(0, 7) >= rangeEnd;
    if (focusDay) grid.querySelector('[data-day="' + focusDay + '"]')?.focus();
  }
  function refresh() {
    renderMonth();
    renderList();
    $("calendar-selection").textContent = selected.size + " calendari selezionati su " + data.calendars.length + ".";
  }
  function renderFilters() {
    $("calendar-filters").replaceChildren();
    $("calendar-links").replaceChildren();
    data.calendars.forEach((calendar) => {
      const unavailable = calendar.status !== "ok" || stale();
      const label = element(
        "label",
        undefined,
        "calendar-filter calendar-" + calendar.color + (unavailable ? " is-unavailable" : ""),
      );
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected.has(calendar.id);
      input.setAttribute("aria-label", calendar.name + (unavailable ? " · dati non aggiornati o non disponibili" : ""));
      label.title = calendar.name + (unavailable ? " · dati non aggiornati o non disponibili" : "");
      input.onchange = () => {
        if (input.checked) selected.add(calendar.id);
        else selected.delete(calendar.id);
        refresh();
      };
      const shortNames = { gruppo: "Canicattini 1", eg: "E/G", lc: "L/C", rs: "R/S", zona: "Zona" };
      label.append(input, element("span", shortNames[calendar.id] || calendar.name, "calendar-filter-name"));
      if (unavailable) {
        const mark = element("span", "!", "calendar-filter-warning");
        mark.setAttribute("aria-hidden", "true");
        label.append(mark);
      }
      $("calendar-filters").append(label);
      const li = element("li");
      const link = element("a", "Apri " + calendar.name + " ↗");
      if (
        typeof calendar.url !== "string" ||
        !/^https:\/\/(calendar\.google\.com|outlook\.office365\.com)\//.test(calendar.url)
      ) {
        throw new Error("Collegamento calendario non valido");
      }
      link.href = calendar.url;
      link.target = "_blank";
      link.rel = "noopener";
      li.append(link);
      $("calendar-links").append(li);
    });
  }
  async function load() {
    const controls = ["calendar-prev", "calendar-next", "calendar-today", "calendar-upcoming", "calendar-more"];
    controls.forEach((id) => {
      $(id).disabled = true;
    });
    $("calendar-all").disabled = true;
    $("calendar-retry").hidden = true;
    $("calendar-status").textContent = "Caricamento degli appuntamenti…";
    $("calendar-app").hidden = !data;
    const agenda = $("calendar-agenda");
    agenda.setAttribute("aria-busy", "true");
    if (!data) {
      $("calendar-app").hidden = false;
      agenda.replaceChildren();
      for (let index = 0; index < 3; index++) {
        const placeholder = element("div", undefined, "loading-skeleton");
        placeholder.setAttribute("aria-hidden", "true");
        agenda.append(placeholder);
      }
    }
    try {
      const response = await fetch("calendars/events.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Calendari non disponibili (HTTP " + response.status + ")");
      data = M.validate(await response.json());
      selected = new Set(data.calendars.map((calendar) => calendar.id));
      renderFilters();
      renderStatus();
      refresh();
      renderAssembly();
      renderPreparatory();
      $("calendar-app").hidden = false;
      $("calendar-all").disabled = false;
    } catch (error) {
      if (!data) $("calendar-app").hidden = true;
      $("calendar-status").textContent = error.message + ". Riprova oppure usa il calendario Outlook.";
      $("calendar-retry").hidden = false;
      warning(true);
      if ($("stato")) {
        $("stato").hidden = true;
        $("stato").replaceChildren();
      }
      renderPreparatory();
      console.error("Caricamento calendari", error);
    } finally {
      agenda.setAttribute("aria-busy", "false");
      controls.forEach((id) => {
        $(id).disabled = !data;
      });
    }
  }
  $("calendar-retry").onclick = load;
  $("calendar-all").onclick = () => {
    selected = new Set(data.calendars.map((calendar) => calendar.id));
    renderFilters();
    refresh();
  };
  $("calendar-prev").onclick = () => {
    month.setUTCMonth(month.getUTCMonth() - 1);
    chosenDay = null;
    refresh();
  };
  $("calendar-next").onclick = () => {
    month.setUTCMonth(month.getUTCMonth() + 1);
    chosenDay = null;
    refresh();
  };
  $("calendar-today").onclick = () => {
    month = new Date(M.dateKey(new Date()).slice(0, 7) + "-01T12:00:00Z");
    chosenDay = null;
    refresh();
  };
  $("calendar-upcoming").onclick = () => {
    chosenDay = null;
    showAllUpcoming = false;
    refresh();
  };
  $("calendar-more").onclick = () => {
    showAllUpcoming = !showAllUpcoming;
    renderList();
  };
  load();
})();
