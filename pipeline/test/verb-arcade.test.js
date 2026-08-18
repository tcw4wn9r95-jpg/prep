'use strict';

/**
 * The verb games.
 *
 * Two things are worth testing here and neither is visible on screen.
 *
 * The first is **ambiguity**. Luxembourgish paradigms are full of syncretism —
 * `hunn` is ech, mir and si — so a card asking "who says hunn?" has three
 * right answers and accepts one, which teaches the learner they were wrong
 * when they were not. Every card that asks about a person or a number has to
 * be built from a form that identifies it uniquely, and that is a property of
 * the data rather than of the code path.
 *
 * The second is **balance**. The auxiliary split is 95 hunn to 15 sinn at A1,
 * so an unbalanced sort would let a player who always taps hunn finish on 86%.
 * A round that can be beaten without reading the card is not a round.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const { buildA1Forms, isA1Sentence } = require(path.join(ROOT, 'pipeline', 'lib', 'a1.js'));
const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;

const load = (file) => import(pathToFileURL(path.join(ROOT, 'app', 'js', file)).href);

let games;
let round;
test.before(async () => {
  games = await load('arcade/verbs.js');
  round = await load('screens/verb-arcade.js');
});

test('verbs: five games, distinct ids, each saying what it teaches', () => {
  assert.equal(games.VERB_GAMES.length, 5);
  assert.equal(new Set(games.VERB_GAMES.map((game) => game.id)).size, 5);
  for (const game of games.VERB_GAMES) {
    assert.ok(game.title && game.ask, `${game.id} is missing its labels`);
    // Shown on the round's opening line and again on the end card, so it is
    // content rather than a comment.
    assert.ok(game.teaches && game.teaches.length > 30, `${game.id} does not say what it teaches`);
    // The route dispatches on this prefix to tell a verb game from a sentence
    // function, so a bare id would silently 404 into the index.
    assert.ok(game.id.startsWith('verb-'), `${game.id} must be namespaced`);
  }
});

test('verbs: every game can fill a round, filtered and unfiltered', () => {
  for (const a1Only of [true, false]) {
    const pool = games.verbPool(verbs, { a1Only });
    for (const game of games.VERB_GAMES) {
      assert.ok(games.isVerbGamePlayable(game, pool), `${game.id} cannot be played with a1Only=${a1Only}`);
      const cards = round.verbQuestions(game, verbs, () => 0.5, { a1Only });
      assert.ok(cards.length >= 6, `${game.id} only filled ${cards.length} cards (a1Only=${a1Only})`);
    }
  }
});

test('verbs: a card never asks about a form that fits more than one person', () => {
  // The failure this guards is silent and demoralising: you answer "mir",
  // which is right, and the card marks you wrong because it wanted "ech".
  const byId = new Map(verbs.map((verb) => [verb.infinitive, verb]));
  for (let seed = 0; seed < 30; seed += 1) {
    const cards = round.verbQuestions(games.verbGameById('verb-person'), verbs, () => (seed * 0.033) % 1, { a1Only: true });
    for (const card of cards) {
      const infinitive = card.hint.replace(/^from /, '').split(' · ')[0];
      const verb = byId.get(infinitive);
      assert.ok(verb, `card names an unknown verb "${infinitive}"`);
      const matches = Object.values(verb.present).filter((form) => form === card.prompt).length;
      assert.equal(matches, 1, `"${card.prompt}" fits ${matches} persons of ${infinitive} — the card has more than one right answer`);
    }
  }
});

test('verbs: a number card never asks about a form that is both singular and plural', () => {
  const byId = new Map(verbs.map((verb) => [verb.infinitive, verb]));
  const SING = new Set(['p1', 'p2', 'p3']);
  for (let seed = 0; seed < 30; seed += 1) {
    const cards = round.verbQuestions(games.verbGameById('verb-number'), verbs, () => (seed * 0.033) % 1, { a1Only: true });
    for (const card of cards) {
      const verb = byId.get(card.hint.replace(/^from /, ''));
      assert.ok(verb, `card names an unknown verb in "${card.hint}"`);
      const numbers = new Set(
        Object.entries(verb.present)
          .filter(([, form]) => form === card.prompt)
          .map(([person]) => (SING.has(person) ? 'sing' : 'plur')),
      );
      assert.equal(numbers.size, 1, `"${card.prompt}" of ${verb.infinitive} is both singular and plural`);
      assert.equal([...numbers][0], card.answer, 'the card disagrees with the table it came from');
    }
  }
});

test('verbs: the two sorts are balanced, so tapping one side cannot win', () => {
  for (const id of ['verb-past', 'verb-number']) {
    for (let seed = 0; seed < 20; seed += 1) {
      const cards = round.verbQuestions(games.verbGameById(id), verbs, () => (seed * 0.05) % 1, { a1Only: true });
      const counts = new Map();
      for (const card of cards) counts.set(card.answer, (counts.get(card.answer) ?? 0) + 1);
      const sides = [...counts.values()];
      assert.equal(sides.length, 2, `${id} drew only one side of the sort`);
      const skew = Math.abs(sides[0] - sides[1]);
      assert.ok(skew <= 2, `${id} drew ${[...counts].map(([k, v]) => `${k}:${v}`).join(' ')} — a one-sided round`);
    }
  }
});

test('verbs: a build card is always something a letter bank can express', () => {
  // Separable verbs conjugate into two words — doheembleiwen becomes "bleift
  // doheem" — and letterBank strips whitespace, so such a card could never be
  // assembled from its own tiles. This shipped once and was caught here.
  for (let seed = 0; seed < 20; seed += 1) {
    const cards = round.verbQuestions(games.verbGameById('verb-form'), verbs, () => (seed * 0.05) % 1, { a1Only: true });
    for (const card of cards) {
      assert.ok(!/\s/.test(card.answer), `"${card.answer}" cannot be built from a letter bank`);
      assert.ok(card.answer.length > 1, `"${card.answer}" is too short to be an exercise`);
    }
  }
});

test('verbs: every form on a card is one LOD publishes for that verb', () => {
  // The corpus-lock rule, checked at the point it could be broken: a card must
  // never show a form assembled by the app rather than taken from the table.
  const byId = new Map(verbs.map((verb) => [verb.infinitive, verb]));
  const formsOf = (verb) =>
    new Set([
      verb.infinitive,
      ...Object.values(verb.present ?? {}),
      ...String(verb.pastParticiple ?? '').split('/').map((part) => part.trim()),
    ]);

  for (const id of ['verb-person', 'verb-form', 'verb-number', 'verb-past']) {
    for (let seed = 0; seed < 10; seed += 1) {
      for (const card of round.verbQuestions(games.verbGameById(id), verbs, () => (seed * 0.1) % 1, { a1Only: true })) {
        const infinitive = (card.hint ?? '').replace(/^from /, '').split(' · ')[0] || card.prompt.split(' · ')[0];
        const verb = byId.get(infinitive);
        if (!verb) continue;
        const shown = id === 'verb-form' ? card.answer : card.prompt;
        assert.ok(formsOf(verb).has(shown), `${id}: "${shown}" is not a published form of ${infinitive}`);
      }
    }
  }
});

test('verbs: with the A1 filter on, no card shows a verb above A1', () => {
  const a1 = new Set(verbs.filter((verb) => verb.a1).map((verb) => verb.infinitive));
  const known = buildA1Forms();
  for (const game of games.VERB_GAMES) {
    for (let seed = 0; seed < 10; seed += 1) {
      for (const card of round.verbQuestions(game, verbs, () => (seed * 0.1) % 1, { a1Only: true })) {
        // The build card carries the infinitive in its prompt (`kafen · du`)
        // and the gloss in its hint; every other card is the other way round.
        const infinitive =
          card.kind === 'form' ? card.prompt.split(' · ')[0] : (card.hint ?? '').replace(/^from /, '').split(' · ')[0];
        if (infinitive && verbs.some((verb) => verb.infinitive === infinitive)) {
          assert.ok(a1.has(infinitive), `${game.id} shows the non-A1 verb ${infinitive}`);
        }
        // The example sentence only appears when it is readable.
        if (card.example) assert.ok(isA1Sentence(card.example, known), `${game.id} shows an above-A1 example: ${card.example}`);
      }
    }
  }
});

test('verbs: the round costs nothing — no Leitner, no daily goal, no cap', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'verb-arcade.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['recordLearnResult', 'recordLearnSession', 'newWordsLeftToday', 'buildSession', 'buildMixedSession', 'runSession']) {
    assert.ok(!code.includes(forbidden), `verb-arcade.js calls ${forbidden} — the Arcade must not touch progress or be capped`);
  }
  assert.ok(code.includes('touchStreak'), 'the verb games should still count for the streak');
});

test('verbs: the gloss on a row is the gloss of that row’s own LOD entry', () => {
  // The bug this guards: the corpus entry was looked up by lemma string, so
  // `kënnen` (KENNEN1, "can") was labelled with KENNEN3's "to be responsible
  // for", and `ginn` (GINN1, "to give") with GINN4's "there is". Both are
  // among the most common verbs in the language.
  const corpus = require(path.join(ROOT, 'content', 'corpus.json')).entries;
  const byId = new Map(corpus.map((entry) => [entry.id, entry]));
  let checked = 0;
  for (const verb of verbs) {
    const entry = byId.get(verb.id);
    if (!entry || !verb.en) continue;
    checked += 1;
    assert.ok(
      (entry.glosses?.en ?? []).includes(verb.en),
      `${verb.infinitive} (${verb.id}) is glossed "${verb.en}", which LOD does not publish for that entry`,
    );
  }
  assert.ok(checked > 300, `only ${checked} verbs checked`);
});
