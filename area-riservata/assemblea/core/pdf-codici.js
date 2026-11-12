/* PDF minimo (Helvetica) con i cartoncini dei codici di voto: nessuna libreria esterna. */
window.PDF_CODICI = (function () {
  const esc = t => String(t).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([\\()])/g, '\\$1');
  // Larghezze Helvetica-Bold ASCII in millesimi di em; gli accenti mantengono la larghezza della lettera.
  const boldWidths = [
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
  ];
  const nameWidth = t => [...String(t).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
    .reduce((sum, c) => sum + (boldWidths[c.charCodeAt(0) - 32] || 1000), 0) / 1000;
  const nameLines = (name, width, size) => {
    const text = String(name).trim().replace(/\s+/g, ' ');
    if (nameWidth(text) * size <= width) return [text];
    const spaces = [...text.matchAll(/ /g)].map(m => m.index);
    const breaks = spaces.length ? spaces : Array.from({ length: text.length - 1 }, (_, i) => i + 1);
    const split = breaks.reduce((best, at) => {
      const lines = [text.slice(0, at).trim(), text.slice(at).trim()];
      const widest = Math.max(...lines.map(nameWidth));
      return !best || widest < best.widest ? { lines, widest } : best;
    }, null);
    return split.lines;
  };
  /* A4 orizzontale, griglia 5x4 di cartoncini ad angoli vivi, da ritagliare lungo i bordi */
  function crea(titolo, righe) {
    const W = 842, H = 595, MX = 21, MY = 20, COL = 5, RIG = 4, PER = COL * RIG;
    const cw = (W - 2 * MX) / COL, ch = (H - 2 * MY) / RIG, HEAD = 30, BOX = 40;
    const taglia = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '.' : String(t));
    const n = v => v.toFixed(2);
    const testo = (f, sz, x, y, t, extra = '0 Tc') => `BT /F${f} ${sz} Tf ${extra} ${n(x)} ${n(y)} Td (${esc(t)}) Tj ET\n`;
    const pagine = [];
    for (let i = 0; i < Math.max(righe.length, 1); i += PER) pagine.push(righe.slice(i, i + PER));
    const flussi = pagine.map(rs => {
      let s = '0.5 w\n';
      rs.forEach((r, k) => {
        const x = MX + (k % COL) * cw, y = H - MY - (Math.floor(k / COL) + 1) * ch;
        const lines = nameLines(r.nome, cw - 20, 13);
        const nameSize = Math.min(13, (cw - 20) / Math.max(...lines.map(nameWidth)));
        const branca = ['Adulti', 'Branca Adulti'].includes(r.branca) ? 'CO.CA.' : r.branca;
        s += `q ${n(x)} ${n(y)} ${n(cw)} ${n(ch)} re W n\n`;
        s += `0.29 0.16 0.49 rg ${n(x)} ${n(y + ch - HEAD)} ${n(cw)} ${HEAD} re f\n`;
        s += '1 1 1 rg\n' + testo(2, 9.5, x + 10, y + ch - 13, 'AGESCI Canicattini 1') + testo(1, 8, x + 10, y + ch - 24, taglia(titolo, 38));
        s += '0.16 0.09 0.31 rg\n';
        lines.forEach((line, index) => {
          s += testo(2, Math.floor(nameSize * 100) / 100, x + 10, y + ch - HEAD - 16 - index * 14, line);
        });
        s += '0.35 0.35 0.4 rg\n' + testo(1, 8.5, x + 10, y + ch - HEAD - 44, taglia(`Socio ${r.codice}  -  ${branca}`, 40));
        s += `0.97 0.78 0 rg ${n(x + 10)} ${n(y + 16)} ${n(cw - 20)} ${BOX} re f\n`;
        s += '0.16 0.09 0.31 rg\n' + testo(2, 7, x + 14, y + 16 + BOX - 10, 'CODICE DI VOTO') + testo(2, 24, x + 14, y + 22, r.personale, '5 Tc');
        s += '0.35 0.35 0.4 rg\n' + testo(1, 6.5, x + 10, y + 7, 'Personale e segreto: non cederlo');
        s += `Q\n0.6 0.6 0.65 RG ${n(x)} ${n(y)} ${n(cw)} ${n(ch)} re S\n`;
      });
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
