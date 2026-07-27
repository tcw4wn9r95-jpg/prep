/**
 * Talks to the Worker — and copes when it is not there.
 *
 * The brief is explicit: if the Worker is down, solo practice still works. So
 * every write has already been committed to IndexedDB before this module sees
 * it, and sync is a best-effort push of the outbox. Nothing here can block the
 * UI or lose data.
 */

import { listOutbox, clearOutbox, getRecording } from './store.js';

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
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
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

  try {
    const outbox = await listOutbox();
    const sent = [];

    for (const entry of outbox) {
      const { payload } = entry;
      if (payload.kind === 'recording') {
        const record = await getRecording(payload.id);
        // The blob may be gone if the device cleared storage; skip rather than fail.
        if (!record?.blob) {
          sent.push(entry.id);
          continue;
        }
        if (record.blob.size > MAX_UPLOAD_BYTES) {
          // Metadata still syncs so the partner knows it exists.
          await request(settings, '/submission', {
            method: 'POST',
            body: JSON.stringify({ ...payload, oversize: true }),
          });
          sent.push(entry.id);
          continue;
        }
        const url = new URL(`${settings.workerUrl}/submission/${payload.id}`);
        if (settings.secret) url.searchParams.set('k', settings.secret);
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'content-type': record.mime || 'audio/mp4', 'x-meta': encodeURIComponent(JSON.stringify(payload)) },
          body: record.blob,
        });
        if (!response.ok) throw new Error(`${response.status} on submission`);
        sent.push(entry.id);
        continue;
      }

      await request(settings, `/${payload.kind}`, { method: 'POST', body: JSON.stringify(payload) });
      sent.push(entry.id);
    }

    if (sent.length > 0) await clearOutbox(sent);

    const state = await request(settings, '/state');
    lastSync = new Date();
    lastMessage = `Synced ${sent.length} ${sent.length === 1 ? 'change' : 'changes'} at ${lastSync.toLocaleTimeString()}.`;
    return { ok: true, message: lastMessage, state };
  } catch (error) {
    lastMessage = `Could not reach the Worker (${error.message}). Everything is saved locally.`;
    return { ok: false, message: lastMessage };
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
