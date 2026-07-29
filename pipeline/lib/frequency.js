'use strict';

/**
 * How common a word actually is.
 *
 * The deck shipped in alphabetical order within A1 then A2, which is a fine way
 * to store 2,048 words and a terrible order to meet them in: it offers
 * `Aarbechtskolleegin` and `Wunngemeinschaft` before `hunn` and `goen`. A
 * beginner needs the words that recur in every sentence first, because those
 * are the ones that make the next sentence readable.
 *
 * There is no frequency list for Luxembourgish in the LOD export, but there are
 * 10,777 example sentences written by lexicographers, and counting across all
 * of them gives a usable ranking. Inflected forms are resolved back to their
 * entry through the lexicon's form index, so `akaaft` counts towards `akafen`.
 *
 * **What this is not.** These are dictionary examples, not a spoken corpus, so
 * the ranking reflects the Luxembourgish LOD chose to illustrate words with
 * rather than the Luxembourgish spoken in Luxembourg. For ordering a beginner
 * deck that is more than good enough — the top of the list comes out as `ech`,
 * `hunn`, `sinn`, `net`, `kënnen`, `goen`, which is exactly right — but it is
 * not a citable frequency list and is not presented as one.
 */

const { tokenise } = require('./lux-text');

/**
 * Counts every corpus entry across every example sentence in the corpus.
 *
 * @param {{entries: Array}} corpus
 * @param {{forms: Record<string,string>}} lexicon
 * @returns {Map<string, number>} LOD record id → occurrences
 */
function countEntries(corpus, lexicon) {
  const counts = new Map();
  for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text) continue;
        for (const token of tokenise(example.text)) {
          const hit = lexicon.forms[token.value] ?? lexicon.forms[token.value.toLowerCase()];
          if (!hit) continue;
          const id = hit.slice(hit.indexOf(':') + 1);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/**
 * The stages a learner walks, in order.
 *
 * Bands rather than a bare 1..2400 ranking, because "word 812 of 2,413" tells
 * you nothing and "you are on Everyday words" tells you where you are. The
 * sizes are deliberately small at the start: the first two stages are about a
 * fortnight at eight new words a day, and they are the two that decide whether
 * you can say anything at all.
 */
const STAGES = [
  { n: 1, id: 'starters', title: 'First words', blurb: 'Who is doing what, yes, no, and the question words.' },
  { n: 2, id: 'verbs', title: 'Everyday verbs', blurb: 'The verbs that carry most sentences.', size: 60 },
  { n: 3, id: 'core', title: 'Everyday words', blurb: 'The nouns and adjectives you will reach for constantly.', size: 150 },
  { n: 4, id: 'a1', title: 'The rest of A1', blurb: 'Filling out the basic vocabulary.' },
  { n: 5, id: 'a2', title: 'A2', blurb: 'The level the speaking exam is set at.' },
];

/**
 * Assigns `freq`, `rank` and `stage` across a whole deck.
 *
 * Ranking is by frequency descending, ties broken by lemma so the output is
 * deterministic and the committed JSON diffs cleanly.
 *
 * @param {Array} items deck items carrying `id`/`lodId`, `level` and `pos`
 * @param {Map<string, number>} counts from `countEntries`
 */
function rankDeck(items, counts) {
  const freqOf = (item) => counts.get(item.lodId ?? item.id) ?? 0;

  const ordered = [...items].sort((a, b) => {
    const byFreq = freqOf(b) - freqOf(a);
    if (byFreq !== 0) return byFreq;
    return String(a.lb ?? a.infinitive).localeCompare(String(b.lb ?? b.infinitive));
  });

  // Stage 1 is the hand-listed sentence skeleton, whatever its frequency.
  // Stages 2 and 3 take the most frequent verbs, then the most frequent
  // everything-else, so the learner gets a working engine before a wide
  // vocabulary. What is left falls to A1 then A2.
  const stage = new Map();
  const verbBand = [];
  const coreBand = [];
  for (const item of ordered) {
    if (item.starter) {
      stage.set(item.id, 1);
      continue;
    }
    const isVerb = item.pos === 'VRB' || Boolean(item.present);
    if (isVerb && verbBand.length < (STAGES[1].size ?? 0)) {
      verbBand.push(item.id);
      stage.set(item.id, 2);
    } else if (!isVerb && coreBand.length < (STAGES[2].size ?? 0) && freqOf(item) > 0) {
      coreBand.push(item.id);
      stage.set(item.id, 3);
    } else {
      stage.set(item.id, item.level === 'A2' ? 5 : 4);
    }
  }

  const rankById = new Map(ordered.map((item, index) => [item.id, index + 1]));
  return items.map((item) => ({
    ...item,
    freq: freqOf(item),
    rank: rankById.get(item.id),
    stage: stage.get(item.id) ?? 4,
  }));
}

module.exports = { countEntries, rankDeck, STAGES };
