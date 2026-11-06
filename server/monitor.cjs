"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { monitorEventLoopDelay } = require("node:perf_hooks");

const PAGES = new Set([
  "home",
  "assemblea",
  "assemblea-documenti",
  "documenti",
  "gestione-documenti",
  "peg",
  "area",
  "regia",
  "setup",
  "guida",
  "statistiche",
]);
const EVENTS = new Set(["offline", "network-error", "http-error", "resource-error", "js-error", "stream-reconnect"]);
const dayOf = (time) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(time);
const number = (value) => (Number.isFinite(value) ? value : null);

function text(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

function createResources({ hostProc = "", cgroupRoot = "/sys/fs/cgroup", dataDir } = {}) {
  let previousCpu = process.cpuUsage(),
    previousTime = process.hrtime.bigint(),
    previousHost;
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  function sample() {
    const currentTime = process.hrtime.bigint();
    const elapsed = Number(currentTime - previousTime) / 1000;
    const currentCpu = process.cpuUsage();
    const corePercent =
      elapsed > 1000
        ? ((currentCpu.user + currentCpu.system - previousCpu.user - previousCpu.system) / elapsed) * 100
        : null;
    previousCpu = currentCpu;
    previousTime = currentTime;
    const quota = text(path.join(cgroupRoot, "cpu.max"))?.split(/\s+/);
    let cpuLimitCores = quota && quota[0] !== "max" ? number(Number(quota[0]) / Number(quota[1])) : null;
    if (!quota) {
      const limit = Number(text(path.join(cgroupRoot, "cpu/cpu.cfs_quota_us")));
      const period = Number(text(path.join(cgroupRoot, "cpu/cpu.cfs_period_us")));
      cpuLimitCores = limit > 0 && period > 0 ? limit / period : null;
    }
    const memoryValue =
      text(path.join(cgroupRoot, "memory.current")) ?? text(path.join(cgroupRoot, "memory/memory.usage_in_bytes"));
    const memoryLimit =
      text(path.join(cgroupRoot, "memory.max")) ?? text(path.join(cgroupRoot, "memory/memory.limit_in_bytes"));
    const memoryBytes = memoryValue === null ? null : number(Number(memoryValue));
    const limitBytes =
      memoryLimit && memoryLimit !== "max" && Number(memoryLimit) < 2 ** 50 ? number(Number(memoryLimit)) : null;
    let host = null;
    if (hostProc) {
      const cpuLine = text(path.join(hostProc, "stat"))
        ?.split("\n")
        .find((line) => line.startsWith("cpu "));
      const meminfo = text(path.join(hostProc, "meminfo"));
      if (cpuLine && meminfo) {
        const ticks = cpuLine.trim().split(/\s+/).slice(1, 9).map(Number);
        const total = ticks.reduce((sum, value) => sum + value, 0),
          idle = ticks[3] + ticks[4];
        const delta = previousHost ? total - previousHost.total : 0;
        const cpuPercent =
          delta > 0 ? Math.max(0, Math.min(100, 100 * (1 - (idle - previousHost.idle) / delta))) : null;
        previousHost = { total, idle };
        const memory = Object.fromEntries(
          [...meminfo.matchAll(/^(\w+):\s+(\d+) kB/gm)].map(([, key, value]) => [key, Number(value) * 1024]),
        );
        if (memory.MemTotal && Number.isFinite(memory.MemAvailable))
          host = {
            cpuPercent,
            memoryTotalBytes: memory.MemTotal,
            memoryUsedBytes: memory.MemTotal - memory.MemAvailable,
            memoryPercent: ((memory.MemTotal - memory.MemAvailable) / memory.MemTotal) * 100,
          };
      }
    }
    let disk = null;
    try {
      const volume = fs.statfsSync(dataDir);
      disk = {
        totalBytes: volume.blocks * volume.bsize,
        availableBytes: volume.bavail * volume.bsize,
        databaseBytes: ["site.sqlite", "site.sqlite-wal", "site.sqlite-shm"].reduce((sum, name) => {
          try {
            return sum + fs.statSync(path.join(dataDir, name)).size;
          } catch {
            return sum;
          }
        }, 0),
      };
    } catch {}
    const result = {
      process: {
        cpuCorePercent: number(corePercent),
        rssBytes: process.memoryUsage().rss,
        heapBytes: process.memoryUsage().heapUsed,
        cpuLimitCores,
        cpuQuotaPercent: cpuLimitCores && corePercent !== null ? number(corePercent / cpuLimitCores) : null,
        eventLoopP95Ms: Number.isFinite(lag.mean) ? lag.percentile(95) / 1e6 : null,
      },
      container: {
        memoryBytes,
        memoryLimitBytes: limitBytes,
        memoryPercent: limitBytes && memoryBytes !== null ? (memoryBytes / limitBytes) * 100 : null,
      },
      host,
      disk,
    };
    lag.reset();
    return result;
  }
  return { sample, stop: () => lag.disable() };
}

function createMonitor(
  database,
  { dataDir, hostProc = "", telemetryEnabled = true, release = "manual", liveCounts = () => ({ streams: 0, devices: 0 }) } = {},
) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS monitor_totals (id INTEGER PRIMARY KEY, visits INTEGER NOT NULL, views INTEGER NOT NULL, started TEXT NOT NULL); CREATE TABLE IF NOT EXISTS monitor_days (day TEXT PRIMARY KEY, visits INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS monitor_pages (day TEXT NOT NULL, page TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,page)); CREATE TABLE IF NOT EXISTS monitor_sessions (id TEXT PRIMARY KEY, seen INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS monitor_events (time INTEGER NOT NULL, kind TEXT NOT NULL, page TEXT NOT NULL, status INTEGER); CREATE INDEX IF NOT EXISTS monitor_event_time ON monitor_events(time);",
  );
  database.prepare("INSERT OR IGNORE INTO monitor_totals VALUES (1,0,0,?)").run(dayOf(new Date()));
  database.exec("CREATE TABLE IF NOT EXISTS monitor_views (id TEXT PRIMARY KEY, seen INTEGER NOT NULL);");
  database.exec(
    "CREATE TABLE IF NOT EXISTS monitor_connections (day TEXT PRIMARY KEY, opens INTEGER NOT NULL DEFAULT 0);",
  );
  database.prepare("INSERT OR IGNORE INTO monitor_connections VALUES ('total',0)").run();
  database.exec(
    "CREATE TABLE IF NOT EXISTS monitor_live_visitors (day TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY(day,visitor)); CREATE INDEX IF NOT EXISTS monitor_live_visitor_day ON monitor_live_visitors(day); CREATE TABLE IF NOT EXISTS monitor_live_tracking (id INTEGER PRIMARY KEY CHECK(id=1), started TEXT NOT NULL); CREATE TABLE IF NOT EXISTS monitor_performance (minute INTEGER PRIMARY KEY, online INTEGER NOT NULL, p95_ms REAL, cpu_percent REAL, memory_percent REAL);",
  );
  let recordedDay = dayOf(new Date());
  database.prepare("INSERT OR IGNORE INTO monitor_days(day) VALUES (?)").run(recordedDay);
  database.prepare("INSERT OR IGNORE INTO monitor_live_tracking VALUES (1,?)").run(recordedDay);
  const clients = new Map(),
    requests = [];
  let lastPerformanceMinute = -1;
  const resources = createResources({ dataDir, hostProc });
  let sample = resources.sample();
  const initialized = Date.now();
  const recordEvent = (kind, page, status, now) => {
    database.prepare("INSERT INTO monitor_events VALUES (?,?,?,?)").run(now, kind, page, status ?? null);
    database
      .prepare("INSERT INTO monitor_days(day,errors) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET errors=errors+1")
      .run(dayOf(new Date(now)));
  };
  function telemetry(value) {
    if (!telemetryEnabled) return;
    if (
      !value ||
      !/^[a-f0-9-]{36}$/i.test(value.id || "") ||
      (value.tab !== undefined && !/^[a-f0-9-]{36}$/i.test(value.tab)) ||
      !PAGES.has(value.page) ||
      !["view", "heartbeat", "leave"].includes(value.type) ||
      typeof value.visible !== "boolean" ||
      !Array.isArray(value.events) ||
      value.events.length > 8 ||
      value.events.some(
        (event) =>
          !event ||
          typeof event !== "object" ||
          !EVENTS.has(event.kind) ||
          !PAGES.has(event.page) ||
          (event.status !== undefined && (!Number.isInteger(event.status) || event.status < 400 || event.status > 599)),
      ) ||
      (value.latencyMs !== undefined &&
        (!Number.isFinite(value.latencyMs) || value.latencyMs < 0 || value.latencyMs > 120000))
    ) {
      const error = new Error("Telemetria non valida");
      error.status = 400;
      throw error;
    }
    const id = crypto.createHash("sha256").update(value.id).digest("hex");
    const tab = crypto
      .createHash("sha256")
      .update(value.tab || value.id)
      .digest("hex");
    const now = Date.now(),
      day = dayOf(new Date(now));
    if (value.type === "leave") {
      for (const event of value.events) recordEvent(event.kind, event.page, event.status, now);
      clients.delete(tab);
      return;
    }
    const previous = database.prepare("SELECT seen FROM monitor_sessions WHERE id=?").get(id);
    const visit = !previous || previous.seen < now - 1800000 ? 1 : 0;
    const viewed = value.tab && database.prepare("SELECT seen FROM monitor_views WHERE id=?").get(tab);
    const view = value.type === "view" && !viewed ? 1 : 0;
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare("INSERT INTO monitor_sessions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET seen=excluded.seen")
        .run(id, now);
      database.prepare("UPDATE monitor_totals SET visits=visits+?,views=views+? WHERE id=1").run(visit, view);
      database
        .prepare(
          "INSERT INTO monitor_days(day,visits,views) VALUES (?,?,?) ON CONFLICT(day) DO UPDATE SET visits=visits+excluded.visits,views=views+excluded.views",
        )
        .run(day, visit, view);
      if (view)
        database
          .prepare("INSERT INTO monitor_pages VALUES (?,?,1) ON CONFLICT(day,page) DO UPDATE SET views=views+1")
          .run(day, value.page);
      if (view && value.tab) database.prepare("INSERT OR REPLACE INTO monitor_views VALUES (?,?)").run(tab, now);
      for (const event of value.events) recordEvent(event.kind, event.page, event.status, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    if (clients.size < 2000 || clients.has(tab))
      clients.set(tab, { seen: now, page: value.page, visible: value.visible, latencyMs: value.latencyMs ?? null });
  }
  function request(pathname, status, duration, streaming) {
    if (
      streaming ||
      !pathname.startsWith("/api/") ||
      (status < 400 && ["/api/metrics", "/api/telemetry", "/api/telemetry/config"].includes(pathname))
    )
      return;
    const now = Date.now();
    requests.push({ time: now, status, ms: duration });
    if (requests.length > 2000) requests.shift();
    if (status >= 500) recordEvent("server-error", "server", status, now);
  }
  function connection(visitor) {
    const day = dayOf(new Date());
    const visitorHash =
      typeof visitor === "string" && /^[a-f0-9-]{36}$/i.test(visitor)
        ? crypto.createHash("sha256").update(visitor.toLowerCase()).digest("hex")
        : null;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("INSERT OR IGNORE INTO monitor_days(day) VALUES (?)").run(day);
      const increment = database.prepare(
        "INSERT INTO monitor_connections VALUES (?,1) ON CONFLICT(day) DO UPDATE SET opens=opens+1",
      );
      increment.run(day);
      increment.run("total");
      if (visitorHash)
        database.prepare("INSERT OR IGNORE INTO monitor_live_visitors VALUES (?,?)").run(day, visitorHash);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  function samplePerformance(now) {
    const minute = Math.floor(now / 60000);
    if (minute === lastPerformanceMinute) return;
    lastPerformanceMinute = minute;
    const recent = requests.filter((value) => value.time > now - 300000);
    const durations = recent.map((value) => value.ms).sort((left, right) => left - right);
    const { devices } = liveCounts();
    database
      .prepare("INSERT OR REPLACE INTO monitor_performance VALUES (?,?,?,?,?)")
      .run(
        minute,
        devices,
        durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
        sample.host?.cpuPercent ?? null,
        sample.host?.memoryPercent ?? null,
      );
    database.prepare("DELETE FROM monitor_performance WHERE minute<?").run(minute - 1440);
  }
  samplePerformance(Date.now());
  function snapshot(streams, devices, view = "full") {
    const now = Date.now(),
      day = dayOf(new Date(now));
    const recent = requests.filter((value) => value.time > now - 300000);
    const durations = recent.map((value) => value.ms).sort((left, right) => left - right);
    const online = [...clients.values()].filter((value) => value.visible && value.seen > now - 90000);
    const missing = [...clients.values()].filter(
      (value) => value.visible && value.seen <= now - 90000 && value.seen > now - 300000,
    ).length;
    const warnings = [];
    if (sample.process.cpuQuotaPercent >= 85) warnings.push("CPU backend vicina al limite");
    if (sample.container.memoryPercent >= 85) warnings.push("Memoria container vicina al limite");
    if (sample.host?.cpuPercent >= 85) warnings.push("CPU NAS elevata");
    if (sample.host?.memoryPercent >= 90) warnings.push("Memoria NAS elevata");
    if (sample.disk && sample.disk.availableBytes < Math.max(1024 ** 3, sample.disk.totalBytes * 0.05))
      warnings.push("Spazio volume dati ridotto");
    if (streams >= 450) warnings.push("Connessioni live vicine al limite");
    if (view !== "live" && recent.some((value) => value.status === 429))
      warnings.push("Richieste limitate dal server (HTTP 429)");
    if (view !== "live" && recent.some((value) => value.status >= 500))
      warnings.push("Errori server negli ultimi cinque minuti");
    if (sample.process.eventLoopP95Ms >= 100) warnings.push("Event loop backend rallentato");
    if (missing) warnings.push("Sessioni senza aggiornamenti recenti");
    const result = {
      sampledAt: now,
      timezone: "Europe/Rome",
      enabled: telemetryEnabled,
      service: { release, startedAt: initialized, uptimeSeconds: Math.floor((now - initialized) / 1000) },
      traffic: {
        online: online.length,
        missing,
        liveStreams: streams,
        liveLimit: 500,
        presentationDevices: devices,
      },
      resources: sample,
      warnings,
    };
    if (view === "live") return result;
    const trackingSince = database.prepare("SELECT started FROM monitor_live_tracking WHERE id=1").get().started;
    const liveVisitors = database
      .prepare("SELECT day,COUNT(*) AS visitors FROM monitor_live_visitors WHERE day>=? GROUP BY day")
      .all(trackingSince);
    const liveVisitorsByDay = new Map(liveVisitors.map((value) => [value.day, value.visitors]));
    result.traffic.today = {
      ...(database.prepare("SELECT visits,views,errors FROM monitor_days WHERE day=?").get(day) || {
        visits: 0,
        views: 0,
        errors: 0,
      }),
      connections: database.prepare("SELECT opens FROM monitor_connections WHERE day=?").get(day)?.opens || 0,
      liveUnique: liveVisitorsByDay.get(day) || 0,
    };
    if (view === "summary") return result;
    result.traffic.totals = {
      ...database.prepare("SELECT visits,views,started FROM monitor_totals WHERE id=1").get(),
      connections: database.prepare("SELECT opens FROM monitor_connections WHERE day='total'").get().opens,
    };
    const recordedDays = database
      .prepare(
        "SELECT d.*,COALESCE(c.opens,0) AS connections FROM monitor_days d LEFT JOIN monitor_connections c ON c.day=d.day ORDER BY d.day DESC LIMIT 365",
      )
      .all();
    const daysByDate = new Map(recordedDays.map((value) => [value.day, value]));
    const todayUtc = new Date(`${day}T00:00:00.000Z`).getTime();
    result.traffic.daily = Array.from({ length: 365 }, (_, offset) => {
      const date = new Date(todayUtc - offset * 86400000).toISOString().slice(0, 10);
      const value = daysByDate.get(date);
      return {
        day: date,
        visits: value?.visits ?? null,
        views: value?.views ?? null,
        errors: value?.errors ?? null,
        connections: value?.connections ?? null,
        liveUnique: date < trackingSince ? null : liveVisitorsByDay.get(date) || 0,
      };
    });
    const minute = Math.floor(now / 60000);
    const performanceRows = database
      .prepare("SELECT minute,online,p95_ms,cpu_percent,memory_percent FROM monitor_performance WHERE minute>=? ORDER BY minute")
      .all(minute - 59);
    const performanceByMinute = new Map(performanceRows.map((value) => [value.minute, value]));
    result.performance = {
      trackingSince: Math.max(minute - 59, performanceRows[0]?.minute ?? minute),
      hourly: Array.from({ length: 60 }, (_, index) => {
        const sampledMinute = minute - 59 + index;
        const value = performanceByMinute.get(sampledMinute);
        return {
          sampledAt: sampledMinute * 60000,
          online: value?.online ?? null,
          p95Ms: value?.p95_ms ?? null,
          cpuPercent: value?.cpu_percent ?? null,
          memoryPercent: value?.memory_percent ?? null,
        };
      }),
    };
    result.traffic.pages = database
      .prepare("SELECT page,views FROM monitor_pages WHERE day=? ORDER BY views DESC")
      .all(day);
    result.traffic.sessions = online
      .slice(0, 20)
      .map((value) => ({ page: value.page, lastSeen: value.seen, latencyMs: value.latencyMs }));
    result.api = {
      sampleCount: recent.length,
      windowSeconds: 300,
      p95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
      errors5xx: recent.filter((value) => value.status >= 500).length,
      rejected: recent.filter((value) => value.status >= 400 && value.status < 500).length,
      limited: recent.filter((value) => value.status === 429).length,
    };
    result.events = database
      .prepare("SELECT time,kind,page,status FROM monitor_events ORDER BY time DESC LIMIT 20")
      .all();
    return result;
  }
  const timer = setInterval(() => {
    const now = Date.now();
    const currentDay = dayOf(new Date(now));
    if (currentDay !== recordedDay) {
      database.prepare("INSERT OR IGNORE INTO monitor_days(day) VALUES (?)").run(currentDay);
      recordedDay = currentDay;
    }
    sample = resources.sample();
    for (const [id, client] of clients) if (client.seen < now - 1800000) clients.delete(id);
    while (requests[0]?.time < now - 300000) requests.shift();
    database.prepare("DELETE FROM monitor_sessions WHERE seen<?").run(now - 1800000);
    database.prepare("DELETE FROM monitor_views WHERE seen<?").run(now - 86400000);
    database
      .prepare(
        "DELETE FROM monitor_events WHERE time<? OR rowid NOT IN (SELECT rowid FROM monitor_events ORDER BY time DESC LIMIT 500)",
      )
      .run(now - 86400000);
    const oldest = dayOf(new Date(now - 365 * 86400000));
    database.prepare("DELETE FROM monitor_days WHERE day<?").run(oldest);
    database.prepare("DELETE FROM monitor_pages WHERE day<?").run(oldest);
    database.prepare("DELETE FROM monitor_connections WHERE day<?").run(oldest);
    database.prepare("DELETE FROM monitor_live_visitors WHERE day<?").run(oldest);
    samplePerformance(now);
  }, 5000);
  timer.unref();
  return {
    telemetry,
    request,
    connection,
    samplePerformance,
    snapshot,
    enabled: telemetryEnabled,
    stop() {
      clearInterval(timer);
      resources.stop();
    },
  };
}

module.exports = { createMonitor, createResources };
