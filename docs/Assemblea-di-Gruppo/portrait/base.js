/* Layout verticale (telefono in verticale), caricato dopo il motore e prima di common/live.js.
   Ogni tipo di slide verticale è in portrait/<tipo>.js e portrait/<tipo>.css;
   le slide senza un layout dedicato usano il formato orizzontale ridimensionato. */
const PORTRAIT = {},
  PORTRAIT_UTIL = {};
(function () {
  const HDH = 92;
  let PM = innerWidth < 820 && innerHeight > innerWidth,
    SH = 1280;
  let rotated = false,
    exporting = false;
  removeEventListener('resize', fit);
  /* ---------- palco ---------- */ fit = function () {
    const W = innerWidth,
      H = innerHeight - (window.LIVE?.ruolo === 'pubblico' ? 64 : 0);
    const previous = PM,
      previousHeight = SH;
    PM = !exporting && !rotated && W < 820 && innerHeight > W;
    document.body.classList.toggle('pm', PM);
    if (PM) {
      const k = W / 720;
      SH = H / k;
      st.style.width = '720px';
      st.style.height = SH + 'px';
      st.style.transform = `scale(${k})`;
    } else {
      const k = rotated ? Math.min(W / 720, H / 1280) : Math.min(W / 1280, H / 720);
      st.style.width = '1280px';
      st.style.height = '720px';
      st.style.transform = rotated
        ? `translate(${(W - 720 * k) / 2 + 720 * k}px,${(H - 1280 * k) / 2}px) rotate(90deg) scale(${k})`
        : `translate(${(W - 1280 * k) / 2}px,${(H - 720 * k) / 2}px) scale(${k})`;
    }
    if (!exporting && (PM !== previous || (PM && Math.abs(SH - previousHeight) > 1)) && window.DATI && scenes.length)
      start(window.DATI);
  };
  window.mobileLayout = {
    rotate(value) {
      rotated = value;
      fit();
    },
  };
  addEventListener('resize', fit);
  fit();
  /* true se il testo va a capo lasciando una riga finale troppo corta (una parola o poche lettere) */ const orphan = (el) => {
    if (el.querySelector('br')) return false;
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const rs = [...rg.getClientRects()].filter((q) => q.width > 1);
    const rows = [...new Set(rs.map((q) => Math.round(q.top / 4)))];
    if (rows.length < 2) return false;
    const last = rs.filter((q) => Math.round(q.top / 4) === rows[rows.length - 1]),
      w = Math.max(...last.map((q) => q.right)) - Math.min(...last.map((q) => q.left));
    return w < el.clientWidth * 0.3;
  };
  /* barra del titolo: font il piu' grande possibile su 2 righe, senza parole sole sull'ultima riga */ const fitHdP = () => {
    if (!PM) return;
    const top = Math.floor((HDH - 10) / 2.16);
    let first = 0;
    for (let f = top; f >= 18; f--) {
      HD.style.setProperty('--ht', f + 'px');
      if (HDs.offsetHeight <= f * 1.08 * 2 + 2 && HDs.scrollWidth <= HDs.clientWidth + 1) {
        if (!first) first = f;
        if (!orphan(HDs)) return;
      }
    }
    HD.style.setProperty('--ht', (first || 18) + 'px');
  };
  new MutationObserver(fitHdP).observe(HDs, { childList: true, characterData: true, subtree: true });
  if (document.fonts) document.fonts.ready.then(fitHdP);
  /* titolo grande delle slide titolo/sezione/chiusura: fino a 4 righe */ const fitSec = () => {
    if (!PM) return;
    st.querySelectorAll('.sec h1').forEach((e) => {
      let first = 0;
      for (let f = 92; f >= 28; f--) {
        e.style.fontSize = f + 'px';
        const lh = parseFloat(getComputedStyle(e).lineHeight) || f * 1.05;
        if (e.offsetHeight <= 4 * lh + 2 && e.scrollWidth <= e.clientWidth + 1) {
          if (!first) first = f;
          if (!orphan(e)) return;
        }
      }
      e.style.fontSize = (first || 28) + 'px';
    });
  };
  new MutationObserver(fitSec).observe(st, { childList: true });
  if (document.fonts) document.fonts.ready.then(fitSec);
  /* ---------- utilita' ---------- */ const HEAD = (r, t) => {
    band(r, t);
    cnt.className = '';
  };
  const norm = (p) => (typeof p === 'string' ? { testo: p } : p);
  const mkFl = (r, extra = '') => {
    const e = h(`<div class="fl ${extra}"></div>`);
    r.append(e);
    return e;
  };
  const mkBody = (r) => {
    const e = h('<div class="pb"></div>');
    r.append(e);
    return e;
  };
  /* ssceglie il font piu' grande per cui il contenuto sta nel box (sel = controlla ogni riga) */ const fitBox = (
    box,
    max,
    min,
    sel,
  ) => {
    const run = () => {
      box.classList.add('fitting');
      for (let f = max; f >= min; f--) {
        box.style.setProperty('--fs', f + 'px');
        const ok = sel
          ? [...box.querySelectorAll(sel)].every((c) => c.scrollHeight <= c.clientHeight + 1)
          : box.scrollHeight <= box.clientHeight + 1;
        if (ok) break;
      }
      box.classList.remove('fitting');
    };
    run();
    if (document.fonts) document.fonts.ready.then(run);
  };
  const cnum = (el, to, dur = 900) => {
    if (INST) dur = 1;
    const from = el._v || 0;
    el._v = to;
    const t0 = performance.now();
    cancelAnimationFrame(el._r);
    (function f(t) {
      const p = Math.min(1, (t - t0) / dur),
        e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) el._r = requestAnimationFrame(f);
    })(t0);
  };
  const link = (e, p) => {
    if (p.slide_collegata) {
      e.dataset.liveControl = '';
      e.style.cursor = 'pointer';
      e.onclick = (ev) => {
        ev.stopPropagation();
        jump(p.slide_collegata);
      };
    }
  };
  /* riduce in scala (--z) le dimensioni dei blocchi finche' il contenuto sta nello schermo (telefoni piccoli) */ const zfit = (box) => {
    const run = () => {
      box.classList.add('zf');
      for (let z = 1; z >= 0.5; z -= 0.05) {
        box.style.setProperty('--z', z.toFixed(2));
        if (box.scrollHeight <= box.clientHeight + 1) break;
      }
      box.classList.remove('zf');
    };
    run();
    if (document.fonts) document.fonts.ready.then(run);
  };
  Object.assign(PORTRAIT_UTIL, { HEAD, norm, mkFl, mkBody, fitBox, cnum, link, zfit });
  /* slide che mantengono la struttura originale e vengono solo adattate dal CSS */ const NATIVE = new Set([
    'slide_titolo',
    'slide_qr_live',
    'slide_divisore_sezione',
    'slide_chiusura',
    'slide_foto_gruppo',
    'slide_grazie',
  ]);
  /* fallback provvisorio: slide orizzontale rimpicciolita, finche' non scegliamo il design */ const FB =
    (f) => (r, D) => {
      const o = f(r, D),
        ls = h('<div class="ls"></div>'),
        k = 720 / 1280;
      while (r.firstChild) ls.append(r.firstChild);
      r.append(ls);
      ls.style.top = (r.dataset.hd !== undefined ? HDH - 72 * k : (SH - 720 * k) / 2) + 'px';
      return o;
    };
  Object.keys(T).forEach((k) => {
    const o = T[k];
    T[k] = (x) => {
      const f = o(x);
      return (r, D) => {
        if (!PM || NATIVE.has(k)) return f(r, D);
        if (PORTRAIT[k]) return PORTRAIT[k](x)(r, D);
        return FB(f)(r, D);
      };
    };
  });
  /* il PDF si esporta sempre in formato orizzontale: durante l'esportazione tolgo gli stili verticali */ const ex =
    exportPdf;
  exportPdf = async function () {
    if (pdfBusy) return;
    exporting = true;
    PM = false;
    document.body.classList.remove('pm');
    st.style.visibility = 'hidden';
    try {
      await ex();
    } finally {
      exporting = false;
      fit();
      st.style.visibility = '';
    }
  };
  if (window.DATI && scenes.length && PM) start(window.DATI);
})();
