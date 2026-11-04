(function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  function assemblyDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error('Inserisci data e ora dell’assemblea');
    const [, y, m, d, h, min] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, h, min));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || h > 23 || min > 59) {
      throw new Error('Data e ora dell’assemblea non valide');
    }
    const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    return d + ' ' + months[m - 1] + ' ' + y;
  }
  const count = (value, label, nullable = false) => {
    if (nullable && value === null) return;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + ': inserisci un numero intero non negativo');
  };
  const money = (value, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))
      || Math.abs(value * 100 - Math.round(value * 100)) > .00001) {
      throw new Error(label + ': inserisci un importo non negativo con al massimo due decimali');
    }
  };
  function checkSource(data) {
    if (!Number.isSafeInteger(data.anno_esercizio) || !data.assemblea || !Array.isArray(data.slide)
      || !data.censimenti || !data.censimenti.storico_per_anno || !data.storico_avanzo_per_anno
      || !Array.isArray(data.entrate) || !Array.isArray(data.uscite) || !Array.isArray(data.patrimonio?.voci)
      || data.patrimonio.anno_corrente !== data.anno_esercizio) {
      throw new Error('Dati annuali incompleti o anni del patrimonio incoerenti. Correggili nel setup prima di procedere.');
    }
    count(data.censimenti.censiti_attuali, 'Censiti da archiviare');
    count(data.censimenti.presenti_attuali, 'Presenti da archiviare', true);
    [...data.entrate, ...data.uscite].forEach(row => money(row.importo, row.descrizione));
    data.patrimonio.voci.forEach(row => money(row.importo_anno_corrente, row.nome));
  }
  function draft(data) {
    checkSource(data);
    const next = clone(data);
    next.anno_esercizio++;
    next.anno_scout = next.anno_esercizio + '/' + (next.anno_esercizio + 1);
    next.assemblea.data = '';
    next.censimenti.censiti_attuali = null;
    next.censimenti.presenti_attuali = null;
    next.entrate.forEach(row => { row.importo = null });
    next.uscite.forEach(row => { row.importo = null });
    next.patrimonio.voci.forEach(row => { row.importo_anno_corrente = null });
    next.slide.filter(row => row.tipo === 'slide_qr_live').forEach(row => { row.data_ora = '' });
    return next;
  }
  function archive(history, year, value, label) {
    const previous = history[year];
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(value)) {
      throw new Error(label + ' ' + year + ' già presente e diverso: nessuno storico è stato sovrascritto. Verifica i dati nel setup.');
    }
    history[year] = value;
  }
  function prepare(source, proposed, previousPresent, dateTime) {
    checkSource(source);
    const next = clone(proposed), year = source.anno_esercizio;
    next.assemblea.data = assemblyDate(dateTime);
    next.slide.filter(row => row.tipo === 'slide_qr_live').forEach(row => { row.data_ora = dateTime });
    if (next.anno_esercizio !== year + 1) throw new Error('Il nuovo esercizio deve essere quello immediatamente successivo: ' + (year + 1));
    if (!/^\d{4}\/\d{4}$/.test(next.anno_scout) || Number(next.anno_scout.slice(5)) !== Number(next.anno_scout.slice(0, 4)) + 1) {
      throw new Error('Anno scout non valido: usa due anni consecutivi, per esempio 2027/2028');
    }
    if (!next.assemblea.titolo.trim() || !next.assemblea.data.trim()
      || !/^\d{2}:\d{2}$/.test(next.assemblea.prima_convocazione) || !/^\d{2}:\d{2}$/.test(next.assemblea.seconda_convocazione)) {
      throw new Error('Completa titolo, data e orari delle convocazioni');
    }
    for (const key of ['prima_convocazione', 'seconda_convocazione']) {
      const [hour, minute] = next.assemblea[key].split(':').map(Number);
      if (hour > 23 || minute > 59) throw new Error('Orario di convocazione non valido');
    }
    count(next.censimenti.censiti_attuali, 'Nuovi censiti');
    count(previousPresent, 'Presenti da archiviare', true);
    if (previousPresent !== null && previousPresent > source.censimenti.censiti_attuali) throw new Error('I presenti da archiviare superano i censiti');
    next.censimenti.presenti_attuali = null;
    next.censimenti.storico_per_anno = clone(source.censimenti.storico_per_anno);
    archive(next.censimenti.storico_per_anno, year,
      { censiti: source.censimenti.censiti_attuali, presenti: previousPresent }, 'Censimenti');
    let balance = 0;
    for (const key of ['entrate', 'uscite']) {
      if (next[key].length !== source[key].length) throw new Error('Le voci di bilancio sono cambiate: riapri la procedura');
      next[key].forEach((row, i) => {
        money(row.importo, row.descrizione);
        row.importo_anno_precedente = source[key][i].importo;
        balance += (key === 'entrate' ? 1 : -1) * Math.round(source[key][i].importo * 100);
      });
    }
    next.storico_avanzo_per_anno = clone(source.storico_avanzo_per_anno);
    archive(next.storico_avanzo_per_anno, year, balance / 100, 'Risultato economico');
    if (next.patrimonio.voci.length !== source.patrimonio.voci.length) throw new Error('Le voci del patrimonio sono cambiate');
    if (!next.patrimonio.data_riferimento.trim()) throw new Error('Inserisci la data di riferimento del patrimonio');
    next.patrimonio.anno_precedente = year;
    next.patrimonio.anno_corrente = year + 1;
    next.patrimonio.voci.forEach((row, i) => {
      money(row.importo_anno_corrente, row.nome);
      row.importo_anno_precedente = source.patrimonio.voci[i].importo_anno_corrente;
    });
    next.slide.forEach(row => {
      if (row.tipo === 'slide_qr_live' && (!row.data_ora || !Number.isFinite(Date.parse(row.data_ora)))) {
        throw new Error('Inserisci data e ora del conto alla rovescia nelle slide QR');
      }
      if (row.tipo === 'slide_quorum_convocazioni') {
        row.convocazioni?.forEach((convocation, i) => {
          if (i < 2) convocation.orario = next.assemblea[i === 0 ? 'prima_convocazione' : 'seconda_convocazione'];
        });
      }
    });
    return next;
  }
  const model = { draft, prepare, assemblyDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else window.NUOVO_ANNO_MODEL = model;
})();
