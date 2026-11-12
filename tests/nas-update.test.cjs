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
  const health = script.indexOf("if start_release; then");
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
    const composeFile = "services:\n  app: {}\n  web: {}\n  gate: {}\n";
    fs.writeFileSync(path.join(repository, "deploy/synology/compose.yaml"), composeFile);
    execFileSync("git", ["init", "-q", repository]);
    execFileSync("git", ["-C", repository, "symbolic-ref", "HEAD", "refs/heads/NAS"]);
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
previous_arg=""
compose_file=""
for arg in "$@"; do
  if [ "$previous_arg" = "-f" ]; then compose_file="$arg"; fi
  previous_arg="$arg"
done
case "$*" in
  *" config --services")
    printf 'app\\nweb\\n'
    if grep -q '^  gate:' "$compose_file"; then printf 'gate\\n'; fi
    exit 0 ;;
  *" stop web") rm -f "$NAS_ROOT/legacy-listener" ;;
  *" stop gate") rm -f "$NAS_ROOT/gate-listener" ;;
  *" up "*)
    if [ ! -r "$NAS_ROOT/deployment/status.json" ]; then echo "deployment metadata missing" >&2; exit 24; fi
    printf '%s ' "$NAS_RELEASE_REVISION" >> "$NAS_ROOT/deployment-history.log"
    cat "$NAS_ROOT/deployment/status.json" >> "$NAS_ROOT/deployment-history.log"
    case "$*" in
      *" gate")
        if ! grep -q '^  gate:' "$compose_file"; then echo "no such service: gate" >&2; exit 20; fi
        if [ -f "$NAS_ROOT/legacy-listener" ]; then echo "port 8080 already in use" >&2; exit 21; fi
        if [ "$NAS_RELEASE_REVISION" = "$FAIL_GATE_REVISION" ]; then exit 23; fi
        touch "$NAS_ROOT/gate-listener" ;;
      *" app web")
        if [ "$NAS_RELEASE_REVISION" = "$FAIL_REVISION" ]; then exit 17; fi
        if ! grep -q '^  gate:' "$compose_file"; then
          if [ -f "$NAS_ROOT/gate-listener" ]; then echo "port 8080 already in use" >&2; exit 21; fi
          touch "$NAS_ROOT/legacy-listener"
        fi ;;
    esac ;;
  *" build"*)
    if [ "$NAS_RELEASE_REVISION" = "$FAIL_BUILD_REVISION" ]; then exit 18; fi ;;
  *" ps --all")
    if [ "$NAS_RELEASE_REVISION" = "$FAIL_PS_REVISION" ]; then exit 19; fi ;;
  *" logs "*)
    if [ "$NAS_RELEASE_REVISION" = "$FAIL_LOGS_REVISION" ]; then exit 22; fi
    printf 'fixture backend startup log\\n' ;;
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
    const statusPath = path.join(root, "deployment/status.json");
    const deployment = () => JSON.parse(fs.readFileSync(statusPath, "utf8"));
    run();
    const revision = fs.readFileSync(path.join(root, "current-revision"), "utf8");
    assert.deepEqual(deployment(), { previous: "", next: revision.trim() });
    assert.equal(fs.statSync(statusPath).mode & 0o777, 0o644);
    assert.equal(fs.statSync(path.dirname(statusPath)).mode & 0o777, 0o755);
    const fingerprint = fs.readFileSync(path.join(root, "current-configuration"), "utf8");
    const operations = fs.readFileSync(path.join(root, "operations.log"), "utf8");
    assert.ok(operations.includes("--env-file " + path.join(root, "nas.env")));
    assert.ok(operations.includes("--env-file " + path.join(root, ".env")));
    assert.match(operations, /--project-name agesci-nas/);
    const gateStart = operations.indexOf("up -d --wait --wait-timeout 120 gate");
    const appStart = operations.indexOf("up -d --wait --force-recreate --wait-timeout 120 app web");
    assert.ok(gateStart >= 0 && appStart > gateStart, "gate must be healthy before app/web are replaced");
    assert.doesNotMatch(operations, /--force-recreate[^\n]* gate/);
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
    assert.deepEqual(deployment(), { previous: revision.trim(), next: second });
    assert.equal(fs.readFileSync(path.join(root, "previous-revision"), "utf8").trim(), revision.trim());
    assert.deepEqual(releases(), [revision.trim(), second, "b".repeat(40)].sort());
    assert.ok(fs.existsSync(path.join(root, "releases", "manual-backup")));
    assert.ok(fs.readFileSync(path.join(root, "operations.log"), "utf8").includes(`image rm agesci-nas-app:${legacy}`));
    const third = commit("third");
    run();
    assert.deepEqual(deployment(), { previous: second, next: third });
    assert.deepEqual(releases(), [second, third, "b".repeat(40)].sort());
    fs.unlinkSync(statusPath);
    assert.match(run(), /NAS gia' aggiornato/);
    assert.deepEqual(deployment(), { previous: second, next: third });
    fs.writeFileSync(path.join(root, ".env"), "NAS_CAPO_CODES=7654323\n");
    run();
    assert.deepEqual(deployment(), { previous: third, next: third });
    assert.equal(fs.readFileSync(path.join(root, "previous-revision"), "utf8").trim(), second);
    const beforeFailure = fs.readFileSync(path.join(root, "current-configuration"), "utf8");
    const failed = commit("failed");
    assert.throws(() => run({ FAIL_BUILD_REVISION: failed }), error => {
      assert.match(error.stderr.toString(), /fallito durante: build delle immagini app e web/);
      return true;
    });
    const beforeGateFailure = fs.readFileSync(path.join(root, "operations.log"), "utf8");
    assert.throws(() => run({ FAIL_GATE_REVISION: failed }), error => {
      assert.match(error.stdout.toString(), new RegExp("Ripristinato il codice precedente: " + third));
      return true;
    });
    const gateFailure = fs.readFileSync(path.join(root, "operations.log"), "utf8").slice(beforeGateFailure.length);
    assert.doesNotMatch(gateFailure, new RegExp(failed + " compose .*up .*app web"));
    assert.throws(() => run({ FAIL_REVISION: failed, FAIL_PS_REVISION: failed }), error => {
      assert.match(error.stdout.toString(), new RegExp("Ripristinato il codice precedente: " + third));
      assert.match(error.stdout.toString(), /fixture backend startup log/);
      assert.match(error.stderr.toString(), /tento comunque il ripristino/);
      return true;
    });
    assert.deepEqual(deployment(), { previous: failed, next: third });
    const history = fs.readFileSync(path.join(root, "deployment-history.log"), "utf8");
    assert.ok(history.includes(failed + " " + JSON.stringify({ previous: third, next: failed })));
    assert.ok(history.includes(third + " " + JSON.stringify({ previous: failed, next: third })));
    assert.equal(fs.readFileSync(path.join(root, "current-revision"), "utf8").trim(), third);
    assert.equal(fs.readFileSync(path.join(root, "current-configuration"), "utf8"), beforeFailure);
    assert.equal(fs.readFileSync(path.join(root, "previous-revision"), "utf8").trim(), second);
    assert.deepEqual(releases(), [second, third, failed, "b".repeat(40)].sort());
    assert.match(fs.readFileSync(path.join(root, "operations.log"), "utf8"),
      new RegExp(third + " compose .*up -d --build --wait"));

    // Older releases bind web to 8080 and have no gate service.
    fs.writeFileSync(path.join(root, "releases", third, "deploy/synology/compose.yaml"),
      composeFile.replace("  gate: {}\n", ""));
    fs.unlinkSync(path.join(root, "gate-listener"));
    fs.writeFileSync(path.join(root, "legacy-listener"), "");
    const beforeLegacy = fs.readFileSync(path.join(root, "operations.log"), "utf8");
    assert.throws(() => run({ FAIL_REVISION: failed, FAIL_LOGS_REVISION: failed }), error => {
      assert.match(error.stdout.toString(), new RegExp("Ripristinato il codice precedente: " + third));
      assert.match(error.stderr.toString(), /Impossibile leggere i log/);
      assert.doesNotMatch(error.stderr.toString(), /no such service|port 8080 already in use/);
      return true;
    });
    const legacyOperations = fs.readFileSync(path.join(root, "operations.log"), "utf8").slice(beforeLegacy.length);
    assert.ok(legacyOperations.indexOf("stop web") < legacyOperations.indexOf("up -d --wait --wait-timeout 120 gate"));
    assert.ok(legacyOperations.indexOf("stop gate") < legacyOperations.indexOf("up -d --build --wait --force-recreate"));
    assert.equal(fs.readFileSync(path.join(root, "current-revision"), "utf8").trim(), third);
    assert.equal(fs.readFileSync(path.join(root, "current-configuration"), "utf8"), beforeFailure);
    run();
    assert.deepEqual(deployment(), { previous: third, next: failed });
    assert.deepEqual(releases(), [third, failed, "b".repeat(40)].sort());
    assert.equal(fs.readFileSync(path.join(root, "data/keep.txt"), "utf8"), "existing runtime data");
    assert.equal(fs.existsSync(path.join(root, "update.lock")), false);
    fs.writeFileSync(path.join(root, "current-revision"), 'invalid"commit');
    assert.throws(() => run(), error => {
      assert.match(error.stderr.toString(), /commit non validi/);
      return true;
    });
    assert.deepEqual(deployment(), { previous: third, next: failed });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
