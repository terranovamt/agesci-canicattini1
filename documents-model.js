(function () {
  const safeName = name => typeof name === 'string' && !name.startsWith('.') && /^[^/\\\x00-\x1f]+\.pdf$/i.test(name);
  function validate(items) {
    if (!Array.isArray(items)) throw new Error('Indice documenti non valido');
    const names = new Set();
    items.forEach(item => {
      if (!safeName(item?.file) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160
        || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 500 || names.has(item.file)) {
        throw new Error('Indice documenti non valido: controlla file, titoli e descrizioni');
      }
      names.add(item.file);
    });
    return items;
  }
  function apply(items, change) {
    validate(items);
    const current = items.find(item => item.file === (change.previous?.file || change.document?.file));
    if (JSON.stringify(current) !== JSON.stringify(change.previous)) {
      throw new Error('Questo documento è cambiato su GitHub. Ricarica prima di salvarlo.');
    }
    if (change.operation !== 'save' && change.operation !== 'delete') throw new Error('Operazione documenti non valida');
    if (change.operation === 'delete' && !current) throw new Error('Documento da eliminare non trovato');
    if (change.operation === 'save' && change.previous && change.document.file !== change.previous.file) {
      throw new Error('Il nome del file non può cambiare durante la modifica');
    }
    const next = JSON.parse(JSON.stringify(items.filter(item => item !== current)));
    if (change.operation === 'save') next.push(change.document);
    return validate(next);
  }
  const model = { apply, validate, safeName };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else window.DOCUMENTS_MODEL = model;
})();
