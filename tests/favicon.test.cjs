const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('all site pages use the home favicon', () => {
  const docs = path.join(__dirname, '..');
  const pages = ['index.html', 'setup.html', 'area-riservata/index.html',
    'assemblea/index.html', 'assemblea/setup.html',
    'assemblea/regia.html', 'assemblea/guida.html'];
  const icons = pages.map(page => {
    const html = fs.readFileSync(path.join(docs, page), 'utf8');
    const icon = html.match(/<link rel="icon" href="([^"]+)">/);
    assert.ok(icon, page + ' has a favicon');
    return path.resolve(docs, path.dirname(page), icon[1]);
  });
  icons.forEach(icon => assert.equal(icon, icons[0]));
  assert.ok(fs.existsSync(icons[0]));
});
