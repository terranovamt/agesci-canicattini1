const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");

test("Container Manager package contains only NAS deployment sources and a blank env template", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nas-package-"));
  try {
    const archive = path.join(directory, "site.zip");
    execFileSync("python3", ["tools/package-nas.py", archive]);
    const result = JSON.parse(execFileSync("python3", ["-c", `
import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print(json.dumps({"names": z.namelist(),
        "env": z.read("canicattini1/.env").decode(),
        "compose": z.read("canicattini1/docker-compose.yml").decode(),
        "home": z.read("canicattini1/site/index.html").decode()}))
`, archive], { encoding: "utf8" }));
    for (const name of ["server/nas.cjs", "server/people.cjs", "server/monitor.cjs", "server/Dockerfile",
      "deploy/synology/Dockerfile", "deploy/synology/nginx.conf", "tools/build-site.cjs",
      "assets/js/persone.js", "area-riservata/persone.html"])
      assert.ok(result.names.includes("canicattini1/site/" + name), name);
    assert.equal(result.home, await fs.readFile("index.html", "utf8"));
    assert.match(result.env, /NAS_ADMIN_PASSWORD=''/);
    assert.match(result.env, /NAS_CAPO_CODES=\s*$/);
    assert.match(result.compose, /context: \.\/site/);
    assert.match(result.compose, /condition: service_completed_successfully/);
    assert.match(result.compose, /127\.0\.0\.1:8080:8080/);
    assert.match(result.compose, /NAS_DATA_DIR:-gruppo-data\}:\/data/);
    assert.equal(result.names.some(name => /\/(?:\.git|tests|__pycache__|data)\//.test(name) || /\.sqlite/.test(name)), false);
    assert.equal(result.names.filter(name => name.endsWith("/.env")).length, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
