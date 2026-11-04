const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('dashboard does not load data or make requests before verified access', () => {
  const context = {
    window: { ACCESSO: { verificata: () => false } },
    document: { getElementById() { throw new Error('must not render before login') } },
    fetch() { throw new Error('must not request before login') }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../area-dashboard.js'), 'utf8'), context);
  context.window.AREA_DASHBOARD.load();
});
