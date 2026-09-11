'use strict';

/**
 * The Sentence Builder deck.
 *
 * Two guarantees are worth more than everything else here.
 *
 * **No Luxembourgish was authored.** Every sentence the activity ships has to
 * appear, character for character, in a source that existed before the builder
 * ran — LOD's own example sentences, or the tutor's model answers. The English
 * file is the one place a person types, and the one thing a person could type
 * into it by mistake is Luxembourgish. The first test is that gate.
 *
 * **Every sentence has English, and it is English about that sentence.** A card
 * with no prompt cannot be answered; a card with the *wrong* prompt is worse,
 * because it can be answered wrongly and look like the learner's fault. The
 * gloss-overlap test is a smoke alarm for the second, not a proof of it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));

const LOD = readJson('content', 'items', 'sentences.json');
const ANSWERS = readJson('content', 'hand-authored', 'sentence-answers.json');
const ENGLISH = readJson('content', 'hand-authored', 'sentence-english.json');
const ITEMS = [...LOD.items, ...ANSWERS.items];

let sentences;
test.before(async () => {
  sentences = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'sentences.js')).href);
});

/* ------------------------------------------------- nothing was authored */

test('sentences: every shipped sentence exists verbatim in a source', () => {
  // The corpus rule, as it applies to this deck. English is free text and is
  // written by hand; Luxembourgish never is. Somebody adding a sentence by
  // typing it into the translations file is the failure this catches, and it
  // would otherwise ship a plausible-looking card built from a sentence no
  // Luxembourgish speaker ever wrote.
  const lodExamples = new Set();
  for (const deck of ['vocab', 'verbs']) {
    for (const item of readJson('content', 'items', `${deck}.json`).items ?? []) {
      if (item.example?.lb) lodExamples.add(item.example.lb);
    }
  }

  const tutor = new Set();
  const model = readJson('content', 'hand-authored', 'model-answers.json');
  const { intoSentences } = require('../build-sentences.js');
  for (const topic of model.interviews ?? []) {
    for (const question of topic.questions ?? []) {
      for (const answer of question.answers_lb ?? []) {
        for (const sentence of intoSentences(answer)) tutor.add(sentence);
      }
    }
  }

  for (const item of LOD.items) {
    assert.ok(lodExamples.has(item.lb), `not a LOD example sentence: ${item.lb}`);
  }
  for (const item of ANSWERS.items) {
    assert.ok(tutor.has(item.lb), `not a sentence of any model answer: ${item.lb}`);
  }
});

test('sentences: the two files keep their provenance apart', () => {
  // The LOD file passes through pipeline/validate.js; the tutor's does not,
  // under the same exemption model-answers.json already carries. Mixing them
  // would quietly extend that exemption to material that should be checked.
  assert.ok(LOD.items.every((item) => item.source === 'lod'));
  assert.ok(ANSWERS.items.every((item) => item.source === 'model-answers'));
  assert.ok(LOD.items.length >= 50, `only ${LOD.items.length} validated sentences`);
});

/* --------------------------------------------------------- the English */

test('sentences: every sentence has an English prompt, and it is English', () => {
  for (const item of ITEMS) {
    assert.ok(item.en && item.en.trim().length > 0, `no English: ${item.lb}`);
    assert.notEqual(item.en.trim(), item.lb.trim(), `the English is the Luxembourgish: ${item.lb}`);
    // Luxembourgish-only letters in a field that is supposed to be English is
    // the signature of a paste into the wrong column. Proper nouns in these
    // translations (Tageblatt, Madeira, Houseker) carry none of them.
    assert.ok(!/[ëéäöüËÉÄÖÜ]/.test(item.en), `Luxembourgish characters in the English: ${item.en}`);
  }
});

test('sentences: an exam answer carries the question it answers, in both languages', () => {
  for (const item of ANSWERS.items) {
    assert.ok(item.question_lb, `no question: ${item.lb}`);
    assert.ok(item.question_en, `no English question: ${item.lb}`);
    assert.equal(typeof item.opensAnswer, 'boolean', `no opensAnswer flag: ${item.lb}`);
  }
  // And some of them open an answer, or every card would be a fragment.
  const openers = ANSWERS.items.filter((item) => item.opensAnswer).length;
  assert.ok(openers >= 20, `only ${openers} sentences open an answer`);
});

test('sentences: the English is about the sentence it is attached to', () => {
  // A smoke alarm for a translation that drifted onto the wrong sentence —
  // the kind of mistake that is invisible in review because both halves read
  // fine on their own.
  //
  // It compares my English against LOD's *own* glosses for the words in the
  // sentence, so it is checking the translation against the dictionary rather
  // than against itself. It is deliberately loose: LOD glosses "fäerten" as
  // "to be scared of" where the natural English is "afraid", so a correct
  // translation can miss. 80% is well below the 89% measured when this was
  // written and far above what a shuffled set of translations would score.
  const gloss = new Map();
  for (const item of readJson('content', 'items', 'vocab.json').items ?? []) {
    if (item.lb && item.en) gloss.set(item.lb.toLowerCase(), item.en);
  }
  for (const item of readJson('content', 'items', 'verbs.json').items ?? []) {
    if (item.infinitive && item.en) gloss.set(item.infinitive.toLowerCase(), item.en);
  }

  const stop = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'it', 'that', 'and', 'i', 'you', 'we', 'they', 'my', 'your']);
  const bare = (text) => text.toLowerCase().replace(/[^\p{Letter}\s'’-]/gu, ' ').split(/\s+/).filter(Boolean);

  let checkable = 0;
  let overlapping = 0;
  for (const item of ITEMS) {
    const glosses = bare(item.lb).map((word) => gloss.get(word)).filter(Boolean);
    if (glosses.length < 2) continue;
    checkable += 1;
    const english = new Set(bare(item.en).filter((word) => !stop.has(word)));
    const hit = glosses.some((entry) =>
      bare(entry).some(
        (word) =>
          !stop.has(word) &&
          (english.has(word) || (word.length >= 4 && [...english].some((seen) => seen.startsWith(word.slice(0, 4))))),
      ),
    );
    if (hit) overlapping += 1;
  }

  assert.ok(checkable >= 100, `only ${checkable} sentences were checkable`);
  const share = overlapping / checkable;
  assert.ok(share >= 0.8, `only ${(share * 100).toFixed(0)}% of translations share a word with LOD's own glosses`);
});

/* ----------------------------------------------------------- the shape */

test('sentences: all eighteen exam topics have sentences', () => {
  const topics = new Set((readJson('content', 'items', 'topics.json').items ?? []).map((topic) => topic.id));
  const covered = new Set(ITEMS.map((item) => item.topic));
  for (const topic of topics) assert.ok(covered.has(topic), `no sentences for ${topic}`);
  for (const topic of covered) assert.ok(topics.has(topic), `${topic} is not an exam topic`);
  // Enough per topic that a round is not the same four sentences.
  for (const topic of topics) {
    const count = ITEMS.filter((item) => item.topic === topic).length;
    assert.ok(count >= 4, `${topic} has only ${count} sentences`);
  }
});

test('sentences: ids are unique and every sentence is a buildable length', () => {
  const { MIN_WORDS, MAX_WORDS } = require('../build-sentences.js');
  const ids = new Set();
  for (const item of ITEMS) {
    assert.ok(!ids.has(item.id), `duplicate id: ${item.id}`);
    ids.add(item.id);
    const length = item.lb.trim().split(/\s+/).length;
    assert.ok(length >= MIN_WORDS && length <= MAX_WORDS, `${length} words: ${item.lb}`);
  }
});

test('sentences: no sentence is shipped twice under two ids', () => {
  const seen = new Set();
  for (const item of ITEMS) {
    assert.ok(!seen.has(item.lb), `shipped twice: ${item.lb}`);
    seen.add(item.lb);
  }
});

/* ------------------------------------------------------------ the game */

test('sentences: the tiles are the sentence plus decoys, and the decoys are not in it', () => {
  const item = ITEMS.find((one) => one.topic === 'medien' && one.lb.split(/\s+/).length >= 5);
  const { tiles, answer } = sentences.tilesFor(item, ITEMS);

  const own = sentences.wordsOf(item.lb);
  const placed = tiles.filter((tile) => !tile.decoy).map((tile) => tile.word);
  assert.deepEqual([...placed].sort(), [...own].sort(), 'every word of the sentence must have a tile');
  assert.equal(answer, item.lb);

  const decoys = tiles.filter((tile) => tile.decoy);
  assert.ok(decoys.length > 0, 'a bank with no decoys is an anagram, not a choice');
  const inSentence = new Set(own.map((word) => word.toLowerCase()));
  for (const decoy of decoys) {
    // A decoy that is already a word of the sentence is placeable, correct to
    // the eye and wrong to the check — indistinguishable from the real tile.
    assert.ok(!inSentence.has(decoy.word.toLowerCase()), `decoy "${decoy.word}" is a word of the sentence`);
    // And it has to be a word: a bare "2" lifted out of "2 oder 3 Bicher" is
    // not a distractor, it is a puzzle about the data.
    assert.ok(/\p{Letter}/u.test(decoy.word), `decoy "${decoy.word}" is not a word`);
  }
});

test('sentences: the same sentence always deals the same tiles', () => {
  // Seeded, so a learner who leaves mid-round and comes back does not have to
  // re-read a re-shuffled bank, and so both players see the same puzzle.
  const item = ITEMS[3];
  const first = sentences.tilesFor(item, ITEMS).tiles.map((tile) => tile.word);
  const again = sentences.tilesFor(item, ITEMS).tiles.map((tile) => tile.word);
  assert.deepEqual(first, again);
});

test('sentences: the built sentence is marked word by word', () => {
  const answer = 'Ech hu vill léiwer richteg Bicher.';
  const right = sentences.wordsOf(answer).map((word, at) => ({ id: `w${at}`, word }));
  assert.equal(sentences.checkBuilt(right, answer).correct, true);
  assert.deepEqual(sentences.markPlaces(right, answer), [true, true, true, true, true, true]);

  // Two words swapped: still six tiles, still all the right words, wrong
  // sentence — and the marking says which two moved rather than just "wrong".
  const swapped = [...right];
  [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.equal(sentences.checkBuilt(swapped, answer).correct, false);
  assert.deepEqual(sentences.markPlaces(swapped, answer), [true, false, false, true, true, true]);
});

test('sentences: a round leads with a real exam answer, and one that opens it', () => {
  const round = sentences.buildRound(ITEMS, new Set(), { topic: 'medien' });
  assert.ok(round.length > 0);
  assert.equal(round[0].source, 'model-answers', 'a round should not open on a dictionary sentence');
  assert.equal(round[0].opensAnswer, true, 'a round should not open mid-answer');
});

test('sentences: a finished topic still gives you a round', () => {
  // This is a set to work through, not a scheduler. Somebody who has finished
  // a topic and taps it again wants practice, not a screen congratulating them.
  const inTopic = ITEMS.filter((item) => item.topic === 'sport');
  const done = new Set(inTopic.map((item) => item.id));
  const round = sentences.buildRound(ITEMS, done, { topic: 'sport' });
  assert.equal(round.length, Math.min(sentences.ROUND, inTopic.length));
});

test('sentences: topic progress counts what is finished, and what is a real answer', () => {
  const done = new Set([ITEMS[0].id]);
  const rows = sentences.topicProgress(ITEMS, done);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), ITEMS.length);
  assert.equal(rows.reduce((sum, row) => sum + row.finished, 0), 1);
  assert.ok(rows.every((row) => row.answers <= row.total));
});

/* ------------------------------------------------ required, but uncounted */

test('sentences: finishing a round is tracked on its own, not as cards answered', () => {
  // The request was explicit: mandatory, and not part of the daily goal. The
  // day is measured in cards answered, so the only way to be both is a mark of
  // its own — see `builderDoneToday` in store.js.
  const source = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'builder.js'), 'utf8');
  assert.ok(source.includes('markBuilderDone'), 'the round must mark the day done');
  assert.ok(!/recordLearnResult|answeredByDeck|todayProgress/.test(source), 'the builder must not touch the daily card count');

  const today = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'today.js'), 'utf8');
  assert.ok(/id: 'builder'/.test(today), 'Today must list it as a step of the day');
});

/* --------------------------------------------------------- the word flip */

let wordgloss;
test.before(async () => {
  wordgloss = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'wordgloss.js')).href);
});

const WORDS = readJson('content', 'hand-authored', 'word-english.json');

function glossary() {
  return wordgloss.buildWordGlossary(
    WORDS.words,
    readJson('content', 'items', 'vocab.json').items,
    readJson('content', 'items', 'verbs.json').items,
  );
}

test('wordgloss: a tile is looked up whatever punctuation and case it carries', () => {
  const { formKey } = wordgloss;
  assert.equal(formKey('Bicher.'), 'bicher');
  assert.equal(formKey('Ech'), 'ech');
  assert.equal(formKey('d’Aen!'), "d'aen");
  assert.equal(formKey("d'Aen!"), "d'aen");
  assert.equal(formKey('“Jo,'), 'jo');
});

test('wordgloss: the authored English overrides a deck gloss that is wrong here', () => {
  // The reason the authored file exists. Both the lexicon and the vocab deck
  // gloss the spelling `de` as "you" — it is a clitic of `du` — and in nearly
  // every sentence in this deck it is the masculine article. A lookup that
  // trusted the deck would turn "de Mount" into "you".
  const found = wordgloss.glossFor(glossary(), 'de');
  assert.match(found, /the/);
  assert.notEqual(found, 'you');
});

test('wordgloss: a spelling two deck entries claim is never silently resolved', () => {
  // `hunn` is "to have" and also a cockerel. Picking one is a coin flip
  // presented as a fact, so the deck lookup drops it; the authored file is
  // then free to say which reading this deck means.
  const bare = wordgloss.buildWordGlossary(
    {},
    readJson('content', 'items', 'vocab.json').items,
    readJson('content', 'items', 'verbs.json').items,
  );
  assert.equal(wordgloss.glossFor(bare, 'hunn'), null, 'an ambiguous spelling must not resolve on its own');
  assert.ok(wordgloss.glossFor(glossary(), 'hunn'), 'and the authored file must be able to settle it');
});

test('wordgloss: the clitic article is read, not guessed at', () => {
  // `d'Kanner` is the article written onto the noun. Splitting it off and
  // saying "the children" reads the text; inventing an ending would not.
  const found = glossary();
  assert.equal(wordgloss.glossFor(found, "d'Kanner"), 'the children');
  assert.match(wordgloss.glossFor(found, "d'Woch"), /^the /);
});

test('wordgloss: most of a sentence can be tapped, and the rest says so', () => {
  // Not all of it — a gloss that is not known is left unknown and the tile is
  // marked inert on screen, which is honest and visible. But a translation
  // mode that answered one word in three would not be worth turning on.
  const found = glossary();
  let tiles = 0;
  let glossed = 0;
  for (const item of ITEMS) {
    for (const word of item.lb.split(/\s+/)) {
      tiles += 1;
      if (wordgloss.glossFor(found, word)) glossed += 1;
    }
  }
  const share = glossed / tiles;
  assert.ok(share >= 0.8, `only ${(share * 100).toFixed(0)}% of word tiles can be translated`);
});

test('wordgloss: every authored key is a form that really occurs', () => {
  // The corpus rule reaching the one file whose *keys* are Luxembourgish. A
  // key nobody's sentence contains is a Luxembourgish form somebody typed,
  // unverified, which is exactly what must not accumulate here.
  const occurring = new Set();
  for (const item of ITEMS) {
    for (const word of item.lb.split(/\s+/)) {
      const key = wordgloss.formKey(word);
      if (!key) continue;
      occurring.add(key);
      const clitic = /^d'(.+)$/.exec(key);
      if (clitic) occurring.add(clitic[1]);
    }
  }
  const dead = Object.keys(WORDS.words).filter((key) => !occurring.has(wordgloss.formKey(key)));
  assert.deepEqual(dead, [], `authored glosses for forms that never occur: ${dead.join(', ')}`);
});

test('wordgloss: the authored values are English', () => {
  for (const [form, en] of Object.entries(WORDS.words)) {
    assert.ok(en.trim().length > 0, `no English for ${form}`);
    assert.ok(!/[ëéäöüËÉÄÖÜ]/.test(en), `Luxembourgish characters in the English for ${form}: ${en}`);
  }
});

test('builder: the question is asked in Luxembourgish, and flips on a tap', () => {
  // "let's ask the question only in Luxembourgish and then have a way to
  // toggle translation mode". The English question is still shipped — it is
  // what the flip turns over — but it is not what the card opens with.
  const source = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'builder.js'), 'utf8');
  assert.ok(/builder__question[\s\S]*item\.question_lb/.test(source), 'the question must be rendered in Luxembourgish');
  assert.ok(/flip\(questionEl, `“\$\{item\.question_en\}”`\)/.test(source), 'tapping it must flip to the English');
  assert.ok(/HOLD_MS = 3000/.test(source), 'a flip must fall back after three seconds');
  assert.ok(/builderTranslate/.test(source), 'the mode must be remembered');
});
