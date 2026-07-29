/**
 * Verbs — a drill session over the A1/A2 verbs with a complete present tense.
 *
 * Same engine as the vocabulary deck. Conjugation has not gone away: it is now
 * a rung on the production ladder (drill/cards.js), reached once the verb
 * itself is known, rather than the only question the deck ever asks. Every form
 * still comes verbatim from LOD's Flexiounstabellen.
 */

import { loadVerbs, loadTopics } from '../content.js';
import { getLearnDeckStates, buildSession } from '../store.js';
import { DECKS, isDrillable } from '../drill/cards.js';
import { runSession, nothingDue } from '../drill/engine.js';

const SESSION_SIZE = 12;

export async function render(root, { params, settings, navigate }) {
  const topicId = params?.[0] ?? null;
  const [everything, states, topics] = await Promise.all([
    loadVerbs(),
    getLearnDeckStates(settings.playerId, 'verb'),
    topicId ? loadTopics() : Promise.resolve([]),
  ]);

  // A few LOD entries carry no English gloss, so there is nothing to ask about
  // them in either direction. They stay in the data and out of the drill.
  const all = everything.filter((item) => isDrillable(item, 'verb'));
  const pool = topicId ? all.filter((item) => item.topics?.includes(topicId)) : all;
  const topic = topics.find((candidate) => candidate.id === topicId) ?? null;
  const title = topic ? `${topic.title_en ?? topic.en} verbs` : 'Verbs';
  const again = topicId ? `#/verbs/${encodeURIComponent(topicId)}` : '#/verbs';

  const plan = buildSession(pool, states, { limit: SESSION_SIZE });
  if (plan.length === 0) return nothingDue({ root, title, back: '#/learn', navigate, total: pool.length });

  return runSession({
    root,
    plan,
    deck: DECKS.verb,
    pool: all,
    boxes: boxIndex(states),
    settings,
    navigate,
    title,
    sub: `${plan.length} cards${topic ? ' · this topic' : ''}`,
    back: '#/learn',
    again,
  });
}

/** `strand:itemId` → box, which is how the card ladder picks a question type. */
function boxIndex(states) {
  const boxes = new Map();
  for (const [strand, rows] of Object.entries(states)) {
    for (const [itemId, row] of rows) boxes.set(`${strand}:${itemId}`, row.box);
  }
  return boxes;
}
