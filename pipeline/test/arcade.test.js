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
const { buildA1Forms, isA1Sentence } = require(path.join(ROOT, 'pipeline', 'lib', 'a1.js'));
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
  // tile on the index that disappoints.
  //
  // Two floors, because the A1 filter costs material. `existence` has two
  // attested frames and LOD's examples for both are above A1, and `quantity`
  // has one — those two land at four cards, which the round announces. Every
  // other pattern still fills six.
  const THIN = new Set(['existence', 'quantity']);
  const arcade = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'arcade.js')).href);
  for (const pattern of patterns.PATTERNS) {
    const questions = arcade.questionsFor(pattern, decks, () => 0.5);
    const floor = THIN.has(pattern.id) ? 4 : 6;
    assert.ok(questions.length >= floor, `${pattern.id} only fills ${questions.length} cards at A1`);
  }
});

test('arcade: with the A1 filter on, no card shows a word above A1', async () => {
  // The point of the filter, asserted where it can actually fail. "Build the
  // sentence" is only a structure exercise if the words are already known —
  // one unknown noun turns it into "guess the noun", which is the complaint
  // this filter answers. Checked over many shuffles because which cards a
  // round draws is random, and a leak in a rare draw is still a leak.
  const arcade = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'arcade.js')).href);
  const known = buildA1Forms();

  let checked = 0;
  for (const pattern of patterns.PATTERNS) {
    for (let seed = 0; seed < 20; seed += 1) {
      for (const question of arcade.questionsFor(pattern, decks, () => (seed * 0.05) % 1, { a1Only: true })) {
        const shown = [];
        // Everything the learner reads, including the wrong answers: a
        // distractor full of unknown words is as discouraging as a bad card.
        if (question.kind === 'build') shown.push(question.answer, ...(question.pool ?? []));
        if (question.kind === 'item' || question.kind === 'word') {
          shown.push(question.before, question.after, ...question.options.map((option) => option.value));
        }
        // A `meaning` card shows one frame and four English glosses; a `frame`
        // card's own options are frames, which are A1 by construction.
        if (question.kind === 'frame') shown.push(question.sentence, ...question.options.map((option) => option.value));
        if (question.kind === 'meaning') shown.push(question.prompt);

        for (const sentence of shown.filter(Boolean)) {
          checked += 1;
          assert.ok(isA1Sentence(sentence, known), `${pattern.id}/${question.kind} shows above-A1 text: "${sentence}"`);
        }
      }
    }
  }
  assert.ok(checked > 2000, `only ${checked} strings checked — the sweep is not covering the rounds`);
});

test('arcade: turning the filter off opens up the harder examples', async () => {
  // The switch has to actually do something, or it is a lie in Settings.
  const arcade = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'arcade.js')).href);
  const count = (id, a1Only) =>
    arcade.questionsFor(patterns.patternById(id), decks, () => 0.5, { a1Only }).length;
  assert.ok(count('existence', false) > count('existence', true), 'the A1 filter is not filtering anything');
});

test('arcade: the shipped decks carry the A1 stamp', () => {
  // build-a1.js writes it, and it is the last step of `npm run content`. If a
  // rebuild ever skips it the flag goes missing, every row reads as readable,
  // and the filter silently stops filtering — so fail here instead.
  assert.ok(
    phrases.every((phrase) => typeof phrase.a1 === 'boolean'),
    'phrases.json has no a1 flag — run npm run build:a1',
  );
  const examples = phrases.flatMap((phrase) => phrase.examples ?? []);
  assert.ok(examples.every((example) => typeof example.a1 === 'boolean'), 'phrase examples have no a1 flag');
  assert.ok(grammar.every((item) => typeof item.a1 === 'boolean'), 'grammar.json has no a1 flag');
  assert.ok(vocab.every((item) => typeof item.a1 === 'boolean'), 'vocab.json has no a1 flag');
  // A stamp that marked everything readable would pass the checks above while
  // meaning nothing.
  const readable = examples.filter((example) => example.a1).length;
  assert.ok(readable > 0 && readable < examples.length, `the stamp is degenerate: ${readable}/${examples.length} readable`);
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

test('arcade: every pattern teaches its own thing, not a shared boilerplate', async () => {
  // The failure this guards, which shipped: one generic brief for all fifteen.
  // The rule restated the title ("This round is about one thing a sentence has
  // to do: not ___") and every "worth knowing" listed the card formats rather
  // than any Luxembourgish, so the round about negation taught no negation.
  const rules = new Set();
  for (const pattern of patterns.PATTERNS) {
    const teaching = patterns.TEACHING[pattern.id];
    assert.ok(teaching, `${pattern.id} has no teaching`);
    assert.ok(teaching.rule?.length > 40, `${pattern.id}'s rule is too thin to teach anything`);
    assert.ok(teaching.points?.length >= 2, `${pattern.id} needs at least two points`);

    // Boilerplate would show up as two patterns sharing a line.
    assert.ok(!rules.has(teaching.rule), `${pattern.id} reuses another pattern's rule`);
    rules.add(teaching.rule);

    // A rule that only restates the title teaches nothing. The old one did
    // exactly that, by interpolating `ask` into a sentence.
    assert.ok(!teaching.rule.includes(pattern.ask), `${pattern.id}'s rule just restates its own title`);
  }
  // And the two lists have to stay in step.
  assert.deepEqual(
    Object.keys(patterns.TEACHING).sort(),
    patterns.PATTERNS.map((pattern) => pattern.id).sort(),
    'TEACHING and PATTERNS cover different ids',
  );
});

test('arcade: a brief never explains the app instead of the language', () => {
  const JARGON = /\b(card|deck|round|corpus|paradigm|generator|filter)\b/i;
  for (const pattern of patterns.PATTERNS) {
    const { rule } = patterns.TEACHING[pattern.id];
    assert.ok(!JARGON.test(rule), `${pattern.id}'s rule talks about the app: "${rule}"`);
  }
});

test('arcade: a brief that points at the full rule points somewhere real', async () => {
  // The long explanation lives in the notecards, and the brief links rather
  // than growing a second copy. A dead link would send a confused player to an
  // empty screen, which is worse than no link.
  const guide = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'grammar-guide.js')).href);
  const topics = new Set(guide.GRAMMAR_GUIDE.map((topic) => topic.id));
  let linked = 0;
  for (const pattern of patterns.PATTERNS) {
    const { guide: id } = patterns.TEACHING[pattern.id];
    if (!id) continue;
    linked += 1;
    assert.ok(topics.has(id), `${pattern.id} links to the topic "${id}", which does not exist`);
  }
  assert.ok(linked >= 10, `only ${linked} of fifteen patterns point at the full rule`);
});

test('arcade: the brief lists the material the round will actually use', async () => {
  // Generated from the same lookup the round uses, so it cannot advertise
  // openers the round does not have — and the A1 filter is reflected in it.
  for (const pattern of patterns.PATTERNS) {
    const brief = patterns.briefFor(pattern, decks);
    assert.ok(brief.how, `${pattern.id}'s brief never says what to do`);
    assert.match(brief.how, /^(Tap|Build|Type|Pick|Choose)\b/, `${pattern.id}'s "how" is not an instruction`);

    if (!(pattern.frames?.length || pattern.words?.length)) continue;
    assert.ok(brief.vocabulary.length > 0, `${pattern.id} lists no vocabulary despite naming some`);
    const shipped = new Set([
      ...phrases.map((phrase) => String(phrase.lb).toLowerCase()),
      ...vocab.map((item) => String(item.lb ?? '').toLowerCase()),
    ]);
    for (const entry of brief.vocabulary) {
      assert.ok(shipped.has(String(entry.lb).toLowerCase()), `${pattern.id} promises "${entry.lb}", which is not in a deck`);
      assert.ok(entry.en, `${pattern.id} lists "${entry.lb}" with no English`);
    }
  }
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
