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

import { buildGlossary } from './drill/hint.js';

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
/**
 * spelling → English for the drill hint, built once from the decks already
 * shipped. See drill/hint.js for why the lookup is deliberately narrow.
 */
let glossaryPromise = null;
export function loadGlossary() {
  glossaryPromise ??= Promise.all([loadVocab(), loadVerbs()])
    .then(([vocab, verbs]) => buildGlossary(vocab, verbs))
    .catch(() => new Map());
  return glossaryPromise;
}

/** Noun gender, n-rule and adjective-agreement exercises (pipeline/build-grammar.js). */
export const loadGrammar = () =>
  loadJson('grammar')
    .then((file) => file.items.map(withGrammarOrder))
    .catch(() => []);

/**
 * Gives a grammar exercise a place on the same path the word decks use.
 *
 * The vocab and verb decks carry `stage` (1–5) and `rank`, and
 * `buildMixedSession` introduces new items strictly in that order — which is
 * what stops a beginner meeting `Wunngemeinschaft` before `ech`. Grammar items
 * carry neither, so they sorted to the very end with rank 0 and were then
 * introduced in raw file order: 1,134 gender exercises alphabetically by their
 * noun, then n-rule, then adjective agreement, with a 19-word sentence just as
 * likely to come first as a 4-word one.
 *
 * Derived here rather than in the pipeline so the ordering can change without
 * a content rebuild, and because it is a presentation decision — the exercise
 * itself is identical either way.
 *
 *   stage  by level, so grammar arrives alongside words of the same level.
 *          A1 gender sits with the rest of A1; A2 gender, the n-rule and
 *          adjective agreement sit with A2, because the last two operate on
 *          whole sentences and need the vocabulary to read them.
 *   rank   by how long the sentence is. Short exercises first, within a stage.
 */
function withGrammarOrder(item) {
  const sentence = item.kind === 'gender' ? (item.example?.lb ?? '') : `${item.before ?? ''} ${item.after ?? ''}`;
  const words = sentence.trim().split(/\s+/).filter(Boolean).length;
  return {
    ...item,
    stage: item.level === 'A1' ? 4 : 5,
    rank: words,
  };
}
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
