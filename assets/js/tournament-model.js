(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.TOURNAMENT_MODEL = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = [
    { key: 'presentation', label: 'Presentazione', type: 'group' },
    { key: 'presence', label: 'Presenza', type: 'attendance' },
    { key: 'punctuality', label: 'Puntualità', type: 'boolean' },
    { key: 'loyalty', label: 'Lealtà', type: 'points' },
    { key: 'balooRules', label: 'Regole di Baloo', type: 'points' },
    { key: 'huntNotebook', label: 'Quaderno di caccia', type: 'points' },
    { key: 'style', label: 'Stile e comportamento', type: 'points' },
    { key: 'eye', label: 'Occhio', type: 'points' },
  ];
  const score = value => Number.isInteger(value) && value >= 0 && value <= 5 ? value * 20 : null;
  function standings(members, attendance, presentationScores) {
    const presence = new Map(attendance.map(person => [person.personId, person.status === 'presente']));
    const groups = new Map();
    for (const member of members) {
      const unit = member.unit || 'Senza sestiglia';
      if (!groups.has(unit)) groups.set(unit, []);
      groups.get(unit).push(member);
    }
    return [...groups].map(([unit, people]) => {
      const values = {};
      const present = people.filter(person => presence.get(person.personId));
      values.presence = people.length ? present.length / people.length * 100 : null;
      values.presentation = score(presentationScores.find(item => item.unit === unit)?.score);
      const punctual = present.filter(person => typeof person.punctuality === 'boolean');
      values.punctuality = punctual.length
        ? punctual.filter(person => person.punctuality).length / punctual.length * 100 : null;
      for (const key of ['loyalty', 'balooRules', 'huntNotebook', 'style', 'eye']) {
        const rated = present.map(person => score(person[key])).filter(value => value !== null);
        values[key] = rated.length ? rated.reduce((sum, value) => sum + value, 0) / rated.length : null;
      }
      const ranked = Object.values(values).filter(value => value !== null);
      values.total = ranked.length ? ranked.reduce((sum, value) => sum + value, 0) / ranked.length : null;
      return { unit, members: people.length, present: present.length, values };
    }).sort((a, b) => (b.values.total ?? -1) - (a.values.total ?? -1) || a.unit.localeCompare(b.unit, 'it'));
  }
  return { categories, standings };
});
