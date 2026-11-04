/* Dashboard regia: comanda la presentazione (iframe "principale"), mostra la prossima slide,
   apre la finestra solo-slide per il secondo schermo e controlla lo stato di Firebase. */
(function () {
  const $ = s => document.querySelector(s);
  const L = window.LIVE || {}, A = window.ACCESSO;
  const U = (L.url || '').replace(/\/$/, '');
  const enc = (i, k) => i * 1000 + k;
  const LIMITI = { conn: 100, down: 10 * 1024 ** 3, spazio: 1024 ** 3 };
  const MB_ORA_SPETTATORE = 1;   /* stima: controlli periodici (live, modifiche, assemblea, presenza) */
  let key = A.chiave(), V = null, ultimo = null, finestra = null;

  const pill = (sel, testo, cls) => { const p = $(sel); p.textContent = testo; p.className = 'pill ' + (cls || '') };
  const fmt = b => b < 1024 ** 2 ? Math.max(1, Math.round(b / 1024)) + ' KB' : b < 1024 ** 3 ? (b / 1024 ** 2).toFixed(1) + ' MB' : (b / 1024 ** 3).toFixed(2) + ' GB';
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function meter(id, val, max, testo) {
    const r = Math.min(1, val / max), u = $('#' + id);
    u.style.width = Math.max(r * 100, val > 0 ? 1.5 : 0) + '%';
    u.className = r >= .9 ? 'ko' : r >= .7 ? 'warn' : '';
    $('#' + id + '-t').textContent = testo;
  }

  /* ---------- accesso ---------- */
  function mostraLogin(msg) {
    $('#login').hidden = false; $('#app').hidden = true;
    $('#login-err').textContent = msg || '';
    $('#chiave').focus();
  }
  async function accedi(k) {
    const b = $('#login-form button'); b.disabled = true;
    try { await A.entra(k); key = k; $('#login').hidden = true; avvia() }
    catch (e) { mostraLogin(e.message) }
    finally { b.disabled = false }
  }
  $('#login-form').onsubmit = e => { e.preventDefault(); accedi($('#chiave').value.trim()); $('#chiave').value = '' };
  $('#esci').onclick = () => { A.esci(); location.replace('../area-riservata.html') };

  /* ---------- presentazione ---------- */
  async function avvia() {
    $('#app').hidden = false;
    ['#schermo', '#setup', '#esci'].forEach(s => $(s).hidden = false);
    /* riparte dalla posizione live (es. dopo un ricaricamento della pagina), non dalla prima slide */
    let h = '';
    try { const s = (await leggi('/live/stato.json')).dati; if (s && s.pos > 0) h = '#' + Math.floor(s.pos / 1000) + '.' + s.pos % 1000 } catch (e) { }
    $('#principale').src = 'index.html?vista=principale&regia=' + encodeURIComponent(key) + h;
    $('#anteprima').src = 'index.html?vista=anteprima';
    window.PRESENZA.avvia('r');
    aggancia();
    controlla(); setInterval(controlla, 10000);
    tempo = Date.now(); stimaTraffico(); setInterval(stimaTraffico, 5000);
  }
  function aggancia() {
    const w = $('#principale').contentWindow;
    const v = w && w.VISTA;
    if (!v || !v.stato().n) { setTimeout(aggancia, 200); return }
    V = v; V.onchange = disegna; disegna(V.stato()); setTimeout(controlla, 800);
  }
  const prossima = s => s.k < s.steps ? [s.i, s.k + 1] : s.i < s.n - 1 ? [s.i + 1, 0] : null;
  function anteprima(p) {
    const v = $('#anteprima').contentWindow?.VISTA;
    if (!v) { setTimeout(() => anteprima(p), 200); return }
    if (p) v.vai(p[0], p[1], true);
  }
  function disegna(s) {
    ultimo = s;
    const passo = s.steps ? ' · passo ' + (s.k + 1) + '/' + (s.steps + 1) : '';
    $('#pos').textContent = (s.i + 1) + ' / ' + s.n + passo;
    $('#titolo').textContent = cap(s.titoli[s.i]);
    const p = prossima(s);
    $('#fine').hidden = !!p;
    if (p) {
      $('#pos-next').textContent = p[0] === s.i ? 'stessa slide, passo ' + (p[1] + 1) : (p[0] + 1) + ' / ' + s.n;
      $('#titolo-next').textContent = p[0] === s.i ? 'Continua: ' + cap(s.titoli[s.i]) : cap(s.titoli[p[0]]);
    } else { $('#pos-next').textContent = ''; $('#titolo-next').textContent = 'Ultima slide' }
    anteprima(p);
    $('#prev').disabled = !s.i && !s.k;
    $('#next').disabled = !p;
    const last = s.i === s.n - 1;
    $('#pdf').hidden = $('#termina').hidden = !last;
    const ol = $('#slide');
    if (ol.children.length !== s.n || ol.dataset.t !== s.titoli.join('|')) {
      ol.dataset.t = s.titoli.join('|');
      ol.replaceChildren(...s.titoli.map((t, i) => { const li = document.createElement('li'); li.textContent = cap(t); li.onclick = () => V.vai(i, 0); return li }));
    }
    [...ol.children].forEach((li, i) => { li.classList.toggle('on', i === s.i); li.classList.toggle('nx', !!p && p[0] !== s.i && i === p[0]) });
    ol.children[s.i]?.scrollIntoView({ block: 'nearest' });
  }

  $('#next').onclick = () => V && V.next();
  $('#prev').onclick = () => V && V.prev();
  $('#home').onclick = () => V && V.home();
  $('#odg').onclick = () => V && V.menu();
  $('#pdf').onclick = () => V && V.pdf();
  addEventListener('keydown', e => {
    if (!V || e.target.closest('input,textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); V.next() }
    if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); V.prev() }
  });
  $('#termina').onclick = async () => {
    if (!confirm('Terminare l’assemblea e riportare il sito alla home del gruppo?')) return;
    $('#termina').disabled = true;
    try { await window.ASSEMBLEA.salva(false, key); finestra?.close(); location.replace('../index.html') }
    catch (e) { $('#termina').disabled = false; alert(e.message) }
  };

  /* finestra solo slide: se il browser lo permette si apre già sul secondo schermo */
  $('#schermo').onclick = async () => {
    let f = 'popup,width=1280,height=720';
    try {
      if (window.getScreenDetails) {
        const d = await getScreenDetails();
        const altro = d.screens.find(s => s !== d.currentScreen);
        if (altro) f = `popup,left=${altro.availLeft},top=${altro.availTop},width=${altro.availWidth},height=${altro.availHeight}`;
      }
    } catch (e) { }
    finestra = window.open('index.html?vista=schermo', 'assemblea-schermo', f);
    if (!finestra) alert('Il browser ha bloccato la finestra: consenti i popup per questo sito.');
  };

  /* ---------- stato Firebase ---------- */
  let tempo = 0, scaricati = 0, spettatori = 0, setup = 0;
  function stimaTraffico() {
    const ora = Date.now(), ore = (ora - tempo) / 3600000; tempo = ora;
    scaricati += (spettatori + setup + 2) * MB_ORA_SPETTATORE * 1024 ** 2 * ore;
    meter('m-down', scaricati, LIMITI.down, '≈ ' + fmt(scaricati) + ' di 10 GB/mese');
  }
  async function leggi(path) {
    const r = await fetch(U + path, { cache: 'no-store' });
    if (!r.ok) throw new Error('Firebase ' + r.status);
    const t = await r.text();
    return { dati: JSON.parse(t), byte: t.length };
  }
  async function controlla() {
    const t0 = performance.now();
    try {
      const [pres, live, ass] = await Promise.all([leggi('/presenza.json'), leggi('/live/stato.json'), leggi('/assemblea/stato.json')]);
      const ms = Math.round(performance.now() - t0);
      $('#k-lat').textContent = ms + ' ms';
      $('#k-agg').textContent = 'aggiornato alle ' + new Date().toLocaleTimeString('it-IT');
      pill('#b-fb', 'Firebase ' + (ms > 1500 ? 'lento' : 'ok'), ms > 1500 ? 'warn' : 'ok');

      const c = window.PRESENZA.conta(pres.dati);
      if (c.scaduti.length) fetch(U + '/presenza.json', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(c.scaduti.map(id => [id, null]))) }).catch(() => { });
      spettatori = c.ruoli.p || 0; setup = c.ruoli.s || 0;
      $('#k-disp').textContent = c.totale;
      $('#k-ruoli').textContent = [spettatori + ' pubblico', setup && setup + ' setup', c.ruoli.r && c.ruoli.r + ' regia'].filter(Boolean).join(' · ');
      /* connessioni permanenti: 1 per spettatore (live) + 1 regia + 1 per setup aperto */
      const conn = spettatori + setup + 1;
      meter('m-conn', conn, LIMITI.conn, conn + ' / 100');

      const patch = $('#principale').contentWindow?.MODIFICHE?.patch;
      const spazio = pres.byte + live.byte + ass.byte + (patch === undefined ? 0 : JSON.stringify(patch).length) + 200;
      meter('m-spazio', spazio, LIMITI.spazio, fmt(spazio) + ' di 1 GB');

      if (ass.dati?.attiva) { pill('#b-assemblea', 'Assemblea attiva', 'ok'); $('#avviso').hidden = true }
      else {
        pill('#b-assemblea', 'Assemblea non attiva', 'warn');
        $('#avviso').innerHTML = 'Assemblea non attiva: chi apre il sito vede la home del gruppo. Avviala da <a href="setup.html">Setup → Inizia assemblea</a>.';
        $('#avviso').hidden = false;
      }
      if (ultimo) {
        const ok = live.dati && live.dati.pos === enc(ultimo.i, ultimo.k);
        pill('#b-live', ok ? 'Pubblico allineato' : 'Pubblico in aggiornamento…', ok ? 'live' : 'warn');
      }
    } catch (e) {
      pill('#b-fb', 'Firebase non raggiungibile', 'ko');
      $('#k-lat').textContent = '–'; $('#k-agg').textContent = e.message;
    }
  }

  /* link alla console Firebase (utilizzo reale) */
  try {
    const host = new URL(U).hostname, db = host.split('.')[0], prj = db.replace(/-default-rtdb$/, '');
    $('#console').href = `https://console.firebase.google.com/project/${prj}/database/${db}/usage`;
  } catch (e) { }

  if (!U) { pill('#b-fb', 'Firebase non configurato', 'ko'); return }
  if (key) accedi(key); else mostraLogin();
})();
