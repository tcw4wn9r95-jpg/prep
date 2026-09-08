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

import { loadVocab, loadVerbs, loadPhrases, loadGrammar, loadStages } from '../content.js';
import { getLearnDeckStates, buildMixedSession, listMistakes, mistakeEntryKeys , flaggedCards } from '../store.js';
import { boxIndex } from '../drill/cards.js';
import { unitGroups, SESSION_SIZE } from '../drill/plan.js';
import { runSession, nothingDue } from '../drill/engine.js';

export async function render(root, { params, settings, navigate }) {
  const stage = params?.[0] ? Number(params[0]) : null;
  const [vocab, verbs, phrases, grammar, stages, vocabStates, verbStates, phraseStates, grammarStates, mistakeRows, flagged] = await Promise.all([
    loadVocab(),
    loadVerbs(),
    loadPhrases(),
    loadGrammar(),
    loadStages(),
    getLearnDeckStates(settings.playerId, 'vocab'),
    getLearnDeckStates(settings.playerId, 'verb'),
    getLearnDeckStates(settings.playerId, 'phrase'),
    getLearnDeckStates(settings.playerId, 'grammar'),
    listMistakes(settings.playerId),
    flaggedCards(settings.playerId),
  ]);
  const mistakes = mistakeEntryKeys(mistakeRows);

  // A few LOD entries carry no English gloss, so there is nothing to ask about
  // them in either direction. They stay in the data and out of the drill.
  //
  // What a session is made of lives in `drill/plan.js` — the reserves, the
  // gender cap, and which verbs a unit may reach for. It is out of this screen
  // because it is the part that keeps being wrong and the part that could not
  // be tested from here: this module cannot be imported outside a browser, so
  // the only way to see a session's shape was to sit through one.
  const { groups, options } = unitGroups({
    vocab,
    verbs,
    phrases,
    grammar,
    states: { vocab: vocabStates, verb: verbStates, phrase: phraseStates, grammar: grammarStates },
    stage,
  });

  const named = stages.find((candidate) => candidate.n === stage) ?? null;
  const title = named ? named.title : 'Practice';
  const again = stage === null ? '#/session' : `#/session/${stage}`;
  // The four real decks; the structure and gender groups that follow them are
  // slices of grammar and would double-count.
  const decks = groups.slice(0, 4);
  const total = decks.reduce((sum, group) => sum + group.items.length, 0);

  const plan = buildMixedSession(groups, {
    limit: SESSION_SIZE,
    ...options,
    mistakes,
    flagged,
  });
  if (plan.length === 0) return nothingDue({ root, title, back: '#/learn', navigate, total });

  const boxes = new Map();
  for (const group of decks) boxIndex(group.deck.id, group.states, boxes);

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
