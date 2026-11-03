/* ---- slide_cambio_date: prima / dopo del triennio, con la linea che barra il vecchio ---- */
const cambioDate = x => (r, D) => {
  band(r, x.titolo_barra || 'ALLINEAMENTO ANNO SCOUT'); cnt.className = '';
  const p = x.pannello || {};
  r.append(h(`<div class="a" style="left:60px;top:120px;width:500px"><div class="lab" style="color:var(--v2)">${p.etichetta || ''}</div><div style="font-weight:800;font-size:36px;line-height:1.15;margin-top:14px;color:var(--vd)">${p.titolo || ''}</div><div style="width:90px;height:6px;background:var(--y);border-radius:3px;margin:26px 0"></div><div style="font-size:19px;line-height:1.5;color:var(--v2)">${p.testo || ''}</div></div>`));
  const mk = (top, lab, yr, col, old) => h(`<div class="card" style="left:620px;top:${top}px;width:600px;height:170px;padding:26px 36px;opacity:0;transform:translateY(24px);transition:opacity .6s,transform .6s;${col ? 'border-left:12px solid ' + col : ''}"><div class="k" style="font-weight:800;letter-spacing:1.5px;color:${col || 'var(--v2)'}">${lab}</div><div style="position:relative;isolation:isolate;display:inline-block;font-weight:800;font-size:58px;line-height:1;margin-top:14px;color:${old ? '#7d7d8c' : 'var(--v)'};white-space:nowrap">${yr}${old ? '<span class="cdl" style="position:absolute;left:-6%;right:-6%;top:12%;bottom:8%;z-index:-1;border-radius:12px;background:color-mix(in srgb,var(--r) 14%,transparent);transform:scaleX(0);transform-origin:left;transition:transform .8s ease"></span>' : ''}</div></div>`);
  const a = mk(130, x.etichetta_prima || 'PRIMA', x.prima, '', true), arr = h('<div style="position:absolute;left:880px;top:316px;font:800 46px Montserrat,Arial,sans-serif;color:var(--v2);opacity:0;transition:opacity .5s">↓</div>'), b = mk(380, x.etichetta_dopo || 'DOPO', x.dopo, 'var(--g)', false);
  r.append(a, arr, b);
  const cl = a.querySelector('.cdl'); let tm = [];
  const set = (on) => { a.style.opacity = on ? 1 : 0; a.style.transform = on ? 'none' : 'translateY(24px)'; b.style.opacity = on ? 1 : 0; b.style.transform = on ? 'none' : 'translateY(24px)'; arr.style.opacity = on ? 1 : 0; if (cl) cl.style.transform = on ? 'scaleX(1)' : 'scaleX(0)' };
  const play = () => { tm.forEach(clearTimeout); tm = []; set(false); if (INST) { set(true); return } r.offsetWidth; tm.push(setTimeout(() => { a.style.opacity = 1; a.style.transform = 'none' }, 300)); tm.push(setTimeout(() => { if (cl) cl.style.transform = 'scaleX(1)' }, 1000)); tm.push(setTimeout(() => arr.style.opacity = 1, 1700)); tm.push(setTimeout(() => { b.style.opacity = 1; b.style.transform = 'none' }, 2100)) };
  return { steps: 0, show() { play() } };
};

LANDSCAPE.slide_cambio_date = cambioDate;
