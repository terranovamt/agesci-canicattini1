/* common/salva-dati.js — riscrive il testo di dati.js con i nuovi dati, cambiando solo le parti modificate:
   commenti e formattazione restano dove sono.
   Usato dalla pagina di setup per "Salva su GitHub". */
(function () {
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const deq = (a, b) => {
    if (a === b) return true;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deq(x, b[i]));
    if (plain(a) && plain(b)) { const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every(k => k in b && deq(a[k], b[k])) }
    return false;
  };

  /* ---------- lettura del testo ---------- */
  function skipString(t, i) { const q = t[i]; i++; while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++ } return i + 1 }
  function skipComment(t, i) {
    if (t.startsWith('//', i)) { const n = t.indexOf('\n', i); return n < 0 ? t.length : n }
    if (t.startsWith('/*', i)) { const n = t.indexOf('*/', i + 2); return n < 0 ? t.length : n + 2 }
    return i;
  }
  function skipTrivia(t, i, end) {
    for (; ;) {
      while (i < end && /\s/.test(t[i])) i++;
      const j = skipComment(t, i);
      if (j === i || i >= end) return Math.min(i, end);
      i = j;
    }
  }
  /* separa gli elementi di un oggetto/lista che inizia in t[i] */
  function split(t, i) {
    let d = 0, j = i + 1; const commas = [];
    while (j < t.length) {
      const c = t[j];
      if (c === '"' || c === "'" || c === '`') { j = skipString(t, j); continue }
      const k = skipComment(t, j); if (k !== j) { j = k; continue }
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { if (d === 0) return { commas, end: j }; d-- }
      else if (c === ',' && d === 0) commas.push(j);
      j++;
    }
    throw new Error('parentesi non chiusa in dati.js');
  }
  function valueEnd(t, i, end) {
    let last = i;
    while (i < end) {
      const k = skipTrivia(t, i, end); if (k >= end) break; i = k;
      i = (t[i] === '"' || t[i] === "'" || t[i] === '`') ? skipString(t, i) : i + 1;
      last = i;
    }
    return last;
  }
  function items(t, i) {
    const { commas, end } = split(t, i);
    const starts = [i + 1, ...commas.map(c => c + 1)], ends = [...commas, end];
    const out = []; let closing = '', comma = false;
    starts.forEach((s, k) => {
      const e = ends[k], vs = skipTrivia(t, s, e);
      if (vs >= e) { closing = t.slice(s, e); comma = k > 0; return }
      const ve = valueEnd(t, vs, e);
      out.push({ lead: t.slice(s, vs), vs, ve, trail: t.slice(ve, e) });
    });
    const last = out.at(-1);
    if (last && !comma) { closing = last.trail; last.trail = '' }
    /* il commento sulla stessa riga dopo la virgola appartiene all'elemento precedente */
    out.forEach((x, k) => {
      if (k === 0) { x.pre = x.lead; return }
      const nl = x.lead.indexOf('\n');
      out[k - 1].post = nl < 0 ? '' : x.lead.slice(0, nl);
      x.pre = nl < 0 ? x.lead : x.lead.slice(nl);
    });
    out.forEach(x => { x.post = x.post || '' });
    return { list: out, end, closing, comma };
  }
  const indentAt = (t, i) => t.slice(t.lastIndexOf('\n', i - 1) + 1).match(/^[ \t]*/)[0];
  const childIndent = (list, ind) => { const m = list.map(x => x.pre.match(/\n([ \t]*)$/)).find(Boolean); return m ? m[1] : ind + '  ' };
  const multiline = list => list.some(x => x.pre.includes('\n'));
  function join(open, list, closing, comma, close) {
    return open + list.map((x, k) => x.pre + x.val + (k < list.length - 1 || comma ? ',' : '') + x.post).join('') + closing + close;
  }

  /* ---------- scrittura dei valori nuovi ---------- */
  function one(v) {
    if (Array.isArray(v)) return '[' + v.map(one).join(', ') + ']';
    if (plain(v)) { const e = Object.entries(v); return e.length ? '{ ' + e.map(([k, x]) => JSON.stringify(k) + ': ' + one(x)).join(', ') + ' }' : '{}' }
    return JSON.stringify(v);
  }
  function fmt(v, ind) {
    const o = one(v);
    const empty = Array.isArray(v) ? !v.length : plain(v) ? !Object.keys(v).length : true;
    if (empty || ind.length + o.length <= 120) return o;
    const ii = ind + '  ';
    if (Array.isArray(v)) return '[\n' + v.map(x => ii + fmt(x, ii)).join(',\n') + '\n' + ind + ']';
    return '{\n' + Object.entries(v).map(([k, x]) => ii + JSON.stringify(k) + ': ' + fmt(x, ii)).join(',\n') + '\n' + ind + '}';
  }

  /* ---------- riscrittura ---------- */
  function rewrite(t, vs, ve, a, b, win) {
    if (deq(a, b)) return t.slice(vs, ve);
    const ind = indentAt(t, vs);
    if (t[vs] === '{' && plain(a) && plain(b)) return rewriteObj(t, vs, a, b, ind, win);
    if (t[vs] === '[' && Array.isArray(a) && Array.isArray(b)) return rewriteArr(t, vs, a, b, ind, win);
    return fmt(b, ind);
  }
  function rewriteObj(t, vs, a, b, ind, win) {
    const { list, closing, comma } = items(t, vs);
    const ci = childIndent(list, ind), ml = multiline(list);
    const out = [], seen = new Set();
    list.forEach(x => {
      let key, ke;
      if (t[x.vs] === '"' || t[x.vs] === "'") { ke = skipString(t, x.vs); key = Function('return ' + t.slice(x.vs, ke))() }
      else { const m = t.slice(x.vs).match(/^[\w$]+/); if (!m) throw new Error('chiave non riconosciuta'); key = m[0]; ke = x.vs + key.length }
      seen.add(key);
      if (!(key in b)) return;
      const c = skipTrivia(t, ke, x.ve), s = skipTrivia(t, c + 1, x.ve);
      out.push({ ...x, val: t.slice(x.vs, s) + rewrite(t, s, x.ve, a[key], b[key], win) + x.trail });
    });
    Object.keys(b).filter(k => !seen.has(k)).forEach(k => out.push({ pre: ml ? '\n' + ci : ' ', val: JSON.stringify(k) + ': ' + fmt(b[k], ci), post: '' }));
    if (!out.length) return '{}';
    return join('{', out, list.length ? closing : (ml ? '\n' + ind : ' '), comma, '}');
  }
  function rewriteArr(t, vs, a, b, ind, win) {
    const { list, closing, comma } = items(t, vs);
    if (!list.length) return fmt(b, ind);
    let pos = 0;
    list.forEach(x => {
      const src = t.slice(x.vs, x.ve);
      x.spread = src.startsWith('...');
      x.v = Function('window', 'return (' + (x.spread ? src.slice(3) : src) + ')')(win);
      x.pos = pos; pos += x.spread ? (x.v || []).length : 1;
    });
    const ci = childIndent(list, ind), ml = multiline(list);
    const used = new Set(), out = [];
    const free = f => list.filter(x => !used.has(x) && f(x));
    const similar = (x, y) => plain(x) && plain(y) ? x.tipo === y.tipo && x.id === y.id && (x.tipo !== undefined || x.nome === y.nome || x.descrizione === y.descrizione) : Array.isArray(x) && Array.isArray(y);
    for (let i = 0; i < b.length;) {
      const sp = free(x => x.spread && x.v && x.v.length && deq(b.slice(i, i + x.v.length), x.v))[0];
      if (sp) { used.add(sp); out.push({ ...sp, val: t.slice(sp.vs, sp.ve) + sp.trail }); i += sp.v.length; continue }
      const eq = free(x => !x.spread && deq(x.v, b[i]))[0];
      if (eq) { used.add(eq); out.push({ ...eq, val: t.slice(eq.vs, eq.ve) + eq.trail }); i++; continue }
      const cands = free(x => !x.spread && similar(x.v, b[i]));
      const cand = cands.find(x => x.pos === i) || cands[0];
      if (cand) { used.add(cand); out.push({ ...cand, val: rewrite(t, cand.vs, cand.ve, cand.v, b[i], win) + cand.trail }); i++; continue }
      out.push({ pre: ml ? '\n' + ci : (out.length ? ' ' : ''), val: fmt(b[i], ci), post: '' }); i++;
    }
    if (!out.length) return '[]';
    return join('[', out, closing, comma, ']');
  }

  function valuta(testo) {
    const win = {};
    Function('window', testo)(win);
    if (!plain(win.DATI)) throw new Error('dati.js non definisce window.DATI');
    return win.DATI;
  }

  /* testo: dati.js attuale; nuovo: oggetto DATI desiderato */
  function genera(testo, nuovo) {
    const win = {};
    const vecchio = valuta(testo);
    const m = /window\.DATI\s*=\s*/.exec(testo);
    if (!m || testo[m.index + m[0].length] !== '{') throw new Error('in dati.js non trovo "window.DATI = {"');
    const i = m.index + m[0].length, e = split(testo, i).end + 1;
    let out = testo.slice(0, i) + rewrite(testo, i, e, vecchio, nuovo, win) + testo.slice(e);
    let ok = false;
    try { ok = deq(valuta(out), nuovo) } catch (err) { }
    if (!ok) {
      /* riserva: file completo senza commenti interni */
      out = testo.slice(0, i) + fmt(nuovo, '') + ';\n';
      if (!deq(valuta(out), nuovo)) throw new Error('impossibile generare dati.js');
    }
    return out;
  }

  window.SALVA_DATI = { genera, valuta, deq };
})();
