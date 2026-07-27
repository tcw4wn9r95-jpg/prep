/**
 * The shared scoreboard. Nothing else.
 *
 * The brief is deliberate about how small this is: all progress lives in
 * IndexedDB on each phone, and the Worker holds only what genuinely has to be
 * shared — the weekly seed, both players' totals, and speaking submissions
 * waiting for the partner to score. If it is down, solo practice is unaffected.
 *
 * Auth is a shared secret in a query parameter. Two users, no signup, no OAuth.
 * That is proportionate here and nowhere else: the secret is sent on every
 * request, so this must only ever be served over https, and the value is a
 * bearer token for the pair's data, not a password anyone should reuse.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024; // KV's ceiling is 25 MB
const SUBMISSION_TTL_S = 60 * 60 * 24 * 30;
const PLAYERS = new Set(['diego', 'diana']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight(env);

    const auth = checkSecret(url, env);
    if (auth) return auth;

    try {
      return withCors(await route(request, url, env), env);
    } catch (error) {
      return withCors(json({ error: error.message }, 500), env);
    }
  },
};

async function route(request, url, env) {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/state' && request.method === 'GET') return getState(env);
  if (path === '/seed' && request.method === 'GET') return getSeed(env);
  if (path === '/attempt' && request.method === 'POST') return postAttempt(request, env);
  if (path === '/review' && request.method === 'POST') return postReview(request, env);
  if (path === '/recording' && request.method === 'POST') return postSubmissionMeta(request, env);
  if (path === '/submission' && request.method === 'POST') return postSubmissionMeta(request, env);

  const submissionMatch = path.match(/^\/submission\/([\w-]+)$/);
  if (submissionMatch) {
    if (request.method === 'PUT') return putSubmission(request, env, submissionMatch[1]);
    if (request.method === 'GET') return getSubmission(env, submissionMatch[1]);
  }

  return json({ error: 'not found' }, 404);
}

/* ------------------------------------------------------------------ auth */

function checkSecret(url, env) {
  const expected = env.SHARED_SECRET;
  // An unset secret means the Worker was deployed without configuring it.
  // Refusing is the safe default: an open endpoint would let anyone write to
  // the pair's scoreboard.
  if (!expected) return json({ error: 'worker has no SHARED_SECRET configured' }, 503);
  const given = url.searchParams.get('k') ?? '';
  if (!timingSafeEqual(given, expected)) return json({ error: 'bad secret' }, 401);
  return null;
}

/** Constant-time compare so the secret cannot be guessed a character at a time. */
function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

/* ----------------------------------------------------------------- state */

const stateKey = () => 'state:v1';

async function readState(env) {
  return (await env.DUEL.get(stateKey(), 'json')) ?? { players: {}, updatedAt: null };
}

async function writeState(env, state) {
  state.updatedAt = new Date().toISOString();
  await env.DUEL.put(stateKey(), JSON.stringify(state));
  return state;
}

async function getState(env) {
  const state = await readState(env);
  const pending = await env.DUEL.list({ prefix: 'sub:' });
  return json({
    ...state,
    seed: currentSeed(),
    pending: pending.keys.map((key) => ({ id: key.name.slice(4), ...(key.metadata ?? {}) })),
  });
}

/**
 * The Woch-Duell seed, fixed every Monday. Derived from the week number rather
 * than stored, so both players agree even if one has never synced.
 */
function currentSeed(now = Date.now()) {
  const date = new Date(now);
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const monday = utc - ((new Date(utc).getUTCDay() + 6) % 7) * 86400000;
  return Math.floor(monday / 86400000);
}

function getSeed() {
  return json({ seed: currentSeed(), week: new Date(currentSeed() * 86400000).toISOString().slice(0, 10), ttlMs: WEEK_MS });
}

/* --------------------------------------------------------------- writes */

async function postAttempt(request, env) {
  const body = await request.json();
  const record = body.record ?? body;
  if (!PLAYERS.has(record.playerId)) return json({ error: 'unknown player' }, 400);

  const state = await readState(env);
  const player = ensurePlayer(state, record.playerId);
  // Idempotent: replaying the outbox must not double-count.
  if (player.attemptIds.includes(record.id)) return json({ ok: true, duplicate: true });

  player.attemptIds.push(record.id);
  player.correct += Number(record.correct) || 0;
  player.answered += Number(record.total) || 0;
  player.points += Number(record.points) || 0;
  player.byTopic[record.topic] = player.byTopic[record.topic] ?? { correct: 0, total: 0 };
  player.byTopic[record.topic].correct += Number(record.correct) || 0;
  player.byTopic[record.topic].total += Number(record.total) || 0;

  await writeState(env, state);
  return json({ ok: true });
}

async function postReview(request, env) {
  const body = await request.json();
  const record = body.record ?? body;
  if (!PLAYERS.has(record.reviewerId)) return json({ error: 'unknown reviewer' }, 400);

  const state = await readState(env);
  const player = ensurePlayer(state, record.reviewerId);
  if (player.reviewIds.includes(record.id)) return json({ ok: true, duplicate: true });

  player.reviewIds.push(record.id);
  player.points += Number(record.points) || 0;
  state.reviews = state.reviews ?? {};
  state.reviews[record.recordingId] = {
    reviewerId: record.reviewerId,
    bands: record.bands,
    globalNote: record.globalNote,
    note: record.note ?? '',
    at: record.at,
  };

  // Once scored, the audio has done its job and can go.
  await env.DUEL.delete(`sub:${record.recordingId}`);
  await writeState(env, state);
  return json({ ok: true });
}

async function postSubmissionMeta(request, env) {
  const meta = await request.json();
  if (!PLAYERS.has(meta.playerId)) return json({ error: 'unknown player' }, 400);
  const state = await readState(env);
  const player = ensurePlayer(state, meta.playerId);
  if (!player.recordingIds.includes(meta.id)) {
    player.recordingIds.push(meta.id);
    player.points += 15;
  }
  await writeState(env, state);
  return json({ ok: true, oversize: Boolean(meta.oversize) });
}

async function putSubmission(request, env, id) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_SUBMISSION_BYTES) {
    return json({ error: 'recording too large', limit: MAX_SUBMISSION_BYTES }, 413);
  }

  let meta = {};
  try {
    meta = JSON.parse(decodeURIComponent(request.headers.get('x-meta') ?? '{}'));
  } catch {
    /* metadata is a convenience; a malformed header must not lose the audio */
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_SUBMISSION_BYTES) {
    return json({ error: 'recording too large', limit: MAX_SUBMISSION_BYTES }, 413);
  }

  await env.DUEL.put(`sub:${id}`, body, {
    expirationTtl: SUBMISSION_TTL_S,
    metadata: {
      playerId: meta.playerId ?? null,
      topic: meta.topic ?? null,
      kind: meta.recordingKind ?? meta.kind ?? null,
      durationMs: meta.durationMs ?? null,
      mime: request.headers.get('content-type') ?? 'audio/mp4',
      at: new Date().toISOString(),
    },
  });

  await postSubmissionMeta(new Request('https://x/', { method: 'POST', body: JSON.stringify({ ...meta, id }) }), env);
  return json({ ok: true, id });
}

async function getSubmission(env, id) {
  const { value, metadata } = await env.DUEL.getWithMetadata(`sub:${id}`, 'arrayBuffer');
  if (!value) return json({ error: 'not found' }, 404);
  return new Response(value, {
    headers: {
      'content-type': metadata?.mime ?? 'audio/mp4',
      'cache-control': 'private, max-age=300',
    },
  });
}

function ensurePlayer(state, id) {
  state.players[id] = state.players[id] ?? {
    points: 0,
    correct: 0,
    answered: 0,
    attemptIds: [],
    reviewIds: [],
    recordingIds: [],
    byTopic: {},
  };
  return state.players[id];
}

/* ------------------------------------------------------------------ http */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * CORS is pinned to the Pages origin. `*` would let any site the pair happen
 * to visit read their scoreboard using the secret in the URL.
 */
function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN ?? 'null',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,x-meta',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function preflight(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function withCors(response, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export { currentSeed };
