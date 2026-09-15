/**
 * Adjectives — the word, its opposite, and the two degrees.
 *
 * Five rounds over one deck, because an adjective is five different questions
 * and only one of them is "what does it mean":
 *
 *   meaning      schéin → beautiful
 *   opposite     schéin → ellen
 *   comparative  schéin → méi schéin
 *   superlative  schéin → am schéinsten
 *   comparison   a real sentence that compares two things, with the
 *                adjective taken out of it
 *
 * ## Why the superlative is the one that matters
 *
 * The comparative is a prefix — `méi` in front of the word, every time — so a
 * learner gets it right without knowing anything. The superlative is where
 * Luxembourgish actually does something: `grouss` → `am gréissten`, `blo` →
 * `am bloosten`, `aggressiv` → `am aggressiivsten`. Those stems are LOD's own
 * and the deck quotes them; the wrong answers are other adjectives' real
 * superlatives, so the question is "which stem does this word take" rather
 * than "can you spot the odd one out".
 *
 * ## Comparisons are read, not written
 *
 * "X ass méi ADJ ewéi Y" is a frame, and filling it with a new X and Y would
 * be composing Luxembourgish. So the comparison round uses LOD sentences that
 * already compare two things, gapped — see `pipeline/build-adjectives.js`.
 */

import { seeded, shuffle } from './sentences.js';

/** How many questions one round asks. */
export const ROUND = 10;

/** The rounds, in the order the index offers them. */
export const MODES = [
  {
    id: 'meaning',
    title: 'What does it mean?',
    blurb: 'The adjective, and four English meanings.',
  },
  {
    id: 'opposite',
    title: 'The opposite',
    blurb: 'Every pair a learner is expected to have: big and small, cheap and dear.',
  },
  {
    id: 'comparative',
    title: 'More than',
    blurb: 'The comparative — what LOD writes with méi.',
  },
  {
    id: 'superlative',
    title: 'The most',
    blurb: 'The superlative, where the stem changes: grouss becomes am gréissten.',
  },
  {
    id: 'comparison',
    title: 'Compare two things',
    blurb: 'Real sentences that put one thing against another, with the adjective missing.',
  },
];

export const modeById = (id) => MODES.find((mode) => mode.id === id) ?? null;

/**
 * How much of the deck to practise.
 *
 * 202 adjectives is the comprehensive list that was asked for, and a
 * comprehensive list is the wrong thing to drill against the week before an
 * exam: `perfektionistesch` and `verspaant` turn up once each in the whole
 * corpus, and every question spent on them is a question not spent on `nei` or
 * `kleng`. `rank` is how often LOD's examples actually use the word, so a cut
 * at 50 is "the adjectives you will meet", not a guess.
 *
 * Null is the whole deck, and stays the default — narrowing what somebody
 * already has is their call to make, not the app's.
 */
export const TOPS = [
  { id: 50, label: 'Top 50', blurb: 'The ones that carry most sentences.' },
  { id: 100, label: 'Top 100', blurb: 'Everything common enough to expect.' },
  { id: null, label: 'All', blurb: 'The whole published list.' },
];

/** The stored value read back as one of the above; anything else is "all". */
export const topById = (id) => TOPS.find((top) => top.id === (id ?? null)) ?? TOPS[TOPS.length - 1];

/**
 * The deck a filter leaves, for every round at once.
 *
 * Three things have to move together, which is why this is one function rather
 * than a filter at each call site:
 *
 *   the words        `rank <= top`
 *   the opposites    trimmed to pairs *wholly* inside the set. Asking for the
 *                    opposite of a top-50 word and answering with one that is
 *                    not practised teaches the rarer half by accident — and
 *                    among three familiar decoys the unfamiliar word is
 *                    guessable without being read.
 *   the comparisons  only sentences gapped on a word still in the set.
 *
 * The wrong answers come from the same filtered list too, so "top 50" means the
 * learner reads fifty adjectives, not four times that many with fifty asked
 * about.
 */
export function deckFor(top, items, comparisons) {
  const limit = top ?? null;
  if (limit === null) return { items: items ?? [], comparisons: comparisons ?? [] };

  const kept = (items ?? []).filter((item) => item.rank <= limit);
  const inside = new Set(kept.map((item) => item.id));
  return {
    items: kept.map((item) => ({ ...item, oppositeIds: item.oppositeIds.filter((id) => inside.has(id)) })),
    comparisons: (comparisons ?? []).filter((one) => inside.has(one.adjectiveId)),
  };
}

/** The adjectives a mode can actually ask about, within whatever deck it is given. */
export function poolFor(mode, items, comparisons) {
  if (mode === 'opposite') return (items ?? []).filter((item) => item.oppositeIds?.length > 0);
  if (mode === 'comparison') return comparisons ?? [];
  return items ?? [];
}

/** `méi`, `am`, or nothing — what a degree looks like before you read it. */
const degreeShape = (form) => /^(méi|am)\s/.exec(form ?? '')?.[1] ?? null;

/**
 * Three wrong degrees, drawn to look like the right one.
 *
 * Shape first: a `besser` sitting among three `méi …` is eliminated without
 * being read. The fallback is for `gutt` itself, whose suppletive forms have no
 * shape-mates to be hidden among — the one card in the deck where the answer
 * stands out, and the alternative would be inventing a form to hide it behind.
 */
function decoys(items, item, field, pick) {
  const other = items.filter((one) => one.id !== item.id && one[field] !== item[field]);
  const alike = other.filter((one) => degreeShape(one[field]) === degreeShape(item[field]));
  return pick(alike.length >= 3 ? alike : other, 3).map((one) => one[field]);
}

/**
 * One question.
 *
 * Wrong answers are always the *same kind of thing* as the right one — other
 * adjectives' superlatives for a superlative question, other adjectives for an
 * opposite. An option that is the wrong shape is eliminated without being read,
 * which turns a vocabulary question into a spot-the-format question.
 */
export function questionFor(mode, item, { items, byId, random }) {
  const pick = (list, count) => shuffle(list, random).slice(0, count);

  if (mode === 'meaning') {
    const wrong = pick(items.filter((one) => one.id !== item.id && one.en !== item.en), 3).map((one) => one.en);
    return {
      prompt: item.lb,
      sub: null,
      instruction: 'What does it mean?',
      answer: item.en,
      options: shuffle([item.en, ...wrong], random),
    };
  }

  if (mode === 'opposite') {
    const opposites = new Set(item.oppositeIds);
    const answer = byId.get(item.oppositeIds[0]);
    // Never offer another of this word's own opposites as a wrong answer: an
    // adjective can have two (al is the opposite of jonk and of nei) and both
    // would be right.
    const wrong = pick(
      items.filter((one) => one.id !== item.id && !opposites.has(one.id) && !one.oppositeIds.includes(item.id)),
      3,
    ).map((one) => one.lb);
    return {
      prompt: item.lb,
      sub: item.en,
      instruction: 'Which is the opposite?',
      answer: answer.lb,
      options: shuffle([answer.lb, ...wrong], random),
    };
  }

  // The two degrees are asked from opposite ends on purpose.
  //
  // Asked as `nëtzlech → méi nëtzlech` the comparative is not a question: every
  // option reads `méi <word>` and the learner matches the word they were just
  // shown. So it is asked from the English, where they have to know the word
  // *and* that Luxembourgish builds the comparative with `méi`.
  //
  // The superlative is asked the other way round, from the Luxembourgish,
  // because that is where the language actually does something: `grouss` →
  // `am gréissten`, `aarm` → `am äermsten`. Every option starts `am` and ends
  // `-sten`, so the only thing telling them apart is the stem — which is the
  // thing worth knowing and the thing LOD publishes.
  if (mode === 'comparative') {
    const wrong = decoys(items, item, 'comparative', pick);
    return {
      prompt: `more ${item.en}`,
      sub: null,
      instruction: 'Say it in Luxembourgish',
      answer: item.comparative,
      options: shuffle([item.comparative, ...wrong], random),
    };
  }

  if (mode === 'superlative') {
    const wrong = decoys(items, item, 'superlative', pick);
    return {
      prompt: item.lb,
      sub: item.en,
      instruction: 'Which is "the most …"?',
      answer: item.superlative,
      options: shuffle([item.superlative, ...wrong], random),
    };
  }

  // comparison — `item` is a mined sentence, not an adjective.
  const adjective = byId.get(item.adjectiveId);
  const wrong = pick(items.filter((one) => one.id !== item.adjectiveId && one.lb !== item.form), 3).map((one) => one.lb);
  return {
    prompt: gapped(item),
    sub: null,
    instruction: item.shape === 'as' ? 'Which word makes the two the same?' : 'Which word is being compared?',
    answer: item.form,
    options: shuffle([item.form, ...wrong], random),
    sentence: item.lb,
    audioId: item.audioId ?? null,
    english: adjective?.en ?? null,
  };
}

/**
 * The comparison sentence with the adjective taken out.
 *
 * Cut by offset rather than by replacing the word, because the same adjective
 * can appear twice in one sentence — "ee Bee méi kuerz ewéi dat anert" is
 * fine, but a blind replace on a word like `no` would blank a second
 * occurrence that is not the gap.
 */
export function gapped(comparison) {
  const before = comparison.lb.slice(0, comparison.at);
  const after = comparison.lb.slice(comparison.at + comparison.form.length);
  return { before, after };
}

/**
 * A round: what has not been answered yet, then the rest to top up.
 *
 * Seeded per player and mode, so leaving and coming back does not reshuffle
 * the same ten questions into a different ten.
 */
export function buildRound(mode, pool, done, { size = ROUND, seed = 'adj' } = {}) {
  const seen = done instanceof Set ? done : new Set(done ?? []);
  if (pool.length === 0) return [];
  const key = (one) => `${mode}:${one.id}`;
  const random = seeded(seed);
  const fresh = shuffle(pool.filter((one) => !seen.has(key(one))), random);
  const again = shuffle(pool.filter((one) => seen.has(key(one))), random);
  return [...fresh, ...again].slice(0, size);
}

/** `mode:id`, which is how a finished question is remembered. */
export const doneKey = (mode, item) => `${mode}:${item.id}`;

/** How far through each mode you are. */
export function progress(items, comparisons, done) {
  const seen = done instanceof Set ? done : new Set(done ?? []);
  return MODES.map((mode) => {
    const pool = poolFor(mode.id, items, comparisons);
    const finished = pool.filter((one) => seen.has(doneKey(mode.id, one))).length;
    return { ...mode, total: pool.length, finished };
  });
}
