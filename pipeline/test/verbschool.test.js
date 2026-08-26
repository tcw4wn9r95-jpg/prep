'use strict';

/**
 * Verb school — the course handouts, checked against what actually ships.
 *
 * The handouts supply a selection and nothing else: which verbs, which
 * adverbs, which categories. Every form the learner sees comes from the LOD
 * decks. So the tests that matter are the ones that hold that seam:
 *
 *   - every word named in a category resolves in a shipped deck
 *   - every word has a reachable path to finished
 *   - no question is unanswerable, and no distractor is secretly right
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;
const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;

let school;
test.before(async () => {
  school = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'verbschool.js')).href);
});

const decks = () => ({ verbs, vocab });

/* ------------------------------------------------------- the selection */

test('school: every word named in a category is in a shipped deck', () => {
  // The one that guards the seam. These strings were transcribed from printed
  // handouts, and a typo would render as a card with no gloss and no table.
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    const found = new Set(entries.map((entry) => entry.word.toLowerCase()));
    const missing = category.verbs.filter((word) => !found.has(word.toLowerCase()));
    assert.deepEqual(missing, [], `${category.id}: not in any deck — ${missing.join(', ')}`);
  }
});

test('school: no word is filed under two categories', () => {
  // A verb met twice under different headings is a verb the progress bar
  // counts twice and the learner meets twice for no reason.
  const seen = new Map();
  for (const category of school.CATEGORIES) {
    for (const word of category.verbs) {
      assert.ok(!seen.has(word), `"${word}" is in both ${seen.get(word)} and ${category.id}`);
      seen.set(word, category.id);
    }
  }
  assert.equal(seen.size, school.allWords().length);
});

test('school: the whole set of handout verbs is covered', () => {
  // Transcribed from the three handouts. Losing one silently — by editing a
  // category and forgetting to re-add it — is the failure this catches.
  const handout = [
    // Verben fir Ufank, the thirty present-tense tables
    'lauschteren', 'froen', 'äntweren', 'kucken', 'sëtzen', 'stoen', 'kréien', 'bréngen', 'huelen',
    'liesen', 'gesinn', 'stellen', 'héieren', 'schreiwen', 'leeën', 'hunn', 'sinn', 'kommen',
    'wunnen', 'schwätzen', 'schaffen', 'kachen', 'drénken', 'iessen', 'ginn', 'goen', 'fueren',
    'maachen', 'kafen', 'schlofen',
    // Verben 6 Ufank
    'setzen', 'leien', 'soen', 'sprangen', 'sangen', 'heeschen',
    // the modal table
    'kënnen', 'wëllen', 'däerfen', 'mussen', 'sollen', 'brauchen',
  ];
  const covered = new Set(school.allWords());
  const lost = handout.filter((word) => !covered.has(word));
  assert.deepEqual(lost, [], `handout verbs no category carries: ${lost.join(', ')}`);
});

/* ---------------------------------------------------------- reachability */

test('school: every word has a path to finished', () => {
  // Stages are derived per word rather than fixed at three, because an adverb
  // has no table and a verb whose LOD example contains none of its forms has no
  // sentence. A fixed three would leave those permanently unfinishable.
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    for (const entry of entries) {
      const stages = school.stagesFor(category, entry, entries);
      assert.ok(stages.length >= 1, `${entry.word}: nothing to do`);
      for (const stage of stages) {
        if (stage.id === 'meaning') assert.ok(school.meaningQuestion(entry, entries), `${entry.word}: no meaning question`);
        if (stage.id === 'table') assert.equal(school.tableQuestions(entry).length, 6, `${entry.word}: incomplete table`);
        if (stage.id === 'sentence') assert.ok(school.sentenceQuestion(entry, entries), `${entry.word}: no sentence question`);
      }
    }
  }
});

test('school: a category can actually be completed', () => {
  // Walks each category the way the screen does, marking everything done, and
  // checks the bar reaches full and `nextUp` runs out.
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    const done = new Set();
    let guard = 0;
    for (;;) {
      const up = school.nextUp(category, entries, done);
      if (!up) break;
      done.add(school.progressKey(up.entry.id, up.stage.id));
      guard += 1;
      assert.ok(guard < 500, `${category.id}: nextUp never runs out`);
    }
    const progress = school.categoryProgress(category, entries, done);
    assert.equal(progress.finished, progress.total, `${category.id} cannot be finished`);
    assert.equal(progress.ratio, 1);
  }
});

test('school: adverbs are not asked to conjugate', () => {
  const adverbs = school.CATEGORIES.find((category) => category.kind === 'adverb');
  const entries = school.entriesFor(adverbs, decks());
  assert.ok(entries.length >= 8);
  for (const entry of entries) {
    const ids = school.stagesFor(adverbs, entry, entries).map((stage) => stage.id);
    assert.ok(!ids.includes('table'), `${entry.word} was offered a conjugation table`);
    assert.equal(school.tableQuestions(entry).length, 0);
  }
});

/* ----------------------------------------------------------- the questions */

test('school: no question has its answer among the distractors twice', () => {
  // A duplicated option means two buttons are both right and one of them marks
  // you wrong — the failure mode that made the numbers cards unanswerable.
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    for (const entry of entries) {
      const questions = [
        school.meaningQuestion(entry, entries),
        ...school.tableQuestions(entry),
        school.sentenceQuestion(entry, entries),
      ].filter(Boolean);
      for (const question of questions) {
        assert.ok(question.options.includes(question.answer), `${entry.word}/${question.stage}: the answer is not an option`);
        assert.equal(
          new Set(question.options).size,
          question.options.length,
          `${entry.word}/${question.stage}: duplicate options ${question.options.join(' / ')}`,
        );
        assert.ok(question.options.length >= 2, `${entry.word}/${question.stage}: only one option`);
      }
    }
  }
});

test('school: a table question only ever offers forms of its own verb', () => {
  // The question is about the ending. Offering another verb's form would let it
  // be answered by recognising the stem, which the meaning stage already did.
  for (const category of school.CATEGORIES.filter((entry) => entry.kind !== 'adverb')) {
    for (const entry of school.entriesFor(category, decks())) {
      const own = new Set(Object.values(entry.present).filter(Boolean));
      for (const question of school.tableQuestions(entry)) {
        for (const option of question.options) {
          assert.ok(own.has(option), `${entry.word}: "${option}" is not one of its own forms`);
        }
      }
    }
  }
});

test('school: the sentence question puts back exactly the sentence LOD wrote', () => {
  // before + answer + after has to reconstruct the example character for
  // character. A gap that loses a letter is a sentence nobody published.
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    for (const entry of entries) {
      const question = school.sentenceQuestion(entry, entries);
      if (!question) continue;
      assert.equal(
        `${question.before}${question.answer}${question.after}`,
        entry.example.lb,
        `${entry.word}: the gap does not reconstruct the sentence`,
      );
    }
  }
});

test('school: the gapped word is a whole word, not a fragment', () => {
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    for (const entry of entries) {
      const question = school.sentenceQuestion(entry, entries);
      if (!question) continue;
      assert.ok(!/\p{L}$/u.test(question.before), `${entry.word}: the gap starts mid-word ("${question.before}")`);
      assert.ok(!/^\p{L}/u.test(question.after), `${entry.word}: the gap ends mid-word ("${question.after}")`);
    }
  }
});

test('school: meaning distractors come from the same category', () => {
  // "to drink" against {to run, to buy, to write} tests almost nothing. Against
  // {to eat, to cook, to make} it tests the distinction that has to be held.
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    if (entries.length < 4) continue;
    // Compared against the label actually shown, which is the plain LOD gloss
    // except where two words in the category share one — see `glossOf`.
    const glosses = new Set(entries.map((entry) => school.glossOf(entry, entries)));
    for (const entry of entries) {
      for (const option of school.meaningQuestion(entry, entries).options) {
        assert.ok(glosses.has(option), `${entry.word}: "${option}" is from outside the category`);
      }
    }
  }
});

/* ---------------------------------------------------------------- copy */

test('school: every category says what it is and why it is grouped that way', () => {
  for (const category of school.CATEGORIES) {
    assert.ok(category.title && category.blurb, `${category.id}: needs a title and a blurb`);
    assert.ok(category.note, `${category.id}: needs a note saying why these belong together`);
    assert.ok(category.verbs.length >= 2, `${category.id}: a category of one is a card`);
  }
});

test('school: the module is precached, or it is broken offline', () => {
  // Cache-first: a module missing from the shell list works in development and
  // fails on a phone with no signal, which is the one place it has to work.
  const sw = fs.readFileSync(path.join(ROOT, 'app', 'sw.js'), 'utf8');
  for (const file of ['js/verbschool.js', 'js/screens/verbschool.js']) {
    assert.ok(sw.includes(`'${file}'`), `${file} is not in the service worker's SHELL list`);
  }
});

test('school: two words LOD glosses identically are told apart in English', () => {
  // `stoen` and `stellen` are both published as "to stand". Left alone, the
  // meaning card showed "to stand" twice and marked one of them wrong — the
  // same defect that made the numbers cards unanswerable. The disambiguation
  // is English, which this app may write; LOD's gloss is untouched.
  const position = school.categoryById('position');
  const entries = school.entriesFor(position, decks());
  const labels = entries.map((entry) => school.glossOf(entry, entries));
  assert.equal(new Set(labels).size, labels.length, `two words still share a label: ${labels.join(' / ')}`);

  // And a word nobody clashes with keeps the dictionary's own wording.
  const jump = entries.find((entry) => entry.word === 'sprangen');
  assert.equal(school.glossOf(jump, entries), jump.en);
});

test('school: no category can produce a card with two identical buttons', () => {
  // The general form of the above, across every category and every stage.
  for (const category of school.CATEGORIES) {
    const entries = school.entriesFor(category, decks());
    for (const entry of entries) {
      const options = school.meaningQuestion(entry, entries).options;
      assert.equal(new Set(options).size, options.length, `${entry.word}: ${options.join(' / ')}`);
    }
  }
});
