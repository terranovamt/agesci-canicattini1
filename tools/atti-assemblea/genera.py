#!/usr/bin/env python3
"""Genera i PDF di verbale e deliberazioni a partire dai modelli Word in modelli/.

I Word sono la fonte: modificali e rilancia lo script, i PDF si rigenerano da quelli.
- Verbale: un solo PDF.
- Deliberazioni: un PDF per ogni mozione (ogni "Assemblea di Gruppo" = Heading 1 inizia una mozione).
- Con --db (nas.sqlite) i conteggi "n. SI / NO / ASTENUTI" delle deliberazioni 1 e 2 sono presi dalle
  votazioni segrete; senza --db restano i valori scritti nel Word.
Richiede: python-docx e google-chrome (stampa PDF). Uso:
  python3 tools/atti-assemblea/genera.py [--db nas.sqlite] [--out tools/atti-assemblea/pdf]
"""
import argparse, base64, html, re, shutil, sqlite3, subprocess, tempfile, zipfile
from pathlib import Path

import docx
from docx.oxml.ns import qn

QUI = Path(__file__).resolve().parent
# deliberazione -> id della slide di votazione "scelta" (Favorevole/Contrario/Astenuto)
MAPPA_VOTI = {1: "votazione-bilancio", 2: "votazione-contributo"}
CSS = """
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font: 12pt/1.35 Roboto, Carlito, 'Liberation Sans', sans-serif; color: #000 }
table.pag { width: 210mm; border-collapse: collapse; page-break-after: always }
table.pag:last-child { page-break-after: auto }
.pag > thead > tr > td, .pag > tfoot > tr > td, .pag > tbody > tr > td { padding: 0 }
.testata { position: relative; height: 58mm }
.band { position: absolute; left: 12mm; top: 10mm; width: 186mm }
.logo { position: absolute; left: 12mm; top: 20mm; height: 25mm }
.intest { position: absolute; left: 40mm; top: 22mm; width: 150mm; font: 8.5pt/1.4 Tahoma, 'DejaVu Sans', sans-serif; color: #462678 }
.intest b { font-size: 12pt; display: block }
.foot { height: 26mm; padding: 0 12mm; display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10mm;
  font: 7.5pt Tahoma, 'DejaVu Sans', sans-serif; color: #462678 }
.foot img { height: 9mm }
.corpo { padding: 0 20mm 0 30mm }
.corpo p { margin: 0 0 6pt; white-space: pre-wrap }
.h1 { font: bold 16pt Tahoma, 'DejaVu Sans', sans-serif; color: #462678; text-align: center; margin: 12pt 0 6pt }
.h2 { font: bold 12pt/1.5 Tahoma, 'DejaVu Sans', sans-serif; color: #45387e; text-align: right; margin: 15pt 0 15pt }
.azione { font: 10pt/1.5 Tahoma, 'DejaVu Sans', sans-serif; text-align: center; margin: 3pt 0 !important; letter-spacing: .5pt }
.voto { font: 10pt/1.5 Tahoma, 'DejaVu Sans', sans-serif; text-align: right; margin-top: 45pt !important }
.corpo table { width: 100%; border-collapse: collapse; margin: 12pt 0 }
.corpo td { padding: 3pt 6pt; font-size: 11pt }
"""


def pt(r):
    return r.font.size.pt if r.font.size else None


def runs_html(p):
    out = []
    for r in p.runs:
        t = html.escape(r.text).replace("\t", "&emsp;")
        if not t:
            continue
        st = []
        if pt(r):
            st.append(f"font-size:{pt(r)}pt")
        t = f'<span style="{";".join(st)}">{t}</span>' if st else t
        if r.bold: t = f"<b>{t}</b>"
        if r.italic: t = f"<i>{t}</i>"
        if r.underline: t = f"<u>{t}</u>"
        out.append(t)
    return "".join(out)


def blocchi(d):
    """Elenco ordinato di (tipo, html) con i salti pagina espliciti del Word."""
    body = d.element.body
    pars = {p._p: p for p in d.paragraphs}
    tabs = {t._tbl: t for t in d.tables}
    out = []
    for el in body.iterchildren():
        if el in tabs:
            righe = "".join("<tr>" + "".join(f"<td>{html.escape(c.text)}</td>" for c in r.cells) + "</tr>" for r in tabs[el].rows)
            out.append(("tab", f"<table>{righe}</table>"))
        elif el in pars:
            p = pars[el]
            if 'w:type="page"' in el.xml:
                out.append(("pagina", ""))
            stile = p.style.name
            testo = runs_html(p)
            if not p.text.strip():
                continue
            if stile == "Heading 1": out.append(("h1", f'<p class="h1">{testo}</p>'))
            elif stile == "Heading 2": out.append(("h2", f'<p class="h2">{testo}</p>'))
            elif stile == "Azione": out.append(("p", f'<p class="azione">{testo}</p>'))
            elif stile == "Proponenti/Voto": out.append(("p", f'<p class="voto">{testo}</p>'))
            else:
                al = {1: "center", 2: "right", 3: "justify"}.get(p.alignment, "left")
                out.append(("p", f'<p style="text-align:{al}">{testo}</p>'))
    return out


def img(zf, nome):
    dati = zf.read("word/media/" + nome)
    mime = "image/png" if nome.endswith("png") else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(dati).decode()


def pagina(zf, contenuto):
    return f"""<table class="pag"><thead><tr><td><div class="testata"><img class="band" src="{img(zf, 'image2.jpeg')}"><img class="logo" src="{img(zf, 'image1.png')}">
<div class="intest"><b>AGESCI Gruppo Canicattini1</b>Associazione di Promozione Sociale - APS<br>Codice fiscale: 930137990899<br>
Via P. Jolanda 91 – 96010 Canicattini Bagni (SR)<br>canicattini1@sicilia.agesci.it – canicattini1@pec.agesci.it<br>gruppi.agesci.it/canicattini1</div></div></td></tr></thead>
<tbody><tr><td><div class="corpo">{contenuto}</div></td></tr></tbody>
<tfoot><tr><td><div class="foot"><span>Iscritta al Registro Unico Nazionale del Terzo Settore, sezione APS – repertorio n.67311 del 7/11/2022</span>
<img src="{img(zf, 'image3.jpeg')}"></div></td></tr></tfoot></table>"""


def pdf(pagine_html, dest):
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / "a.html"
        f.write_text(f"<!doctype html><meta charset=utf-8><style>{CSS}</style><body>{''.join(pagine_html)}", encoding="utf-8")
        browser = shutil.which("google-chrome") or shutil.which("chromium")
        subprocess.run([browser, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                        f"--user-data-dir={tmp}/p", f"--print-to-pdf={dest}", f.as_uri()], check=True, capture_output=True)


def voti_db(db, slide):
    con = sqlite3.connect(db)
    r = con.execute("SELECT id, mode FROM vote_polls WHERE slide=?", (slide,)).fetchone()
    if not r or r[1] != "scelta":
        return None
    n = dict(con.execute("SELECT option,n FROM vote_tally WHERE poll_id=?", (r[0],)).fetchall())
    return [n.get(i, 0) for i in range(3)]


def scrivi_voti(d, db):
    """Aggiorna le righe 'n. X SI, n. Y NO, n. Z ASTENUTI' (numeri in grassetto) di ogni deliberazione."""
    num = 0
    for p in d.paragraphs:
        m = re.fullmatch(r"Deliberazione n\. (\d+)", p.text.strip())
        if p.style.name == "Heading 2" and m: num = int(m.group(1))
        if num in MAPPA_VOTI and "SI," in p.text and "NO," in p.text:
            v = voti_db(db, MAPPA_VOTI[num]) if db else None
            if v:
                grassetti = [r for r in p.runs if r.bold and r.text.strip().isdigit()]
                for r, x in zip(grassetti, v): r.text = str(x)


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:60]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db"); ap.add_argument("--out", default=str(QUI / "pdf")); ap.add_argument("--modelli", default=str(QUI / "modelli"))
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for f in sorted(Path(a.modelli).glob("*.docx")):
        d = docx.Document(f)
        scrivi_voti(d, a.db)
        zf = zipfile.ZipFile(f)
        bl = blocchi(d)
        if f.name.startswith("Verbale"):
            pdf([pagina(zf, "".join(h for _, h in bl))], out / "Verbale-Assemblea.pdf")
            continue
        mozioni, corr = [], None
        for tipo, h in bl:
            if tipo == "h1": corr = []; mozioni.append(corr)
            if corr is not None and tipo != "pagina": corr.append((tipo, h))
        for m in mozioni:
            num = re.search(r"Deliberazione n\. (\d+)", re.sub("<[^>]+>", "", "".join(h for t, h in m if t == "h2"))).group(1)
            ogg = next((re.sub("<[^>]+>|&emsp;", "", h) for t, h in m if "Oggetto" in h), "")
            pdf([pagina(zf, "".join(h for _, h in m))], out / f"Deliberazione-{num}-{slug(ogg.replace('Oggetto:', '').replace('&emsp;', ''))}.pdf")


main()
