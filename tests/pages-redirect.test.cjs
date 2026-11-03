const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('Pages root redirects to the assembly, preserving regia and slide position', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [search, hash] of [['', ''], ['?regia=test', '#3.2']]) {
    let destination;
    vm.runInNewContext(script, { location: {
      search, hash, replace(url) { destination = url; },
    } });
    assert.equal(destination, 'Assemblea-di-Gruppo/index.html' + search + hash);
  }
  assert.ok(html.includes('http-equiv="refresh" content="0;url=Assemblea-di-Gruppo/index.html"'));
  assert.ok(fs.existsSync(path.join(__dirname, '../docs/Assemblea-di-Gruppo/index.html')));
});
