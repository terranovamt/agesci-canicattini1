(function () {
  const $ = id => document.getElementById(id);
  let started = false;
  async function assembly() {
    $('dashboard-assembly-retry').hidden = true;
    $('dashboard-assembly-title').textContent = 'Caricamento…';
    $('dashboard-assembly-details').textContent = 'Lettura dei dati pubblicati.';
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'Assemblea-di-Gruppo/dati.js?t=' + Date.now();
        script.onload = () => { script.remove(); resolve() };
        script.onerror = () => { script.remove(); reject(new Error('Impossibile caricare dati.js')) };
        document.head.append(script);
      });
      const data = window.DATI;
      if (!data?.assemblea || !Number.isSafeInteger(data.anno_esercizio) || !Array.isArray(data.slide)) {
        throw new Error('Dati dell’assemblea incompleti');
      }
      const plain = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      $('dashboard-assembly-title').textContent = plain(data.assemblea.titolo);
      const visible = data.slide.filter(slide => !slide.nascosta && slide.tipo !== 'slide_gruppo_invisibile').length;
      $('dashboard-assembly-details').textContent = [
        'Esercizio ' + data.anno_esercizio,
        data.anno_scout ? 'Anno scout ' + data.anno_scout : '',
        plain(data.assemblea.data),
        'Convocazioni: ' + data.assemblea.prima_convocazione + ' / ' + data.assemblea.seconda_convocazione,
        visible + ' slide visibili'
      ].filter(Boolean).join(' · ');
    } catch (error) {
      $('dashboard-assembly-title').textContent = 'Riepilogo non disponibile';
      $('dashboard-assembly-details').textContent = error.message;
      $('dashboard-assembly-retry').hidden = false;
    }
  }
  async function documents() {
    $('dashboard-documents-retry').hidden = true;
    $('dashboard-documents-status').textContent = 'Caricamento dell’indice PDF…';
    $('dashboard-document-links').replaceChildren();
    try {
      const response = await fetch('documents/index.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Caricamento PDF non riuscito (HTTP ' + response.status + ')');
      const items = await response.json();
      if (!Array.isArray(items) || items.some(item => typeof item?.file !== 'string'
        || !/^[^/\\]+\.pdf$/i.test(item.file) || item.file.startsWith('.') || typeof item.title !== 'string')) {
        throw new Error('Indice PDF non valido');
      }
      $('dashboard-documents-status').textContent = items.length ? items.length + ' documenti disponibili sul sito.' : 'Nessun PDF pubblicato. Aggiungi il primo dalla gestione documenti.';
      items.slice(0, 3).forEach(item => {
        const li = document.createElement('li'), link = document.createElement('a');
        link.textContent = item.title;
        link.href = 'documents/pdf/' + encodeURIComponent(item.file);
        link.target = '_blank'; link.rel = 'noopener';
        link.setAttribute('aria-label', item.title + ' (PDF, nuova scheda)');
        li.append(link); $('dashboard-document-links').append(li);
      });
    } catch (error) {
      $('dashboard-documents-status').textContent = error.message;
      $('dashboard-documents-retry').hidden = false;
    }
  }
  window.AREA_DASHBOARD = {
    load() {
      if (started || !window.ACCESSO.verificata()) return;
      started = true;
      $('dashboard-assembly-retry').onclick = assembly;
      $('dashboard-documents-retry').onclick = documents;
      assembly(); documents();
    }
  };
})();
