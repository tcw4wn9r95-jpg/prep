'use strict';

/**
 * The Sentence Builder deck — say it in Luxembourgish, one word tile at a time.
 *
 * ## The rule this file exists to hold to
 *
 * Every Luxembourgish sentence it emits already existed, character for
 * character, before this ran. Nothing here composes Luxembourgish out of
 * attested words, which would be authoring it by another name. There are
 * exactly two sources and both are quoted verbatim:
 *
 *   `lod`            an example sentence LOD publishes for one of its entries,
 *                    reached through the built vocab and verb decks.
 *   `model-answers`  a sentence out of `content/hand-authored/model-answers.json`
 *                    — real Sproochentest answers written by a human tutor,
 *                    which that file's own header already exempts from the
 *                    corpus gate and which the app already ships.
 *
 * The **English is authored**, in `content/hand-authored/sentence-english.json`,
 * and that is allowed: the corpus rule binds Luxembourgish, not English prose.
 * It is keyed by the exact Luxembourgish, so a sentence whose text drifts loses
 * its translation loudly rather than silently keeping the wrong one — a
 * sentence with no English is a build error, never a shipped card with a blank
 * prompt.
 *
 * ## Why two output files
 *
 * The same split the repository already makes for model answers, and for the
 * same reason. LOD-sourced sentences go to `content/items/sentences.json`,
 * which `pipeline/validate.js` walks and checks token by token against the
 * lexicon and the Eifeler Regel. The tutor's sentences are not LOD and would
 * fail that gate — correctly, they are not dictionary examples — so they go to
 * `content/hand-authored/sentence-answers.json`, exactly where
 * `model-answers.json` already sits and under the same documented exemption.
 * Both are copied to `app/data/` where the app fetches them.
 *
 * Keeping them apart is what stops the exemption spreading: a future sentence
 * added to the LOD file still has to survive the validator.
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const paths = require('./lib/paths');

const ENGLISH_PATH = path.join(paths.CONTENT_DIR, 'hand-authored', 'sentence-english.json');
const MODEL_ANSWERS_PATH = path.join(paths.CONTENT_DIR, 'hand-authored', 'model-answers.json');
const LOD_OUT = path.join(paths.ITEMS_DIR, 'sentences.json');
const ANSWERS_OUT = path.join(paths.CONTENT_DIR, 'hand-authored', 'sentence-answers.json');
const APP_DATA = path.join(paths.ROOT, 'app', 'data');

/**
 * How long a sentence may be, in words.
 *
 * The floor is about the exercise being worth doing — three tiles is not a
 * sentence to build. The ceiling is about the screen: every tile has to be
 * tappable and the whole bank has to fit a phone, and past a dozen words the
 * bank wraps into a wall of Luxembourgish that is a reading test rather than a
 * building one.
 */
const MIN_WORDS = 3;
const MAX_WORDS = 12;

const words = (sentence) => String(sentence).trim().split(/\s+/).filter(Boolean);

/** The eighteen topics the Sproochentest interviews on, from topics.json. */
let EXAM_TOPICS = new Set();

/** A short stable id, so the same sentence keeps its id across rebuilds. */
function idFor(prefix, sentence) {
  return `${prefix}-${crypto.createHash('sha1').update(sentence).digest('hex').slice(0, 10)}`;
}

/**
 * Split a model answer into sentences.
 *
 * The lookahead on a capital is what keeps "John F. Kennedy" in one piece: a
 * naive split on `.` cut it after the initial and produced "Ech hunn eng
 * Biografie vum John F." as a card, which is not a sentence and cannot be
 * translated.
 */
function intoSentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+(?=[A-ZÄËÉÖÜ])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------ the sources */

/**
 * Every LOD example sentence, with the topics of the entries it illustrates.
 *
 * A sentence can illustrate several entries, so the topics are unioned and the
 * recording is taken from whichever entry has one.
 */
async function lodSentences() {
  const byLb = new Map();
  for (const deck of ['vocab', 'verbs']) {
    const file = JSON.parse(await fsp.readFile(path.join(paths.ITEMS_DIR, `${deck}.json`), 'utf8'));
    for (const item of file.items ?? []) {
      const lb = item.example?.lb;
      if (!lb) continue;
      const found = byLb.get(lb) ?? { lb, topics: new Set(), audioId: null, level: item.level ?? 'A2' };
      for (const topic of item.topics ?? []) found.topics.add(topic);
      found.audioId = found.audioId ?? item.example?.audioId ?? null;
      if (item.level === 'A1') found.level = 'A1';
      byLb.set(lb, found);
    }
  }
  return byLb;
}

/** Every sentence of every model answer, with the question it answers. */
async function answerSentences() {
  const file = JSON.parse(await fsp.readFile(MODEL_ANSWERS_PATH, 'utf8'));
  const out = new Map();
  for (const topic of file.interviews ?? []) {
    for (const question of topic.questions ?? []) {
      for (const answer of question.answers_lb ?? []) {
        const sentences = intoSentences(answer);
        sentences.forEach((sentence, at) => {
          // First question wins: the same short answer ("Ech wees net genau.")
          // can appear under two questions, and the card should quote one.
          if (out.has(sentence)) return;
          out.set(sentence, {
            lb: sentence,
            topic: topic.topic,
            question: question.lb,
            // Whether this sentence *is* the answer or a later part of one.
            // A tutor's reply runs two to four sentences, and the third of them
            // does not stand alone: "Ech kréien den Kapp wéi." under "Do you
            // use electronic books?" reads as a non sequitur, and asking the
            // learner to "answer it" with that is asking for the wrong thing.
            // The card says which it is rather than dropping the context.
            opens: at === 0,
          });
        });
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------- the build */

async function build() {
  const english = JSON.parse(await fsp.readFile(ENGLISH_PATH, 'utf8'));
  const topics = JSON.parse(await fsp.readFile(path.join(paths.ITEMS_DIR, 'topics.json'), 'utf8'));
  EXAM_TOPICS = new Set((topics.items ?? []).map((topic) => topic.id));
  const lod = await lodSentences();
  const answers = await answerSentences();

  const problems = [];
  const lodItems = [];
  const answerItems = [];
  const used = new Set();

  for (const [lb, { en, topic: curated }] of Object.entries(english.sentences)) {
    if (used.has(lb)) {
      problems.push(`duplicate English key: ${lb}`);
      continue;
    }
    used.add(lb);

    const length = words(lb).length;
    if (length < MIN_WORDS || length > MAX_WORDS) {
      problems.push(`${length} words, outside ${MIN_WORDS}-${MAX_WORDS}: ${lb}`);
      continue;
    }

    const fromAnswers = answers.get(lb);
    const fromLod = lod.get(lb);

    // The whole point of the file. An English key that matches no source
    // sentence means somebody typed Luxembourgish into the translations file,
    // which is the one thing that must not happen.
    if (!fromAnswers && !fromLod) {
      problems.push(`not found verbatim in any source — Luxembourgish must never be authored here: ${lb}`);
      continue;
    }

    if (fromLod) {
      // The curated topic, not LOD's. A sentence is tagged with every topic of
      // every entry it illustrates, so "d'Brout ass haart ewéi Steen!" arrives
      // under famill, sproochen and kreativitéit alike. Which topic a sentence
      // is *for* was a judgement made while translating it, and it is recorded
      // beside the translation.
      if (!curated) {
        problems.push(`no curated topic: ${lb}`);
        continue;
      }
      if (!EXAM_TOPICS.has(curated)) {
        problems.push(`"${curated}" is not one of the exam topics: ${lb}`);
        continue;
      }
      lodItems.push({
        id: idFor('sb', lb),
        type: 'sentence',
        source: 'lod',
        topic: curated,
        level: fromLod.level,
        en,
        lb,
        audioId: fromLod.audioId ?? null,
      });
    } else {
      const question_en = english.questions[fromAnswers.question];
      if (!question_en) {
        problems.push(`no English for the question "${fromAnswers.question}"`);
        continue;
      }
      // The tutor grouped these into seven question sheets rather than into the
      // eighteen exam topics, so the sheet a question sits on is often not the
      // topic a learner would look for it under — the book questions were
      // filed under media, the sport ones under hobbies. `questionTopics`
      // re-files those; everything else keeps the sheet's own topic.
      const topic = english.questionTopics?.[fromAnswers.question] ?? fromAnswers.topic;
      if (!EXAM_TOPICS.has(topic)) {
        problems.push(`"${topic}" is not one of the exam topics: ${lb}`);
        continue;
      }
      answerItems.push({
        id: idFor('sba', lb),
        type: 'sentence',
        source: 'model-answers',
        topic,
        level: 'A2',
        en,
        lb,
        question_lb: fromAnswers.question,
        question_en,
        opensAnswer: fromAnswers.opens,
      });
    }
  }

  if (problems.length > 0) {
    throw new Error(`build-sentences refused ${problems.length} item(s):\n  ${problems.join('\n  ')}`);
  }

  // Stable order: topic, then the sentence, so a rebuild produces byte-identical
  // output and a diff shows only what actually changed.
  const bySentence = (a, b) => a.topic.localeCompare(b.topic) || a.lb.localeCompare(b.lb);
  lodItems.sort(bySentence);
  answerItems.sort(bySentence);

  const meta = {
    generatedAt: new Date().toISOString(),
    generator: 'pipeline/build-sentences.js',
  };

  await write(LOD_OUT, {
    meta: {
      ...meta,
      source: 'LOD example sentences (CC0)',
      attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
      notes: 'Luxembourgish quoted verbatim from LOD; the English prompt is authored in content/hand-authored/sentence-english.json.',
    },
    items: lodItems,
  });

  await write(ANSWERS_OUT, {
    meta: {
      ...meta,
      source: 'content/hand-authored/model-answers.json',
      provenance: 'Sproochentest answers written by a human tutor and supplied by the app’s user. Like model-answers.json itself, this is not validated against the LOD corpus — see that file’s header.',
      notes: 'Luxembourgish quoted verbatim from the model answers; the English prompt is authored in content/hand-authored/sentence-english.json.',
    },
    items: answerItems,
  });

  const byTopic = {};
  for (const item of [...lodItems, ...answerItems]) byTopic[item.topic] = (byTopic[item.topic] ?? 0) + 1;

  process.stdout.write(
    `sentences: ${lodItems.length} from LOD, ${answerItems.length} from model answers, ` +
      `${Object.keys(byTopic).length} topics\n`,
  );
  for (const [topic, count] of Object.entries(byTopic).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${String(count).padStart(3)}  ${topic}\n`);
  }
}

/** Writes the file, and the copy under app/data/ where the PWA fetches it. */
async function write(target, payload) {
  const json = `${JSON.stringify(payload, null, 1)}\n`;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, json);
  await fsp.mkdir(APP_DATA, { recursive: true });
  await fsp.writeFile(path.join(APP_DATA, path.basename(target)), json);
}

if (require.main === module) {
  build().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { build, intoSentences, idFor, MIN_WORDS, MAX_WORDS };
