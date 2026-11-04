const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../home.js'), 'utf8');

function runHome(ics) {
  const ids = ['stato', 'calendar-month', 'calendar-days', 'event-list', 'calendar-status', 'calendar-prev', 'calendar-next'];
  const elements = new Map(ids.map(id => [id, makeElement(id)]));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = [tomorrow.getFullYear(), String(tomorrow.getMonth() + 1).padStart(2, '0'), String(tomorrow.getDate()).padStart(2, '0')].join('');
  const fixture = ics ?? `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:${day}
SUMMARY:Attività di gruppo\\, apertura anno
DESCRIPTION:Porta il quaderno
END:VEVENT
END:VCALENDAR`;
  const context = {
    Date, Intl, URL, console,
    document: {
      getElementById: id => elements.get(id) || null,
      createElement: makeElement
    },
    location: { search: '', hash: '', replace() {} },
    window: { ASSEMBLEA: { osserva(onState) { onState({ attiva: false }) } } },
    fetch: async () => ({ ok: true, text: async () => fixture })
  };
  vm.runInNewContext(source, context);
  return { elements, tomorrow };
}

function makeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    className: '',
    textContent: '',
    append(...children) { this.children.push(...children) },
    replaceChildren(...children) { this.children = children },
    setAttribute(name, value) { this.attributes[name] = value }
  };
}

test('home calendar parses the group ICS feed and shows upcoming events', async () => {
  const { elements, tomorrow } = runHome();
  await new Promise(resolve => setImmediate(resolve));
  const eventList = elements.get('event-list');
  assert.equal(elements.get('calendar-status').textContent, 'Calendario aggiornato.');
  assert.ok(elements.get('calendar-days').children.some(day => day.className.includes('has-event')));
  assert.equal(eventList.children[0].children[1].textContent, 'Attività di gruppo, apertura anno');
  assert.equal(eventList.children[0].children[2].textContent, 'Porta il quaderno');
  assert.match(eventList.children[0].children[0].dateTime, new RegExp(String(tomorrow.getFullYear())));
});

test('home event dates are selectable and the calendar month controls work', async () => {
  const { elements } = runHome();
  await new Promise(resolve => setImmediate(resolve));
  const eventDay = elements.get('calendar-days').children.find(day => day.className.includes('has-event'));
  eventDay.onclick();
  assert.ok(elements.get('calendar-days').children.some(day => day.className.includes('selected')));
  assert.equal(elements.get('event-list').children[0].children[1].textContent, 'Attività di gruppo, apertura anno');
  const currentMonth = elements.get('calendar-month').textContent;
  elements.get('calendar-next').onclick();
  assert.notEqual(elements.get('calendar-month').textContent, currentMonth);
  elements.get('calendar-prev').onclick();
  assert.equal(elements.get('calendar-month').textContent, currentMonth);
});
