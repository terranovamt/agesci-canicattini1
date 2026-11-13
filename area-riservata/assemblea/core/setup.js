/* Setup NAS: modifica e pubblica i contenuti di base tramite il server. */
(function () {
  if (!window.ACCESSO.verificata()) {
    location.replace("../");
    return;
  }
  const $ = (s) => document.querySelector(s);
  const M = window.MODIFICHE;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const numericGroup = (v) => plain(v) && Object.values(v).some(x => typeof x === "number") &&
    Object.values(v).every(x => typeof x === "number" || x === null || plain(x));
  const getAt = (o, p) => p.reduce((x, k) => (x == null ? undefined : x[k]), o);
  const arrayKey = (path) => JSON.stringify(path.map((part) => typeof part === "number" ? "*" : part));
  const setAt = (o, p, v) => {
    const t = getAt(o, p.slice(0, -1));
    if (v === undefined) {
      if (Array.isArray(t)) t.splice(p.at(-1), 1);
      else delete t[p.at(-1)];
    } else t[p.at(-1)] = v;
  };
  const strip = (s) =>
    String(s || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids.filter((k) => k != null));
    return e;
  };
  const icon = (d) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  };
  const icons = {
    eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    eyeOff:
      "m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a14 14 0 0 1-3.1 3.7M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 3.1-.5",
    chevronRight: "m9 18 6-6-6-6",
    chevronDown: "m6 9 6 6 6-6",
    up: "M12 19V5m-7 7 7-7 7 7",
    down: "M12 5v14m7-7-7 7-7-7",
    edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z",
    trash: "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v5m4-5v5",
    reset: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5",
  };

  let base,
    published,
    edit,
    view = "generale",
    saving = false,
    jsonPending = false,
    jsonBase;
  const open = new Set(["assemblea"]);
  const collapsed = new WeakSet();
  const arraySchemas = new Map();

  function toast(msg) {
    document.querySelectorAll(".toast").forEach((x) => x.remove());
    const t = el("div", { className: "toast", textContent: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 2600);
  }
  function status(text, cls) {
    const s = $("#stato");
    s.textContent = text;
    s.className = "pill " + (cls || "");
  }

  /* carica dati.js "pulito", senza modifiche live */
  function script(src) {
    return new Promise((res, reject) => {
      const s = el("script", { src: src + "?t=" + Date.now() });
      s.onload = () => {
        s.remove();
        res();
      };
      s.onerror = () => {
        s.remove();
        reject(new Error("Impossibile caricare dati.js"));
      };
      document.head.append(s);
    });
  }
  async function loadBase() {
    window.DATI = undefined;
    await script("dati.js");
    if (!window.DATI) throw new Error("dati.js non trovato o con errori");
    return clone(window.DATI);
  }
  const dirty = () => !same(edit, published);
  const unsaved = () => dirty() || jsonPending;

  function refreshJson() {
    if (jsonPending) return;
    $("#json-text").value = JSON.stringify(edit, null, 2);
    jsonBase = clone(edit);
  }

  function discardJson() {
    jsonPending = false;
    $("#json-err").textContent = "";
    refreshJson();
    updateDirty();
  }

  function sync(newBase, snapshot) {
    const pending = snapshot ? M.diffPatch(snapshot, edit) : undefined;
    base = newBase;
    // dati.js sul NAS creati prima del voto online non hanno la sezione
    if (!base.votazioni) base.votazioni = { abilitate: false };
    published = clone(base);
    edit = M.applyPatch(clone(base), pending);
    arraySchemas.clear();
    render();
    status("dati.js caricato", "ok");
  }

  /* ---------- campi ---------- */
  function field(path, value, label) {
    const b = getAt(base, path);
    const wrap = el("div", { className: "field" });
    const lab = el("label", { textContent: label });
    let input;
    const commit = (v) => {
      setAt(edit, path, v);
      mark();
      updateDirty();
    };
    const mark = () => wrap.classList.toggle("mod", !same(getAt(edit, path), b));
    if (typeof value === "boolean") {
      wrap.classList.add("chk");
      input = el("input", { type: "checkbox", checked: value });
      input.onchange = () => commit(!input.checked && b === undefined ? undefined : input.checked);
    } else if (typeof value === "number") {
      const key = String(path.at(-1));
      const step = /importo|avanzo|saldo/i.test(key) || !Number.isInteger(value) ? "0.01" : "1";
      input = el("input", { type: "number", step, inputMode: step === "1" ? "numeric" : "decimal", value: String(value) });
      input.oninput = () => {
        if (input.value !== "" && !isNaN(+input.value)) commit(+input.value);
      };
    } else if (String(path.at(-1)) === "modalita") {
      input = el("select", {});
      [["scelta", "Scelta singola (favorevole / contrario / astenuto)"], ["nominativa", "Nominativa (candidati)"]].forEach(([v, t]) =>
        input.append(el("option", { value: v, textContent: t })));
      input.value = value;
      input.onchange = () => {
        commit(input.value);
        const sib = getAt(edit, path.slice(0, -1)) || {};
        const fisse = ["Favorevole", "Contrario", "Astenuto"];
        if (input.value === "scelta") setAt(edit, path.slice(0, -1).concat("opzioni"), fisse);
        else if (!Array.isArray(sib.opzioni) || same(sib.opzioni, fisse)) setAt(edit, path.slice(0, -1).concat("opzioni"), ["Candidato 1", "Candidato 2"]);
        render();
      };
    } else {
      const key = String(path.at(-1));
      const parentKey = String(path.at(-2) ?? "");
      const type = key === "data_ora" ? "datetime-local"
        : /(?:^|_)orario$|^prima_convocazione$|^seconda_convocazione$/.test(key) ? "time"
          : "";
      const long = !type && (String(value ?? "").length > 70 || /\n/.test(value) ||
        /^(?:testo|nota|descrizione|regola|citazione|paragrafi|sottopunti|percorso)$/.test(key) ||
        /^(?:paragrafi|sottopunti)$/.test(parentKey));
      input = el(long ? "textarea" : "input", { ...(type ? { type } : {}), value: value ?? "" });
      if (long) input.rows = Math.min(8, Math.max(3, Math.ceil(String(value).length / 60) + 1));
      input.oninput = () => commit(input.value);
    }
    const id = "f" + path.join("_").replace(/[^\w-]/g, "");
    input.id = lab.htmlFor = id;
    input.setAttribute("aria-label", label);
    const reset = el(
      "button",
      { className: "reset", type: "button", title: "Ripristina il valore pubblicato" },
      icon(icons.reset),
    );
    reset.setAttribute("aria-label", "Ripristina il valore pubblicato");
    reset.onclick = () => {
      if (b === undefined) {
        setAt(edit, path, undefined);
        render();
      } else {
        commit(clone(b));
        if (input.type === "checkbox") input.checked = b;
        else input.value = b;
      }
    };
    if (input.type === "checkbox") wrap.append(input, lab, reset);
    else wrap.append(lab, input, reset);
    mark();
    return wrap;
  }
  const LABELS = {
    anno_esercizio: "Anno di esercizio",
    anno_scout: "Anno scout",
    assemblea: "Assemblea",
    votazioni: "Votazioni dalle slide",
    abilitate: "Abilita il voto online",
    domanda: "Quesito",
    modalita: "Tipo (scelta o nominativa)",
    opzioni: "Opzioni / candidati",
    mostra_live: "Mostra i conteggi in diretta (favorevoli, contrari, astenuti)",
    titolo: "Titolo",
    titolo_barra: "Titolo nella barra",
    sottotitolo: "Sottotitolo",
    data: "Data",
    data_ora: "Data e ora",
    prima_convocazione: "Orario prima convocazione",
    seconda_convocazione: "Orario seconda convocazione",
    luogo: "Luogo",
    nome: "Nome",
    ruolo: "Ruolo",
    nota: "Nota",
    nota_generale: "Nota generale",
    testo: "Testo",
    descrizione: "Descrizione",
    importo: "Importo",
    importo_anno_corrente: "Importo anno corrente",
    importo_anno_precedente: "Importo anno precedente",
    riferimento_articolo: "Articolo di riferimento",
    slide_collegata: "Collegamento alla slide",
    completati: "Punti completati",
    nascosta: "Nascosta",
  };
  const human = (k) => LABELS[k] || String(k).replace(/_/g, " ");

  function votoSwitch(path, value) {
    const b = getAt(base, path);
    const box = el("div", { className: "voto-sw" });
    const input = el("input", { type: "checkbox", checked: value, id: "voto-online" });
    const lab = el("label", { htmlFor: "voto-online" }, el("span", { className: "tr" }),
      el("span", { className: "tx" }, el("b", { textContent: "Abilita voto online" }), el("small", {})));
    const state = () => {
      const on = input.checked;
      box.classList.toggle("on", on);
      lab.querySelector("small").textContent = on
        ? "Attivo: le slide Votazione permettono ai soci di votare con il codice personale."
        : "Disattivato: le slide Votazione restano normali divisori di sezione.";
      box.classList.toggle("mod", on !== !!b);
    };
    input.onchange = () => {
      setAt(edit, path, !input.checked && b === undefined ? undefined : input.checked);
      state();
      updateDirty();
    };
    box.append(input, lab);
    state();
    return box;
  }
  function node(path, value, label) {
    if (path.length === 1 && path[0] === "votazioni" && value && typeof value === "object")
      return votoSwitch(path.concat("abilitate"), !!value.abilitate);
    if (Array.isArray(value)) {
      if ((path.length === 1 && ["entrate", "uscite"].includes(path[0])) ||
          (path[0] === "patrimonio" && path[1] === "voci"))
        return financialList(path, value);
      const fs = el("fieldset", {}, el("legend", { textContent: label + " (" + value.length + ")" }));
      if (value.every(item => typeof item === "number")) fs.classList.add("number-list");
      const key = arrayKey(path);
      if (value.length) arraySchemas.set(key, clone(value.at(-1)));
      value.forEach((item, i) => {
        const childLabel = typeof item === "object" && item !== null ? "#" + (i + 1) : label + " " + (i + 1);
        const child = node(path.concat(i), item, childLabel);
        const rm = el("button", {
          type: "button",
          className: "sec remove",
          title: "Rimuovi elemento " + (i + 1),
          textContent: "Rimuovi",
        });
        rm.setAttribute("aria-label", "Rimuovi elemento " + (i + 1) + " da " + label);
        rm.onclick = () => {
          setAt(edit, path.concat(i), undefined);
          render();
        };
        if (child.tagName === "FIELDSET") child.querySelector("legend").append(rm);
        else child.append(rm);
        fs.append(child);
      });
      const add = el("button", { type: "button", className: "sec add", textContent: "+ Aggiungi elemento" });
      add.setAttribute("aria-label", "Aggiungi elemento a " + label);
      add.onclick = () => {
        const template = arraySchemas.get(key) ?? getAt(base, path)?.at(-1) ?? "";
        getAt(edit, path).push(blank(template));
        render();
      };
      fs.append(add);
      return fs;
    }
    if (plain(value)) {
      const fs = el("fieldset", {}, el("legend", { textContent: label }));
      if (numericGroup(value)) fs.classList.add("numeric-fields");
      Object.entries(value).forEach(([k, v]) => fs.append(node(path.concat(k), v, human(k))));
      return fs;
    }
    return field(path, value, label);
  }
  /* nuovo elemento di una lista: stessa struttura dell'ultimo, ma vuoto */
  const blank = (v) =>
    Array.isArray(v)
      ? []
      : plain(v)
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)]))
        : typeof v === "number"
          ? 0
          : typeof v === "boolean"
            ? false
            : "";

  function financialList(path, values) {
    const list = el("div", { className: "financial-list" });
    const fixed = path[0] === "patrimonio";
    const current = fixed ? "importo_anno_corrente" : "importo";
    const key = arrayKey(path);
    if (values.length) arraySchemas.set(key, clone(values.at(-1)));
    values.forEach((item, index) => {
      const rowPath = path.concat(index);
      const row = el("section", { className: "financial-row" });
      const heading = el("div", { className: "financial-row-heading" },
        el("h3", { textContent: strip(item.descrizione || item.nome) || "Nuova voce" }));
      const amounts = el("div", { className: "financial-amounts" },
        field(rowPath.concat(current), item[current], String(edit.anno_esercizio || "Attuale") + " · €"),
        field(rowPath.concat("importo_anno_precedente"), item.importo_anno_precedente, "Anno precedente · €"));
      const description = el("details", { className: "financial-description" },
        el("summary", { textContent: fixed ? "Nome e dettagli" : "Modifica descrizione" }));
      Object.entries(item).filter(([name]) => ![current, "importo_anno_precedente"].includes(name))
        .forEach(([name, value]) => description.append(node(rowPath.concat(name), value, human(name))));
      if (!fixed) {
        const remove = el("button", { type: "button", className: "sec financial-remove", textContent: "Elimina" });
        remove.setAttribute("aria-label", "Elimina " + strip(item.descrizione || "voce " + (index + 1)));
        remove.onclick = () => {
          if (!confirm("Eliminare questa voce dal rendiconto?")) return;
          setAt(edit, rowPath, undefined);
          render();
        };
        description.append(remove);
      }
      row.append(heading, amounts, description);
      list.append(row);
    });
    if (!fixed) {
      const add = el("button", { className: "sec add", type: "button",
        textContent: path[0] === "entrate" ? "+ Aggiungi entrata" : "+ Aggiungi uscita" });
      add.onclick = () => {
        const template = arraySchemas.get(key) || { descrizione: "", importo: 0, importo_anno_precedente: 0 };
        getAt(edit, path).push(blank(template));
        render();
      };
      list.append(add);
    }
    return list;
  }

  function box(id, title, sub, badges, fill) {
    const d = el("section", { className: "form-section" });
    d.dataset.id = id;
    d.append(
      el(
        "h3",
        {},
        el("span", { className: "t", textContent: title }),
        sub ? el("small", { textContent: sub }) : null,
        ...badges,
      ),
    );
    const body = el("div", { className: "body" });
    fill(body);
    d.append(body);
    return d;
  }
  const badge = (t, c) => el("span", { className: "badge " + (c || ""), textContent: t });

  const GENERALE = ["anno_esercizio", "anno_scout", "assemblea", "votazioni"];
  const INTRO = {
    generale: "Data, luogo e orari dell'assemblea.",
    ordine:
      "Aggiungi, modifica, duplica o nascondi le slide. Collassa un divisore per spostare tutta la sezione: trascinala oppure usa i pulsanti Sposta su e Sposta giù.",
    bilancio: "Numeri del rendiconto e del patrimonio: censimenti, entrate, uscite, avanzi e beni.",
    soci: "Soci censiti nell'anno precedente, letti dal Libro soci.",
    json: "Modifica il testo e applicalo alla bozza. Solo «Salva dati base» salva sulla destinazione indicata.",
  };
  const TITOLI = {
    generale: "Informazioni generali",
    ordine: "Slide e sezioni",
    bilancio: "Bilancio del gruppo",
    soci: "Soci censiti",
    json: "Editor JSON",
    guida: "Guida al setup",
    limiti: "Limiti e accorgimenti",
  };
  const tipoOf = (x) =>
    x.tipo === "slide_gruppo_invisibile"
      ? "gruppo invisibile (solo setup)"
      : String(x.tipo || "").replace(/^slide_/, "");
  const titleOf = (x) => strip(x.titolo || x.titolo_barra) || human(tipoOf(x));
  const sezione = (x) => ["slide_divisore_sezione", "slide_votazione", "sezione", "slide_gruppo_invisibile"].includes(x.tipo);
  const modelli = [
    { tipo: "slide_titolo", titolo: "Nuova slide", sottotitolo: "" },
    { tipo: "slide_divisore_sezione", titolo: "Nuova sezione", sottotitolo: "" },
    {
      tipo: "slide_testo_articoli",
      titolo_barra: "Nuovo testo",
      articoli: [{ titolo: "Titolo", paragrafi: ["Testo"] }],
    },
    { tipo: "slide_gruppo_invisibile", titolo: "Nuovo gruppo" },
    {
      tipo: "slide_qr_live",
      titolo: "Scansiona il QR code",
      sottotitolo: "",
      data_ora: "2026-11-20T20:30:00",
      immagine: "../../assets/img/qr-live.png",
    },
    { tipo: "slide_ordine_del_giorno", punti: [{ testo: "Nuovo punto", slide_collegata: "" }] },
    { tipo: "slide_avanzamento_odg", completati: 0 },
    {
      tipo: "slide_quorum_convocazioni",
      convocazioni: [
        {
          nome: "Prima convocazione",
          orario: "20:30",
          regola: "50% + 1 degli aventi diritto",
          riferimento_articolo: "",
        },
        {
          nome: "Seconda convocazione",
          orario: "21:00",
          regola: "Qualsiasi numero di presenti",
          riferimento_articolo: "",
        },
      ],
    },
    {
      tipo: "slide_composizione_organo",
      persone: [{ ruolo: "Presidente", icona: "🎙️", nome: "Nome", nota: "" }],
      nota_generale: "",
    },
    {
      tipo: "slide_modifiche_documento",
      titolo: "Modifiche",
      prima: "Testo attuale",
      dopo: "Testo proposto",
      nota: "",
      etichetta_prima: "PRIMA",
      etichetta_dopo: "DOPO",
    },
    { tipo: "slide_prima_dopo", titolo_barra: "Prima e dopo", prima: "Testo attuale", dopo: "Testo proposto" },
    {
      tipo: "slide_cambio_date",
      prima: "Data attuale",
      dopo: "Data proposta",
      pannello: { etichetta: "", titolo: "Nuovo periodo", testo: "" },
    },
    {
      tipo: "slide_area_obiettivi",
      numero: "1",
      titolo: "Nuova area",
      citazione: "",
      autore: "",
      colore: "var(--v)",
      obiettivi: [{ titolo: "Nuovo obiettivo", percorso: "Percorso educativo" }],
      punti: ["Nuovo punto"],
    },
    {
      tipo: "slide_differenze",
      colonne: [{ titolo: "Titolo", sottotitolo: "", colore: "var(--v)", simbolo: "●", voci: ["Nuova voce"] }],
      nota: { etichetta: "Nota", testo: "" },
    },
    ...[
      "rendiconto_entrate_uscite",
      "rendiconto_scontrino_esito",
      "rendiconto_andamento_avanzo",
      "patrimonio_barre",
      "patrimonio_ciambella",
      "foto_gruppo",
    ].map((t) => ({ tipo: "slide_" + t })),
    { tipo: "slide_chiusura", titolo: "Assemblea conclusa", sottotitolo: "" },
    { tipo: "slide_grazie", testo: "Grazie" },
    {
      tipo: "slide_votazione",
      titolo: "Votazione",
      domanda: "Quesito",
      modalita: "scelta",
      opzioni: ["Favorevole", "Contrario", "Astenuto"],
      mostra_live: true,
    },
  ];
  const modelliDisponibili = () => {
    const out = modelli.map(clone);
    [...(base.slide || []), ...edit.slide].forEach((s) => {
      if (!out.some((m) => m.tipo === s.tipo)) out.push(clone(s));
    });
    return out;
  };
  let slideEditor = null;
  function modificaSlide(slide) {
    slideEditor = slide;
    renderEditor();
    $("#slide-editor").showModal();
  }
  function renderEditor() {
    const i = edit.slide.indexOf(slideEditor);
    if (i < 0) return;
    const x = slideEditor,
      p = ["slide", i],
      c = $("#slide-editor-campi");
    c.innerHTML = "";
    $("#slide-editor-titolo").textContent = "Modifica slide " + (i + 1);
    const select = el("select", { id: "slide-editor-tipo", ariaLabel: "Tipo di slide" });
    modelliDisponibili().forEach((m) => select.append(el("option", { value: m.tipo, textContent: human(tipoOf(m)) })));
    select.value = x.tipo;
    select.onchange = () => {
      const tipo = select.value;
      if (tipo === x.tipo) return;
      if (!confirm("Cambiare tipo di slide? I campi specifici attuali saranno sostituiti con quelli del nuovo tipo.")) {
        select.value = x.tipo;
        return;
      }
      const modello = clone(modelliDisponibili().find((m) => m.tipo === tipo));
      for (const k of ["id", "nascosta", "titolo_barra"]) if (k in x) modello[k] = x[k];
      collapsed.delete(x);
      edit.slide[i] = modello;
      slideEditor = modello;
      renderEditor();
      updateDirty();
    };
    c.append(el("label", { htmlFor: select.id, textContent: "Tipo di slide" }), select);
    if (x.tipo === "slide_gruppo_invisibile")
      c.append(
        el("p", {
          className: "hint",
          textContent:
            "Raggruppa le slide nel setup, senza comparire nella presentazione o nel PDF. Le slide contenute restano visibili.",
        }),
      );
    else c.append(field(p.concat("nascosta"), !!x.nascosta, "Nascosta (salta questa slide)"));
    const nom = x.tipo === "slide_votazione" && x.modalita === "nominativa";
    const fields = Object.keys(x).filter((k) => k !== "tipo" && k !== "nascosta" &&
      !(x.tipo === "slide_votazione" && (nom ? k === "mostra_live" : k === "opzioni")));
    if (!fields.length)
      c.append(
        el("p", {
          className: "hint",
          textContent: /rendiconto|patrimonio/.test(x.tipo)
            ? "I numeri sono nella scheda Bilancio."
            : "Questo tipo non richiede altri campi.",
        }),
      );
    fields.forEach((k) => c.append(node(p.concat(k), x[k], human(k))));
  }
  const sectionEnd = (i) => {
    let end = i + 1;
    while (end < edit.slide.length && !sezione(edit.slide[end])) end++;
    return end;
  };
  const blockEnd = (i) => (sezione(edit.slide[i]) && collapsed.has(edit.slide[i]) ? sectionEnd(i) : i + 1);
  const visibleSlides = () => {
    const out = [];
    for (let i = 0; i < edit.slide.length; i = blockEnd(i)) out.push(i);
    return out;
  };

  /* posizione originale (in dati.js) di ogni slide, per segnalare quelle spostate */
  function origins() {
    const used = new Set(),
      bs = (base.slide || []).map((x) => JSON.stringify(x));
    const find = (x, i) => {
      const j = bs.findIndex((y, k) => !used.has(k) && y === JSON.stringify(x));
      if (j >= 0) {
        used.add(j);
        return j;
      }
      return -1;
    };
    return edit.slide.map(find);
  }
  function move(from, to) {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      from >= edit.slide.length ||
      to < 0 ||
      to >= edit.slide.length
    )
      return;
    const end = blockEnd(from),
      targetEnd = blockEnd(to);
    if (to >= from && to < end) return;
    const items = edit.slide.splice(from, end - from);
    const dest = to < from ? to : targetEnd - items.length;
    edit.slide.splice(dest, 0, ...items);
    [...open].filter((k) => k.startsWith("slide-")).forEach((k) => open.delete(k));
    render();
    const r = document.querySelector(`.ord li[data-i="${dest}"]`);
    if (r) {
      r.classList.add("flash");
      r.scrollIntoView({ block: "nearest" });
    }
  }

  function renderOrdine(c) {
    const org = origins(),
      ol = el("ol", { className: "ord" });
    const tipi = modelliDisponibili(),
      templates = [...tipi, ...edit.slide];
    const select = el("select", { id: "nuova-slide-modello", ariaLabel: "Modello nuova slide" });
    templates.forEach((s, i) =>
      select.append(
        el("option", {
          value: String(i),
          textContent: i < tipi.length ? human(tipoOf(s)) : "Copia slide " + (i - tipi.length + 1) + ": " + titleOf(s),
        }),
      ),
    );
    select.value = "0";
    const add = el("button", { type: "button", textContent: "+ Aggiungi slide" });
    add.onclick = () => {
      const slide = clone(templates[Number(select.value)]);
      delete slide.id;
      delete slide.nascosta;
      edit.slide.push(slide);
      render();
      modificaSlide(slide);
    };
    c.append(el("div", { className: "slide-add" }, select, add));
    const visible = visibleSlides();
    let drag = -1;
    visible.forEach((i, row) => {
      const x = edit.slide[i],
        closed = collapsed.has(x);
      const hid = !!x.nascosta,
        moved = org[i] !== i && org[i] >= 0;
      const btn = (glyph, title, fn, dis) => {
        const b = el("button", { type: "button", className: "ic", title, disabled: !!dis }, icon(icons[glyph]));
        if (glyph === "edit") {
          b.className += " slide-edit";
          b.append(el("span", { textContent: "Modifica" }));
        }
        if (glyph === "trash") b.className += " slide-delete";
        b.setAttribute("aria-label", title);
        b.onclick = fn;
        return b;
      };
      const li = el(
        "li",
        { className: (sezione(x) ? "sez " : "") + (hid ? "hid " : ""), draggable: true },
        el("span", { className: "grip", textContent: "⋮⋮", title: "Trascina" }),
        el("span", { className: "num", textContent: i + 1 }),
        sezione(x)
          ? btn(closed ? "chevronRight" : "chevronDown", closed ? "Espandi sezione" : "Collassa sezione", () => {
              closed ? collapsed.delete(x) : collapsed.add(x);
              render();
            })
          : null,
        el("span", { className: "t" }, el("b", { textContent: titleOf(x) }), el("small", { textContent: tipoOf(x) })),
        sezione(x) && closed ? badge(sectionEnd(i) - i - 1 + " slide nella sezione") : null,
        moved ? badge("spostata") : null,
        org[i] < 0 ? badge("modificata") : null,
        x.tipo === "slide_gruppo_invisibile"
          ? badge("Solo setup")
          : btn(hid ? "eyeOff" : "eye", hid ? "Nascosta: clic per mostrarla" : "Visibile: clic per nasconderla", () => {
              if (hid && getAt(base, ["slide", i, "nascosta"]) === undefined) delete x.nascosta;
              else x.nascosta = !hid;
              render();
            }),
        btn("up", closed ? "Sposta sezione su" : "Sposta su", () => move(i, visible[row - 1]), row === 0),
        btn(
          "down",
          closed ? "Sposta sezione giù" : "Sposta giù",
          () => move(i, visible[row + 1]),
          row === visible.length - 1,
        ),
        btn("edit", "Modifica i contenuti", () => modificaSlide(x)),
        btn(
          "trash",
          "Elimina solo questa slide",
          () => {
            if (!confirm('Eliminare la slide "' + titleOf(x) + '"? Le altre slide della sezione restano.')) return;
            edit.slide.splice(i, 1);
            [...open].filter((k) => k.startsWith("slide-")).forEach((k) => open.delete(k));
            render();
          },
          edit.slide.length <= 1,
        ),
      );
      li.dataset.i = i;
      li.ondragstart = (e) => {
        drag = i;
        li.classList.add("drag");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", i);
      };
      li.ondragend = () => li.classList.remove("drag");
      li.ondragover = (e) => {
        e.preventDefault();
        ol.querySelectorAll(".over").forEach((o) => o.classList.remove("over"));
        li.classList.add("over");
      };
      li.ondrop = (e) => {
        e.preventDefault();
        if (drag >= 0) move(drag, i);
        drag = -1;
      };
      ol.append(li);
    });
    c.append(ol);
  }

  /* aventi diritto di voto: soci censiti nell'anno precedente, dal Libro soci (sola lettura) */
  let soci = null,
    sociError = "",
    sociYear = "",
    sociQuery = "",
    sociBranch = "";
  async function loadSoci() {
    try {
      const r = await fetch((window.LIVE.basePath || "") + "/api/members", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Accedi come amministratore per leggere il Libro soci." : "Libro soci non disponibile.");
      soci = await r.json();
    } catch (e) {
      sociError = e.message;
      soci = { members: [] };
    }
    if (view === "soci") render();
  }
  // per i ragazzi il contatto è il primo responsabile con telefono o email
  const contactOf = (p) => {
    if (p.phone || p.email) return p;
    const g = (p.guardianContacts || []).find((x) => x.phone || x.email) || {};
    return { ...p, phone: g.phone, email: g.email };
  };
  function renderSoci(c) {
    if (!soci) {
      c.append(el("p", { className: "empty-state", textContent: "Caricamento del Libro soci…" }));
      loadSoci();
      return;
    }
    if (sociError) return c.append(el("p", { className: "empty-state", textContent: sociError }));
    const years = [...new Set(soci.members.flatMap((m) => m.censuses.map((x) => String(x.year))))].sort().reverse();
    if (!years.length) return c.append(el("p", { className: "empty-state", textContent: "Nessun censimento nel Libro soci." }));
    // anno precedente a quello del censimento più recente, se presente
    if (!years.includes(sociYear)) sociYear = years.find((y) => y < String(soci.currentYear)) || years[0];
    // stessa regola del Libro soci (soci-model.js longSuspended): codice D, o S in un anno precedente
    const sospeso = (m) => {
      const last = m.censuses[0];
      return !!last && (last.statusCode === "D" || (last.statusCode === "S" && Number(last.year) < Number(soci.currentYear)));
    };
    const all = soci.members
      .filter((m) => !sospeso(m))
      .map((m) => ({ name: m.name, code: m.code, profile: contactOf(m.profile || {}), census: m.censuses.find((x) => String(x.year) === sociYear) }))
      .filter((m) => m.census)
      .map((m) => ({ ...m, branch: m.census.branch || "Adulti" }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
    const branches = [...new Set(all.map((m) => m.branch))].sort();
    if (!branches.includes(sociBranch)) sociBranch = "";
    const branchLabel = (branch) => branch === "Adulti" ? "CO.CA." : branch;
    const list = el("div", { className: "soci-list" });
    let shown = [];
    const fill = () => {
      list.innerHTML = "";
      const q = sociQuery.trim().toLowerCase();
      shown = all.filter((m) => (!sociBranch || m.branch === sociBranch) && (!q || (m.name + " " + m.code + " " + (m.profile.email || "")).toLowerCase().includes(q)));
      count.textContent = shown.length + " di " + all.length + " soci";
      const columns = ["Nome", "Cognome", "Codice", "Branca", "Contatto", "Email"];
      const table = el("table", { className: "soci-table" },
        el("thead", {}, el("tr", {}, ...columns.map((h) => el("th", { textContent: h })))));
      table.append(el("tbody", {}, ...shown.map((m) => {
        const row = el("tr");
        [m.profile.givenName || m.name, m.profile.surname || "", m.code, branchLabel(m.branch),
          m.profile.phone || "", m.profile.email || ""].forEach((value, index) => {
          const cell = el("td", { textContent: value });
          cell.dataset.label = columns[index];
          row.append(cell);
        });
        return row;
      })));
      list.append(shown.length ? table : el("p", { className: "empty-state", textContent: "Nessun socio trovato." }));
    };
    const count = el("strong", { className: "soci-count" });
    const yearSel = el("select", { ariaLabel: "Anno di iscrizione" }, ...years.map((y) => el("option", { value: y, textContent: "Iscritti " + y, selected: y === sociYear })));
    yearSel.onchange = () => { sociYear = yearSel.value; render(); };
    const branchSel = el("select", { ariaLabel: "Branca" }, el("option", { value: "", textContent: "Tutte le branche" }),
      ...branches.map((b) => el("option", { value: b, textContent: branchLabel(b) + " (" + all.filter((m) => m.branch === b).length + ")", selected: b === sociBranch })));
    branchSel.onchange = () => { sociBranch = branchSel.value; render(); };
    const search = el("input", { type: "search", placeholder: "Cerca nome, codice o email", value: sociQuery, ariaLabel: "Cerca socio" });
    search.oninput = () => { sociQuery = search.value; fill(); };
    const pdf = el("button", { type: "button", className: "btn", textContent: "Scarica PDF codici di voto" });
    const rigenera = el("button", { type: "button", className: "btn sec", textContent: "Rigenera codici" });
    const scarica = async (nuovi) => {
      const codiciVisibili = new Set(shown.map((m) => m.code));
      if (!codiciVisibili.size) {
        status("Nessun censito visibile da esportare.", "ko");
        return;
      }
      pdf.disabled = rigenera.disabled = true;
      try {
        const r = await fetch((window.LIVE.basePath || "") + "/api/vote/codes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anno: sociYear, codici: [...codiciVisibili], ...(nuovi ? { rigenera: true } : {}) }),
        });
        if (!r.ok) throw new Error((await r.text()) || "Errore " + r.status);
        const { righe } = await r.json();
        const righeVisibili = righe.filter((riga) => codiciVisibili.has(riga.codice));
        const a = el("a", { href: URL.createObjectURL(window.PDF_CODICI.crea("Codici di voto - Censiti " + sociYear, righeVisibili)), download: "codici-voto-" + sociYear + ".pdf" });
        a.click();
        URL.revokeObjectURL(a.href);
        status(nuovi ? "Codici rigenerati: PDF scaricato, i vecchi codici non valgono più" : "PDF dei codici di voto scaricato", "ok");
      } catch (e) {
        status(e.message, "ko");
      } finally {
        pdf.disabled = rigenera.disabled = false;
      }
    };
    pdf.onclick = () => scarica(false);
    rigenera.onclick = () => shown.length > 0 && confirm("Rigenerare TUTTI i codici di voto? I codici già stampati o distribuiti non varranno più e dovrai ristampare il PDF.") && scarica(true);
    c.append(el("div", { className: "soci-tools" }, yearSel, branchSel, search, count, pdf, rigenera), list);
    fill();
  }

  function renderSezioni(c, keys) {
    keys
      .filter((k) => k in edit)
      .forEach((k) => {
        const v = edit[k];
        c.append(
          box(k, human(k), "", same(v, base[k]) ? [] : [badge("modificata")], (body) => {
            if (numericGroup(v)) body.classList.add("numeric-fields");
            if (plain(v) && k !== "votazioni") Object.entries(v).forEach(([kk, x]) => body.append(node([k, kk], x, human(kk))));
            else body.append(node([k], v, human(k)));
          }),
        );
      });
  }

  /* riepilogo sempre in vista: data, convocazioni, punti all'odg e slide */
  function riepilogo() {
    const a = edit.assemblea || {},
      slide = Array.isArray(edit.slide) ? edit.slide : [],
      punti = slide.filter((x) => x.tipo === "slide_ordine_del_giorno").reduce((n, x) => n + (x.punti || []).length, 0),
      nascoste = slide.filter((x) => x.nascosta).length;
    return [
      a.data,
      a.prima_convocazione && "1ª conv. " + a.prima_convocazione,
      a.seconda_convocazione && "2ª conv. " + a.seconda_convocazione,
      punti + (punti === 1 ? " punto" : " punti") + " all'ordine del giorno",
      slide.length + " slide" + (nascoste ? " (" + nascoste + " nascoste)" : ""),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function render() {
    const y = scrollY,
      c = $("#campi");
    c.innerHTML = "";
    if (view === "generale" || view === "ordine") $("#intro").textContent = riepilogo();
    if (view === "generale") renderSezioni(c, GENERALE);
    else if (view === "bilancio") {
      const known = ["censimenti", "entrate", "uscite", "soglie_percentuali_esito", "storico_avanzo_per_anno",
        "patrimonio", "nota_beni_durevoli"];
      const altri = Object.keys(edit).filter(key => !["slide", ...GENERALE, ...known].includes(key));
      renderSezioni(c, [...known, ...altri]);
      if (![...known, ...altri].some(key => key in edit))
        c.append(el("p", { className: "empty-state", textContent: "Nessun dato presente nel bilancio." }));
    }
    else if (view === "soci") renderSoci(c);
    else if (view === "ordine" && Array.isArray(edit.slide)) renderOrdine(c);
    if (view === "json") refreshJson();
    scrollTo(0, y);
    updateDirty();
    if ($("#slide-editor").open) renderEditor();
  }

  function go(tab) {
    const prev = view;
    view = tab;
    $("#app").dataset.view = tab;
    if (["json", "guida", "limiti"].includes(tab)) $("#setup-tools").open = true;
    document.querySelectorAll(".tabs button").forEach((x) => {
      if (!x.dataset.tab) return;
      x.classList.toggle("on", x.dataset.tab === tab);
      x.setAttribute("aria-pressed", String(x.dataset.tab === tab));
    });
    $("#workspace-title").textContent = TITOLI[tab];
    $("#doc").title = TITOLI[tab];
    const doc = tab === "guida" || tab === "limiti";
    $("#campi").hidden = doc || tab === "json";
    $("#json").hidden = tab !== "json";
    $("#doc").hidden = !doc;
    $("#doc-link").hidden = !doc;
    $(".workflow-note").hidden = doc || tab === "generale" || tab === "soci";
    $("#intro").hidden = doc;
    $("#intro").textContent = INTRO[tab] || "";
    if (doc) {
      const anchor = tab === "limiti" ? "limiti" : "setup";
      const src = "guida.html?embed" + (tab === "limiti" ? "&solo=limiti" : "") + "#" + anchor;
      $("#doc-link").href = "guida.html#" + anchor;
      $("#doc-link").textContent = tab === "limiti" ? "Apri il monitor NAS in una nuova scheda ↗" : "Apri la guida al setup in una nuova scheda ↗";
      if ($("#doc").getAttribute("src") !== src) $("#doc").src = src;
    } else if (edit) {
      if (prev !== tab) scrollTo(0, 0);
      render();
    }
  }
  function updateDirty() {
    const d = dirty();
    $("#dirty").textContent = jsonPending
      ? (d ? "Bozza modificata · " : "") + "Testo JSON non applicato"
      : d ? "● Bozza non salvata" : "✓ Nessuna modifica locale";
    $("#dirty").style.color = d || jsonPending ? "var(--r-strong)" : "var(--g-strong)";
    $("#json-state").textContent = jsonPending
      ? "Testo non applicato: la bozza non è cambiata. Applica o scarta il testo prima di salvare."
      : "Il testo rispecchia la bozza.";
    $("#json-discard").disabled = !jsonPending || saving;
    $("#json-apply").disabled = saving;
    $("#salva-dati").textContent = saving
      ? "Salvataggio in corso…" : "Salva dati base";
    $("#save-destination").textContent = "Destinazione: NAS · dati.js";
    $("#salva-dati").disabled = !d || jsonPending || saving;
    $("#annulla").disabled = !unsaved() || saving;
    $("#nuovo-anno").disabled = !edit || saving;
  }

  /* ---------- pubblicazione NAS ---------- */
  const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const b64enc = (s) => {
    const b = new TextEncoder().encode(s);
    let r = "";
    for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(r);
  };
  async function contenuti(body) {
    const response = await fetch((window.LIVE.basePath || "") + "/api/content/dati.js", {
      method: body ? "PUT" : "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
    if (response.status === 409) throw Object.assign(new Error("conflitto"), { conflict: true });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
  async function salvaContenuti() {
    if (saving || !edit || jsonPending) return;
    saving = true;
    updateDirty();
    const snapshot = clone(edit);
    try {
      status("Pubblicazione in corso…");
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        const fd = await contenuti();
        const testo = b64dec(fd.content);
        /* Applica solo le modifiche locali sopra l'ultima versione pubblicata. */
        const voluto = M.applyPatch(window.SALVA_DATI.valuta(testo), M.diffPatch(base, snapshot));
        const nuovo = window.SALVA_DATI.genera(testo, voluto);
        if (nuovo === testo) {
          sync(voluto, snapshot);
          toast("Contenuti già aggiornati");
          return;
        }
        try {
          await contenuti({
            content: b64enc(nuovo),
            sha: fd.sha,
          });
        } catch (e) {
          if (e.conflict && tentativo < 2) continue;
          throw e;
        }
        sync(voluto, snapshot);
        status("Pubblicato", "ok");
        toast("Contenuti pubblicati");
        return;
      }
    } catch (e) {
      toast("⚠ " + e.message);
      status("Errore", "ko");
    } finally {
      saving = false;
      updateDirty();
      $(".more").open = false;
    }
  }

  async function init() {
    $("#app").hidden = $("#bar").hidden = false;
    go(view);
    $("#apri-regia").href = "regia.html";
    try {
      sync(await loadBase());
    } catch (e) {
      status("Errore", "ko");
      $("#campi").textContent = "⚠ " + e.message;
      return;
    }
  }

  $("#salva-dati").onclick = () => salvaContenuti();
  $("#slide-editor-chiudi").onclick = () => $("#slide-editor").close();
  $("#slide-editor").onclose = () => {
    slideEditor = null;
    render();
  };
  $("#esci-area").onclick = () => {
    if (
      edit &&
      unsaved() &&
      !confirm("Uscire senza pubblicare le modifiche?")
    )
      return;
    window.ACCESSO.esci();
    if (published) edit = clone(published);
    jsonPending = false;
    location.replace("../../");
  };
  $("#annulla").onclick = () => {
    if (saving || !confirm("Scartare tutte le modifiche alla bozza e l’eventuale testo JSON non applicato? I dati salvati resteranno invariati.")) return;
    edit = clone(published);
    discardJson();
    render();
  };
  $("#json-discard").onclick = () => {
    if (saving || !confirm("Scartare il testo JSON non applicato? La bozza resterà invariata.")) return;
    discardJson();
  };
  $("#scarica").onclick = async () => {
    let txt;
    try {
      txt = window.SALVA_DATI.genera(
        await (await fetch("dati.js?t=" + Date.now(), { cache: "no-store" })).text(),
        edit,
      );
    } catch (e) {
      txt = "window.DATI = " + JSON.stringify(edit, null, 2) + ";\n";
    }
    const a = el("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/javascript" })), download: "dati.js" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.querySelectorAll(".tabs button").forEach((b) => {
    if (b.dataset.tab) b.onclick = () => go(b.dataset.tab);
  });
  if (window.NUOVO_ANNO)
    window.NUOVO_ANNO.mount({
      getData: () => {
        if (jsonPending) throw new Error("Applica alla bozza o scarta il testo JSON prima di avviare il nuovo anno.");
        return edit;
      },
      apply(data) {
        edit = data;
        go("generale");
        status("Nuovo anno nella bozza: salva i dati base sul NAS", "live");
        toast("Nuovo anno pronto. Nessuna pubblicazione effettuata.");
      },
      error(message) {
        toast(message);
      },
    });
  $("#doc").onload = () => {
    try {
      const d = $("#doc").contentDocument;
      $("#doc").style.height = d.documentElement.scrollHeight + "px";
    } catch (e) {}
  };
  $("#json-text").oninput = () => {
    jsonPending = $("#json-text").value !== JSON.stringify(jsonBase, null, 2);
    $("#json-err").textContent = "";
    updateDirty();
  };
  $("#json-apply").onclick = () => {
    if (saving) return;
    try {
      const v = JSON.parse($("#json-text").value);
      if (!plain(v) || !Array.isArray(v.slide)) throw new Error('serve un oggetto con la lista "slide"');
      if (jsonPending && !same(jsonBase, edit) &&
          !confirm("La bozza è cambiata dopo l’apertura del testo JSON. Sostituirla con questo testo? Annulla per conservare entrambi.")) return;
      edit = v;
      jsonPending = false;
      $("#json-err").textContent = "";
      render();
      refreshJson();
      toast("Applicato alla bozza. Per salvare premi «Salva dati base».");
    } catch (e) {
      $("#json-err").textContent = "JSON non valido: " + e.message;
    }
  };
  addEventListener("beforeunload", (e) => {
    if (edit && unsaved()) e.preventDefault();
  });

  history.replaceState(null, "", location.pathname + location.hash);
  init();
})();
