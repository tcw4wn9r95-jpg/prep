#!/usr/bin/env node
'use strict';

/**
 * Sources one photograph per everyday-object word, for the picture-naming
 * game (`#/objects`, app/js/screens/objects.js).
 *
 * Different shape of search from fetch-images.js's fixed fifteen categories:
 * here the search term is the word itself, one Commons full-text search per
 * candidate, because there is no "Category:Apples" style listing for most of
 * these. Same rules as everywhere else in this repo apply regardless —
 * Wikimedia Commons only, machine-readable licence per file, nothing accepted
 * without one, every photograph credited.
 *
 * The word list is not authored here. It is read straight off the shipped
 * vocabulary deck (content/items/vocab.json + corpus.json for the semantic
 * category each entry carries), filtered to the categories that are actually
 * physical objects — the same categories pipeline/lib/cues.js already trusts
 * to mean "concrete and picturable" for the emoji-cue system — with the
 * person-shaped categories excluded, because a photograph of a stranger is a
 * different thing from a photograph of an apple and this game is not asking
 * for either.
 *
 *   node pipeline/fetch-object-images.js [--limit N] [--dry]
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');
const { API, stripHtml, politeFetch, isFree } = require('./lib/wikimedia');

const IMAGE_DIR = path.join(paths.ROOT, 'app', 'assets', 'img');
const THUMB_WIDTH = 480; // a game card, not a full-screen exam image
const MIN_DIMENSION = 250; // below this a "photo" is usually an icon or a diagram

/**
 * The semantic categories that mean "a physical object you could point at",
 * shared with pipeline/lib/cues.js's CUEABLE_CATEGORIES rather than
 * re-invented — the two systems are answering the same question ("is this
 * word a concrete, picturable thing?") for two different features.
 *
 * Narrower than CUEABLE_CATEGORIES in two directions. No FAARF: a colour is
 * not an object; no MOUNT/METEO/WIEDER/FEIERDEEG/FEST/SPORT/FUSSBALL: weather,
 * months and events are not single things a photo can name. And no ANAT,
 * despite being exactly this kind of concrete noun: Commons' body-part
 * results skew heavily toward dissection photography and pathology
 * illustrations (a search for "nose" or "foot" surfaces medical-textbook
 * scans more often than a plain photo), which is a correct answer to the
 * search and a bad flashcard. "Everyday objects" is what was asked for, and a
 * cross-section diagram of a leg is not what that means.
 */
const OBJECT_CATEGORIES = new Set([
  'IESSEN', 'GEDRENKS', 'UEBST', 'GEMEIS', 'GEWIERZ', 'KRAUTGEWIERZ', 'NOSS', 'FESCH',
  'KLEEDUNGSSTECK', 'DEIER', 'PLANTE', 'BLUMM', 'GEFIER', 'MUSEKSINSTRUMENT',
  'HORECA', 'SCHOUL',
]);

/**
 * Excluded even when a word also carries an OBJECT_CATEGORIES tag — LOD's own
 * "Kach" (chef) is tagged both HORECA and PERSOUN, for instance. A game about
 * naming objects in photographs should not go looking for photographs of
 * identifiable strangers, so any person-shaped category wins the exclusion.
 */
const EXCLUDE_CATEGORIES = new Set(['PERSOUN', 'BERUFFSBEZEECHNUNG', 'FAMILL']);

/**
 * Hand-excluded past the category filter. LOD's own category tagging catches
 * most abstractions, but not all — these are real SUBST entries under an
 * OBJECT_CATEGORIES tag (mostly SCHOUL) that name a concept rather than a
 * single photographable thing: "Verb" is tagged SCHOUL, "Reegel" (rule) is
 * tagged ANAT because LOD's other sense of the word is a medical term, and a
 * generic collective ("Uebst" = fruit in general, as opposed to "Apel" = an
 * apple) cannot be told apart from any of its members in one photograph.
 * Reviewed by hand once, against the real category output, rather than
 * guessed at — see docs/ui-content-benchmark.md for the list this was built
 * from.
 */
const EXCLUDE_WORDS = new Set([
  'aufgab', 'hausaufgab', 'fro', 'faarf', 'kierper', 'owescours', 'philosophie', 'reegel',
  'stage', 'stonn', 'test', 'verb', 'zuel', 'äntwert', 'weiderbildung', 'reservatioun',
  'receptioun', 'bluttdrock', 'blinddarm', 'fett', 'gedrénks', 'uebst', 'geméis', 'kleed',
]);

/**
 * True synonyms — two different Luxembourgish spellings for the one same
 * everyday thing ("Hond" and "Mupp" are both just "dog"). Left in, a round
 * could show a dog photo captioned "Mupp" while offering "Hond" as a wrong
 * answer, which is not wrong. Keyed on the lower-rank (more frequent) spelling
 * to keep; "pepper" is deliberately not treated as a pair below even though
 * two words gloss to it, because Peffer (a spice) and Paprika (a vegetable)
 * are genuinely different objects that happen to share an English gloss.
 */
const GLOSS_MERGE_EXEMPT = new Set(['pepper']);

/** How many object words get a photo search. Bounded the same way the cheat
 * sheet's verb list is (100): enough for the game to feel large, small enough
 * that a full run stays a few minutes of polite, rate-limited fetching. */
const WORD_LIMIT = 150;

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

/** Turns "(pair of) trousers" into "pair of trousers" — the parenthesised
 * part is disambiguating context (see build-verbs.js's own note on the same
 * LOD convention elsewhere), not decoration to discard. This is the term the
 * *result* is checked against; `searchQueryFor` below is the term *sent*, and
 * the two are allowed to differ. */
function cleanGloss(en) {
  return String(en ?? '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Kept off every search — a beginner's flashcard, not a medical textbook or a
 * news archive. Found by hand while building this: "train" surfaced the
 * famous 1895 Montparnasse crash photo before anything showing an intact
 * train, and "wine" surfaced a 1924 film poster before an actual glass of it.
 * Neither is wrong for the word in its title; both are wrong for a flashcard.
 *
 * Deliberately does not exclude "book", "film" or the like even though a
 * poster or a book cover is exactly this kind of miscategorised-media result
 * — this list is checked against every search including the ones *for*
 * "Buch" (book), and excluding a word this app is trying to find a photo of
 * would just turn the exclusion into another way to fail that search.
 *
 * Short on purpose, not just in spirit: CirrusSearch caps a search string at
 * 300 characters (not counting the `filetype:` prefix) and answers over that
 * with `cirrussearch-query-too-long-with-exemptions` — as a 200, with the
 * error inside the JSON body, not as a request failure. An earlier, longer
 * version of this list (every synonym for "crash", "dead", "poster" that
 * came to mind) was 308 characters and silently failed every single search
 * this way for as long as it shipped — every word came back "no free-licensed
 * match" and looked exactly like Commons rate-limiting, which was also
 * genuinely happening at the same time and masked it. `object-images.test.js`
 * now asserts the built query stays under the limit for a worst-case gloss.
 */
const GENERAL_EXCLUDE = '-crash -wreck -accident -disaster -collision -dead -corpse -disease -pathology -surgery -wound -poster -stamp -logo -advertisement';

/** What actually gets sent to Commons. Just the gloss plus the exclusions
 * above — the ANAT-specific "human" nudge and insect exclusions this used to
 * carry left with ANAT itself; see OBJECT_CATEGORIES for why. */
function searchQueryFor(en) {
  return `${cleanGloss(en)} ${GENERAL_EXCLUDE}`;
}

/**
 * The object-word list: every corpus entry that is unambiguously a concrete
 * noun, most frequent first, deduplicated by real-world referent.
 */
function collectWords(vocab, corpus) {
  const byId = new Map(corpus.entries.map((entry) => [entry.id, entry]));
  const byLemma = new Map();
  for (const entry of corpus.entries) {
    const key = entry.lemma.toLowerCase();
    if (!byLemma.has(key)) byLemma.set(key, entry);
  }

  const candidates = [];
  const seenLemma = new Set();
  for (const item of vocab) {
    if (item.pos !== 'SUBST' || !item.en || !item.lb) continue;
    const key = item.lb.toLowerCase();
    if (seenLemma.has(key) || EXCLUDE_WORDS.has(key)) continue;

    const entry = byId.get(item.id) ?? byLemma.get(key);
    if (!entry) continue;
    const categories = new Set(entry.categories ?? []);
    if (![...categories].some((name) => OBJECT_CATEGORIES.has(name))) continue;
    if ([...categories].some((name) => EXCLUDE_CATEGORIES.has(name))) continue;

    seenLemma.add(key);
    candidates.push({ ...item, categories });
  }

  // Deduplicate true synonyms, keeping whichever spelling is more frequent.
  const byGloss = new Map();
  for (const candidate of candidates) {
    const gloss = candidate.en.toLowerCase().trim();
    if (GLOSS_MERGE_EXEMPT.has(gloss)) continue;
    const existing = byGloss.get(gloss);
    if (!existing || (candidate.rank ?? Infinity) < (existing.rank ?? Infinity)) byGloss.set(gloss, candidate);
    else candidate.dropAsSynonym = true;
  }
  const deduped = candidates.filter((candidate) => !candidate.dropAsSynonym);

  return deduped.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)).slice(0, WORD_LIMIT);
}

/**
 * Commons' own relevance ranking is not trustworthy enough to take the first
 * hit on faith — searching "water" surfaced a photo of a bird titled
 * "IceBirdWithFledgling" with no textual connection to water at all, found
 * while building this file. A result only counts if the *file's own title*
 * contains the word being searched for, which is a cheap check but a real
 * one: a mismatch this bad always fails it, and a genuine photo almost always
 * passes it (Commons filenames are descriptive by convention).
 *
 * For a multi-word disambiguated term ("human head", "potato chip") every
 * word of at least four letters must appear — matching just "human" would
 * accept any photo of a person doing anything, which defeats the point of
 * adding the word.
 */
function titleMatches(title, term) {
  const words = term.toLowerCase().split(/\s+/).filter((word) => word.length >= 4);
  const required = words.length > 0 ? words : term.toLowerCase().split(/\s+/);
  const normalisedTitle = title.toLowerCase();
  // A leading word boundary only, not a trailing one: Commons titles are as
  // likely to say "Eggs" or "Bananas" as the singular gloss this app looks
  // for, and requiring the exact word rejected plenty of otherwise-correct
  // titles over nothing but a plural "s". The leading boundary is what still
  // stops "chip" from matching inside "microchip".
  return required.every((word) => new RegExp(`\\b${word}`).test(normalisedTitle));
}

async function searchOnePhoto(query, requireTerm) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: String(THUMB_WIDTH),
  });

  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const pages = Object.values(payload.query?.pages ?? {});

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !info.thumburl) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) continue;
    if (info.width && info.width < MIN_DIMENSION) continue;
    if (info.height && info.height < MIN_DIMENSION) continue;
    if (!titleMatches(page.title.replace(/^File:/, ''), requireTerm)) continue;

    const meta = info.extmetadata ?? {};
    const licence = stripHtml(meta.LicenseShortName?.value);
    if (!isFree(licence)) continue;

    return {
      pageid: page.pageid,
      imageUrl: info.thumburl,
      imageCredit: stripHtml(meta.Artist?.value).slice(0, 80) || 'Unknown',
      imageLicence: licence,
      imageSource: info.descriptionurl ?? `https://commons.wikimedia.org/?curid=${page.pageid}`,
    };
  }
  return null;
}

const OUT_APP = path.join(paths.ROOT, 'app', 'data', 'word-images.json');
const OUT_CONTENT = path.join(paths.ITEMS_DIR, 'word-images.json');

function buildPayload(items) {
  const bytes = items.reduce((sum, item) => {
    const file = path.join(paths.ROOT, 'app', item.imageUrl);
    return sum + (fs.existsSync(file) ? fs.statSync(file).size : 0);
  }, 0);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/fetch-object-images.js',
      source: 'Wikimedia Commons',
      note:
        'One openly licensed photograph per everyday-object word, for the picture-naming game. The word list ' +
        'is the shipped vocabulary deck, filtered to concrete-object categories; nothing here is invented. ' +
        'Every photograph keeps its author and licence.',
      count: items.length,
      bytes,
    },
    items: [...items].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
  };
}

async function writeCheckpoint(items) {
  const payload = buildPayload(items);
  await writeJson(OUT_CONTENT, payload);
  await writeJson(OUT_APP, payload);
  return payload;
}

async function main() {
  const limit = readArg('--limit', WORD_LIMIT);
  const dry = process.argv.includes('--dry');

  const corpus = require(paths.CORPUS_PATH);
  const vocab = require(path.join(paths.ITEMS_DIR, 'vocab.json')).items;
  const words = collectWords(vocab, corpus).slice(0, limit);

  // Commons rate-limits by the hour, not the run, and a run over ~150 words
  // with real backoff can outlast a single sitting. Resuming by word (not by
  // id — the id is a Commons page id, unknown until the word is searched)
  // means a second `npm run fetch:object-images` tomorrow picks up where
  // today left off rather than re-spending the words already found.
  const existing = fs.existsSync(OUT_APP) ? require(OUT_APP).items : [];
  const existingByLb = new Map(existing.map((item) => [item.lb, item]));
  const remaining = words.filter((word) => !existingByLb.has(word.lb));
  process.stdout.write(
    `${words.length} object words in scope, ${existing.length} already have a photo, ${remaining.length} left to search\n`,
  );

  if (dry) {
    process.stdout.write(`${remaining.length} searches would run\n`);
    return;
  }

  await fsp.mkdir(IMAGE_DIR, { recursive: true });
  let items = existing;
  const seenId = new Set(existing.map((item) => item.id));
  let misses = 0;

  for (const word of remaining) {
    const query = searchQueryFor(word.en);
    const requireTerm = cleanGloss(word.en);
    let photo;
    try {
      photo = await searchOnePhoto(query, requireTerm);
    } catch (error) {
      process.stderr.write(`  ${word.lb} ("${query}"): ${error.message}\n`);
      continue;
    }
    if (!photo) {
      misses += 1;
      continue;
    }

    const id = `obj-${photo.pageid}`;
    if (seenId.has(id)) continue; // two words turned up the same Commons file
    const file = `${id}.jpg`;
    const target = path.join(IMAGE_DIR, file);
    try {
      const response = await politeFetch(photo.imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await fsp.writeFile(target, Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      process.stderr.write(`  ${id}: ${error.message}\n`);
      continue;
    }
    seenId.add(id);

    items = [
      ...items,
      {
        id,
        lb: word.lb,
        en: word.en,
        level: word.level ?? null,
        rank: word.rank ?? null,
        imageUrl: `assets/img/${file}`,
        imageCredit: photo.imageCredit,
        imageLicence: photo.imageLicence,
        imageSource: photo.imageSource,
      },
    ];
    // Checkpointed after every word, not just at the end: this run can be
    // rate-limited into the ground by Commons (seen while building this —
    // Retry-After climbing past 50 seconds per request), and a process killed
    // by a wall-clock timeout mid-loop used to leave nothing at all on disk,
    // discarding however many words it had already found.
    await writeCheckpoint(items);
  }

  // If nothing new was found, `items` is still the exact array `existing`
  // started as — nothing to write, and writing anyway would create an empty
  // word-images.json (or rewrite an unchanged one) purely from a run that
  // Commons rate-limited into finding zero photos. A file appearing in `git
  // status` for a run that accomplished nothing is worse than no file.
  const payload = items === existing ? buildPayload(items) : await writeCheckpoint(items);
  process.stdout.write(
    `${payload.items.length} photos on disk (${payload.items.length - existing.length} new this run), ` +
      `${misses} words had no free-licensed match, ${(payload.meta.bytes / 1e6).toFixed(1)} MB total\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`fetch-object-images failed: ${error.stack}\n`);
    process.exit(1);
  });
}

module.exports = { collectWords, searchQueryFor, cleanGloss, titleMatches, OBJECT_CATEGORIES, EXCLUDE_CATEGORIES, EXCLUDE_WORDS };
