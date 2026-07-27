/**
 * Loads the generated content.
 *
 * These files come from `pipeline/build-items.js` and have already been
 * through `pipeline/validate.js`, so every Luxembourgish string in them traces
 * to a LOD record. Nothing here re-checks that; the gate runs at build time so
 * the phone never pays for it.
 *
 * Copies live in `app/data/` so that `/app` is self-contained and can be
 * deployed on its own.
 */

const cache = new Map();

async function loadJson(name) {
  if (cache.has(name)) return cache.get(name);
  const promise = fetch(`data/${name}.json`, { cache: 'no-cache' }).then((response) => {
    if (!response.ok) throw new Error(`could not load ${name}.json (${response.status})`);
    return response.json();
  });
  cache.set(name, promise);
  return promise;
}

export const loadTopics = () => loadJson('topics').then((file) => file.items);
export const loadListening = () => loadJson('listening').then((file) => file.items);
export const loadInterviews = () => loadJson('interviews').then((file) => file.items);
export const loadImages = () => loadJson('images').then((file) => file.items).catch(() => []);
export const loadMeta = () => loadJson('topics').then((file) => file.meta);

export async function listeningForTopic(topicId) {
  const items = await loadListening();
  return items.find((item) => item.topic === topicId) ?? null;
}

export async function interviewForTopic(topicId) {
  const items = await loadInterviews();
  return items.find((item) => item.topic === topicId) ?? null;
}

/** An emoji per topic, purely as a wayfinding aid on the journey path. */
export const TOPIC_ICONS = {
  sport: '⚽',
  aarbecht: '💼',
  vakanz: '🧳',
  gesondheet: '🩺',
  wunnen: '🏡',
  transport: '🚆',
  hobbyen: '🎣',
  stot: '🧺',
  kreativitéit: '🎨',
  sproochen: '💬',
  liesen: '📖',
  medien: '📱',
  joreszäiten: '❄️',
  kaddoen: '🎁',
  iessen: '🍲',
  kleeder: '🧥',
  feierdeeg: '🎉',
  famill: '👪',
};

export const topicIcon = (id) => TOPIC_ICONS[id] ?? '🦋';

/**
 * Deterministic weekly ordering, so both players get the same topics in the
 * same order in a given week — the Woch-Duell has to be comparable.
 */
export function orderTopicsForWeek(topics, seed) {
  return [...topics].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`));
}

function hash(value) {
  let out = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}
