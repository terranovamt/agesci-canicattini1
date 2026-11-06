const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

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
