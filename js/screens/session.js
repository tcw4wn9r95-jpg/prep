/**
 * A session — the screen behind every "carry on" button in the app.
 *
 * The deck screens (`#/vocab`, `#/verbs`, `#/phrases`) each drill one file.
 * That is a useful thing to be able to ask for, and a terrible default: it
 * makes the learner choose between three decks before they can answer a single
 * question, and the honest answer to "which one?" is "whichever holds the next
 * word you have not met", which is not something they can be expected to know.
 *
 * So this screen asks for nothing. It takes the next cards across all three
 * decks in path order — the sentence skeleton, then the verbs that carry a
 * sentence, then everything else by how often it actually occurs — and starts.
 *
 *   #/session      the next cards, wherever they are
 *   #/session/1    the same, restricted to one stage of the path
 */

import { loadVocab, loadVerbs, loadPhrases, loadStages } from '../content.js';
import { getLearnDeckStates, buildMixedSession } from '../store.js';
import { DECKS, isDrillable, boxIndex } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';

const SESSION_SIZE = 12;

export async function render(root, { params, settings, navigate }) {
  const stage = params?.[0] ? Number(params[0]) : null;
  const [vocab, verbs, phrases, stages, vocabStates, verbStates, phraseStates] = await Promise.all([
    loadVocab(),
    loadVerbs(),
    loadPhrases(),
    loadStages(),
    getLearnDeckStates(settings.playerId, 'vocab'),
    getLearnDeckStates(settings.playerId, 'verb'),
    getLearnDeckStates(settings.playerId, 'phrase'),
  ]);

  // A few LOD entries carry no English gloss, so there is nothing to ask about
  // them in either direction. They stay in the data and out of the drill.
  const groups = [
    { deck: DECKS.vocab, items: vocab, states: vocabStates },
    { deck: DECKS.verb, items: verbs, states: verbStates },
    { deck: DECKS.phrase, items: phrases, states: phraseStates },
  ].map((group) => {
    const drillable = group.items.filter((item) => isDrillable(item, group.deck.id));
    return {
      ...group,
      // Distractors come from the whole deck even in a stage session: four
      // options drawn from twenty-eight starter words would repeat constantly.
      pool: drillable,
      items: stage === null ? drillable : drillable.filter((item) => item.stage === stage),
    };
  });

  const named = stages.find((candidate) => candidate.n === stage) ?? null;
  const title = named ? named.title : 'Practice';
  const again = stage === null ? '#/session' : `#/session/${stage}`;
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  const plan = buildMixedSession(groups, { limit: SESSION_SIZE });
  if (plan.length === 0) return nothingDue({ root, title, back: '#/learn', navigate, total });

  const boxes = new Map();
  for (const group of groups) boxIndex(group.deck.id, group.states, boxes);

  return runSession({
    root,
    plan,
    boxes,
    settings,
    navigate,
    title,
    sub: `${plan.length} cards${named ? ` · step ${named.n} of the path` : ''}`,
    back: '#/learn',
    again,
  });
}
