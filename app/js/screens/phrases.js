/**
 * Phrases — the sentence frames an A2 interview is actually made of.
 *
 * Single words are not what makes someone sound like they can speak. The fixed
 * chunks a speaker reaches for whole — *ech hunn…*, *ech war…*, *et gëtt…* —
 * are what a rater responds to, and a candidate who has twelve of them and
 * slots nouns in will be understood where one with four hundred nouns and no
 * frames will not.
 *
 * Same engine as the other two decks. Every frame is attested in LOD's own
 * recorded example sentences (pipeline/build-phrases.js), never authored.
 */

import { loadPhrases } from '../content.js';
import { getLearnDeckStates, buildSession } from '../store.js';
import { DECKS, isDrillable, boxIndex } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';

const SESSION_SIZE = 10;

export async function render(root, { settings, navigate }) {
  const [everything, states] = await Promise.all([
    loadPhrases(),
    getLearnDeckStates(settings.playerId, 'phrase'),
  ]);

  const all = everything.filter((item) => isDrillable(item, 'phrase'));
  const plan = buildSession(all, states, { limit: SESSION_SIZE });
  if (plan.length === 0) return nothingDue({ root, title: 'Phrases', back: '#/learn', navigate, total: all.length });

  return runSession({
    root,
    plan,
    deck: DECKS.phrase,
    pool: all,
    boxes: boxIndex('phrase', states),
    settings,
    navigate,
    title: 'Phrases',
    sub: `${plan.length} cards`,
    back: '#/learn',
    again: '#/phrases',
  });
}

