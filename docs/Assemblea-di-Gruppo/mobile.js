/* Layout verticale, caricato dopo il motore e prima di live.js.
   Le slide senza un layout dedicato usano il formato orizzontale ridimensionato. */
(function () {
  const HDH = 92;
  let PM = innerWidth < 820 && innerHeight > innerWidth,
    SH = 1280;
  const css = document.createElement('style');
  css.textContent = `
body.pm {
  --hd: ${HDH}px;
  --bt: 76px;
  --m: 24px;
  --gap: 12px;
  --r: 20px;
}
body.pm .hd {
  height: var(--hd);
  padding: 0 26px;
}
body.pm .hd span {
  font-size: var(--ht, 36px) !important;
  line-height: 1.08;
}
body.pm .hd img {
  height: 62px;
}
body.pm #nav {
  left: 14px;
  bottom: 16px;
  gap: 10px;
}
body.pm .nb {
  height: 48px;
  min-width: 48px;
  padding: 0 14px;
  border-radius: 24px;
  font-size: 16px;
  opacity: 0.6;
}
body.pm .nb svg {
  width: 24px;
  height: 24px;
}
body.pm #cnt {
  font-size: 22px;
  right: 24px;
  bottom: 26px;
}
body.pm #prog,
body.pm #pm,
body.pm .pmk {
  height: 8px;
}
body.pm .pmk:before {
  height: 8px;
  width: 5px;
}
body.pm .pmk b {
  font-size: 15px;
  padding: 3px 9px;
  bottom: 12px;
  min-width: 22px;
}
body.pm .sec .rr {
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  align-items: center;
  text-align: center;
  padding: 40px 44px 200px;
}
body.pm .sec .rr:after {
  content: none;
}
body.pm .sec .rr:before {
  content: "";
  display: block;
  flex: none;
  width: 120px;
  height: 6px;
  border-radius: 3px;
  background: var(--y);
  margin: 0 auto 34px;
}
body.pm .sec h1 {
  font-size: 84px;
  font-weight: 300;
  line-height: 1.05;
}
body.pm .sec h2 {
  font-size: 30px;
  margin-top: 22px;
}
body.pm .sec .d {
  position: static;
  margin-top: 20px;
  font-size: 30px;
  font-weight: 600;
  color: var(--y);
}
body.pm .sec .ck2 {
  font-size: 120px !important;
}
body.pm .sec .l {
  left: 50%;
  right: auto;
  top: auto;
  bottom: 40px;
  width: auto;
  height: auto;
  transform: translateX(-50%);
  z-index: 2;
  border-radius: 22px;
  padding: 18px 34px;
  gap: 12px;
  font-size: 15px;
  white-space: nowrap;
}
body.pm .sec .l img {
  width: 170px;
}
body.pm .gr {
  top: 34%;
  height: auto;
  padding: 48px 40px;
  flex-direction: column;
  align-items: flex-start;
  gap: 28px;
}
body.pm .gr h1 {
  font-size: 100px;
}
body.pm .gr .bb {
  width: 100%;
}
body.pm .gr img {
  margin: 0;
  height: 110px;
}
body.pm .ls {
  position: absolute;
  left: 0;
  width: 1280px;
  height: 720px;
  transform: scale(0.5625);
  transform-origin: 0 0;
}
body.pm .fl {
  position: absolute;
  left: 0;
  right: 0;
  top: var(--hd);
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--w);
  padding-bottom: var(--bt);
  overflow: hidden;
  font-size: var(--fs, 28px);
  color: var(--ink);
}
body.pm .pbar {
  flex: none;
  height: 8px;
  background: var(--track);
}
body.pm .pbar i {
  display: block;
  height: 100%;
  width: 0;
  background: var(--y);
  transition: width 0.6s;
}
body.pm .pbar.gr2 i {
  background: var(--g);
}
body.pm .th {
  flex: none;
  background: var(--bg);
  padding: 0.55em 0.8em;
  border-bottom: 0.14em solid var(--y);
  font-weight: 800;
  font-size: 1.25em;
  line-height: 1.15;
  color: var(--vd);
}
body.pm .rw {
  flex: 1 0 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.45em 0.8em;
  border-bottom: 1px solid color-mix(in srgb, var(--vl) 60%, transparent);
  line-height: 1.25;
  font-weight: 500;
}
body.pm .rw:last-child {
  border-bottom: 0;
}
body.pm .rw .no {
  flex: none;
  min-width: 1.2em;
  font-weight: 800;
  color: var(--v);
}
body.pm .rw .tt {
  flex: 1;
  min-width: 0;
}
body.pm .sb {
  font-size: 0.85em;
  margin-top: 0.3em;
}
body.pm .sb div {
  display: flex;
  gap: 0.5em;
  margin-top: 0.2em;
}
body.pm .sb b {
  flex: none;
  color: var(--v);
  font-weight: 800;
}
body.pm .rw.rv {
  flex: 1 1 0;
}
body.pm .rv > * {
  opacity: 0;
  transition: opacity 0.45s;
}
body.pm .rv.on > * {
  opacity: 1;
}
body.pm .rw.hl {
  background: color-mix(in srgb, var(--y) 22%, var(--w));
  box-shadow: inset 8px 0 0 var(--y);
}
body.pm .pt {
  display: inline-block;
  font-size: 0.55em;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 0.35em 0.9em;
  border-radius: 1em;
  background: color-mix(in srgb, var(--y) 28%, transparent);
  color: var(--vd);
  white-space: nowrap;
}
body.pm .ent {
  opacity: 0;
  transform: translateY(14px);
  transition:
    opacity 0.5s,
    transform 0.5s;
}
body.pm .ent.on {
  opacity: 1;
  transform: none;
}
body.pm .rw.dn,
body.pm .rw.td {
  flex: 1 1 0;
}
body.pm .rw.dn .ck {
  flex: none;
  width: 1.4em;
  font-weight: 800;
  color: var(--g);
}
body.pm .rw.dn .tt {
  color: var(--v2);
  text-decoration: line-through;
  opacity: 0.8;
}
body.pm .rw.td .no {
  color: var(--vl);
}
body.pm .rw.nxr {
  flex: 3.2 1 0;
  background: var(--y);
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.5em;
  padding: 0.6em 0.8em;
}
body.pm .nxr .pt {
  background: var(--vd);
  color: var(--y);
}
body.pm .nxr .nxt {
  font-size: 1.5em;
  font-weight: 800;
  line-height: 1.15;
  color: var(--vd);
}
body.pm .avr {
  flex: none;
  display: flex;
  justify-content: space-around;
  gap: 12px;
  padding: 18px 24px;
  background: var(--bg);
  border-bottom: 0.14em solid var(--y);
}
body.pm .avc {
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px dashed var(--vl);
  color: var(--vl);
  transition:
    box-shadow 0.4s,
    background 0.4s;
}
body.pm .avc.on {
  border: 0;
  background: linear-gradient(135deg, var(--v), var(--v2));
  color: #fff;
}
body.pm .avc.ac {
  box-shadow: 0 0 0 6px var(--y);
}
body.pm .rw.ogr {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.1em;
}
body.pm .ogr .rl {
  font-size: 0.55em;
  font-weight: 600;
  color: var(--v2);
}
body.pm .ogr .nm {
  font-size: 1.2em;
  font-weight: 800;
  color: var(--vd);
  line-height: 1.1;
}
body.pm .ogr .nt3 {
  font-size: 0.55em;
  opacity: 0.75;
  line-height: 1.3;
}
body.pm .ngn {
  flex: none;
  background: var(--note);
  padding: 0.8em 0.9em;
  font-size: 0.55em;
  font-weight: 600;
  text-align: center;
}
body.pm .mh {
  flex: none;
  background: var(--bg);
  padding: 0.55em 0.8em 0.7em;
  border-bottom: 0.14em solid var(--y);
}
body.pm .mtt {
  font-weight: 800;
  font-size: 1.25em;
  line-height: 1.15;
  color: var(--vd);
  margin-bottom: 0.5em;
}
body.pm .seg {
  display: flex;
  border: 2px solid var(--vl);
  border-radius: 0.6em;
  overflow: hidden;
  font-size: 0.62em;
  font-weight: 600;
  text-align: center;
  color: var(--vd);
}
body.pm .seg span {
  flex: 1;
  padding: 0.6em 0;
  cursor: pointer;
}
body.pm .seg span.on {
  background: var(--v);
  color: #fff;
}
body.pm .mc .tx {
  flex: none;
  padding: 0.7em 0.8em;
  line-height: 1.45;
  font-weight: 500;
  border-bottom: 1px solid color-mix(in srgb, var(--vl) 60%, transparent);
}
body.pm .mc .tx del,
body.pm .mc .tx ins,
body.pm .mc .tx s,
body.pm .mc .tx b {
  font-size: 1em;
  opacity: 1;
  text-decoration: none;
  font-weight: inherit;
  transition:
    font-size 0.5s ease,
    opacity 0.4s ease;
}
body.pm .mc .tx .w {
  border-radius: 0.2em;
  padding: 0 0.12em;
  transition:
    background-color 0.4s,
    color 0.4s;
}
body.pm .mc[data-s="0"] .tx ins,
body.pm .mc[data-s="0"] .tx b {
  font-size: 0;
  opacity: 0;
}
body.pm .mc[data-s="2"] .tx del,
body.pm .mc[data-s="2"] .tx s {
  font-size: 0;
  opacity: 0;
}
body.pm .mc[data-s="1"] .tx del .w {
  background: color-mix(in srgb, var(--r) 16%, transparent);
  border-bottom: 0.1em solid color-mix(in srgb, var(--r) 50%, transparent);
}
body.pm .mc[data-s="1"] .tx ins .w {
  background: color-mix(in srgb, var(--g) 22%, transparent);
  color: var(--g);
  font-weight: 700;
}
body.pm .mc[data-s="1"] .tx s .w {
  background: color-mix(in srgb, var(--y) 55%, transparent);
  text-decoration: line-through;
  color: var(--v2);
}
body.pm .mc[data-s="1"] .tx b .w {
  background: color-mix(in srgb, var(--y) 55%, transparent);
  color: var(--g);
  font-weight: 700;
}
body.pm .mc.nt,
body.pm .mc.nt * {
  transition: none !important;
}
body.pm .cl {
  flex: 1 0 auto;
  padding: 0 0.8em;
  font-size: 0.85em;
}
body.pm .cn {
  font-size: 0.65em;
  color: var(--v2);
  font-weight: 600;
  padding: 0.8em 0 0.3em;
}
body.pm .cr {
  display: flex;
  gap: 0.6em;
  align-items: baseline;
  padding: 0.5em 0;
  border-bottom: 1px solid color-mix(in srgb, var(--vl) 60%, transparent);
  line-height: 1.3;
}
body.pm .cr .sg {
  flex: none;
  width: 0.9em;
  font-weight: 800;
}
body.pm .cr .sg.r {
  color: var(--r);
}
body.pm .cr .sg.g {
  color: var(--g);
}
body.pm .mn {
  flex: none;
  font-size: 0.6em;
  color: var(--v2);
  font-weight: 600;
  padding: 0.6em 1.3em;
}
body.pm .pb {
  position: absolute;
  left: var(--m);
  right: var(--m);
  top: calc(var(--hd) + 18px);
  bottom: var(--bt);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--gap);
  font-size: var(--fs, 26px);
  font-weight: 500;
  color: var(--ink);
}
body.pm .pc {
  background: var(--w);
  border-radius: var(--r);
  box-shadow: 0 10px 30px var(--shadow);
  padding: 0.7em 0.9em;
  flex: none;
  min-width: 0;
}
body.pm .pp {
  opacity: 0;
  transform: translateY(18px);
  transition:
    opacity 0.55s,
    transform 0.55s;
}
body.pm .pp.on {
  opacity: 1;
  transform: none;
}
body.pm .qcv {
  display: flex;
  align-items: center;
  gap: 0.7em;
}
body.pm .qcv .num {
  flex: none;
  font-size: 2.1em;
  line-height: 1;
}
body.pm .qcv .qt {
  flex: 1;
  min-width: 0;
  line-height: 1.25;
}
body.pm .qcv .qt b {
  display: block;
  font-size: 0.85em;
  color: var(--vd);
}
body.pm .qcv .rg {
  font-size: 0.7em;
  font-weight: 600;
  opacity: 0.85;
}
body.pm .qcv .rf {
  font-size: 0.55em;
  opacity: 0.6;
  margin-top: 0.2em;
}
body.pm .qpn {
  display: flex;
  flex-direction: column;
}
body.pm .ql {
  font-size: 0.5em;
  font-weight: 700;
  line-height: 1.2;
}
body.pm .ql small {
  font-weight: 500;
  opacity: 0.7;
  font-size: 1em;
}
body.pm .qs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 0.4em;
}
body.pm .qn {
  font-size: 1.6em;
  font-weight: 800;
  color: var(--vd);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
body.pm .qn.g {
  color: var(--g);
}
body.pm .qn.v {
  color: var(--v);
}
body.pm .qc {
  display: flex;
  gap: 0.4em;
  flex: 1 0 6.5em;
  min-height: 6.5em;
  margin-top: 0.4em;
}
body.pm .qb {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
body.pm .qw {
  flex: 1;
  position: relative;
  min-height: 0;
}
body.pm .qi {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 1.2em;
}
body.pm .qbar {
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: 0;
  height: 0;
  background: var(--vl);
  border-radius: 0.4em 0.4em 0 0;
  transition: height 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
}
body.pm .qv {
  position: absolute;
  bottom: 100%;
  left: -20%;
  right: -20%;
  text-align: center;
  font-size: 0.55em;
  font-weight: 700;
  color: var(--vd);
  padding-bottom: 0.15em;
}
body.pm .qbar i {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
  background: var(--v);
  border-radius: 0.3em 0.3em 0 0;
  transition: height 0.9s 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
}
body.pm .qbar i em {
  font-style: normal;
  font-size: 0.5em;
  color: #fff;
  font-weight: 700;
  padding-top: 0.2em;
}
body.pm .qy {
  text-align: center;
  font-size: 0.5em;
  opacity: 0.65;
  font-weight: 500;
}
body.pm .qy.b {
  font-weight: 800;
  opacity: 1;
}
body.pm .qlg {
  display: flex;
  gap: 1em;
  justify-content: center;
  font-size: 0.5em;
  font-weight: 600;
  margin-top: 0.5em;
}
body.pm .qlg i {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  border-radius: 0.2em;
  margin-right: 0.4em;
  vertical-align: -0.1em;
}
`;
  document.head.append(css);
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
  /* barra del titolo: font il piu' grande possibile su 2 righe */ const fitHdP = () => {
    if (!PM) return;
    const top = Math.floor((HDH - 10) / 2.16);
    for (let f = top; f >= 18; f--) {
      HD.style.setProperty('--ht', f + 'px');
      if (HDs.offsetHeight <= f * 1.08 * 2 + 2) break;
    }
  };
  new MutationObserver(fitHdP).observe(HDs, { childList: true, characterData: true, subtree: true });
  if (document.fonts) document.fonts.ready.then(fitHdP);
  /* titolo grande delle slide titolo/sezione/chiusura: fino a 4 righe */ const fitSec = () => {
    if (!PM) return;
    st.querySelectorAll('.sec h1').forEach((e) => {
      for (let f = 92; f >= 28; f--) {
        e.style.fontSize = f + 'px';
        const lh = parseFloat(getComputedStyle(e).lineHeight) || f * 1.05;
        if (e.offsetHeight <= 4 * lh + 2) break;
      }
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
      for (let f = max; f >= min; f--) {
        box.style.setProperty('--fs', f + 'px');
        const ok = sel
          ? [...box.querySelectorAll(sel)].every((c) => c.scrollHeight <= c.clientHeight + 1)
          : box.scrollHeight <= box.clientHeight + 1;
        if (ok) break;
      }
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
  /* ---------- slide riscritte per il verticale ---------- */ const PORT = {
    /* ===== TESTO ARTICOLI - C: titolo fisso + commi in lista, tutti insieme ===== */ slide_testo_articoli:
      (s) => (r, D) => {
        HEAD(r, s.titolo_barra || 'REGOLAMENTO ASSEMBLEARE');
        const box = mkFl(r);
        (s.articoli || [{ titolo: s.titolo, paragrafi: s.paragrafi || [] }]).forEach((a) => {
          if (a.titolo) box.append(h(`<div class="th">${a.titolo}</div>`));
          (a.paragrafi || []).forEach((p, i) => {
            const o = norm(p),
              sub = (o.sottopunti || [])
                .map((t, j) => `<div><b>${String.fromCharCode(97 + j)})</b><span>${t}</span></div>`)
                .join('');
            box.append(
              h(
                `<div class="rw"><b class="no">${i + 1}</b><div class="tt">${o.testo}${sub ? `<div class="sb">${sub}</div>` : ''}</div></div>`,
              ),
            );
          });
        });
        fitBox(box, 40, 15);
        return { steps: 0, show() {} };
      },
    /* ===== MODIFICHE AL DOCUMENTO - C: selettore fisso + testo + elenco modifiche ===== */ slide_modifiche_documento:
      (x) => (r, D) => {
        HEAD(r, x.titolo_barra || 'MODIFICHE AL DOCUMENTO');
        const A = tok(x.prima),
          B = tok(x.dopo),
          segs = frasi(diffSegs(A, B));
        const unico = modoModifiche(x, A, B, segs) === 'unico';
        const sp = (f, pl, out) => (out && !isP(f) && !isO(pl) ? ' ' : '');
        const W = (t) => `<span class="w">${t}</span>`,
          last = (a) => a[a.length - 1];
        let out = '',
          pl = '';
        segs.forEach((s) => {
          if (s.ty === 'eq') {
            out += sp(s.q[0], pl, out) + joinT(s.q);
            pl = last(s.q);
          } else if (s.ty === 'del') {
            out += `<del>${sp(s.d[0], pl, out)}${W(joinT(s.d))}</del>`;
          } else if (s.ty === 'ins') {
            out += `<ins>${sp(s.a[0], pl, out)}${W(joinT(s.a))}</ins>`;
            pl = last(s.a);
          } else {
            out += `<s>${sp(s.d[0], pl, out)}${W(joinT(s.d))}</s><b>${sp(s.a[0], pl, out)}${W(joinT(s.a))}</b>`;
            pl = last(s.a);
          }
        });
        const ch = [],
          nC = segs.filter((s) => s.ty !== 'eq').length;
        segs.forEach((s) => {
          if (s.ty === 'eq') return;
          if (s.d && s.d.length) ch.push(['−', 'r', joinT(s.d)]);
          if (s.a && s.a.length) ch.push(['+', 'g', joinT(s.a)]);
        });
        const LB = [
          x.etichetta_prima || 'Attuale',
          x.etichetta_modifiche || 'Modifiche',
          x.etichetta_dopo || 'Proposto',
        ];
        const box = mkFl(r, 'mc nt');
        box.dataset.s = 0;
        box.innerHTML = `<div class="mh">${x.titolo ? `<div class="mtt">${x.titolo}</div>` : ''}<div class="seg">${LB.map((t) => `<span>${t}</span>`).join('')}</div></div><div class="tx">${out}</div><div class="cl"><div class="cn">${nC} ${nC === 1 ? 'cambiamento' : 'cambiamenti'}</div>${ch.map((c) => `<div class="cr"><span class="sg ${c[1]}">${c[0]}</span><span>${c[2]}</span></div>`).join('')}</div>${x.nota ? `<div class="mn">${x.nota}</div>` : ''}`;
        const tabs = [...box.querySelectorAll('.seg span')];
        let kk = -1;
        tabs.forEach(
          (t, i) =>
            (t.onclick = (ev) => {
              ev.stopPropagation();
              go(si, unico ? i : i === 1 ? 1 : 0);
              if (!unico) setS(i === 1 && sk < 1 ? 0 : i);
            }),
        );
        tabs.forEach((t) => {
          t.dataset.liveControl = '';
        });
        const setS = (k) => {
          box.dataset.s = k;
          tabs.forEach((t, i) => t.classList.toggle('on', i === k));
        };
        /* misura col passo 1 (testo piu' lungo), senza transizioni */ const fitM = () => {
          box.classList.add('nt');
          box.dataset.s = 1;
          for (let f = 38; f >= 14; f--) {
            box.style.setProperty('--fs', f + 'px');
            if (box.scrollHeight <= box.clientHeight + 1) break;
          }
          setS(Math.max(kk, 0));
          void box.offsetWidth;
          requestAnimationFrame(() => {
            if (!INST) box.classList.remove('nt');
          });
        };
        fitM();
        if (document.fonts) document.fonts.ready.then(fitM);
        return {
          steps: unico ? 2 : 1,
          show(k) {
            k = unico ? k : k > 0 ? 1 : 0;
            if (k === kk) return;
            const first = kk < 0;
            kk = k;
            if (first || INST) box.classList.add('nt');
            else box.classList.remove('nt');
            setS(k);
          },
        };
      },
    /* ===== ORDINE DEL GIORNO - C: righe piene, ultimo punto comparso evidenziato ===== */ slide_ordine_del_giorno:
      (x) => (r, D) => {
        HEAD(r, x.titolo_barra || 'ORDINE DEL GIORNO');
        const L = x.punti.map(norm),
          box = mkFl(r),
          pb = h('<div class="pbar"><i></i></div>');
        box.append(pb);
        const els = L.map((p, i) => {
          const e = h(`<div class="rw rv"><b class="no">${i + 1}</b><span class="tt">${p.testo}</span></div>`);
          link(e, p);
          box.append(e);
          return e;
        });
        fitBox(box, 46, 16, '.rw');
        return {
          steps: L.length,
          show(k) {
            els.forEach((e, i) => {
              e.classList.toggle('on', i < k);
              e.classList.toggle('hl', i === k - 1);
            });
            pb.firstChild.style.width = (L.length ? (k / L.length) * 100 : 0) + '%';
          },
        };
      },
    /* ===== AVANZAMENTO ODG - C: fatti (compatti) / prossimo (grande, giallo) / da fare ===== */ slide_avanzamento_odg:
      (x) => (r, D) => {
        HEAD(r, x.titolo_barra || 'ORDINE DEL GIORNO');
        const base = (D.slide || []).find((s) => s.tipo === 'slide_ordine_del_giorno') || { punti: [] };
        const L = base.punti.map(norm),
          n = Math.min(Math.max(x.completati || 0, 0), L.length),
          box = mkFl(r);
        const pb = h('<div class="pbar gr2"><i></i></div>');
        box.append(pb);
        L.forEach((p, i) => {
          let cls, html;
          if (i < n) {
            cls = 'dn';
            html = `<span class="ck">✓</span><span class="tt">${p.testo}</span>`;
          } else if (i === n) {
            cls = 'nxr';
            html = `<span class="pt">PROSSIMO</span><div class="nxt">${i + 1}. ${p.testo}</div>`;
          } else {
            cls = 'td';
            html = `<b class="no">${i + 1}</b><span class="tt">${p.testo}</span>`;
          }
          const e = h(`<div class="rw ent ${cls}">${html}</div>`);
          link(e, p);
          box.append(e);
          setTimeout(() => e.classList.add('on'), INST ? 0 : 250 + i * 160);
        });
        setTimeout(
          () => {
            pb.firstChild.style.width = (L.length ? (n / L.length) * 100 : 0) + '%';
          },
          INST ? 0 : 300,
        );
        fitBox(box, 40, 14, '.rw');
        return { steps: 0, show() {} };
      },
    /* ===== COMPOSIZIONE ORGANO - C: fila di avatar fissa + righe ruolo/nome ===== */ slide_composizione_organo:
      (x) => (r, D) => {
        HEAD(r, x.titolo_barra || 'COMPOSIZIONE ORGANO ASSEMBLEARE');
        const P = x.persone,
          n = P.length,
          box = mkFl(r, 'og');
        const sz = Math.max(48, Math.min(120, Math.floor((720 - 48 - (n - 1) * 12) / n)));
        const av = h('<div class="avr"></div>');
        box.append(av);
        const avs = P.map(() => {
          const e = h(
            `<div class="avc" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.5)}px">?</div>`,
          );
          av.append(e);
          return e;
        });
        const rows = P.map((p) => {
          const e = h(
            `<div class="rw ogr rv"><span class="rl">${p.ruolo}</span><div class="nm">${p.nome}</div>${p.nota ? `<div class="nt3">${p.nota}</div>` : ''}</div>`,
          );
          box.append(e);
          return e;
        });
        if (x.nota_generale) box.append(h(`<div class="ngn">${x.nota_generale}</div>`));
        fitBox(box, 40, 14, '.rw');
        return {
          steps: n,
          show(k) {
            avs.forEach((e, i) => {
              const on = i < k;
              e.classList.toggle('on', on);
              e.classList.toggle('ac', i === k - 1);
              e.textContent = on ? P[i].icona : '?';
            });
            rows.forEach((e, i) => {
              e.classList.toggle('on', i < k);
              e.classList.toggle('hl', i === k - 1);
            });
          },
        };
      },
    /* ===== QUORUM E CONVOCAZIONI - A: due schede, poi pannello con grafico ===== */ slide_quorum_convocazioni:
      (x) => (r, D) => {
        HEAD(r, x.titolo_barra || 'COSTITUZIONE DELL’ASSEMBLEA');
        const CS = D.censimenti,
          cm = !!CS,
          b = mkBody(r),
          ore = [D.assemblea.prima_convocazione, D.assemblea.seconda_convocazione];
        const els = x.convocazioni.map((c, i) => {
          const e = h(
            `<div class="pc pp qcv" style="border-top:.25em solid ${i ? 'var(--g)' : 'var(--y)'}"><div class="num">${ore[i] ?? c.orario}</div><div class="qt"><b>${c.nome}</b><div class="rg">${c.regola}</div>${c.riferimento_articolo ? `<div class="rf">${c.riferimento_articolo}</div>` : ''}</div></div>`,
          );
          b.append(e);
          return e;
        });
        let panel = null,
          vals = [];
        if (cm) {
          const N = CS.censiti_attuali,
            Q = Math.floor(N / 2) + 1,
            PA = CS.presenti_attuali,
            hp = PA != null;
          const nrm = (v) => (typeof v === 'object' ? v : { censiti: v });
          const hist = Object.entries(CS.storico_per_anno || {}).map(([a, v]) => [
            a,
            nrm(v).censiti,
            nrm(v).presenti ?? null,
          ]);
          hist.push([String(D.anno_esercizio), N, PA ?? null]);
          const mx = Math.max(1, ...hist.map((p) => p[1]));
          const stat = (lab, cls) => `<div><div class="ql">${lab}</div><div class="qn ${cls}">0</div></div>`;
          panel = h(
            `<div class="pc pp qpn"><div class="qs">${stat('Censiti ' + D.anno_esercizio, '')}${stat('Quorum 1ª conv. <small>(50% + 1)</small>', 'g')}${hp ? stat(`Presenti <small>(${Math.round((PA / N) * 100)}%)</small>`, 'v') : ''}</div>${hp ? `<div style="text-align:center;margin-top:.5em"><span class="pt" style="background:${PA >= Q ? 'var(--g)' : 'var(--y)'};color:${PA >= Q ? '#fff' : 'var(--vd)'}">${PA >= Q ? '✓ Quorum raggiunto' : 'Mancano ' + (Q - PA) + ' per il quorum'}</span></div>` : ''}<div class="qlg"><span><i style="background:var(--vl)"></i>Censiti</span><span><i style="background:var(--v)"></i>Presenti</span></div><div class="qc">${hist.map((p, i) => `<div class="qb"><div class="qw"><div class="qi"><div class="qbar" data-h="${(p[1] / mx) * 100}"><span class="qv">${p[1]}</span>${p[2] != null ? `<i data-h="${Math.min(100, Math.max((p[2] / p[1]) * 100, 6))}"><em>${p[2]}</em></i>` : ''}</div></div></div><div class="qy${i === hist.length - 1 ? ' b' : ''}">${p[0]}</div></div>`).join('')}</div></div>`,
          );
          b.append(panel);
          vals = [N, Q, PA];
        }
        /* font piu' grande possibile; poi il pannello occupa tutto lo spazio rimasto e il grafico si allunga */ const run =
          () => {
            if (panel) panel.style.flex = 'none';
            if (!cm) els.forEach((e) => (e.style.flex = '1 1 0'));
            const g = parseFloat(getComputedStyle(b).rowGap) || 0;
            for (let f = 40; f >= 13; f--) {
              b.style.setProperty('--fs', f + 'px');
              const ok = cm
                ? [...b.children].reduce((s, c) => s + c.offsetHeight, 0) + g * (b.children.length - 1) <=
                  b.clientHeight - 2
                : els.every((c) => c.scrollHeight <= c.clientHeight + 1);
              if (ok) break;
            }
            if (panel) panel.style.flex = '1 1 0';
          };
        run();
        if (document.fonts) document.fonts.ready.then(run);
        return {
          steps: els.length + (cm ? 1 : 0),
          show(k) {
            els.forEach((e, i) => e.classList.toggle('on', i < k));
            if (!cm) return;
            const on = k > els.length;
            panel.classList.toggle('on', on);
            panel.querySelectorAll('.qbar,.qbar i').forEach((e) => (e.style.height = on ? e.dataset.h + '%' : '0'));
            [...panel.querySelectorAll('.qn')].forEach((el, i) => {
              if (on) cnum(el, vals[i]);
              else {
                el._v = 0;
                el.textContent = '0';
              }
            });
          },
        };
      },
  };
  PORT.slide_prima_dopo = (x) => PORT.slide_modifiche_documento({ ...x, modalita: 'affiancato' });
  /* slide che mantengono la struttura originale e vengono solo adattate dal CSS */ const NATIVE = new Set([
    'slide_titolo',
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
        if (PORT[k]) return PORT[k](x)(r, D);
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
