/**
 * Numbers — the number cards, on their own.
 *
 * ## Why this screen exists
 *
 * It was carved out of the grammar deck rather than written. Unit 2's grammar
 * was two kinds, `numbers` (22 items) and `heard` (205) — and 125 of those
 * `heard` items have `subject: 'number'`. So roughly two thirds of the unit's
 * grammar deck was already about numbers, and `orderGrammar`'s interleave,
 * which gives every kind one item per round regardless of how many it has,
 * handed the 22-item kind half of the turns on top of that. Twenty-two items
 * taking half the turns is twenty-two items you meet over and over.
 *
 * Reported as "lately I get too many number questions". The cards were not the
 * problem; the mix was. Giving them a screen fixes both halves at once: the
 * grammar drill stops being mostly numbers (see `isNumberCard` in cards.js and
 * the two screens that filter on it), and numbers become something you can go
 * and practise on purpose, which is what they deserve — every price, time and
 * date in the exam is one.
 *
 * ## Why it is not a new deck
 *
 * It runs on `DECKS.grammar` with the grammar deck's own Leitner rows. The
 * items have not moved and their ids have not changed, so everything already
 * recorded about them — boxes, mistakes, flags — still applies. A new deck id
 * would have orphaned all of it and started every number card from zero, which
 * would be a worse answer to "I see these too often" than doing nothing.
 */

import { loadGrammar } from '../content.js';
import { getLearnDeckStates, buildSession, listMistakes, mistakeEntryKeys, flaggedCards } from '../store.js';
import { DECKS, isDrillable, boxIndex, isNumberCard } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';

const SESSION_SIZE = 10;

export async function render(root, { settings, navigate }) {
  const [everything, states, mistakeRows, flagged] = await Promise.all([
    loadGrammar(),
    getLearnDeckStates(settings.playerId, 'grammar'),
    listMistakes(settings.playerId),
    flaggedCards(settings.playerId),
  ]);

  const all = everything.filter((item) => isNumberCard(item) && isDrillable(item, 'grammar'));

  const plan = buildSession(all, states, {
    limit: SESSION_SIZE,
    deckId: 'grammar',
    mistakes: mistakeEntryKeys(mistakeRows),
    flagged,
  });
  if (plan.length === 0) {
    return nothingDue({ root, title: 'Numbers', back: '#/learn', navigate, total: all.length });
  }

  return runSession({
    root,
    plan,
    deck: DECKS.grammar,
    // Distractors are drawn from the number cards alone. That is the point of
    // the exercise: three other numbers to choose between is a real question,
    // where three adjective endings beside a numeral would give the answer away
    // by being obviously the wrong shape.
    pool: all,
    boxes: boxIndex('grammar', states),
    settings,
    navigate,
    title: 'Numbers',
    sub: `${plan.length} cards`,
    back: '#/learn',
    again: '#/numbers',
  });
}
