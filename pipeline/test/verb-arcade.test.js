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

test('verbs: five games, distinct ids, each with a brief a learner can use', () => {
  assert.equal(games.VERB_GAMES.length, 5);
  assert.equal(new Set(games.VERB_GAMES.map((game) => game.id)).size, 5);
  for (const game of games.VERB_GAMES) {
    assert.ok(game.title && game.ask, `${game.id} is missing its labels`);
    // The route dispatches on this prefix to tell a verb game from a sentence
    // function, so a bare id would silently 404 into the index.
    assert.ok(game.id.startsWith('verb-'), `${game.id} must be namespaced`);

    // The three fields the brief is built from. This shipped once with a
    // single `teaches` line written as design rationale — "backwards from a
    // normal conjugation drill" — which explained the build to a reviewer and
    // told a learner nothing about Luxembourgish.
    assert.ok(game.rule && game.rule.length > 30, `${game.id} has no rule to teach`);
    assert.ok(game.how, `${game.id} never says what you physically do`);
    assert.ok(game.points?.length >= 2, `${game.id} needs at least two points`);

    // `how` is an instruction, so it has to name an action. The failure it
    // guards is a "how" that describes the game instead of directing the
    // player, which is what the old copy did throughout.
    assert.match(game.how, /^(Tap|Build|Type|Pick|Choose|Answer)\b/, `${game.id}'s "how" is not an instruction: "${game.how}"`);
  }
});

test('verbs: the brief never talks about the implementation', () => {
  // The words that gave the game away last time. Copy shown to a learner is
  // about Luxembourgish; copy about cards, drills and decks is about us.
  const JARGON = /\b(card|drill|deck|round|corpus|LOD|A1|paradigm|syncretism|generator)\b/i;
  for (const game of games.VERB_GAMES) {
    assert.ok(!JARGON.test(game.rule), `${game.id}'s rule talks about the app, not the language: "${game.rule}"`);
  }
});

test('verbs: the brief shows a real table rather than a written-out example', async () => {
  // Writing "ech schaffen, du schaffs" into the copy would be authoring
  // Luxembourgish, which this project does nowhere. The table is looked up.
  const brief = await load('arcade/brief.js');
  for (const game of games.VERB_GAMES.filter((row) => row.demo)) {
    const table = brief.demoTable(verbs, game.demo);
    assert.ok(table, `${game.id} names the demo verb "${game.demo}", which is not in the deck`);
    assert.equal(table.rows.length, 6, `${game.demo} does not have a full present tense`);
    const source = verbs.find((verb) => verb.infinitive === game.demo);
    for (const row of table.rows) {
      assert.ok(Object.values(source.present).includes(row.form), `"${row.form}" is not a published form of ${game.demo}`);
    }
    // The demo has to actually demonstrate the thing: at least one form that
    // is the infinitive again, which is the shortcut the copy points at.
    assert.ok(table.rows.some((row) => row.isInfinitive), `${game.demo} does not show the infinitive shortcut`);
  }
});

test('verbs: every card tells you what to do with it', () => {
  // The report that prompted this: "I don't know what is expected of me."
  // Every card carries its own instruction, and an instruction has to direct
  // the player rather than name the topic — "Build the form" did not say which
  // form, and "One person, or more than one?" did not match its own buttons.
  for (const game of games.VERB_GAMES) {
    for (const card of round.verbQuestions(game, verbs, () => 0.5, { a1Only: true })) {
      assert.ok(card.instruction, `${game.id} has a card with no instruction`);
      assert.match(
        card.instruction,
        /\b(tap|build|pick|choose|type)\b/i,
        `${game.id}: "${card.instruction}" does not tell the player what to do`,
      );
    }
  }
});

test('verbs: a pronoun option always carries its English', () => {
  // `si` is both "she" and "they", so the pronoun alone cannot be chosen
  // between. The dative game already shows the gloss for this exact reason;
  // the verb games shipped without it.
  for (let seed = 0; seed < 10; seed += 1) {
    for (const card of round.verbQuestions(games.verbGameById('verb-person'), verbs, () => (seed * 0.1) % 1, { a1Only: true })) {
      for (const option of card.options) {
        assert.ok(option.label, `a pronoun option "${option.value}" is shown without its English`);
        assert.ok(option.label.includes(option.value), 'the label should still show the pronoun itself');
        assert.notEqual(option.label, option.value, `"${option.value}" needs a gloss to be answerable`);
      }
    }
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
