#!/usr/bin/env node
'use strict';

/**
 * Generates vocabulary flashcard items from content/corpus.json.
 *
 * Same hard rule as build-items.js: no Luxembourgish is authored here. Every
 * `lb` field is a corpus lemma, copied verbatim; every translation is a gloss
 * LOD itself publishes. This is what makes the deck safe for a complete
 * beginner — a wrong flashcard taught once is worse than a missing one.
 *
 *   node pipeline/build-vocab.js
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');
const { makeGate, primaryExample } = require('./lib/gate');

// Parts of speech worth a flashcard. Skip articles, numerals and particles —
// too little content per card — and interjections, which rarely have a clean
// one-word translation.
const LEARNABLE_POS = new Set(['SUBST', 'VRB', 'ADJ', 'ADV', 'PRON', 'PREP', 'CONJ']);

// LOD genders: M/F/N, plus a handful of dual-gender codes (MF/MN/FN) for words
// that vary by speaker or usage. The article picked for those is the LOD-listed
// first gender's — good enough for a flashcard, not authoritative grammar.
const GENDER_ARTICLE = { M: 'de', F: 'd\'', N: 'd\'', MF: 'de', MN: 'de', FN: 'd\'' };

async function main() {
  const corpus = require(paths.CORPUS_PATH);
  const lexicon = JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8'));
  const isClean = makeGate(lexicon);

  const items = [];
  let droppedExamples = 0;
  let droppedLemmas = 0;
  for (const entry of corpus.entries) {
    if (!LEARNABLE_POS.has(entry.partOfSpeech)) continue;
    const en = entry.glosses?.en?.[0];
    if (!en) continue; // no clean English gloss, no flashcard

    // A handful of lemmas are multi-word French loans ("Carte d'identité")
    // whose parts LOD does not separately index as Luxembourgish — the
    // headword itself has to pass the gate, not just the example sentence.
    if (!isClean(entry.lemma)) {
      droppedLemmas += 1;
      continue;
    }

    let example = primaryExample(entry);
    if (example && !isClean(example.lb)) {
      example = null;
      droppedExamples += 1;
    }

    items.push({
      id: entry.id,
      lb: entry.lemma,
      pos: entry.partOfSpeech,
      gender: entry.gender ?? null,
      article: entry.gender ? GENDER_ARTICLE[entry.gender] : null,
      level: entry.level,
      en,
      fr: entry.glosses?.fr?.[0] ?? null,
      de: entry.glosses?.de?.[0] ?? null,
      example,
    });
  }

  // A1 before A2, otherwise stable on lemma so diffs stay small between runs.
  items.sort((a, b) => (a.level === b.level ? a.lb.localeCompare(b.lb) : a.level === 'A1' ? -1 : 1));

  const meta = {
    generatedAt: new Date().toISOString(),
    generator: 'pipeline/build-vocab.js',
    license: 'CC0-1.0',
    corpus: corpus.meta.sources,
    attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
    counts: { items: items.length, a1: items.filter((i) => i.level === 'A1').length, a2: items.filter((i) => i.level === 'A2').length },
  };

  const payload = { meta, items };
  await writeJson(path.join(paths.ITEMS_DIR, 'vocab.json'), payload);
  const appData = path.join(paths.ROOT, 'app', 'data');
  await writeJson(path.join(appData, 'vocab.json'), payload);

  console.log(`vocab: ${items.length} cards (${meta.counts.a1} A1, ${meta.counts.a2} A2), ${droppedLemmas} lemmas + ${droppedExamples} example sentences dropped by the gate`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
