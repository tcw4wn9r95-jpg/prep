'use strict';

/**
 * The Arcade's fifteen sentence functions.
 *
 * The patterns file names frames, grammar kinds and vocabulary lemmas as
 * strings. Nothing stops those strings from going stale when the content is
 * rebuilt — a frame that drops below the attestation threshold simply stops
 * shipping — and a pattern pointing at nothing produces a round with no
 * questions rather than an error. So every reference is checked against the
 * decks that actually ship.
 *
 * The other thing tested here is the promise the screen makes in its header:
 * the Arcade costs nothing to play. That is only true as long as it never
 * reaches the Leitner store or the daily counters, which is a property of the
 * source rather than of the output, so it is asserted against the source.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const phrases = require(path.join(ROOT, 'app', 'data', 'phrases.json')).items;
const grammar = require(path.join(ROOT, 'app', 'data', 'grammar.json')).items;
const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
const decks = { phrases, grammar, vocab };

let patterns;
test.before(async () => {
  patterns = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'arcade', 'patterns.js')).href);
});

test('arcade: all fifteen functions are defined, with distinct ids', () => {
  assert.equal(patterns.PATTERNS.length, 15);
  const ids = patterns.PATTERNS.map((pattern) => pattern.id);
  assert.equal(new Set(ids).size, 15, 'two patterns share an id');
  for (const pattern of patterns.PATTERNS) {
    assert.ok(pattern.title, `${pattern.id} has no title`);
    assert.ok(pattern.ask, `${pattern.id} does not say what it is for`);
  }
});

test('arcade: every named frame is one the phrase deck actually ships', () => {
  // A frame that fell below MIN_ATTESTATIONS stops shipping silently, and the
  // pattern that named it would just get quieter. Fail loudly instead.
  const shipped = new Set(phrases.map((phrase) => String(phrase.lb).toLowerCase()));
  for (const pattern of patterns.PATTERNS) {
    for (const frame of pattern.frames ?? []) {
      assert.ok(shipped.has(frame.toLowerCase()), `${pattern.id} names the frame "${frame}", which the phrase deck does not ship`);
    }
  }
});

test('arcade: every named grammar kind exists in the grammar deck', () => {
  const kinds = new Set(grammar.map((item) => item.kind));
  for (const pattern of patterns.PATTERNS) {
    for (const kind of pattern.kinds ?? []) {
      assert.ok(kinds.has(kind), `${pattern.id} names the grammar kind "${kind}", which is not in the deck`);
    }
  }
});

test('arcade: every named word is a real vocabulary lemma', () => {
  const lemmas = new Set(vocab.map((item) => String(item.lb ?? '').toLowerCase()));
  for (const pattern of patterns.PATTERNS) {
    for (const word of pattern.words ?? []) {
      assert.ok(lemmas.has(word.toLowerCase()), `${pattern.id} names the word "${word}", which is not in the vocabulary deck`);
    }
  }
});

test('arcade: every pattern can actually fill a round', () => {
  // The whole point of the tab is fifteen playable things. One that resolves
  // to nothing would show an empty state where a game is advertised.
  for (const pattern of patterns.PATTERNS) {
    assert.ok(patterns.isPlayable(pattern, decks), `${pattern.id} has too little material to play`);
    const { frames, items, words } = patterns.materialFor(pattern, decks);
    assert.ok(frames.length + items.length + words.length >= 2, `${pattern.id} resolved to almost nothing`);
  }
});

test('arcade: a pattern the corpus cannot fully support says so', () => {
  // Three functions have no attested frame — "my name is", "where is" and the
  // negative of "there is". Those patterns must carry a `gap` note, because
  // the alternative is inventing Luxembourgish to fill them.
  for (const id of ['naming', 'existence', 'location', 'liking']) {
    const pattern = patterns.patternById(id);
    assert.ok(pattern, `${id} is missing`);
    assert.ok(pattern.gap && pattern.gap.length > 20, `${id} should explain what the corpus does not write`);
  }
});

test('arcade: questions are built only from real deck rows', async () => {
  const arcade = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'arcade.js')).href);
  const frameLbs = new Set(phrases.map((phrase) => String(phrase.lb)));
  const exampleLbs = new Set(phrases.flatMap((phrase) => (phrase.examples ?? []).map((example) => example.lb)));
  const lemmas = new Set(vocab.map((item) => String(item.lb ?? '').toLowerCase()));

  for (const pattern of patterns.PATTERNS) {
    const questions = arcade.questionsFor(pattern, decks, () => 0.5);
    assert.ok(questions.length > 0, `${pattern.id} produced no questions`);
    for (const question of questions) {
      assert.ok(question.answer, `${pattern.id}: a question with no answer`);
      if (question.kind === 'frame') {
        assert.ok(frameLbs.has(question.answer), `${pattern.id}: "${question.answer}" is not a shipped frame`);
        // Every option is a real frame too, so a wrong answer is a real
        // Luxembourgish opener rather than something invented as a foil.
        for (const option of question.options) {
          assert.ok(frameLbs.has(option.value), `${pattern.id}: option "${option.value}" is not a shipped frame`);
        }
        assert.equal(question.options.filter((option) => option.correct).length, 1);
      }
      if (question.kind === 'build') {
        assert.ok(question.answer.split(/\s+/).length >= 3, 'a build question needs a real sentence');
        // wordBank draws its decoy tiles from `pool` and nowhere else. An
        // empty or absent pool is the bug that shipped once: it made the bank
        // the answer's own words in order, i.e. no exercise at all — and
        // anything *other* than corpus sentences here would put invented
        // Luxembourgish on a tile.
        assert.ok(Array.isArray(question.pool), `${pattern.id}: a build question with no decoy pool`);
        for (const sentence of question.pool) {
          assert.ok(exampleLbs.has(sentence), `${pattern.id}: decoy pool sentence "${sentence}" is not from the phrase deck`);
        }
      }
      if (question.kind === 'word') {
        assert.ok(lemmas.has(question.answer.toLowerCase()), `${pattern.id}: "${question.answer}" is not a vocabulary lemma`);
        for (const option of question.options) {
          assert.ok(lemmas.has(option.value.toLowerCase()), `${pattern.id}: option "${option.value}" is not a vocabulary lemma`);
        }
        assert.equal(question.options.filter((option) => option.correct).length, 1);
        assert.ok(question.gloss, `${pattern.id}: a word card with no gloss is unanswerable`);
        // The gapped sentence must not still contain the answer, or the card
        // shows its own solution.
        assert.ok(
          !`${question.before} ${question.after}`.toLowerCase().split(/[^\p{L}]+/u).includes(question.answer.toLowerCase()),
          `${pattern.id}: "${question.answer}" is still visible in its own gapped sentence`,
        );
      }
    }
  }
});

test('arcade: every round is long enough to be a game', async () => {
  // Not just "produces questions": a pattern that resolves to two cards is a
  // tile on the index that disappoints. Six is the floor — `wanting` sits
  // there because its three frames all carry long examples that a word bank
  // would turn into a memory test; everything else fills the round.
  const arcade = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'arcade.js')).href);
  for (const pattern of patterns.PATTERNS) {
    const questions = arcade.questionsFor(pattern, decks, () => 0.5);
    assert.ok(questions.length >= 6, `${pattern.id} only fills ${questions.length} cards`);
  }
});

test('arcade: a word is gapped on whole words, never inside a longer one', async () => {
  // `no` and `noen` is the real case: LOD's example for the lemma `no` is
  // "hie wunnt am noen Ausland". Gapping the substring would leave a card
  // whose own answer does not fit the hole.
  const { gapExample } = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'arcade.js')).href);
  assert.equal(gapExample('no', 'hie wunnt am noen Ausland'), null);
  assert.deepEqual(gapExample('do', 'do am Eck ass Plaz fir däi Vëlo'), { before: '', after: ' am Eck ass Plaz fir däi Vëlo' });
  // Punctuation around the word does not hide it.
  assert.deepEqual(gapExample('wien', 'wien huet dës Kéier gewonnen?'), { before: '', after: ' huet dës Kéier gewonnen?' });
  assert.equal(gapExample('wat', 'wien huet gewonnen?'), null);
});

test('arcade: the round costs nothing — no Leitner, no daily goal, no cap', () => {
  // The screen's header promises this, and it is the reason the tab exists.
  // Asserted against the source because it is about what is *not* called.
  const source = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'arcade.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['recordLearnResult', 'recordLearnSession', 'newWordsLeftToday', 'buildSession', 'buildMixedSession', 'runSession']) {
    assert.ok(!code.includes(forbidden), `arcade.js calls ${forbidden} — the Arcade must not touch progress or be capped`);
  }
  // touchStreak is the one number it may move, and it is genuinely practice.
  assert.ok(code.includes('touchStreak'), 'the Arcade should still count for the streak');
});
