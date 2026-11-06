const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const { createResources } = require("../server/monitor.cjs");

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
