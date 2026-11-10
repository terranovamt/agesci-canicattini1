const assert = require("node:assert/strict");
const { test } = require("node:test");
const { categories, standings } = require("../assets/js/tournament-model.js");

test("LC tournament percentages normalize by category and sestiglia membership", () => {
  const members = [
    ...Array.from({ length: 7 }, (_, index) => ({
      personId: index + 1, unit: "Bianchi",
      punctuality: index < 5 ? true : null,
      loyalty: index < 5 ? 5 : null,
      balooRules: index < 5 ? 5 : null,
      huntNotebook: index < 5 ? 5 : null,
      style: index < 5 ? 5 : null,
      behavior: index < 5 ? 2 : null,
      eye: index < 5 ? 5 : null,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      personId: index + 8, unit: "Rossi",
      punctuality: index < 2 ? true : null,
      loyalty: index < 2 ? 5 : null,
      balooRules: index < 2 ? 5 : null,
      huntNotebook: index < 2 ? 5 : null,
      style: index < 2 ? 5 : null,
      behavior: index < 2 ? 2 : null,
      eye: index < 2 ? 5 : null,
    })),
  ];
  const attendance = members.map(person => ({
    personId: person.personId,
    status: person.personId <= 5 || person.personId >= 8 && person.personId <= 9 ? "presente" : "assente",
  }));
  const results = standings(members, attendance, [
    { unit: "Bianchi", score: 5 }, { unit: "Rossi", score: 5 },
  ]);
  const bianchi = results.find(item => item.unit === "Bianchi");
  const rossi = results.find(item => item.unit === "Rossi");
  assert.equal(bianchi.members, 7);
  assert.equal(bianchi.present, 5);
  assert.equal(bianchi.values.presence, 5 / 7 * 100);
  assert.equal(bianchi.values.punctuality, 100,
    "five punctual attendees out of seven roster members still score 100% in punctuality");
  assert.equal(bianchi.values.loyalty, 100);
  assert.equal(bianchi.values.style, 100);
  assert.equal(bianchi.values.behavior, 40);
  assert.equal(Object.hasOwn(bianchi.values, "eye"), false, "legacy eye scores are not tournament parameters");
  assert.equal(bianchi.values.presentation, 100);
  assert.equal(rossi.values.punctuality, 100);
  assert.equal(rossi.values.loyalty, 100);
  assert.equal(categories.length, 8);
});

test("unrecorded tournament scores are excluded instead of silently counting as zero", () => {
  const result = standings([
    { personId: 1, unit: "Verdi", punctuality: null, loyalty: null },
    { personId: 2, unit: "Verdi", punctuality: null, loyalty: null },
  ], [
    { personId: 1, status: "presente" },
    { personId: 2, status: "assente" },
  ], []);
  assert.equal(result[0].values.presence, 50);
  assert.equal(result[0].values.punctuality, null);
  assert.equal(result[0].values.loyalty, null);
  assert.equal(result[0].values.total, 50);
});

test("style and behavior are separate categories but retain one shared total weight", () => {
  const result = standings([
    { personId: 1, unit: "Lupi", style: 5, behavior: null, loyalty: 5 },
  ], [{ personId: 1, status: "presente" }], []);
  assert.equal(result[0].values.style, 100);
  assert.equal(result[0].values.behavior, null);
  assert.equal(result[0].values.total, 100);
});
