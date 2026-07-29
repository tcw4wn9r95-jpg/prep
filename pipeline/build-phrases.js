#!/usr/bin/env node
'use strict';

/**
 * Builds the sentence-frame deck.
 *
 * The frames themselves are curated in lib/phrases.js; this script is the part
 * that proves them. For each frame it:
 *
 *   1. scans every recorded example sentence in the corpus for the frame,
 *      **failing the build** if it is attested fewer than MIN_ATTESTATIONS
 *      times — that is what stops a plausible-looking but invented frame from
 *      shipping;
 *   2. attaches the shortest recorded examples that contain it, so the learner
 *      hears the frame used by a native speaker in a whole sentence rather
 *      than as an isolated fragment;
 *   3. records the n-dropped variant where LOD writes one, because the Eifeler
 *      Regel means `ech hunn` and `ech hu` are the same frame and a learner
 *      who has only met one will not recognise the other by ear.
 *
 * Everything is gated through validate.js's lexicon and n-rule checks, same as
 * every other generator.
 *
 *   node pipeline/build-phrases.js
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');
const { makeGate, audioIdOf } = require('./lib/gate');
const { tokenise } = require('./lib/lux-text');
const { PHRASES, GROUPS, MIN_ATTESTATIONS } = require('./lib/phrases');

const APP_DATA_DIR = path.join(paths.ROOT, 'app', 'data');

/** How many recorded examples to ship per frame. Enough to hear it more than
 * once, few enough that the file stays reviewable. */
const EXAMPLES_PER_PHRASE = 3;

/** Every recorded example sentence in the corpus, tokenised once. */
function readSentences(corpus) {
  const sentences = [];
  for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text || !example.audio) continue;
        const tokens = tokenise(example.text).filter((token) => !token.isClitic);
        sentences.push({
          lb: example.text,
          audioId: audioIdOf(example.audio),
          // Padded so a frame match is always on whole-word boundaries.
          haystack: ` ${tokens.map((token) => token.raw.toLowerCase()).join(' ')} `,
          length: tokens.length,
        });
      }
    }
  }
  return sentences;
}

/**
 * The n-dropped variant of a frame, if the corpus writes one.
 *
 * The Eifeler Regel drops a final -n before most consonants, so `ech hunn`
 * becomes `ech hu` in `ech hu mer e Buch ausgeléint`. Both are the same frame.
 * Rather than deriving the rule here — the n-rule engine already exists and
 * this is not the place to reimplement it — the variant is only reported if
 * the corpus actually attests it.
 */
function variantOf(frame, sentences) {
  const words = frame.split(' ');
  const last = words[words.length - 1];
  if (!last.endsWith('n')) return null;

  // `hunn` → `hu` and `sinn` → `si` lose both n's; `kommen` → `komme` loses
  // one. Both candidates are tried and neither is trusted: a candidate only
  // becomes a variant if the corpus actually writes it often enough. A wrong
  // guess here therefore produces no variant rather than a wrong one, which is
  // the only safe way to touch Luxembourgish morphology in this repo.
  const candidates = last.endsWith('nn') ? [last.slice(0, -2), last.slice(0, -1)] : [last.slice(0, -1)];

  for (const candidate of candidates) {
    if (candidate === '') continue;
    const dropped = [...words.slice(0, -1), candidate].join(' ');
    if (dropped === frame) continue;
    const count = sentences.filter((sentence) => sentence.haystack.includes(` ${dropped} `)).length;
    if (count >= MIN_ATTESTATIONS) return { lb: dropped, attestations: count };
  }
  return null;
}

/**
 * Splits an example sentence around the frame it contains.
 *
 * Matched case-insensitively on a word boundary, and the slice is taken from
 * the original text so the sentence is reproduced exactly — `before + form +
 * after` always reconstructs it. Returns null rather than guessing if the
 * frame is not there on a boundary.
 */
function clozeFor(frame, sentence) {
  const lower = sentence.toLowerCase();
  const needle = frame.toLowerCase();
  let from = 0;
  for (;;) {
    const start = lower.indexOf(needle, from);
    if (start === -1) return null;
    const end = start + needle.length;
    const before = sentence.slice(0, start);
    const after = sentence.slice(end);
    if (!/\p{L}$/u.test(before) && !/^\p{L}/u.test(after)) {
      return { before, form: sentence.slice(start, end), after, via: 'frame' };
    }
    from = start + 1;
  }
}

/**
 * The recordings actually present in app/assets/audio.
 *
 * mirror-audio.js can only fetch what the decks referenced when it last ran,
 * so a brand-new deck's examples are not local until the next full content
 * build. Reading the directory is the ground truth for what the app can
 * actually play offline today.
 */
async function readMirrored() {
  try {
    const files = await fsp.readdir(path.join(paths.ROOT, 'app', 'assets', 'audio'));
    return new Set(files.filter((file) => file.endsWith('.m4a')).map((file) => file.slice(0, -4)));
  } catch {
    return new Set();
  }
}

async function main() {
  const corpus = require(paths.CORPUS_PATH);
  const mirrored = await readMirrored();
  const lexicon = JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8'));
  const isClean = makeGate(lexicon);
  const sentences = readSentences(corpus);

  const items = [];
  const thin = [];
  const unclean = [];

  for (const phrase of PHRASES) {
    const needle = ` ${phrase.lb.toLowerCase()} `;
    const matches = sentences.filter((sentence) => sentence.haystack.includes(needle));

    if (matches.length < MIN_ATTESTATIONS) {
      thin.push(`${phrase.lb} (${matches.length})`);
      continue;
    }
    if (!isClean(phrase.lb, 'lb')) {
      unclean.push(phrase.lb);
      continue;
    }

    // Two sorts, in order of importance:
    //
    //  1. a recording that is already mirrored beats one that is not. The app
    //     has to work on a phone with no signal, and an example whose audio
    //     lives only on lod.lu is a 404 on the card and nothing to listen to
    //     offline;
    //  2. shortest first — a six-word sentence teaches the frame, a
    //     nineteen-word one buries it.
    const examples = [...matches]
      .filter((sentence) => isClean(sentence.lb, 'example'))
      .sort(
        (a, b) =>
          Number(mirrored.has(b.audioId)) - Number(mirrored.has(a.audioId)) ||
          a.length - b.length ||
          a.lb.localeCompare(b.lb),
      )
      .slice(0, EXAMPLES_PER_PHRASE)
      // `audioId` is kept even when the file is not here yet, because
      // build-audio-manifest.js reads it and mirror-audio.js fetches from that
      // manifest — dropping it would mean the recording is never mirrored at
      // all. `local` is what the app keys off, so a card silently has no play
      // button rather than a broken one, and gains audio on the next
      // `npm run content`.
      .map((sentence) => ({ lb: sentence.lb, audioId: sentence.audioId, local: mirrored.has(sentence.audioId) }));

    if (examples.length === 0) {
      thin.push(`${phrase.lb} (no clean example)`);
      continue;
    }

    items.push({
      id: `PHRASE-${phrase.lb.toUpperCase().replace(/[^A-ZÄËÉÖÜ]+/g, '-')}`,
      lb: phrase.lb,
      en: phrase.en,
      fr: phrase.fr,
      group: phrase.group,
      level: 'A2',
      attestations: matches.length,
      variant: variantOf(phrase.lb, sentences),
      // The first example doubles as the card's own example sentence, so the
      // phrase deck slots straight into the existing drill engine.
      example: examples[0],
      examples,
      // Gapping the whole frame out of its own sentence is the strongest card
      // this deck can ask: "___ d'Nues voll!" can only be filled by someone
      // who has the frame, not just its words.
      cloze: clozeFor(phrase.lb, examples[0].lb),
    });
  }

  if (thin.length > 0 || unclean.length > 0) {
    throw new Error(
      `phrase deck refused to build:\n` +
        (thin.length > 0 ? `  attested fewer than ${MIN_ATTESTATIONS} times: ${thin.join(', ')}\n` : '') +
        (unclean.length > 0 ? `  rejected by the lexicon/n-rule gate: ${unclean.join(', ')}\n` : '') +
        '  A frame must occur in LOD example sentences. Do not lower the threshold to make one fit.',
    );
  }

  // Ordered by group, then by how common the frame is — which is also roughly
  // the order they are worth learning in.
  const groupOrder = new Map(GROUPS.map((group, index) => [group.id, index]));
  items.sort((a, b) => (groupOrder.get(a.group) ?? 99) - (groupOrder.get(b.group) ?? 99) || b.attestations - a.attestations);
  items.forEach((item, index) => {
    item.rank = index + 1;
    item.stage = 1; // the whole deck is foundation work
  });

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-phrases.js',
      license: 'CC0-1.0',
      corpus: corpus.meta.sources,
      attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
      note:
        'Frames are selected from LOD example sentences, never authored. Each is attested at least ' +
        `${MIN_ATTESTATIONS} times in recorded corpus sentences and the build fails otherwise. ` +
        'English and French glosses are written by us.',
      groups: GROUPS,
      counts: { items: items.length, withVariant: items.filter((item) => item.variant).length },
    },
    items,
  };

  await writeJson(path.join(paths.ITEMS_DIR, 'phrases.json'), payload);
  await writeJson(path.join(APP_DATA_DIR, 'phrases.json'), payload);

  const offline = items.filter((item) => item.examples.every((example) => mirrored.has(example.audioId))).length;
  const unplayable = items.reduce(
    (sum, item) => sum + item.examples.filter((example) => !mirrored.has(example.audioId)).length,
    0,
  );

  console.log(
    `phrases: ${items.length} frames, all attested >= ${MIN_ATTESTATIONS}x\n` +
      `  offline  ${offline}/${items.length} frames have every example already mirrored` +
      (unplayable > 0
        ? `, ${unplayable} recordings are not mirrored yet — marked local:false, so those cards ship without audio until \`npm run content\` fetches them`
        : '') + '\n' +
      `  variants ${payload.meta.counts.withVariant} frames also occur with the n dropped (Eifeler Regel)\n` +
      `  examples ${items.reduce((sum, item) => sum + item.examples.length, 0)} recorded sentences attached\n` +
      `  top      ${items.slice(0, 6).map((item) => `${item.lb} (${item.attestations}x)`).join(', ')}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
