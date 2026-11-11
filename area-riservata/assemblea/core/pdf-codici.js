/* PDF minimo (solo testo, Helvetica) con l'elenco dei codici di voto: nessuna libreria esterna. */
window.PDF_CODICI = (function () {
  const esc = t => String(t).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([\\()])/g, '\\$1');
  function crea(titolo, righe) {
    const W = 595, H = 842, M = 48, RIGA = 22, PER = Math.floor((H - 2 * M - 40) / RIGA);
    const pagine = [];
    for (let i = 0; i < Math.max(righe.length, 1); i += PER) pagine.push(righe.slice(i, i + PER));
    const col = [M, 270, 380, 480];
    const flussi = pagine.map((rs, p) => {
      let y = H - M;
      let s = `BT /F2 16 Tf ${M} ${y} Td (${esc(titolo)}) Tj ET\n`;
      y -= 34;
      const riga = (v, f) => v.forEach((t, c) => { s += `BT /F${f} 11 Tf ${col[c]} ${y} Td (${esc(t)}) Tj ET\n`; });
      riga(['Nome e cognome', 'Codice socio', 'Branca', 'Codice voto'], 2);
      s += `${M} ${y - 6} m ${W - M} ${y - 6} l S\n`;
      y -= RIGA;
      rs.forEach(r => { riga([r.nome, r.codice, r.branca, r.personale], 1); y -= RIGA; });
      s += `BT /F1 9 Tf ${M} 24 Td (Pagina ${p + 1} di ${pagine.length} - codice personale e segreto: non cederlo) Tj ET\n`;
      return s;
    });
    const oggetti = ['<< /Type /Catalog /Pages 2 0 R >>', null,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    const ids = [];
    flussi.forEach(s => {
      oggetti.push(`<< /Length ${s.length} >>\nstream\n${s}endstream`);
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
  return { crea };
})();
