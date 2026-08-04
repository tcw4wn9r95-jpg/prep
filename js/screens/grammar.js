/**
 * Grammar — noun gender, the n-rule, and adjective agreement, drilled on
 * their own rather than only as the reserved slice of the mixed session.
 *
 * Same engine as the other decks; every item is one of three exercise kinds
 * built by pipeline/build-grammar.js, never authored here — see its header
 * for the rule this deck exists to hold to.
 */

import { loadGrammar } from '../content.js';
import { getLearnDeckStates, buildSession, newWordsLeftToday } from '../store.js';
import { DECKS, isDrillable, boxIndex } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';

const SESSION_SIZE = 10;

export async function render(root, { settings, navigate }) {
  const [everything, states, newLeft] = await Promise.all([
    loadGrammar(),
    getLearnDeckStates(settings.playerId, 'grammar'),
    newWordsLeftToday(settings.playerId),
  ]);

  const all = everything.filter((item) => isDrillable(item, 'grammar'));
  const plan = buildSession(all, states, { limit: SESSION_SIZE, newTarget: newLeft });
  if (plan.length === 0) return nothingDue({ root, title: 'Grammar', back: '#/learn', navigate, total: all.length, capped: newLeft === 0 });

  return runSession({
    root,
    plan,
    deck: DECKS.grammar,
    pool: all,
    boxes: boxIndex('grammar', states),
    settings,
    navigate,
    title: 'Grammar',
    sub: `${plan.length} cards`,
    back: '#/learn',
    again: '#/grammar',
  });
}
