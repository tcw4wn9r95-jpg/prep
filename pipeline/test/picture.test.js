'use strict';

/**
 * Describing a picture: the words, and the sentences that place them.
 *
 * The section exists because part 2b of the speaking exam is a photograph and
 * a description, and a description is naming plus placing. Both halves have a
 * way of going quietly wrong that these tests are aimed at.
 *
 * **The words are selected in English.** `content/hand-authored/picture-fields.json`
 * names English glosses and the build keeps whatever LOD glossed that way, so
 * no Luxembourgish is authored — but a gloss match is blunt, and the corrections
 * that make it accurate are LOD entry ids that can rot. The build refuses an id
 * that is not an entry; these refuse a field that has quietly emptied.
 *
 * **The placements are quoted.** "X ass niewent Y" is the sentence a learner
 * copies into the exam, so it has to be a sentence somebody actually wrote.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));

const DECK = readJson('content', 'items', 'picture.json');
const AUTHORED = readJson('content', 'hand-authored', 'picture-fields.json');
const VOCAB = readJson('content', 'items', 'vocab.json').items ?? [];
const WORDS = DECK.fields.flatMap((field) => field.words);

let picture;
let seeded;
test.before(async () => {
  picture = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'picture.js')).href);
  ({ seeded } = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'sentences.js')).href));
});

/* ----------------------------------------------------- nothing was authored */

test('picture: every word is an entry of the shipped vocabulary deck', () => {
  // Which is itself built from LOD. The field lists choose *which* words; they
  // cannot introduce one.
  const byId = new Map(VOCAB.map((item) => [item.lodId ?? item.id, item]));
  for (const word of WORDS) {
    const source = byId.get(word.id);
    assert.ok(source, `${word.lb} is not in the vocabulary deck`);
    assert.equal(word.lb, source.lb, `${word.id}: the spelling does not match the deck`);
    assert.equal(word.en, source.en, `${word.lb}: the English does not match the deck`);
  }
});

test('picture: every placement sentence is a real LOD example, word for word', () => {
  const examples = new Set();
  const corpus = readJson('content', 'corpus.json');
  const entries = Array.isArray(corpus.entries) ? corpus.entries : Object.values(corpus.entries);
  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) if (example.text) examples.add(example.text);
    }
  }
  for (const one of DECK.placements) assert.ok(examples.has(one.lb), `not a LOD example: ${one.lb}`);
  assert.ok(DECK.placements.length >= 25, `only ${DECK.placements.length} placement sentences`);
});

test('picture: the hand-authored file writes English and entry ids, never Luxembourgish', () => {
  // The selection lists are the one place a person types here, and the one
  // thing they could type by mistake is a Luxembourgish word.
  for (const field of AUTHORED.fields) {
    for (const term of field.match) {
      assert.ok(!/[ëéäöüËÉÄÖÜ]/.test(term), `Luxembourgish characters in a match term: ${term}`);
      assert.match(term, /^[a-z ']+$/, `a match term should be an English word: ${term}`);
    }
    for (const id of [...(field.add ?? []), ...(field.drop ?? [])]) {
      assert.match(id, /^[A-Z0-9-]+$/, `not an entry id: ${id}`);
    }
  }
  for (const [id, english] of AUTHORED.positions) {
    assert.match(id, /^[A-Z0-9]+$/, `not an entry id: ${id}`);
    assert.ok(!/[ëéäöüËÉÄÖÜ]/.test(english), `Luxembourgish characters in the English for ${id}: ${english}`);
  }
  for (const id of AUTHORED.placements) assert.match(id, /^place-[0-9a-f]{10}$/, `not a placement id: ${id}`);
});

test('picture: the English shown is English', () => {
  for (const word of [...WORDS, ...DECK.positions]) {
    assert.ok(word.en?.trim(), `no English: ${word.lb}`);
    assert.ok(!/[ëéäöüËÉÄÖÜ]/.test(word.en), `Luxembourgish characters in the English: ${word.en}`);
  }
});

/* ------------------------------------------------------------- the fields */

test('picture: all six fields are asked for, and none of them is thin', () => {
  assert.deepEqual(
    DECK.fields.map((field) => field.id),
    ['clothes', 'body', 'colours', 'weather', 'nature', 'town'],
    'the six fields the request named, in the order the screen offers them',
  );
  for (const field of DECK.fields) {
    // A round is ten questions and a question needs four options, so a field
    // under about fifteen words stops being a drill.
    assert.ok(field.words.length >= 14, `${field.id} has only ${field.words.length} words`);
    assert.ok(field.title_en && field.blurb, `${field.id} has no title or blurb`);
  }
  assert.ok(WORDS.length >= 150, `only ${WORDS.length} words in the whole section`);
});

test('picture: a field is sorted most-used first and has no word twice', () => {
  for (const field of DECK.fields) {
    const ids = new Set();
    for (const word of field.words) {
      assert.ok(!ids.has(word.id), `${field.id}: ${word.lb} appears twice`);
      ids.add(word.id);
    }
    const ranked = field.words.filter((word) => word.rank !== null).map((word) => word.rank);
    assert.deepEqual([...ranked].sort((a, b) => a - b), ranked, `${field.id} is not in rank order`);
  }
});

test('picture: the words a learner would reach for first are actually there', () => {
  // A gloss match that silently stopped matching would leave a field that
  // still looks full. These are the words somebody describing a photograph
  // cannot do without, one per field.
  const has = (field, lb) => DECK.fields.find((one) => one.id === field).words.some((word) => word.lb === lb);
  for (const [field, lb] of [
    ['clothes', 'Hiem'],
    ['body', 'Kapp'],
    ['colours', 'rout'],
    ['weather', 'Reen'],
    ['nature', 'Bam'],
    ['town', 'Haus'],
  ]) {
    assert.ok(has(field, lb), `${lb} is missing from ${field}`);
  }
});

/* ---------------------------------------------------------- the placements */

test('picture: a placement is gapped on the word that says where', () => {
  const byId = new Map(DECK.positions.map((one) => [one.id, one]));
  for (const one of DECK.placements) {
    assert.equal(one.lb.slice(one.at, one.at + one.form.length), one.form, `the gap is not on "${one.form}": ${one.lb}`);
    const position = byId.get(one.positionId);
    assert.ok(position, `${one.id} names a position word that is not shipped: ${one.positionId}`);
    // The position words are invariable, so the sentence's spelling is the
    // lemma. The day one of them inflects, the answer would be the only option
    // wearing an ending and the card would be answerable without reading it.
    assert.equal(
      one.form.toLocaleLowerCase('lb'),
      position.lb.toLocaleLowerCase('lb'),
      `the gapped word is not the lemma: ${one.lb}`,
    );
    const { before, after } = picture.gapped(one);
    assert.equal(`${before}${one.form}${after}`, one.lb, 'the gap must be the only thing removed');
    assert.ok(after.trim().length > 0, `the gap is at the very end: ${one.lb}`);
  }
});

test('picture: the position words carry LOD\'s own English where LOD has any', () => {
  const lexicon = readJson('content', 'lexicon.json').forms;
  for (const one of DECK.positions) {
    assert.ok(lexicon[one.lb] ?? lexicon[one.lb.toLocaleLowerCase('lb')], `${one.lb} is not a LOD spelling`);
    assert.ok(one.en?.trim(), `${one.lb} has no English`);
  }
  // Most of them are in the A1/A2 corpus and come with LOD's own gloss beside
  // the app's; the handful that are lexicon-only are prepositions, where the
  // lowercased form index cannot get the spelling wrong.
  const glossed = DECK.positions.filter((one) => one.lodGlosses.length > 0);
  assert.ok(glossed.length >= 10, `only ${glossed.length} position words carry a LOD gloss`);
  for (const one of DECK.positions.filter((one) => one.lodGlosses.length === 0)) {
    assert.equal(one.lb, one.lb.toLocaleLowerCase('lb'), `${one.lb} has no LOD gloss and is not lowercase`);
  }
});

test('picture: every position word a placement needs is on the list, both ways', () => {
  const used = new Set(DECK.placements.map((one) => one.positionId));
  for (const id of used) {
    assert.ok(DECK.positions.some((one) => one.id === id), `${id} is gapped but not taught`);
  }
  // And enough of them are drilled that the round is not four sentences about
  // the same preposition.
  assert.ok(used.size >= 8, `only ${used.size} position words appear in a placement`);
});

/* -------------------------------------------------------------- the rounds */

test('picture: every question offers four distinct options, one of them right', () => {
  for (const field of DECK.fields) {
    for (const word of field.words) {
      for (const shape of ['meaning', 'recall', ...(word.imageUrl ? ['image'] : [])]) {
        const question = picture.wordQuestion(word, field, { random: seeded(`${field.id}:${word.id}`), shape });
        assert.equal(question.options.length, 4, `${field.id} ${word.lb} (${shape}): ${question.options.length} options`);
        assert.equal(new Set(question.options).size, 4, `${field.id} ${word.lb} (${shape}): a repeated option`);
        assert.ok(question.options.includes(question.answer), `${field.id} ${word.lb}: the answer is not on offer`);
      }
    }
  }
  for (const one of DECK.placements) {
    const question = picture.placementQuestion(one, DECK.positions, { random: seeded(one.id) });
    assert.equal(new Set(question.options).size, 4, `${one.id}: a repeated option`);
    assert.ok(question.options.includes(question.answer));
  }
});

test('picture: the wrong answers come from the same field', () => {
  // Four garments, or four colours. Across fields it is a sorting puzzle:
  // nobody needs to know what Mutz means to rule out Reen.
  for (const field of DECK.fields) {
    const own = new Set(field.words.flatMap((word) => [word.lb, word.en]));
    for (const word of field.words) {
      const question = picture.wordQuestion(word, field, { random: seeded(`x:${word.id}`), shape: 'meaning' });
      for (const option of question.options) assert.ok(own.has(option), `${field.id}: "${option}" is from another field`);
    }
  }
});

test('picture: a round is half recognition and half production, and uses the photos', () => {
  const field = DECK.fields.find((one) => one.id === 'town');
  const plan = picture.buildRound('town', field.words, new Set(), { seed: 'test' });
  const shapes = picture.shapesFor(plan);
  assert.equal(shapes.length, plan.length);
  for (let at = 0; at < plan.length; at += 1) {
    if (plan[at].imageUrl) assert.equal(shapes[at], 'image', 'a word with a photograph should be asked with it');
  }
  // Of the rest, neither shape runs away with the round.
  const rest = shapes.filter((shape) => shape !== 'image');
  const recall = rest.filter((shape) => shape === 'recall').length;
  assert.ok(Math.abs(recall - (rest.length - recall)) <= 1, `${recall} production of ${rest.length} is not half`);
});

test('picture: a round leads with what has not been answered, and a finished field still deals one', () => {
  const field = DECK.fields.find((one) => one.id === 'colours');
  const done = new Set(field.words.slice(0, field.words.length - 3).map((word) => picture.doneKey('colours', word)));
  const round = picture.buildRound('colours', field.words, done, { seed: 'test' });
  assert.equal(round.length, picture.ROUND);
  assert.deepEqual(
    round.slice(0, 3).map((word) => word.id).sort(),
    field.words.slice(field.words.length - 3).map((word) => word.id).sort(),
    'the unseen three must come first',
  );

  const all = new Set(field.words.map((word) => picture.doneKey('colours', word)));
  assert.equal(picture.buildRound('colours', field.words, all, { seed: 'test' }).length, picture.ROUND);
});

test('picture: progress counts each field against its own words, and position against the sentences', () => {
  const rows = picture.progress(DECK, new Set(['clothes:HIEM1', `${picture.POSITION}:${DECK.placements[0].id}`]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.get('clothes').total, DECK.fields.find((one) => one.id === 'clothes').words.length);
  assert.equal(byId.get('clothes').finished, 1);
  assert.equal(byId.get(picture.POSITION).total, DECK.placements.length);
  assert.equal(byId.get(picture.POSITION).finished, 1);
  assert.equal(rows.length, DECK.fields.length + 1, 'six fields and position');
});

/* ------------------------------------------------------- what the screen is */

test('picture: the section keeps its own progress and does not move the Leitner boxes', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'picture.js'), 'utf8');
  assert.ok(/settings\.picture/.test(source), 'progress must be kept in settings');
  assert.ok(!/recordLearnResult|reviewRow|scheduleNext|answeredByDeck/.test(source), 'it must not touch the Leitner rows');
  // And it ends where the exam task is: knowing the words is not the point.
  assert.ok(/#\/speaking\/image\/image/.test(source), 'the section must link into the real 2b task');
});

test('picture: the article is joined the way the rest of the app joins it', () => {
  // `d'Box`, not `d' Box` — the bug drill/cards.js documents at joinArticle,
  // which is why this screen calls that helper rather than writing its own.
  const screen = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'picture.js'), 'utf8');
  const logic = fs.readFileSync(path.join(ROOT, 'app', 'js', 'picture.js'), 'utf8');
  for (const [name, source] of [['screen', screen], ['logic', logic]]) {
    assert.ok(/joinArticle/.test(source), `${name} must use the shared joinArticle`);
    assert.ok(!/\$\{\w+\.article\} \$\{/.test(source), `${name} joins the article by hand`);
  }
});
