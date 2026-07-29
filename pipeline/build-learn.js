#!/usr/bin/env node
'use strict';

/**
 * Enriches the vocabulary and verb decks with the three fields the Learn drill
 * needs: exam topics, a visual cue, and a cloze target inside the word's own
 * example sentence.
 *
 * This runs as a pass over the already-generated `content/items/{vocab,verbs}.json`
 * rather than inside build-vocab.js and build-verbs.js, for two reasons:
 *
 *   1. It only reads committed data — corpus.json, lexicon.json and the items
 *      files. build-verbs.js needs the 200 MB Flexiounstabellen XML from
 *      `.cache/`, which is gitignored, so folding this in there would mean the
 *      enrichment could not be re-run or reviewed without a full LOD fetch.
 *   2. The two decks have different item shapes but want identical enrichment.
 *      One pass keeps the logic in one place instead of duplicating it.
 *
 * The cost of that choice is an extra read/write of two files. It is idempotent
 * and deterministic, so running it twice produces no diff.
 *
 *   node pipeline/build-learn.js
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');
const { makeGate } = require('./lib/gate');
const { locateTarget } = require('./lib/cloze');
const { topicsFor, makeSeedIndex } = require('./lib/topic-tag');
const { cueFor } = require('./lib/cues');
const { TOPICS } = require('./lib/topics');

const APP_DATA_DIR = path.join(paths.ROOT, 'app', 'data');

/**
 * Corpus entries indexed both by id and by lowercased lemma.
 *
 * Vocab items carry the corpus entry id directly. Verb items carry the
 * Flexiounstabellen table id, which usually coincides with the entry id but is
 * a different namespace and does not always — so verbs fall back to the lemma.
 */
function indexCorpus(corpus) {
  const byId = new Map();
  const byLemma = new Map();
  for (const entry of corpus.entries) {
    byId.set(entry.id, entry);
    const key = entry.lemma.toLowerCase();
    if (!byLemma.has(key)) byLemma.set(key, entry);
  }
  return { byId, byLemma };
}

function enrich(items, { lemmaOf, index, seedIndex, lexicon, isClean, stats }) {
  return items.map((item) => {
    const lemma = lemmaOf(item);
    const entry = index.byId.get(item.id) ?? index.byLemma.get(String(lemma).toLowerCase()) ?? null;

    const { topics, via } = entry ? topicsFor(entry, { seedIndex }) : { topics: [], via: null };
    if (topics.length > 0) stats.topics[via] = (stats.topics[via] ?? 0) + 1;
    else stats.topics.none += 1;

    const cue = entry ? cueFor(entry) : null;
    if (cue) stats.cues += 1;

    const cloze = item.example ? buildCloze({ item, lemma, lexicon, isClean, stats }) : null;
    if (cloze) stats.cloze[cloze.via] += 1;
    else stats.cloze.none += 1;

    // Field order is fixed so the committed JSON diffs cleanly between runs.
    return { ...item, topics, topicVia: via, cue, cloze };
  });
}

function buildCloze({ item, lemma, lexicon, isClean, stats }) {
  const located = locateTarget(lexicon, item.id, lemma, item.example.lb);
  if (!located) return null;

  // The generator gates its own output, same rule as every other pipeline
  // step. The sentence already passed the gate when the deck was built, but
  // the answer form is about to be shown on its own as the thing to produce,
  // so it gets checked on its own too.
  if (!isClean(located.form, 'form')) {
    stats.clozeRejected += 1;
    return null;
  }
  return located;
}

function emptyStats() {
  return {
    topics: { category: 0, seed: 0, gloss: 0, none: 0 },
    cues: 0,
    cloze: { lexicon: 0, surface: 0, none: 0 },
    clozeRejected: 0,
  };
}

function report(label, total, stats) {
  const tagged = stats.topics.category + stats.topics.seed + stats.topics.gloss;
  const cloze = stats.cloze.lexicon + stats.cloze.surface;
  console.log(
    `${label}: ${total} items\n` +
      `  topics ${tagged} tagged (${stats.topics.category} category, ${stats.topics.seed} seed, ${stats.topics.gloss} gloss), ${stats.topics.none} left untagged\n` +
      `  cues   ${stats.cues} with a visual cue\n` +
      `  cloze  ${cloze} located (${stats.cloze.lexicon} lexicon, ${stats.cloze.surface} surface), ${stats.cloze.none} without` +
      (stats.clozeRejected > 0 ? `, ${stats.clozeRejected} rejected by the gate` : ''),
  );
}

/** Every topic id an item can be tagged with must exist in the taxonomy. */
function assertTopicsResolve(items, known) {
  for (const item of items) {
    for (const topic of item.topics) {
      if (!known.has(topic)) throw new Error(`${item.id} tagged with unknown topic "${topic}"`);
    }
  }
}

async function readItems(name) {
  const file = path.join(paths.ITEMS_DIR, `${name}.json`);
  return { file, payload: JSON.parse(await fsp.readFile(file, 'utf8')) };
}

async function writeBoth(name, payload) {
  await writeJson(path.join(paths.ITEMS_DIR, `${name}.json`), payload);
  await writeJson(path.join(APP_DATA_DIR, `${name}.json`), payload);
}

async function main() {
  const corpus = require(paths.CORPUS_PATH);
  const lexicon = JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8'));
  const isClean = makeGate(lexicon);
  const index = indexCorpus(corpus);
  const seedIndex = makeSeedIndex(TOPICS);
  const known = new Set(TOPICS.map((topic) => topic.id));

  const decks = [
    { name: 'vocab', lemmaOf: (item) => item.lb },
    { name: 'verbs', lemmaOf: (item) => item.infinitive },
  ];

  for (const deck of decks) {
    const { payload } = await readItems(deck.name);
    const stats = emptyStats();
    const items = enrich(payload.items, { lemmaOf: deck.lemmaOf, index, seedIndex, lexicon, isClean, stats });
    assertTopicsResolve(items, known);

    const enriched = {
      meta: {
        ...payload.meta,
        learn: {
          enrichedAt: new Date().toISOString(),
          enricher: 'pipeline/build-learn.js',
          topics: stats.topics,
          cues: stats.cues,
          cloze: stats.cloze,
        },
      },
      items,
    };
    await writeBoth(deck.name, enriched);
    report(deck.name, items.length, stats);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
