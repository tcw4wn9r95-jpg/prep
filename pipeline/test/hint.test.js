'use strict';

/**
 * The drill hint — one other word of the sentence, translated.
 *
 * Two things have to hold: it must never hand over the answer, and it must
 * never be wrong. The second is the harder one, because the lookup is by
 * surface spelling and Luxembourgish function words are heavily ambiguous.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;

let hint;
let glossary;
test.before(async () => {
  hint = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'drill', 'hint.js')).href);
  glossary = hint.buildGlossary(vocab, verbs);
});

test('hint: a spelling that means two different things is never glossed', () => {
  // `de` is the masculine article on nearly every page of the corpus and also
  // a clitic form of `du`, which the deck glosses as "you". A hint reading
  // "de = you" under "de ganzen Dag" teaches something false, and a wrong hint
  // is worse than no hint.
  for (const risky of ['de', 'se', 'et', 'an', 'mir', 'dat']) {
    assert.equal(glossary.has(risky), false, `"${risky}" is too ambiguous to gloss from spelling alone`);
  }
});

test('hint: every gloss it can give comes from the shipped decks', () => {
  const published = new Set();
  for (const item of vocab) if (item.en) published.add(item.en);
  for (const item of verbs) if (item.en) published.add(item.en);
  for (const en of glossary.values()) {
    assert.ok(published.has(en), `"${en}" is not a gloss LOD published`);
  }
});

test('hint: never the word being asked for, and never anything in the options', () => {
  const sentence = 'ech hunn haut Gebuertsdag am Kino';
  // Unexcluded, it offers something.
  assert.ok(hint.hintFor(glossary, sentence, { exclude: ['haut'] }));

  // Excluding a word by its Luxembourgish form keeps it out...
  const banLb = hint.hintFor(glossary, sentence, { exclude: ['haut', 'Gebuertsdag', 'Kino'] });
  assert.ok(!banLb || !['gebuertsdag', 'kino'].includes(banLb.lb.toLowerCase()));

  // ...and so does excluding it by its English gloss, because a gloss card's
  // options are English while the hint prints both sides.
  const byEnglish = hint.hintFor(glossary, sentence, { exclude: ['haut', 'birthday', 'cinema'] });
  assert.ok(!byEnglish || !['birthday', 'cinema'].includes(byEnglish.en.toLowerCase()));
});

test('hint: a multi-word option excludes each of its words', () => {
  // Options can be phrases ("d'Kand", "to have"); quoting half of one back
  // would still be a leak.
  const found = hint.hintFor(glossary, 'ech hunn haut Gebuertsdag am Kino', { exclude: ['haut', 'the Kino building'] });
  assert.ok(!found || found.lb.toLowerCase() !== 'kino');
});

test('hint: no candidate means no hint, never a guess', () => {
  assert.equal(hint.hintFor(glossary, 'et ass', { exclude: [] }), null);
  assert.equal(hint.hintFor(glossary, '', { exclude: [] }), null);
  assert.equal(hint.hintFor(glossary, null, { exclude: [] }), null);
  assert.equal(hint.hintFor(null, 'ech hunn haut Gebuertsdag', { exclude: [] }), null);
});

test('hint: real cards get a hint often enough to be worth having', () => {
  const withSentence = vocab.filter((item) => item.example?.lb && item.en);
  let covered = 0;
  for (const item of withSentence) {
    if (hint.hintFor(glossary, item.example.lb, { exclude: [item.lb, item.en] })) covered += 1;
  }
  const share = covered / withSentence.length;
  assert.ok(share > 0.6, `only ${Math.round(share * 100)}% of vocab cards could offer a hint`);
});
