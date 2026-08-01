'use strict';

/**
 * The cheat sheet's data functions — pronounRows, verbTables, phraseGroups.
 *
 * These pull straight from the generated decks, so they are tested against
 * the real, committed JSON rather than fixtures: the thing worth catching is
 * a shape the real data can actually produce (a verb missing `present`, a
 * phrase group with zero frames), not a hand-built edge case that never
 * happens in practice.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const load = (name) => pathToFileURL(path.join(ROOT, 'app', 'js', name)).href;

const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;
const phrasesFile = require(path.join(ROOT, 'app', 'data', 'phrases.json'));

let reference;
test.before(async () => {
  reference = await import(load('screens/reference.js'));
});

test('reference: all seven subject pronouns resolve from the real vocab deck', () => {
  const rows = reference.pronounRows(vocab);
  assert.deepEqual(
    rows.map((row) => row.lb),
    ['ech', 'du', 'hien', 'si', 'hatt', 'mir', 'dir'],
    'order must match the person order the conjugation drill uses',
  );
  for (const row of rows) assert.ok(row.en, `${row.lb} has no gloss`);
});

test('reference: every core verb carries all six present-tense forms', () => {
  const tables = reference.verbTables(verbs);
  assert.ok(tables.length >= 6, `expected at least 6 core verbs, got ${tables.length}`);
  for (const table of tables) {
    assert.equal(table.forms.length, 6, `${table.infinitive} is missing a person`);
    for (const { form } of table.forms) assert.ok(form, `${table.infinitive} has an empty form`);
  }
});

test('reference: a verb with no present-tense data is left out rather than shown blank', () => {
  const tables = reference.verbTables([{ infinitive: 'sinn', en: 'to be', present: null }]);
  assert.equal(tables.length, 0);
});

test('reference: phrase groups carry only frames that are actually in that group', () => {
  const groups = reference.phraseGroups(phrasesFile.items, phrasesFile.meta.groups);
  assert.ok(groups.length > 0);
  for (const group of groups) {
    assert.ok(group.frames.length > 0, `${group.id} was kept with zero frames`);
    for (const frame of group.frames) assert.equal(frame.group, group.id);
  }
  const total = groups.reduce((sum, group) => sum + group.frames.length, 0);
  assert.equal(total, phrasesFile.items.length, 'every phrase must land in exactly one group');
});

test('reference: an empty group is dropped rather than shown with nothing in it', () => {
  const groups = reference.phraseGroups([], [{ id: 'ghost', title: 'Ghost' }]);
  assert.equal(groups.length, 0);
});
