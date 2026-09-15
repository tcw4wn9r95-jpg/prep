'use strict';

/**
 * The adjective deck, and the five rounds built on it.
 *
 * Three things here could go wrong quietly, and each has a test that would be
 * loud about it.
 *
 * **A derived degree.** `am groussen` is what a rule produces and `am gréissten`
 * is what Luxembourgish says. Every comparative and superlative the deck ships
 * has to be a form `content/lexicon.json` already carries, tagged as coming out
 * of LOD's inflection table — never assembled here.
 *
 * **An opposite pointing nowhere.** The pairs are the one judgement in this
 * deck, written as entry ids precisely so they can be checked. An id that has
 * stopped resolving means a pair silently vanished from the game.
 *
 * **A gap in the wrong place.** A comparison sentence is cut by offset, and an
 * offset that has drifted produces a card that is still a sentence, still has
 * four plausible options, and is asking about the wrong word.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));

const DECK = readJson('content', 'items', 'adjectives.json');
const RELATIONS = readJson('content', 'hand-authored', 'adjective-relations.json');
const ITEMS = DECK.items;
const COMPARISONS = DECK.comparisons;
const BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

let adjectives;
let seeded;
test.before(async () => {
  adjectives = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'adjectives.js')).href);
  ({ seeded } = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'sentences.js')).href));
});

/** The lexicon is 13 MB; read it once, for the two tests that need it. */
let lexiconForms = null;
const forms = () => {
  if (!lexiconForms) lexiconForms = readJson('content', 'lexicon.json').forms;
  return lexiconForms;
};

/* ------------------------------------------------- nothing was derived */

test('adjectives: every degree is a form LOD publishes, not one worked out by rule', () => {
  // The corpus rule as it lands on this deck. A superlative built by sticking
  // `am …sten` on the lemma would be a word this app invented, and it would be
  // wrong for exactly the adjectives worth practising.
  const known = forms();
  for (const item of ITEMS) {
    for (const [field, value] of [['comparative', item.comparative], ['superlative', item.superlative]]) {
      assert.ok(known[value], `${item.lb}: ${field} "${value}" is not a LOD spelling`);
    }
  }
});

test('adjectives: the degrees come from the inflection table, and gutt is the one exception', () => {
  // `table:` is the Flexiounstabellen — LOD's own inflection of that headword.
  // Anything else would mean the build matched a spelling that happens to look
  // like a degree rather than one filed as this word's.
  const known = forms();
  const fromTable = (value, id) => String(known[value] ?? '') === `table:${id}`;

  const exceptions = ITEMS.filter((item) => !fromTable(item.comparative, item.id) || !fromTable(item.superlative, item.id));
  assert.deepEqual(
    exceptions.map((item) => item.id),
    Object.keys(RELATIONS.irregular),
    'only the adjectives the relations file names as irregular may sit outside the table',
  );
  for (const item of exceptions) assert.equal(item.irregular, true, `${item.lb} must be marked irregular`);
  // …and the exception really is suppletive rather than a build that gave up:
  // besser is nothing like a regular comparative of gutt, which is why LOD
  // files it as its own headword and why the link has to be asserted.
  const gutt = BY_ID.get('GUTT2');
  assert.equal(gutt.comparative, 'besser');
  assert.equal(gutt.superlative, 'am beschten');
  assert.ok(known.besser && known['am beschten'], 'both suppletive forms must still be LOD spellings');
});

test('adjectives: the deck is big enough to be the comprehensive list that was asked for', () => {
  assert.ok(ITEMS.length >= 180, `only ${ITEMS.length} adjectives`);
  const withOpposite = ITEMS.filter((item) => item.oppositeIds.length > 0);
  assert.ok(withOpposite.length >= 80, `only ${withOpposite.length} adjectives have an opposite`);
  assert.ok(COMPARISONS.length >= 40, `only ${COMPARISONS.length} comparison sentences`);
  // Both shapes of comparison, because "as big as" is a different sentence to
  // produce than "bigger than" and the exam asks for both.
  for (const shape of ['more', 'as']) {
    const count = COMPARISONS.filter((one) => one.shape === shape).length;
    assert.ok(count >= 10, `only ${count} ${shape} comparisons`);
  }
});

test('adjectives: every card has both directions and a unique id', () => {
  const ids = new Set();
  for (const item of [...ITEMS, ...COMPARISONS]) {
    assert.ok(!ids.has(item.id), `duplicate id: ${item.id}`);
    ids.add(item.id);
  }
  for (const item of ITEMS) {
    assert.ok(item.lb?.trim(), `no Luxembourgish: ${item.id}`);
    assert.ok(item.en?.trim(), `no English: ${item.lb}`);
    assert.ok(!/[ëéäöüËÉÄÖÜ]/.test(item.en), `Luxembourgish characters in the English: ${item.en}`);
  }
});

/* ------------------------------------------------------- the opposites */

test('adjectives: every opposite resolves, and reads both ways', () => {
  for (const [a, b] of RELATIONS.opposites) {
    assert.ok(BY_ID.has(a), `${a} is not an adjective in the deck`);
    assert.ok(BY_ID.has(b), `${b} is not an adjective in the deck`);
    assert.notEqual(a, b, `${a} cannot be its own opposite`);
    // A pair written once has to be readable from either side, or half the
    // words in the round would have an opposite the game never offers.
    assert.ok(BY_ID.get(a).oppositeIds.includes(b), `${a} does not point back at ${b}`);
    assert.ok(BY_ID.get(b).oppositeIds.includes(a), `${b} does not point back at ${a}`);
  }
  for (const item of ITEMS) {
    for (const id of item.oppositeIds) {
      assert.ok(BY_ID.has(id), `${item.lb} points at ${id}, which is not in the deck`);
      assert.ok(BY_ID.get(id).oppositeIds.includes(item.id), `${id} does not point back at ${item.id}`);
    }
  }
});

test('adjectives: the relations file writes no Luxembourgish at all', () => {
  // The whole reason the pairs are entry ids. The third column is an English
  // note for the person maintaining the file; if a Luxembourgish word ever
  // appears in one, the file has started being a place words are authored.
  for (const pair of RELATIONS.opposites) {
    const [a, b, note] = pair;
    assert.match(a, /^[A-Z0-9]+$/, `not an entry id: ${a}`);
    assert.match(b, /^[A-Z0-9]+$/, `not an entry id: ${b}`);
    assert.ok(note && !/[ëéäöüËÉÄÖÜ]/.test(note), `Luxembourgish characters in the note: ${note}`);
  }
});

/* ----------------------------------------------------- the comparisons */

test('adjectives: a comparison is gapped at the word it is asking about', () => {
  for (const one of COMPARISONS) {
    assert.equal(
      one.lb.slice(one.at, one.at + one.form.length),
      one.form,
      `the gap is not on "${one.form}": ${one.lb}`,
    );
    assert.ok(BY_ID.has(one.adjectiveId), `${one.id} names an adjective not in the deck: ${one.adjectiveId}`);
    // Predicative, so uninflected: `méi grouss ewéi`, never `méi grousse Sall`.
    // The wrong answers in this round are other adjectives' bare lemmas, so an
    // inflected answer would be the only one wearing an ending and could be
    // picked without reading the sentence.
    assert.equal(
      one.form.toLocaleLowerCase('lb'),
      BY_ID.get(one.adjectiveId).lb.toLocaleLowerCase('lb'),
      `the compared word is inflected: ${one.lb}`,
    );
    // And it really is a comparison: something on the far side of the word.
    assert.match(one.lb.slice(one.at + one.form.length), /\be?wéi\b/, `nothing compared: ${one.lb}`);
    assert.match(one.lb.slice(0, one.at), one.shape === 'more' ? /\bméi\s+$/ : /\besou\s+$/, `wrong shape: ${one.lb}`);
  }
});

test('adjectives: a gapped sentence is still a sentence on both sides of the hole', () => {
  for (const one of COMPARISONS) {
    const { before, after } = adjectives.gapped(one);
    assert.equal(`${before}${one.form}${after}`, one.lb, 'the gap must be the only thing removed');
    assert.ok(after.trim().length > 0, `the gap is at the very end: ${one.lb}`);
  }
});

test('adjectives: every mined sentence is a real LOD example', () => {
  // The same gate build-sentences.js carries. A comparison frame filled in by
  // hand would read perfectly and be a sentence nobody wrote.
  const examples = new Set();
  const corpus = readJson('content', 'corpus.json');
  const entries = Array.isArray(corpus.entries) ? corpus.entries : Object.values(corpus.entries);
  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) if (example.text) examples.add(example.text);
    }
  }
  for (const one of COMPARISONS) assert.ok(examples.has(one.lb), `not a LOD example: ${one.lb}`);
});

/* ------------------------------------------------------------ the game */

/** A question, dealt the way the screen deals it. */
const ask = (mode, item) =>
  adjectives.questionFor(mode, item, { items: ITEMS, byId: BY_ID, random: seeded(`${mode}:${item.id}`) });

test('adjectives: every round asks four distinct options, one of them right', () => {
  for (const mode of adjectives.MODES.map((one) => one.id)) {
    const pool = adjectives.poolFor(mode, ITEMS, COMPARISONS);
    assert.ok(pool.length >= 10, `${mode} can only ask ${pool.length} questions`);
    for (const item of pool) {
      const question = ask(mode, item);
      assert.equal(question.options.length, 4, `${mode} ${item.id}: ${question.options.length} options`);
      assert.equal(new Set(question.options).size, 4, `${mode} ${item.id}: a repeated option`);
      assert.ok(question.options.includes(question.answer), `${mode} ${item.id}: the answer is not on offer`);
      assert.ok(question.instruction?.trim(), `${mode} ${item.id}: no instruction`);
    }
  }
});

test('adjectives: a word with two opposites is never asked one it also has', () => {
  // `al` is the opposite of `jonk` and of `nei`. Offering both makes two of the
  // four options correct and marks one of them wrong — the learner is right and
  // the app says otherwise, which is the worst failure a drill has.
  const many = ITEMS.filter((item) => item.oppositeIds.length > 1);
  assert.ok(many.length > 0, 'the fixture this guards no longer exists');
  for (const item of many) {
    const question = ask('opposite', item);
    const alsoRight = question.options.filter(
      (option) => option !== question.answer && item.oppositeIds.some((id) => BY_ID.get(id).lb === option),
    );
    assert.deepEqual(alsoRight, [], `${item.lb}: "${alsoRight.join(', ')}" is also an opposite`);
  }
});

test('adjectives: the wrong answers are the same shape as the right one', () => {
  // An option that is the wrong shape is eliminated without being read, which
  // turns "which stem does this word take" into "which one starts with am".
  // `gutt` is the exemption and the reason the rule is worth stating: its
  // degrees are suppletive, so `besser` has no shape-mates to hide among, and
  // hiding it would mean inventing a form.
  const shape = (form) => /^(méi|am)\s/.exec(form)?.[1] ?? null;
  for (const mode of ['comparative', 'superlative']) {
    for (const item of ITEMS) {
      const question = ask(mode, item);
      const wanted = shape(question.answer);
      if (item.irregular && wanted === null) continue;
      for (const option of question.options) {
        assert.equal(shape(option), wanted, `${mode} ${item.lb}: "${option}" is not the same shape as the answer`);
      }
      // …and every option is a degree some adjective really has, not a string
      // built here to fill the fourth slot.
      const published = new Set(ITEMS.map((one) => one[mode]));
      for (const option of question.options) assert.ok(published.has(option), `${mode}: invented option "${option}"`);
    }
  }
});

test('adjectives: the comparative is asked from English, the superlative from Luxembourgish', () => {
  // Deliberate, and the reason the comparative round is worth ten questions.
  // Asked `nëtzlech → ?` every option reads `méi <word>` and the learner
  // matches the word they were just shown without knowing anything.
  const item = BY_ID.get('GROUSS2');
  const comparative = ask('comparative', item);
  assert.equal(comparative.prompt, `more ${item.en}`);
  assert.ok(!comparative.options.some((option) => option.includes(item.lb) && option !== item.comparative));

  const superlative = ask('superlative', item);
  assert.equal(superlative.prompt, item.lb);
  assert.equal(superlative.answer, 'am gréissten');
  // The stem is the whole question, so it must not be readable off the prompt.
  assert.ok(!superlative.answer.includes(item.lb), 'am gréissten is not am groussen — that is the point');
});

test('adjectives: a comparison card can be read whole once it is answered', () => {
  for (const one of COMPARISONS.slice(0, 20)) {
    const question = ask('comparison', one);
    assert.equal(question.sentence, one.lb, 'the full sentence must come back to be read');
    assert.ok(question.english, `no English for the gapped word: ${one.lb}`);
    assert.equal(typeof question.prompt, 'object', 'a comparison is asked as a gapped sentence');
  }
});

test('adjectives: a round leads with what has not been answered', () => {
  const pool = adjectives.poolFor('meaning', ITEMS, COMPARISONS);
  const done = new Set(pool.slice(0, pool.length - 3).map((item) => adjectives.doneKey('meaning', item)));
  const round = adjectives.buildRound('meaning', pool, done, { seed: 'test' });
  assert.equal(round.length, adjectives.ROUND);
  const fresh = round.slice(0, 3).map((item) => item.id).sort();
  assert.deepEqual(fresh, pool.slice(pool.length - 3).map((item) => item.id).sort(), 'the unseen three must come first');

  // And a finished mode still deals a round: this is practice, not a queue
  // that empties.
  const all = new Set(pool.map((item) => adjectives.doneKey('meaning', item)));
  assert.equal(adjectives.buildRound('meaning', pool, all, { seed: 'test' }).length, adjectives.ROUND);
});

test('adjectives: the same player gets the same round back', () => {
  const pool = adjectives.poolFor('superlative', ITEMS, COMPARISONS);
  const once = adjectives.buildRound('superlative', pool, new Set(), { seed: 'diego:superlative' });
  const again = adjectives.buildRound('superlative', pool, new Set(), { seed: 'diego:superlative' });
  assert.deepEqual(once.map((one) => one.id), again.map((one) => one.id));
});

test('adjectives: progress is counted per mode against that mode\'s own pool', () => {
  const rows = adjectives.progress(ITEMS, COMPARISONS, new Set(['meaning:AARM1', 'comparison:' + COMPARISONS[0].id]));
  const byMode = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byMode.get('meaning').total, ITEMS.length);
  assert.equal(byMode.get('meaning').finished, 1);
  assert.equal(byMode.get('comparison').total, COMPARISONS.length);
  assert.equal(byMode.get('comparison').finished, 1);
  // The opposite round can only ask about the words that have one.
  assert.ok(byMode.get('opposite').total < ITEMS.length);
  assert.equal(byMode.get('opposite').finished, 0);
});

test('adjectives: the game keeps its own progress and does not move the Leitner boxes', () => {
  // Picking one of four is a lighter task than the vocab deck's recall cards.
  // Letting it promote the same rows would drift the review schedule with
  // nothing on screen looking wrong — the same line the other side games hold.
  const source = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'adjectives.js'), 'utf8');
  assert.ok(/settings\.adjectives/.test(source), 'progress must be kept in settings');
  assert.ok(!/recordLearnResult|reviewRow|scheduleNext|answeredByDeck/.test(source), 'it must not touch the Leitner rows');
});
