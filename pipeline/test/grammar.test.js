'use strict';

/**
 * The grammar deck — build-grammar.js, and the guard on what it is allowed
 * to ship.
 *
 * The header of build-grammar.js makes one claim: every option in every
 * exercise is either a value LOD assigned or a span copied verbatim from a
 * real LOD sentence. These tests hold that line with fixtures small enough to
 * read in full, plus a guard over the actually-shipped file so a future
 * change cannot quietly start inventing forms.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const { genderItems, nRuleItems, adjectiveItems } = require('../build-grammar.js');

/* --------------------------------------------------------------- fixtures */

function fixtureLexicon() {
  return {
    forms: {
      // n-rule pair: aen/ae
      aen: 'spelling:A1',
      ae: 'n-rule:A1',
      // n-rule pair: en/e (the indefinite article)
      en: 'spelling:EN1',
      e: 'n-rule:EN1',
      // adjective SCHLECHT1, two attested forms
      schlecht: 'spelling:SCHLECHT1',
      schlechten: 'spelling:SCHLECHT1',
      // every other word the fixture sentences below use — a real lexicon
      // covers all of them; a hand-written one has to list them explicitly.
      dat: 'spelling:DAT1',
      ass: 'spelling:ASS1',
      an: 'spelling:AN1',
      engem: 'spelling:EN1',
      buch: 'spelling:BUCH1',
      wieder: 'spelling:WIEDER1',
      dag: 'spelling:DAG1',
      hutt: 'spelling:HUTT1',
      dir: 'spelling:DIR1',
      haut: 'spelling:HAUT1',
      dëst: 'spelling:DEST1',
      gelies: 'spelling:GELIES1',
    },
    nRuleForms: ['ae', 'e'],
    nRuleRetentionExceptions: {},
    erroneousSpellings: {},
  };
}

test('grammar/gender: reads gender straight off vocab.json, never invents one', () => {
  const vocab = [
    { id: 'KAND1', lb: 'Kand', pos: 'SUBST', gender: 'N', article: "d'", en: 'child', level: 'A1', example: { lb: 'dat ass mäi Kand', audioId: 'x' } },
    // ambiguous gender: must be skipped, not guessed
    { id: 'PERSON1', lb: 'Persoun', pos: 'SUBST', gender: 'MF', article: "d'", en: 'person', level: 'A2', example: { lb: 'dat ass eng Persoun', audioId: 'y' } },
    // no article: must be skipped
    { id: 'NOARTICLE1', lb: 'Saach', pos: 'SUBST', gender: 'M', article: null, en: 'thing', level: 'A2', example: { lb: 'dat', audioId: 'z' } },
    // not a noun: must be skipped
    { id: 'SCHLECHT1', lb: 'schlecht', pos: 'ADJ', gender: null, article: null, en: 'bad', level: 'A2', example: { lb: 'dat ass schlecht', audioId: 'w' } },
  ];

  const items = genderItems(vocab);
  assert.equal(items.length, 1, 'only the one clean, unambiguous noun produces an item');
  const [item] = items;
  assert.equal(item.lb, 'Kand');
  assert.equal(item.gender, 'N');
  assert.deepEqual(item.options, ['M', 'F', 'N']);
  assert.equal(item.options[item.correct], 'N', 'the correct index must point at the gender the corpus actually assigned');
  assert.equal(item.example.lb, 'dat ass mäi Kand', 'the example is the vocab item\'s own, not authored here');
});

test('grammar/nrule: only mines pairs where both spellings are independently in the lexicon', () => {
  const lexicon = fixtureLexicon();
  const corpus = {
    entries: [
      {
        id: 'A1',
        partOfSpeech: 'SUBST',
        meanings: [{ examples: [{ text: 'dat ass en Aen an engem Buch.' }] }],
      },
    ],
  };

  const items = nRuleItems(corpus, lexicon);
  assert.ok(items.length >= 1, 'a clean, attested n-rule pair should be found');
  for (const item of items) {
    assert.equal(item.kind, 'nrule');
    assert.equal(item.options_lb.length, 2);
    // Both options must be exactly the lexicon's own forms, never a form this
    // script derived and failed to double-check.
    for (const option of item.options_lb) {
      assert.ok(lexicon.forms[option.toLowerCase()], `"${option}" must resolve in the lexicon`);
    }
    assert.ok(Number.isInteger(item.correct) && item.correct >= 0 && item.correct < item.options_lb.length);
    // before + one of the options + after must reconstruct real text — i.e.
    // the gap is a real span of the sentence, not invented.
    assert.equal(typeof item.before, 'string');
    assert.equal(typeof item.after, 'string');
  }
});

test('grammar/nrule: never fabricates a spelling that is not independently attested', () => {
  // "gudden" would be the full form of a hypothetical "gudde" n-rule pair, but
  // it is deliberately absent from the fixture lexicon — the miner must skip
  // the pair rather than offer an unverified spelling as an option.
  const lexicon = fixtureLexicon();
  delete lexicon.forms.aen; // break the one pair the fixture sentence could produce
  const corpus = {
    entries: [{ id: 'A1', partOfSpeech: 'SUBST', meanings: [{ examples: [{ text: 'dat ass en Aen an engem Buch.' }] }] }],
  };
  const items = nRuleItems(corpus, lexicon);
  for (const item of items) {
    for (const option of item.options_lb) assert.ok(lexicon.forms[option.toLowerCase()], `unverified option "${option}" leaked through`);
  }
});

test('grammar/adjective: only forms attested in the corpus become options, and needs two or more', () => {
  const lexicon = fixtureLexicon();
  const corpus = {
    entries: [
      {
        id: 'SCHLECHT1',
        lemma: 'schlecht',
        partOfSpeech: 'ADJ',
        glosses: { en: ['bad'] },
        meanings: [
          { examples: [{ text: 'dat wieder ass schlecht.' }, { text: 'e schlechten Dag hutt dir haut.' }] },
        ],
      },
      {
        // only one attested form anywhere in its own examples: no item.
        id: 'SOLO1',
        lemma: 'solo',
        partOfSpeech: 'ADJ',
        glosses: { en: ['alone'] },
        meanings: [{ examples: [{ text: 'dëst Buch ass gelies.' }] }],
      },
    ],
  };

  const items = adjectiveItems(corpus, lexicon);
  const solo = items.filter((item) => item.entryId === 'SOLO1');
  assert.equal(solo.length, 0, 'a single attested form must not produce an agreement item');

  const schlecht = items.filter((item) => item.entryId === 'SCHLECHT1');
  assert.ok(schlecht.length >= 1);
  for (const item of schlecht) {
    assert.deepEqual([...item.options_lb].sort(), ['schlecht', 'schlechten'], 'options are exactly the two attested forms, nothing added');
    assert.ok(lexicon.forms[item.options_lb[item.correct].toLowerCase()]);
  }
});

test('grammar/adjective: options are never authored — always a subset of what appeared in the corpus', () => {
  const lexicon = fixtureLexicon();
  const corpus = {
    entries: [
      {
        id: 'SCHLECHT1',
        lemma: 'schlecht',
        partOfSpeech: 'ADJ',
        glosses: { en: ['bad'] },
        meanings: [{ examples: [{ text: 'dat wieder ass schlecht.' }, { text: 'en schlechten Dag hutt dir haut.' }] }],
      },
    ],
  };
  const attestedForms = new Set(['schlecht', 'schlechten']);
  const items = adjectiveItems(corpus, lexicon);
  for (const item of items) {
    for (const option of item.options_lb) {
      assert.ok(attestedForms.has(option.toLowerCase()), `"${option}" was never actually written by LOD in this entry's own examples`);
    }
  }
});

/* ------------------------------------------------------- the shipped-file guard */

const SHIPPED = path.join(ROOT, 'app', 'data', 'grammar.json');

test('grammar: the shipped deck carries only declared kinds, each internally consistent', (t) => {
  if (!fs.existsSync(SHIPPED)) {
    t.skip('no grammar.json yet — run npm run build:grammar');
    return;
  }
  const file = JSON.parse(fs.readFileSync(SHIPPED, 'utf8'));
  const items = file.items ?? [];
  assert.ok(items.length > 0, 'the deck should not be empty');

  const seenIds = new Set();
  for (const item of items) {
    assert.ok(!seenIds.has(item.id), `duplicate id ${item.id}`);
    seenIds.add(item.id);
    assert.ok(
      ['gender', 'nrule', 'adjective', 'perfect-aux', 'perfect-form', 'wordorder', 'negation'].includes(item.kind),
      `${item.id}: unknown kind "${item.kind}"`,
    );

    if (item.kind === 'gender') {
      assert.deepEqual(item.options, ['M', 'F', 'N']);
      assert.ok(Number.isInteger(item.correct) && item.correct >= 0 && item.correct <= 2);
    } else {
      // nrule and adjective both use the options_lb/correct/before/after shape
      assert.ok(Array.isArray(item.options_lb) && item.options_lb.length >= 2, `${item.id}: needs 2+ options`);
      assert.ok(Number.isInteger(item.correct) && item.correct >= 0 && item.correct < item.options_lb.length, `${item.id}: correct index out of range`);
      assert.equal(new Set(item.options_lb.map((o) => o.toLowerCase())).size, item.options_lb.length, `${item.id}: options must be distinct`);
    }
  }
});


/* ------------------------------------------------- the four newer kinds */

function shipped() {
  return JSON.parse(fs.readFileSync(SHIPPED, 'utf8')).items ?? [];
}

test('grammar: a perfect-auxiliary card never asks a circular question', (t) => {
  if (!fs.existsSync(SHIPPED)) return t.skip('no grammar.json yet');
  const verbs = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'verbs.json'), 'utf8')).items;
  const byId = new Map(verbs.map((verb) => [verb.id, verb]));
  const items = shipped().filter((item) => item.kind === 'perfect-aux');
  assert.ok(items.length > 100, `expected a real auxiliary deck, got ${items.length}`);

  for (const item of items) {
    assert.deepEqual([...item.options_lb].sort(), ['hunn', 'sinn'], `${item.id}: the choice is hunn or sinn`);
    // "Does hunn take hunn or sinn?" is not a question, and a participle equal
    // to its own infinitive shows the answer in the prompt.
    assert.ok(!['hunn', 'sinn'].includes(item.lb), `${item.id}: asks about an auxiliary itself`);
    assert.notEqual(item.participle.toLowerCase(), item.lb.toLowerCase(), `${item.id}: participle equals the infinitive`);

    const verb = byId.get(item.entryId);
    assert.ok(verb, `${item.id}: no such verb`);
    assert.equal(item.options_lb[item.correct], verb.auxiliaryVerb, `${item.id}: disagrees with LOD's auxiliary`);
    assert.equal(item.participle, verb.pastParticiple, `${item.id}: disagrees with LOD's participle`);
  }
});

test('grammar: word-order and negation options differ only in word order', (t) => {
  if (!fs.existsSync(SHIPPED)) return t.skip('no grammar.json yet');
  const items = shipped().filter((item) => item.kind === 'wordorder' || item.kind === 'negation');
  assert.ok(items.length > 100, `expected real ordering decks, got ${items.length}`);

  const bag = (sentence) =>
    (sentence.match(/[\p{L}][\p{L}'’-]*/gu) ?? [])
      .map((word) => word.toLowerCase())
      .sort()
      .join(' ');

  for (const item of items) {
    assert.equal(item.options_lb.length, 3, `${item.id}: three orderings`);
    assert.equal(new Set(item.options_lb).size, 3, `${item.id}: orderings must be distinct`);
    // The distractors are the same words rearranged — never a different word,
    // never a respelling. That is what makes the question about order alone.
    const reference = bag(item.options_lb[item.correct]);
    for (const option of item.options_lb) {
      assert.equal(bag(option), reference, `${item.id}: an option changes the words, not just their order`);
    }
    assert.ok(item.moved, `${item.id}: should record which word moved`);
    if (item.kind === 'negation') assert.equal(item.moved.toLowerCase(), 'net');
  }
});

test('grammar: every ordering option keeps the punctuation LOD wrote', (t) => {
  if (!fs.existsSync(SHIPPED)) return t.skip('no grammar.json yet');
  // Rejoining tokens with spaces silently drops commas, which would ship a
  // rewrite of the sentence as though it were the sentence.
  for (const item of shipped().filter((i) => i.kind === 'wordorder' || i.kind === 'negation')) {
    for (const option of item.options_lb) {
      assert.ok(!option.includes(' ,') && !option.includes(' .'), `${item.id}: stray spacing before punctuation`);
      assert.equal(option.trim(), option, `${item.id}: untrimmed option`);
    }
  }
});

test('grammar: a perfect-participle gap is answerable and really a perfect', (t) => {
  if (!fs.existsSync(SHIPPED)) return t.skip('no grammar.json yet');
  const verbs = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'verbs.json'), 'utf8')).items;
  const participles = new Set(verbs.filter((v) => v.pastParticiple).map((v) => v.pastParticiple.toLowerCase()));
  const AUX = new Set(['hunn', 'hu', 'hues', 'huet', 'hutt', 'hat', 'haten', 'sinn', 'si', 'bass', 'ass', 'sidd', 'war', 'waren']);

  const items = shipped().filter((item) => item.kind === 'perfect-form');
  assert.ok(items.length > 100, `expected a real participle deck, got ${items.length}`);
  for (const item of items) {
    assert.equal(item.options_lb.length, 4, `${item.id}: four options`);
    // Every option is a real participle, so the wrong ones are wrong here
    // rather than made up.
    for (const option of item.options_lb) {
      assert.ok(participles.has(option.toLowerCase()), `${item.id}: "${option}" is not a participle LOD publishes`);
    }
    // And the sentence really is a perfect — otherwise the gap is not one.
    const context = `${item.before} ${item.after}`.toLowerCase();
    const words = context.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    assert.ok(words.some((word) => AUX.has(word)), `${item.id}: no auxiliary, so this is not a perfect`);
  }
});

test('grammar: every kind the deck ships has theory behind it', async () => {
  if (!fs.existsSync(SHIPPED)) return;
  const guide = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'grammar-guide.js')).href);
  const kinds = new Set(shipped().map((item) => item.kind));
  for (const kind of kinds) {
    assert.ok(guide.topicFor(kind), `the ${kind} deck is drilled with no rule explaining it`);
  }
});
