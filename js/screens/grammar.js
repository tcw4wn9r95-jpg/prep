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
 *   #/grammar/gender      one kind, for when its notecard has just been read
 *
 * Every kind in GRAMMAR_KINDS has a filter, because each notecard that has a
 * deck behind it links to its own kind — a "practise this" button under the
 * gender card that ran the whole mixed deck would not be practising that.
 */

import { loadGrammar } from '../content.js';
import { getLearnDeckStates, buildSession, listMistakes, mistakeEntryKeys , flaggedCards } from '../store.js';
import { DECKS, isDrillable, boxIndex, isStructure, isNumberCard, GRAMMAR_KINDS } from '../drill/cards.js';
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
    GRAMMAR_KINDS.map((kind) => [kind, { title: topicFor(kind)?.title ?? 'Grammar', match: (item) => item.kind === kind }]),
  ),
};

/**
 * Where the back chevron goes, by which filter is running.
 *
 * The three structure kinds belong to the structure screen, which is where
 * they are introduced and where their progress is shown. Every other kind is
 * reached from its notecard, so that is where back should return you.
 */
function backFor(name, filter) {
  if (!filter) return '#/learn';
  if (name === 'structure' || isStructure({ kind: name })) return '#/structure';
  const topic = topicFor(name);
  return topic ? `#/notecards/${topic.id}` : '#/learn';
}

export async function render(root, { params, settings, navigate }) {
  const filter = FILTERS[params?.[0]] ?? null;
  const [everything, states, mistakeRows, flagged] = await Promise.all([
    loadGrammar(),
    getLearnDeckStates(settings.playerId, 'grammar'),
    listMistakes(settings.playerId),
    flaggedCards(settings.playerId),
  ]);

  // Number cards are drilled at #/numbers now, so the general deck leaves them
  // out — they were two thirds of unit 2 and drowned everything else in it. An
  // explicit `#/grammar/numbers` filter still reaches them, because the
  // notecard's "practise this" button links to exactly that and a link that
  // silently ran a different deck would be worse than no link.
  const drillable = everything.filter((item) => isDrillable(item, 'grammar'));
  const all = filter ? drillable.filter(filter.match) : drillable.filter((item) => !isNumberCard(item));
  const title = filter ? filter.title : 'Grammar';
  const again = filter ? `#/grammar/${params[0]}` : '#/grammar';
  // Back goes wherever this session was most likely started from: the
  // structure screen for the three word-order kinds it owns, and otherwise the
  // notecard whose "practise this" button links here, so reading the theory
  // and drilling it is a loop rather than a one-way trip.
  const back = backFor(params?.[0], filter);
  // Distractors still come from the whole deck. A three-option word-order card
  // builds its options from the sentence itself, but the gapped kinds look for
  // plausible wrong answers, and 98 subclause items is a thin pool to draw
  // from before they start repeating.
  const plan = buildSession(all, states, { limit: SESSION_SIZE, deckId: 'grammar', mistakes: mistakeEntryKeys(mistakeRows), flagged });
  if (plan.length === 0) {
    return nothingDue({ root, title, back, navigate, total: all.length });
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
    back,
    again,
  });
}
