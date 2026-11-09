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
  const guardianFields = {
    fullName: 'Nome completo importato', givenName: 'Nome', surname: 'Cognome',
    taxCode: 'Codice fiscale', birthTown: 'Comune nascita', birthDate: 'Data nascita',
    email: 'Email', phone: 'Cellulare',
  };
  function parseGuardians(source) {
    const contacts = [], unparsed = [];
    for (const record of String(source || '').split(';').map(value => value.trim()).filter(Boolean)) {
      const match = /^(.*?)\s*\[[^\]]*?([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])\]\s*(?:-\s*)?Nato\/a a:\s*(.*?)\s+il:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+E-mail:\s*(.*?)\s+Cellulare:\s*(.*?)$/i.exec(record);
      if (!match) { unparsed.push(record); continue; }
      let birthDate;
      try { birthDate = date(match[4]); } catch { unparsed.push(record); continue; }
      contacts.push({ fullName: match[1].trim(), givenName: '', surname: '', taxCode: match[2].toUpperCase(),
        birthTown: match[3].trim(), birthDate, email: match[5].trim(), phone: match[6].replace(/\s/g, '') });
    }
    return { contacts, unparsed };
  }
  const specialtyCatalogs = {
    'L/C': [
      'Amico degli Animali', 'Amico del Mare', 'Amico della Natura', 'Amico di Aronne',
      'Amico di Samuele', 'Amico di San Francesco', 'Artigiano', 'Astronomo', 'Atleta', 'Attore',
      'Botanico', 'Canterino', 'Cercatore di Tracce', 'Cittadino del Mondo', 'Collezionista',
      'Cuoco', 'Disegnatore', 'Folclorista', 'Fotografo', 'Giardiniere', 'Giocatore di Squadra',
      'Giocattolaio', 'Giornalista', 'Guida', 'Infermiere', 'Kim', 'Maestro dei Giochi',
      'Maestro del Bosco', 'Maestro della Salute', 'Maestro di Danze', 'Mani Abili', 'Massaio',
      'Meteorologo', 'Montanaro', 'Musicista', 'Ripara-Ricicla', 'Sarto', 'Scaccia Pericoli', 'Scrittore',
    ],
    'E/G': [
      'Allevatore', 'Alpinista', 'Amico degli animali', 'Amico del quartiere', 'Archeologo',
      'Artigiano', 'Artista di strada', 'Astronomo', 'Atleta', 'Attore', 'Battelliere',
      'Boscaiolo', 'Botanico', 'Campeggiatore', 'Canoista', 'Cantante', 'Carpentiere navale',
      'Ciclista', 'Collezionista', 'Coltivatore', 'Corrispondente', 'Corrispondente radio',
      'Cuoco', 'Danzatore', 'Disegnatore', 'Elettricista', 'Elettronico', 'Esperto del computer',
      'Europeista', 'Falegname', 'Fa tutto', 'Folclorista', 'Fotografo', 'Geologo', 'Giardiniere',
      'Giocattolaio', 'Grafico', 'Guida', 'Guida marina', 'Hebertista', 'Idraulico', 'Infermiere',
      'Interprete', 'Lavoratore/ce in cuoio', 'Maestro dei giochi', 'Maestro dei nodi',
      'Meccanico', 'Modellista', 'Muratore', 'Musicista', 'Nuotatore', 'Osservatore',
      'Osservatore meteo', 'Pescatore', 'Pompiere', 'Redattore', 'Regista', 'Sarto', 'Scenografo',
      'Segnalatore', 'Servizio della Parola', 'Servizio liturgico', 'Servizio missionario', 'Topografo', 'Velista',
    ],
  };
  const competencyBadges = [
    'Animatore sportivo', 'Artista', 'Cittadino del mondo', 'Esploratore delle acque',
    'Giornalista', 'Grafico multimediale', 'Guida alpina', 'Liturgista', 'Maestro delle tecnologie',
    'Mani Abili', 'Naturalista', 'Pioniere', 'Sherpa', 'Soccorritore', 'Trappeur',
  ];
  function selectedChoices(value) {
    return Array.isArray(value) ? value : String(value || '').split(';').map(item => item.trim()).filter(Boolean);
  }
  const defaultFields = [
    ['L/C', 'sestiglia', 'Sestiglia'], ['L/C', 'pista', 'Pista / sentiero'],
    ['L/C', 'specialita', 'Specialita'], ['L/C', 'promessa', 'Data promessa', 'date'],
    ['E/G', 'squadriglia', 'Squadriglia'], ['E/G', 'ruolo', 'Ruolo in squadriglia'],
    ['E/G', 'tappa', 'Tappa'], ['E/G', 'specialita', 'Specialita'],
    ['E/G', 'brevetti', 'Brevetti di competenza'], ['E/G', 'promessa', 'Data promessa', 'date'],
    ['R/S', 'comunita', 'Noviziato / clan'], ['R/S', 'punto-strada', 'Punto della strada'],
    ['R/S', 'servizio', 'Servizio'], ['R/S', 'partenza', 'Data partenza', 'date'],
    ['Adulti', 'servizio', 'Servizio in gruppo'], ['Adulti', 'formazione', 'Percorso formativo'],
  ].map(([branch, key, label, type = 'text']) => ({ branch, key, label, type, options: [] }));
  const choices = [
    ['L/C', 'ruolo', 'Ruolo in sestiglia', ['Capo sestiglia', 'Vice capo sestiglia', 'Sestigliere', 'Novizio']],
    ['L/C', 'anno', 'Anno in branca', ['Primo anno', 'Secondo anno', 'Terzo anno']],
    ['L/C', 'progressione', 'Progressione', ['Lupo della legge', 'Lupo della rupe', 'Lupo anziano']],
    ['E/G', 'anno', 'Anno in branca', ['Primo anno', 'Secondo anno', 'Terzo anno', 'Quarto anno']],
    ['E/G', 'progressione', 'Piede tenero', ['Si', 'No']],
    ['R/S', 'passi', 'Passi', ['Passi della scoperta', 'Passi della competenza', 'Passi della responsabilita']],
  ];
  defaultFields.find(field => field.branch === 'E/G' && field.key === 'ruolo').type = 'select';
  defaultFields.find(field => field.branch === 'E/G' && field.key === 'ruolo').options = ['Capo squadriglia', 'Vice capo squadriglia', 'Squadrigliere'];
  for (const [branch, key, label, options] of choices) defaultFields.push({ branch, key, label, type: 'select', options });
  const egStage = defaultFields.find(field => field.branch === 'E/G' && field.key === 'tappa');
  egStage.type = 'select';
  egStage.options = ['Tappa della scoperta', 'Tappa della competenza', 'Tappa della responsabilita'];
  defaultFields.find(field => field.branch === 'L/C' && field.key === 'progressione').label = 'Momento della progressione';
  for (const field of defaultFields) {
    if (field.key === 'specialita' || field.key === 'brevetti') {
      field.type = 'multiselect';
      field.options = field.key === 'brevetti' ? competencyBadges : specialtyCatalogs[field.branch];
    }
  }
  function nextBranch(branch) { return { 'L/C': 'E/G', 'E/G': 'R/S' }[branch] || ''; }
  function longSuspended(member, currentYear) {
    const latest = member.censuses[0];
    return !!latest && (latest.statusCode === 'D' ||
      (latest.statusCode === 'S' && Number(latest.year) < Number(currentYear)));
  }
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
      if (Object.hasOwn(profile, 'guardians')) {
        const parsed = parseGuardians(profile.guardians);
        profile.guardianContacts = parsed.contacts;
        if (parsed.unparsed.length) warnings.push(`Riga ${line}: alcuni responsabili non sono separabili automaticamente; il testo originale viene conservato`);
      }
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
  const model = { branches, profileFields, guardianFields, parseGuardians, specialtyCatalogs, competencyBadges,
    selectedChoices, censusFields, defaultFields, nextBranch, longSuspended, date, parseImport, exportCsv };
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SOCI_MODEL = model;
})(typeof window === 'object' ? window : globalThis);
