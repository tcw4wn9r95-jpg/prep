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
/** One photo per everyday-object word, for the picture-naming game
 * (pipeline/fetch-object-images.js). Absent until that script has run, same
 * degrade-to-empty as loadImages above. */
export const loadWordImages = () => loadJson('word-images').then((file) => file.items).catch(() => []);
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

/** The seven grammar exercise kinds (pipeline/build-grammar.js). */
export const loadGrammar = () => loadJson('grammar').then((file) => orderGrammar(file.items)).catch(() => []);

/**
 * Gives grammar exercises a place on the same path the word decks use.
 *
 * The vocab and verb decks carry `stage` (1–5) and `rank`, and
 * `buildMixedSession` introduces new items strictly in that order — which is
 * what stops a beginner meeting `Wunngemeinschaft` before `ech`. Grammar items
 * carry neither, so they sorted to the very end and were introduced in raw
 * file order, with a 19-word sentence as likely to come first as a 4-word one.
 *
 *   stage  by level, so grammar arrives alongside words of the same level.
 *   rank   a round-robin across the seven kinds, each kind internally ordered
 *          shortest sentence first.
 *
 * The round-robin is the part that matters. Ranking the whole deck by sentence
 * length alone put all 290 auxiliary cards first — they have no sentence at
 * all, so they scored zero — and a learner would have answered "hunn or sinn?"
 * 290 times before meeting a single gender or word-order card. Interleaving
 * gives every rule a turn from the first session, which is also how the mixed
 * session already treats the four decks.
 *
 * Done here rather than in the pipeline because it is a presentation decision:
 * the exercises are identical either way, and this can change without a
 * content rebuild.
 */
export function orderGrammar(items) {
  const byKind = new Map();
  for (const item of items ?? []) {
    const list = byKind.get(item.kind);
    if (list) list.push(item);
    else byKind.set(item.kind, [item]);
  }

  for (const list of byKind.values()) {
    list.sort((a, b) => (a.level === 'A1' ? 0 : 1) - (b.level === 'A1' ? 0 : 1) || sentenceLength(a) - sentenceLength(b));
  }

  // Round-robin, in a fixed kind order so the sequence is the same on every
  // device and both players walk the same path.
  const queues = [...byKind.entries()].sort(([a], [b]) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b)).map(([, list]) => list);
  const ordered = [];
  for (let round = 0; queues.some((queue) => round < queue.length); round += 1) {
    for (const queue of queues) if (round < queue.length) ordered.push(queue[round]);
  }

  // The unit comes from the data now (pipeline/build-grammar.js stamps it from
  // the single unit list), so a rule arrives when the path teaches it rather
  // than in one undifferentiated A1/A2 lump. The round-robin above still holds
  // *within* a unit, which is what it was for: it stopped 290 auxiliary cards
  // monopolising the first sessions. Interleaving twelve rules from day one was
  // the over-correction — the definite article and adjective endings are twelve
  // guide topics apart and should not arrive together.
  return ordered.map((item, index) => ({ ...item, stage: item.unit ?? (item.level === 'A1' ? 4 : 5), rank: index }));
}

/** Simplest first, within a kind. Each kind keeps its sentence somewhere
 * different, and `perfect-aux` has none at all — which is right, it is the
 * simplest question in the deck. */
function sentenceLength(item) {
  let sentence = '';
  if (item.kind === 'gender') sentence = item.example?.lb ?? '';
  else if (['wordorder', 'bracket', 'subclause', 'negation', 'likes'].includes(item.kind)) sentence = item.options_lb?.[item.correct] ?? '';
  // `heard` and `numbers` have no gap to measure — one is a recording and the
  // other a value — so they sort by their own sentence where there is one.
  else if (item.kind === 'heard' || item.kind === 'numbers') sentence = item.example?.lb ?? '';
  else if (item.kind !== 'perfect-aux') sentence = `${item.before ?? ''} ${item.after ?? ''}`;
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The order the twelve kinds take turns in.
 *
 * The three sentence-structure kinds are deliberately spread and in ascending
 * difficulty: `wordorder` (the verb is second) before `bracket` (and the other
 * half goes last) before `subclause` (except after datt, where it goes last).
 * Each one assumes the one before it. `likes` sits next to `negation` because
 * it is the same rule seen twice — a particle placed late in the clause — and
 * `numbers`/`dative` are added at the end as the newer kinds.
 */
const KIND_ORDER = [
  'gender', 'perfect-aux', 'wordorder', 'nrule', 'bracket', 'negation', 'likes', 'adjective', 'subclause',
  'perfect-form', 'numbers', 'heard', 'dative',
];

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
