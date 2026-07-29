'use strict';

/**
 * Unit tests for the three libraries the Learn decks are generated from.
 *
 * These run against small hand-built fixtures rather than content/lexicon.json,
 * so they stay fast and stay meaningful when the corpus is re-fetched. The
 * counts that depend on the real corpus are asserted by the generators
 * themselves, which print them and fail the build when they collapse.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { locateTarget } = require('../lib/cloze');
const { topicsFor, makeSeedIndex, CATEGORY_TOPICS, GLOSS_TOPICS } = require('../lib/topic-tag');
const { cueFor, normaliseGloss, EXACT } = require('../lib/cues');
const { TOPICS } = require('../lib/topics');

/** Just enough lexicon for the locator: the form → entry index it reads. */
const LEXICON = {
  forms: {
    akafen: 'spelling:AKAFEN1',
    akaaft: 'spelling:AKAFEN1',
    stot: 'spelling:STOT1',
    stéit: 'inflection:STOT1',
    aen: 'spelling:A1',
    al: 'spelling:AL2', // the homograph sibling, not AL1 — the surface fallback case
    aendokter: 'spelling:AENDOKTER1',
  },
};

/* ----------------------------------------------------------------- cloze.js */

test('cloze: finds an inflected form via the lexicon index', () => {
  const found = locateTarget(LEXICON, 'AKAFEN1', 'akafen', 'de Grosist huet seng Wueren akaaft');
  assert.equal(found.form, 'akaaft');
  assert.equal(found.via, 'lexicon');
  assert.equal(found.before, 'de Grosist huet seng Wueren ');
  assert.equal(found.after, '');
});

test('cloze: before + form + after reconstructs the sentence exactly', () => {
  const sentence = 'mir haten d\'Boma bis zum Schluss bei eis am Stot';
  const found = locateTarget(LEXICON, 'STOT1', 'Stot', sentence);
  assert.equal(found.before + found.form + found.after, sentence);
});

test('cloze: falls back to a surface match when the form index points at a homograph', () => {
  // `al` resolves to AL2, but we are building AL1 — the spelling is still
  // unambiguous, so the fallback fires and says so.
  const found = locateTarget(LEXICON, 'AL1', 'al', 'déi al Fra ass elo an engem Altersheem');
  assert.equal(found.form, 'al');
  assert.equal(found.via, 'surface');
});

test('cloze: does not match a word inside a longer word', () => {
  assert.equal(locateTarget(LEXICON, 'NOPE1', 'Aen', 'den Aendokter ass do'), null);
});

test('cloze: reads through the d-clitic LOD writes attached', () => {
  // tokenise() splits d'Stéit into the clitic and the host; the host is what
  // has to be found, and the slice must keep the clitic in `before`.
  const found = locateTarget(LEXICON, 'STOT1', 'Stot', "haut sinn d'Stéit méi kleng ewéi fréier");
  assert.equal(found.form, 'Stéit');
  assert.equal(found.before, "haut sinn d'");
  assert.equal(found.via, 'lexicon');
});

test('cloze: returns null rather than guessing when the word is absent', () => {
  assert.equal(locateTarget(LEXICON, 'STOT1', 'Stot', 'ech ginn haut an d\'Stad'), null);
});

test('cloze: matching is case-insensitive on the surface fallback', () => {
  const found = locateTarget(LEXICON, 'ZZZ1', 'Fra', 'eng Fra steet do');
  assert.equal(found.form, 'Fra');
  assert.equal(found.via, 'surface');
});

/* ------------------------------------------------------------- topic-tag.js */

const seedIndex = makeSeedIndex(TOPICS);
const tag = (entry) => topicsFor(entry, { seedIndex });

test('topic-tag: a LOD semantic category wins over everything else', () => {
  const result = tag({
    lemma: 'Kaffi',
    categories: ['A1', 'GEDRENKS'],
    // The gloss would also match `medien` keywords; the category must win.
    glosses: { en: ['coffee'] },
  });
  assert.deepEqual(result.topics, ['iessen']);
  assert.equal(result.via, 'category');
});

test('topic-tag: falls back to the lemma being a topic seed', () => {
  const result = tag({ lemma: 'Fussball', categories: ['A1'], glosses: { en: ['football'] } });
  assert.equal(result.via, 'seed');
  assert.ok(result.topics.includes('sport'));
});

test('topic-tag: a seed in the entry own example sentence counts as evidence', () => {
  const result = tag({
    lemma: 'Zoossiss',
    categories: [],
    glosses: { en: ['sausage'] },
    meanings: [{ examples: [{ text: 'mir kachen haut an der Kichen' }] }],
  });
  assert.equal(result.via, 'seed');
  assert.ok(result.topics.includes('stot'));
});

test('topic-tag: gloss keywords are the last resort and match whole words only', () => {
  const result = tag({ lemma: 'Bureau', categories: [], glosses: { en: ['office'] } });
  assert.equal(result.via, 'gloss');
  assert.deepEqual(result.topics, ['aarbecht']);

  // "car" must not fire inside "cardigan".
  const noMatch = tag({ lemma: 'Kardigan', categories: [], glosses: { en: ['cardigan'] } });
  assert.equal(noMatch.via, null);
});

test('topic-tag: a word with no evidence stays untagged rather than guessed', () => {
  const result = tag({ lemma: 'Saach', categories: [], glosses: { en: ['thing'] } });
  assert.deepEqual(result.topics, []);
  assert.equal(result.via, null);
});

test('topic-tag: every mapped topic id exists in the taxonomy', () => {
  const known = new Set(TOPICS.map((topic) => topic.id));
  for (const topic of Object.values(CATEGORY_TOPICS)) {
    assert.ok(known.has(topic), `category map points at unknown topic "${topic}"`);
  }
  for (const topic of Object.keys(GLOSS_TOPICS)) {
    assert.ok(known.has(topic), `gloss map points at unknown topic "${topic}"`);
  }
});

test('topic-tag: results are sorted and deduplicated', () => {
  const result = tag({
    lemma: 'Chrëschtdag',
    categories: ['FEIERDEEG', 'FEST', 'MOUNT'],
    glosses: { en: ['christmas day'] },
  });
  assert.deepEqual(result.topics, [...new Set(result.topics)].sort());
});

/* ------------------------------------------------------------------ cues.js */

test('cues: attaches a glyph to a concrete noun in a cueable category', () => {
  assert.equal(cueFor({ categories: ['UEBST'], glosses: { en: ['strawberry'] } }), '🍓');
});

test('cues: refuses to cue a word outside the cueable categories', () => {
  // Same gloss, no category evidence that it is a concrete thing.
  assert.equal(cueFor({ categories: ['A2'], glosses: { en: ['work'] } }), null);
});

test('cues: strips articles and infinitive markers before matching', () => {
  assert.equal(normaliseGloss('to eat'), 'eat');
  assert.equal(normaliseGloss('the sun'), 'sun');
  assert.equal(normaliseGloss('bread (white)'), 'bread');
});

test('cues: falls back to a substring match only after exact glosses fail', () => {
  assert.equal(cueFor({ categories: ['BERUFFSBEZEECHNUNG'], glosses: { en: ['computer specialist'] } }), '💻');
});

test('cues: returns null rather than a decorative glyph when nothing matches', () => {
  assert.equal(cueFor({ categories: ['PERSOUN'], glosses: { en: ['bogeyman'] } }), null);
});

test('cues: the source table has no duplicate keys', () => {
  // A duplicate key in a JS object literal is silently swallowed — the later
  // value wins and the earlier mapping vanishes without a word. The only place
  // that can be caught is the source text.
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cues.js'), 'utf8');
  const table = source.slice(source.indexOf('const EXACT = {'), source.indexOf('const CONTAINS'));
  const keys = [...table.matchAll(/(?:^|[{,\s])['"]?([\p{L}'\s]+?)['"]?\s*:\s*'/gmu)].map((match) => match[1].trim());
  const seen = new Set();
  const duplicates = keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
  assert.deepEqual(duplicates, [], `duplicate cue keys: ${duplicates.join(', ')}`);
  assert.ok(Object.keys(EXACT).length > 200, 'the cue table should not have shrunk');
});

/* --------------------------------------------------------------- starters */

const { STARTERS, applyStarters } = require('../lib/starters');
const { rankDeck, STAGES } = require('../lib/frequency');

const alwaysClean = () => true;

test('starters: promotes an existing corpus entry rather than duplicating it', () => {
  // `gutt` is in the Grondwuertschatz with an example and a recording. A
  // hand-written stub next to it would be strictly worse, and two cards reading
  // "gutt = good" is just a bug the learner has to live with.
  const deck = [{ id: 'GUTT3', lb: 'gutt', en: 'good', example: { lb: 'dat ass gutt', audioId: 'x' } }];
  const result = applyStarters(deck, LEXICON_WITH_STARTERS, alwaysClean);
  const gutt = result.items.filter((item) => item.lb === 'gutt');
  assert.equal(gutt.length, 1, 'gutt must not be duplicated');
  assert.equal(gutt[0].id, 'GUTT3', 'the corpus entry is the one kept');
  assert.equal(gutt[0].starter, true);
  assert.equal(gutt[0].example.audioId, 'x', 'and it keeps its recording');
});

test('starters: synthesises only what the corpus genuinely lacks, with a real LOD id', () => {
  const result = applyStarters([], LEXICON_WITH_STARTERS, alwaysClean);
  const ech = result.items.find((item) => item.lb === 'ech');
  assert.ok(ech, 'ech is not in the Grondwuertschatz and has to be added');
  assert.equal(ech.id, 'START-ECH1');
  assert.equal(ech.lodId, 'ECH1', 'the id must come from the lexicon, not be invented');
  assert.equal(ech.starter, true);
});

test('starters: refuses to ship a word that does not resolve in the lexicon', () => {
  // The one place Luxembourgish is named by hand, so a typo must stop the
  // build rather than quietly drop the word.
  assert.throws(() => applyStarters([], { forms: {} }, alwaysClean), /must trace to a LOD record/);
});

test('starters: prefers the entry that has a recording when the deck has several', () => {
  const deck = [
    { id: 'A', lb: 'gutt', en: 'good', example: null },
    { id: 'B', lb: 'gutt', en: 'well', example: { lb: 'dat ass gutt', audioId: 'y' } },
  ];
  const result = applyStarters(deck, LEXICON_WITH_STARTERS, alwaysClean);
  const gutt = result.items.filter((item) => item.lb === 'gutt');
  assert.deepEqual(gutt.filter((item) => item.starter).map((item) => item.id), ['B']);
});

/** Every starter form, mapped as the real lexicon maps them. */
const LEXICON_WITH_STARTERS = {
  forms: Object.fromEntries(STARTERS.map((starter) => [starter.lb, `spelling:${starter.lb.toUpperCase()}1`])),
};

/* -------------------------------------------------------------- frequency */

test('frequency: ranks by count, and the sentence skeleton takes stage 1', () => {
  const items = [
    { id: 'RARE', lb: 'Wunngemeinschaft', pos: 'SUBST', level: 'A1' },
    { id: 'ECH', lb: 'ech', pos: 'PRON', level: 'A1', starter: true },
    { id: 'HUNN', lb: 'hunn', pos: 'VRB', level: 'A1' },
  ];
  const counts = new Map([['RARE', 2], ['ECH', 2206], ['HUNN', 1655]]);
  const ranked = rankDeck(items, counts);
  const byId = new Map(ranked.map((item) => [item.id, item]));

  assert.equal(byId.get('ECH').stage, 1, 'a starter is stage 1 whatever its frequency');
  assert.equal(byId.get('HUNN').stage, 2, 'the most frequent verbs come next');
  assert.ok(byId.get('RARE').stage >= 3, 'a rare noun waits');
  assert.ok(byId.get('ECH').rank < byId.get('RARE').rank);
  assert.equal(byId.get('RARE').freq, 2);
});

test('frequency: ranking is deterministic when counts tie', () => {
  const items = [
    { id: 'B', lb: 'beta', pos: 'SUBST', level: 'A1' },
    { id: 'A', lb: 'alpha', pos: 'SUBST', level: 'A1' },
  ];
  const counts = new Map([['A', 5], ['B', 5]]);
  const first = rankDeck(items, counts).map((item) => item.id);
  const second = rankDeck([...items].reverse(), counts).map((item) => item.id);
  assert.deepEqual(first.sort(), second.sort());
  assert.equal(rankDeck(items, counts).find((item) => item.id === 'A').rank, 1, 'ties break on the lemma');
});

test('frequency: a word with no occurrences still gets a rank and a stage', () => {
  const ranked = rankDeck([{ id: 'X', lb: 'zzz', pos: 'SUBST', level: 'A2' }], new Map());
  assert.equal(ranked[0].freq, 0);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].stage, 5, 'unseen A2 words fall to the last stage');
});

test('frequency: the stage list is contiguous and labelled', () => {
  assert.deepEqual(STAGES.map((stage) => stage.n), [1, 2, 3, 4, 5]);
  for (const stage of STAGES) {
    assert.ok(stage.title && stage.blurb, `stage ${stage.n} needs a title and a blurb`);
  }
});

/* ------------------------------------------------- the shipped deck order */

test('deck: the first words shipped are the ones you build sentences from', () => {
  const vocab = require('../../app/data/vocab.json').items;
  const firstTwenty = vocab.slice(0, 20).map((item) => item.lb);
  for (const word of ['ech', 'du', 'mir', 'hien', 'net']) {
    assert.ok(firstTwenty.includes(word), `"${word}" must be among the first words, found: ${firstTwenty.join(', ')}`);
  }
});

test('deck: the verb deck opens with the verbs that carry sentences', () => {
  const verbs = require('../../app/data/verbs.json').items;
  const firstTen = verbs.slice(0, 10).map((item) => item.infinitive);
  for (const verb of ['hunn', 'sinn', 'goen', 'kënnen']) {
    assert.ok(firstTen.includes(verb), `"${verb}" must open the verb deck, found: ${firstTen.join(', ')}`);
  }
});

test('deck: no word appears twice with the same translation', () => {
  for (const name of ['vocab', 'verbs']) {
    const items = require(`../../app/data/${name}.json`).items;
    const seen = new Map();
    for (const item of items) {
      const key = `${String(item.lb ?? item.infinitive).toLowerCase()}|${String(item.en).toLowerCase()}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    assert.deepEqual(dupes, [], `${name} ships duplicate cards: ${dupes.map(([key]) => key).join(', ')}`);
  }
});
