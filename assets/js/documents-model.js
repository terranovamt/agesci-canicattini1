(function () {
  const assemblyTypes = [
    ['convocazione', 'Convocazione'], ['regolamento', 'Regolamento'], ['peg', 'PEG'],
    ['bilancio', 'Bilancio'], ['verbale', 'Verbale'],
  ];
  function assemblyType(item) {
    if (item.assemblyType) return item.assemblyType;
    const name = [item.title, item.file].join(' ').toLocaleLowerCase('it');
    return /convoc/.test(name) ? 'convocazione' : /regolament/.test(name) ? 'regolamento'
      : /\bpeg(?:\b|\d)|progetto educativo/.test(name) ? 'peg' : /bilancio|rendiconto/.test(name) ? 'bilancio'
        : /verbale/.test(name) ? 'verbale' : '';
  }
  const safeName = name => typeof name === 'string' && !name.startsWith('.') && /^[^/\\\x00-\x1f]+\.pdf$/i.test(name);
  function validate(items) {
    if (!Array.isArray(items)) throw new Error('Indice documenti non valido');
    const names = new Set();
    items.forEach(item => {
      if (!safeName(item?.file) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160
        || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 500 || names.has(item.file)
        || (item.assemblyYear !== undefined && (!Number.isInteger(item.assemblyYear) || item.assemblyYear < 2000 || item.assemblyYear > 9999))
        || (item.assemblyType !== undefined && !assemblyTypes.some(([type]) => type === item.assemblyType))) {
        throw new Error('Indice documenti non valido: controlla file, titoli e descrizioni');
      }
      names.add(item.file);
      if (item.year !== undefined && (!Number.isInteger(item.year) || item.year < 1900 || item.year > 9999)) {
        throw new Error('Anno del documento non valido');
      }
      if (item.publishedAt !== undefined && (typeof item.publishedAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)
        || !Number.isFinite(Date.parse(item.publishedAt))
        || new Date(item.publishedAt).toISOString().slice(0, 10) !== item.publishedAt)) {
        throw new Error('Data di pubblicazione non valida');
      }
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
  const preparatory = (items, year) => validate(items).filter(item => item.assemblyYear === year)
    .sort((a, b) => {
      const rank = item => {
        const index = assemblyTypes.findIndex(([type]) => type === assemblyType(item));
        return index < 0 ? assemblyTypes.length : index;
      };
      return rank(a) - rank(b) || (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.file.localeCompare(b.file);
    });
  const preparatorySlots = (items, year) => {
    const available = preparatory(items, year);
    return assemblyTypes.map(([type, label]) => ({
      type, label, document: available.find(item => assemblyType(item) === type) || null,
    }));
  };
  const model = { apply, validate, safeName, preparatory, preparatorySlots, assemblyType, assemblyTypes };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else window.DOCUMENTS_MODEL = model;
})();
