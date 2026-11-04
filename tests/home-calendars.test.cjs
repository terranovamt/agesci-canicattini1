const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('calendar selection preserves Outlook and embeds the three Google IDs without holidays', () => {
  const outlook = 'https://outlook.office365.com/calendar.html';
  const elements = {
    'calendar-view': { src: outlook, getAttribute() { return this.src } },
    'calendar-open': {},
    'calendar-view-title': {},
    'calendar-help': {}
  };
  const buttons = ['outlook', '0', '1', '2', 'google'].map(calendar => ({
    dataset: { calendar }, attributes: {},
    setAttribute(key, value) { this.attributes[key] = value }
  }));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../home-calendars.js'), 'utf8'), {
    URL, document: { getElementById: id => elements[id], querySelectorAll: () => buttons }
  });
  buttons[4].onclick();
  const combined = new URL(elements['calendar-view'].src);
  const ids = combined.searchParams.getAll('src');
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every(id => id.endsWith('@group.calendar.google.com')));
  assert.ok(ids.every(id => !id.includes('holiday')));
  assert.deepEqual(combined.searchParams.getAll('color'), ['#176B46', '#A64B00', '#B02A1F']);
  assert.equal(combined.searchParams.get('ctz'), 'Europe/Rome');
  for (let i = 1; i <= 3; i++) {
    buttons[i].onclick();
    const url = new URL(elements['calendar-view'].src);
    assert.deepEqual(url.searchParams.getAll('src'), [ids[i - 1]]);
    assert.equal(elements['calendar-open'].href, url.href);
    assert.equal(buttons[i].attributes['aria-pressed'], 'true');
    assert.equal(buttons.filter(button => button.attributes['aria-pressed'] === 'true').length, 1);
    assert.equal(elements['calendar-view-title'].textContent, ids[i - 1]);
  }
  buttons[0].onclick();
  assert.equal(elements['calendar-view'].src, outlook);
  assert.equal(elements['calendar-open'].href, outlook);
  assert.equal(elements['calendar-view-title'].textContent, 'Gruppo Canicattini 1');
});
