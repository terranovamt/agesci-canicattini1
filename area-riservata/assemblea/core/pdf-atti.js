/* Motore PDF per gli atti (verbale, deliberazioni): Helvetica, A4, intestazione e piè di pagina ripetuti, testo giustificato. Nessuna libreria. */
window.PDF_ATTI = (function () {
  const W = 595, H = 842, ML = 85, MR = 57, TOP = 168, BOT = 76, CW = W - ML - MR;
  const AW = { r: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500], b: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556] };
  const SPECIALI = { '\u20ac': 128, '\u2018': 145, '\u2019': 146, '\u201c': 147, '\u201d': 148, '\u2022': 149, '\u2013': 150, '\u2014': 151, '\u2026': 133 };
  const code = ch => { const c = ch.charCodeAt(0); return SPECIALI[ch] || (c < 256 ? c : 63); };
  const enc = t => Array.from(String(t), ch => String.fromCharCode(code(ch))).join('');
  const esc = t => enc(t).replace(/([\\()])/g, '\\$1');
  const larg = (t, sz, b) => { let w = 0; for (const ch of t) { const c = code(ch); w += (AW[b ? 'b' : 'r'][c - 32] || 0); } return w * sz / 1000; };
  const dim = j => { let i = 2; while (i < j.length) { if (j[i] !== 0xff) { i++; continue; } const m = j[i + 1]; if (m >= 0xc0 && m <= 0xc3) return [(j[i + 7] << 8) | j[i + 8], (j[i + 5] << 8) | j[i + 6]]; i += 2 + ((j[i + 2] << 8) | j[i + 3]); } return [1, 1]; };
  const bin = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const VIOLA = '0.275 0.149 0.471';

  /* **grassetto** -> parole con stile */
  function parole(t, bold0) {
    const out = []; let b = !!bold0;
    String(t).split('**').forEach((seg, i) => { if (i) b = !b; seg.split(/(\s+)/).forEach(w => { if (w) out.push({ w, b }); }); });
    return out;
  }
  function righe(t, sz, larghezza, bold0) {
    const ws = parole(t, bold0), out = []; let r = [], l = 0;
    const chiudi = () => { while (r.length && /^\s+$/.test(r[r.length - 1].w)) r.pop(); if (r.length) out.push(r); r = []; l = 0; };
    ws.forEach(p => {
      const w = larg(p.w, sz, p.b);
      if (/^\s+$/.test(p.w)) { if (r.length) { r.push(p); l += w; } return; }
      if (l + w > larghezza && r.length) chiudi();
      r.push(p); l += larg(p.w, sz, p.b);
    });
    chiudi();
    return out;
  }
  /* blocchi: {t:'h1'|'h2'|'p'|'az'|'voto'|'tab', x, giust, bold, dx, prima}; imgs: {banda, logo, wagggs} (Uint8Array JPEG) */
  function crea(blocchi, imgs) {
    const pagine = []; let s, y;
    const nuova = () => { s = ''; y = H - TOP; pagine.push(() => s); };
    const col = c => (c ? c + ' rg ' : '0 g ');
    const testo = (x, yy, t, sz, bold, c, sp) => `BT /F${bold ? 2 : 1} ${sz} Tf ${sp || 0} Tc ${x.toFixed(2)} ${yy.toFixed(2)} Td ${col(c)}(${esc(t)}) Tj ET\n`;
    function riga(r, sz, x0, larghezza, align, ultima, giust, c) {
      const tw = r.reduce((a, p) => a + larg(p.w, sz, p.b), 0);
      const spazi = r.filter(p => /^\s+$/.test(p.w)).length;
      let x = x0, extra = 0;
      if (align === 'center') x = x0 + (larghezza - tw) / 2; else if (align === 'right') x = x0 + larghezza - tw;
      else if (giust && !ultima && spazi) extra = (larghezza - tw) / spazi;
      r.forEach(p => { const w = larg(p.w, sz, p.b) + (/^\s+$/.test(p.w) ? extra : 0); if (!/^\s+$/.test(p.w)) s += testo(x, y, p.w, sz, p.b, c); x += w; });
    }
    nuova();
    blocchi.forEach(b => {
      if (b.t === 'pagina') { nuova(); return; }
      const st = { h1: [16, 'center', 1, VIOLA, 6, 14], h2: [12, 'right', 1, '0.27 0.22 0.49', 12, 14], az: [10, 'center', 0, null, 2, 2], voto: [10, 'right', 0, null, 4, 36], p: [11, b.align || 'left', 0, null, 6, 0] }[b.t];
      if (b.t === 'tab') {
        const celle = b.righe, n = celle[0].length, cw = CW / n; y -= 8;
        celle.forEach(r => { if (y - 16 < BOT) nuova(); r.forEach((c, i) => { s += testo(ML + i * cw, y, c, 11, 0, null); }); y -= 17; });
        y -= 6; return;
      }
      const [sz, al, bd, c, dopo, prima] = st, lh = sz * 1.4;
      y -= prima + (b.prima || 0);
      const rs = righe(b.x, sz, CW, bd || b.bold);
      rs.forEach((r, i) => { if (y - lh < BOT) { nuova(); } y -= lh; riga(r, sz, ML, CW, al, i === rs.length - 1, b.giust, c); });
      y -= dopo;
    });
    /* oggetti */
    const og = ['<< /Type /Catalog /Pages 2 0 R >>', null,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    const imm = {};
    [['banda', 'Im1'], ['logo', 'Im2'], ['wagggs', 'Im3']].forEach(([k, nome]) => {
      const u = imgs[k], [w, h] = dim(u); const d = bin(u);
      og.push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${d.length} >>\nstream\n${d}\nendstream`);
      imm[k] = { id: og.length, nome, w, h };
    });
    const pos = (k, x, yy, wd) => { const m = imm[k]; return `q ${wd} 0 0 ${(wd * m.h / m.w).toFixed(2)} ${x} ${yy} cm /${m.nome} Do Q\n`; };
    const intest = () => {
      const ya = H - 28 - 527 * imm.banda.h / imm.banda.w;
      let t = pos('banda', 34, ya, 527) + pos('logo', 34, H - 160, 59);
      t += testo(113, H - 82, 'AGESCI Gruppo Canicattini1', 12, 1, VIOLA);
      ['Associazione di Promozione Sociale - APS', 'Codice fiscale: 930137990899', 'Via P. Jolanda 91 \u2013 96010 Canicattini Bagni (SR)',
        'canicattini1@sicilia.agesci.it \u2013 canicattini1@pec.agesci.it', 'gruppi.agesci.it/canicattini1'].forEach((l, i) => { t += testo(113, H - 96 - i * 11, l, 8.5, 0, VIOLA); });
      t += testo(34, 30, 'Iscritta al Registro Unico Nazionale del Terzo Settore, sezione APS \u2013 repertorio n.67311 del 7/11/2022', 7, 0, VIOLA);
      t += pos('wagggs', 500, 26, 61);
      return t;
    };
    const ids = [];
    pagine.forEach(f => {
      const c = intest() + f();
      og.push(`<< /Length ${enc(c).length} >>\nstream\n${enc(c)}\nendstream`);
      og.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${og.length} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${Object.values(imm).map(m => `/${m.nome} ${m.id} 0 R`).join(' ')} >> >> >>`);
      ids.push(og.length);
    });
    og[1] = `<< /Type /Pages /Kids [${ids.map(i => i + ' 0 R').join(' ')}] /Count ${ids.length} >>`;
    let out = '%PDF-1.4\n'; const off = [];
    og.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${og.length + 1}\n0000000000 65535 f \n` + off.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${og.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    const u8 = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
    return u8;
  }
  /* ZIP senza compressione */
  function zip(files) {
    const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const parts = [], cen = []; let off = 0;
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    files.forEach(f => {
      const nome = new TextEncoder().encode(f.nome), c = crc(f.dati);
      const loc = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(c), ...u32(f.dati.length), ...u32(f.dati.length), ...u16(nome.length), 0, 0, ...nome]);
      parts.push(loc, f.dati);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(c), ...u32(f.dati.length), ...u32(f.dati.length), ...u16(nome.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nome]));
      off += loc.length + f.dati.length;
    });
    const cl = cen.reduce((a, b) => a + b.length, 0);
    const fine = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), 0, 0]);
    return new Blob([...parts, ...cen, fine], { type: 'application/zip' });
  }
  return { crea, zip, larg };
})();
