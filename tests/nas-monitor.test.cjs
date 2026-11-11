const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createMonitor, createResources } = require("../server/monitor.cjs");

test("live presence counts every open site tab, background ones included, and samples it each minute", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-presence-"));
  const database = new DatabaseSync(":memory:");
  const monitor = createMonitor(database, { dataDir: directory });
  const uuid = (index) => String(index).repeat(8) + "-1234-1234-1234-123456789abc";
  const browsers = { 1: "pc", 2: "pc", 3: "pc", 4: "ipad", 5: "iphone" };
  const visitor = (index) => ({ pc: uuid(7), ipad: uuid(8), iphone: uuid(9) })[browsers[index]];
  const tab = (index, page, visible, type = "view") =>
    monitor.telemetry({
      id: uuid(index > 3 ? index : 1),
      tab: uuid(index),
      visitor: visitor(index),
      type,
      page,
      visible,
      events: [],
    });
  try {
    tab(1, "home", true);
    tab(2, "peg", true);
    tab(3, "documenti", true);
    tab(4, "assemblea", true);
    tab(5, "home", true);
    tab(2, "peg", false, "heartbeat");
    tab(3, "documenti", false, "heartbeat");
    let snapshot = monitor.snapshot(0, 0, "live");
    assert.equal(snapshot.traffic.people, 3);
    assert.equal(snapshot.traffic.online, 5);
    assert.equal(snapshot.traffic.visible, 3);
    assert.equal(snapshot.traffic.presentationDevices, 0);
    monitor.connection(uuid(8));
    monitor.connection(uuid(6));
    assert.equal(monitor.snapshot(0, 0, "summary").traffic.today.people, 4);
    const sampled = Date.now() - 60000;
    monitor.samplePerformance(sampled);
    snapshot = monitor.snapshot(0, 0);
    const minute = snapshot.performance.hourly.find((value) => value.sampledAt === Math.floor(sampled / 60000) * 60000);
    assert.equal(minute.online, 3);
    assert.equal(snapshot.traffic.daily[0].people, 4);
    assert.equal(snapshot.traffic.daily[0].liveUnique, 2);
    assert.equal(snapshot.traffic.daily[1].people, null);
    assert.deepEqual(
      snapshot.traffic.sessions.map((value) => value.visible).sort(),
      [false, false, true, true, true],
    );
    tab(3, "documenti", false, "leave");
    assert.equal(monitor.snapshot(0, 0, "live").traffic.online, 4);
    assert.equal(monitor.snapshot(0, 0, "live").traffic.people, 3);
    tab(4, "assemblea", false, "leave");
    assert.equal(monitor.snapshot(0, 0, "live").traffic.people, 2);
    assert.throws(() => monitor.telemetry({ id: uuid(1), visitor: "x", type: "view", page: "home", visible: true, events: [] }));
  } finally {
    monitor.stop();
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("NAS host CPU uses successive samples and container memory uses cgroup limits", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-resources-"));
  const collector = createResources({ hostProc: directory, cgroupRoot: directory, dataDir: directory });
  try {
    await fs.writeFile(path.join(directory, "stat"), "cpu 100 0 100 800 0 0 0 0\n");
    await fs.writeFile(path.join(directory, "meminfo"), "MemTotal: 1024 kB\nMemAvailable: 256 kB\n");
    await fs.writeFile(path.join(directory, "cpu.max"), "100000 100000");
    await fs.writeFile(path.join(directory, "memory.current"), "128");
    await fs.writeFile(path.join(directory, "memory.max"), "512");
    assert.equal(collector.sample().host.cpuPercent, null);
    await fs.writeFile(path.join(directory, "stat"), "cpu 250 0 100 850 0 0 0 0\n");
    const sample = collector.sample();
    assert.equal(sample.host.cpuPercent, 75);
    assert.equal(sample.host.memoryPercent, 75);
    assert.equal(sample.container.memoryPercent, 25);
    assert.equal(sample.process.cpuLimitCores, 1);
    assert.ok(sample.process.rssBytes > 0);
  } finally {
    collector.stop();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("missing host metrics and unlimited container quotas are not reported as zero usage", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-unavailable-"));
  const collector = createResources({ cgroupRoot: directory, dataDir: directory });
  try {
    await fs.writeFile(path.join(directory, "cpu.max"), "max 100000");
    await fs.writeFile(path.join(directory, "memory.max"), "max");
    const sample = collector.sample();
    assert.equal(sample.host, null);
    assert.equal(sample.container.memoryBytes, null);
    assert.equal(sample.container.memoryLimitBytes, null);
    assert.equal(sample.process.cpuLimitCores, null);
  } finally {
    collector.stop();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("anonymous action counters aggregate per day, reject free text and appear only in the full snapshot", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-actions-"));
  const monitor = createMonitor(new DatabaseSync(":memory:"), { dataDir: directory });
  const id = "11111111-1234-1234-1234-123456789abc";
  const send = (actions, type = "heartbeat") =>
    monitor.telemetry({ id, tab: id, type, page: "area", visible: true, events: [], actions });
  try {
    send(["soci.apri-scheda", "soci.apri-scheda", "attivita.presenze"], "view");
    send(["soci.apri-scheda"], "leave");
    for (const bad of [["Mario Rossi"], ["soci.apri scheda"], ["x".repeat(80)], ["soci.a-b", "a.bc", "soci.a-b", "soci.a-b", "soci.a-b", "soci.a-b", "soci.a-b", "soci.a-b", "soci.a-b"], "soci.apri-scheda"])
      assert.throws(() => send(bad));
    const actions = monitor.snapshot(0, 0, "full").actions.map((value) => ({ ...value }));
    assert.deepEqual(actions, [
      { action: "soci.apri-scheda", week: 3, month: 3 },
      { action: "attivita.presenze", week: 1, month: 1 },
    ]);
    assert.equal(monitor.snapshot(0, 0, "summary").actions, undefined);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
