/**
 * Talks to the Worker — and copes when it is not there.
 *
 * The brief is explicit: if the Worker is down, solo practice still works. So
 * every write has already been committed to IndexedDB before this module sees
 * it, and sync is a best-effort push of the outbox. Nothing here can block the
 * UI or lose data.
 */

import { listOutbox, clearOutbox, getRecording } from './store.js';
import { explainSentence } from './anthropic.js';

let lastSync = null;
let lastMessage = 'Not synced yet.';

export function lastSyncLabel() {
  return lastMessage;
}

/** A recording large enough to be worth refusing rather than timing out on. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function request(settings, path, init = {}) {
  const url = new URL(settings.workerUrl + path);
  if (settings.secret) url.searchParams.set('k', settings.secret);
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Is this failure worth retrying, or will it fail identically forever?
 *
 * A 404 means the Worker has no route for that payload — retrying it next sync,
 * and every sync after that, cannot succeed. Anything else (offline, 5xx, a
 * timeout) is worth keeping queued.
 */
function isPermanent(error) {
  return error.status === 400 || error.status === 404 || error.status === 405 || error.status === 422;
}

/**
 * Push everything queued, then pull shared state.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function syncNow(settings) {
  if (!settings.workerUrl) {
    lastMessage = 'No Worker configured — scores stay on this device.';
    return { ok: false, message: lastMessage };
  }
  if (!navigator.onLine) {
    lastMessage = 'Offline. Your practice is saved and will sync later.';
    return { ok: false, message: lastMessage };
  }

  const sent = [];
  let dropped = 0;

  try {
    const outbox = await listOutbox();

    for (const entry of outbox) {
      try {
        await send(settings, entry);
        sent.push(entry.id);
      } catch (error) {
        // One payload the Worker will never accept must not wedge the queue.
        // The outbox is only cleared *after* the loop, so a permanent failure
        // here used to mean nothing was ever cleared again — every attempt,
        // review and recording stayed stuck behind it, and the shared
        // scoreboard silently stopped updating for good.
        if (!isPermanent(error)) throw error;
        sent.push(entry.id);
        dropped += 1;
      }
    }

    if (sent.length > 0) await clearOutbox(sent);

    const state = await request(settings, '/state');
    lastSync = new Date();
    const note = dropped > 0 ? ` (${dropped} the Worker could not accept were discarded)` : '';
    lastMessage = `Synced ${sent.length} ${sent.length === 1 ? 'change' : 'changes'} at ${lastSync.toLocaleTimeString()}.${note}`;
    return { ok: true, message: lastMessage, state };
  } catch (error) {
    // Whatever did get through is still cleared, so a mid-way network drop
    // does not resend it on the next pass.
    if (sent.length > 0) await clearOutbox(sent).catch(() => {});
    lastMessage = `Could not reach the Worker (${error.message}). Everything is saved locally.`;
    return { ok: false, message: lastMessage };
  }
}

/**
 * Push one outbox entry.
 *
 * Throws with `.status` set when the Worker refuses it, so syncNow can tell a
 * payload that will never be accepted from a network blip worth retrying.
 */
async function send(settings, entry) {
  const { payload } = entry;

  if (payload.kind !== 'recording') {
    await request(settings, `/${payload.kind}`, { method: 'POST', body: JSON.stringify(payload) });
    return;
  }

  const record = await getRecording(payload.id);
  // The blob may be gone if the device cleared storage; drop it rather than
  // retrying an upload with nothing to upload.
  if (!record?.blob) return;

  if (record.blob.size > MAX_UPLOAD_BYTES) {
    // Metadata still syncs so the partner knows it exists.
    await request(settings, '/submission', {
      method: 'POST',
      body: JSON.stringify({ ...payload, oversize: true }),
    });
    return;
  }

  const url = new URL(`${settings.workerUrl}/submission/${payload.id}`);
  if (settings.secret) url.searchParams.set('k', settings.secret);
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': record.mime || 'audio/mp4', 'x-meta': encodeURIComponent(JSON.stringify(payload)) },
    body: record.blob,
  });
  if (!response.ok) {
    const error = new Error(`${response.status} on submission`);
    error.status = response.status;
    throw error;
  }
}

/** The week's shared seed, if the Worker has one. Falls back to the local week. */
export async function fetchSeed(settings) {
  if (!settings.workerUrl || !navigator.onLine) return null;
  try {
    const { seed } = await request(settings, '/seed');
    return seed ?? null;
  } catch {
    return null;
  }
}

/**
 * "Layer 2" — an optional, formative machine estimate of a speaking
 * recording. Same soft-fail shape as the rest of this module: never throws,
 * always returns something the UI can show directly.
 *
 * Uploads the recording first (idempotent — the Worker just overwrites), so
 * this works the moment after recording rather than depending on the general
 * outbox sync timing.
 */
export async function requestMachineFeedback(settings, recording) {
  if (!settings.workerUrl) {
    return { ok: false, message: 'No Worker configured — the machine estimate needs one, the same as score sync does.' };
  }
  if (!navigator.onLine) {
    return { ok: false, message: 'Offline. Try again once you are back online.' };
  }

  try {
    const uploadUrl = new URL(`${settings.workerUrl}/submission/${recording.id}`);
    if (settings.secret) uploadUrl.searchParams.set('k', settings.secret);
    const meta = { playerId: recording.playerId, topic: recording.topic, recordingKind: recording.kind, durationMs: recording.durationMs };
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': recording.mime || 'audio/mp4', 'x-meta': encodeURIComponent(JSON.stringify(meta)) },
      body: recording.blob,
    });
    if (!uploadResponse.ok) throw new Error(`${uploadResponse.status} uploading the recording`);

    const feedbackUrl = new URL(`${settings.workerUrl}/feedback/${recording.id}`);
    if (settings.secret) feedbackUrl.searchParams.set('k', settings.secret);
    const feedbackResponse = await fetch(feedbackUrl, { method: 'POST' });
    const body = await feedbackResponse.json().catch(() => null);
    if (!feedbackResponse.ok) throw new Error(body?.error ?? `${feedbackResponse.status} ${feedbackResponse.statusText}`);

    return { ok: true, feedback: body };
  } catch (error) {
    return { ok: false, message: `Could not get a machine estimate (${error.message}).` };
  }
}

/**
 * Comprehension questions for one podcast episode.
 *
 * Worker-only, and not because of the key: a podcast feed and a transcript file
 * send no CORS headers, so a browser cannot read either one. A device API key
 * would let us call Claude and give it nothing to read. Saying that plainly
 * beats a generic failure the pair would spend an evening debugging.
 *
 * Same soft-fail shape as everything else here — never throws, always returns
 * something the UI can show.
 */
export async function requestEpisodeQuestions(settings, episode) {
  if (!settings.workerUrl) {
    return {
      ok: false,
      message:
        'Questions need the Worker. The episode transcript lives on another site, and a browser is not allowed to read it — only the Worker can. Add the Worker URL in Settings.',
    };
  }
  if (!navigator.onLine) {
    return { ok: false, message: 'Offline. Try again once you are back online.' };
  }

  try {
    const body = await request(settings, '/episode-questions', {
      method: 'POST',
      body: JSON.stringify({
        episodeId: episode.id,
        transcriptUrl: episode.transcriptUrl ?? '',
        audioSrc: episode.audioSrc ?? '',
        feedUrl: episode.feedUrl ?? '',
        level: episode.level ?? '',
      }),
    });
    return { ok: true, questions: body.questions ?? [], via: body.via, cached: Boolean(body.cached) };
  } catch (error) {
    return { ok: false, message: `Could not get questions (${error.message}).` };
  }
}

/**
 * An on-demand explanation of one Learn example sentence — not a translation,
 * notes on why it's put together the way it is. Same soft-fail shape as the
 * rest of this module. Unlike the machine estimate, this has no audio to
 * upload first: it's a plain JSON round trip.
 */
export async function requestExplanation(settings, { lb, word, en }) {
  if (!navigator.onLine) {
    return { ok: false, message: 'Offline. Try again once you are back online.' };
  }

  // The Worker first when there is one: it keeps the key server-side and
  // caches every explanation forever, so the second person to meet a sentence
  // pays nothing for it. A device key is the fallback for not running a Worker
  // at all, and it re-bills on every device.
  if (settings.workerUrl) {
    try {
      const body = await request(settings, '/explain', { method: 'POST', body: JSON.stringify({ lb, word, en }) });
      return { ok: true, explanation: body.explanation };
    } catch (error) {
      // A Worker deployed without ANTHROPIC_API_KEY answers 503. If this
      // device has its own key, use it rather than reporting a dead end.
      if (!settings.apiKey) {
        return { ok: false, message: `Could not get an explanation (${error.message}).` };
      }
    }
  }

  if (!settings.apiKey) {
    return { ok: false, message: 'Explanations need an Anthropic API key or a Worker. Add one in Settings.' };
  }

  try {
    return await explainSentence(settings.apiKey, { lb, word, en });
  } catch (error) {
    return { ok: false, message: `Could not get an explanation (${error.message}).` };
  }
}
