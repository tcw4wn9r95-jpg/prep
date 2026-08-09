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

test('reference: core verbs carry a past tense and an imperative where LOD publishes one', () => {
  // build-verbs.js ships `past` (LOD's presentPerfect — "the ordinary way to
  // talk about the past") for 364 of 365 verbs and `imperative` for 343, so
  // nearly every core verb should carry both.
  const tables = reference.verbTables(verbs);
  const withPast = tables.filter((table) => table.pastForms);
  assert.ok(withPast.length >= tables.length - 1, `expected almost every core verb to have a past tense, got ${withPast.length}/${tables.length}`);
  for (const table of withPast) {
    assert.equal(table.pastForms.length, 6, `${table.infinitive}'s past tense is missing a person`);
    for (const { form } of table.pastForms) assert.ok(form, `${table.infinitive} has an empty past-tense form`);
  }

  // The four modals (kënnen, mussen, sollen, wëllen) genuinely have no
  // imperative — "can!" is not a command — so this checks that at least the
  // non-modal core verbs have one, not that every single one does.
  const withImperative = tables.filter((table) => table.imperativeForms);
  assert.ok(withImperative.length >= tables.length - 4, `expected most core verbs to have an imperative, got ${withImperative.length}/${tables.length}`);
  for (const table of withImperative) {
    assert.ok(table.imperativeForms.length > 0, `${table.infinitive}'s imperative is empty`);
    for (const { form, pronoun } of table.imperativeForms) {
      assert.ok(form, `${table.infinitive}'s imperative for ${pronoun} is empty`);
      assert.ok(['du', 'dir'].includes(pronoun), `${table.infinitive}'s imperative names an unexpected person: ${pronoun}`);
    }
  }
});

test('reference: past tense and imperative are absent, not blank, when a verb genuinely has neither', () => {
  const tables = reference.verbTables([{ infinitive: 'sinn', en: 'to be', present: { p1: 'sinn' }, past: null, imperative: null }]);
  assert.equal(tables[0].pastForms, null);
  assert.equal(tables[0].imperativeForms, null);
});

test('reference: the 100-verb list is ranked by real corpus frequency, most first', () => {
  const list = reference.rankedVerbTables(verbs, 100);
  assert.equal(list.length, 100, `expected 100 verbs, got ${list.length}`);

  const byInfinitive = new Map(verbs.map((item) => [item.infinitive, item.rank]));
  const ranks = list.map((table) => byInfinitive.get(table.infinitive));
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, 'the list must come out in rank order');
  assert.equal(new Set(list.map((table) => table.infinitive)).size, 100, 'no verb should appear twice');

  // hunn is rank 1 in the shipped deck (see app/data/verbs.json meta) — if the
  // most common verb in the language is not first in a "most-used" list,
  // something upstream of this function is wrong, not this test.
  assert.equal(list[0].infinitive, 'hunn', `expected the most frequent verb first, got ${list[0].infinitive}`);

  for (const table of list) {
    assert.equal(table.forms.length, 6, `${table.infinitive} is missing a present-tense person`);
  }
});

test('reference: the 100-verb list never invents a form for a verb the deck lacks one for', () => {
  // Guards the gate in pipeline/build-verbs.js from this side too: nothing
  // here should paper over a missing tense with an empty string or a made-up
  // placeholder — it is either a real LOD form or the group does not render.
  const list = reference.rankedVerbTables(verbs, 100);
  for (const table of list) {
    if (table.pastForms) for (const { form } of table.pastForms) assert.notEqual(form.trim(), '');
    if (table.imperativeForms) for (const { form } of table.imperativeForms) assert.notEqual(form.trim(), '');
  }
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
