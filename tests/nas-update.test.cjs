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

test("NAS builds revision-tagged images and calendar jobs use the current tag", () => {
  const compose = fs.readFileSync(path.join(__dirname, "../deploy/synology/compose.yaml"), "utf8");
  for (const service of ["app", "web", "calendar-sync"]) {
    assert.ok(compose.includes(`image: agesci-nas-${service}:\${NAS_RELEASE_REVISION:-manual}`));
  }
  const calendar = fs.readFileSync(path.join(__dirname, "../deploy/synology/sync-calendars.sh"), "utf8");
  assert.match(calendar, /export NAS_RELEASE_REVISION="\$revision"/);
  assert.doesNotMatch(script, /docker (?:system|image|builder) prune/);
});

test("NAS updater preserves data, retains two healthy releases and rolls back failed deployments", () => {
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
      `#!/bin/sh
printf "%s %s\\n" "$NAS_RELEASE_REVISION" "$*" >> "$NAS_ROOT/operations.log"
case "$*" in
  *" up "*)
    if [ "$NAS_RELEASE_REVISION" = "$FAIL_REVISION" ]; then exit 17; fi ;;
  *" build"*)
    if [ "$NAS_RELEASE_REVISION" = "$FAIL_BUILD_REVISION" ]; then exit 18; fi ;;
  *" ps --all")
    if [ "$NAS_RELEASE_REVISION" = "$FAIL_PS_REVISION" ]; then exit 19; fi ;;
esac
if [ "$1 $2 $3" = "image ls --quiet" ]; then printf 'fixture-image\\n'; fi
`, { mode: 0o755 });
    const run = (extra = {}) => execFileSync("bash", [path.join(__dirname, "../deploy/synology/update.sh")], {
      env: { ...process.env, NAS_ROOT: root, PATH: bin + path.delimiter + process.env.PATH, ...extra },
      timeout: 30000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const commit = (label) => {
      fs.writeFileSync(path.join(repository, "version.txt"), label);
      execFileSync("git", ["-C", repository, "add", "."]);
      execFileSync("git", ["-C", repository, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
        "commit", "-qm", label]);
      return execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    };
    const releases = () => fs.readdirSync(path.join(root, "releases")).filter(name => /^[a-f0-9]{40}$/.test(name)).sort();
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

    // Migrate an existing installation without inventing a healthy fallback.
    fs.unlinkSync(path.join(root, "previous-revision"));
    const legacy = "a".repeat(40);
    fs.mkdirSync(path.join(root, "releases", legacy));
    assert.match(run(), /NAS gia' aggiornato/);
    assert.ok(releases().includes(legacy));
    fs.mkdirSync(path.join(root, "releases", "manual-backup"));
    fs.symlinkSync(path.join(root, "data"), path.join(root, "releases", "b".repeat(40)));
    const second = commit("second");
    run();
    assert.equal(fs.readFileSync(path.join(root, "previous-revision"), "utf8").trim(), revision.trim());
    assert.deepEqual(releases(), [revision.trim(), second, "b".repeat(40)].sort());
    assert.ok(fs.existsSync(path.join(root, "releases", "manual-backup")));
    assert.ok(fs.readFileSync(path.join(root, "operations.log"), "utf8").includes(`image rm agesci-nas-app:${legacy}`));
    const third = commit("third");
    run();
    assert.deepEqual(releases(), [second, third, "b".repeat(40)].sort());
    fs.writeFileSync(path.join(root, ".env"), "NAS_CAPO_CODES=7654323\n");
    run();
    assert.equal(fs.readFileSync(path.join(root, "previous-revision"), "utf8").trim(), second);
    const beforeFailure = fs.readFileSync(path.join(root, "current-configuration"), "utf8");
    const failed = commit("failed");
    assert.throws(() => run({ FAIL_BUILD_REVISION: failed }), error => {
      assert.match(error.stderr.toString(), /fallito durante: build delle immagini app e web/);
      return true;
    });
    assert.throws(() => run({ FAIL_REVISION: failed, FAIL_PS_REVISION: failed }), error => {
      assert.match(error.stdout.toString(), new RegExp("Ripristinato il codice precedente: " + third));
      assert.match(error.stderr.toString(), /tento comunque il ripristino/);
      return true;
    });
    assert.equal(fs.readFileSync(path.join(root, "current-revision"), "utf8").trim(), third);
    assert.equal(fs.readFileSync(path.join(root, "current-configuration"), "utf8"), beforeFailure);
    assert.equal(fs.readFileSync(path.join(root, "previous-revision"), "utf8").trim(), second);
    assert.deepEqual(releases(), [second, third, failed, "b".repeat(40)].sort());
    assert.match(fs.readFileSync(path.join(root, "operations.log"), "utf8"),
      new RegExp(third + " compose .*up -d --build --wait"));
    run();
    assert.deepEqual(releases(), [third, failed, "b".repeat(40)].sort());
    assert.equal(fs.readFileSync(path.join(root, "data/keep.txt"), "utf8"), "existing runtime data");
    assert.equal(fs.existsSync(path.join(root, "update.lock")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
