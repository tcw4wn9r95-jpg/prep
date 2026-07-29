/**
 * Local-first storage.
 *
 * Everything a player does is written here first and only then offered to the
 * Worker. If the Worker is unreachable — or never configured — the app still
 * works completely for solo practice, which the brief makes a hard
 * requirement rather than a nicety.
 *
 * IndexedDB rather than localStorage because recordings are Blobs: a five
 * minute AAC clip is a few megabytes and localStorage would both refuse it and
 * block the main thread.
 */

const DB_NAME = 'sproochentest';
const DB_VERSION = 3;

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('attempts')) {
        const store = db.createObjectStore('attempts', { keyPath: 'id' });
        store.createIndex('byPlayer', 'playerId');
        store.createIndex('byTopic', 'topic');
      }
      if (!db.objectStoreNames.contains('recordings')) {
        const store = db.createObjectStore('recordings', { keyPath: 'id' });
        store.createIndex('byPlayer', 'playerId');
        store.createIndex('byReviewed', 'reviewed');
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const store = db.createObjectStore('reviews', { keyPath: 'id' });
        store.createIndex('byRecording', 'recordingId');
        store.createIndex('byReviewer', 'reviewerId');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('learn')) {
        // One row per player+deck+strand+item: a tiny Leitner box. Key is a
        // composite string rather than a keyPath object so byPlayerDeck can
        // range-query it.
        const store = db.createObjectStore('learn', { keyPath: 'key' });
        store.createIndex('byPlayerDeck', 'playerDeck');
      }
      if (event.oldVersion > 0 && event.oldVersion < 3) migrateLearnToStrands(request.transaction);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(storeName, value, key) {
  const db = await openDb();
  return promisify(tx(db, storeName, 'readwrite').put(value, key));
}

async function get(storeName, key) {
  const db = await openDb();
  return promisify(tx(db, storeName, 'readonly').get(key));
}

async function all(storeName) {
  const db = await openDb();
  return promisify(tx(db, storeName, 'readonly').getAll());
}

async function allByIndex(storeName, indexName, key) {
  const db = await openDb();
  const index = tx(db, storeName, 'readonly').index(indexName);
  return promisify(index.getAll(key));
}

/* ------------------------------------------------------------------ ids */

export function newId(prefix) {
  const random = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...random].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${Date.now().toString(36)}-${hex.slice(0, 8)}`;
}

/* --------------------------------------------------------------- profile */

export const PLAYERS = [
  { id: 'diego', name: 'Diego', initial: 'D' },
  { id: 'diana', name: 'Diana', initial: 'A' },
];

export function otherPlayer(id) {
  return PLAYERS.find((player) => player.id !== id) ?? PLAYERS[0];
}

export async function getSettings() {
  return (
    (await get('meta', 'settings')) ?? {
      playerId: null,
      secret: '',
      workerUrl: '',
      transcriptDefault: false,
    }
  );
}

export async function saveSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await put('meta', settings, 'settings');
  return settings;
}

/* -------------------------------------------------------------- attempts */

/**
 * One completed listening set.
 * @param {{playerId:string,itemId:string,topic:string,correct:number,total:number,weekSeed:number}} attempt
 */
export async function saveAttempt(attempt) {
  const record = {
    id: newId('att'),
    at: new Date().toISOString(),
    points: attempt.correct * POINTS.perCorrectAnswer,
    ...attempt,
  };
  await put('attempts', record);
  await queue({ kind: 'attempt', record });
  return record;
}

export const listAttempts = () => all('attempts');
export const attemptsFor = (playerId) => allByIndex('attempts', 'byPlayer', playerId);

/* ------------------------------------------------------------ recordings */

/**
 * A speaking submission. `reviewed` is stored as 0/1 rather than a boolean
 * because IndexedDB cannot index booleans.
 */
export async function saveRecording({ playerId, kind, topic, blob, mime, durationMs, prompts }) {
  const record = {
    id: newId('rec'),
    playerId,
    kind,
    topic,
    blob,
    mime,
    durationMs,
    prompts: prompts ?? [],
    reviewed: 0,
    at: new Date().toISOString(),
  };
  await put('recordings', record);
  await queue({ kind: 'recording', id: record.id, playerId, topic, recordingKind: kind, durationMs });
  return record;
}

export const listRecordings = () => all('recordings');
export const getRecording = (id) => get('recordings', id);

/**
 * Local cache of a machine estimate, so it survives without re-hitting the
 * Worker (and re-billing the API calls) once you've seen it for a recording.
 */
export async function getMachineFeedback(recordingId) {
  return get('meta', `mf:${recordingId}`);
}

export async function saveMachineFeedback(recordingId, feedback) {
  await put('meta', feedback, `mf:${recordingId}`);
  return feedback;
}

/**
 * Local cache of a Learn example-sentence explanation, keyed by the vocab or
 * verb item id. The explanation is the same for everyone, so once fetched it
 * never needs to be re-requested from this device.
 */
export async function getSentenceExplanation(itemId) {
  return get('meta', `explain:${itemId}`);
}

export async function saveSentenceExplanation(itemId, explanation) {
  await put('meta', explanation, `explain:${itemId}`);
  return explanation;
}

export async function markReviewed(recordingId) {
  const record = await getRecording(recordingId);
  if (!record) return;
  record.reviewed = 1;
  await put('recordings', record);
}

/* --------------------------------------------------------------- reviews */

/**
 * The official INLL grid. Four criteria, 0–5 each, plus the interlocutor's
 * single global mark. The weighting is INLL's own: the assessor's grid counts
 * 80%, the interlocutor's global impression 20%.
 */
export const CRITERIA = [
  {
    id: 'lexik',
    name: 'Lexik',
    desc_en: 'Range of A2 vocabulary, and whether it is used appropriately.',
    desc_fr: 'Étendue du vocabulaire A2 et emploi approprié.',
  },
  {
    id: 'morphosyntax',
    name: 'Morphosyntax',
    desc_en: 'Range of A2 grammatical structures, and whether they are used appropriately.',
    desc_fr: 'Étendue des structures grammaticales A2 et emploi approprié.',
  },
  {
    id: 'phoneetik',
    name: 'Phoneetik',
    desc_en: 'Expressing yourself clearly and fluently.',
    desc_fr: 'S’exprimer clairement et couramment.',
  },
  {
    id: 'aufgabenerfellung',
    name: 'Aufgabenerfëllung',
    desc_en: 'Interacting in a conversation, describing an image, being understood and coherent.',
    desc_fr: 'Interagir, décrire une image, être compris et cohérent.',
  },
];

export const RUBRIC_MAX = CRITERIA.length * 5; // 20, as on the official grid
export const EXAMINER_WEIGHT = { assessor: 0.8, interlocuteur: 0.2 };

export async function saveReview({ recordingId, reviewerId, bands, globalNote, note }) {
  const record = {
    id: newId('rev'),
    recordingId,
    reviewerId,
    bands,
    globalNote,
    note: note ?? '',
    at: new Date().toISOString(),
    points: POINTS.perReview,
  };
  await put('reviews', record);
  await markReviewed(recordingId);
  await queue({ kind: 'review', record });
  return record;
}

export const listReviews = () => all('reviews');
export const reviewsForRecording = (recordingId) => allByIndex('reviews', 'byRecording', recordingId);

/** A single review as a percentage, using INLL's 80/20 examiner weighting. */
export function reviewPercent(review) {
  const gridTotal = CRITERIA.reduce((sum, criterion) => sum + (review.bands[criterion.id] ?? 0), 0);
  const gridPct = gridTotal / RUBRIC_MAX;
  const globalPct = (review.globalNote ?? 0) / 5;
  return (gridPct * EXAMINER_WEIGHT.assessor + globalPct * EXAMINER_WEIGHT.interlocuteur) * 100;
}

/* ---------------------------------------------------------------- points */

export const POINTS = {
  perCorrectAnswer: 2,
  perRecording: 15,
  // Reviewing is weighted generously on purpose: if reviews get skipped the
  // whole peer-examiner loop collapses, and it is itself good practice.
  perReview: 25,
  // Deliberately small — a vocab/verb session is dozens of cards, and the
  // exam-facing modules should stay the bigger score.
  perLearnCorrect: 1,
};

/* ----------------------------------------------------------- sync outbox */

/** Queue a change for the Worker. Never blocks the UI. */
async function queue(payload) {
  await put('outbox', { at: Date.now(), payload });
}

export const listOutbox = () => all('outbox');

export async function clearOutbox(ids) {
  const db = await openDb();
  const store = tx(db, 'outbox', 'readwrite');
  for (const id of ids) store.delete(id);
}

/* ------------------------------------------------------------- readiness */

/**
 * Estimated exam readiness against the real thresholds.
 *
 * INLL's rule: you pass on **over 50% in the speaking part, or over 50%
 * overall**. Both are surfaced because they lead to different revision — a
 * strong listener with weak speaking cannot rely on the overall route alone.
 */
export function readinessFor(playerId, { attempts, recordings, reviews }) {
  const mine = attempts.filter((attempt) => attempt.playerId === playerId);
  const answered = mine.reduce((sum, attempt) => sum + attempt.total, 0);
  const correct = mine.reduce((sum, attempt) => sum + attempt.correct, 0);
  const listeningPct = answered === 0 ? null : (correct / answered) * 100;

  const myRecordingIds = new Set(recordings.filter((r) => r.playerId === playerId).map((r) => r.id));
  const myReviews = reviews.filter((review) => myRecordingIds.has(review.recordingId));
  const speakingPct =
    myReviews.length === 0
      ? null
      : myReviews.reduce((sum, review) => sum + reviewPercent(review), 0) / myReviews.length;

  const parts = [listeningPct, speakingPct].filter((value) => value !== null);
  const overallPct = parts.length === 0 ? null : parts.reduce((a, b) => a + b, 0) / parts.length;

  return {
    listeningPct,
    speakingPct,
    overallPct,
    answered,
    reviewCount: myReviews.length,
    passesSpeaking: speakingPct !== null && speakingPct > 50,
    passesOverall: overallPct !== null && overallPct > 50,
    advice: adviceFor({ listeningPct, speakingPct, answered, reviewCount: myReviews.length }),
  };
}

/** The single thing that would move the number most. A leaderboard that does
 * not predict passing is decoration. */
function adviceFor({ listeningPct, speakingPct, answered, reviewCount }) {
  if (reviewCount === 0) return 'Record one speaking answer — speaking is the part you must pass.';
  if (answered < 16) return 'Finish one full listening set so the B1 estimate means something.';
  if (speakingPct !== null && speakingPct <= 50) return 'Speaking is below the line. Record more interviews and ask for detailed scores.';
  if (listeningPct !== null && speakingPct !== null && listeningPct < speakingPct) return 'Listening is the weaker half — it carries the overall route.';
  return 'Keep both halves above the line. Practise the topics you have not opened yet.';
}

/* ------------------------------------------------------------- week seed */

/**
 * Monday-anchored week key. The Worker fixes the real seed for the Woch-Duell;
 * this is the offline fallback so both players still get the same set.
 */
export function weekSeed(date = new Date()) {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(utc).getUTCDay();
  const monday = utc - ((day + 6) % 7) * 86400000;
  return Math.floor(monday / 86400000);
}

/* -------------------------------------------------------------- streaks */

/** Two freeze days a week, no guilt copy. */
export async function touchStreak(playerId) {
  const key = `streak:${playerId}`;
  const today = new Date().toISOString().slice(0, 10);
  const state = (await get('meta', key)) ?? { days: [], current: 0, best: 0 };
  if (state.days.includes(today)) return state;

  state.days = [...state.days, today].slice(-90);
  const set = new Set(state.days);
  let current = 0;
  let freezesLeft = 2;
  for (let offset = 0; offset < 90; offset += 1) {
    const day = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    if (set.has(day)) {
      current += 1;
    } else if (freezesLeft > 0 && offset > 0) {
      freezesLeft -= 1; // a freeze day keeps the streak alive without a claim
    } else {
      break;
    }
  }
  state.current = current;
  state.best = Math.max(state.best, current);
  await put('meta', state, key);
  return state;
}

export async function getStreak(playerId) {
  return (await get('meta', `streak:${playerId}`)) ?? { days: [], current: 0, best: 0 };
}

/* ------------------------------------------------------------ vocab & verbs
 * A small Leitner box per item: five boxes, each with a longer review gap.
 * No scheduling library, just an array of day-offsets, which is all a
 * two-person app needs.
 *
 * Each item is tracked in **two strands**, because recognising a word and
 * being able to say it are different pieces of knowledge with different
 * schedules — learners typically recognise two to three times more words than
 * they can produce. Collapsing them into one number would overstate readiness
 * for the half of the exam that is scored on production.
 *
 *   recv — can you understand it: gloss, by ear, in a gapped sentence
 *   prod — can you say it: choose it, build it, type it
 *
 * `prod` stays locked until `recv` reaches PROD_UNLOCK_BOX. Interleaving hard
 * variants in from the first exposure overloads rather than helps; the
 * difficulty escalates once the word is recognised, not before.
 */

const LEITNER_DAYS = [0, 1, 3, 7, 16];
export const LEARN_DECKS = { vocab: 'vocab', verb: 'verb' };
export const STRANDS = { recv: 'recv', prod: 'prod' };
export const MAX_BOX = LEITNER_DAYS.length - 1;

/** Recognise a word twice before being asked to produce it. */
export const PROD_UNLOCK_BOX = 2;

/** New words introduced per day. Above roughly ten, retention falls faster
 * than the extra intake gains. Reviews are on top of this and uncapped. */
export const DAILY_NEW_TARGET = 8;

function learnKey(playerId, deck, strand, itemId) {
  return `${playerId}:${deck}:${strand}:${itemId}`;
}

function playerDeckKey(playerId, deck, strand) {
  return `${playerId}:${deck}:${strand}`;
}

/**
 * v2 → v3: rows were keyed `player:deck:item` with no strand, and every one of
 * them was written by the old four-option gloss quiz. That is receptive
 * evidence and nothing else, so it migrates into `recv` with its box intact
 * and `prod` starts unseen. Claiming those boxes as production knowledge would
 * be the one dishonest way to do this.
 */
function migrateLearnToStrands(transaction) {
  const store = transaction.objectStore('learn');
  const cursorRequest = store.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const row = cursor.value;
    if (typeof row.key === 'string' && row.key.split(':').length === 3) {
      const [playerId, deck] = row.key.split(':');
      store.delete(cursor.primaryKey);
      store.put({
        ...row,
        key: learnKey(playerId, deck, STRANDS.recv, row.itemId),
        playerDeck: playerDeckKey(playerId, deck, STRANDS.recv),
        strand: STRANDS.recv,
      });
    }
    cursor.continue();
  };
}

const emptyLearnState = () => ({ box: 0, dueAt: 0, seen: 0, correct: 0, lapses: 0 });

/**
 * @param {'vocab'|'verb'} deck
 * @param {'recv'|'prod'} strand
 */
export async function getLearnState(playerId, deck, strand, itemId) {
  const row = await get('learn', learnKey(playerId, deck, strand, itemId));
  return row ?? emptyLearnState();
}

/** All progress rows for one strand of a player's deck, keyed by item id. */
export async function getLearnDeckState(playerId, deck, strand) {
  const rows = await allByIndex('learn', 'byPlayerDeck', playerDeckKey(playerId, deck, strand));
  return new Map(rows.map((row) => [row.itemId, row]));
}

/** Both strands at once — what the drill needs to pick a card type. */
export async function getLearnDeckStates(playerId, deck) {
  const [recv, prod] = await Promise.all([
    getLearnDeckState(playerId, deck, STRANDS.recv),
    getLearnDeckState(playerId, deck, STRANDS.prod),
  ]);
  return { recv, prod };
}

/**
 * Chooses a study session: items never seen, plus items whose box is due,
 * new-first so a beginner always has fresh material, capped to `limit`.
 */
export function pickDue(items, stateByItemId, limit) {
  const now = Date.now();
  const fresh = [];
  const due = [];
  for (const item of items) {
    const state = stateByItemId.get(item.id);
    if (!state) fresh.push(item);
    else if (state.dueAt <= now) due.push(item);
  }
  shuffle(fresh);
  shuffle(due);
  return [...fresh, ...due].slice(0, limit);
}

/**
 * The session plan: a list of `{ item, strand }` pairs.
 *
 * Reviews come first in the pool and new words are capped at `newTarget`, so a
 * long backlog never gets buried under fresh intake. Everything then gets
 * interleaved — mixing strands and decks within a session retains better than
 * blocking one type together — except that a word being met for the very first
 * time contributes only its receptive card, so first exposure stays simple.
 *
 * @param {Array} items
 * @param {{recv: Map, prod: Map}} states
 */
export function buildSession(items, states, { limit = 12, newTarget = DAILY_NEW_TARGET, now = Date.now() } = {}) {
  const reviews = [];
  const fresh = [];

  for (const item of items) {
    const recv = states.recv.get(item.id);
    const prod = states.prod.get(item.id);

    if (!recv) {
      fresh.push({ item, strand: STRANDS.recv, isNew: true });
      continue;
    }
    if (recv.dueAt <= now) reviews.push({ item, strand: STRANDS.recv, isNew: false });

    // Production only opens once the word is recognised, and an unseen prod
    // strand on an unlocked word is itself a review — the word is known, the
    // skill is not.
    if (recv.box < PROD_UNLOCK_BOX) continue;
    if (!prod) reviews.push({ item, strand: STRANDS.prod, isNew: false });
    else if (prod.dueAt <= now) reviews.push({ item, strand: STRANDS.prod, isNew: false });
  }

  shuffle(reviews);

  // New words are taken in order, never shuffled. The deck is sorted so that
  // the sentence skeleton comes first and the rest follows how often the word
  // actually occurs, so "the next few" is always the most useful few. Shuffling
  // here was what put `Wunngemeinschaft` in front of a beginner before `ech`.
  fresh.sort((a, b) => (a.item.stage ?? 9) - (b.item.stage ?? 9) || (a.item.rank ?? 0) - (b.item.rank ?? 0));

  const newSlots = Math.max(0, Math.min(newTarget, limit));
  const chosen = [...reviews.slice(0, Math.max(0, limit - Math.min(fresh.length, newSlots))), ...fresh.slice(0, newSlots)];
  shuffle(chosen);
  return chosen.slice(0, limit);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

/**
 * The box an item moves to. Pure, so the scheduling rules can be tested
 * without a browser.
 *
 * @param {number} previousBox
 * @param {{correct: boolean, partial?: boolean}} outcome
 */
export function nextBox(previousBox, { correct, partial = false }) {
  if (!correct) return previousBox >= 3 ? 1 : 0;
  if (partial) return previousBox;
  return Math.min(previousBox + 1, MAX_BOX);
}

/**
 * Grades one card.
 *
 * A wrong answer on a well-known word drops it to box 1 rather than box 0: a
 * lapse means the memory faded, not that the word was never learned, and
 * sending it all the way back would waste the next four reviews re-teaching
 * something already half-known.
 *
 * `partial` is for a typed answer that was right apart from its accents. It
 * counts as correct — the meaning was retrieved — but promotes no further, so
 * the exact spelling comes round again soon.
 *
 * @param {'vocab'|'verb'} deck
 * @param {'recv'|'prod'} strand
 * @param {{correct: boolean, partial?: boolean}} outcome
 */
export async function recordLearnResult(playerId, deck, strand, itemId, outcome) {
  const { correct, partial = false } = typeof outcome === 'boolean' ? { correct: outcome } : outcome;
  const previous = await getLearnState(playerId, deck, strand, itemId);
  const box = nextBox(previous.box, { correct, partial });

  const record = {
    key: learnKey(playerId, deck, strand, itemId),
    playerDeck: playerDeckKey(playerId, deck, strand),
    strand,
    itemId,
    box,
    dueAt: Date.now() + LEITNER_DAYS[box] * 86400000,
    seen: previous.seen + 1,
    correct: previous.correct + (correct ? 1 : 0),
    lapses: previous.lapses + (correct || previous.box === 0 ? 0 : 1),
  };
  await put('learn', record);
  if (correct) await queue({ kind: 'learn', deck, strand, itemId, playerId });
  return record;
}

/**
 * Mastered = reached the last box. Reported per strand, because "I know 400
 * words" and "I can say 400 words" are different claims and only the second
 * one predicts the speaking mark.
 *
 * @param {'recv'|'prod'} strand
 */
export async function learnProgress(playerId, deck, strand, totalItems) {
  const rows = await allByIndex('learn', 'byPlayerDeck', playerDeckKey(playerId, deck, strand));
  const mastered = rows.filter((row) => row.box === MAX_BOX).length;
  return { started: rows.length, mastered, total: totalItems, pct: totalItems === 0 ? 0 : (mastered / totalItems) * 100 };
}

/**
 * What is waiting right now, across both decks and both strands, plus how many
 * new words have been started today. Drives the Learn hub.
 */
export async function dueCounts(playerId, { now = Date.now() } = {}) {
  const decks = Object.values(LEARN_DECKS);
  const strands = Object.values(STRANDS);
  const rowSets = await Promise.all(
    decks.flatMap((deck) => strands.map((strand) => allByIndex('learn', 'byPlayerDeck', playerDeckKey(playerId, deck, strand)))),
  );
  const rows = rowSets.flat();

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const counts = { recv: 0, prod: 0, newToday: 0, target: DAILY_NEW_TARGET };
  for (const row of rows) {
    if (row.dueAt <= now) counts[row.strand] += 1;
    // seen === 1 on a recv row means the word was met for the first time; the
    // due date is when that first meeting was graded.
    if (row.strand === STRANDS.recv && row.seen === 1 && row.dueAt - LEITNER_DAYS[row.box] * 86400000 >= dayStart) {
      counts.newToday += 1;
    }
  }
  return counts;
}
