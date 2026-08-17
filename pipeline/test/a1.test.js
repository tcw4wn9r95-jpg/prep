'use strict';

/**
 * The A1 filter's definition of "a word you already know".
 *
 * This is the piece that decides what an A1-only exercise may show, so being
 * wrong in either direction costs something real: too strict and the Arcade
 * empties out, too loose and a build card asks for a word the learner has
 * never met — which is the complaint the filter exists to answer.
 *
 * The tests below pin the two properties that make it trustworthy: that it
 * expands *forward* from A1 lemmas (so inflected forms of known words count),
 * and that it still rejects genuine A2 vocabulary.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { buildA1Forms, isA1Sentence, words } = require(path.join(ROOT, 'pipeline', 'lib', 'a1.js'));
const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;

let known;
test.before(() => {
  known = buildA1Forms();
});

test('a1: an A1 lemma brings its whole inflection table', () => {
  // The reason this is worth a test: matching lemmas alone rejected 125 of the
  // phrase deck's 126 example sentences, on words like `ass` and `huet` that
  // any beginner reads on day one. Forward expansion through the lexicon is
  // what fixes that, and it is invisible until it stops working.
  for (const form of ['ass', 'sinn', 'bass', 'hunn', 'hues', 'huet', 'hutt']) {
    assert.ok(known.has(form), `"${form}" should be readable at A1`);
  }
});

test('a1: the articles, pronouns and possessives count as known', () => {
  for (const form of ['de', 'den', 'eng', 'en', 'mer', 'mech', 'iech', 'meng', 'däi']) {
    assert.ok(known.has(form), `"${form}" should be readable at A1`);
  }
});

test('a1: genuine A2 content vocabulary is still rejected', () => {
  // The filter is only worth having if it says no. These are the words that
  // actually blocked sentences in the phrase deck.
  for (const form of ['conservatoire', 'tomatenzooss', 'däischter', 'fitness-zenter']) {
    assert.ok(!known.has(form), `"${form}" is above A1 and should not be readable`);
  }
});

test('a1: every word of a sentence has to be known, not just most', () => {
  assert.ok(isA1Sentence('ech hunn haut Gebuertsdag', known));
  assert.ok(!isA1Sentence('ech hunn haut am Conservatoire gespillt', known));
  // Empty is not readable — an absent sentence must not pass as an easy one.
  assert.ok(!isA1Sentence('', known));
  assert.ok(!isA1Sentence(null, known));
});

test('a1: the clitic article is not read as part of the noun', () => {
  // "d'Post" is the A1 noun `Post` behind `d'`. Treating the whole thing as
  // one token would call it unknown and throw away the sentence.
  assert.deepEqual(words("d'Post ass zou"), ['Post', 'ass', 'zou']);
  assert.deepEqual(words('d’Kanner spillen'), ['Kanner', 'spillen']);
});

test('a1: the filter is neither everything nor nothing', () => {
  // A degenerate filter would pass both of the tests above shapes-wise while
  // being useless. Anchor it against the deck it is derived from.
  const a1Rows = vocab.filter((item) => item.level === 'A1').length;
  assert.ok(known.size > a1Rows, 'expansion added no forms at all');
  assert.ok(known.size < 20000, `${known.size} forms is far more than the A1 vocabulary can justify`);
});
