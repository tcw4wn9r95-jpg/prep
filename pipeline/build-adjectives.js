'use strict';

/**
 * The adjective deck — the word, its opposite, and the two degrees.
 *
 * ## What LOD publishes, and what it does not
 *
 * LOD's Flexiounstabellen carry a comparative and a superlative for 204 of its
 * A1/A2 adjectives, and those are quoted here exactly as published: `méi
 * schéin`, `am schéinsten`, and the stem changes LOD itself records — `blo` →
 * `am bloosten`, `aggressiv` → `am aggressiivsten`. Nothing here derives a form
 * by rule. Deriving would be authoring Luxembourgish with extra steps, and the
 * irregular stems are exactly where a rule would be wrong.
 *
 * Two things LOD does **not** publish, both supplied by
 * `content/hand-authored/adjective-relations.json`:
 *
 *   opposites   the corpus has no antonym field at all. Pairs are named by
 *               LOD entry id, so the file asserts a relation between two
 *               existing entries without writing a word of Luxembourgish.
 *   gutt        LOD models `besser` and `am beschten` as their own headwords
 *               rather than as gutt's table, so gutt has no comparative in the
 *               data. The link is asserted; both spellings are checked against
 *               the lexicon.
 *
 * ## Comparisons are mined, never composed
 *
 * "X ass méi ADJ ewéi Y" is a frame that appears in dozens of real LOD
 * sentences, and substituting a new X and Y into it would still be writing a
 * sentence nobody wrote. So the comparison practice is built from the example
 * sentences that already make a comparison, quoted whole, with the adjective
 * gapped out of them — the same discipline `build-grammar.js` uses.
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const paths = require('./lib/paths');

const RELATIONS_PATH = path.join(paths.CONTENT_DIR, 'hand-authored', 'adjective-relations.json');
const OUT = path.join(paths.ITEMS_DIR, 'adjectives.json');
const APP_DATA = path.join(paths.ROOT, 'app', 'data');

/** A comparison worth practising has at least this many words around it. */
const MIN_COMPARISON_WORDS = 5;
const MAX_COMPARISON_WORDS = 14;

const audioIdFrom = (url) => (url ? path.basename(String(url)).replace(/\.[a-z0-9]+$/i, '') : null);

/**
 * The adjectives LOD gives both degrees for.
 *
 * `lexicon.forms` tags every spelling with how LOD knows it, and `table:` is
 * the Flexiounstabellen. For an adjective those are exactly the two degrees,
 * so they can be told apart by their own shape: the comparative is the one
 * LOD writes with `méi`, the superlative the one it writes with `am`.
 */
function degreesByEntry(lexicon, isAdjective) {
  const out = new Map();
  for (const [form, tag] of Object.entries(lexicon.forms ?? {})) {
    const [kind, id] = String(tag).split(':');
    if (kind !== 'table' || !id || !isAdjective(id)) continue;
    const found = out.get(id) ?? {};
    if (/^méi\s/.test(form)) found.comparative = form;
    else if (/^am\s/.test(form)) found.superlative = form;
    out.set(id, found);
  }
  return out;
}

/** Every distinct example sentence in the corpus, with its recording. */
function exampleSentences(entries) {
  const seen = new Map();
  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        const text = example.text;
        if (!text || seen.has(text)) continue;
        seen.set(text, { lb: text, audioId: audioIdFrom(example.audio?.aac ?? example.audio?.ogg) });
      }
    }
  }
  return [...seen.values()];
}

/**
 * The sentences that actually compare two things, with the adjective located.
 *
 * Two shapes, both of which a learner has to produce in the interview:
 *
 *   more   `méi <adjective> … (e)wéi …`
 *   as-as  `esou <adjective> … (e)wéi …`
 *
 * The adjective has to be one of the deck's own, which is what keeps
 * "méi wéi honnert Joer" — "more than a hundred years", not a comparison of
 * anything — out of the set.
 */
function comparisons(sentences, byLemma) {
  const out = [];
  for (const sentence of sentences) {
    const words = sentence.lb.trim().split(/\s+/);
    if (words.length < MIN_COMPARISON_WORDS || words.length > MAX_COMPARISON_WORDS) continue;

    const match = /\b(méi|esou)\s+(\p{L}+)\b/u.exec(sentence.lb);
    if (!match) continue;
    const adjective = byLemma.get(match[2].toLocaleLowerCase('lb'));
    if (!adjective) continue;
    // The second half of the comparison has to be there, after the adjective.
    if (!/\be?wéi\b/.test(sentence.lb.slice(match.index + match[0].length))) continue;

    out.push({
      id: `adjcmp-${crypto.createHash('sha1').update(sentence.lb).digest('hex').slice(0, 10)}`,
      type: 'comparison',
      shape: match[1] === 'méi' ? 'more' : 'as',
      lb: sentence.lb,
      // Where the gap goes: the adjective exactly as this sentence spells it.
      form: match[2],
      at: match.index + match[0].length - match[2].length,
      adjectiveId: adjective.id,
      audioId: sentence.audioId,
    });
  }
  return out;
}

/**
 * How often each adjective actually turns up, and its place in the order.
 *
 * Not counted again here. `pipeline/lib/frequency.js` already counts every
 * entry across all 10,777 LOD example sentences, splitting a homograph's
 * occurrences in proportion to LOD's own headword marks, and `build-vocab.js`
 * writes the result onto the vocabulary deck — which is where the "100 verbs"
 * list gets its order. Every one of these adjectives is in that deck, so the
 * number is read across rather than recomputed: two rankings from one count
 * cannot disagree, and this build stays a second rather than a minute.
 *
 * `rank` is the position among the adjectives alone — rank 1 is the most used
 * adjective, not the most used word — because that is what a "top 50" filter
 * over this deck has to mean. Ties break on the lemma so the JSON is stable.
 */
function rankByUse(items, vocab) {
  const freq = new Map();
  for (const item of vocab.items ?? []) freq.set(item.lodId ?? item.id, item.freq ?? 0);

  const ordered = [...items].sort(
    (a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0) || a.lb.localeCompare(b.lb),
  );
  const rank = new Map(ordered.map((item, index) => [item.id, index + 1]));
  for (const item of items) {
    item.freq = freq.get(item.id) ?? 0;
    item.rank = rank.get(item.id);
  }
  return items.filter((item) => item.freq === 0).map((item) => item.lb);
}

async function build() {
  const [corpus, lexicon, relations, vocab] = await Promise.all([
    fsp.readFile(path.join(paths.CONTENT_DIR, 'corpus.json'), 'utf8').then(JSON.parse),
    fsp.readFile(paths.LEXICON_PATH, 'utf8').then(JSON.parse),
    fsp.readFile(RELATIONS_PATH, 'utf8').then(JSON.parse),
    fsp.readFile(path.join(paths.ITEMS_DIR, 'vocab.json'), 'utf8').then(JSON.parse),
  ]);

  const entries = Array.isArray(corpus.entries) ? corpus.entries : Object.values(corpus.entries);
  const adjectives = new Map(entries.filter((entry) => entry.partOfSpeech === 'ADJ').map((entry) => [entry.id, entry]));
  const degrees = degreesByEntry(lexicon, (id) => adjectives.has(id));

  // The one adjective LOD gives no table for. Its forms are LOD spellings and
  // the link is the relations file's assertion — see that file's header.
  const problems = [];
  for (const [id, forms] of Object.entries(relations.irregular ?? {})) {
    if (!adjectives.has(id)) {
      problems.push(`irregular ${id} is not an adjective entry`);
      continue;
    }
    for (const form of [forms.comparative, forms.superlative]) {
      if (!lexicon.forms?.[form]) problems.push(`irregular form "${form}" is not a LOD spelling`);
    }
    degrees.set(id, { comparative: forms.comparative, superlative: forms.superlative, irregular: true });
  }

  const items = [];
  for (const [id, forms] of degrees) {
    if (!forms.comparative || !forms.superlative) continue;
    const entry = adjectives.get(id);
    const english = (entry.glosses?.en ?? [])[0] ?? null;
    // A card with no English cannot be asked about in either direction.
    if (!english) continue;
    items.push({
      id,
      type: 'adjective',
      lb: entry.lemma,
      en: english,
      level: entry.level ?? 'A2',
      comparative: forms.comparative,
      superlative: forms.superlative,
      irregular: forms.irregular === true,
      oppositeIds: [],
    });
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const byLemma = new Map(items.map((item) => [item.lb.toLocaleLowerCase('lb'), item]));

  for (const pair of relations.opposites ?? []) {
    const [a, b] = pair;
    if (!byId.has(a) || !byId.has(b)) {
      problems.push(`opposite pair ${a} ↔ ${b}: not both adjectives with two degrees`);
      continue;
    }
    if (a === b) problems.push(`${a} is listed as its own opposite`);
    byId.get(a).oppositeIds.push(b);
    byId.get(b).oppositeIds.push(a);
  }

  // A word the corpus never uses cannot be placed in a "most used" order, and
  // silently ranking it last would be a guess wearing a number.
  const unseen = rankByUse(items, vocab);
  if (unseen.length > 0) problems.push(`no corpus frequency for: ${unseen.join(', ')}`);

  if (problems.length > 0) {
    throw new Error(`build-adjectives refused:\n  ${problems.join('\n  ')}`);
  }

  items.sort((a, b) => a.lb.localeCompare(b.lb));
  const compared = comparisons(exampleSentences(entries), byLemma);
  compared.sort((a, b) => a.lb.localeCompare(b.lb));

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-adjectives.js',
      source: 'LOD Flexiounstabellen (degrees) and LOD example sentences (comparisons), CC0',
      attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
      notes:
        'Both degrees are quoted from the inflection table, never derived. Opposites are asserted in ' +
        'content/hand-authored/adjective-relations.json as relations between entry ids; LOD has no antonym field. ' +
        'rank orders the adjectives by how often LOD\'s example sentences use them (see pipeline/lib/frequency.js); ' +
        'these are dictionary examples, not a spoken corpus, so it orders a deck and is not a citable frequency list.',
    },
    items,
    comparisons: compared,
  };

  const json = `${JSON.stringify(payload, null, 1)}\n`;
  await fsp.writeFile(OUT, json);
  await fsp.mkdir(APP_DATA, { recursive: true });
  await fsp.writeFile(path.join(APP_DATA, 'adjectives.json'), json);

  const withOpposite = items.filter((item) => item.oppositeIds.length > 0).length;
  const top = [...items].sort((a, b) => a.rank - b.rank).slice(0, 8).map((item) => item.lb);
  process.stdout.write(
    `adjectives: ${items.length} with both degrees, ${withOpposite} with an opposite, ` +
      `${compared.length} comparison sentences (${compared.filter((one) => one.shape === 'more').length} méi, ` +
      `${compared.filter((one) => one.shape === 'as').length} esou)\n` +
      `  most used: ${top.join(', ')}\n`,
  );
}

if (require.main === module) {
  build().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { build, comparisons, degreesByEntry, MIN_COMPARISON_WORDS, MAX_COMPARISON_WORDS };
