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
 *                       — only when that sentence is short enough to follow
 *                         blind, otherwise this rung is skipped and box 1 is
 *                         another gloss card (see LISTEN_MAX_WORDS)
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
import { RULE_LINES } from '../grammar-guide.js';

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
    lemma: (item) => {
      if (item.kind === 'gender' || item.kind === 'perfect-aux') return item.lb;
      // A whole-sentence item has no gap to name, so the answer stands for it.
      if (SENTENCE_KINDS.has(item.kind)) return item.options_lb?.[item.correct] ?? '';
      return `${item.before}…${item.after}`.trim();
    },
    gloss: (item) => item.en ?? null,
    article: () => null,
    kindLabel: (item) => GRAMMAR_KIND_LABELS[item.kind] ?? 'grammar',
  },
};

const GRAMMAR_KIND_LABELS = {
  gender: 'gender',
  nrule: 'n-rule',
  adjective: 'adjective agreement',
  'perfect-aux': 'past tense',
  'perfect-form': 'past tense',
  wordorder: 'word order',
  bracket: 'verb bracket',
  subclause: 'verb at the end',
  negation: 'negation',
  numbers: 'numbers',
  dative: 'dative case',
  likes: 'likes and dislikes',
};

/**
 * What the learner was actually asked to do, in a phrase, per card type.
 *
 * Sent with the "Explain this sentence" request. The explanation used to be a
 * single generic reading of the sentence regardless of the exercise, so a
 * gender card, a blind listening card and an Eifeler-Regel card all got the
 * same paragraph about word order — useful for none of them, because what you
 * want explained is the thing you just got wrong. Naming the task lets the
 * answer be about that.
 */
export const CARD_TASKS = {
  gloss: 'They saw the word on its own and chose its English meaning from four options.',
  listen: 'They heard this sentence read aloud with no text on screen at all, and had to pick the meaning of one word in it.',
  cloze: 'They saw this sentence with one word blanked out and chose which word fills the gap.',
  reverse: 'They saw the English meaning and chose the Luxembourgish word from four options.',
  build: 'They saw the English meaning and assembled the Luxembourgish from letter or word tiles.',
  type: 'They saw the English meaning and typed the Luxembourgish word from memory, with its article if it is a noun.',
  produce: 'They saw this sentence with a gap and typed the correctly inflected form into it.',
  conjugate: 'They chose which present-tense form of the verb goes with a given pronoun.',
  'grammar-choice': 'They answered a grammar question about this sentence.',
};

/** The grammar kinds ask three different questions, so they get their own. */
export const GRAMMAR_TASKS = {
  gender: 'They were asked whether this noun is männlech, weiblech or neutral.',
  nrule: 'They were asked which spelling is correct here under the Eifeler Regel — whether the final n is kept or dropped.',
  adjective: 'They were asked which form of the adjective agrees with the noun in this sentence.',
  'perfect-aux': 'They were asked whether this verb forms its perfect with hunn or with sinn.',
  'perfect-form': 'They were asked which past participle belongs in the gap in this sentence.',
  wordorder: 'They were asked which of three orderings of this sentence is the correct one — the question is where the conjugated verb goes.',
  bracket: 'They were asked which of three orderings is correct — the question is where the second half of the verb goes, the participle or infinitive that closes the sentence.',
  subclause: 'They were asked which of three orderings is correct — the question is where the conjugated verb goes inside a subordinate clause introduced by datt or ob.',
  negation: 'They were asked which of three orderings of this sentence is the correct one — the question is where net goes.',
  numbers: 'They were asked which number word fills the gap in this sentence.',
  dative: 'They were asked which dative pronoun fills the gap after the preposition in this sentence.',
  likes: 'They were asked which of three orderings of this sentence is the correct one — the question is where gär (or gären) goes.',
};

/** The kinds whose options are whole sentences rather than a gapped one. */
const SENTENCE_KINDS = new Set(['wordorder', 'bracket', 'subclause', 'negation', 'likes']);

/**
 * Sentence structure: the three kinds that ask where the verb goes.
 *
 * Defined here, and imported by everything that has an opinion about it — the
 * session reserve, the focused round, Today's checklist — because three copies
 * of this list is three chances for the thing the checklist ticks to stop being
 * the thing the session guarantees.
 *
 * `negation` is deliberately out. It is word order too, but it is where *net*
 * goes, not where the verb goes; it has its own guide topic and its own rule,
 * and it does not build on the other two the way they build on each other.
 */
export const STRUCTURE_KINDS = ['wordorder', 'bracket', 'subclause'];
export const isStructure = (item) => STRUCTURE_KINDS.includes(item?.kind);

/**
 * Every exercise kind pipeline/build-grammar.js emits.
 *
 * Used to build the `#/grammar/<kind>` filters, so each notecard that has a
 * deck behind it can send you straight to that deck alone. Only the three
 * structure kinds had a filter before, which meant a "practise this" button on
 * the gender card would have quietly run the whole mixed grammar deck instead.
 *
 * `pipeline/test/grammar.test.js` checks this against the kinds the built deck
 * actually contains, so a new kind cannot be added to the builder without
 * turning up here.
 */
export const GRAMMAR_KINDS = [
  'gender',
  'nrule',
  'adjective',
  'perfect-aux',
  'perfect-form',
  'wordorder',
  'bracket',
  'subclause',
  'negation',
  'numbers',
  'dative',
  'likes',
];

/**
 * What LOD already records about this item, handed to the explainer as fact.
 *
 * Written because an explanation was caught inventing the things it could not
 * look up. Asked about `Puer`, it produced "en Bréck (a bridge) or en Bréck (a
 * break)" — the same word twice, with two glosses, for a noun that is
 * feminine — and glossed `Schaffschong` as "flip-flops". None of that is in
 * the corpus; it was filling gaps.
 *
 * The gender and the article are in the data already. Stating them removes the
 * gap rather than asking the model not to fill it, which is the only version
 * of this that can be relied on.
 */
export function factsFor(card) {
  const item = card.item ?? {};
  const right = item.options_lb?.[item.correct];
  const others = (item.options_lb ?? []).filter((_, index) => index !== item.correct);

  if (item.kind === 'gender') {
    const label = GENDER_LABELS[item.gender] ?? item.gender;
    return `LOD records ${item.lb} as ${label}, written with the definite article ${item.article}. In Luxembourgish the definite article d' covers both feminine and neuter, and the indefinite en covers both masculine and neuter, so neither on its own identifies the gender.`;
  }
  if (item.kind === 'perfect-aux') {
    return `LOD records the perfect of ${item.lb} as ${right} + ${item.participle}.`;
  }

  // Word order. The single most useful fact here is that the three options are
  // the *same* sentence — only `moved` changes position — because that is what
  // turns "which reads better" into a question with a rule behind it. Without
  // being told, an explanation tends to talk about the sentence's meaning,
  // which is identical in all three and therefore explains nothing.
  if (SENTENCE_KINDS.has(item.kind) && right) {
    const parts = [
      `All three options are the same real LOD sentence with one word in a different place. The only word that moves is "${item.moved}"; every other word is in the same position in all three.`,
      `The order LOD published, which is the correct answer: ${right}`,
    ];
    if (others.length) parts.push(`The wrong orders they could have picked: ${others.join(' / ')}`);
    if (item.conjunction) parts.push(`The subordinate clause here is introduced by "${item.conjunction}".`);
    return parts.join(' ');
  }

  if (item.kind === 'nrule' && right) {
    // The word *after* the gap is the whole question: the Eifeler Regel keys
    // off the sound that follows, and nothing else on the card does.
    const next = (item.after ?? '').trim().match(/[\p{L}][\p{L}'’-]*/u)?.[0];
    const both = `Both "${right}" and "${others.join('", "')}" are attested spellings of the same word in LOD; which is correct depends only on what comes next.`;
    return next ? `${both} Here the correct spelling is "${right}" and the following word is "${next}".` : `${both} Here the correct spelling is "${right}".`;
  }

  if (item.kind === 'adjective' && right) {
    const meaning = item.en ? ` (meaning "${item.en}")` : '';
    return `LOD attests both "${right}" and "${others.join('", "')}" as real forms of the same adjective${meaning}. In this sentence the correct form is "${right}".`;
  }

  if (item.kind === 'numbers' && right) {
    const rule =
      item.value >= 13 && item.value <= 19
        ? ' The teens end in -zéng; the tens that sound like them end in -zeg.'
        : item.value >= 20 && item.value % 10 === 0 && item.value < 100
          ? ' The tens end in -zeg; the teen that sounds like it ends in -zéng.'
          : '';
    const sentence = item.example?.lb ? ` LOD writes it: "${item.example.lb}".` : '';
    return `${item.value} is "${right}".${rule}${sentence}`;
  }

  if (item.kind === 'perfect-form' && right) {
    const meaning = item.en ? ` (${item.en})` : '';
    return `LOD records "${right}" as the past participle of ${item.infinitive}${meaning}. The other options are genuine past participles, but of other verbs.`;
  }

  if (item.kind === 'dative' && right) {
    const row = DATIVE_BY_FORM.get(right.toLowerCase());
    const person = row ? ` — the dative of ${row.nom} (${row.en})` : '';
    return `After "${item.preposition}" the pronoun goes into the dative, so it is "${right}"${person}.`;
  }

  if (card.deck?.id === 'vocab' && item.pos === 'SUBST' && item.article) {
    return `LOD records ${item.lb} with the definite article ${item.article}.`;
  }
  return null;
}

/**
 * What the explain button offers on this card, and what it should be called.
 *
 * Three grammar shapes had no explanation at all, because the engine looked
 * for a sentence and they have none it could find:
 *
 *   - the word-order kinds hide their prompt entirely (the options *are* the
 *     sentence, three ways), so the lookup returned null and the button was
 *     never built — on the exact cards a beginner most needs the reason for;
 *   - `perfect-aux` has no sentence, and the lookup fell through to its
 *     English prompt line, handing "to come — past participle komm" to the
 *     explainer as though it were Luxembourgish;
 *   - a gender card whose noun has no example sentence — 63% of them — was in
 *     the same position as the word-order cards.
 *
 * So a card can now be explainable without a sentence. `lb` may be null, and
 * the question then rests on the word, the task and the facts, which is enough
 * for "why does this verb take sinn?" to be answerable.
 *
 * @returns {{lb: string|null, word: string|null, label: string}|null}
 */
export function explainTarget(card, sentence) {
  const item = card.item ?? {};

  if (SENTENCE_KINDS.has(item.kind)) {
    const right = item.options_lb?.[item.correct] ?? null;
    return right ? { lb: right, word: item.moved ?? null, label: 'Why is this the right order?' } : null;
  }
  if (item.kind === 'perfect-aux') {
    return { lb: null, word: item.lb, label: 'Why this one?' };
  }
  // Like perfect-aux, a number card has no gapped sentence for the engine to
  // find — the prompt is the value. Its LOD sentence is attached rather than
  // rendered, so hand that over explicitly.
  if (item.kind === 'numbers') {
    return { lb: item.example?.lb ?? null, word: item.options_lb?.[item.correct] ?? null, label: 'How is this number built?' };
  }
  if (item.kind === 'gender') {
    return sentence
      ? { lb: sentence, word: joinArticle(item.article, item.lb), label: 'Explain this sentence' }
      : { lb: null, word: joinArticle(item.article, item.lb), label: 'Why this gender?' };
  }
  if (card.type === 'grammar-choice' && sentence) {
    return { lb: sentence, word: card.answer ?? card.lemma, label: 'Why is this the answer?' };
  }
  // Everything outside the grammar deck keeps the original rule: a sentence to
  // explain, or no button.
  return sentence ? { lb: sentence, word: card.answer ?? card.lemma, label: 'Explain this sentence' } : null;
}

/** The task line for a built card. */
export function taskFor(card) {
  if (card.type === 'grammar-choice') return GRAMMAR_TASKS[card.item?.kind] ?? CARD_TASKS['grammar-choice'];
  return CARD_TASKS[card.type] ?? null;
}

/**
 * The rule each grammar card is testing, in one line.
 *
 * These sentences were only on the cheat sheet, which is the wrong place for
 * them to be the *only* place: a grammar card that is got wrong told the
 * learner which spelling was right and nothing about why, so the same card
 * comes back in three days with the same coin-flip behind it. Answering
 * "Which spelling is correct here (the Eifeler Regel)?" without ever being
 * told what the Eifeler Regel is, is a memory test for a rule you could apply.
 *
 * Shown by engine.js at the moment a grammar card is missed, which is when the
 * rule is worth reading, and by the cheat sheet as the section intros — one
 * wording rather than two, so the sheet and the correction agree.
 */
export const GRAMMAR_RULES = RULE_LINES;
// Exported: the gender-sort game (screens/gender-sort.js) uses the same three
// labels, and two independently-worded translations of "masculine" would read
// as a second, disagreeing source of truth.
export const GENDER_LABELS = { M: 'männlech (masculine)', F: 'weiblech (feminine)', N: 'neutral' };

/**
 * How long an example sentence may be before it is too much to take in with no
 * text on screen, by the level of the word it belongs to.
 *
 * The `listen` card plays a sentence and shows nothing at all — the whole
 * point is that the ear does the work. That only teaches anything if the
 * sentence is close to comprehensible; well below that it is noise with a
 * multiple-choice question attached. The working figure in the reading and
 * listening literature is that input needs to be 95–98% known to be usable,
 * and an eight-word LOD sentence containing one word you have met once is
 * nowhere near it.
 *
 * A1 words are met in the first weeks and get the tighter bound; A2 words are
 * met later, by someone with more to hang a sentence on.
 */
const LISTEN_MAX_WORDS = { A1: 7, A2: 9 };
const LISTEN_MAX_WORDS_DEFAULT = 7;

function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

const has = {
  // `local === false` means the recording is referenced but not mirrored yet.
  // Offering a play button for it would 404 on the card.
  audio: (item) => Boolean(item.example?.audioId) && item.example.local !== false,
  /**
   * Audio *and* a sentence short enough to be worth hearing blind.
   *
   * 2,010 of the 2,049 vocab words carry a recording and `listen` was the only
   * rung at box 1, so every single review on the second day of using the app
   * was an audio-only card — on sentences with a median of 8 words and a
   * maximum of 19. Gating the rung on length puts roughly half of them back on
   * a `gloss` card at box 1 and keeps the blind-listening test for the
   * sentences where it is a test rather than a coin flip. The recording itself
   * is not lost: `playableAudio()` still puts a play button on the gloss and
   * cloze cards for every word that has one.
   */
  shortAudio: (item) =>
    has.audio(item) && wordCount(item.example.lb) <= (LISTEN_MAX_WORDS[item.level] ?? LISTEN_MAX_WORDS_DEFAULT),
  cloze: (item) => Boolean(item.cloze?.form),
  gloss: (item) => Boolean(item.en),
  present: (item) => Boolean(item.present),
  grammarChoice: (item) =>
    (item.kind === 'gender' && Array.isArray(item.options) && Number.isInteger(item.correct)) ||
    (['nrule', 'adjective', 'perfect-aux', 'perfect-form', 'wordorder', 'bracket', 'subclause', 'negation', 'numbers', 'dative', 'likes'].includes(
      item.kind,
    ) &&
      Array.isArray(item.options_lb) &&
      Number.isInteger(item.correct)),
};

/**
 * Card types in ladder order per strand. `minBox` is the lowest box the type
 * is appropriate for; the hardest type a word qualifies for wins.
 */
const LADDER = {
  default: {
    [STRANDS.recv]: [
      { id: 'gloss', minBox: 0, needs: [has.gloss] },
      { id: 'listen', minBox: 1, needs: [has.gloss, has.shortAudio] },
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
      { id: 'listen', minBox: 1, needs: [has.gloss, has.shortAudio] },
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
        prompt: {
          word: withArticle(item, deck, lemma),
          // The example sentence is withheld the very first time a word is
          // met, and shown from the first review onwards.
          //
          // LOD publishes no translation of its example sentences — the
          // `gloss` field on them is a Luxembourgish paraphrase — and nothing
          // here is allowed to invent one. So on a box-0 card the sentence was
          // a line of untranslated Luxembourgish sitting above four English
          // options: for someone meeting `elo` for the first time,
          // "ech hunn d'Wäsch de Moien ausgehaangen, se misst elo dréche sinn"
          // is not context, it is nine more unknown words. Input has to be
          // most of the way to comprehensible to be worth anything, and that
          // is nowhere near it.
          //
          // It is not lost: engine.js reveals the full sentence the moment the
          // card is answered, which is when it can be read against a meaning
          // that is now known. The recording stays on the card throughout —
          // hearing the word in connected speech costs no reading.
          sentence: box > 0 ? (item.example?.lb ?? null) : null,
          audioId: playableAudio(item),
        },
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
      return grammarChoiceCard(base, item, random, box);

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
function grammarChoiceCard(base, item, random, box = 0) {
  if (item.kind === 'gender') {
    const options = shuffle(
      item.options.map((code, index) => ({ id: `${item.id}:${code}`, value: GENDER_LABELS[code] ?? code, correct: index === item.correct })),
      random,
    );
    // Teach at the first meeting, test from the first review.
    //
    // Gender is not derivable from a Luxembourgish noun — it is a fact you are
    // told once and then have to remember, and the article is how it is told.
    // Showing "de Auto" above "What gender is this word?" *every* time gave the
    // answer away outright (LOD writes `de` for every masculine noun and `d'`
    // for every other), so the deck was free marks. But hiding it always is the
    // opposite failure: only 371 of 1,173 nouns have an example sentence that
    // shows an article, so for the rest there is no evidence on the card at all
    // and the question is unanswerable rather than hard.
    //
    // So box 0 shows `de Auto` and says so — that card is an introduction, and
    // being able to answer it is the point. From box 1 the article is gone and
    // the noun stands alone, which is the actual retrieval. This is the same
    // shape as every other deck here: `gloss` → `listen` → `cloze` escalates as
    // the memory strengthens rather than asking the hardest question on day one.
    const teaching = box === 0;
    return {
      ...base,
      // The article always reaches the feedback line, whichever rung this is.
      lemma: joinArticle(item.article, item.lb),
      mode: 'choice',
      instruction: teaching ? 'Meet this word — which gender is it?' : 'What gender is this word?',
      prompt: {
        word: teaching ? joinArticle(item.article, item.lb) : item.lb,
        sentence: item.example?.lb ?? null,
        audioId: playableAudio(item),
      },
      options,
      answer: GENDER_LABELS[item.gender] ?? item.gender,
    };
  }

  const options = shuffle(
    item.options_lb.map((form, index) => ({ id: `${item.id}:${index}`, value: form, correct: index === item.correct })),
    random,
  );
  const answer = item.options_lb[item.correct];

  // Whole-sentence items: the options *are* sentences, so there is no gap to
  // draw and the prompt carries the instruction alone. The gloss, where the
  // deck has one, is the only thing worth showing above them.
  if (SENTENCE_KINDS.has(item.kind)) {
    return {
      ...base,
      mode: 'choice',
      instruction: SENTENCE_INSTRUCTIONS[item.kind] ?? 'Which order is right?',
      // Nothing above the options: the options *are* the sentence, three ways.
      // `hideBody` rather than falling through to the empty-prompt case, which
      // renders a blank heading to reserve space for a listening card.
      prompt: { hideBody: true, audioId: null },
      options,
      answer,
    };
  }

  // "Does this verb take hunn or sinn?" — no sentence at all, just the verb.
  if (item.kind === 'perfect-aux') {
    return {
      ...base,
      mode: 'choice',
      instruction: 'Which auxiliary does this verb use in the past?',
      prompt: { word: item.lb, sentence: item.en ? `to ${item.en.replace(/^to /, '')} — past participle ${item.participle}` : null, audioId: null },
      options,
      answer,
    };
  }

  // "How is this number said?" — the value is the whole prompt. There is no
  // sentence to gap, on purpose: see `numberItems` in build-grammar.js for why
  // gapping a numeral out of a sentence cannot be answered.
  if (item.kind === 'numbers') {
    return {
      ...base,
      mode: 'choice',
      instruction: 'How is this number said?',
      prompt: { word: String(item.value), audioId: null },
      options,
      answer,
    };
  }

  return {
    ...base,
    mode: 'choice',
    instruction: GRAMMAR_INSTRUCTIONS[item.kind] ?? 'Which form fits this sentence?',
    prompt: { subject: clozeSubject(item), cloze: { before: item.before, after: item.after }, audioId: null },
    options,
    answer,
  };
}

/**
 * What the gap is actually asking for, named above the sentence.
 *
 * A gapped sentence is only answerable when the card determines the answer.
 * Two kinds were failing that and were pure guesses:
 *
 *   `perfect-form` offered four participles *of four different verbs* and
 *     never said which verb was meant — even though the item has carried
 *     `infinitive` and `en` all along. Naming the verb turns "guess the idiom"
 *     into "form this verb's participle", which is the exercise it was for.
 *
 *   `dative` offered four dative pronouns naming four different people, with
 *     nothing on the card to say whose. The person is recoverable from the
 *     answer through the same table the dative game uses, so the card can ask
 *     it the way that game does: preposition plus person.
 *
 * The remaining kinds do not need this: their options are forms of one word
 * (`nrule`, `adjective`), so only the grammar tells them apart, and that is
 * exactly the thing being taught.
 */
function clozeSubject(item) {
  if (item.kind === 'perfect-form' && item.infinitive) {
    return item.en ? `${item.infinitive} · ${item.en}` : item.infinitive;
  }
  if (item.kind === 'dative' && item.preposition) {
    const answer = item.options_lb?.[item.correct]?.toLowerCase();
    const row = DATIVE_BY_FORM.get(answer);
    if (row) return `${item.preposition} + ${row.nom} · ${row.en}`;
  }
  return null;
}

/**
 * Dative pronoun back to the person it belongs to.
 *
 * The same eight rows the "Change the word" game teaches from, kept here so a
 * grammar card can name the person the gap wants. Listed by dative form, first
 * row wins — `him` is the dative of both hien and hatt, and either reading
 * answers the card.
 */
const DATIVE_BY_FORM = new Map(
  [
    { nom: 'ech', en: 'I', dat: 'mir' },
    { nom: 'du', en: 'you', dat: 'dir' },
    { nom: 'hien', en: 'he', dat: 'him' },
    { nom: 'si', en: 'she', dat: 'hir' },
    { nom: 'mir', en: 'we', dat: 'eis' },
    { nom: 'dir', en: 'you (plural)', dat: 'iech' },
    { nom: 'si', en: 'they', dat: 'hinnen' },
  ].map((row) => [row.dat, row]),
);

/** What each whole-sentence card asks. Naming the actual question beats
 * "which order is right?" three different ways. */
const SENTENCE_INSTRUCTIONS = {
  wordorder: 'Where does the verb go?',
  bracket: 'Where does the second half of the verb go?',
  subclause: 'Where does the verb go after datt / ob?',
  negation: 'Where does net go?',
  likes: 'Where does gär (or gären) go?',
};

/** What the gapped-sentence grammar cards ask. */
const GRAMMAR_INSTRUCTIONS = {
  nrule: 'Which spelling is correct here (the Eifeler Regel)?',
  adjective: 'Which form of the word fits this sentence?',
  'perfect-form': 'Which past participle belongs to the verb named above?',
  dative: 'Which form of that person goes after the preposition?',
};

/** The recording to offer, or null when it is not mirrored yet. */
function playableAudio(item) {
  return has.audio(item) ? item.example.audioId : null;
}

/**
 * An article and its noun, spaced the way Luxembourgish writes them.
 *
 * `de` takes a space; `d'` elides straight onto the word. LOD stores the two
 * forms in the same field, and joining both with a space rendered 592 of the
 * 1,173 nouns in the vocab deck — and 582 of the gender exercises — as
 * "d' Fra" rather than "d'Fra", on the gloss card, in every reverse-card
 * option, and in the answer shown after a miss. A drill for an exam that
 * scores written accuracy should not be the thing teaching the wrong spacing.
 *
 * Exported: the gender-sort game writes the same pair and has to write it the
 * same way.
 */
export function joinArticle(article, word) {
  if (!article) return word;
  return article.endsWith('’') || article.endsWith("'") ? `${article}${word}` : `${article} ${word}`;
}

function withArticle(item, deck, lemma) {
  return joinArticle(deck.article(item), lemma);
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
