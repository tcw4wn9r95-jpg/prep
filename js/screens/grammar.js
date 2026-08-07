/**
 * Grammar — noun gender, the n-rule, adjective agreement and sentence
 * structure, drilled on their own rather than only as the reserved slice of
 * the mixed session.
 *
 * Same engine as the other decks; every item is one of nine exercise kinds
 * built by pipeline/build-grammar.js, never authored here — see its header
 * for the rule this deck exists to hold to.
 *
 *   #/grammar             the whole deck
 *   #/grammar/structure   the three sentence-structure kinds
 *   #/grammar/wordorder   one kind, for when the theory has just been read
 */

import { loadGrammar } from '../content.js';
import { getLearnDeckStates, buildSession, newWordsLeftToday } from '../store.js';
import { DECKS, isDrillable, boxIndex, isStructure, STRUCTURE_KINDS } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';
import { topicFor } from '../grammar-guide.js';

const SESSION_SIZE = 10;

/**
 * The filters `#/grammar/<name>` accepts, and what each one is called on
 * screen. A name that is not here falls through to the whole deck rather than
 * to an empty session — an unknown filter should give you grammar practice,
 * not a dead end.
 */
const FILTERS = {
  structure: { title: 'Sentence structure', match: isStructure },
  ...Object.fromEntries(
    STRUCTURE_KINDS.map((kind) => [kind, { title: topicFor(kind)?.title ?? 'Grammar', match: (item) => item.kind === kind }]),
  ),
};

export async function render(root, { params, settings, navigate }) {
  const filter = FILTERS[params?.[0]] ?? null;
  const [everything, states, newLeft] = await Promise.all([
    loadGrammar(),
    getLearnDeckStates(settings.playerId, 'grammar'),
    newWordsLeftToday(settings.playerId),
  ]);

  const drillable = everything.filter((item) => isDrillable(item, 'grammar'));
  const all = filter ? drillable.filter(filter.match) : drillable;
  const title = filter ? filter.title : 'Grammar';
  const again = filter ? `#/grammar/${params[0]}` : '#/grammar';
  // Distractors still come from the whole deck. A three-option word-order card
  // builds its options from the sentence itself, but the gapped kinds look for
  // plausible wrong answers, and 98 subclause items is a thin pool to draw
  // from before they start repeating.
  const plan = buildSession(all, states, { limit: SESSION_SIZE, newTarget: newLeft });
  if (plan.length === 0) {
    return nothingDue({ root, title, back: filter ? '#/structure' : '#/learn', navigate, total: all.length, capped: newLeft === 0 });
  }

  return runSession({
    root,
    plan,
    deck: DECKS.grammar,
    pool: drillable,
    boxes: boxIndex('grammar', states),
    settings,
    navigate,
    title,
    sub: `${plan.length} cards`,
    back: filter ? '#/structure' : '#/learn',
    again,
  });
}
