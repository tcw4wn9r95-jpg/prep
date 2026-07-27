#!/usr/bin/env node
'use strict';

/**
 * Mirrors the LOD recordings the shipped items reference into app/assets/audio/.
 *
 * Two reasons this exists rather than hot-linking lod.lu:
 *
 *  1. **Offline.** The app has to work on a phone with no signal, so the
 *     service worker needs local files to precache.
 *  2. **iOS.** LOD serves each recording as both `.ogg` (Vorbis) and `.m4a`
 *     (AAC). Safari on iOS cannot play Ogg Vorbis at all, so we mirror the
 *     **AAC** variant only. Getting this wrong is silent - the audio element
 *     just never fires `canplay`.
 *
 * The recordings are CC0, published by the Zenter fir d'Lëtzebuerger Sprooch;
 * mirroring them is explicitly allowed, and each file keeps its LOD entry id
 * in the manifest as attribution. (INLL material is a different matter and is
 * never mirrored - the app links to it.)
 *
 *   node pipeline/mirror-audio.js [--force] [--concurrency N]
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');

const AUDIO_DIR = path.join(paths.ROOT, 'app', 'assets', 'audio');
const MANIFEST = path.join(paths.CONTENT_DIR, 'audio-manifest.json');
const OUT_MANIFEST = path.join(paths.ROOT, 'app', 'data', 'audio-manifest.json');
const DEFAULT_CONCURRENCY = 8;

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Rebuilds the AAC URL from the asset id. LOD sharding puts a file under the
 * first two characters of its hash: .../AAC/fe/fe0f05….m4a
 */
function aacUrlFor(audioId) {
  return `https://lod.lu/uploads/examples/AAC/${audioId.slice(0, 2)}/${audioId}.m4a`;
}

async function main() {
  const force = process.argv.includes('--force');
  const concurrency = readArg('--concurrency', DEFAULT_CONCURRENCY);

  const { audioIds } = JSON.parse(await fsp.readFile(MANIFEST, 'utf8'));
  await fsp.mkdir(AUDIO_DIR, { recursive: true });

  const pending = audioIds.filter((id) => force || !fs.existsSync(path.join(AUDIO_DIR, `${id}.m4a`)));
  process.stdout.write(
    `Mirroring ${pending.length} of ${audioIds.length} recordings as AAC (iOS cannot play Ogg), concurrency ${concurrency}\n`,
  );

  let done = 0;
  let bytes = 0;
  const failed = [];
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const id = pending[index];
      try {
        const response = await fetch(aacUrlFor(id));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length === 0) throw new Error('empty body');
        await fsp.writeFile(path.join(AUDIO_DIR, `${id}.m4a`), buffer);
        bytes += buffer.length;
      } catch (error) {
        failed.push({ id, reason: error.message });
      }
      done += 1;
      if (done % 50 === 0 || done === pending.length) {
        process.stdout.write(`  ${done}/${pending.length}\n`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  // Everything on disk, not just what this run fetched.
  const present = audioIds.filter((id) => fs.existsSync(path.join(AUDIO_DIR, `${id}.m4a`)));
  const totalBytes = present.reduce((sum, id) => sum + fs.statSync(path.join(AUDIO_DIR, `${id}.m4a`)).size, 0);

  await writeJson(OUT_MANIFEST, {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/mirror-audio.js',
      license: 'CC0-1.0',
      attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch",
      format: 'audio/mp4',
      note: 'AAC only. iOS Safari has no Ogg Vorbis support, so the .ogg variant is never shipped.',
      count: present.length,
      bytes: totalBytes,
    },
    files: present.map((id) => `assets/audio/${id}.m4a`),
  });

  process.stdout.write(
    `Mirrored ${present.length}/${audioIds.length} recordings, ${(totalBytes / 1e6).toFixed(1)} MB total ` +
      `(${(bytes / 1e6).toFixed(1)} MB this run)\n`,
  );
  if (failed.length > 0) {
    process.stdout.write(`${failed.length} failed:\n`);
    for (const item of failed.slice(0, 10)) process.stdout.write(`  ${item.id}: ${item.reason}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`mirror-audio failed: ${error.stack}\n`);
    process.exit(1);
  });
}

module.exports = { aacUrlFor };
