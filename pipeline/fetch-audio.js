#!/usr/bin/env node
'use strict';

/**
 * Resolves native example-sentence recordings for the exam-scoped entries.
 *
 * The bulk exports do not carry audio: the filenames are opaque asset hashes
 * that only the LOD public API knows. So this step walks the entry ids already
 * selected into content/corpus.json, asks lod.lu for each one, and caches the
 * example-text -> {ogg, aac} mapping in .cache/lod/audio.json. build-corpus.js
 * folds that cache into corpus.json on the next run.
 *
 * These are real speakers, CC0, tied to a LOD entry id - the only listening
 * source the brief permits us to generate items from.
 *
 *   node pipeline/fetch-audio.js [--force] [--limit N] [--concurrency N]
 *
 * The cache is resumable: rerunning only fetches ids it does not already have,
 * so an interrupted run costs nothing.
 */

const fsp = require('node:fs/promises');
const path = require('node:path');

const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');

const API = 'https://lod.lu/api/en/entry';
const DEFAULT_CONCURRENCY = 6;

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

/** Depth-first walk collecting every `audioFiles` object with its example text. */
function collectAudio(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectAudio(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (node.audioFiles && Array.isArray(node.parts)) {
    const text = renderExample(node.parts);
    if (text) out.push({ text, audio: node.audioFiles });
  }
  for (const value of Object.values(node)) collectAudio(value, out);
}

/**
 * Rebuilds the example sentence from the API's part list so it matches the
 * `text` string in the bulk export verbatim - that string is the join key.
 * `joinWithPreviousWord` is how the API encodes the attached article ("d'A").
 */
function renderExample(parts) {
  let text = '';
  for (const part of parts) {
    if (part.type === 'text' && Array.isArray(part.parts)) {
      for (const word of part.parts) {
        if (word.type !== 'word' && word.type !== 'inflectedHeadword') continue;
        if (text === '' || word.joinWithPreviousWord) text += word.content;
        else text += ` ${word.content}`;
      }
    }
  }
  return text.trim();
}

async function fetchEntry(id) {
  const response = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GET ${id} -> ${response.status}`);
  const payload = await response.json();
  const out = [];
  collectAudio(payload, out);
  return out;
}

async function main() {
  const force = process.argv.includes('--force');
  const limit = readArg('--limit', Infinity);
  const concurrency = readArg('--concurrency', DEFAULT_CONCURRENCY);

  const corpus = JSON.parse(await fsp.readFile(paths.CORPUS_PATH, 'utf8'));
  const cache = force ? { entries: {}, examples: {} } : await readCache();

  const pending = corpus.entries
    .filter((entry) => entry.audioAvailable)
    .map((entry) => entry.id)
    .filter((id) => force || !cache.entries[id])
    .slice(0, limit === Infinity ? undefined : limit);

  process.stdout.write(
    `Resolving audio for ${pending.length.toLocaleString()} entries ` +
      `(${Object.keys(cache.entries).length.toLocaleString()} already cached), concurrency ${concurrency}\n`,
  );

  let done = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const id = pending[index];
      try {
        const found = await fetchEntry(id);
        cache.entries[id] = found.length;
        for (const { text, audio } of found) {
          if (!cache.examples[text]) cache.examples[text] = { ogg: audio.ogg ?? null, aac: audio.aac ?? null, entryId: id };
        }
      } catch (error) {
        failed += 1;
        process.stderr.write(`  ${id}: ${error.message}\n`);
      }
      done += 1;
      if (done % 100 === 0 || done === pending.length) {
        process.stdout.write(`  ${done}/${pending.length} entries, ${Object.keys(cache.examples).length} recordings\n`);
        await saveCache(cache);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  await saveCache(cache);

  process.stdout.write(
    `Cached ${Object.keys(cache.examples).length.toLocaleString()} recordings ` +
      `in ${path.relative(paths.ROOT, paths.AUDIO_CACHE_PATH)}${failed ? ` (${failed} entries failed)` : ''}\n`,
  );
  process.stdout.write('Re-run `node pipeline/build-corpus.js` to fold them into content/corpus.json\n');
}

async function readCache() {
  try {
    const cache = JSON.parse(await fsp.readFile(paths.AUDIO_CACHE_PATH, 'utf8'));
    return { entries: cache.entries ?? {}, examples: cache.examples ?? {} };
  } catch {
    return { entries: {}, examples: {} };
  }
}

async function saveCache(cache) {
  await writeJson(paths.AUDIO_CACHE_PATH, { resolvedAt: new Date().toISOString(), ...cache });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`fetch-audio failed: ${error.stack}\n`);
    process.exit(1);
  });
}

module.exports = { renderExample, collectAudio };
