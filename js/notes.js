/**
 * Speaking notes — the questions and model answers from the course documents,
 * as flash cards.
 *
 * The exam interview is two examiners asking questions and you answering out
 * loud, so the practice that matches it is: see the question, say your answer,
 * *then* look at the model. That order is the whole point — the answer on the
 * back is only worth anything if you tried to produce your own first, and it
 * is why the card does not show it until asked.
 *
 * ## Where the content comes from
 *
 * `content/hand-authored/speaking-notes.json`, built by `pipeline/build-notes.js`
 * from documents the learner supplied. Every line is verbatim: it is **not**
 * LOD-derived and not validated against LOD, so a spelling can differ from the
 * dictionary. The cards say whose words they are rather than presenting them as
 * a reference.
 *
 * ## What a card is
 *
 *   q        the question, in Luxembourgish, as the document wrote it
 *   answers  the model answer(s) — zero when the document has none
 *   notes    English glosses and reminders that annotate the question
 *   hint_en  for a section card (describing a picture), the prompt in English
 *
 * A question with no model answer is still a question you will be asked, so it
 * stays practisable; what changes is the back of the card, which says so.
 */

import { seeded, shuffle } from './sentences.js';

/** How many cards one round deals. */
export const ROUND = 10;

/** The topic id of the picture-description cards. It is not one of the 18 exam topics. */
export const IMAGE = 'image';

/** Practise across every topic at once. */
export const MIX = 'all';

/** The settings keys this feature keeps. */
export const GOT_KEY = 'notesGot';
export const ALL_KEY = 'notesAll';

export const hasAnswer = (card) => (card.answers ?? []).length > 0;

/**
 * The cards a round can draw from.
 *
 * `withNoAnswer` is off by default: a card you cannot check against anything is
 * a worse flash card, and "press to see the answer" is what was asked for. It is
 * a switch, not a removal, because those are real exam questions.
 */
export function poolFor(deck, topic, { withNoAnswer = false, flagged = new Set() } = {}) {
  return (deck.cards ?? []).filter((card) => {
    if (topic !== MIX && card.topic !== topic) return false;
    if (flagged.has(`speaking-notes:${card.id}`)) return false;
    return withNoAnswer || hasAnswer(card);
  });
}

/**
 * A round: what you have not got yet, then the rest to top up.
 *
 * Seeded on how many of this topic you have got, so a round does not repeat
 * itself the moment you finish it, and leaving mid-round and coming back does
 * not reshuffle the same cards into a different ten.
 */
export function buildRound(pool, got, { size = ROUND, seed = 'notes' } = {}) {
  const have = got instanceof Set ? got : new Set(got ?? []);
  if (pool.length === 0) return [];
  const random = seeded(seed);
  const fresh = shuffle(pool.filter((card) => !have.has(card.id)), random);
  const again = shuffle(pool.filter((card) => have.has(card.id)), random);
  return [...fresh, ...again].slice(0, size);
}

/**
 * How far through each topic you are.
 *
 * `total` counts the questions with a model answer — the ones the default round
 * can ask — and `open` the ones with none yet, so the screen can say what is
 * still waiting on a document.
 */
export function progress(deck, got, { flagged = new Set() } = {}) {
  const have = got instanceof Set ? got : new Set(got ?? []);
  const rows = new Map();
  for (const card of deck.cards ?? []) {
    if (flagged.has(`speaking-notes:${card.id}`)) continue;
    const row = rows.get(card.topic) ?? { id: card.topic, total: 0, open: 0, got: 0 };
    if (hasAnswer(card)) {
      row.total += 1;
      if (have.has(card.id)) row.got += 1;
    } else {
      row.open += 1;
    }
    rows.set(card.topic, row);
  }

  const titles = new Map((deck.topics ?? []).map((topic) => [topic.id, topic]));
  return [...rows.values()]
    .map((row) => ({ ...row, title_en: titles.get(row.id)?.title_en ?? row.id, title_lb: titles.get(row.id)?.title_lb ?? row.id }))
    // Describing a picture is part 2b of the exam rather than one of the
    // interview topics, so it leads; the rest are alphabetical, which is the one
    // order a person can find a topic in.
    .sort((a, b) => (b.id === IMAGE) - (a.id === IMAGE) || a.title_en.localeCompare(b.title_en));
}

/** Everything the learner has got, across topics, for the "Mix" round. */
export const gotIn = (rows) => rows.reduce((sum, row) => sum + row.got, 0);

/**
 * What to show on the back of a card.
 *
 * Kept as a function so the screen and the tests agree on the one decision that
 * is not obvious: a card with no answer has a back, and it says so, rather than
 * a button that reveals nothing.
 */
export function backOf(card) {
  return {
    answers: card.answers ?? [],
    notes: card.notes ?? [],
    empty: !hasAnswer(card),
  };
}

/**
 * The queue for one sitting. A card you mark "not yet" is dealt once more at the
 * end of the round, and only once — a round that can never finish is not a round.
 */
export function queueFor(plan) {
  const queue = [...plan];
  const retried = new Set();
  return {
    get length() {
      return queue.length;
    },
    next: () => queue.shift() ?? null,
    again(card) {
      if (retried.has(card.id)) return false;
      retried.add(card.id);
      queue.push(card);
      return true;
    },
    remaining: () => queue.length,
  };
}
