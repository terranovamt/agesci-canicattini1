const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const destination = 'https://terranovamtt.synology.me/agesci-canicattini1/';

test('main redirects to the NAS with consistent non-JavaScript fallbacks', () => {
  assert.ok(html.includes(`http-equiv="refresh" content="0;url=${destination}"`));
  assert.ok(html.includes(`rel="canonical" href="${destination}"`));
  assert.ok(html.includes(`href="${destination}"`));
  assert.ok(!html.includes('url=peg/index.html'));
});

test('main preserves query and fragment when redirecting without adding a history entry', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const search of ['', '?embed&solo=limiti']) {
    for (const hash of ['', '#eventi', '#3.2']) {
      let actual;
      vm.runInNewContext(script, {
        location: { search, hash, replace: value => { actual = value; } }
      });
      assert.equal(actual, destination + search + hash);
    }
  }
});
