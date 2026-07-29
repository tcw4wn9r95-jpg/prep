#!/usr/bin/env node
'use strict';

/**
 * Rebuilds content/audio-manifest.json as the union of every recording the
 * shipped items reference: listening + interview questions (from
 * build-items.js) plus vocab/verb example sentences (from build-vocab.js and
 * build-verbs.js). build-items.js writes an earlier, narrower version of this
 * file before vocab/verbs even exist — this script runs after all four
 * generators and is the one mirror-audio.js should read.
 *
 *   node pipeline/build-audio-manifest.js
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');

async function readJson(name) {
  return JSON.parse(await fsp.readFile(path.join(paths.ITEMS_DIR, name), 'utf8'));
}

async function main() {
  const [listening, interviews, vocab, verbs, phrases] = await Promise.all([
    readJson('listening.json'),
    readJson('interviews.json'),
    readJson('vocab.json'),
    readJson('verbs.json'),
    readJson('phrases.json'),
  ]);

  const audioIds = new Set();
  for (const set of listening.items) {
    for (const exercise of set.exercises) for (const question of exercise.questions) audioIds.add(question.audioId);
  }
  for (const interview of interviews.items) {
    for (const phase of interview.phases) for (const question of phase.questions) audioIds.add(question.audioId);
  }
  for (const item of vocab.items) if (item.example?.audioId) audioIds.add(item.example.audioId);
  // Phrase frames ship several recorded examples each, all of which need
  // mirroring and precaching or the deck is silent offline.
  for (const item of phrases.items ?? []) for (const example of item.examples ?? []) audioIds.add(example.audioId);
  for (const item of verbs.items) if (item.example?.audioId) audioIds.add(item.example.audioId);

  await writeJson(path.join(paths.CONTENT_DIR, 'audio-manifest.json'), {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-audio-manifest.js',
      license: 'CC0-1.0',
      attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
      sources: ['listening.json', 'interviews.json', 'vocab.json', 'verbs.json', 'phrases.json'],
    },
    audioIds: [...audioIds].sort(),
  });

  console.log(`audio manifest: ${audioIds.size} distinct recordings across listening, interviews, vocab, verbs and phrases`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
