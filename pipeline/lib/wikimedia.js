'use strict';

/**
 * Shared plumbing for pulling photographs off Wikimedia Commons.
 *
 * Split out of fetch-images.js when fetch-object-images.js needed the same
 * polite-fetch/licence-check machinery for a different search shape (a
 * per-word keyword search rather than a fixed list of categories) — one rate
 * limiter and one licence allowlist, not two copies that could drift apart.
 *
 * Commons publishes machine-readable licence and author metadata per file, so
 * every image this app ships can carry a correct credit. Anything without a
 * free licence we recognise is skipped rather than guessed at.
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'sproochentest-prep/0.1 (personal exam-prep tool; contact via repository)';

/**
 * Licences we accept. Anything else — "fair use", unknown, non-commercial —
 * is skipped. The list is deliberately conservative.
 */
const FREE_LICENCES = [/^cc0/i, /^cc by(-sa)?( \d)/i, /^public domain/i, /^pd/i];

const stripHtml = (value) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Commons rate-limits hard and answers 429 rather than queuing. Everything
 * here goes through one polite, serialised fetch with backoff — being a good
 * client of a donated service matters more than finishing a second sooner.
 *
 * Module-level state, deliberately: two scripts run one at a time, never
 * concurrently, and a shared clock is the whole point — it is what stops two
 * callers in the same process from each thinking they have the gap to themselves.
 */
let lastRequestAt = 0;
const MIN_GAP_MS = 900;

async function politeFetch(url, { attempts = 4 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const wait = Math.max(0, lastRequestAt + MIN_GAP_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const response = await fetch(url, { headers: { 'user-agent': UA } });
    if (response.status !== 429) return response;

    const retryAfter = Number(response.headers.get('retry-after'));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
    process.stdout.write(`    rate limited, waiting ${Math.round(backoff / 1000)}s\n`);
    await sleep(backoff);
  }
  throw new Error('rate limited after retries');
}

function isFree(licence) {
  return FREE_LICENCES.some((pattern) => pattern.test(licence ?? ''));
}

module.exports = { API, UA, FREE_LICENCES, stripHtml, politeFetch, isFree };
