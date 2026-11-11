const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const chrome = ["google-chrome", "chromium", "chromium-browser"].find(
  (command) => spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0,
);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function page() {
  const mock = `
    Object.defineProperty(window, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} } });
    window.fetch = async url => {
      if (url === 'calendars/events.json') {
        const snapshot = ${read("calendars/events.json")};
        const now = new Date();
        snapshot.generatedAt = now.toISOString();
        snapshot.calendars.forEach(calendar => { calendar.status = 'ok'; calendar.lastSuccess = snapshot.generatedAt });
        snapshot.events = [1, 3, 5, 8].map((days, i) => {
          const day = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
          return { id: String(i), calendar: snapshot.calendars[i].id, title: 'Evento ' + i, location: '',
            start: day + 'T15:00:00Z', end: day + 'T16:00:00Z', allDay: false };
        });
        return { ok: true, json: async () => snapshot };
      }
      return { ok: true, json: async () => ${read("documents/index.json")} };
    };
    addEventListener('load', () => setTimeout(() => {
      const box = selector => document.querySelector(selector)?.getBoundingClientRect();
      const event = box('.agenda-event');
      const download = [...document.querySelectorAll('#documents-list a[download]')][0];
      const firstDownload = download?.getBoundingClientRect();
      const left = box('#eventi'), right = box('#documenti');
      const out = document.createElement('pre');
      out.id = 'results';
      out.textContent = JSON.stringify({
        eventBottom: event && event.bottom,
        downloadBottom: firstDownload && firstDownload.bottom,
        downloadHeight: firstDownload && firstDownload.height,
        downloadHref: download && download.getAttribute('href'),
        sideBySide: Boolean(left && right && right.left > left.right - 1 && Math.abs(right.top - left.top) < 40),
        overflow: document.documentElement.scrollWidth > innerWidth,
        monthOpen: document.getElementById('calendar-month-details').open,
        agendaDays: document.querySelectorAll('.agenda-day').length,
      });
      document.body.append(out);
    }, 300));
  `;
  return read("index.html")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/<!-- include:[a-z-]+ -->/g, "")
    .replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
      ["assets/js/documents-model.js", "assets/js/home-documents.js", "assets/js/calendar-model.js", "assets/js/home-calendars.js"].includes(src)
        ? "<script>" + read(src) + "</script>"
        : "",
    )
    .replace("</head>", "<style>" + read("assets/css/theme.css") + read("assets/css/home.css") + "</style><script>" + mock + "</script></head>");
}

function measure(dir, width, height) {
  const file = path.join(dir, "home.html");
  const result = spawnSync(
    chrome,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-proxy-server",
      "--window-size=" + width + "," + height, "--virtual-time-budget=8000",
      "--user-data-dir=" + path.join(dir, "profile" + width), "--dump-dom", "file://" + file],
    { encoding: "utf8", timeout: 30000, maxBuffer: 5 * 1024 * 1024, cwd: dir, env: { ...process.env, TMPDIR: "." } },
  );
  const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
  assert.ok(match, "nessun risultato a " + width + "px: " + result.stderr.slice(-500));
  return JSON.parse(match[1]);
}

test("home shows next events and a direct PDF download without scrolling", { skip: !chrome }, () => {
  const dir = fs.mkdtempSync(path.join(__dirname, ".home-fold-"));
  try {
    fs.writeFileSync(path.join(dir, "home.html"), page());
    for (const [width, height, sideBySide] of [[390, 844, false], [820, 1180, true], [1366, 768, true], [1920, 1080, true]]) {
      const r = measure(dir, width, height);
      assert.ok(r.eventBottom > 0 && r.eventBottom <= height, width + ": primo evento sotto la piega " + r.eventBottom);
      assert.ok(r.downloadBottom > 0 && r.downloadBottom <= height, width + ": download sotto la piega " + r.downloadBottom);
      assert.ok(r.downloadHeight >= 44, width + ": download troppo piccolo " + r.downloadHeight);
      assert.match(r.downloadHref, /documents\/pdf\/.+\.pdf$/);
      assert.equal(r.sideBySide, sideBySide, width + ": colonne eventi|documenti");
      assert.equal(r.overflow, false, width + ": scroll orizzontale");
      assert.equal(r.monthOpen, width > 999, width + ": mese aperto");
      assert.ok(r.agendaDays >= 2, width + ": giorni in elenco " + r.agendaDays);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("home phone keeps the compact list-first calendar and hides the decorative intro", () => {
  const css = read("assets/css/home.css");
  assert.match(css, /body\.home \.calendar-agenda-panel \{ order: -1/);
  assert.match(css, /Georgia/);
  assert.match(read("index.html"), /<body class="home">/);
  assert.match(read("index.html"), /id="calendar-month-details"/);
});
