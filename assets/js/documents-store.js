(function () {
  const { apply, validate, safeName } = window.DOCUMENTS_MODEL;

  async function load() {
    const response = await fetch((window.LIVE.basePath || "") + "/documents/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Indice documenti NAS non disponibile");
    return validate(await response.json());
  }

  async function save(change) {
    const response = await fetch((window.LIVE.basePath || "") + "/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (!response.ok) throw new Error(await response.text());
    return validate(await response.json());
  }

  window.DOCUMENTS = { apply, load, save, validate, safeName };
})();
