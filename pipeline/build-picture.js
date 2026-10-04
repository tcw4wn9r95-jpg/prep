'use strict';

/**
 * Describing a picture — the words, and the language for where things are.
 *
 * Part 2b of the speaking exam is: three photographs are offered, you describe
 * one. `docs/exam-format.md` has the shape. The app could already *practise*
 * that task — record yourself against a photo — but nothing taught the words
 * it needs, and a description is almost entirely two things: naming what is in
 * the picture, and saying where it is.
 *
 * ## The fields are chosen in English
 *
 * The corpus rule says Luxembourgish is never authored. Choosing *which*
 * Luxembourgish words belong to "the body" or "the weather" would normally
 * mean writing a list of them. So the lists are written in **English**:
 * `content/hand-authored/picture-fields.json` names English glosses, and every
 * A1/A2 vocabulary entry LOD glosses that way joins the field. The data
 * decides which words exist; the English only decides what is being asked for.
 *
 * A gloss match is blunt in both directions, so each field also carries `add`
 * and `drop` lists of LOD entry ids — `Boun` is glossed "(green) bean" and is
 * not a colour. An id in either list that is not a real entry fails the build,
 * which is what caught nine wrong ids the first time the adjective deck tried
 * the same trick.
 *
 * ## Position is taught from sentences that place something
 *
 * "X ass niewent Y" is the sentence a description is made of, and writing new
 * ones would be composing Luxembourgish. So the placements are mined from LOD
 * example sentences that contain a position word *and* a verb of being,
 * standing or lying — `d'Kaz sëtzt virun der Fënster`, `an der Mëtt vun der
 * Stad steet e grousst Denkmal` — and the ones that actually place a thing are
 * then picked by hand from that pool, by id. Mining alone is not enough:
 * `iwwer` is in 185 sentences and almost all of them mean "about".
 *
 * Run with `--candidates` to print the pool with its ids, which is how the
 * keep-list in the authored file is written without typing Luxembourgish.
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const paths = require('./lib/paths');

const FIELDS_PATH = path.join(paths.CONTENT_DIR, 'hand-authored', 'picture-fields.json');
const OUT = path.join(paths.ITEMS_DIR, 'picture.json');
const APP_DATA = path.join(paths.ROOT, 'app', 'data');

/** A sentence short enough to copy and long enough to place something. */
const MIN_WORDS = 4;
const MAX_WORDS = 13;

/** Being, standing, lying, hanging, sitting: the verbs that put a thing somewhere. */
const PLACING_VERB = /(^|[^\p{L}])(ass|sinn|steet|stinn|läit|leien|hänkt|hänken|sëtzt|sëtzen)([^\p{L}]|$)/u;

const audioIdFrom = (url) => (url ? path.basename(String(url)).replace(/\.[a-z0-9]+$/i, '') : null);

const placeId = (text) => `place-${crypto.createHash('sha1').update(text).digest('hex').slice(0, 10)}`;

/** Every distinct example sentence in the corpus, with its recording. */
function exampleSentences(entries) {
  const seen = new Map();
  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text || seen.has(example.text)) continue;
        seen.set(example.text, { lb: example.text, audioId: audioIdFrom(example.audio?.aac ?? example.audio?.ogg) });
      }
    }
  }
  return [...seen.values()];
}

/** The first example LOD gives for an entry, if it gives one. */
function firstExample(entry) {
  for (const meaning of entry.meanings ?? []) {
    for (const example of meaning.examples ?? []) {
      if (example.text) return { lb: example.text, audioId: audioIdFrom(example.audio?.aac ?? example.audio?.ogg) };
    }
  }
  return null;
}

/**
 * The words that say where something is.
 *
 * Most resolve in the A1/A2 corpus, which is the good case: a lemma spelt the
 * way LOD spells it, LOD's own gloss, and usually an example. `ënner` and
 * `tëscht` are in the lexicon only — the corpus is the A1/A2 subset, not the
 * whole dictionary — and they are shipped from there because a preposition is
 * lowercase, which is the one part of speech whose capitalisation the form
 * index cannot get wrong.
 *
 * That is also why there is no word here for the background: `Hannergrond` is
 * a real LOD spelling but only reaches this build through the lowercased form
 * index, and shipping `hannergrond` for a noun would be inventing orthography.
 * `Virdergrond` is not in LOD at all.
 */
function positionWords(authored, byId, lexicon, problems) {
  const out = [];
  for (const [id, english] of authored.positions ?? []) {
    const entry = byId.get(id);
    if (entry) {
      out.push({
        id,
        lb: entry.lemma,
        en: english,
        pos: entry.partOfSpeech,
        // LOD's own English where it has some, beside the English shown. It is
        // the evidence that the gloss above is not a guess.
        lodGlosses: (entry.glosses?.en ?? []).slice(0, 3),
        example: firstExample(entry),
      });
      continue;
    }
    const form = Object.entries(lexicon.forms ?? {}).find(([, tag]) => String(tag) === `spelling:${id}`)?.[0];
    if (!form) {
      problems.push(`position ${id} is neither a corpus entry nor a lexicon spelling`);
      continue;
    }
    if (form !== form.toLocaleLowerCase('lb')) {
      problems.push(`position ${id} would ship "${form}" from the lowercased form index`);
      continue;
    }
    out.push({ id, lb: form, en: english, pos: 'PREP', lodGlosses: [], example: null });
  }
  return out;
}

/**
 * Candidate sentences: a position word, a verb that places, a copyable length.
 *
 * Where a sentence uses more than one position word — `hei ënnen ass et méi
 * kal ewéi do uewen` — the gap goes on one that still has sentence after it.
 * A gap in the last word is a card with nothing to read past the hole, which
 * is a guess rather than a reading, and it is the whole sentence that teaches
 * the pattern.
 */
function placements(sentences, positions) {
  const out = [];
  for (const sentence of sentences) {
    const words = sentence.lb.trim().split(/\s+/);
    if (words.length < MIN_WORDS || words.length > MAX_WORDS) continue;
    if (!PLACING_VERB.test(sentence.lb)) continue;

    const found = [];
    for (const position of positions) {
      const match = new RegExp(`(^|[^\\p{L}])(${position.lb})([^\\p{L}]|$)`, 'iu').exec(sentence.lb);
      if (match) found.push({ position, form: match[2], at: match.index + match[1].length });
    }
    const usable = found.find((one) => sentence.lb.slice(one.at + one.form.length).trim().length > 0);
    if (!usable) continue;

    out.push({
      id: placeId(sentence.lb),
      type: 'placement',
      lb: sentence.lb,
      positionId: usable.position.id,
      // The word as this sentence spells it, and where it sits — the gap is
      // cut by offset because the same short word can occur twice.
      form: usable.form,
      at: usable.at,
      audioId: sentence.audioId,
    });
  }
  return out;
}

/** One field: the entries LOD glosses the way the field asks for. */
function fieldWords(field, vocab, byId, images, problems) {
  const terms = (field.match ?? []).map((term) => new RegExp(`(^|[^a-z])${term.toLowerCase()}([^a-z]|$)`));
  const drop = new Set(field.drop ?? []);
  const add = new Set(field.add ?? []);

  for (const id of [...drop, ...add]) {
    if (!byId.has(id)) problems.push(`${field.id}: ${id} is not a LOD entry`);
  }

  const picked = vocab.filter((item) => {
    const id = item.lodId ?? item.id;
    if (drop.has(id)) return false;
    if (add.has(id)) return true;
    const english = (item.en ?? '').toLowerCase();
    return terms.some((term) => term.test(english));
  });

  // A drop that matches nothing is a guess that has stopped being true, and a
  // list of those quietly rots. Report it rather than carrying it.
  for (const id of drop) {
    if (!vocab.some((item) => (item.lodId ?? item.id) === id)) {
      problems.push(`${field.id}: dropping ${id}, which is not in the vocabulary deck anyway`);
    }
  }

  return picked
    .map((item) => ({
      id: item.lodId ?? item.id,
      lb: item.lb,
      en: item.en,
      pos: item.pos,
      article: item.article ?? null,
      gender: item.gender ?? null,
      level: item.level ?? 'A2',
      rank: item.rank ?? null,
      cue: item.cue ?? null,
      example: item.example ? { lb: item.example.lb, audioId: item.example.audioId ?? null } : null,
      imageUrl: images.get(item.lb) ?? null,
    }))
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.lb.localeCompare(b.lb));
}

async function build({ candidates = false } = {}) {
  const [corpus, lexicon, authored, vocabFile, imageFile] = await Promise.all([
    fsp.readFile(path.join(paths.CONTENT_DIR, 'corpus.json'), 'utf8').then(JSON.parse),
    fsp.readFile(paths.LEXICON_PATH, 'utf8').then(JSON.parse),
    fsp.readFile(FIELDS_PATH, 'utf8').then(JSON.parse),
    fsp.readFile(path.join(paths.ITEMS_DIR, 'vocab.json'), 'utf8').then(JSON.parse),
    fsp.readFile(path.join(paths.ITEMS_DIR, 'word-images.json'), 'utf8').then(JSON.parse),
  ]);

  const entries = Array.isArray(corpus.entries) ? corpus.entries : Object.values(corpus.entries);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const vocab = vocabFile.items ?? [];
  const images = new Map((imageFile.items ?? []).map((item) => [item.lb, item.imageUrl]));

  const problems = [];
  const positions = positionWords(authored, byId, lexicon, problems);
  const pool = placements(exampleSentences(entries), positions);

  if (candidates) {
    const byPosition = new Map(positions.map((one) => [one.id, one.lb]));
    for (const one of pool.sort((a, b) => a.positionId.localeCompare(b.positionId) || a.lb.localeCompare(b.lb))) {
      process.stdout.write(`${one.id}  ${byPosition.get(one.positionId).padEnd(11)}  ${one.lb}\n`);
    }
    process.stdout.write(`\n${pool.length} candidates\n`);
    return;
  }

  const kept = new Set(authored.placements ?? []);
  const byPlaceId = new Map(pool.map((one) => [one.id, one]));
  for (const id of kept) {
    if (!byPlaceId.has(id)) problems.push(`placement ${id} is not a sentence this build can find — re-run with --candidates`);
  }

  const fields = (authored.fields ?? []).map((field) => ({
    id: field.id,
    title_en: field.title_en,
    blurb: field.blurb,
    cue: field.cue ?? null,
    words: fieldWords(field, vocab, byId, images, problems),
  }));

  for (const field of fields) {
    // A field of three words is a screen that cannot be drilled, and it would
    // be the English list quietly failing to match rather than LOD being thin.
    if (field.words.length < 10) problems.push(`${field.id}: only ${field.words.length} words matched`);
  }

  if (problems.length > 0) {
    throw new Error(`build-picture refused:\n  ${problems.join('\n  ')}`);
  }

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-picture.js',
      source: 'LOD A1/A2 corpus (words and example sentences), CC0',
      attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
      notes:
        'Fields are selected by English gloss from content/items/vocab.json; see ' +
        'content/hand-authored/picture-fields.json for the English lists and the id corrections. ' +
        'Placements are LOD example sentences that place one thing relative to another, picked from a ' +
        'mined pool by id. No Luxembourgish is authored anywhere in this path.',
    },
    fields,
    positions,
    placements: pool.filter((one) => kept.has(one.id)).sort((a, b) => a.lb.localeCompare(b.lb)),
  };

  const json = `${JSON.stringify(payload, null, 1)}\n`;
  await fsp.writeFile(OUT, json);
  await fsp.mkdir(APP_DATA, { recursive: true });
  await fsp.writeFile(path.join(APP_DATA, 'picture.json'), json);

  const counts = fields.map((field) => `${field.id} ${field.words.length}`).join(', ');
  process.stdout.write(
    `picture: ${counts}\n` +
      `  ${positions.length} position words, ${payload.placements.length} placement sentences ` +
      `(from ${pool.length} candidates)\n`,
  );
}

if (require.main === module) {
  build({ candidates: process.argv.includes('--candidates') }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { build, placements, fieldWords, MIN_WORDS, MAX_WORDS, PLACING_VERB };
