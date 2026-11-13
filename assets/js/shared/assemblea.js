/* Stato dell'assemblea, separato dalla posizione live e dalle modifiche. */
(function () {
  const url = (window.LIVE?.url || "").replace(/\/$/, "");
  const api = ((window.LIVE?.basePath || "").replace(/\/$/, "")) + "/api/vote";
  async function aggiornaVotazioni(path) {
    const r = await fetch(api + "/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) throw new Error((await r.text()) || "Impossibile aggiornare le votazioni (NAS " + r.status + ")");
  }
  async function leggi() {
    if (!url) throw new Error("NAS non configurato");
    const r = await fetch(url + "/assemblea/stato.json", { cache: "no-store" });
    if (!r.ok) throw new Error("Impossibile leggere lo stato assemblea (NAS " + r.status + ")");
    const s = await r.json();
    if (s !== null && typeof s?.attiva !== "boolean") throw new Error("Stato assemblea non valido");
    return s;
  }
  async function salva(attiva, patch) {
    if (!url) throw new Error("NAS non configurato");
    await aggiornaVotazioni(attiva ? "session/reset" : "close");
    const data = { assemblea: { stato: { attiva } } };
    if (attiva) {
      data.live = { stato: { pos: 0, max: 0 } };
      data.modifiche = {
        patch: patch === undefined ? null : JSON.stringify(patch),
        t: { ".sv": "timestamp" },
      };
    }
    const r = await fetch(url + "/.json", { method: "PATCH", body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
  }
  function osserva(onState, onError) {
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        onState(await leggi());
      } catch (e) {
        onError(e);
      } finally {
        running = false;
      }
    };
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }
  window.ASSEMBLEA = { leggi, salva, osserva };
})();
