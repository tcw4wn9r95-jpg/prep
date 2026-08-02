/**
 * The card ladder.
 *
 * One word is not one question. What a card asks depends on how well the word
 * is already known, because the useful difficulty of a question changes as the
 * memory strengthens: picking a gloss from four options is the right question
 * on day one and worthless on day thirty.
 *
 *   recv 0   gloss      see the word, pick the meaning
 *   recv 1   listen     hear the sentence with no text, pick the meaning
 *   recv 2+  cloze      read the sentence with the word gapped, pick it back
 *   prod 0   reverse    see the meaning, pick the word
 *   prod 1   build      see the meaning, build the word from letter tiles
 *   prod 2+  type       see the meaning, type the word (+ its article, if a noun)
 *   prod 3+  produce    see the gapped sentence, type the inflected form
 *
 * Every type declares what data it needs. A word with no recording never
 * reaches `listen`; a word whose cloze could not be located never reaches
 * `cloze` or `produce`. The ladder falls back to the next-simplest available
 * type rather than fabricating the missing half.
 *
 * A card is a plain description — prompt, answer, options — with no DOM in it.
 * engine.js renders it. That split is what makes the seven types testable and
 * keeps the renderer from growing a branch per type.
 */

import { STRANDS } from '../store.js';
import { letterBank, wordBank } from './match.js';

/** Deck-shape differences, kept in one place. */
export const DECKS = {
  vocab: {
    id: 'vocab',
    title: 'Vocabulary',
    lemma: (item) => item.lb,
    gloss: (item) => item.en,
    // Nouns carry a gender, and knowing a noun without its article is knowing
    // it wrong — the article is part of the answer on production cards.
    article: (item) => (item.pos === 'SUBST' ? item.article : null),
    kindLabel: (item) =>
      ({ SUBST: 'noun', VRB: 'verb', ADJ: 'adjective', ADV: 'adverb', PRON: 'pronoun', PREP: 'preposition', CONJ: 'conjunction' })[item.pos] ?? 'word',
  },
  verb: {
    id: 'verb',
    title: 'Verbs',
    lemma: (item) => item.infinitive,
    gloss: (item) => item.en,
    article: () => null,
    kindLabel: () => 'verb',
  },
  // Sentence frames — the chunks an A2 interview is actually made of. Same
  // engine, but the thing being learned is several words long, which is why
  // the label says "phrase" rather than a part of speech.
  phrase: {
    id: 'phrase',
    title: 'Phrases',
    lemma: (item) => item.lb,
    gloss: (item) => item.en,
    article: () => null,
    kindLabel: () => 'phrase',
  },
  // Three item shapes under one deck id — see pipeline/build-grammar.js.
  // `lemma` and `gloss` exist only because every other part of this module
  // assumes a deck has them (isDrillable's distractor lookups, mostly); the
  // actual rendering lives entirely in the 'grammar-choice' case of
  // buildCard(), which branches on item.kind.
  grammar: {
    id: 'grammar',
    title: 'Grammar',
    lemma: (item) => (item.kind === 'gender' ? item.lb : `${item.before}…${item.after}`.trim()),
    gloss: (item) => item.en ?? null,
    article: () => null,
    kindLabel: (item) => GRAMMAR_KIND_LABELS[item.kind] ?? 'grammar',
  },
};

const GRAMMAR_KIND_LABELS = { gender: 'gender', nrule: 'n-rule', adjective: 'adjective agreement' };
// Exported: the gender-sort game (screens/gender-sort.js) uses the same three
// labels, and two independently-worded translations of "masculine" would read
// as a second, disagreeing source of truth.
export const GENDER_LABELS = { M: 'männlech (masculine)', F: 'weiblech (feminine)', N: 'neutral' };

const has = {
  // `local === false` means the recording is referenced but not mirrored yet.
  // Offering a play button for it would 404 on the card.
  audio: (item) => Boolean(item.example?.audioId) && item.example.local !== false,
  cloze: (item) => Boolean(item.cloze?.form),
  gloss: (item) => Boolean(item.en),
  present: (item) => Boolean(item.present),
  grammarChoice: (item) =>
    (item.kind === 'gender' && Array.isArray(item.options) && Number.isInteger(item.correct)) ||
    (['nrule', 'adjective'].includes(item.kind) && Array.isArray(item.options_lb) && Number.isInteger(item.correct)),
};

/**
 * Card types in ladder order per strand. `minBox` is the lowest box the type
 * is appropriate for; the hardest type a word qualifies for wins.
 */
const LADDER = {
  default: {
    [STRANDS.recv]: [
      { id: 'gloss', minBox: 0, needs: [has.gloss] },
      { id: 'listen', minBox: 1, needs: [has.gloss, has.audio] },
      { id: 'cloze', minBox: 2, needs: [has.cloze] },
    ],
    [STRANDS.prod]: [
      { id: 'reverse', minBox: 0, needs: [has.gloss] },
      { id: 'build', minBox: 1, needs: [has.gloss] },
      { id: 'type', minBox: 2, needs: [has.gloss] },
      { id: 'produce', minBox: 3, needs: [has.cloze] },
    ],
  },
  // Phrases are already multi-word chunks, so there is no conjugation rung and
  // the production bank is built from words rather than letters.
  phrase: {
    [STRANDS.recv]: [
      { id: 'gloss', minBox: 0, needs: [has.gloss] },
      { id: 'listen', minBox: 1, needs: [has.gloss, has.audio] },
      { id: 'cloze', minBox: 2, needs: [has.cloze] },
    ],
    [STRANDS.prod]: [
      { id: 'reverse', minBox: 0, needs: [has.gloss] },
      { id: 'build', minBox: 1, needs: [has.gloss] },
      { id: 'type', minBox: 2, needs: [has.gloss] },
      { id: 'produce', minBox: 3, needs: [has.cloze] },
    ],
  },
  // Verbs get one extra production rung. Conjugation is Morphosyntax, one of
  // the four criteria the speaking part is actually marked on, so producing
  // the right person form stays a question in its own right — it sits above
  // typing the infinitive because it is strictly harder.
  verb: {
    [STRANDS.prod]: [
      { id: 'reverse', minBox: 0, needs: [has.gloss] },
      { id: 'build', minBox: 1, needs: [has.gloss] },
      { id: 'type', minBox: 2, needs: [has.gloss] },
      { id: 'conjugate', minBox: 3, needs: [has.present] },
      { id: 'produce', minBox: 4, needs: [has.cloze] },
    ],
  },
  // One rung, both strands: recognising which option is correct is the whole
  // task for all three grammar kinds, so there is no easy/hard escalation to
  // ladder — recv and prod exist only so the Leitner scheduler still spaces
  // repeats the same way every other deck does (see PROD_UNLOCK_BOX gating
  // the prod strand's *timing*, in store.js).
  grammar: {
    [STRANDS.recv]: [{ id: 'grammar-choice', minBox: 0, needs: [has.grammarChoice] }],
    [STRANDS.prod]: [{ id: 'grammar-choice', minBox: 0, needs: [has.grammarChoice] }],
  },
};

function rungsFor(deckId, strand) {
  return LADDER[deckId]?.[strand] ?? LADDER.default[strand] ?? LADDER.default[STRANDS.recv];
}

/**
 * The hardest card type this item qualifies for at this box.
 *
 * @param {'recv'|'prod'} strand
 * @param {number} box
 * @param {string} deckId
 */
export function cardTypeFor(item, strand, box, deckId = 'vocab') {
  const rungs = rungsFor(deckId, strand);
  let chosen = null;
  for (const rung of rungs) {
    if (rung.minBox > box) break;
    if (rung.needs.every((test) => test(item))) chosen = rung.id;
  }
  if (chosen) return chosen;

  // No rung at or below this box was available for this item. Return null
  // rather than reaching for one above it: falling back onto the entry rung
  // when its data is missing produces a card with no answer, and falling
  // *upward* would hand a beginner a question harder than the box allows.
  return null;
}

/**
 * Can this item be made into a card at all?
 *
 * A handful of LOD verbs carry no English gloss, so there is nothing to ask
 * about them in either direction. They stay in the data — the conjugation
 * tables are still correct — but they are not drillable, and shipping them as
 * cards would mean a question with no right answer.
 */
export function isDrillable(item, deckId = 'vocab') {
  return ['recv', 'prod'].every((strand) => cardTypeFor(item, strand, 0, deckId) !== null);
}

/**
 * `deckId:strand:itemId` → box, which is how the engine picks a question type.
 *
 * The deck id is in the key because one session can mix decks, and two decks
 * are free to use the same item id — `HUNN1` is a verb row and could just as
 * easily be a vocab row. Pass the same map in again to accumulate several
 * decks into one index.
 */
export function boxIndex(deckId, states, into = new Map()) {
  for (const [strand, rows] of Object.entries(states)) {
    for (const [itemId, row] of rows) into.set(`${deckId}:${strand}:${itemId}`, row.box);
  }
  return into;
}

const PRONOUNS = { p1: 'ech', p2: 'du', p3: 'hie / si / hatt', p4: 'mir', p5: 'dir', p6: 'si' };
const PERSONS = Object.keys(PRONOUNS);

/**
 * Builds the card to show.
 *
 * @param {object} params
 * @param {object} params.item
 * @param {'recv'|'prod'} params.strand
 * @param {number} params.box
 * @param {object} params.deck one of DECKS
 * @param {Array} params.pool the whole deck, for distractors
 */
export function buildCard({ item, strand, box, deck, pool, random = Math.random }) {
  const type = cardTypeFor(item, strand, box, deck.id);
  if (!type) throw new Error(`${item.id} cannot be drilled — filter the deck with isDrillable() first`);
  const lemma = deck.lemma(item);
  const base = { type, strand, item, deck, lemma, cue: item.cue ?? null, kindLabel: deck.kindLabel(item) };

  switch (type) {
    case 'gloss':
      return {
        ...base,
        mode: 'choice',
        instruction: 'What does this mean?',
        prompt: { word: withArticle(item, deck, lemma), sentence: item.example?.lb ?? null, audioId: playableAudio(item) },
        options: optionsOf(item, pool, deck.gloss, random),
        answer: deck.gloss(item),
      };

    case 'listen':
      return {
        ...base,
        mode: 'choice',
        instruction: 'Listen. Which word is in this sentence?',
        // No text at all until the answer is in — otherwise the eye does the
        // work the ear is supposed to be doing.
        prompt: { word: null, sentence: null, audioId: item.example.audioId, revealAfter: item.example.lb },
        options: optionsOf(item, pool, deck.gloss, random),
        answer: deck.gloss(item),
      };

    case 'cloze':
      return {
        ...base,
        mode: 'choice',
        instruction: 'Which word fills the gap?',
        prompt: { cloze: item.cloze, audioId: playableAudio(item) },
        options: optionsOf(item, pool, (candidate) => candidate.cloze?.form ?? null, random),
        answer: item.cloze.form,
      };

    case 'reverse':
      return {
        ...base,
        mode: 'choice',
        instruction: 'Which word is this?',
        prompt: { gloss: deck.gloss(item) },
        options: optionsOf(item, pool, (candidate) => withArticle(candidate, deck, deck.lemma(candidate)), random),
        answer: withArticle(item, deck, lemma),
      };

    case 'build':
      return {
        ...base,
        mode: 'bank',
        instruction: deck.id === 'phrase' ? 'Put the words in order.' : 'Build the word.',
        prompt: { gloss: deck.gloss(item) },
        // Decoy words come from other frames in the deck, so everything on
        // screen is corpus-attested.
        bank:
          deck.id === 'phrase'
            ? wordBank(lemma, pool.filter((other) => other.id !== item.id).map((other) => deck.lemma(other)), { random })
            : letterBank(lemma, { random }),
        bankKind: deck.id === 'phrase' ? 'word' : 'letter',
        answer: lemma,
      };

    case 'type':
      return {
        ...base,
        mode: 'type',
        instruction: deck.id === 'phrase' ? 'Type the phrase.' : 'Type the word.',
        prompt: { gloss: deck.gloss(item) },
        // Nouns must supply the article too. This is the only place gender is
        // ever tested — it has been sitting in the data unused.
        article: deck.article(item),
        answer: lemma,
      };

    case 'produce':
      return {
        ...base,
        mode: 'type',
        instruction: 'Type the missing word.',
        prompt: { cloze: item.cloze, audioId: playableAudio(item) },
        article: null,
        // The inflected form as it appears in the sentence, not the lemma.
        answer: item.cloze.form,
      };

    case 'conjugate': {
      const person = PERSONS[Math.floor(random() * PERSONS.length)];
      return {
        ...base,
        mode: 'choice',
        instruction: 'Which form goes with this pronoun?',
        prompt: { word: lemma, pronoun: PRONOUNS[person], sentence: null, audioId: null },
        options: conjugationOptions(item, pool, person, random),
        answer: item.present[person],
      };
    }

    case 'grammar-choice':
      return grammarChoiceCard(base, item, random);

    default:
      throw new Error(`unknown card type ${type}`);
  }
}

/**
 * The one grammar card type, branched by `item.kind`. All three ask "which of
 * these options is right", they just differ in what the options are and what
 * the prompt shows — gender picks from the fixed M/F/N labels; n-rule and
 * adjective both gap a real sentence and offer the spellings
 * pipeline/build-grammar.js already picked (never sampled from a pool here,
 * unlike every other card type — an n-rule distractor has to be the *other*
 * attested spelling of this exact word, not a random one from elsewhere).
 */
function grammarChoiceCard(base, item, random) {
  if (item.kind === 'gender') {
    const options = shuffle(
      item.options.map((code, index) => ({ id: `${item.id}:${code}`, value: GENDER_LABELS[code] ?? code, correct: index === item.correct })),
      random,
    );
    return {
      ...base,
      mode: 'choice',
      instruction: 'What gender is this word?',
      prompt: { word: `${item.article} ${item.lb}`, sentence: item.example?.lb ?? null, audioId: playableAudio(item) },
      options,
      answer: GENDER_LABELS[item.gender] ?? item.gender,
    };
  }

  const options = shuffle(
    item.options_lb.map((form, index) => ({ id: `${item.id}:${index}`, value: form, correct: index === item.correct })),
    random,
  );
  return {
    ...base,
    mode: 'choice',
    instruction: item.kind === 'nrule' ? 'Which spelling is correct here (the Eifeler Regel)?' : 'Which form of the word fits this sentence?',
    prompt: { cloze: { before: item.before, after: item.after }, audioId: null },
    options,
    answer: item.options_lb[item.correct],
  };
}

/** The recording to offer, or null when it is not mirrored yet. */
function playableAudio(item) {
  return has.audio(item) ? item.example.audioId : null;
}

function withArticle(item, deck, lemma) {
  const article = deck.article(item);
  return article ? `${article} ${lemma}` : lemma;
}

/**
 * Four options, correct one included, shuffled.
 *
 * Distractors prefer the same part of speech so the choice is not decidable
 * from shape alone, and are deduplicated by their displayed text — two options
 * reading "work" makes the card unanswerable.
 */
function optionsOf(item, pool, valueOf, random) {
  const correct = valueOf(item);
  const seen = new Set([String(correct).toLowerCase()]);
  const sameKind = [];
  const rest = [];

  for (const candidate of pool) {
    if (candidate.id === item.id) continue;
    const value = valueOf(candidate);
    if (!value) continue;
    const key = String(value).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    (candidate.pos === item.pos ? sameKind : rest).push({ id: candidate.id, value });
  }

  const source = sameKind.length >= 3 ? sameKind : [...sameKind, ...rest];
  const distractors = pick(source, 3, random);
  return shuffle([{ id: item.id, value: correct, correct: true }, ...distractors.map((option) => ({ ...option, correct: false }))], random);
}

/**
 * Wrong answers for a conjugation card come from the *same* verb's other
 * persons, so the choice is about person agreement rather than about spotting
 * an unrelated word. Verbs whose forms coincide across persons (p1/p4/p6 often
 * do) leave too few, so the shortfall is topped up from other verbs.
 */
function conjugationOptions(item, pool, person, random) {
  const correct = item.present[person];
  const seen = new Set([String(correct).toLowerCase()]);
  const siblings = [];
  for (const other of PERSONS) {
    const form = item.present[other];
    if (!form || seen.has(form.toLowerCase())) continue;
    seen.add(form.toLowerCase());
    siblings.push({ id: `${item.id}:${other}`, value: form });
  }

  const others = [];
  for (const candidate of pool) {
    if (candidate.id === item.id || !candidate.present) continue;
    const form = candidate.present[person];
    if (!form || seen.has(form.toLowerCase())) continue;
    seen.add(form.toLowerCase());
    others.push({ id: `${candidate.id}:${person}`, value: form });
  }

  const distractors = [...pick(siblings, 3, random), ...pick(others, 3, random)].slice(0, 3);
  return shuffle([{ id: item.id, value: correct, correct: true }, ...distractors.map((option) => ({ ...option, correct: false }))], random);
}

function pick(list, count, random) {
  const chosen = [];
  const taken = new Set();
  const limit = Math.min(count, list.length);
  let guard = 0;
  while (chosen.length < limit && guard < list.length * 8) {
    guard += 1;
    const index = Math.floor(random() * list.length);
    if (taken.has(index)) continue;
    taken.add(index);
    chosen.push(list[index]);
  }
  return chosen;
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
