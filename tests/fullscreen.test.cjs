const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assemblea/core/base.js'), 'utf8');
const script = source.slice(source.indexOf('async function toggleFullscreen('), source.indexOf('function linkSlide('));

test('fullscreen enters and exits using browser API', async () => {
  let entered = 0, exited = 0;
  const document = {
    documentElement: { requestFullscreen: async () => { entered++; } },
    exitFullscreen: async () => { exited++; },
  };
  const context = { document };
  vm.runInNewContext(script, context);
  await context.toggleFullscreen();
  assert.equal(entered, 1);
  document.fullscreenElement = {};
  await context.toggleFullscreen();
  assert.equal(exited, 1);
});

test('unsupported iPhone browsers get Home-screen instructions; API failures are reported', async () => {
  const alerts = [], errors = [];
  const context = {
    document: { documentElement: {} },
    alert: message => alerts.push(message),
    console: { error: (...args) => errors.push(args) },
  };
  vm.runInNewContext(script, context);
  await context.toggleFullscreen();
  assert.ok(alerts[0].includes('Aggiungi alla schermata Home'));
  context.document.documentElement.requestFullscreen = async () => { throw new Error('Denied'); };
  await context.toggleFullscreen();
  assert.equal(errors.length, 1);
  assert.ok(alerts[1].includes('Impossibile'));
});
