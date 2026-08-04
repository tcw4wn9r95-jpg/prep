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

/**
 * The INLL A2 speaking grid, mirrored from app/js/store.js CRITERIA so the
 * machine estimate is scored against the same rubric the peer reviewer uses.
 */
const CRITERIA = [
  { id: 'lexik', name: 'Lexik', desc: 'Range of A2 vocabulary, and whether it is used appropriately.' },
  { id: 'morphosyntax', name: 'Morphosyntax', desc: 'Range of A2 grammatical structures, and whether they are used appropriately.' },
  { id: 'phoneetik', name: 'Phoneetik', desc: 'Expressing yourself clearly and fluently.' },
  { id: 'aufgabenerfellung', name: 'Aufgabenerfëllung', desc: 'Interacting in a conversation, describing an image, being understood and coherent.' },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight(env);

    // withCors, not a bare return: an auth failure is still a response the
    // browser has to be allowed to read. Without the header the fetch rejects
    // with an opaque TypeError ("Load failed" in Safari) and the app cannot
    // tell a misconfigured secret from the network being down.
    const auth = checkSecret(url, env);
    if (auth) return withCors(auth, env);

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

  const feedbackMatch = path.match(/^\/feedback\/([\w-]+)$/);
  if (feedbackMatch && request.method === 'POST') return postFeedback(env, feedbackMatch[1]);

  if (path === '/explain' && request.method === 'POST') return postExplain(request, env);
  if (path === '/episode-questions' && request.method === 'POST') return postEpisodeQuestions(request, env);

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

/* ------------------------------------------------------- machine feedback
 * "Layer 2" from the brief: a formative, honestly-unreliable estimate — never
 * the score of record. Whisper transcribes (Luxembourgish support is genuinely
 * poor; that is stated to the user, not hidden), Claude grades the transcript
 * against the same rubric the peer reviewer uses, told explicitly to treat
 * transcription noise as noise rather than as a language mistake.
 */

async function postFeedback(env, id) {
  if (!env.OPENAI_API_KEY || !env.ANTHROPIC_API_KEY) {
    return json({ error: 'machine feedback is not configured on this Worker' }, 503);
  }

  const cached = await env.DUEL.get(`fb:${id}`, 'json');
  if (cached) return json({ ...cached, cached: true });

  const { value: audio, metadata } = await env.DUEL.getWithMetadata(`sub:${id}`, 'arrayBuffer');
  if (!audio) {
    return json({ error: 'recording not found — it may already have been scored and removed' }, 404);
  }

  let transcript;
  try {
    transcript = await transcribe(env, audio, metadata?.mime ?? 'audio/mp4');
  } catch (error) {
    return json({ error: `transcription failed: ${error.message}` }, 502);
  }

  if (!transcript.trim()) {
    return json({ error: 'transcription came back empty — the recording may be silent or too short' }, 422);
  }

  let result;
  try {
    result = await grade(env, transcript);
  } catch (error) {
    return json({ error: `grading failed: ${error.message}` }, 502);
  }

  const payload = { transcript, ...result, at: new Date().toISOString() };
  await env.DUEL.put(`fb:${id}`, JSON.stringify(payload), { expirationTtl: SUBMISSION_TTL_S });
  return json(payload);
}

/** Whisper's own multi-language model, told explicitly this is Luxembourgish. */
async function transcribe(env, audio, mime) {
  const extension = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'm4a';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mime }), `recording.${extension}`);
  form.append('model', 'whisper-1');
  form.append('language', 'lb');
  form.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Whisper ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json();
  return body.text ?? '';
}

const GRADE_SYSTEM_PROMPT = `You are giving a beginner an honest, formative, unofficial estimate of a Luxembourgish A2 speaking answer, transcribed by automatic speech recognition. Luxembourgish ASR quality is low — the transcript is noisy. Do not penalise probable transcription artefacts (garbled words, missing punctuation, odd spacing); only flag things you are reasonably confident are genuine language issues, and say so if you are unsure rather than inventing errors.

Score against these four criteria, each 0-5, the same rubric a human peer will use:
${CRITERIA.map((criterion) => `- ${criterion.id} (${criterion.name}): ${criterion.desc}`).join('\n')}

Respond with ONLY a JSON object, no prose outside it, shaped exactly like:
{"bands": {"lexik": 0-5, "morphosyntax": 0-5, "phoneetik": 0-5, "aufgabenerfellung": 0-5}, "note": "one short, encouraging, actionable sentence in English", "confidence": "low"|"medium"|"high"}

"confidence" reflects how much the ASR noise limits your judgement — be honest, most Luxembourgish transcripts warrant "low" or "medium".`;

async function grade(env, transcript) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: GRADE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
    }),
  });
  if (!response.ok) throw new Error(`Claude ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json();
  const text = body.content?.[0]?.text ?? '';

  let parsed;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new Error('could not parse the model response as JSON');
  }
  const bands = {};
  for (const criterion of CRITERIA) {
    const value = Number(parsed.bands?.[criterion.id]);
    bands[criterion.id] = Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : null;
  }
  return {
    bands,
    note: typeof parsed.note === 'string' ? parsed.note : '',
    confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
  };
}

/* ------------------------------------------------------- sentence explain
 * Learn's vocab and verb cards show a real LOD example sentence. A gloss of
 * the headword is already free; what a beginner actually wants next is why
 * the sentence is put together the way it is — word order, an idiom, a false
 * friend — not a second, redundant translation. That needs an LLM. The
 * explanation is the same for everyone who sees a given sentence, so unlike
 * the machine estimate (per-recording, per-user) this is cached forever by
 * content, not by id, and never re-billed once generated.
 */

async function postExplain(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'sentence explanations are not configured on this Worker' }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const lb = String(body.lb ?? '').trim();
  const word = String(body.word ?? '').trim();
  const en = String(body.en ?? '').trim();
  // What exercise the learner just answered about this sentence. Optional: an
  // older app build sends none, and the prompt copes.
  const task = String(body.task ?? '').trim();
  if (!lb) return json({ error: 'missing "lb" sentence' }, 400);

  // The task is part of the key. Cached on the sentence alone, the first
  // explanation a sentence ever got was replayed for every later exercise on
  // it — so the gender card's answer would come back for the n-rule card, and
  // making the prompt context-aware would have bought nothing.
  const cacheKey = `ex:${await sha256hex(`${lb}|${word}|${task}`)}`;
  const cached = await env.DUEL.get(cacheKey, 'json');
  if (cached) return json({ ...cached, cached: true });

  let explanation;
  try {
    explanation = await explain(env, { lb, word, en, task });
  } catch (error) {
    return json({ error: `explanation failed: ${error.message}` }, 502);
  }

  const payload = { explanation, at: new Date().toISOString() };
  // Evergreen content, not tied to a user or a recording — no expiry.
  await env.DUEL.put(cacheKey, JSON.stringify(payload));
  return json(payload);
}

const EXPLAIN_SYSTEM_PROMPT = `You help an English-speaking A1/A2 learner of Luxembourgish understand one real example sentence from a dictionary. You are told the sentence, the headword it illustrates, that word's English gloss, and — when it is known — the exercise the learner has just answered about it.

Do NOT just translate the sentence — the learner already has the gloss. Instead, in 2-3 short sentences, help them understand and remember it: point out word order, a grammatical structure worth noticing, an idiom or figurative meaning, a false friend, or how the headword's form here relates to its dictionary form. Be concrete and specific to this sentence, not generic advice.

When you are told what the exercise was, answer THAT question first. Explaining word order to someone who was asked whether a noun is männlech or weiblech is not help. For example: a gender question wants whatever makes this noun's gender memorable and any article visible in the sentence; an Eifeler Regel question wants why the final n is kept or dropped at that exact spot, naming the sound that follows; an agreement question wants what the adjective is agreeing with; a listening question wants what is hard to catch by ear here — a swallowed ending, a contraction, two words running together.

Luxembourgish is NOT German, and it is not a German dialect for the purposes of these explanations. It is close enough that the wrong rule is easy to reach for, so: never explain a Luxembourgish form by a German one, never state a German rule as though it applied, and never say a word "comes from" or "is like" its German cognate as the explanation. Specifically — Luxembourgish has no case endings on adjectives of the German kind and no genitive; its articles are den/d'/de/e/eng, not der/die/das; nouns are männlech, weiblech or neutral and a noun's gender frequently differs from its German cognate; the perfect is formed with hunn or sinn and is the ordinary way to talk about the past, where German would often use a simple past; and the Eifeler Regel, which drops a final n before most consonants, has no German equivalent at all. If you are not sure of the Luxembourgish rule, describe what this sentence actually does and say plainly that you are describing this example rather than stating a rule. Do not fill the gap with German.

Respond with ONLY a JSON object, no prose outside it: {"explanation": "..."}`;

/**
 * The user turn. Mirrors app/js/anthropic.js `explainPrompt` — the two paths
 * must ask the same question, or an explanation would depend on whether a
 * Worker happened to be configured.
 */
function explainPrompt({ lb, word, en, task }) {
  const lines = [`Sentence: ${lb}`, `Headword: ${word}`, `Headword gloss: ${en || '(none given)'}`];
  if (task) lines.push(`The exercise they just answered: ${task}`);
  return lines.join('\n');
}

/** Claude explains one sentence; cheap and cacheable, so Haiku is the right fit. */
async function explain(env, { lb, word, en, task }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system: EXPLAIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: explainPrompt({ lb, word, en, task }) }],
    }),
  });
  if (!response.ok) throw new Error(`Claude ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json();
  const text = body.content?.[0]?.text ?? '';

  let parsed;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new Error('could not parse the model response as JSON');
  }
  if (typeof parsed.explanation !== 'string' || !parsed.explanation.trim()) {
    throw new Error('model response had no explanation text');
  }
  return parsed.explanation.trim();
}

/* ------------------------------------------------- podcast comprehension */

/**
 * Comprehension questions for one INLL podcast episode.
 *
 * This lives in the Worker rather than the app for a reason that is not about
 * secrets: a podcast feed and a transcript file send no CORS headers, so a
 * browser cannot read either. Only a server can.
 *
 * The generation rule is the important part. This app's founding constraint is
 * that no model ever authors Luxembourgish — `pipeline/README.md` puts it as
 * "generating novel sentences would produce items that pass the gate and still
 * teach the wrong thing". That constraint does not stop applying because the
 * text arrives at runtime instead of at build time. So the model is not asked
 * to *write* anything in Luxembourgish: it writes an English question and then
 * quotes, verbatim, spans of what was actually said. Selecting and quoting is
 * the one job it can do here without drifting.
 *
 * And the rule is enforced rather than requested — `verbatimOnly()` below drops
 * any option that does not literally occur in the transcript, before anything
 * is cached. A prompt is a wish; the check is the guarantee.
 */
async function postEpisodeQuestions(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'episode questions are not configured on this Worker' }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const episodeId = String(body.episodeId ?? '').trim();
  const transcriptUrl = String(body.transcriptUrl ?? '').trim();
  const audioSrc = String(body.audioSrc ?? '').trim();
  const feedUrl = String(body.feedUrl ?? '').trim();
  // The index already knows, from build time, whether a transcript exists at
  // all. `false` is a definite no, so the feed fetch is skipped entirely
  // rather than spent proving it. Undefined means an older index that never
  // recorded the answer — then it is still worth looking.
  const hasTranscript = body.hasTranscript;
  if (!episodeId) return json({ error: 'missing "episodeId"' }, 400);
  if (!transcriptUrl && !audioSrc) return json({ error: 'need a transcriptUrl or an audioSrc' }, 400);

  // Evergreen and not tied to a user: the same episode yields the same
  // questions forever, so whoever listens second pays nothing. Same discipline
  // as /explain. The "v2" is a prompt version, not a schema version — bump it
  // whenever EPISODE_SYSTEM_PROMPT changes meaningfully, so a rewritten prompt
  // (e.g. tightening distractor quality) reaches already-cached episodes
  // instead of every future listener getting the old prompt's output forever.
  const cacheKey = `pq:v2:${await sha256hex(episodeId)}`;
  const cached = await env.DUEL.get(cacheKey, 'json');
  if (cached) return json({ ...cached, cached: true });

  let transcript = null;
  let via = null;
  try {
    if (transcriptUrl) {
      transcript = await fetchTranscript(transcriptUrl);
      via = 'published';
    } else if (feedUrl && audioSrc && hasTranscript !== false) {
      // INLL doesn't tag most episodes with <podcast:transcript>, but embeds
      // the transcript in the item's own <description> instead — see the
      // note in pipeline/fetch-podcasts.js. Worth a live look before paying
      // for Whisper.
      transcript = await fetchTranscriptFromFeedDescription(feedUrl, audioSrc);
      if (transcript) via = 'published';
    }

    if (!transcript) {
      if (!audioSrc) return json({ error: 'no transcript available and no audio to transcribe' }, 422);
      if (!env.OPENAI_API_KEY) {
        // 422, not 503: for this episode there is nothing to read and no
        // configuration that would change that today. The app distinguishes
        // the two — `noTranscript` means "not this episode", where a 503
        // would mean "not this Worker, yet".
        return json(
          { error: 'INLL publishes no transcript for this episode, so there is nothing to build questions from.', noTranscript: true },
          422,
        );
      }
      transcript = await transcribeEpisode(env, audioSrc);
      via = 'whisper';
    }
  } catch (error) {
    return json({ error: `could not get a transcript: ${error.message}` }, 502);
  }

  if (transcript.trim().length < 200) {
    return json({ error: 'the transcript is too short to ask about' }, 422);
  }

  let questions;
  try {
    questions = await askEpisode(env, transcript);
  } catch (error) {
    return json({ error: `question generation failed: ${error.message}` }, 502);
  }

  questions = verbatimOnly(questions, transcript);
  if (questions.length === 0) {
    return json({ error: 'no question survived the verbatim check — the transcript may be too noisy' }, 422);
  }

  const payload = { questions, via, at: new Date().toISOString() };
  await env.DUEL.put(cacheKey, JSON.stringify(payload));
  return json(payload);
}

/** Plain text, or WebVTT/SRT reduced to its spoken lines. */
async function fetchTranscript(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'sproochentest-prep/0.1' } });
  if (!response.ok) throw new Error(`${response.status} fetching the transcript`);
  const raw = await response.text();

  if (!/^WEBVTT|-->/m.test(raw)) return raw;
  // Drop cue numbers, timing lines and the WEBVTT header; keep the speech.
  return raw
    .split(/\r?\n/)
    .filter((line) => !/-->/.test(line) && !/^WEBVTT/.test(line) && !/^\d+$/.test(line.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The transcript INLL embeds in an episode's own <description>, after a
 * literal "Transkript:" marker — not the Podcasting 2.0 tag, so it is only
 * found by re-reading the feed. Returns null (never throws) when this
 * episode has no marker, so the caller falls back to Whisper.
 *
 * Fetched live, matched by enclosure URL, and never cached or written
 * anywhere except the in-memory question-generation step that follows —
 * same rule as fetchTranscript().
 */
async function fetchTranscriptFromFeedDescription(feedUrl, audioSrc) {
  const response = await fetch(feedUrl, { headers: { 'user-agent': 'sproochentest-prep/0.1' } });
  if (!response.ok) throw new Error(`${response.status} fetching the feed`);
  const xml = await response.text();

  // Located by two native string searches rather than by regex-scanning the
  // whole document. The feed is ~1.3 MB, and building match objects for all
  // 200+ <item> blocks to reach one of them measured ~2.3x the CPU of this
  // on a dev machine. Neither is near a Worker's budget on that measurement,
  // so this is headroom rather than a fix: a CPU kill is not catchable, and
  // would reach the browser as a failed fetch with no CORS headers.
  const at = xml.indexOf(audioSrc);
  if (at === -1) return null;
  const start = xml.lastIndexOf('<item', at);
  const end = xml.indexOf('</item>', at);
  if (start === -1 || end === -1) return null;
  const item = xml.slice(start, end);

  const descMatch = item.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i);
  if (!descMatch) return null;
  const cdata = descMatch[1].match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  const description = cdata ? cdata[1] : descMatch[1];

  const marker = description.match(/transkript\s*:/i);
  if (!marker) return null;

  const text = description
    .slice(marker.index + marker[0].length)
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();

  return text.length >= 50 ? text : null;
}

/** Whisper, on an episode we stream rather than store. */
async function transcribeEpisode(env, audioSrc) {
  const response = await fetch(audioSrc);
  if (!response.ok) throw new Error(`${response.status} fetching the episode audio`);
  const audio = await response.arrayBuffer();
  // Whisper's own limit. A long episode is refused rather than truncated into
  // questions about only its first half.
  if (audio.byteLength > 25 * 1024 * 1024) throw new Error('episode is larger than Whisper accepts (25 MB)');
  return transcribe(env, audio, response.headers.get('content-type') ?? 'audio/mpeg');
}

const EPISODE_SYSTEM_PROMPT = `You write listening-comprehension questions for an English-speaking learner of Luxembourgish preparing for the INLL Sproochentest (B1 listening). You are given the transcript of one podcast episode.

Write 5 multiple-choice questions that can only be answered by having understood the episode. Spread them across the episode rather than clustering at the start.

THE ABSOLUTE RULE: you must never write Luxembourgish. Every option — the correct one and every distractor — must be a span of text copied EXACTLY, character for character, from the transcript. Copy a contiguous run of 3 to 12 words. Do not translate, paraphrase, correct, shorten, re-punctuate or fix anything, even if the transcript looks wrong. An option that is not an exact substring of the transcript will be discarded and your question thrown away.

Distractors must be real spans from elsewhere in the same episode — but a distractor only tests listening if someone who half-understood the episode could plausibly pick it. So each distractor must be the same *kind* of answer as the correct one: if the question asks when, all three options are moments in time; if it asks who, all three are people; if it asks where, all three are places. Never pair a correct answer with a distractor that is a different kind of thing entirely (a time slot next to a person's name, a place next to a reason) — that makes the wrong options obvious without understanding a word. Prefer distractors mentioned in the same part of the episode as the correct answer, about the same topic, so the only way to tell them apart is having understood what was actually said.

The question itself is in English.

Respond with ONLY a JSON object, no prose outside it:
{"questions": [{"question_en": "...", "options_lb": ["exact span", "exact span", "exact span"], "correct": 0}]}

"correct" is the 0-based index into options_lb. Give exactly 3 options per question.`;

async function askEpisode(env, transcript) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: EPISODE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Transcript:\n${transcript.slice(0, 40000)}` }],
    }),
  });
  if (!response.ok) throw new Error(`Claude ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const answer = await response.json();
  const text = answer.content?.[0]?.text ?? '';

  let parsed;
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new Error('could not parse the model response as JSON');
  }
  if (!Array.isArray(parsed.questions)) throw new Error('model response had no questions array');
  return parsed.questions;
}

/**
 * Throws away everything that is not literally in the transcript.
 *
 * This is what makes the no-authored-Luxembourgish rule true rather than
 * merely requested. Whitespace is normalised before comparing — a model
 * re-wrapping a line is not the failure mode worth guarding against; inventing
 * a plausible-sounding phrase is.
 *
 * A question keeps its meaning only if the correct answer survives, so losing
 * that drops the whole question rather than silently promoting a distractor.
 */
function verbatimOnly(questions, transcript) {
  const flat = transcript.replace(/\s+/g, ' ').toLowerCase();
  const kept = [];

  for (const question of questions) {
    if (typeof question?.question_en !== 'string' || !Array.isArray(question.options_lb)) continue;

    const correctText = question.options_lb[question.correct];
    const options = question.options_lb.filter(
      (option) => typeof option === 'string' && option.trim() && flat.includes(option.replace(/\s+/g, ' ').toLowerCase()),
    );
    if (options.length < 2 || !options.includes(correctText)) continue;

    kept.push({
      question_en: question.question_en.trim(),
      options_lb: options,
      correct: options.indexOf(correctText),
    });
  }
  return kept;
}

/** SHA-256 hex digest, for a stable cache key derived from sentence content. */
async function sha256hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
