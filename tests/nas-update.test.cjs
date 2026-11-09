const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const script = fs.readFileSync(path.join(__dirname, "../deploy/synology/update.sh"), "utf8");

test("NAS updater tracks only NAS and keeps runtime data outside releases", () => {
  assert.match(script, /BRANCH="NAS"/);
  assert.match(script, /git clone --bare --single-branch --branch/);
  assert.match(script, /git .* archive "\$revision"/);
  assert.doesNotMatch(script, /git (?:reset|clean|pull)|docker\.sock|curl.*\|.*sh/);
  assert.match(script, /mkdir -p "\$NAS_ROOT\/releases" "\$NAS_ROOT\/data"/);
  assert.match(script, /--env-file "\$NAS_ROOT\/nas.env"/);
  assert.doesNotMatch(script, /--profile tunnel/);
  const config = fs.readFileSync(path.join(__dirname, "../deploy/synology/nas.env.example"), "utf8");
  assert.match(config, /^COMPOSE_PROFILES=\s*$/m);
  assert.match(config, /^NAS_PUBLIC_ORIGIN=https:\/\/[a-z0-9-]+\.synology\.me\s*$/m);
  assert.doesNotMatch(config, /NAS_TUNNEL_TOKEN_FILE/);
});

test("NAS updater serializes deployments and records only healthy versions", () => {
  assert.match(script, /mkdir "\$NAS_ROOT\/update.lock"/);
  const health = script.indexOf('if compose "$release" up -d --wait');
  const record = script.indexOf('> "$NAS_ROOT/current-revision.tmp"');
  assert.ok(health >= 0 && record > health);
  assert.match(script, /compose "\$NAS_ROOT\/releases\/\$previous" up -d --build --wait/);
  assert.match(script, /up -d --wait --force-recreate/);
});

test("NAS updater applies private env overrides without requiring a new commit or installation", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nas-updater-"));
  const root = path.join(directory, "installed");
  const repository = path.join(directory, "source");
  const bin = path.join(directory, "bin");
  try {
    fs.mkdirSync(path.join(repository, "deploy/synology"), { recursive: true });
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(repository, "deploy/synology/update.sh"), script);
    fs.copyFileSync(path.join(__dirname, "../deploy/synology/sync-calendars.sh"),
      path.join(repository, "deploy/synology/sync-calendars.sh"));
    fs.writeFileSync(path.join(repository, "deploy/synology/compose.yaml"), "services: {}\n");
    execFileSync("git", ["init", "-q", "-b", "NAS", repository]);
    execFileSync("git", ["-C", repository, "add", "."]);
    execFileSync("git", ["-C", repository, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "-qm", "NAS deployment fixture"]);
    execFileSync("git", ["clone", "-q", "--bare", repository, path.join(root, "repository.git")]);
    fs.writeFileSync(path.join(root, "nas.env"), "NAS_PUBLIC_ORIGIN=https://test.synology.me\n");
    fs.writeFileSync(path.join(root, ".env"), "NAS_CAPO_CODES=7654321\n");
    fs.writeFileSync(path.join(root, "data/keep.txt"), "existing runtime data");
    fs.writeFileSync(path.join(bin, "chown"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "docker"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NAS_ROOT/operations.log"\n', { mode: 0o755 });
    const run = () => execFileSync("bash", [path.join(__dirname, "../deploy/synology/update.sh")], {
      env: { ...process.env, NAS_ROOT: root, PATH: bin + path.delimiter + process.env.PATH },
      timeout: 30000,
      encoding: "utf8",
    });
    run();
    const revision = fs.readFileSync(path.join(root, "current-revision"), "utf8");
    const fingerprint = fs.readFileSync(path.join(root, "current-configuration"), "utf8");
    const operations = fs.readFileSync(path.join(root, "operations.log"), "utf8");
    assert.ok(operations.includes("--env-file " + path.join(root, "nas.env")));
    assert.ok(operations.includes("--env-file " + path.join(root, ".env")));
    assert.match(operations, /--project-name agesci-nas/);
    assert.match(run(), /NAS gia' aggiornato/);
    assert.equal(fs.readFileSync(path.join(root, "operations.log"), "utf8"), operations);
    fs.writeFileSync(path.join(root, ".env"), "NAS_CAPO_CODES=7654321,7654322\n");
    assert.match(run(), /Deployment completato/);
    assert.equal(fs.readFileSync(path.join(root, "current-revision"), "utf8"), revision);
    assert.notEqual(fs.readFileSync(path.join(root, "current-configuration"), "utf8"), fingerprint);
    assert.equal(fs.readFileSync(path.join(root, "data/keep.txt"), "utf8"), "existing runtime data");
    assert.equal(fs.existsSync(path.join(root, "update.lock")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
