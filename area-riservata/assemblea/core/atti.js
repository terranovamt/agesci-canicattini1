/* Regia: a fine assemblea genera verbale e deliberazioni (PDF in uno ZIP) con i dati dell'assemblea e i risultati dei voti. */
(function () {
  const btn = document.getElementById("atti-btn");
  if (!btn || !window.PDF_ATTI) return;
  const API = ((window.LIVE || {}).basePath || "") + "/api/vote";
  const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const txt = t => String(t || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const nome = t => { t = txt(t); return /[\[\]]/.test(t) ? "" : t; };
  const CAMPI = [
    ["data", "Data (es. 20 novembre 2026)"], ["oraInizio", "Ora inizio (seconda convocazione)"], ["oraFine", "Ora fine"],
    ["presenti", "Presenti"], ["genitori", "Genitori = associati con diritto di voto"],
    ["presidente", "Presidente"], ["scrutatori", "Scrutatori (es. Anna Rossi e Luca Bianchi)"], ["segretario", "Segretario (nome e cognome)"],
    ["capoGruppo", "Capo gruppo che interviene (nome)"], ["quota", "Quota integrativa €"], ["quotaNaz", "Quota nazionale €"], ["scadenza", "Scadenza pagamento"],
    ["regolamento", "Ultima approvazione regolamento"],
    ["staff", "Cambi di staff (testo)", 1], ["comunicazioni", "Comunicazioni (una per riga)", 1], ["capi", "Comunità Capi eletta (un nome per riga)", 1],
    ["si1", "Bilancio: favorevoli"], ["no1", "Bilancio: contrari"], ["ast1", "Bilancio: astenuti"],
    ["si2", "Quota: favorevoli"], ["no2", "Quota: contrari"], ["ast2", "Quota: astenuti"],
    ["si3", "Organo: favorevoli"], ["no3", "Organo: contrari"], ["ast3", "Organo: astenuti"],
  ];
  async function risultati() {
    try { const r = await fetch(API + "/report", { cache: "no-store" }); return r.ok ? (await r.json()).polls : []; } catch (e) { return []; }
  }
  function iniziali(w, polls) {
    const D = w.DATI || {}, a = D.assemblea || {}, org = ((D.slide || []).find(s => s.tipo === "slide_composizione_organo" || s.tipo === "organo") || {}).persone || [];
    const per = r => org.filter(p => txt(p.ruolo).toLowerCase().startsWith(r)).map(p => nome(p.nome)).filter(Boolean);
    const m = /(\d{1,2})\s+(\p{L}+)\s+(\d{4})/u.exec(txt(a.data)), mese = m ? MESI.indexOf(m[2].toLowerCase()) + 1 : 0;
    const anno = D.anno_esercizio || new Date().getFullYear(), pres = (D.censimenti && D.censimenti.presenti_attuali) || 0;
    const voti = (id, def) => { const p = polls.find(x => x.slide === id && x.modalita === "scelta"); return p ? p.conteggi : def; };
    const v1 = voti("votazione-bilancio", [pres, 0, 0]), v2 = voti("votazione-contributo", [pres, 0, 0]), v3 = voti("votazione-organo", [pres, 0, 0]);
    const v = {
      data: m ? `${m[1]} ${m[2].toLowerCase()} ${m[3]}` : txt(a.data), dataBreve: m ? `${m[1].padStart(2, "0")}/${String(mese).padStart(2, "0")}/${m[3]}` : "",
      oraInizio: a.seconda_convocazione || "", oraFine: "", presenti: pres || "", genitori: "", presidente: per("presidente")[0] || "",
      scrutatori: per("scrutator").join(" e "), segretario: per("segretari")[0] || "", capoGruppo: "", quota: "10", quotaNaz: "40", scadenza: "15 dicembre",
      regolamento: "anno 24-25 delibera n°1 del 14 novembre 24", staff: "", comunicazioni: "Informative campi invernali",
      capi: "Bertuna Vito\nGazzara Gianna\nGermano Gabriele\nGionfriddo Davide\nGuzzardo Gaia\nGuzzardo Oliviero\nMangiafico Maria\nPetrolito Elisabetta\nRamondetta Marco\nRandazzo Clarissa\nTerranova Matteo\nUrso Cannarella Antonino",
      si1: v1[0], no1: v1[1], ast1: v1[2], si2: v2[0], no2: v2[1], ast2: v2[2], si3: v3[0], no3: v3[1], ast3: v3[2],
    };
    v.anno = anno;
    return v;
  }
  function modello(v, anno) {
    const n = k => Number(v[k]) || 0, esiti = { 1: { si: n("si1"), no: n("no1"), ast: n("ast1") }, 2: { si: n("si2"), no: n("no2"), ast: n("ast2") }, 3: { si: n("si3"), no: n("no3"), ast: n("ast3") } };
    return Object.assign({}, v, { anno, annoScout: `${String(anno).slice(2)}-${String(anno + 1).slice(2)}`, annoScoutEsteso: `${anno}-${anno + 1}`, annoScoutPrec: `${anno - 1}-${anno}`,
      segretarioNome: String(v.segretario).split(" ")[0], esiti, dataBreve: v.dataBreve });
  }
  async function immagini() {
    const get = async f => new Uint8Array(await (await fetch("../../assets/img/" + f)).arrayBuffer());
    return { banda: await get("atti-banda.jpg"), logo: await get("atti-logo.jpg"), wagggs: await get("atti-wagggs.jpg") };
  }
  async function genera(v, anno) {
    const c = modello(v, anno), imgs = await immagini(), M = window.ATTI_MODELLI;
    const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const nomi = ["approvazione-bilancio", "quota-integrativa", "elezione-organo-esecutivo"];
    const files = [{ nome: "Verbale-Assemblea.pdf", dati: window.PDF_ATTI.crea(M.verbale(c), imgs) }];
    M.deliberazioni(c).forEach((b, i) => files.push({ nome: `Deliberazione-${i + 1}-${slug(nomi[i])}.pdf`, dati: window.PDF_ATTI.crea(b, imgs) }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(window.PDF_ATTI.zip(files));
    a.download = `atti-assemblea-${anno}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  btn.onclick = async () => {
    btn.disabled = true;
    const w = document.getElementById("principale").contentWindow, polls = await risultati(), v = iniziali(w, polls), anno = v.anno;
    btn.disabled = false;
    const dlg = document.createElement("dialog");
    dlg.id = "atti-dlg";
    dlg.innerHTML = '<form method="dialog"><h3>Atti dell’assemblea</h3><p class="note">Controlla i dati (precompilati dalla regia e dai voti), poi scarica verbale e deliberazioni in un unico ZIP.</p><div class="atti-campi"></div><p class="atti-er" role="alert"></p><div class="mini"><button type="button" class="atti-ok">Scarica ZIP con i PDF</button><button type="button" class="sec atti-no">Annulla</button></div></form>';
    const box = dlg.querySelector(".atti-campi"), inputs = {};
    CAMPI.forEach(([k, label, multi]) => {
      const l = document.createElement("label"), i = document.createElement(multi ? "textarea" : "input");
      l.textContent = label; if (multi) i.rows = k === "capi" ? 6 : 3; i.value = v[k] ?? ""; inputs[k] = i; l.append(i); box.append(l);
    });
    document.body.append(dlg);
    dlg.querySelector(".atti-no").onclick = () => { dlg.close(); dlg.remove(); };
    dlg.querySelector(".atti-ok").onclick = async () => {
      const out = Object.assign({}, v); Object.keys(inputs).forEach(k => { out[k] = inputs[k].value.trim(); });
      const mancano = ["presidente", "scrutatori", "segretario", "oraFine", "genitori", "capoGruppo"].filter(k => !out[k]);
      if (mancano.length) { dlg.querySelector(".atti-er").textContent = "Compila: " + mancano.map(k => CAMPI.find(c => c[0] === k)[1]).join("; "); return; }
      try { await genera(out, anno); dlg.close(); dlg.remove(); } catch (e) { dlg.querySelector(".atti-er").textContent = e.message; }
    };
    dlg.showModal();
  };
})();
