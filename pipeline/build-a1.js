'use strict';

/**
 * Stamps `a1` on every sentence the app can show.
 *
 * The Arcade needs to know, per sentence, whether a beginner can read it — and
 * the answer depends on the lexicon and the corpus, which are 22 MB of build-
 * time data that will never be shipped to a phone. So the question is answered
 * here, once, and the answer travels as a boolean on the row.
 *
 * Runs last in `npm run content`, after every deck it reads and stamps has
 * been built. Re-running it is safe: it recomputes from the decks each time.
 *
 * See `lib/a1.js` for what "A1" means and why it is decided by expanding A1
 * lemmas forward rather than by resolving each word back to a level.
 */

const path = require('node:path');
const fsp = require('node:fs/promises');
const paths = require('./lib/paths');
const { buildA1Forms, isA1Sentence } = require('./lib/a1');
const { writeJson } = require('./lib/write-json');

const APP_DATA_DIR = path.join(paths.ROOT, 'app', 'data');

/**
 * What the row's own `a1` flag has to cover, per deck.
 *
 * The unit is one card, not one row of JSON, and those differ. A grammar item
 * *is* a card, so all of its options count — a distractor full of unknown
 * words is as discouraging as a wrong answer. A phrase frame, on the other
 * hand, is a card by itself (which opener says this?) and each of its examples
 * is a *separate* card (build this sentence), so folding the examples into the
 * frame's flag would mark `ech hunn` unreadable because one of its three
 * examples mentions a Conservatoire. Examples are stamped in their own right
 * below; this is only the row's own headline text.
 */
const SENTENCES = {
  'phrases.json': (item) => [item.lb],
  'grammar.json': (item) => [...(item.options_lb ?? []), item.before, item.after],
  'vocab.json': (item) => [item.lb],
  'verbs.json': (item) => [item.infinitive],
};

/**
 * Decks whose rows carry LOD's own CEFR banding, which then has the last word.
 *
 * Without this the spelling test alone promotes A2 words whose form happens to
 * collide with an A1 one — it marked 945 of 2,049 vocabulary rows readable
 * when only 889 are banded A1. The phrase deck is deliberately not in here:
 * every frame is tagged A2 by LOD, but the frames *are* the sentence openers
 * the app teaches from day one, and `lib/a1.js` adds them to the A1 form set
 * by construction. Filtering them out by their tag would empty the Arcade of
 * the exact material it exists to drill.
 */
const LEVEL_BANDED = new Set(['vocab.json', 'verbs.json']);

async function stamp(file, known) {
  const appPath = path.join(APP_DATA_DIR, file);
  const payload = JSON.parse(await fsp.readFile(appPath, 'utf8'));
  const sentencesOf = SENTENCES[file];

  let a1 = 0;
  for (const item of payload.items) {
    // Each example is stamped in its own right as well as the row: a frame can
    // be readable while one of its three examples is not, and the Arcade picks
    // per example rather than per frame.
    for (const example of item.examples ?? []) {
      example.a1 = isA1Sentence(example.lb, known);
    }
    if (item.example?.lb) item.example.a1 = isA1Sentence(item.example.lb, known);

    const parts = sentencesOf(item).filter(Boolean);
    const banded = !LEVEL_BANDED.has(file) || item.level === 'A1';
    item.a1 = banded && parts.length > 0 && parts.every((sentence) => isA1Sentence(sentence, known));
    if (item.a1) a1 += 1;
  }

  payload.meta = { ...payload.meta, a1: { rows: payload.items.length, readable: a1 } };
  await writeJson(path.join(paths.ITEMS_DIR, file), payload);
  await writeJson(appPath, payload);
  return { rows: payload.items.length, a1 };
}

async function main() {
  const known = buildA1Forms();
  console.log(`a1: ${known.size.toLocaleString()} surface forms expanded from the A1 lemmas`);

  for (const file of Object.keys(SENTENCES)) {
    const { rows, a1 } = await stamp(file, known);
    const pct = rows === 0 ? 0 : Math.round((a1 / rows) * 100);
    console.log(`  ${file.replace('.json', '').padEnd(8)} ${String(a1).padStart(5)}/${String(rows).padStart(5)} rows readable at A1 (${pct}%)`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
