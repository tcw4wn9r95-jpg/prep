'use strict';

/**
 * The picture-naming game's word list and search hygiene.
 *
 * `collectWords` decides which vocabulary entries are "everyday objects" —
 * tested against small fabricated corpus/vocab fixtures so the category and
 * exclusion logic can be checked precisely, the same reasoning grammar.test.js
 * uses fixtures for its own mining rules. The shipped word-images.json is
 * checked separately, against the real file, for the things only real data
 * can show (licence hygiene, no duplicate referents, real mirrored files).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { collectWords, searchQueryFor, cleanGloss, titleMatches, OBJECT_CATEGORIES, EXCLUDE_CATEGORIES } = require(
  path.join(ROOT, 'pipeline', 'fetch-object-images.js'),
);

/* --------------------------------------------------------------- fixtures */

function vocabItem(overrides) {
  return { pos: 'SUBST', lb: 'Wuert', en: 'word', rank: 100, level: 'A1', ...overrides };
}

function corpusEntry(id, lemma, categories) {
  return { id, lemma, categories };
}

/* --------------------------------------------------------------- collectWords */

test('collectWords: keeps a concrete noun tagged with an object category', () => {
  const vocab = [vocabItem({ id: 'APEL1', lb: 'Apel', en: 'apple', rank: 10 })];
  const corpus = { entries: [corpusEntry('APEL1', 'Apel', ['UEBST', 'A1'])] };
  const words = collectWords(vocab, corpus);
  assert.equal(words.length, 1);
  assert.equal(words[0].lb, 'Apel');
});

test('collectWords: drops a word with no object category at all', () => {
  const vocab = [vocabItem({ id: 'GLECK1', lb: 'Gléck', en: 'luck', rank: 10 })];
  const corpus = { entries: [corpusEntry('GLECK1', 'Gléck', ['A1'])] };
  assert.equal(collectWords(vocab, corpus).length, 0);
});

test('collectWords: a person-shaped category wins even alongside an object one', () => {
  // LOD's own "Kach" (chef) carries both HORECA and PERSOUN — the bug this
  // guards is a naive "has any object category" check accepting it.
  const vocab = [vocabItem({ id: 'KACH1', lb: 'Kach', en: 'chef', rank: 10 })];
  const corpus = { entries: [corpusEntry('KACH1', 'Kach', ['HORECA', 'PERSOUN', 'BERUFFSBEZEECHNUNG'])] };
  assert.equal(collectWords(vocab, corpus).length, 0);
});

test('collectWords: ANAT is not treated as an object category', () => {
  // Deliberately excluded — see the comment on OBJECT_CATEGORIES for why
  // (Commons' body-part results skew toward dissection and pathology
  // photography). A regression here would silently bring body parts back.
  assert.ok(!OBJECT_CATEGORIES.has('ANAT'), 'ANAT must stay out of OBJECT_CATEGORIES');
  const vocab = [vocabItem({ id: 'NUES1', lb: 'Nues', en: 'nose', rank: 10 })];
  const corpus = { entries: [corpusEntry('NUES1', 'Nues', ['ANAT', 'A1'])] };
  assert.equal(collectWords(vocab, corpus).length, 0);
});

test('collectWords: only SUBST entries qualify, even with an object category', () => {
  const vocab = [vocabItem({ id: 'IESSEN1', lb: 'iessen', en: 'to eat', pos: 'VRB', rank: 10 })];
  const corpus = { entries: [corpusEntry('IESSEN1', 'iessen', ['IESSEN'])] };
  assert.equal(collectWords(vocab, corpus).length, 0);
});

test('collectWords: an entry with no English gloss is left out', () => {
  const vocab = [vocabItem({ id: 'X1', lb: 'X', en: null, rank: 10 })];
  const corpus = { entries: [corpusEntry('X1', 'X', ['IESSEN'])] };
  assert.equal(collectWords(vocab, corpus).length, 0);
});

test('collectWords: a hand-excluded abstraction does not slip through its category tag', () => {
  // "Verb" is tagged SCHOUL in LOD's own data despite naming a grammar
  // concept, not a photographable thing.
  const vocab = [vocabItem({ id: 'VERB1', lb: 'Verb', en: 'verb', rank: 10 })];
  const corpus = { entries: [corpusEntry('VERB1', 'Verb', ['SCHOUL'])] };
  assert.equal(collectWords(vocab, corpus).length, 0);
});

test('collectWords: true synonyms are merged, keeping the more frequent spelling', () => {
  const vocab = [
    vocabItem({ id: 'HOND1', lb: 'Hond', en: 'dog', rank: 50 }),
    vocabItem({ id: 'MUPP1', lb: 'Mupp', en: 'dog', rank: 900 }),
  ];
  const corpus = {
    entries: [corpusEntry('HOND1', 'Hond', ['DEIER']), corpusEntry('MUPP1', 'Mupp', ['DEIER'])],
  };
  const words = collectWords(vocab, corpus);
  assert.equal(words.length, 1, 'two spellings of the same animal must not both become rounds');
  assert.equal(words[0].lb, 'Hond', 'the lower-rank (more frequent) spelling must be the one kept');
});

test('collectWords: "pepper" is exempt from the synonym merge — the two objects really differ', () => {
  // Uses a fixture lemma rather than the real "Peffer" — that real word is
  // itself in EXCLUDE_WORDS now (Commons has no reliable way to search for
  // the spice sense separately from the bell-pepper vegetable sense; see the
  // comment on EXCLUDE_WORDS), which would make it exit collectWords before
  // ever reaching the merge-exempt logic this test targets.
  const vocab = [
    vocabItem({ id: 'GEWIERZ1', lb: 'Peffergewiess', en: 'pepper', rank: 50 }),
    vocabItem({ id: 'PAPRIKA1', lb: 'Paprika', en: 'pepper', rank: 60 }),
  ];
  const corpus = {
    entries: [corpusEntry('GEWIERZ1', 'Peffergewiess', ['GEWIERZ']), corpusEntry('PAPRIKA1', 'Paprika', ['GEMEIS'])],
  };
  const words = collectWords(vocab, corpus);
  assert.equal(words.length, 2, 'a peppercorn and a bell pepper are different objects and both belong in the pool');
});

test('collectWords: sorted most-frequent first, and bounded by the limit', () => {
  const vocab = [
    vocabItem({ id: 'A1', lb: 'A', en: 'a', rank: 300 }),
    vocabItem({ id: 'B1', lb: 'B', en: 'b', rank: 10 }),
    vocabItem({ id: 'C1', lb: 'C', en: 'c', rank: 100 }),
  ];
  const corpus = {
    entries: ['A1', 'B1', 'C1'].map((id, index) => corpusEntry(id, ['A', 'B', 'C'][index], ['IESSEN'])),
  };
  assert.deepEqual(collectWords(vocab, corpus).map((w) => w.lb), ['B', 'C', 'A']);
});

/* ------------------------------------------------------------- search hygiene */

test('cleanGloss: strips the parentheses but keeps the disambiguating word inside them', () => {
  assert.equal(cleanGloss('(pair of) trousers'), 'pair of trousers');
  assert.equal(cleanGloss('(potato) chip'), 'potato chip');
  assert.equal(cleanGloss('apple'), 'apple');
});

test('searchQueryFor: every query stays free of accidents, media and pathology results', () => {
  // Found by hand while building this: "train" surfaced the 1895 Montparnasse
  // crash photo, and "wine" surfaced a 1924 film poster, both ahead of an
  // actual photo of the thing. A regression here silently brings those back.
  const query = searchQueryFor('train');
  for (const bad of ['crash', 'wreck', 'accident', 'poster', 'disease', 'pathology']) {
    assert.ok(query.includes(`-${bad}`), `query is missing the "-${bad}" exclusion: ${query}`);
  }
  assert.ok(query.startsWith('train '), `the gloss itself must lead the query: ${query}`);
});

test('searchQueryFor: never exceeds CirrusSearch\'s 300-character limit', () => {
  // The bug this guards is the one that actually cost a session of live
  // fetching: CirrusSearch caps a search string at 300 characters (the
  // `filetype:` prefix does not count against it) and answers a longer one
  // with `cirrussearch-query-too-long-with-exemptions` as a 200 — no
  // exception, no non-2xx status, nothing `politeFetch`'s 429 handling
  // notices. Every single search silently found nothing, indistinguishable
  // from Commons rate-limiting (which was also genuinely happening at the
  // same time) until curl against the real endpoint showed the actual error
  // body. Checked against the longest real gloss in the shipped word list,
  // not a guess, so growing GENERAL_EXCLUDE again fails this before it ships.
  const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
  const longestGloss = vocab.reduce((longest, item) => ((item.en ?? '').length > longest.length ? item.en : longest), '');
  const query = searchQueryFor(longestGloss);
  assert.ok(query.length <= 300, `query is ${query.length} chars ("${longestGloss}"), over CirrusSearch's 300-char limit: ${query}`);
});

test('titleMatches: requires the real word, not just the disambiguating one', () => {
  // The bug this guards: an earlier version required "human" (this project's
  // own search-side nudge for body-part terms) to appear in the *title* too,
  // which rejected a correct, plainly-titled anatomical diagram in favour of
  // a literal "human head louse" photo that happened to contain both words.
  assert.ok(titleMatches('Head lateral sagittal brain', 'head'), 'a title naming the real word must pass');
  assert.ok(!titleMatches('Some unrelated bird photo', 'water'), 'a title naming neither word must fail');
});

test('titleMatches: a multi-word disambiguated term requires every significant word', () => {
  assert.ok(titleMatches('A bag of potato chips', 'potato chip'));
  assert.ok(!titleMatches('Wood chip pile', 'potato chip'), 'chip alone is not enough for a compound term');
});

/* ---------------------------------------------------- the shipped deck, if built */

const DATA_PATH = path.join(ROOT, 'app', 'data', 'word-images.json');

test('word-images: every shipped photo is openly licensed and traces to a real word', (t) => {
  if (!fs.existsSync(DATA_PATH)) return t.skip('word-images.json not built yet — run npm run fetch:object-images');
  const { items } = require(DATA_PATH);
  const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
  const byLb = new Map(vocab.map((item) => [item.lb, item]));

  assert.ok(items.length > 0, 'expected at least some object photos');
  const seenLb = new Set();
  const seenEn = new Set();
  const seenId = new Set();
  for (const item of items) {
    assert.ok(!seenId.has(item.id), `duplicate id ${item.id}`);
    seenId.add(item.id);
    assert.ok(!seenLb.has(item.lb), `${item.lb} appears twice — should have been deduped`);
    seenLb.add(item.lb);

    // Every lb ships from the real vocabulary deck — never invented here.
    assert.ok(byLb.has(item.lb), `${item.lb} is not in the shipped vocab deck`);

    assert.ok(item.imageLicence, `${item.lb} has no licence recorded`);
    assert.ok(/^cc0|^cc by|^public domain|^pd/i.test(item.imageLicence), `${item.lb}: unrecognised licence "${item.imageLicence}"`);
    assert.ok(item.imageCredit, `${item.lb} has no credit recorded`);
    assert.ok(item.imageSource?.startsWith('https://commons.wikimedia.org/'), `${item.lb}: source is not Commons`);
    assert.ok(item.imageUrl?.startsWith('assets/img/'), `${item.lb}: not pointed at the mirrored copy`);

    const mirrored = path.join(ROOT, 'app', item.imageUrl);
    assert.ok(fs.existsSync(mirrored), `${item.lb}: mirrored file missing at ${mirrored}`);
  }

  // No two different Luxembourgish words should describe the same real thing.
  for (const item of items) seenEn.add(item.en.toLowerCase());
  assert.ok(seenEn.size >= items.length - 1, 'expected at most one deliberate exception ("pepper") among gloss duplicates');
});
