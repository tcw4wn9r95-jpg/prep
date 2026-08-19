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
import { getLearnDeckStates, buildMixedSession, newWordsLeftToday, newWordGoal, listMistakes, mistakeEntryKeys , flaggedCards } from '../store.js';
import { DECKS, isDrillable, boxIndex, isStructure } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';

const SESSION_SIZE = 12;
// Grammar's guaranteed share of every session — "mandatory every day" made
// true by construction rather than by hoping it wins the shuffle against a
// much bigger vocab+verb+phrase pool. A quarter of the session, not all of
// it: this deck is a complement to the others, not a replacement.
const GRAMMAR_RESERVE = 3;

/**
 * Sentence structure, guaranteed in every mixed session.
 *
 * Word order is the thing an English speaker gets wrong most and the thing
 * Morphosyntax is scored on, so it cannot be left to win a shuffle against a
 * 4,000-item pool. The grammar reserve alone does not do it: grammar is nine
 * kinds now, and three reserved cards spread across all of them means a
 * structure card turns up about a third of the time.
 *
 * These are drawn from the same daily new-word budget as everything else, so
 * this changes *which* cards a session contains, never how many new things it
 * introduces.
 */
const STRUCTURE_RESERVE = 3;

export async function render(root, { params, settings, navigate }) {
  const stage = params?.[0] ? Number(params[0]) : null;
  const [vocab, verbs, phrases, grammar, stages, vocabStates, verbStates, phraseStates, grammarStates, newLeft, mistakeRows, flagged] = await Promise.all([
    loadVocab(),
    loadVerbs(),
    loadPhrases(),
    loadGrammar(),
    loadStages(),
    getLearnDeckStates(settings.playerId, 'vocab'),
    getLearnDeckStates(settings.playerId, 'verb'),
    getLearnDeckStates(settings.playerId, 'phrase'),
    getLearnDeckStates(settings.playerId, 'grammar'),
    newWordsLeftToday(settings.playerId, { target: newWordGoal(settings) }),
    listMistakes(settings.playerId),
    flaggedCards(settings.playerId),
  ]);
  const mistakes = mistakeEntryKeys(mistakeRows);

  // A few LOD entries carry no English gloss, so there is nothing to ask about
  // them in either direction. They stay in the data and out of the drill.
  const groups = [
    { deck: DECKS.vocab, items: vocab, states: vocabStates },
    { deck: DECKS.verb, items: verbs, states: verbStates },
    { deck: DECKS.phrase, items: phrases, states: phraseStates },
    { deck: DECKS.grammar, items: grammar, states: grammarStates },
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

  // Grammar now carries a stage too (content.js `withGrammarOrder`), keyed to
  // its level — so a stage-4 or stage-5 session includes the grammar of that
  // level rather than excluding it for want of the field, and stages 1–3, the
  // sentence skeleton, stay pure vocabulary. The reserve still guarantees
  // grammar a share of the general session.
  // `newTarget` is what is left of today's budget, not a fresh allowance —
  // otherwise quitting a session and starting another buys eight more new
  // words, as many times as you care to do it.
  // Sentence structure is its own reserved group so it cannot be crowded out
  // by the other six grammar kinds sharing one deck id.
  const structureGroup = {
    deck: DECKS.grammar,
    items: groups[3].items.filter(isStructure),
    states: grammarStates,
    pool: groups[3].pool,
    reserveId: 'structure',
  };

  const plan = buildMixedSession([...groups, structureGroup], {
    limit: SESSION_SIZE,
    newTarget: newLeft,
    reserve: { grammar: GRAMMAR_RESERVE, structure: STRUCTURE_RESERVE },
    mistakes,
    flagged,
  });
  if (plan.length === 0) return nothingDue({ root, title, back: '#/learn', navigate, total, capped: newLeft === 0 });

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
