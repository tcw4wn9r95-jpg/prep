/**
 * What a unit session is made of.
 *
 * Split out of `screens/session.js` because it is the part with the bugs in
 * it. Three separate reports have been about proportion rather than about any
 * individual card — too many number questions, then too many gender questions,
 * and in between a whole unit whose sessions were quietly two thirds shorter
 * than the limit. Every one of them was invisible to the tests, because the
 * only way to see a session's *shape* was to sit through one.
 *
 * Nothing here touches the DOM, so `pipeline/test/mix.test.js` can build the
 * real groups from the real decks and measure what comes out.
 */

import { DECKS, isDrillable, isStructure, isNumberCard, isGender } from './cards.js';

export const SESSION_SIZE = 12;

/**
 * Grammar's guaranteed share of every session — "mandatory every day" made
 * true by construction rather than by hoping it wins the shuffle against a
 * much bigger vocab+verb+phrase pool. A quarter of the session, not all of
 * it: this deck is a complement to the others, not a replacement.
 */
export const GRAMMAR_RESERVE = 3;

/**
 * Sentence structure, guaranteed in every mixed session.
 *
 * Word order is the thing an English speaker gets wrong most and the thing
 * Morphosyntax is scored on, so it cannot be left to win a shuffle against a
 * 4,000-item pool. The grammar reserve alone does not do it: grammar is a
 * dozen kinds, and three reserved cards spread across all of them means a
 * structure card turns up about a third of the time.
 *
 * `STRUCTURE_CARDS_GOAL` in screens/today.js is set to match this, so a
 * learner who simply does their daily sessions ticks that box without making
 * a separate errand of it. Changing one means changing the other.
 */
export const STRUCTURE_RESERVE = 3;

/**
 * The most gender cards one session may contain.
 *
 * Reported as "I see a lot of questions about guessing the gender, let's not
 * over index on this. I'd rather improve my vocabulary and learn how to
 * properly conjugate as my goal is the exam." Measured before changing
 * anything, a unit-3 session was **53% gender** — because unit 3's only
 * grammar kind is gender, and gender is 1,134 cards against that unit's 150
 * new words, so it did not merely win a share of the general pool, it was the
 * general pool.
 *
 * A ceiling rather than a smaller deck: der/déi/dat is genuinely marked under
 * Morphosyntax and the cards are sound, there were simply far too many at
 * once. The freed slots are not reallocated anywhere — they fall through to
 * whatever else is due, which in every unit is mostly vocabulary.
 */
export const GENDER_CAP = 2;

/**
 * The verbs a unit session may draw on.
 *
 * The path has no verbs at all at stage 3 — 60 at stage 2, then nothing until
 * stage 4 — so a unit-3 session contained no conjugation whatsoever, which is
 * half of what was asked for more of. Vocabulary is a list that moves on; the
 * six present-tense endings are a skill that has to keep being used, and a
 * unit with no verb step of its own is a gap in the practice rather than a
 * decision that conjugation stops mattering that week.
 *
 * Only when the unit has none of its own, and only the verb deck. A unit that
 * does teach verbs keeps to its own: carrying earlier ones in unconditionally
 * makes every later unit mostly revision, which is the same over-indexing
 * complaint pointing the other way — measured, it took unit 7 to 49% verbs.
 */
export function carriedVerbs(items, stage) {
  if (stage === null) return { items, carried: false };
  const own = items.filter((item) => item.stage === stage);
  if (own.length > 0) return { items: own, carried: false };
  return { items: items.filter((item) => (item.stage ?? 99) < stage), carried: true };
}

/**
 * How many carried verbs one session may hold.
 *
 * Carrying them in uncapped does not top a unit up with conjugation, it hands
 * the unit over: new cards are drawn in path order, so every carried verb —
 * being from an earlier stage — sorts ahead of every word the unit is actually
 * teaching. Measured, unit 3 came out 47% verbs against 40% vocabulary, which
 * inverts the unit whose whole point is 150 everyday words.
 *
 * Three is a trickle that keeps the six endings in use without displacing the
 * unit. A unit with verbs of its own is not capped: there the verbs *are* the
 * material.
 */
export const CARRIED_VERB_CAP = 3;

/**
 * The groups `buildMixedSession` should be handed for one unit.
 *
 * `stage` is the unit number, or null for "anything due".
 *
 * @returns {{groups: Array, options: {reserve: object, caps: object}}}
 */
export function unitGroups({ vocab, verbs, phrases, grammar, states, stage = null }) {
  let carryingVerbs = false;
  const groups = [
    { deck: DECKS.vocab, items: vocab, states: states.vocab },
    { deck: DECKS.verb, items: verbs, states: states.verb },
    { deck: DECKS.phrase, items: phrases, states: states.phrase },
    { deck: DECKS.grammar, items: grammar, states: states.grammar },
  ].map((group) => {
    // Number cards have their own screen now (`screens/numbers.js`) and are
    // kept out of the daily mix. They were 147 of unit 2's 227 grammar items,
    // so a unit-2 session was mostly numbers whatever else was due.
    const drillable = group.items.filter(
      (item) => isDrillable(item, group.deck.id) && !(group.deck.id === 'grammar' && isNumberCard(item)),
    );
    let onUnit;
    if (group.deck.id === 'verb') {
      const verbsForUnit = carriedVerbs(drillable, stage);
      carryingVerbs = verbsForUnit.carried;
      onUnit = verbsForUnit.items;
    } else {
      onUnit = stage === null ? drillable : drillable.filter((item) => item.stage === stage);
    }
    return {
      ...group,
      // Distractors come from the whole deck even in a stage session: four
      // options drawn from twenty-eight starter words would repeat constantly.
      pool: drillable,
      items: onUnit,
    };
  });

  const grammarGroup = groups[3];

  // Sentence structure and gender are slices of the grammar deck handed in as
  // their own groups. They share the deck's Leitner rows but are counted
  // separately, so one can be reserved and the other capped.
  const structureGroup = {
    deck: DECKS.grammar,
    items: grammarGroup.items.filter(isStructure),
    states: states.grammar,
    pool: grammarGroup.pool,
    reserveId: 'structure',
  };
  const genderGroup = {
    deck: DECKS.grammar,
    items: grammarGroup.items.filter(isGender),
    states: states.grammar,
    pool: grammarGroup.pool,
    reserveId: 'gender',
  };
  // Taken out of the grammar group as well, or the cap would only see the
  // gender group's copies and the rest would arrive as plain `grammar`.
  groups[3] = { ...grammarGroup, items: grammarGroup.items.filter((item) => !isGender(item)) };

  return {
    groups: [...groups, structureGroup, genderGroup],
    options: {
      reserve: { grammar: GRAMMAR_RESERVE, structure: STRUCTURE_RESERVE },
      // Verbs borrowed from an earlier unit are capped; a unit's own verbs are
      // not. See `CARRIED_VERB_CAP`.
      caps: carryingVerbs ? { gender: GENDER_CAP, verb: CARRIED_VERB_CAP } : { gender: GENDER_CAP },
    },
  };
}
