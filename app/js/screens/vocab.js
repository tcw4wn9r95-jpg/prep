/**
 * Vocabulary — a drill session over the A1/A2 Grondwuertschatz.
 *
 * The session itself is drill/engine.js; this file only decides what goes into
 * it. Optionally scoped to one exam topic via `#/vocab/<topicId>`, which is
 * what makes the foundation work point at the topic you are about to be
 * examined on rather than running alongside it.
 */

import { loadVocab, loadTopics } from '../content.js';
import { getLearnDeckStates, buildSession, newWordsLeftToday, listMistakes, mistakeEntryKeys } from '../store.js';
import { DECKS, isDrillable, boxIndex } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';

const SESSION_SIZE = 12;

export async function render(root, { params, settings, navigate }) {
  const topicId = params?.[0] ?? null;
  const [everything, states, topics, newLeft, mistakeRows] = await Promise.all([
    loadVocab(),
    getLearnDeckStates(settings.playerId, 'vocab'),
    topicId ? loadTopics() : Promise.resolve([]),
    newWordsLeftToday(settings.playerId),
    listMistakes(settings.playerId),
  ]);

  // A few LOD entries carry no English gloss, so there is nothing to ask about
  // them in either direction. They stay in the data and out of the drill.
  const all = everything.filter((item) => isDrillable(item, 'vocab'));
  const pool = topicId ? all.filter((item) => item.topics?.includes(topicId)) : all;
  const topic = topics.find((candidate) => candidate.id === topicId) ?? null;
  const title = topic ? topic.title_en ?? topic.en ?? 'Vocabulary' : 'Vocabulary';
  const again = topicId ? `#/vocab/${encodeURIComponent(topicId)}` : '#/vocab';

  const plan = buildSession(pool, states, { limit: SESSION_SIZE, newTarget: newLeft, deckId: 'vocab', mistakes: mistakeEntryKeys(mistakeRows) });
  if (plan.length === 0) return nothingDue({ root, title, back: '#/learn', navigate, total: pool.length, capped: newLeft === 0 });

  // Distractors come from the whole deck even in a topic session: four options
  // drawn from thirty topic words would repeat within a handful of cards.
  return runSession({
    root,
    plan,
    deck: DECKS.vocab,
    pool: all,
    boxes: boxIndex('vocab', states),
    settings,
    navigate,
    title,
    sub: `${plan.length} cards${topic ? ' · this topic' : ''}`,
    back: '#/learn',
    again,
  });
}

