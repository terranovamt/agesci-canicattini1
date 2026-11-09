(function (root) {
  'use strict';
  const branches = ['L/C', 'E/G', 'R/S', 'Adulti'];
  const profileFields = {
    givenName: 'Nome', surname: 'Cognome', sex: 'Sesso', birthDate: 'Data nascita',
    birthTown: 'Comune nascita', taxCode: 'Codice fiscale', nationality: 'Nazionalita',
    address: 'Indirizzo', streetNumber: 'Civico', town: 'Comune residenza',
    province: 'Provincia residenza', postalCode: 'CAP', email: 'Email', phone: 'Cellulare',
    profession: 'Professione', foca: 'Livello FOCA', coca: 'Ingresso CoCa',
    guardianType: 'Responsabilita genitoriale', guardians: 'Dati responsabili genitoriali',
    digital: 'Gestione digitale', consent2a: 'Consenso 2A', consent2b: 'Consenso 2B',
    consent2c: 'Consenso 2C', magazines: 'Consenso riviste',
  };
  const headers = [
    ['givenName', 'NOME'], ['surname', 'COGNOME'], ['sex', 'SESSO'], ['birthDate', 'DATA NASCITA'],
    ['birthTown', 'COMUNE NASCITA'], ['taxCode', 'CODICE FISCALE'], ['nationality', 'NAZIONALITA'],
    ['address', 'INDIRIZZO'], ['streetNumber', 'CIVICO'], ['town', 'COMUNE RESIDENZA'],
    ['province', 'PROVINCIA RESIDENZA'], ['postalCode', 'CAP'], ['email', 'EMAIL'], ['phone', 'CELLULARE'],
    ['profession', 'PROFESSIONE'], ['foca', 'LIVELLO FOCA'], ['coca', 'INGRESSO COCA'],
    ['guardianType', 'RESP.GENITORIALE TIPO'], ['guardians', 'RESP.GENITORIALE DATI'],
    ['digital', 'GESTIONE DIGITALE'], ['consent2a', 'CONSENSO 2A'], ['consent2b', 'CONSENSO 2B'],
    ['consent2c', 'CONSENSO 2C'], ['magazines', 'CONSENSO RIVISTE'],
  ];
  const censusFields = {
    statusCode: 'Codice status socio', status: 'Status socio', branch: 'Branca AGESCI',
    community: 'Comunita socio', unit: 'Tipo unita', unitCode: 'CUN', unitNumber: 'Prog',
    unitStatus: 'Status unita', environment: 'Ambiente unita', appointment: 'Incarico',
  };
  const censusHeaders = [
    ['statusCode', 'CODICE STATUS SOCIO'], ['status', 'STATUS SOCIO'], ['community', 'COMUNITA SOCIO'],
    ['unit', 'TIPO UNITA'], ['unitCode', 'CUN'], ['unitNumber', 'PROG'],
    ['unitStatus', 'STATUS UNITA'], ['environment', 'AMBIENTE UNITA'], ['appointment', 'INCARICO'],
  ];
  const defaultFields = [
    ['L/C', 'sestiglia', 'Sestiglia'], ['L/C', 'pista', 'Pista / sentiero'],
    ['L/C', 'specialita', 'Specialita'], ['L/C', 'promessa', 'Data promessa', 'date'],
    ['E/G', 'squadriglia', 'Squadriglia'], ['E/G', 'ruolo', 'Ruolo in squadriglia'],
    ['E/G', 'tappa', 'Tappa'], ['E/G', 'specialita', 'Specialita'],
    ['E/G', 'brevetti', 'Brevetti'], ['E/G', 'promessa', 'Data promessa', 'date'],
    ['R/S', 'comunita', 'Noviziato / clan'], ['R/S', 'punto-strada', 'Punto della strada'],
    ['R/S', 'servizio', 'Servizio'], ['R/S', 'partenza', 'Data partenza', 'date'],
    ['Adulti', 'servizio', 'Servizio in gruppo'], ['Adulti', 'formazione', 'Percorso formativo'],
  ].map(([branch, key, label, type = 'text']) => ({ branch, key, label, type, options: [] }));
  function date(value) {
    if (!value) return '';
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    const iso = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso)) ||
        new Date(iso).toISOString().slice(0, 10) !== iso) throw new Error('Data non valida');
    return iso;
  }
  function csvRows(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > 4 * 1024 * 1024) throw new Error('CSV troppo grande (massimo 4 MiB)');
    text = text.replace(/^\uFEFF/, '').replace(/^sep=,\r?\n/i, '');
    const rows = [];
    let row = [], cell = '', quoted = false, closed = false;
    function pushCell() { row.push(cell.trim()); cell = ''; closed = false; }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') { quoted = false; closed = true; }
        else cell += ch;
      } else if (ch === '"' && (cell === '' || cell === '=')) {
        if (closed) throw new Error('Virgolette CSV non valide');
        cell = ''; quoted = true;
      } else if (ch === ',') pushCell();
      else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        pushCell();
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else {
        if (closed && !/\s/.test(ch)) throw new Error('Caratteri dopo le virgolette CSV');
        if (!closed) cell += ch;
      }
    }
    if (quoted) throw new Error('Virgolette CSV non chiuse');
    pushCell();
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }
  function parseImport(text) {
    const rows = csvRows(text);
    const columns = rows.shift();
    const required = ['ANNO SCOUT', 'CODICE SOCIO', 'NOME', 'COGNOME', 'BRANCA', 'ORDINALE'];
    if (!columns || required.some(key => !columns.includes(key))) throw new Error('Intestazioni AGESCI mancanti: ' + required.join(', '));
    if (new Set(columns).size !== columns.length) throw new Error('Intestazioni duplicate');
    if (!rows.length || rows.length > 5000) throw new Error('Importare da 1 a 5000 righe');
    const seen = new Set(), warnings = [];
    let group;
    const members = rows.map((values, index) => {
      const line = index + 2;
      if (values.length === columns.length + 1 && values.at(-1) === '') values.pop();
      if (values.length !== columns.length) throw new Error(`Riga ${line}: numero colonne non valido`);
      const source = Object.fromEntries(columns.map((key, i) => [key, values[i]]));
      const code = source['CODICE SOCIO'], year = source['ANNO SCOUT'];
      if (!/^\d{5,9}$/.test(code) || !/^(19|20|21)\d{2}$/.test(year)) throw new Error(`Riga ${line}: codice socio o anno non valido`);
      if (seen.has(code + ':' + year)) throw new Error(`Riga ${line}: socio duplicato nello stesso anno; verificare gli incarichi prima di importare`);
      seen.add(code + ':' + year);
      const branch = source.BRANCA.replace(/^Branca /, '');
      if (!branches.includes(branch)) throw new Error(`Riga ${line}: branca non riconosciuta`);
      if (source.ORDINALE !== 'R2053') throw new Error(`Riga ${line}: il CSV contiene un gruppo diverso da R2053`);
      const currentGroup = Object.fromEntries(['GRUPPO', 'ORDINALE', 'REGIONE', 'ZONA',
        'INDIRIZZO GRUPPO', 'CIVICO GRUPPO', 'CAP GRUPPO', 'RESIDENZA GRUPPO',
        'PROVINCIA GRUPPO', 'EMAIL GRUPPO', 'CODICE FISCALE GRUPPO', 'DENOM. SOCIALE GRUPPO']
        .filter(key => columns.includes(key)).map(key => [key, source[key]]));
      if (group && JSON.stringify(group) !== JSON.stringify(currentGroup)) throw new Error(`Riga ${line}: dati di gruppo incoerenti`);
      group = currentGroup;
      const profile = Object.fromEntries(headers.filter(([, header]) => columns.includes(header)).map(([key, header]) => [key, source[header]]));
      try { if (Object.hasOwn(profile, 'birthDate')) profile.birthDate = date(profile.birthDate); }
      catch { throw new Error(`Riga ${line}: data di nascita non valida`); }
      if (!profile.surname && !profile.givenName) throw new Error(`Riga ${line}: nome e cognome mancanti`);
      if (!profile.givenName || !profile.surname) warnings.push(`Riga ${line}: nome o cognome incompleto`);
      if (profile.phone) profile.phone = [...new Set(profile.phone.split(';').map(v => v.replace(/\s/g, '')).filter(Boolean))].join(';');
      if (profile.guardians) warnings.push(`Riga ${line}: verificare i dati dei responsabili genitoriali; eventuali duplicati non sono uniti automaticamente`);
      const census = { ...Object.fromEntries(censusHeaders.filter(([, header]) => columns.includes(header)).map(([key, header]) => [key, source[header]])), branch };
      if (census.statusCode === 'S' || census.statusCode === 'D') warnings.push(`Riga ${line}: censimento sospeso, non equivale a socio attivo`);
      return { code, year, branch, profile, census };
    });
    const used = new Set([...required, ...headers.map(v => v[1]), ...censusHeaders.map(v => v[1]), ...Object.keys(group)]);
    return { members, group, warnings, ignoredColumns: columns.filter(key => !used.has(key)) };
  }
  function csvCell(value) {
    const text = String(value ?? '');
    return '"' + (/^[\s]*[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
  }
  function exportCsv(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
  const model = { branches, profileFields, censusFields, defaultFields, date, parseImport, exportCsv };
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SOCI_MODEL = model;
})(typeof window === 'object' ? window : globalThis);
