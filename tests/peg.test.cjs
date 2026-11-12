const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const currentPegPath = "peg/edizioni/2026-2028.html";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(
  (command) => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0,
);

test("home introduces the dedicated PEG page and the original PDF stays available", () => {
  assert.match(read("index.html"), /class="peg-home-link" href="peg\/"\s*>\s*Consulta il PEG 26-28/);
  assert.match(
    read("peg/index.html"),
    /location\.replace\('edizioni\/2026-2028\.html' \+ location\.search \+ location\.hash\)/,
  );
  assert.match(read("peg/index.html"), /href="edizioni\/2026-2028\.html"/);
  assert.match(read(currentPegPath), /href="\.\.\/\.\.\/documents\/pdf\/PEG26-28\.pdf" download/);
  assert.ok(fs.existsSync(path.join(root, "documents/pdf/PEG26-28.pdf")));
  assert.doesNotMatch(read(currentPegPath), /home.js|assemblea.js|iframe|peg-trail/);
  assert.equal((read(currentPegPath).match(/<dt>/g) || []).length, 8);
  assert.match(read("index.html"), /src="assets\/js\/site-menu\.js"/);
  assert.match(read(currentPegPath), /src="\.\.\/\.\.\/assets\/js\/site-menu\.js"/);
  assert.match(read(currentPegPath), /src="\.\.\/\.\.\/assets\/js\/peg\.js"/);
  assert.match(read("index.html"), /href="assets\/css\/home\.css"/);
  assert.match(read(currentPegPath), /href="\.\.\/\.\.\/assets\/css\/home\.css"/);
  assert.match(read(currentPegPath), /href="\.\.\/\.\.\/assets\/css\/peg\.css"/);
  for (const page of [
    "index.html",
    "area-riservata/index.html",
    "area-riservata/documenti.html",
    "peg/index.html",
    currentPegPath,
    "area-riservata/assemblea/index.html",
    "area-riservata/assemblea/regia.html",
    "area-riservata/assemblea/setup.html",
    "area-riservata/assemblea/guida.html",
  ]) {
    const html = read(page);
    for (const [, resource] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
      if (/^(?:https?:|#)/.test(resource)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(page), resource)), `${page}: ${resource}`);
    }
  }
  for (const stylesheet of ["assets/css/home.css", "assets/css/peg.css", "assets/css/gestione-documenti.css"]) {
    const css = read(stylesheet);
    for (const [, resource] of css.matchAll(/url\(["']?([^)"']+)["']?\)/g)) {
      if (/^(?:data:|https?:|#)/.test(resource)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(stylesheet), resource)), `${stylesheet}: ${resource}`);
    }
  }
  const areas = read(currentPegPath).match(/<article class="peg-area[\s\S]*?<\/article>/g);
  for (const area of areas) {
    assert.ok(area.indexOf("<blockquote") < area.indexOf('class="peg-goals-labels"'));
    assert.match(area, /<\/p>\s*<blockquote[\s\S]*?<\/blockquote>\s*<div class="peg-goals-labels"/);
  }
  for (const image of read(currentPegPath).matchAll(/src="(\.\.\/assets\/peg\/[^"]+)"/g))
    assert.ok(fs.existsSync(path.resolve(root, currentPegPath, "..", image[1])));
  const photoSources = [
    ...read(currentPegPath).matchAll(
      /<picture>\s*<source srcset="([^"]+\.webp)" type="image\/webp"\s*\/>\s*<img[\s\S]*?src="([^"]+\.jpg)"[\s\S]*?<\/picture>/g,
    ),
  ];
  assert.equal(photoSources.length, 4);
  for (const [, webp, jpeg] of photoSources) {
    assert.ok(fs.existsSync(path.resolve(root, currentPegPath, "..", webp)));
    assert.ok(fs.existsSync(path.resolve(root, currentPegPath, "..", jpeg)));
  }
  for (const link of read(currentPegPath).matchAll(/(?:href|src)="(\.\.\/[^"#]+)"/g))
    assert.ok(fs.existsSync(path.resolve(root, currentPegPath, "..", link[1])), link[1]);
  assert.ok(fs.existsSync(path.join(root, "assets/fonts/caveat.ttf")));
  assert.match(read("assets/fonts/OFL-Caveat.txt"), /SIL OPEN FONT LICENSE/);
});

test("PEG index numbers sections 01-05 and nests the three areas, unnumbered, under Strutturazione", () => {
  const html = read(currentPegPath);
  const pegIndex = html.match(/<aside class="peg-index">[\s\S]*?<\/aside>/)[0];
  assert.deepEqual(
    [...pegIndex.matchAll(/<span>(\d+)<\/span>/g)].map((match) => match[1]),
    ["01", "02", "03", "04", "05"],
  );
  const group = pegIndex.match(/<div class="peg-index-group">\s*<a href="#strutturazione">[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(group, "Strutturazione and its areas share one group");
  const sub = group[0].match(/<div class="peg-index-sub"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.deepEqual(
    [...sub.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]),
    ["scelta", "custodi", "cittadini"],
  );
  assert.doesNotMatch(sub, /<span>/);
  assert.match(html, /fontawesome-free@7\.2\.0\/css\/fontawesome\.min\.css/);
  assert.match(html, /fontawesome-free@7\.2\.0\/css\/solid\.min\.css/);
  assert.match(read("assets/js/peg.js"), /fa-bars/);
});

test("reading index follows all sections on scroll, resize, load and return to top", () => {
  const ids = [
    "premessa",
    "analisi-esterna",
    "analisi-interna",
    "fondamenta",
    "strutturazione",
    "scelta",
    "custodi",
    "cittadini",
  ];
  const attributes = ids.map(() => ({}));
  const links = ids.map((id, i) => ({
    hash: "#" + id,
    setAttribute: (name, value) => {
      attributes[i][name] = value;
    },
    removeAttribute: (name) => {
      delete attributes[i][name];
    },
  }));
  const events = {};
  const window = {
    innerHeight: 900,
    scrollY: 0,
    addEventListener: (name, callback) => {
      events[name] = callback;
    },
    requestAnimationFrame: (callback) => {
      events.frame = callback;
    },
  };
  vm.runInNewContext(read("assets/js/peg.js"), {
    window,
    document: {
      querySelector: () => null,
      querySelectorAll: () => links,
      getElementById: (id) => ({
        getBoundingClientRect: () => ({ top: 500 + ids.indexOf(id) * 1000 - window.scrollY }),
      }),
      documentElement: { scrollHeight: 9000 },
    },
  });
  const current = () => attributes.flatMap((attrs, i) => (attrs["aria-current"] === "location" ? [ids[i]] : []));
  assert.deepEqual(current(), ["premessa"]);
  for (const [i, id] of ids.entries()) {
    window.scrollY = 500 + i * 1000 - 100;
    events.scroll();
    events.frame();
    assert.deepEqual(current(), [id]);
  }
  window.scrollY = 8100;
  events.scroll();
  events.frame();
  assert.deepEqual(current(), ["cittadini"]);
  window.scrollY = 0;
  events.resize();
  events.frame();
  assert.deepEqual(current(), ["premessa"]);
  window.scrollY = 3500;
  events.load();
  events.frame();
  assert.deepEqual(current(), ["fondamenta"]);
});

test("PEG and home fit mobile, tablet, laptop and desktop, with usable navigation", { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peg-layout-"));
  const pages = [currentPegPath, "index.html"].map((file) =>
    read(file)
      .replace(/<link\b[^>]*>/g, "")
      .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, "")
      .replace(
        "</head>",
        '<base href="file://' +
          path.dirname(path.join(root, file)) +
          '/"><style>' +
          read("assets/css/theme.css") +
          read("assets/css/home.css") +
          (file === currentPegPath ? read("assets/css/peg.css") : "") +
          "</style></head>",
      )
      .replace(
        "</body>",
        // Headless virtual time renders no frames, so requestAnimationFrame never fires without this shim.
        "<script>window.requestAnimationFrame = callback => setTimeout(callback, 16);" +
          read("assets/js/site-menu.js") +
          (file === currentPegPath ? read("assets/js/peg.js") : "") +
          "</script></body>",
      ),
  );
  const html = `<!doctype html><meta charset="utf-8"><body><script>
    const pages = ${JSON.stringify(pages).replace(/</g, "\\u003c")};
    const results = [];
    (async () => {
      for (let page = 0; page < pages.length; page++) {
        const frame = document.createElement('iframe');
        document.body.append(frame);
        const loaded = new Promise(resolve => frame.onload = resolve);
        frame.srcdoc = pages[page];
        await loaded;
        const doc = frame.contentDocument, win = frame.contentWindow;
        doc.querySelectorAll('a').forEach(link => link.addEventListener('click', event => event.preventDefault()));
        for (const width of [320, 375, 390, 640, 768, 820, 1024, 1280, 1440, 1920]) {
          frame.style.width = width + 'px';
          frame.style.height = (width <= 640 ? 740 : 1000) + 'px';
          await new Promise(resolve => setTimeout(resolve, 20));
          const toggle = doc.getElementById('menu-toggle');
          const menu = doc.getElementById('main-nav');
          const result = {
            page, width,
            overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
            clipped: [...doc.querySelectorAll('h1,h2,h3,p,dt,dd,.peg-directions a')].some(el => el.scrollWidth > el.clientWidth + 1),
            anchors: [...doc.querySelectorAll('a[href^="#"]')].every(a => doc.getElementById(a.hash.slice(1))),
            headings: doc.querySelectorAll('h1').length,
            areas: doc.querySelectorAll('.peg-area').length,
            heroColumns: win.getComputedStyle(doc.querySelector(page === 0 ? '.peg-hero' : '.hero')).gridTemplateColumns.split(' ').length,
            goalColumns: page === 0 ? win.getComputedStyle(doc.querySelector('.peg-goals > div')).gridTemplateColumns.split(' ').length : 0,
            indexPosition: page === 0 ? win.getComputedStyle(doc.querySelector('.peg-index')).position : ''
          };
          if (width <= 640) {
            toggle.click();
            result.menuOpen = toggle.getAttribute('aria-expanded') === 'true' && win.getComputedStyle(menu).display === 'grid';
            menu.querySelector('a').click();
            result.menuClosed = toggle.getAttribute('aria-expanded') === 'false';
            toggle.click();
            doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
            result.escapeCloses = toggle.getAttribute('aria-expanded') === 'false';
          }
          if (page === 0) {
            const quick = doc.querySelector('.peg-quick');
            const settle = () => new Promise(resolve => setTimeout(resolve, 60));
            const scrollTo = async top => { win.scrollTo({ top, behavior: 'instant' }); win.dispatchEvent(new win.Event('scroll')); await settle(); };
            if (width <= 900) {
              await scrollTo(0);
              result.quickHiddenAtTop = !quick.classList.contains('is-visible');
              await scrollTo(doc.getElementById('strutturazione').getBoundingClientRect().top + win.scrollY);
              result.quickVisible = quick.classList.contains('is-visible');
              const quickToggle = quick.querySelector('.peg-quick-toggle');
              const panel = doc.getElementById('peg-quick-panel');
              quickToggle.click();
              result.quickOpen = !panel.hidden && quickToggle.getAttribute('aria-expanded') === 'true'
                && quickToggle.querySelector('i').classList.contains('fa-xmark');
              result.quickLinks = panel.querySelectorAll('a').length;
              result.quickSub = panel.querySelectorAll('.peg-index-sub a').length;
              result.quickCurrent = (panel.querySelector('[aria-current]') || {}).hash;
              panel.querySelector('a[href="#scelta"]').click();
              result.quickClosed = panel.hidden && quickToggle.getAttribute('aria-expanded') === 'false';
              await scrollTo(0);
            } else {
              result.quickDisplay = win.getComputedStyle(quick).display;
            }
          }
          results.push(result);
        }
        frame.remove();
      }
      const out = document.createElement('pre'); out.id = 'results';
      out.textContent = JSON.stringify(results); document.body.append(out);
    })().catch(error => {
      const out = document.createElement('pre'); out.id = 'error';
      out.textContent = error.stack; document.body.append(out);
    });
    </script></body>`;
  try {
    const file = path.join(dir, "layout.html");
    fs.writeFileSync(file, html);
    const result = spawnSync(
      chrome,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-proxy-server",
        "--user-data-dir=" + path.join(dir, "profile"),
        "--virtual-time-budget=15000",
        "--dump-dom",
        "file://" + file,
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024 },
    );
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
    assert.ok(match, result.stdout.slice(-3000));
    const results = JSON.parse(match[1]);
    assert.equal(results.length, 20);
    for (const row of results) {
      const label = JSON.stringify(row);
      assert.equal(row.overflow, false, label);
      assert.equal(row.clipped, false, label);
      assert.equal(row.anchors, true, label);
      assert.equal(row.headings, 1, label);
      assert.equal(row.heroColumns, row.width <= 640 ? 1 : 2, label);
      if (row.page === 0) {
        assert.equal(row.areas, 3, label);
        assert.equal(row.goalColumns, row.width <= 640 ? 1 : 2, label);
        assert.equal(row.indexPosition, row.width <= 900 ? "static" : "sticky", label);
        if (row.width <= 900) {
          assert.equal(row.quickHiddenAtTop, true, label);
          assert.equal(row.quickVisible, true, label);
          assert.equal(row.quickOpen, true, label);
          assert.equal(row.quickLinks, 8, label);
          assert.equal(row.quickSub, 3, label);
          assert.equal(row.quickCurrent, "#strutturazione", label);
          assert.equal(row.quickClosed, true, label);
        } else {
          assert.equal(row.quickDisplay, "none", label);
        }
      }
      if (row.width <= 640) {
        assert.equal(row.menuOpen, true, label);
        assert.equal(row.menuClosed, true, label);
        assert.equal(row.escapeCloses, true, label);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
