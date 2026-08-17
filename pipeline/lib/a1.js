'use strict';

/**
 * What counts as an A1 word, and therefore what an A1-only exercise may show.
 *
 * The Arcade asks you to *produce* sentences — tap the words in order — and a
 * sentence is only a structure exercise if you already know the words in it.
 * One unknown noun turns "build the sentence" into "guess the noun". So the
 * material has to be filtered, and filtering needs a definition of "known".
 *
 * ## Forward expansion, not reverse lookup
 *
 * The obvious approach is backwards and does not work: take each word of a
 * sentence, resolve it through `lexicon.forms` to a LOD id, and ask whether
 * that id is A1. `lexicon.forms` is single-valued — one id per spelling, with
 * verified spellings winning — so a homograph resolves to whichever record won
 * the index, not to the sense in the sentence. Measured on the phrase deck it
 * sends `vu` to FEDEREIERTSTAATEVUMIKRONESIEN1 and `ass` to ASS1, and rejects
 * 125 of 126 sentences on words the learner plainly knows. It is the same
 * mis-attribution documented in Follow-up 16.
 *
 * So this goes the other way: start from the lemmas that *are* A1, and expand
 * each one forward into every surface form LOD publishes for it. Under-
 * inclusive when a form's index entry points at a homograph — that form is
 * simply not added — but never wrong in the direction that matters, which is
 * calling an A2 word A1.
 *
 * ## What is expanded
 *
 *   - every A1 vocabulary lemma, and every form in the lexicon that resolves
 *     to its id (this is what supplies the inflection tables: `kleng` brings
 *     `klengen`, `klengem`, `klenge`);
 *   - every conjugated form of every A1 verb, from the verb deck's own present,
 *     past and imperative tables;
 *   - the plural and past-participle forms LOD records on the A1 entries;
 *   - the shipped phrase frames, because a frame is the thing being taught in
 *     the same round — `ech hätt` is not an unknown word on a card whose whole
 *     subject is `ech hätt`;
 *   - the pronoun, dative and possessive tables, which the cheat sheet and the
 *     "Change the word" game teach at A1 and which LOD files as separate
 *     records the level tags do not reach.
 *
 * Everything else is A2 or above and is filtered out. What survives the filter
 * is genuinely A2+ content vocabulary — Schnéi, Conservatoire, Tomatenzooss —
 * which is exactly what should be kept out of a beginner's build card.
 */

const path = require('node:path');
const fs = require('node:fs');
const paths = require('./paths');

/**
 * Pronouns, dative forms and possessives.
 *
 * These are A1 by every published syllabus and the app teaches them from the
 * first session, but LOD files many of them as their own records outside the
 * GWS A1 category, so the level tags alone would call `mer` and `däi` unknown.
 * Listed rather than derived, because a closed class of 40 words is clearer
 * written down than reconstructed — and every one is a form LOD publishes.
 */
const FUNCTION_WORDS = [
  // subject pronouns
  'ech', 'du', 'hien', 'si', 'hatt', 'mir', 'dir', 'mer',
  // accusative / dative
  'mech', 'dech', 'iech', 'him', 'hir', 'hinnen', 'eis', 'engem', 'enger', 'deem', 'där',
  // possessives
  'mäin', 'mäi', 'meng', 'menger', 'mengem', 'däin', 'däi', 'deng', 'denger', 'dengem',
  'säin', 'säi', 'seng', 'senger', 'sengem', 'eise', 'eisen', 'eisem', 'eiser', 'ären', 'är', 'ärem',
];

const readItems = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).items ?? [];

/** LOD id for a deck row. Starter items carry a `START-` prefix on their id. */
const lodIdOf = (row) => String(row.lodId ?? row.id ?? '').replace(/^START-/, '');

/**
 * Every surface form a learner at A1 can be expected to read.
 *
 * Reads the built decks, so it must run after build:vocab and build:verbs.
 * Returns a Set of lowercased forms.
 */
function buildA1Forms({ itemsDir = paths.ITEMS_DIR, lexiconPath = paths.LEXICON_PATH, corpusPath = paths.CORPUS_PATH } = {}) {
  const vocab = readItems(path.join(itemsDir, 'vocab.json'));
  const verbs = readItems(path.join(itemsDir, 'verbs.json'));
  const phrases = fs.existsSync(path.join(itemsDir, 'phrases.json')) ? readItems(path.join(itemsDir, 'phrases.json')) : [];
  const lexicon = JSON.parse(fs.readFileSync(lexiconPath, 'utf8'));
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8')).entries ?? [];

  // The lexicon inverted: LOD id -> every spelling that resolves to it. This
  // is what turns one A1 lemma into its whole inflection table.
  const formsById = new Map();
  for (const [form, value] of Object.entries(lexicon.forms ?? {})) {
    const id = String(value).replace(/^[a-z-]+:/, '');
    if (!formsById.has(id)) formsById.set(id, []);
    formsById.get(id).push(form);
  }

  const known = new Set();
  const add = (value) => {
    if (!value) return;
    // Multi-word spellings are indexed whole ("virun Ae féieren"); a sentence
    // is checked word by word, so they enter as their parts.
    for (const part of String(value).split(/\s+/)) {
      const word = part.toLowerCase().replace(/[!?.,;:]+$/, '');
      if (word) known.add(word);
    }
  };

  const a1Ids = new Set();
  for (const item of vocab) {
    if (item.level !== 'A1') continue;
    add(item.lb);
    a1Ids.add(lodIdOf(item));
  }
  for (const id of a1Ids) for (const form of formsById.get(id) ?? []) add(form);

  for (const verb of verbs) {
    if (verb.level !== 'A1') continue;
    add(verb.infinitive);
    add(verb.pastParticiple);
    add(verb.auxiliaryVerb);
    for (const table of ['present', 'past', 'imperative']) {
      for (const form of Object.values(verb[table] ?? {})) add(form);
    }
    for (const form of formsById.get(lodIdOf(verb)) ?? []) add(form);
  }

  for (const entry of corpus) {
    if (!a1Ids.has(entry.id)) continue;
    for (const inflected of entry.inflection ?? []) {
      add(inflected.form);
      add(inflected.nRuleForm);
    }
  }

  for (const phrase of phrases) add(phrase.lb);
  for (const word of FUNCTION_WORDS) add(word);

  return known;
}

/**
 * The words of a sentence, for the purposes of the filter.
 *
 * Drops the clitic articles first — `d'Post` is the A1 noun `Post` behind
 * `d'`, and treating the whole thing as one token would call it unknown.
 */
function words(sentence) {
  return String(sentence ?? '')
    .replace(/\b([dnlsz])['’]/giu, '')
    .split(/[^\p{L}’'-]+/u)
    .filter(Boolean);
}

/** Is every word of this sentence one an A1 learner has met? */
function isA1Sentence(sentence, known) {
  const tokens = words(sentence);
  if (tokens.length === 0) return false;
  return tokens.every((token) => known.has(token.toLowerCase()));
}

module.exports = { buildA1Forms, isA1Sentence, words, FUNCTION_WORDS, lodIdOf };
