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
const DB_VERSION = 6;

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
      if (!db.objectStoreNames.contains('mistakes')) {
        // One row per card got wrong, surviving the session it happened in.
        // See `recordMistake`.
        const store = db.createObjectStore('mistakes', { keyPath: 'key' });
        store.createIndex('byPlayer', 'playerId');
      }
      if (!db.objectStoreNames.contains('flags')) {
        // One row per card the player has called out as not making sense, or
        // as coming round far too often. See `flagCard` for what each reason
        // then does to the card's chances of appearing again.
        const store = db.createObjectStore('flags', { keyPath: 'key' });
        store.createIndex('byPlayer', 'playerId');
      }
      if (!db.objectStoreNames.contains('learnSessions')) {
        // One row per *finished* drill session, which the `learn` store cannot
        // provide: that holds per-item state with no history, so there is no
        // way to ask it what was practised this week. The Woch-Duell resets
        // every Monday and needs exactly that.
        const store = db.createObjectStore('learnSessions', { keyPath: 'id' });
        store.createIndex('byPlayer', 'playerId');
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

/** Long enough for a real name, short enough not to break a heading. */
export const MAX_NAME = 24;

/**
 * The name to show for a player.
 *
 * `PLAYERS[].id` is a database key. It is in every `learn` row's compound key,
 * in five IndexedDB indexes, in `streak:${playerId}`, and in the Worker's
 * scoreboard — which validates it against its own fixed list. Renaming *that*
 * would orphan every record the person has and desync the duel, so it never
 * changes.
 *
 * What a person actually means by their name is the label, so the label is the
 * only thing this touches: `settings.displayName` overrides `PLAYERS[].name`
 * for the player using this device, and everything else carries on keyed by id.
 *
 * Only for the local player. The partner keeps their default name, because the
 * Worker has no field to carry a name across and inventing one would be a
 * protocol change rather than a rename.
 */
export function playerName(settings, id = settings?.playerId) {
  const player = PLAYERS.find((entry) => entry.id === id) ?? PLAYERS[0];
  if (id !== settings?.playerId) return player.name;
  const chosen = String(settings?.displayName ?? '').trim();
  return chosen === '' ? player.name : chosen.slice(0, MAX_NAME);
}

/**
 * Has this device asked the person whether their name is right?
 *
 * Asked once, ever. Someone who came through onboarding chose their name there
 * and is marked confirmed on the way out, so the prompt is for profiles that
 * already existed when it was added.
 */
export const nameConfirmed = (settings) => settings?.nameConfirmed === true;

/** Store the confirmed name. An empty answer keeps whatever was there. */
export async function confirmName(name) {
  const trimmed = String(name ?? '').trim().slice(0, MAX_NAME);
  return saveSettings(trimmed === '' ? { nameConfirmed: true } : { displayName: trimmed, nameConfirmed: true });
}

export async function getSettings() {
  return (
    (await get('meta', 'settings')) ?? {
      playerId: null,
      secret: '',
      workerUrl: '',
      // Anthropic key for this device, used only when no Worker is configured.
      // app/js/anthropic.js documents what storing it here does and does not cost.
      apiKey: '',
      transcriptDefault: false,
      // Unset means on: the chime was asked for, so absence is not a refusal.
      sound: true,
    }
  );
}

export async function saveSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await put('meta', settings, 'settings');
  return settings;
}

/* ---------------------------------------------------------------- breaks */

/** Today, as the key the break record is filed under. */
const dayKey = (now = Date.now()) => {
  const date = new Date(now);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/**
 * Which mid-session breaks today has already offered.
 *
 * Kept per day rather than per session, because the checkpoints are thirds of
 * the *daily* goal — two short sessions must not each offer both. The record
 * resets by simply not matching tomorrow's key, so nothing has to expire it.
 */
export async function breaksTakenToday(now = Date.now()) {
  const settings = await getSettings();
  const record = settings.breaks;
  return record?.day === dayKey(now) ? (record.taken ?? []) : [];
}

/** Mark a checkpoint offered, so it is not offered again today. */
export async function markBreakTaken(mark, now = Date.now()) {
  const taken = await breaksTakenToday(now);
  if (taken.includes(mark)) return taken;
  const next = [...taken, mark];
  await saveSettings({ breaks: { day: dayKey(now), taken: next } });
  return next;
}

/**
 * Unset means on: the breaks were asked for, so absence is not a refusal.
 *
 * Its own key rather than `breaks`, which holds the per-day record above — one
 * name for a boolean and an object is how a truthy `{}` quietly becomes "on"
 * forever.
 */
export const breaksEnabled = (settings) => settings?.breaksOff !== true;

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
 * The line INLL marks on: over 50%, on the speaking part or overall.
 *
 * One constant rather than a `> 50` written at each site, because the end of a
 * listening set and the readiness screen have to agree about what the same
 * percentage means — they did not, and a 20% set was congratulated on one
 * screen and reported as a fail on the next.
 */
export const PASS_MARK = 50;

/**
 * What a finished set's score means, in the words the learner is shown.
 *
 * Lives here next to `readinessFor()` rather than in a screen because two
 * screens end a listening run — the corpus drills and the podcast questions —
 * and both feed the same estimate. Two separately-worded verdicts on one
 * number would read as two different scores.
 *
 * `passed` is false at exactly 50%: the rule is *over* 50, not at least.
 */
export function setVerdict(pct) {
  if (pct >= 80) {
    return { passed: true, label: 'well above the pass mark', line: 'Strong set — comfortably above the line.' };
  }
  if (pct > PASS_MARK) {
    return { passed: true, label: 'above the pass mark', line: `Above the ${PASS_MARK}% line. Keep the margin growing.` };
  }
  if (pct >= 35) {
    return {
      passed: false,
      label: `below the ${PASS_MARK}% pass mark`,
      line: 'Below the line this time. Read the misses below — the transcript answers every one of them.',
    };
  }
  return {
    passed: false,
    label: `below the ${PASS_MARK}% pass mark`,
    line: 'This one was hard. Go through the misses below with the transcript, then try an easier topic.',
  };
}

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
    passesSpeaking: speakingPct !== null && speakingPct > PASS_MARK,
    passesOverall: overallPct !== null && overallPct > PASS_MARK,
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

/* ---------------------------------------------------------------- pairs game
 * Where the learner has got to in the optional matching game. One small meta
 * row per player rather than a store of its own: this is a single integer and
 * a handful of best scores, not a history worth querying.
 */

export async function getPairsProgress(playerId) {
  return (await get('meta', `pairs:${playerId}`)) ?? { level: 1, best: {} };
}

/**
 * Records a cleared level. `level` only ever moves forward — replaying an
 * early level for practice must not send the learner back to it.
 */
export async function savePairsResult(playerId, level, { moves }) {
  const previous = await getPairsProgress(playerId);
  const best = previous.best?.[level];
  const progress = {
    level: Math.max(previous.level ?? 1, level + 1),
    best: { ...previous.best, [level]: best === undefined ? moves : Math.min(best, moves) },
  };
  await put('meta', progress, `pairs:${playerId}`);
  return progress;
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

/** Days until the next review, by box. Box 0 is deliberately zero: a lapsed
 * card should come back in the same session, not tomorrow. Exported because it
 * is the reason an empty queue is not a reachable daily goal. */
export const LEITNER_DAYS = [0, 1, 3, 7, 16];
export const LEARN_DECKS = { vocab: 'vocab', verb: 'verb', phrase: 'phrase', grammar: 'grammar' };
export const STRANDS = { recv: 'recv', prod: 'prod' };
export const MAX_BOX = LEITNER_DAYS.length - 1;

/** Recognise a word twice before being asked to produce it. */
export const PROD_UNLOCK_BOX = 2;

/**
 * Box 3 is a week's interval — far enough apart that surviving it means the
 * word is holding rather than merely fresh. `mastered` (the last box) is a
 * sixteen-day claim and takes a month to earn, which makes it useless as
 * week-one feedback.
 */
export const STRONG_BOX = 3;

/**
 * New words per day: no longer capped.
 *
 * There was a budget — eight a day by default, raisable to twenty-five in
 * Settings — and it was the only thing in the app that actually stopped a day.
 * Reviews were always uncapped; the daily goal was always a target with nothing
 * withheld for missing it. When the budget was spent, sessions introduced
 * nothing new, the empty state said "more tomorrow", and that was that.
 *
 * It was removed on request. The reasoning it was built on is still true —
 * above roughly ten new words a day retention falls faster than the extra
 * intake gains — but that is an argument for pacing yourself, not for the app
 * refusing to continue. Someone who has time now can see their own review
 * queue climbing and decide.
 *
 * ## What did *not* go with it
 *
 * A session is still a mix, and that is not a leftover — it is the app. The
 * first attempt at this removal set `newTarget` to Infinity, which looks like
 * "no limit" and is actually something much worse: `newSlots` then takes every
 * general slot, `staleSlots` computes to zero, and reviews stop appearing
 * altogether. Uncapped intake with no review is not fast learning, it is
 * meeting two thousand words once each.
 *
 * So the per-session share stays. Two thirds of a session is new words, the
 * rest is mistakes and a throttled slice of what is due. Twelve-card sessions
 * therefore still run about eight new — the number the old daily cap used to
 * allow in a *day* — and the difference is simply that the next session brings
 * eight more, as many times as you care to start one.
 */
const SESSION_NEW_SHARE = 2 / 3;

/** How many new words a session of `limit` cards introduces, absent a caller
 * saying otherwise. Never the whole session: see the note above. */
export const newSessionTarget = (limit) => Math.max(1, Math.ceil(limit * SESSION_NEW_SHARE));

/**
 * Cards to answer in a day — the goal the learner is actually shown.
 *
 * Everything else on the home screen is queue depth: how many words are due,
 * how many new ones are left. Those are the wrong thing to show as progress,
 * because the queue refills as you work — a missed card goes to box 0, whose
 * interval is zero days, so it falls due again immediately. Answering a
 * hundred cards could leave the counter exactly where it started, which reads
 * as having achieved nothing.
 *
 * This one only ever goes up, and resets at midnight. Roughly two sessions.
 */
export const DAILY_CARD_GOAL = 30;

/**
 * The daily goal, as something the learner picks rather than something the app
 * imposes.
 *
 * Duolingo offers four (Casual to Intense) and asks at signup. That is not
 * decoration: a goal you set yourself is committed to differently from one
 * handed to you, and the person here knows what their week looks like and when
 * the exam is. 30 stays the default because it is roughly two sessions and the
 * figure the rest of the copy was written around.
 *
 * Every option is a real number of cards, and `todayProgress` measures against
 * whichever is chosen — there is no separate "effective" goal.
 */
export const DAILY_GOALS = [
  { id: 'light', cards: 15, label: 'Light', note: 'about one session' },
  { id: 'steady', cards: 30, label: 'Steady', note: 'about two sessions — the default' },
  { id: 'serious', cards: 50, label: 'Serious', note: 'three or four sessions' },
  { id: 'exam', cards: 80, label: 'Exam soon', note: 'a real hour a day' },
];

/** The chosen goal in cards, defaulting to Steady. */
export function goalCards(settings) {
  return DAILY_GOALS.find((goal) => goal.id === settings?.dailyGoal)?.cards ?? DAILY_CARD_GOAL;
}

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
 * Mistakes come first, new words next (capped at `newTarget`), and a
 * throttled slice of the rest of the backlog fills in last — see the block
 * comment above `STALE_REVIEW_SAMPLE` in `buildMixedSession` for why.
 * Everything is then interleaved — mixing strands and decks within a session
 * retains better than blocking one type together — except that a word being
 * met for the very first time contributes only its receptive card, so first
 * exposure stays simple.
 *
 * `options.deckId` names the deck for matching against the `mistakes` list
 * only — it does not become `card.deck` the way a mixed session's groups do;
 * a single-deck plan still leaves that to `runSession`'s own `deck` option.
 *
 * @param {Array} items
 * @param {{recv: Map, prod: Map}} states
 */
export function buildSession(items, states, { deckId, ...options } = {}) {
  // Deliberately no `deck` here: `mistakeDeck` names the deck for the mistake
  // and flag lookups without becoming `card.deck`, which the engine fills from
  // its own `sessionDeck` — a stub with only an id would lose `gloss()`.
  return buildMixedSession([{ items, states, mistakeDeck: deckId }], options);
}

/**
 * The same plan, but drawn from several decks at once.
 *
 * A learner does not think in decks. "The next words I have not met" is a fact
 * about the whole vocabulary — the sentence skeleton is in the vocab deck, the
 * verbs that carry those sentences are in the verb deck, and the frames that
 * join them are in the phrase deck. Asking someone to pick a deck first is
 * asking them to answer a question about our data model before they can
 * practise.
 *
 * Each plan entry therefore carries the deck it came from, so the engine can
 * grade it against the right ladder and the right progress row.
 *
 * `reserve` guarantees a minimum number of cards from a given deck, before the
 * general interleaving below gets first pick of the remaining slots. Without
 * it, "mandatory every day" for a small deck (grammar, ~1,800 items) is only
 * true by luck against a 4,300-item vocab+verb+phrase pool that usually has
 * more due — the reserved deck could go days without appearing at all.
 *
 * @param {Array<{deck?: object, pool?: Array, items: Array, states: {recv: Map, prod: Map}}>} groups
 * @param {Record<string, number>} [options.reserve] deck id → minimum cards
 * @param {Set<string>} [options.mistakes] entry keys (`mistakeEntryKey`) of cards
 *   currently in the mistakes list — see the note above `STALE_REVIEW_SAMPLE`.
 */
export function buildMixedSession(
  groups,
  {
    limit = 12,
    newTarget = newSessionTarget(limit),
    now = Date.now(),
    reserve = {},
    mistakes = EMPTY_SET,
    // Cards the player has reported, as `deckId:itemId`. Filtered here rather
    // than in each of the five screens that build a session, so one rule
    // governs all of them and a new screen cannot forget to apply it.
    flagged = EMPTY_SET,
    random = Math.random,
  } = {},
) {
  const mistakeReviews = [];
  const staleReviews = [];
  const fresh = [];

  for (const group of groups) {
    const { items, states, deck, pool, reserveId, mistakeDeck } = group;
    // `reserveId` lets two groups share a deck — and therefore a Leitner row —
    // while being reserved separately. Sentence structure is a slice of the
    // grammar deck that has to be guaranteed on its own.
    const from = (item, strand, isNew) => ({ item, strand, isNew, deck, pool: pool ?? items, reserveId: reserveId ?? deck?.id });
    // A card the learner actually got wrong, versus one whose box interval
    // simply elapsed — see the block comment above STALE_REVIEW_SAMPLE for why
    // the two are no longer treated the same. `mistakeDeck` lets a single-deck
    // `buildSession` call name its deck for this lookup without that deck
    // becoming `card.deck` (see buildSession's own doc comment).
    const deckId = mistakeDeck ?? deck?.id;
    const bucket = (entry) => (mistakes.has(mistakeEntryKey(deckId, entry.strand, entry.item.id)) ? mistakeReviews : staleReviews).push(entry);

    for (const item of items) {
      // A flag removes the card from the draw and touches nothing else — the
      // Leitner row stays exactly as it was, so taking the flag off brings the
      // card back on its real schedule rather than as a new word.
      if (flagged.size > 0 && flagged.has(`${deckId}:${item.id}`)) continue;
      const recv = states.recv.get(item.id);
      const prod = states.prod.get(item.id);

      if (!recv) {
        fresh.push(from(item, STRANDS.recv, true));
        continue;
      }
      if (recv.dueAt <= now) bucket(from(item, STRANDS.recv, false));

      // Production only opens once the word is recognised, and an unseen prod
      // strand on an unlocked word is itself a review — the word is known, the
      // skill is not.
      if (recv.box < PROD_UNLOCK_BOX) continue;
      if (!prod) bucket(from(item, STRANDS.prod, false));
      else if (prod.dueAt <= now) bucket(from(item, STRANDS.prod, false));
    }
  }

  shuffle(mistakeReviews, random);
  shuffle(staleReviews, random);
  // "Up to 20%" of whatever is currently due and not a mistake — a random
  // slice, re-rolled every time a session is built, rather than the same
  // fifth of the backlog every day. See the block comment above
  // STALE_REVIEW_SAMPLE for why this exists at all.
  const throttledStale = staleReviews.slice(0, Math.ceil(staleReviews.length * STALE_REVIEW_SAMPLE));

  // New words are taken in order, never shuffled. The deck is sorted so that
  // the sentence skeleton comes first and the rest follows how often the word
  // actually occurs, so "the next few" is always the most useful few. Shuffling
  // here was what put `Wunngemeinschaft` in front of a beginner before `ech`.
  fresh.sort((a, b) => (a.item.stage ?? 9) - (b.item.stage ?? 9) || (a.item.rank ?? 0) - (b.item.rank ?? 0));

  // Mistakes fill the session first — a card just got wrong is an active gap,
  // not a queue to manage. New words come next: the whole point of throttling
  // old reviews (above) is that they should not be the thing standing between
  // a learner and the next new word. Whatever is left, a random slice of the
  // held-and-correct backlog fills in, last.
  const reserveTotal = Object.values(reserve).reduce((sum, n) => sum + n, 0);
  const generalLimit = Math.max(0, limit - reserveTotal);

  /**
   * One card is one entry, however many groups offered it.
   *
   * Groups are allowed to overlap: sentence structure is a slice of the
   * grammar deck handed in as its own group, so it can be reserved separately
   * while sharing grammar's Leitner rows. That means the same `{deck, strand,
   * item}` sits in both pools, and `fresh.slice()` happily took it twice —
   * the same question, twice, in one twelve-card session. Which reads as the
   * app having lost its place.
   */
  const entryKey = (entry) => `${entry.deck?.id ?? ''}:${entry.strand}:${entry.item.id}`;
  const taken = new Set();
  const take = (list, max) => {
    const out = [];
    for (const entry of list) {
      if (out.length >= max) break;
      const key = entryKey(entry);
      if (taken.has(key)) continue;
      taken.add(key);
      out.push(entry);
    }
    return out;
  };

  const chosenMistakes = take(mistakeReviews, generalLimit);
  const newSlots = Math.max(0, Math.min(newTarget, generalLimit - chosenMistakes.length));
  const chosenFresh = take(fresh, newSlots);
  const staleSlots = Math.max(0, generalLimit - chosenMistakes.length - chosenFresh.length);
  const general = [...chosenMistakes, ...chosenFresh, ...take(throttledStale, staleSlots)];

  // Whatever the general pool did not already take, per reserved deck — same
  // priority as everywhere else in this function: mistakes, then fresh, then
  // a throttled slice of the rest.
  const reserved = [];
  // The reserve draws from the same new-word allowance as everything else.
  // Without this it topped every session up with fresh grammar items whatever
  // `newTarget` said, which would put the session over its own share and
  // squeeze the reviews back out.
  let freshBudget = Math.max(0, newTarget - general.filter((entry) => entry.isNew).length);
  for (const [deckId, min] of Object.entries(reserve)) {
    const candidates = [...mistakeReviews, ...fresh, ...throttledStale].filter(
      (entry) => entry.reserveId === deckId && !taken.has(entryKey(entry)),
    );
    for (const entry of candidates.slice(0, min)) {
      if (entry.isNew) {
        if (freshBudget <= 0) continue;
        freshBudget -= 1;
      }
      reserved.push(entry);
      taken.add(entryKey(entry));
    }
  }

  const chosen = [...general, ...reserved];
  shuffle(chosen, random);
  return chosen;
}

/**
 * A card just missed is a gap in memory that is actively closing — it should
 * come back. A card the Leitner box has simply not reviewed yet in a while is
 * a different thing: it is *held*, not fading, and treating every one of a
 * long backlog as equally urgent is what buried new words under "197 words
 * ready to come round again" and made every session a review session. So only
 * two kinds of card are drawn back into a session now: a genuine mistake
 * (tracked by the separate `mistakes` store, cleared the moment it is
 * answered right — see the block comment above `recordMistake`), which always
 * comes back; and a random slice of the rest of what is due, capped at this
 * fraction, so old words still resurface — spaced repetition still works —
 * without ever being able to outnumber new words the way an uncapped backlog
 * did.
 */
const STALE_REVIEW_SAMPLE = 0.2;

const EMPTY_SET = new Set();

/** The key `mistakes` entries are looked up by — matches `mistakeKey` in
 * shape (`deck:strand:itemId`) but named separately because it is keyed by a
 * *deck id string*, the same thing `buildMixedSession`'s own `entryKey` reads
 * off `entry.deck?.id`, not by the deck object itself. */
function mistakeEntryKey(deckId, strand, itemId) {
  return `${deckId ?? ''}:${strand}:${itemId}`;
}

/** `listMistakes()` rows → the Set `buildMixedSession` wants. Exported so
 * every screen that builds a session constructs this the same way. */
export function mistakeEntryKeys(rows) {
  return new Set((rows ?? []).map((row) => mistakeEntryKey(row.deck, row.strand, row.itemId)));
}

function shuffle(list, random = Math.random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
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
    // When this item was first met. The deck rows could say how many words
    // were known in total but not whether that number was still moving, which
    // is the only form of the question a learner actually asks. Written once,
    // on the first encounter; rows from before this existed simply have none
    // and are counted as "met, date unknown" rather than guessed at.
    firstAt: previous.firstAt ?? new Date().toISOString(),
  };
  await put('learn', record);
  // Deliberately not queued for the Worker. There is no /learn route, so every
  // correct answer used to file a payload that could only ever 404 — and since
  // the outbox is cleared as a batch, that one entry blocked attempts, reviews
  // and recordings from ever syncing again. Vocabulary progress is per-device
  // by design; sharing it across phones means adding a Worker route first.
  return record;
}

/**
 * Logs a finished drill session, so vocabulary work can reach the scoreboard.
 *
 * The drill's finish card has always shown "+N points", but nothing counted
 * them: the Woch-Duell added up listening answers, recordings and reviews, and
 * the `learn` store holds per-item boxes with no history to ask "what did you
 * practise this week". A session row is the missing event.
 *
 * Deliberately its own store rather than a row in `attempts`: readinessFor()
 * derives the B1 listening estimate from every attempt it can see, so filing
 * vocabulary work there would quietly corrupt the number the exam plan is
 * built on.
 */
export async function recordLearnSession(playerId, { correct, answered, byDeck = {} }) {
  if (answered === 0) return null;
  const record = {
    id: `${playerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerId,
    weekSeed: weekSeed(),
    correct,
    answered,
    // Cards answered per deck. Added because the home screen's "Grammar
    // drills" step was ticked by `todayProgress().cards >= 6`, which counts
    // *every* card answered today — so six vocabulary cards marked grammar as
    // done without a single grammar question being seen. A checklist that
    // ticks itself is worse than no checklist.
    byDeck,
    at: new Date().toISOString(),
    points: correct * POINTS.perLearnCorrect,
  };
  // Local only, for the same reason as recordLearnResult above: the Worker has
  // no route for it, and the duel scoreboard reads this device's own stores.
  await put('learnSessions', record);
  return record;
}

export const listLearnSessions = () => all('learnSessions');

/* ----------------------------------------------------------------- flags
 * Cards the player has called out, and what that does next time.
 *
 * The two complaints an exercise actually provokes are different problems and
 * deserve different answers, so the button asks which one it is:
 *
 *   `confusing`   the question or its answer does not make sense. There is
 *                 nothing to be gained from seeing it again, so it is
 *                 suppressed until the player takes the flag off.
 *   `repetitive`  the card is fine but it keeps coming round. Suppressing it
 *                 forever would be wrong — repetition is how the scheduler
 *                 works and the word may genuinely not be learned yet — so it
 *                 is rested for a fortnight and then allowed back.
 *
 * Deliberately *not* a second scheduler, for the same reason the mistakes list
 * is not one: the Leitner box still decides when a word is due. A flag only
 * removes a card from the pool an exercise draws on, which means unflagging
 * restores it with its real schedule intact rather than a reset one.
 *
 * Local only. There is no Worker route for it and no reason to have one — this
 * is one person's judgement about what is worth their time, and the other
 * player's opinion of the same card is their own.
 */

/** How long a "seen too often" flag rests a card before it can return. */
export const FLAG_REST_DAYS = 14;

export const FLAG_REASONS = {
  confusing: 'This does not make sense',
  repetitive: 'I have seen this far too often',
  // Filed by the skip on an audio-only card. Its own reason rather than
  // `confusing`, because it says something different and more useful: the card
  // may be perfectly well written and the *recording* is what did not arrive.
  // Suppressed like `confusing` — permanently, until undone — since a clip that
  // will not play is not a card that gets better by coming round again.
  silent: 'The audio would not play',
};

/**
 * A card's identity, across exercises that have nothing else in common.
 *
 * `source` is the exercise or deck, `id` whatever that exercise already uses
 * to name an item. Both are needed: the vocabulary deck and the picture game
 * can hold the same lemma id and are not the same card.
 */
export const flagKey = (playerId, source, id) => `${playerId}:${source}:${id}`;

/**
 * Records a flag. `label` is a short human-readable version of the card, kept
 * so Settings can list what was flagged without having to reload every deck
 * and re-derive it.
 */
export async function flagCard(playerId, { source, id, label, reason }) {
  if (!playerId || !source || !id) return null;
  const key = flagKey(playerId, source, id);
  const previous = await get('flags', key);
  const record = {
    key,
    playerId,
    source,
    itemId: String(id),
    label: label ?? previous?.label ?? String(id),
    reason: reason ?? 'confusing',
    // Kept across re-flags: a card flagged twice for coming round too often is
    // a stronger signal than one flagged once, and the count is what makes
    // that visible in Settings.
    count: (previous?.count ?? 0) + 1,
    at: new Date().toISOString(),
  };
  await put('flags', record);
  // A flagged card stops being a mistake.
  //
  // Reported as "the questions with a recording that don't have audio are
  // marked as defective but still show as mistakes". They did: the skip filed
  // the flag and dropped the card from the queue, but the mistake row written
  // when the card was first failed — because it could not be heard — stayed
  // behind, so the card kept its place in the named, finite list the learner is
  // being asked to clear. It cannot be cleared: the only way a mistake row goes
  // is answering that card correctly, and this is a card that cannot be
  // answered at all.
  //
  // True of every reason, not just `silent`. Whatever the complaint, the card
  // has been taken out of circulation, and a to-do list you have no way of
  // finishing is worse than one that is short.
  await clearMistakesFor(playerId, source, id);
  return record;
}

export async function unflagCard(playerId, source, id) {
  const db = await openDb();
  return promisify(tx(db, 'flags', 'readwrite').delete(flagKey(playerId, source, id)));
}

export const listFlags = () => all('flags');

/**
 * Whether a flag is still holding a card back, at a given moment.
 *
 * Pure and exported so the rest-period rule can be tested without a browser
 * and without waiting a fortnight.
 */
export function flagActive(flag, now = Date.now()) {
  if (!flag) return false;
  if (flag.reason !== 'repetitive') return true;
  const rested = now - new Date(flag.at).getTime();
  return rested < FLAG_REST_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * The ids an exercise should leave out of its round.
 *
 * Takes the whole flag list rather than querying per card, because every
 * caller is about to filter a pool and one read is cheaper than hundreds.
 */
export function suppressedIds(flags, source, playerId, now = Date.now()) {
  const out = new Set();
  for (const flag of flags ?? []) {
    if (flag.source !== source) continue;
    if (playerId && flag.playerId !== playerId) continue;
    if (flagActive(flag, now)) out.add(flag.itemId);
  }
  return out;
}

/** Convenience for a screen that only wants the set. */
export async function suppressedFor(source, playerId, now = Date.now()) {
  return suppressedIds(await listFlags(), source, playerId, now);
}

/**
 * Every active flag as `deckId:itemId`, which is the shape the session
 * builders filter on.
 *
 * The drill decks all go through `buildMixedSession`, which sees several decks
 * at once, so one flat set spanning them is simpler than a set per deck — and
 * it is what lets the filter live in the builder rather than being repeated in
 * the five screens that call it.
 */
export function flaggedCardKeys(flags, playerId, now = Date.now()) {
  const out = new Set();
  for (const flag of flags ?? []) {
    if (playerId && flag.playerId !== playerId) continue;
    if (flagActive(flag, now)) out.add(`${flag.source}:${flag.itemId}`);
  }
  return out;
}

/** The same, read straight from the store. */
export async function flaggedCards(playerId, now = Date.now()) {
  return flaggedCardKeys(await listFlags(), playerId, now);
}

/* -------------------------------------------------------------- mistakes
 * The cards you have got wrong, kept until you get them right.
 *
 * The drill already re-asks a missed card three cards later, but that is the
 * only second chance it ever gets: once the session ends the miss is gone, and
 * whether the word comes back is left to its Leitner box — which is correct
 * scheduling and completely invisible. Duolingo's Practice Hub is built on the
 * opposite instinct and it is the right one: a learner wants a *named, finite,
 * completable* list of the things they personally got wrong, not a promise
 * that the algorithm has it in hand.
 *
 * This is deliberately not a second scheduler. The Leitner box still decides
 * when a word is due; this only records that a specific card was missed, so it
 * can be drilled on purpose. A row is removed the moment that card is answered
 * correctly anywhere, so the list only ever shrinks by being earned.
 */

function mistakeKey(playerId, deck, strand, itemId) {
  return `${playerId}:${deck}:${strand}:${itemId}`;
}

export async function recordMistake(playerId, deck, strand, itemId) {
  const key = mistakeKey(playerId, deck, strand, itemId);
  const previous = await get('mistakes', key);
  await put('mistakes', {
    key,
    playerId,
    deck,
    strand,
    itemId,
    // How many times this exact card has been missed. Shown as "missed twice",
    // which is the honest signal that something needs a different approach.
    misses: (previous?.misses ?? 0) + 1,
    at: new Date().toISOString(),
  });
}

/** Answered right, so it stops being a mistake. */
export async function clearMistake(playerId, deck, strand, itemId) {
  const db = await openDb();
  return promisify(tx(db, 'mistakes', 'readwrite').delete(mistakeKey(playerId, deck, strand, itemId)));
}

/**
 * Every mistake row for one card, across both strands.
 *
 * A card is missed per strand — `recv` and `prod` are separate rows — so
 * retiring the card has to clear both. Called by `flagCard`; see the note
 * there for why a flagged card must not stay on the mistakes list.
 */
export async function clearMistakesFor(playerId, deck, itemId) {
  await Promise.all(Object.values(STRANDS).map((strand) => clearMistake(playerId, deck, strand, String(itemId))));
}

/**
 * Mistake rows minus the cards that have been reported.
 *
 * Pure, so the rule can be tested without a browser — the store call below is
 * two reads and this.
 *
 * Filtering as well as deleting on flag is deliberate. `flagCard` clears the
 * rows it knows about, but rows written before a card was flagged, on the
 * other device, or under an older build would otherwise sit in the list for
 * good. The list is meant to be finite and completable and the only way a row
 * leaves is answering that card correctly — which is impossible for a card
 * that has been taken out of circulation, and doubly so for one whose
 * recording never plays. That was the report: audio cards "marked as defective
 * but still show as mistakes".
 *
 * Unflagging in Settings returns the card to the pool without resurrecting the
 * miss, which is the right way round: it gets a clean start.
 */
export function activeMistakes(rows, flags, playerId, now = Date.now()) {
  const blocked = flaggedCardKeys(flags, playerId, now);
  return (rows ?? []).filter((row) => !blocked.has(`${row.deck}:${row.itemId}`));
}

/** The cards you have got wrong and can still do something about. */
export async function listMistakes(playerId, now = Date.now()) {
  const [rows, flags] = await Promise.all([allByIndex('mistakes', 'byPlayer', playerId), listFlags()]);
  return activeMistakes(rows, flags, playerId, now);
}

/**
 * How much practice has actually happened today.
 *
 * The one number on the home screen that can only go up. Derived from the
 * session log rather than from the Leitner rows, because the boxes record
 * *state* — where each word stands — and say nothing about effort spent
 * getting there.
 */
export async function todayProgress(playerId, { now = Date.now(), goal = DAILY_CARD_GOAL } = {}) {
  const rows = await all('learnSessions');
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const mine = rows.filter((row) => row.playerId === playerId && (Date.parse(row.at) || 0) >= dayStart);
  const cards = mine.reduce((sum, row) => sum + (row.answered ?? 0), 0);
  const correct = mine.reduce((sum, row) => sum + (row.correct ?? 0), 0);

  // Rows written before `byDeck` existed simply contribute nothing to it. That
  // is the honest reading: those sessions did not record which deck they drew
  // from, so claiming any of them for grammar would be a guess.
  const byDeck = {};
  for (const row of mine) {
    for (const [deck, count] of Object.entries(row.byDeck ?? {})) {
      byDeck[deck] = (byDeck[deck] ?? 0) + count;
    }
  }

  return {
    cards,
    correct,
    byDeck,
    sessions: mine.length,
    goal,
    met: cards >= goal,
    pct: goal === 0 ? 0 : Math.min(100, (cards / goal) * 100),
  };
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
  const strong = rows.filter((row) => row.box >= STRONG_BOX).length;

  // How many met items sit in each box. This is the only progress figure here
  // that responds to a session on the day it happens — see `strength` below.
  const boxes = Array.from({ length: MAX_BOX + 1 }, () => 0);
  for (const row of rows) boxes[Math.min(Math.max(row.box, 0), MAX_BOX)] += 1;

  return {
    started: rows.length,
    strong,
    mastered,
    boxes,
    total: totalItems,
    pct: totalItems === 0 ? 0 : (mastered / totalItems) * 100,
    // Of the words actually met so far, how many have stuck.
    heldPct: rows.length === 0 ? 0 : (strong / rows.length) * 100,
    /**
     * How far up the ladder the met items are, on average, as a percentage.
     *
     * `heldPct` was supposed to be the number that moves after one session,
     * and it is not: `strong` means box 3, and the intervals are 0/1/3/7 days,
     * so the *earliest* an item can count is day 11. `mastered` is day 27. So
     * both bars on every deck row were frozen for a beginner's first fortnight
     * however much they drilled — which is exactly what a broken app looks
     * like.
     *
     * This moves on every correct answer, because every correct answer
     * promotes a box, and falls when something is forgotten. It is not a
     * completion figure and is not shown as one; it is the shape of what you
     * know, which is the honest thing to report daily.
     */
    strength: rows.length === 0 ? 0 : (rows.reduce((sum, row) => sum + Math.min(row.box, MAX_BOX), 0) / (rows.length * MAX_BOX)) * 100,
  };
}

/**
 * Is the deck still moving, or just circling?
 *
 * Answers the one question the other numbers dodge. "412 words met" says
 * nothing about whether that figure moved this week, and a learner grinding
 * the same forty words every evening sees a large total and a stalled reality.
 *
 * Three facts, all read off rows that already exist:
 *
 *   met        distinct items ever met, across every deck and the recv strand
 *   metRecent  of those, how many were first met in the last `days` days —
 *              the number that says whether the front of the deck is advancing
 *   sticking   items sitting at box 0, i.e. missed at the last attempt. Box 0
 *              is due immediately by design, so every one of these comes back
 *              in the very next session. They are the literal answer to "why do
 *              I keep seeing the same words".
 */
export async function throughput(playerId, { days = 7, now = Date.now() } = {}) {
  const decks = Object.values(LEARN_DECKS);
  const rowSets = await Promise.all(decks.map((deck) => allByIndex('learn', 'byPlayerDeck', playerDeckKey(playerId, deck, STRANDS.recv))));
  const rows = rowSets.flat();

  const since = now - days * 86400000;
  let metRecent = 0;
  let sticking = 0;
  let undated = 0;
  for (const row of rows) {
    if (row.box === 0) sticking += 1;
    if (!row.firstAt) undated += 1;
    else if ((Date.parse(row.firstAt) || 0) >= since) metRecent += 1;
  }

  return { met: rows.length, metRecent, sticking, undated, days, perDay: metRecent / days };
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

  const counts = { recv: 0, prod: 0, newToday: 0 };
  for (const row of rows) {
    if (row.dueAt <= now) counts[row.strand] += 1;
    // seen === 1 on a recv row means the word was met for the first time; the
    // due date is when that first meeting was graded.
    if (row.strand === STRANDS.recv && row.seen === 1 && row.dueAt - LEITNER_DAYS[row.box] * 86400000 >= dayStart) {
      counts.newToday += 1;
    }
  }
  // No `newLeft`: there is no budget to have any left of. `newToday` is the
  // honest number and it only reports.
  return counts;
}

/**
 * How many new words have been met today.
 *
 * This used to be "how much of the budget is left", and every session builder
 * had to be handed it as `newTarget` or the cap leaked. There is no cap now, so
 * it reports rather than restricts: the number is worth seeing — it is the
 * honest measure of how much you have taken on and therefore of how big
 * tomorrow's review queue will be — but nothing is withheld once it is high.
 */
export async function newWordsToday(playerId, { now = Date.now() } = {}) {
  const counts = await dueCounts(playerId, { now });
  return counts.newToday ?? 0;
}
