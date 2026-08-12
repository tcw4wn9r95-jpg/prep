'use strict';

/**
 * Change the word — the dative transformation game.
 *
 * The game states a *table* (ech → mir, du → dir …), and a table is the one
 * thing in this app that cannot be mined: the corpus attests "bei mir" but
 * never says that `mir` is what `ech` becomes. That mapping is a grammatical
 * claim from a cited source, which makes it exactly the kind of thing that
 * can rot silently. So it is checked from three directions here: every form
 * in it is attested by the shipped decks, its dative side matches the set
 * build-grammar.js actually mines against, and the questions it generates
 * only ever come from real mined sentences.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const GRAMMAR_PATH = path.join(ROOT, 'app', 'data', 'grammar.json');
const { DATIVE_PRONOUNS, DATIVE_PREPOSITIONS } = require('../build-grammar.js');

let forms;
test.before(async () => {
  forms = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'forms.js')).href);
});

const grammar = () => JSON.parse(fs.readFileSync(GRAMMAR_PATH, 'utf8')).items;

/* ------------------------------------------------------------- the table */

test('forms: the dative side of the table is exactly what build-grammar mines against', () => {
  // The two lists are written in different files for different reasons — one
  // drives mining, one drives this game — and a card whose answer the miner
  // does not recognise would be unanswerable from any real sentence.
  assert.deepEqual([...forms.DATIVE_FORMS].sort(), [...DATIVE_PRONOUNS].sort());
});

test('forms: every Luxembourgish form in the table is attested by a shipped deck', () => {
  const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
  const attested = new Set();
  for (const item of vocab) {
    for (const word of String(item.lb ?? '').match(/[\p{L}]+/gu) ?? []) attested.add(word.toLowerCase());
    for (const word of String(item.example?.lb ?? '').match(/[\p{L}]+/gu) ?? []) attested.add(word.toLowerCase());
  }
  for (const item of grammar()) {
    for (const field of [item.before, item.after, ...(item.options_lb ?? [])]) {
      for (const word of String(field ?? '').match(/[\p{L}]+/gu) ?? []) attested.add(word.toLowerCase());
    }
  }
  for (const row of forms.DATIVE_TABLE) {
    assert.ok(attested.has(row.nom.toLowerCase()), `"${row.nom}" is written into the table but no shipped deck attests it`);
    assert.ok(attested.has(row.dat.toLowerCase()), `"${row.dat}" is written into the table but no shipped deck attests it`);
  }
});

test('forms: the table covers every person once, with a gloss to tell the collisions apart', () => {
  // `mir` and `dir` appear on both sides of the table, and `si` is two rows.
  // Without the English gloss a card would be unanswerable — see the header
  // of screens/forms.js. This asserts the gloss is what disambiguates them.
  for (const row of forms.DATIVE_TABLE) {
    assert.ok(row.en && row.en.length > 0, `${row.nom} → ${row.dat} has no gloss`);
  }
  const si = forms.DATIVE_TABLE.filter((row) => row.nom === 'si');
  assert.equal(si.length, 2, 'si is both "she" and "they"');
  assert.notEqual(si[0].en, si[1].en, 'the two si rows must be told apart by their gloss');
  assert.notEqual(si[0].dat, si[1].dat, 'the two si rows must have different answers');

  // Every row is a distinct question: same nominative *and* same gloss twice
  // would be an unanswerable duplicate.
  const keys = forms.DATIVE_TABLE.map((row) => `${row.nom}|${row.en}`);
  assert.equal(new Set(keys).size, keys.length, 'two rows ask the same question');
});

/* -------------------------------------------------------------- the pool */

test('forms: every question comes from a real mined sentence, never invented', (t) => {
  if (!fs.existsSync(GRAMMAR_PATH)) return t.skip('no grammar.json yet');
  const items = grammar();
  const byId = new Map(items.map((item) => [item.id, item]));
  const pool = forms.formsPool(items);
  assert.ok(pool.length >= 10, `expected a playable pool, got ${pool.length}`);

  for (const card of pool) {
    const source = byId.get(card.id);
    assert.ok(source, `${card.id} does not trace back to a grammar item`);
    assert.equal(source.kind, 'dative');
    // The sentence pieces are the mined item's own, and the answer really is
    // the word LOD wrote in that gap.
    assert.equal(card.before, source.before);
    assert.equal(card.after, source.after);
    assert.equal(card.dat.toLowerCase(), source.options_lb[source.correct].toLowerCase());
    assert.ok(DATIVE_PREPOSITIONS.has(card.preposition.toLowerCase()), `"${card.preposition}" is not a dative preposition`);
    // And the transformation shown is the table's, not something derived here.
    const row = forms.DATIVE_TABLE.find((candidate) => candidate.nom === card.nom && candidate.dat === card.dat);
    assert.ok(row, `${card.nom} → ${card.dat} is not a row of the table`);
  }
});

test('forms: one question per preposition+pronoun pair, so a round is not the same answer ten times', (t) => {
  if (!fs.existsSync(GRAMMAR_PATH)) return t.skip('no grammar.json yet');
  // "bei eis" is mined fifteen times; all fifteen becoming cards would make a
  // ten-card round mostly one answer.
  const pool = forms.formsPool(grammar());
  const keys = pool.map((card) => `${card.preposition.toLowerCase()}|${card.dat}`);
  assert.equal(new Set(keys).size, keys.length, 'a preposition+pronoun pair appears twice in the pool');
});

/* ------------------------------------------------------------- the round */

test('forms: a card offers four distinct real dative forms, one of them right', (t) => {
  if (!fs.existsSync(GRAMMAR_PATH)) return t.skip('no grammar.json yet');
  const pool = forms.formsPool(grammar());
  for (const card of pool) {
    const options = forms.optionsFor(card);
    assert.equal(options.length, 4, `${card.id}: four options`);
    assert.equal(new Set(options).size, 4, `${card.id}: options must be distinct`);
    assert.ok(options.includes(card.dat), `${card.id}: the right answer must be among the options`);
    for (const option of options) {
      assert.ok(forms.DATIVE_FORMS.includes(option), `${card.id}: "${option}" is not a real dative pronoun`);
    }
  }
});

test('forms: the correct answer is not always in the same position', (t) => {
  if (!fs.existsSync(GRAMMAR_PATH)) return t.skip('no grammar.json yet');
  const card = forms.formsPool(grammar())[0];
  const positions = new Set(Array.from({ length: 40 }, () => forms.optionsFor(card).indexOf(card.dat)));
  assert.ok(positions.size > 1, 'the answer is learnable by button position alone');
});

test('forms: a round is bounded by the pool and never repeats a card', (t) => {
  if (!fs.existsSync(GRAMMAR_PATH)) return t.skip('no grammar.json yet');
  const pool = forms.formsPool(grammar());
  const round = forms.roundFrom(pool);
  assert.ok(round.length <= 10 && round.length > 0);
  assert.equal(new Set(round.map((card) => card.id)).size, round.length, 'a card appears twice in one round');

  const small = forms.roundFrom(pool.slice(0, 3));
  assert.equal(small.length, 3, 'a short pool yields a short round rather than repeating');
});
