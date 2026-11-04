/* ---- esporta tutte le slide in PDF (stato finale, senza animazioni) ---- */
let pdfBusy = false;
async function exportPdf() {
  if (pdfBusy || !scenes.length) return; pdfBusy = true;
  const oldCnt = cnt.className, lbl = bP.querySelector('span'); lbl.textContent = 'Preparo…';
  INST = true;                                   /* contatori e animazioni istantanei */
  const P = document.createElement('div'); P.id = 'pr'; document.body.append(P);
  scenes.forEach(sc => {
    const ps = h('<div class="ps"></div>'); P.append(ps);
    if (sc.ph && ph.style.backgroundImage) ps.style.background = ph.style.backgroundImage + ' center/cover no-repeat';
    const r = h('<div class="slide in"></div>'); ps.append(r);
    const o = sc.f(r, D); o.show(o.steps);        /* ultimo passo = stato finale */
    if (r.dataset.hd !== undefined) {
      const hd = h('<div class="hd"><span></span><img src="img/logo.png"></div>');
      hd.firstChild.textContent = r.dataset.hd; ps.append(hd); fitTitle(hd.firstChild, 30, 14, 2);
    }
  });
  /* la ciambella del patrimonio usa dei timer: aspetta che finisca */
  const wait = scenes.some(s => s.tipo === 'slide_patrimonio_ciambella') ? 9000 : 1200;
  await new Promise(res => setTimeout(res, wait));
  if (document.fonts) await document.fonts.ready;
  const done = () => { P.remove(); INST = false; cnt.className = oldCnt; lbl.textContent = 'PDF'; pdfBusy = false; removeEventListener('afterprint', done) };
  addEventListener('afterprint', done);
  window.print();
}
const bP = h('<button class="nb" title="Salva tutte le slide come PDF (P)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 20h16"/></svg><span>PDF</span></button>');
bP.style.display = 'none'; nav.append(bP);
bP.onclick = e => { e.stopPropagation(); exportPdf() };

/* il bottone PDF si vede solo sull'ultima slide */
const _go = go;
go = (i, k) => { _go(i, k); bP.style.display = i === scenes.length - 1 ? 'flex' : 'none' };
addEventListener('keydown', e => { if (e.key === 'p' && !e.ctrlKey && !e.metaKey && si === scenes.length - 1) exportPdf() });
