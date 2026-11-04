(function () {
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const steps = ['Anno', 'Assemblea', 'Censimenti', 'Entrate e uscite', 'Patrimonio', 'Contenuti', 'Riepilogo'];
  const strip = value => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const label = key => key.replaceAll('_', ' ');
  let source, next, previousPresent, step, getData, apply, prepared, dateTime;
  const node = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  function field(parent, title, value, change, type = 'text', required = true) {
    const wrap = node('label', undefined, 'year-field');
    wrap.append(node('span', strip(title)));
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    else input.rows = 3;
    input.required = required;
    input.value = value ?? '';
    if (type === 'number') { input.min = '0'; input.step = '0.01' }
    input.oninput = () => change(type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value);
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function contents(parent, value, path, title) {
    if (typeof value === 'string') {
      const key = path.at(-1);
      if (['tipo', 'id', 'icona', 'immagine', 'colore', 'colore_css', 'slide_collegata', 'data_ora'].includes(key)) return;
      field(parent, title, value, text => {
        const target = path.slice(0, -1).reduce((obj, part) => obj[part], next);
        target[key] = text;
      }, 'textarea', false);
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) => contents(parent, child, [...path, key],
        title + ' · ' + (Array.isArray(value) ? Number(key) + 1 : label(key))));
    }
  }
  function row(parent, title, before, after) {
    const line = node('div', undefined, 'year-review-row');
    line.append(node('strong', strip(title)), node('span', String(before ?? 'Non rilevato')),
      node('span', '→', 'year-arrow'), node('span', String(after ?? 'Da rilevare')));
    parent.append(line);
  }
  function review(parent) {
    prepared = window.NUOVO_ANNO_MODEL.prepare(source, next, previousPresent, dateTime);
    parent.append(node('p', 'Controlla i valori prima di applicare. Gli importi attuali passeranno nella colonna precedente; gli storici più vecchi resteranno intatti.'));
    row(parent, 'Esercizio', source.anno_esercizio, prepared.anno_esercizio);
    row(parent, 'Anno scout', source.anno_scout, prepared.anno_scout);
    Object.keys(prepared.assemblea).forEach(key => row(parent, label(key), source.assemblea[key], prepared.assemblea[key]));
    row(parent, 'Censiti', source.censimenti.censiti_attuali, prepared.censimenti.censiti_attuali);
    row(parent, 'Presenti', previousPresent, null);
    const euro = value => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
    ['entrate', 'uscite'].forEach(key => {
      parent.append(node('h3', label(key)));
      prepared[key].forEach((item, i) => row(parent, item.descrizione, euro(source[key][i].importo), euro(item.importo)));
    });
    const sum = key => prepared[key].reduce((total, item) => total + Math.round(item.importo * 100), 0);
    row(parent, 'Avanzo/disavanzo', euro(prepared.storico_avanzo_per_anno[source.anno_esercizio]), euro((sum('entrate') - sum('uscite')) / 100));
    parent.append(node('h3', 'Patrimonio'));
    row(parent, 'Data di riferimento', source.patrimonio.data_riferimento, prepared.patrimonio.data_riferimento);
    prepared.patrimonio.voci.forEach((item, i) => row(parent, item.nome,
      euro(source.patrimonio.voci[i].importo_anno_corrente), euro(item.importo_anno_corrente)));
    row(parent, 'Nota beni durevoli', source.nota_beni_durevoli, prepared.nota_beni_durevoli);
    parent.append(node('h3', 'Contenuti delle slide modificati'));
    let changes = 0;
    function differences(before, after, title) {
      if (typeof after === 'string' && before !== after) { row(parent, title, before, after); changes++ }
      else if (after && typeof after === 'object') {
        Object.entries(after).forEach(([key, value]) => differences(before?.[key], value, title + ' · ' + label(key)));
      }
    }
    prepared.slide.forEach((slide, i) => differences(source.slide[i], slide, 'Slide ' + (i + 1)));
    if (!changes) parent.append(node('p', 'Nessun testo modificato. Verifica di avere aggiornato i titoli annuali e l’ordine del giorno.'));
    const check = node('label', undefined, 'year-confirm');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.required = true;
    check.append(input, node('span', 'Ho controllato il riepilogo: applica il nuovo anno solo alla bozza del setup.'));
    parent.append(check);
  }
  function render() {
    const body = $('year-fields');
    body.replaceChildren();
    $('year-error').textContent = '';
    $('year-progress').textContent = 'Passaggio ' + (step + 1) + ' di ' + steps.length;
    $('year-step-title').textContent = steps[step];
    $('year-back').hidden = step === 0;
    $('year-next').textContent = step === steps.length - 1 ? 'OK, applica nuovo anno' : 'Continua';
    $('year-next').disabled = false;
    if (step === 0) {
      body.append(node('p', 'Parti dai dati attualmente aperti nel setup, comprese le modifiche locali. Nessun dato cambia finché non confermi. Il nuovo esercizio deve seguire quello attuale.'));
      const year = field(body, 'Nuovo esercizio (attuale: ' + source.anno_esercizio + ')', next.anno_esercizio, value => { next.anno_esercizio = value }, 'number');
      year.min = year.max = String(source.anno_esercizio + 1); year.step = '1';
      field(body, 'Anno scout (es. 2027/2028)', next.anno_scout, value => { next.anno_scout = value });
    } else if (step === 1) {
      field(body, 'Titolo assemblea (aggiorna anche l’anno nel testo)', next.assemblea.titolo, value => { next.assemblea.titolo = value });
      field(body, 'Data e ora assemblea e conto alla rovescia', dateTime, value => { dateTime = value }, 'datetime-local');
      body.append(node('p', 'La data scritta (es. 20 Novembre 2027) e tutte le slide con conto alla rovescia vengono ricavate da questo unico campo.', 'hint'));
      ['prima_convocazione', 'seconda_convocazione'].forEach(key =>
        field(body, label(key), next.assemblea[key], value => { next.assemblea[key] = value }, 'time'));
      if ('luogo' in next.assemblea) field(body, 'Luogo', next.assemblea.luogo, value => { next.assemblea.luogo = value });
    } else if (step === 2) {
      body.append(node('p', 'Archivieremo ' + source.censimenti.censiti_attuali + ' censiti nell’anno ' + source.anno_esercizio + '. I presenti del nuovo anno saranno lasciati da rilevare.'));
      const old = field(body, 'Presenti del vecchio anno da archiviare (vuoto = non rilevati)', previousPresent,
        value => { previousPresent = value }, 'number', false);
      old.step = '1'; old.max = String(source.censimenti.censiti_attuali);
      const current = field(body, 'Censiti del nuovo anno', next.censimenti.censiti_attuali,
        value => { next.censimenti.censiti_attuali = value }, 'number');
      current.step = '1';
    } else if (step === 3) {
      body.append(node('p', 'Inserisci tutti i nuovi importi, anche quando sono zero. Le cifre precedenti non vanno reinserite.'));
      ['entrate', 'uscite'].forEach(key => {
        body.append(node('h3', label(key)));
        next[key].forEach((item, i) => field(body, strip(item.descrizione) + ' · attuale ' + source[key][i].importo + ' €',
          item.importo, value => { item.importo = value }, 'number'));
      });
    } else if (step === 4) {
      field(body, 'Data di riferimento del patrimonio', next.patrimonio.data_riferimento, value => { next.patrimonio.data_riferimento = value });
      next.patrimonio.voci.forEach((item, i) => field(body, item.nome + ' · attuale ' + source.patrimonio.voci[i].importo_anno_corrente + ' €',
        item.importo_anno_corrente, value => { item.importo_anno_corrente = value }, 'number'));
      field(body, 'Nota sui beni durevoli', next.nota_beni_durevoli || '', value => { next.nota_beni_durevoli = value }, 'textarea', false);
    } else if (step === 5) {
      body.append(node('p', 'Rivedi titoli annuali, ordine del giorno e persone dell’organo assembleare. Gli altri testi (regolamento e PEG inclusi) restano invariati se non li modifichi. Gli anni nei testi non vengono sostituiti automaticamente.'));
      next.slide.forEach((slide, i) => {
        const details = node('details', undefined, 'year-slide');
        details.append(node('summary', 'Slide ' + (i + 1) + ' · ' + strip(slide.titolo || slide.titolo_barra || slide.tipo.replace('slide_', ''))));
        contents(details, slide, ['slide', i], 'Contenuto');
        body.append(details);
      });
    } else {
      try { review(body) }
      catch (error) { $('year-error').textContent = error.message; $('year-next').disabled = true }
    }
    $('year-step-title').focus();
    $('year-scroll').scrollTop = 0;
  }
  function cancel() {
    if (confirm('Chiudere la procedura e scartare questa bozza annuale? Il setup rimarrà invariato.')) $('year-dialog').close();
  }
  window.NUOVO_ANNO = {
    mount(options) {
      getData = options.getData; apply = options.apply;
      $('nuovo-anno').onclick = () => {
        try {
          source = clone(getData());
          next = window.NUOVO_ANNO_MODEL.draft(source);
          dateTime = '';
          previousPresent = source.censimenti.presenti_attuali;
          step = 0;
          $('year-dialog').showModal(); render();
        } catch (error) { options.error(error.message) }
      };
      $('year-cancel').onclick = cancel;
      $('year-dialog').oncancel = event => { event.preventDefault(); cancel() };
      $('year-dialog').onclose = () => { source = next = prepared = null; $('nuovo-anno').focus() };
      $('year-back').onclick = () => { step--; render() };
      $('year-form').onsubmit = event => {
        event.preventDefault();
        if (step < steps.length - 1) { step++; render(); return }
        try {
          if (JSON.stringify(getData()) !== JSON.stringify(source)) throw new Error('I dati del setup sono cambiati. Chiudi e riapri la procedura per non perderli.');
          prepared = window.NUOVO_ANNO_MODEL.prepare(source, next, previousPresent, dateTime);
          apply(prepared);
          $('year-dialog').close();
        } catch (error) { $('year-error').textContent = error.message }
      };
    }
  };
  addEventListener('beforeunload', event => { if (source) event.preventDefault() });
})();
