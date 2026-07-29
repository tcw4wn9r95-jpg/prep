'use strict';

/**
 * The card ladder — which question a word is asked, given how well it is known.
 *
 * This is the heart of the Learn rebuild, so it is tested against the real
 * generated decks rather than fixtures: the ladder's whole job is to degrade
 * gracefully when a word has no recording or no locatable cloze, and only the
 * shipped data has the right mix of those gaps.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const load = (name) => pathToFileURL(path.join(ROOT, 'app', 'js', name)).href;

const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;

let cards;
let match;
test.before(async () => {
  cards = await import(load('drill/cards.js'));
  match = await import(load('drill/match.js'));
});

/** A word with everything: a gloss, a recording and a locatable cloze. */
const complete = () => vocab.find((item) => item.en && item.example?.audioId && item.cloze?.form && item.pos === 'SUBST');

/* -------------------------------------------------------------- the ladder */

test('cards: a fully-equipped word climbs the whole receptive ladder', () => {
  const item = complete();
  assert.equal(cards.cardTypeFor(item, 'recv', 0), 'gloss');
  assert.equal(cards.cardTypeFor(item, 'recv', 1), 'listen');
  assert.equal(cards.cardTypeFor(item, 'recv', 2), 'cloze');
  assert.equal(cards.cardTypeFor(item, 'recv', 4), 'cloze');
});

test('cards: and the whole productive ladder', () => {
  const item = complete();
  assert.equal(cards.cardTypeFor(item, 'prod', 0), 'reverse');
  assert.equal(cards.cardTypeFor(item, 'prod', 1), 'build');
  assert.equal(cards.cardTypeFor(item, 'prod', 2), 'type');
  assert.equal(cards.cardTypeFor(item, 'prod', 3), 'produce');
});

test('cards: a word with no recording never gets a listening card', () => {
  const silent = { id: 'X', en: 'thing', lb: 'Saach', pos: 'SUBST', example: null, cloze: null };
  for (let box = 0; box <= 4; box += 1) {
    assert.notEqual(cards.cardTypeFor(silent, 'recv', box), 'listen');
  }
  // It falls back to the rung it does qualify for rather than breaking.
  assert.equal(cards.cardTypeFor(silent, 'recv', 3), 'gloss');
});

test('cards: a word with no locatable cloze never gets a cloze card', () => {
  const noCloze = vocab.find((item) => item.en && item.example?.audioId && !item.cloze);
  assert.ok(noCloze, 'the deck should contain words whose cloze could not be located');
  assert.equal(cards.cardTypeFor(noCloze, 'recv', 4), 'listen');
  assert.equal(cards.cardTypeFor(noCloze, 'prod', 4), 'type');
});

test('cards: verbs get a conjugation rung that vocabulary does not', () => {
  const verb = verbs.find((item) => item.en && item.present);
  assert.equal(cards.cardTypeFor(verb, 'prod', 3, 'verb'), 'conjugate');
  // The same box on the vocabulary ladder is a cloze production card.
  const word = complete();
  assert.equal(cards.cardTypeFor(word, 'prod', 3, 'vocab'), 'produce');
});

/* ---------------------------------------------------------- built cards */

const build = (item, strand, box, deckId = 'vocab') =>
  cards.buildCard({ item, strand, box, deck: cards.DECKS[deckId], pool: deckId === 'verb' ? verbs : vocab });

test('cards: a choice card always offers four distinct options including the answer', () => {
  for (const [strand, box] of [['recv', 0], ['recv', 1], ['recv', 2], ['prod', 0]]) {
    const card = build(complete(), strand, box);
    assert.equal(card.mode, 'choice', `${strand} ${box} should be a choice card`);
    assert.equal(card.options.length, 4);
    assert.equal(card.options.filter((option) => option.correct).length, 1);
    const values = card.options.map((option) => String(option.value).toLowerCase());
    assert.equal(new Set(values).size, 4, 'two options reading the same thing make the card unanswerable');
    assert.ok(card.options.some((option) => option.correct && option.value === card.answer));
  }
});

test('cards: the listening card shows no text at all before the answer', () => {
  const card = build(complete(), 'recv', 1);
  assert.equal(card.prompt.word, null);
  assert.equal(card.prompt.sentence, null);
  assert.ok(card.prompt.audioId, 'but it must have something to play');
  assert.ok(card.prompt.revealAfter, 'and the text to show once answered');
});

test('cards: the cloze card asks for the inflected form, not the lemma', () => {
  // The example for "akafen" contains "akaaft"; answering "akafen" would be
  // wrong in that sentence, so the answer has to be what the corpus wrote.
  const item = vocab.find((candidate) => candidate.cloze && candidate.cloze.form !== candidate.lb);
  assert.ok(item, 'the deck should contain inflected cloze targets');
  const card = build(item, 'recv', 2);
  assert.equal(card.answer, item.cloze.form);
  assert.notEqual(card.answer, item.lb);
});

test('cards: a noun production card demands the article, a non-noun does not', () => {
  const noun = vocab.find((item) => item.pos === 'SUBST' && item.article && item.en);
  const adverb = vocab.find((item) => item.pos === 'ADV' && item.en);
  assert.equal(build(noun, 'prod', 2).article, noun.article);
  assert.equal(build(adverb, 'prod', 2).article, null);
});

test('cards: the letter bank contains every letter of the answer', () => {
  const card = build(complete(), 'prod', 1);
  assert.equal(card.mode, 'bank');
  const available = card.bank.map((tile) => tile.character);
  for (const letter of card.answer.replace(/\s+/g, '')) {
    const at = available.indexOf(letter);
    assert.notEqual(at, -1, `bank is missing "${letter}" of "${card.answer}"`);
    available.splice(at, 1);
  }
  assert.ok(card.bank.length > card.answer.replace(/\s+/g, '').length, 'the bank needs decoys or it is solvable by elimination');
});

test('cards: a conjugation card offers forms, with the right one among them', () => {
  const verb = verbs.find((item) => item.en && item.present);
  const card = build(verb, 'prod', 3, 'verb');
  assert.equal(card.type, 'conjugate');
  assert.ok(card.prompt.pronoun, 'the card has to say which person it wants');
  assert.equal(card.options.length, 4);
  assert.ok(Object.values(verb.present).includes(card.answer));
});

test('cards: an item with no gloss is not drillable in either direction', () => {
  // Seven LOD verbs ship without an English gloss. There is nothing to ask
  // about them, so the ladder must report that rather than emit a card whose
  // answer is null.
  const glossless = verbs.filter((item) => !item.en);
  assert.ok(glossless.length > 0, 'the verb deck should still contain gloss-less entries');
  for (const item of glossless) {
    assert.equal(cards.isDrillable(item, 'verb'), false);
    assert.equal(cards.cardTypeFor(item, 'recv', 0, 'verb'), null);
  }
  assert.throws(() => build(glossless[0], 'recv', 0, 'verb'), /cannot be drilled/);
});

test('cards: every drillable item in both decks builds a real card at every box', () => {
  // The guard against a ladder rung whose data assumption is wrong: 2,400
  // items across two strands and five boxes, all of which must answer.
  let built = 0;
  for (const [deckId, items] of [['vocab', vocab], ['verb', verbs]]) {
    for (const item of items.filter((candidate) => cards.isDrillable(candidate, deckId))) {
      for (const strand of ['recv', 'prod']) {
        for (let box = 0; box <= 4; box += 1) {
          const card = build(item, strand, box, deckId);
          assert.ok(card.answer, `${item.id} ${strand} ${box} produced a card with no answer`);
          assert.ok(card.instruction, `${item.id} ${strand} ${box} produced a card with no instruction`);
          if (card.mode === 'choice') {
            assert.equal(card.options.length, 4, `${item.id} ${strand} ${box} did not offer four options`);
            assert.equal(card.options.filter((option) => option.correct).length, 1);
          }
          built += 1;
        }
      }
    }
  }
  assert.ok(built > 20000, `expected the whole deck to be exercised, built ${built}`);
});

/* ------------------------------------------------------------------ match */

test('match: an exact answer is exact, ignoring case and stray punctuation', () => {
  assert.equal(match.checkTyped('Aarbecht', 'Aarbecht').reason, 'exact');
  assert.equal(match.checkTyped('  aarbecht.  ', 'Aarbecht').reason, 'exact');
});

test('match: a missing diacritic is a partial, not a failure', () => {
  const result = match.checkTyped('Letzebuergesch', 'Lëtzebuergesch');
  assert.equal(result.correct, true);
  assert.equal(result.partial, true);
  assert.equal(result.reason, 'accents');
});

test('match: a genuinely wrong word is wrong', () => {
  const result = match.checkTyped('Haus', 'Aarbecht');
  assert.equal(result.correct, false);
  assert.equal(result.partial, false);
});

test('match: an empty answer never counts as correct', () => {
  assert.equal(match.checkTyped('', 'Aarbecht').correct, false);
});

/* --------------------------------------------------------- service worker */

test('sw: every app module and data file is in the precache list', async () => {
  // A module missing here does not fail anywhere visible — the app works
  // online and breaks only on a phone with no signal, which is the one
  // situation the service worker exists for.
  const fs = require('node:fs');
  const sw = fs.readFileSync(path.join(ROOT, 'app', 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/^\s*'([^']+)',$/gm)].map((match) => match[1]));

  const walk = (dir, prefix) =>
    fs.readdirSync(path.join(ROOT, 'app', dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
    );

  const missing = [
    ...walk('js', 'js/').filter((file) => file.endsWith('.js')),
    ...walk('css', 'css/').filter((file) => file.endsWith('.css')),
    ...walk('data', 'data/').filter((file) => file.endsWith('.json') && file !== 'data/audio-manifest.json' && file !== 'data/model-answers.json'),
  ].filter((file) => !listed.has(file));

  assert.deepEqual(missing, [], `not precached, so the app breaks offline: ${missing.join(', ')}`);
});

test('sw: the cache version was bumped past the last release', async () => {
  const fs = require('node:fs');
  const sw = fs.readFileSync(path.join(ROOT, 'app', 'sw.js'), 'utf8');
  const version = sw.match(/const VERSION = 'v(\d+)'/)?.[1];
  assert.ok(version, 'the service worker must declare a version');
  assert.ok(Number(version) >= 6, `cache-first serving means a stale VERSION strands returning users on the old app (found v${version})`);
});

/* ------------------------------------------------------------ phrase deck */

const phrases = require(path.join(ROOT, 'app', 'data', 'phrases.json')).items;

test('phrases: every frame is attested in the corpus, not authored', () => {
  // The whole safety argument for this deck. A frame that is not in LOD's own
  // recorded sentences is one somebody wrote, which is what the language rule
  // forbids — build-phrases.js fails the build, and this is the shipped proof.
  assert.ok(phrases.length >= 30, `expected a usable frame deck, got ${phrases.length}`);
  for (const item of phrases) {
    assert.ok(item.attestations >= 8, `${item.lb} is only attested ${item.attestations}x`);
    assert.ok(item.examples.length > 0, `${item.lb} ships no recorded example`);
    for (const example of item.examples) {
      assert.ok(example.audioId, `${item.lb} has an example with no recording`);
      assert.ok(example.lb.toLowerCase().includes(item.lb.toLowerCase()), `${item.lb} example does not contain the frame`);
    }
  }
});

test('phrases: the cloze reconstructs its sentence exactly', () => {
  for (const item of phrases.filter((candidate) => candidate.cloze)) {
    const { before, form, after } = item.cloze;
    assert.equal(before + form + after, item.example.lb, `${item.lb} cloze does not reassemble`);
    assert.equal(form.toLowerCase(), item.lb.toLowerCase());
  }
});

test('phrases: n-dropped variants are corpus-attested, never derived on faith', () => {
  // `hunn` → `hu` is the Eifeler Regel, and guessing at it is exactly the kind
  // of morphology this project does not trust a model with. The build only
  // records a variant it can count in the corpus.
  const withVariant = phrases.filter((item) => item.variant);
  assert.ok(withVariant.length > 0, 'the deck should find some n-dropped variants');
  for (const item of withVariant) {
    assert.ok(item.variant.attestations >= 8, `${item.variant.lb} is not attested enough to ship`);
    assert.notEqual(item.variant.lb, item.lb);
  }
});

test('phrases: the ladder runs without a conjugation rung', () => {
  const frame = phrases[0];
  assert.equal(cards.cardTypeFor(frame, 'recv', 0, 'phrase'), 'gloss');
  assert.equal(cards.cardTypeFor(frame, 'prod', 1, 'phrase'), 'build');
  assert.equal(cards.cardTypeFor(frame, 'prod', 3, 'phrase'), 'produce');
  for (let box = 0; box <= 4; box += 1) {
    assert.notEqual(cards.cardTypeFor(frame, 'prod', box, 'phrase'), 'conjugate');
  }
});

test('phrases: the build card uses a word bank whose decoys come from the deck', () => {
  const card = cards.buildCard({ item: phrases[0], strand: 'prod', box: 1, deck: cards.DECKS.phrase, pool: phrases });
  assert.equal(card.mode, 'bank');
  assert.equal(card.bankKind, 'word');

  const answerWords = card.answer.split(' ');
  const tiles = card.bank.map((tile) => tile.character);
  for (const word of answerWords) assert.ok(tiles.includes(word), `bank is missing "${word}"`);
  assert.ok(card.bank.length > answerWords.length, 'a bank with exactly the right words is solvable by elimination');

  // Every tile must be a word the corpus attests, via another frame.
  const corpusWords = new Set(phrases.flatMap((item) => item.lb.split(' ')));
  for (const tile of tiles) assert.ok(corpusWords.has(tile), `"${tile}" is not from the corpus`);
});

test('phrases: every frame builds a card at every box', () => {
  for (const item of phrases) {
    assert.equal(cards.isDrillable(item, 'phrase'), true, `${item.lb} is not drillable`);
    for (const strand of ['recv', 'prod']) {
      for (let box = 0; box <= 4; box += 1) {
        const card = cards.buildCard({ item, strand, box, deck: cards.DECKS.phrase, pool: phrases });
        assert.ok(card.answer, `${item.lb} ${strand} ${box} has no answer`);
      }
    }
  }
});

test('cards: the box index is keyed by deck as well as strand and item', () => {
  // Item ids are unique within a deck, not across them, and one session can
  // now mix all three. Without the deck in the key, a verb at box 4 would hand
  // its card type to a vocabulary word that happened to share its id.
  const boxes = cards.boxIndex('vocab', { recv: new Map([['HUNN1', { box: 4 }]]), prod: new Map() });
  cards.boxIndex('verb', { recv: new Map([['HUNN1', { box: 0 }]]), prod: new Map() }, boxes);

  assert.equal(boxes.get('vocab:recv:HUNN1'), 4);
  assert.equal(boxes.get('verb:recv:HUNN1'), 0);
  assert.equal(boxes.size, 2);
});
