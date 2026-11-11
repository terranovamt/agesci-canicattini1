/* Report PDF (A4 verticale, Helvetica) di tutte le votazioni: voti e percentuali. Nessuna libreria esterna. */
window.PDF_REPORT = (function () {
  const esc = t => String(t).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([\\()])/g, '\\$1');
  const W = 595, H = 842, MX = 50, TOP = 60, BOT = 55;
  /* percentuali arrotondate col metodo del resto più grande: la somma fa 100 */
  function percentuali(v) {
    const t = v.reduce((a, b) => a + b, 0);
    if (!t) return v.map(() => 0);
    const q = v.map(n => n * 100 / t), p = q.map(Math.floor);
    let r = 100 - p.reduce((a, b) => a + b, 0);
    q.map((x, i) => [x - p[i], i]).sort((a, b) => b[0] - a[0]).slice(0, r).forEach(([, i]) => p[i]++);
    return p;
  }
  /* voci: [{ domanda, modalita, aperta, ricevuti, opzioni, conteggi }]; presenti: riferimento per quorum (0 = non noto) */
  function crea(titolo, sottotitolo, voci, presenti) {
    const pagine = [];
    let s, y;
    const nuova = () => { if (s !== undefined) pagine.push(s); s = ''; y = H - TOP; };
    const t = (f, sz, x, yy, txt, col = '0.16 0.09 0.31') => { s += `${col} rg BT /F${f} ${sz} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${esc(txt)}) Tj ET\n`; };
    const taglia = (x, n) => String(x).length > n ? String(x).slice(0, n - 1) + '.' : String(x);
    const serve = h => { if (y - h < BOT) nuova(); };
    const grigio = '0.4 0.4 0.45';
    nuova();
    s += `0.29 0.16 0.49 rg 0 ${H - 36} ${W} 36 re f\n`;
    t(2, 12, MX, H - 24, 'AGESCI Canicattini 1', '1 1 1');
    t(2, 20, MX, y, titolo); y -= 20;
    t(1, 11, MX, y, sottotitolo, grigio); y -= 30;
    if (!voci.length) t(1, 12, MX, y, 'Nessuna votazione registrata.', grigio);
    voci.forEach((v, n) => {
      const tot = v.conteggi.reduce((a, b) => a + b, 0), pc = percentuali(v.conteggi);
      const ord = v.opzioni.map((o, i) => ({ o, n: v.conteggi[i], p: pc[i] }));
      if (v.modalita === 'nominativa') ord.sort((a, b) => b.n - a.n);
      const quorum = Math.floor((presenti || v.totale) / 2) + 1;
      let esito = '';
      if (v.aperta) esito = 'Votazione ancora aperta';
      else if (v.modalita === 'scelta') esito = v.conteggi[0] > v.conteggi[1] ? 'APPROVATO' : v.conteggi[0] < v.conteggi[1] ? 'NON APPROVATO' : 'PARITA';
      else { const el = ord.filter(i => i.n >= quorum && i.n > 0); esito = el.length ? (el.length > 1 ? 'ELETTI: ' : 'ELETTO: ') + el.map(i => i.o).join(', ') : 'NESSUN ELETTO'; }
      serve(70 + ord.length * 20);
      s += `0.97 0.78 0 rg ${MX} ${y - 4} 4 18 re f\n`;
      t(2, 13, MX + 12, y, `${n + 1}. ${taglia(v.domanda, 70)}`); y -= 16;
      t(1, 9.5, MX + 12, y, `${v.modalita === 'scelta' ? 'Scelta' : 'Nominativa'} - ${v.aperta ? 'aperta' : 'chiusa'} - ${v.ricevuti} voti ricevuti su ${presenti || v.totale}${v.modalita === 'nominativa' ? ` - quorum ${quorum} (50% + 1)` : ''}`, grigio); y -= 16;
      t(2, 11, MX + 12, y, `Esito: ${esito}`, v.aperta ? grigio : '0.08 0.5 0.25'); y -= 18;
      ord.forEach((i, k) => {
        const top = k === 0 && i.n > 0 && v.modalita === 'nominativa';
        t(top ? 2 : 1, 10.5, MX + 12, y, taglia(i.o, 44));
        t(top ? 2 : 1, 10.5, W - MX - 120, y, String(i.n));
        t(1, 10.5, W - MX - 70, y, `${i.p}%`, grigio);
        const bw = 140, bx = W - MX - 270;
        s += `0.92 0.91 0.95 rg ${bx} ${y - 1} ${bw} 8 re f\n${top ? '0.97 0.78 0' : '0.29 0.16 0.49'} rg ${bx} ${y - 1} ${(bw * i.p / 100).toFixed(1)} 8 re f\n`;
        y -= 18;
      });
      t(1, 9, MX + 12, y, `Totale voti validi: ${tot}`, grigio); y -= 30;
    });
    pagine.push(s);
    const oggetti = ['<< /Type /Catalog /Pages 2 0 R >>', null,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    const ids = [];
    pagine.forEach((pg, i) => {
      const c = pg + `BT /F1 8 Tf 0.5 0.5 0.55 rg ${MX} 30 Td (Pagina ${i + 1} di ${pagine.length}) Tj ET\n`;
      oggetti.push(`<< /Length ${c.length} >>\nstream\n${c}endstream`);
      oggetti.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${oggetti.length} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
      ids.push(oggetti.length);
    });
    oggetti[1] = `<< /Type /Pages /Kids [${ids.map(i => i + ' 0 R').join(' ')}] /Count ${ids.length} >>`;
    let out = '%PDF-1.4\n';
    const pos = [];
    oggetti.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') +
      `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    const b = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
    return new Blob([b], { type: 'application/pdf' });
  }
  return { crea, percentuali };
})();
