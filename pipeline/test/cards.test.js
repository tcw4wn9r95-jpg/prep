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
  // The invariant is the absence of `cloze`/`produce`, at every box — what it
  // falls back to depends on what else the word has.
  for (const item of vocab.filter((candidate) => candidate.en && !candidate.cloze).slice(0, 300)) {
    for (let box = 0; box <= 4; box += 1) {
      assert.notEqual(cards.cardTypeFor(item, 'recv', box, 'vocab'), 'cloze');
      assert.notEqual(cards.cardTypeFor(item, 'prod', box, 'vocab'), 'produce');
    }
  }

  // A word with a recording and a sentence short enough to follow blind still
  // tops out at `listen` receptively and `type` productively. The sentence has
  // to be short: the listening rung is gated on length now, so a no-cloze word
  // with a long one falls back to `gloss` instead, which is the point of it.
  const wc = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
  const shortAndSilentOfCloze = vocab.find(
    (item) => item.en && item.example?.audioId && item.example.local !== false && !item.cloze && wc(item.example.lb) <= 7,
  );
  assert.ok(shortAndSilentOfCloze, 'the deck should contain a short-sentence word whose cloze could not be located');
  assert.equal(cards.cardTypeFor(shortAndSilentOfCloze, 'recv', 4), 'listen');
  assert.equal(cards.cardTypeFor(shortAndSilentOfCloze, 'prod', 4), 'type');
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

test("cards: d' elides onto its noun, de takes a space", () => {
  // LOD stores both forms in one `article` field and about half the nouns in
  // the deck take the eliding one, so a naive `${article} ${lemma}` printed
  // "d' Fra" on the gloss card, in every reverse-card option and in the answer
  // shown after a miss. Half a deck of misspelled nouns in a spelling-graded
  // exam is worth a test.
  assert.equal(cards.joinArticle("d'", 'Fra'), "d'Fra");
  assert.equal(cards.joinArticle('de', 'Mann'), 'de Mann');
  assert.equal(cards.joinArticle('d’', 'Kand'), 'd’Kand'); // typographic apostrophe too
  assert.equal(cards.joinArticle(null, 'lafen'), 'lafen');

  // And through a real card, not just the helper.
  const eliding = vocab.find((item) => item.pos === 'SUBST' && item.article === "d'" && item.en);
  assert.ok(eliding, 'the deck should contain nouns with the eliding article');
  assert.equal(build(eliding, 'prod', 0).answer, `d'${eliding.lb}`);
});

test('cards: a gender card does not print the article it is asking you to name', () => {
  // `de` marks every masculine noun and `d'` every feminine and neuter one, so
  // showing the article above "What gender is this word?" answered the
  // question outright on a third of the deck.
  const grammar = require(path.join(ROOT, 'app', 'data', 'grammar.json')).items;
  const genderItems = grammar.filter((item) => item.kind === 'gender');
  assert.ok(genderItems.length > 0);

  for (const item of genderItems.slice(0, 200)) {
    // Box 0 is the introduction: it is *meant* to show the article, because
    // only 371 of 1,173 nouns have an example sentence that reveals one and
    // gender is not derivable from the noun.
    const first = cards.buildCard({ item, strand: 'recv', box: 0, deck: cards.DECKS.grammar, pool: genderItems });
    assert.equal(first.prompt.word, cards.joinArticle(item.article, item.lb));

    // From the first review it is a real retrieval. Equality, not a substring
    // search: "Brudder" contains the letters of "de" and always will.
    for (const box of [1, 2, 4]) {
      const later = cards.buildCard({ item, strand: 'recv', box, deck: cards.DECKS.grammar, pool: genderItems });
      assert.equal(later.prompt.word, item.lb, `${item.lb} leaked its article at box ${box}`);
      // It is still taught — just after the answer, via the feedback line.
      assert.equal(later.lemma, cards.joinArticle(item.article, item.lb));
    }
  }
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

/* ------------------------------------------------------- explaining a card */

/** One built card per grammar kind the deck actually ships. */
function grammarCards() {
  const items = require(path.join(ROOT, 'app', 'data', 'grammar.json')).items;
  const byKind = new Map();
  for (const item of items) if (!byKind.has(item.kind)) byKind.set(item.kind, item);
  return [...byKind.values()].map((item) => ({
    item,
    card: cards.buildCard({ item, strand: 'recv', box: 1, deck: cards.DECKS.grammar, pool: items }),
  }));
}

/** What engine.js hands to `explainTarget` — the sentence as rendered. */
const rendered = (card) =>
  card.prompt.cloze
    ? `${card.prompt.cloze.before ?? ''}${card.answer ?? ''}${card.prompt.cloze.after ?? ''}`.replace(/\s+/g, ' ').trim()
    : (card.prompt.sentence ?? null);

test('cards: every grammar kind offers an explanation, sentence or not', () => {
  // Three shapes had no explain button at all, because the engine looked for a
  // sentence and they have none it could find: the word-order kinds hide their
  // prompt (the options *are* the sentence), `perfect-aux` is a verb and two
  // auxiliaries, and 63% of gender nouns carry no example sentence. Those are
  // the cards a beginner most needs a reason for.
  for (const { item, card } of grammarCards()) {
    const target = cards.explainTarget(card, rendered(card));
    assert.ok(target, `${item.kind}: no explanation offered`);
    assert.ok(target.label, `${item.kind}: the button has no label`);
    assert.ok(target.lb || target.word, `${item.kind}: nothing for the explanation to be about`);
    assert.ok(cards.taskFor(card), `${item.kind}: the explainer is not told what was asked`);
    assert.ok(cards.factsFor(card), `${item.kind}: the explainer is given no verified facts to work from`);
  }
});

test('cards: a word-order card is explained as word order, not as meaning', () => {
  // The failure mode this guards: all three options mean the same thing, so an
  // explanation that reaches for the sentence's meaning explains nothing at
  // all. The facts have to say which word moved and where it ended up, or the
  // model has nothing to be specific about.
  for (const { item, card } of grammarCards()) {
    if (!['wordorder', 'bracket', 'subclause', 'negation'].includes(item.kind)) continue;
    const target = cards.explainTarget(card, rendered(card));
    const right = item.options_lb[item.correct];

    assert.equal(target.lb, right, `${item.kind}: explains an ordering that is not the correct one`);
    assert.equal(target.word, item.moved, `${item.kind}: does not name the word that moved`);
    assert.match(target.label, /order/i, `${item.kind}: the button promises the wrong thing ("${target.label}")`);

    const facts = cards.factsFor(card);
    assert.ok(facts.includes(item.moved), `${item.kind}: the facts never name "${item.moved}"`);
    assert.ok(facts.includes(right), `${item.kind}: the facts never quote the correct order`);
    for (const wrong of item.options_lb.filter((_, i) => i !== item.correct)) {
      assert.ok(facts.includes(wrong), `${item.kind}: the facts omit a wrong order the learner could have picked`);
    }
  }
});

test('cards: a card with no sentence never sends one', async () => {
  // `perfect-aux` used to fall through to its own English prompt line, so the
  // explainer was handed "to come — past participle komm" as though it were
  // the Luxembourgish sentence under discussion.
  const anthropic = await import(load('anthropic.js'));
  const aux = grammarCards().find(({ item }) => item.kind === 'perfect-aux');
  const target = cards.explainTarget(aux.card, rendered(aux.card));
  assert.equal(target.lb, null, 'a verb-and-two-auxiliaries card has no sentence');

  const prompt = anthropic.explainPrompt({ lb: target.lb, word: target.word, en: null, task: cards.taskFor(aux.card), facts: cards.factsFor(aux.card) });
  assert.ok(!/Sentence: (null|undefined)/.test(prompt), `sent a non-sentence as the sentence:\n${prompt}`);
  assert.match(prompt, /has no sentence/, 'the prompt must say there is no sentence rather than send an empty one');
  assert.ok(prompt.includes(aux.item.lb), 'the verb itself must still reach the prompt');
});

test('cards: both explain paths ask the same question, in plain language', async () => {
  // The app can call Anthropic directly or through the Worker, and the two
  // prompts are duplicated rather than shared because the Worker deploys
  // separately. Duplication drifts, and an explanation that depends on whether
  // a Worker happens to be configured is a bug nobody would think to look for.
  const fs = require('node:fs');
  const app = fs.readFileSync(path.join(ROOT, 'app', 'js', 'anthropic.js'), 'utf8');
  const worker = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'index.js'), 'utf8');

  const shared = [
    'Write for a complete beginner who has never studied grammar.',
    'A word-order exercise is a special case',
    'Luxembourgish is NOT German',
    'Use only the words in the sentence you are given.',
  ];
  for (const paragraph of shared) {
    assert.ok(app.includes(paragraph), `app/js/anthropic.js is missing: ${paragraph}`);
    assert.ok(worker.includes(paragraph), `worker/src/index.js is missing: ${paragraph}`);
  }

  // The jargon ban is the point of the rewrite, so it is checked as a list
  // rather than as a sentence that happens to contain the word "jargon".
  for (const term of ['finite verb', 'participle', 'subordinate', 'inversion', 'morphosyntax']) {
    assert.ok(app.includes(term) && worker.includes(term), `neither prompt bans "${term}"`);
  }

  // Explanations are cached forever by design, on the device and in the
  // Worker's KV, so a rewritten prompt only reaches cards nobody has asked
  // about yet unless both caches are keyed on a version that moves with it.
  const appVersion = app.match(/EXPLAIN_PROMPT_VERSION = '([^']+)'/)?.[1];
  const workerVersion = worker.match(/EXPLAIN_PROMPT_VERSION = '([^']+)'/)?.[1];
  assert.ok(appVersion, 'app/js/anthropic.js declares no EXPLAIN_PROMPT_VERSION');
  assert.equal(workerVersion, appVersion, 'the two explanation caches are keyed on different prompt versions');
});

test('cards: the Worker accepts a card that has no sentence', () => {
  // It used to answer 400 for a missing `lb`, which is every perfect-aux card
  // and every gender card whose noun has no example sentence.
  const fs = require('node:fs');
  const worker = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'index.js'), 'utf8');
  assert.ok(!/if \(!lb\) return json/.test(worker), '/explain still rejects a request with no sentence');
  assert.match(worker, /if \(!lb && !word\) return json/, '/explain must still reject a request with nothing to explain');
  // And the verified facts must actually reach the model: they were read off
  // the request, folded into the cache key, and then dropped before the call.
  assert.match(worker, /explainPrompt\(\{ lb, word, en, task, facts \}\)/, 'the Worker builds its prompt without the facts');
});

/* ----------------------------------------------------- sentence structure */

test('cards: the sentence-structure filter selects real cards from the shipped deck', () => {
  // `STRUCTURE_KINDS` is the single definition three places depend on — the
  // session reserve, the focused #/grammar/structure round, and the engine's
  // per-card tally that ticks Today's checklist. A typo in it would not throw
  // anywhere: the reserve would silently reserve nothing, the focused round
  // would show "nothing due", and the checklist step would become impossible
  // to complete while the app kept insisting it was mandatory.
  const grammar = require(path.join(ROOT, 'app', 'data', 'grammar.json')).items;
  const kinds = new Set(grammar.map((item) => item.kind));
  for (const kind of cards.STRUCTURE_KINDS) {
    assert.ok(kinds.has(kind), `${kind} is reserved every session but no such card ships`);
  }

  const structural = grammar.filter((item) => cards.isStructure(item));
  assert.ok(structural.length >= 300, `expected a usable structure pool, got ${structural.length}`);
  assert.ok(structural.every((item) => Array.isArray(item.options_lb)), 'a structure card must offer orderings to choose between');
  assert.ok(!cards.isStructure({ kind: 'gender' }), 'gender is not sentence structure');
  assert.ok(!cards.isStructure(undefined), 'a missing item must not read as structure');
});

test('cards: Today cannot demand more structure than a session guarantees', () => {
  // Two constants in two files that have to agree, and nothing links them:
  // `STRUCTURE_RESERVE` is how many structure cards a mixed session puts in
  // front of you, `STRUCTURE_CARDS_GOAL` is how many Today requires before it
  // will tick the step. If the goal ever exceeds the reserve, a learner who
  // does exactly what the app asks — their daily sessions — can never finish
  // the day. That is the same failure as the frozen stage counters, one level
  // up, and it is invisible until someone reports it.
  const fs = require('node:fs');
  const reserve = Number(
    fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'session.js'), 'utf8').match(/STRUCTURE_RESERVE = (\d+)/)?.[1],
  );
  const goal = Number(
    fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'today.js'), 'utf8').match(/STRUCTURE_CARDS_GOAL = (\d+)/)?.[1],
  );
  assert.ok(reserve > 0 && goal > 0, 'both constants must be declared and readable');
  assert.ok(goal <= reserve, `Today asks for ${goal} structure cards a day but a session only guarantees ${reserve}`);
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

test('cards: a blind listening card never plays a sentence a beginner cannot hold', () => {
  // The bug this guards: 2,010 of the 2,049 vocab words carry a recording and
  // `listen` was the only rung at box 1, so every review on the second day of
  // using the app was an audio-only card — with no text at all — on sentences
  // running to 19 words. The rung is now gated on length, so a long-sentence
  // word gets another gloss card at box 1 and keeps its play button there.
  const wc = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
  const caps = { A1: 7, A2: 9 };

  let listens = 0;
  for (const item of vocab) {
    if (!cards.isDrillable(item, 'vocab')) continue;
    if (cards.cardTypeFor(item, 'recv', 1, 'vocab') !== 'listen') continue;
    listens += 1;
    const cap = caps[item.level] ?? 7;
    assert.ok(
      wc(item.example.lb) <= cap,
      `${item.lb} (${item.level}) gets a blind listening card on ${wc(item.example.lb)} words, cap ${cap}`,
    );
  }
  assert.ok(listens > 200, `expected listening to survive as a real share of the deck, got ${listens}`);

  // And the box-1 review is no longer universally a listening card.
  const drillable = vocab.filter((item) => cards.isDrillable(item, 'vocab'));
  const share = listens / drillable.length;
  assert.ok(share < 0.9, `box 1 is still ${Math.round(share * 100)}% listening cards`);
});
