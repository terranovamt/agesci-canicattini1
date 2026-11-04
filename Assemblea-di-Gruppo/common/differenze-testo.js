/* Confronto parola per parola tra due testi (usato da modifiche_documento, prima_dopo,
   differenze e dalla versione verticale). */

const tok = s => String(s || '').replace(/<br\s*\/?>/gi, ' ').match(/[\p{L}\p{N}’'\/%°_-]+(?:\.[\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) || [];
const isW = t => /[\p{L}\p{N}]/u.test(t), isP = t => /^[.,;:!?)»”\]]$/.test(t), isO = t => /^[(«“\[]$/.test(t);
const joinT = a => a.reduce((o, t, i) => o + (i && !isP(t) && !isO(a[i - 1]) ? ' ' : '') + t, '');
const render = (segs, fn) => { let o = '', pl = ''; segs.forEach(s => { const m = fn(s); if (!m) return; o += (o && !isP(m.f) && !isO(pl) ? ' ' : '') + m.h; pl = m.l }); return o };
const diffSegs = (A, B) => {
  const k = t => t.toLowerCase(), n = A.length, m = B.length, t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = k(A[i]) === k(B[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const segs = []; let d = [], a = [], q = [];
  const fC = () => { if (d.length && a.length) segs.push({ ty: 'chg', d, a }); else if (d.length) segs.push({ ty: 'del', d }); else if (a.length) segs.push({ ty: 'ins', a }); d = []; a = [] };
  const fE = () => { if (q.length) segs.push({ ty: 'eq', q }); q = [] };
  let i = 0, j = 0;
  while (i < n && j < m) { if (k(A[i]) === k(B[j])) { fC(); q.push(B[j]); i++; j++ } else { fE(); if (t[i + 1][j] >= t[i][j + 1]) d.push(A[i++]); else a.push(B[j++]) } }
  fE(); while (i < n) d.push(A[i++]); while (j < m) a.push(B[j++]); fC();
  return segs
};

/* raggruppa le differenze in FRASI: due modifiche separate da al massimo 2 parole uguali diventano un unico blocco */
const frasi = raw => {
  const o = raw.map(s => s.ty === 'eq' ? { ty: 'eq', q: s.q } : { ty: 'chg', d: [...(s.d || [])], a: [...(s.a || [])] });
  for (let go = true; go;) {
    go = false;
    for (let i = 1; i < o.length - 1; i++) {
      const q = o[i];
      if (q.ty === 'eq' && q.q.filter(isW).length <= 2 && o[i - 1].ty === 'chg' && o[i + 1].ty === 'chg') {
        const p = o[i - 1], n = o[i + 1];
        o.splice(i - 1, 3, { ty: 'chg', d: [...p.d, ...q.q, ...n.d], a: [...p.a, ...q.q, ...n.a] });
        go = true; break
      }
    }
  }
  return o.map(s => s.ty === 'eq' ? s : (s.d.length && s.a.length ? { ty: 'chg', d: s.d, a: s.a } : s.d.length ? { ty: 'del', d: s.d } : { ty: 'ins', a: s.a }));
};

const modoModifiche = (x, A, B, segs) => {
  const com = segs.filter(s => s.ty === 'eq').reduce((n, s) => n + s.q.filter(isW).length, 0), sim = com / Math.max(A.filter(isW).length, B.filter(isW).length, 1);
  return (x.modalita === 'unico' || x.modalita === 'affiancato') ? x.modalita : (sim >= (x.soglia_somiglianza ?? .5) ? 'unico' : 'affiancato');
};
