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

/**
 * Deploy metadata written by .github/workflows/deploy.yml at publish time,
 * not by the pipeline. Fetched from the app root rather than `data/`, and
 * deliberately absent from sw.js's precache list, so sw.js's cache-first
 * `/data/` rule never pins the Settings screen to a stale build — this is
 * the one file that has to answer "is this actually the latest deploy?".
 * Absent on `npm run serve` locally, where "no deploy info" is correct.
 */
export const loadDeployInfo = () =>
  fetch('version.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

export const loadTopics = () => loadJson('topics').then((file) => file.items);
export const loadListening = () => loadJson('listening').then((file) => file.items);
export const loadInterviews = () => loadJson('interviews').then((file) => file.items);
export const loadImages = () => loadJson('images').then((file) => file.items).catch(() => []);
export const loadMeta = () => loadJson('topics').then((file) => file.meta);
export const loadVocab = () => loadJson('vocab').then((file) => file.items);
export const loadVerbs = () => loadJson('verbs').then((file) => file.items);
export const loadPhrases = () => loadJson('phrases').then((file) => file.items).catch(() => []);
/** The 8 use-case groups phrases are sorted into (pipeline/build-phrases.js), for the cheat sheet. */
export const loadPhraseGroups = () => loadJson('phrases').then((file) => file.meta.groups ?? []).catch(() => []);
/** Noun gender, n-rule and adjective-agreement exercises (pipeline/build-grammar.js). */
export const loadGrammar = () => loadJson('grammar').then((file) => file.items).catch(() => []);
/**
 * INLL podcast episodes — metadata only, written by pipeline/fetch-podcasts.js.
 * Absent until someone runs that fetch, so this degrades to an empty section
 * rather than a broken screen.
 */
export const loadPodcasts = () => loadJson('podcasts').then((file) => file.items ?? []).catch(() => []);

export async function podcastEpisode(id) {
  const items = await loadPodcasts();
  return items.find((episode) => episode.id === id) ?? null;
}
/** The ordered stages a learner walks, from pipeline/lib/frequency.js. */
export const loadStages = () => loadJson('vocab').then((file) => file.meta.learn?.stages ?? []);
export const loadModelAnswers = () => loadJson('model-answers').catch(() => ({ interviews: [], imageDescriptions: [] }));

export async function modelInterviewsForTopic(topicId) {
  const { interviews } = await loadModelAnswers();
  return interviews.filter((entry) => entry.topic === topicId);
}

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
