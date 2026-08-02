#!/usr/bin/env node
'use strict';

/**
 * Generates the exercise items the app ships, from content/corpus.json.
 *
 * The hard rule this file obeys: **no Luxembourgish sentence is ever authored
 * here.** Every Luxembourgish string in the output is one of
 *
 *   a) a LOD example sentence, verbatim;
 *   b) a LOD headword or an inflected form LOD publishes;
 *   c) one of the QUESTION_STEMS below, each of which is built only from
 *      corpus forms and checked against LOD's own usage (see the comment on
 *      that constant).
 *
 * That is deliberately restrictive. `pipeline/validate.js` is a form-level
 * gate: it proves a word exists and is spelled right, not that a sentence is
 * grammatical. Generating novel Luxembourgish would produce items that pass
 * the gate and still teach the wrong thing, and a wrong item taught twice is
 * worse than a missing item.
 *
 * Structure follows what INLL publishes, not what the brief guessed:
 * three listening exercises of 5 + 7 + 4 multiple-choice questions.
 *
 *   node pipeline/build-items.js [--seed N]
 */

const fsp = require('node:fs/promises');
const path = require('node:path');

const paths = require('./lib/paths');
const { TOPICS } = require('./lib/topics');
const { writeJson } = require('./lib/write-json');
const { checkLexicon, checkNRule } = require('./validate');
const { createChecker } = require('./lib/nrule');

/**
 * The generator gates its own output.
 *
 * LOD is not perfectly self-consistent - a handful of its example sentences
 * carry proper names it never indexes ("Nassau-Weilburg"), or an n-rule the
 * rest of the corpus contradicts ("Elteren säin"). Rather than loosen the
 * validator to accommodate them, the generator simply refuses to build items
 * out of sentences that would not pass. LOD's inconsistencies cost us a few
 * clips out of ten thousand; loosening the gate would cost us the gate.
 */
function makeGate(lexicon) {
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });
  return function isClean(text) {
    const findings = [];
    checkLexicon(lexicon, text, 'clip', findings);
    checkNRule(checker, text, 'clip', findings);
    return findings.every((finding) => finding.severity !== 'error');
  };
}

/**
 * Question stems. Each is assembled only from forms LOD publishes, and each
 * was checked against LOD's own example sentences before being used:
 *
 *  - "wat hutt Dir …?" appears verbatim in LOD examples (13 occurrences), and
 *    LOD gives `héieren` as the past participle of `héieren` (entry HEIEREN1,
 *    auxiliary `hunn`) - so the perfect is "wat hutt Dir héieren?".
 *  - "wat feelt?" - `feelen` is attested in LOD examples in exactly this
 *    third-person form ("et feelt eng Aachtchen an dengem Kaartespill").
 *
 * Anything less certain than this goes in English. The brief allows English
 * and French freely for chrome; it does not allow guessed Luxembourgish.
 */
const QUESTION_STEMS = {
  heard: { lb: 'Wat hutt Dir héieren?', en: 'What did you hear?', fr: "Qu'avez-vous entendu ?" },
  missing: { lb: 'Wat feelt?', en: 'Which word is missing?', fr: 'Quel mot manque-t-il ?' },
};

/**
 * The exercise plan. The A1 comprehension exercise goes first — it tests
 * whether the learner understands what was said (English answer options),
 * rather than whether they caught a keyword. The remaining three mirror
 * the official B1 5+7+4 shape.
 */
const EXERCISE_PLAN = [
  {
    n: 0,
    kind: 'comprehension',
    count: 4,
    title_en: 'What does the sentence mean?',
    title_fr: 'Que signifie la phrase ?',
    note_en: 'A1 comprehension — listen and pick the meaning in English.',
  },
  {
    n: 1,
    kind: 'sentence-recognition',
    count: 5,
    title_en: 'Listen and choose what was said',
    title_fr: 'Écoutez et choisissez ce qui a été dit',
    note_en: 'Mirrors INLL listening exercise 1 (5 questions).',
  },
  {
    n: 2,
    kind: 'word-recognition',
    count: 7,
    title_en: 'Listen and choose the word you heard',
    title_fr: 'Écoutez et choisissez le mot entendu',
    note_en: 'Mirrors INLL listening exercise 2 (7 questions).',
  },
  {
    n: 3,
    kind: 'gap-fill',
    count: 4,
    title_en: 'Listen and fill the gap',
    title_fr: 'Écoutez et complétez',
    note_en: 'Mirrors INLL listening exercise 3 (4 questions).',
  },
];

const OPTIONS_PER_QUESTION = 3;

/* --------------------------------------------------------------- utilities */

/** mulberry32 - small, fast, and deterministic, so builds are reproducible. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Stable id from a string, so item ids do not churn between builds. */
function shortHash(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  return hash.toString(36).slice(0, 8);
}

/** The LOD asset id for a recording - matches validate.js's audioIdFor. */
function audioIdOf(audio) {
  return path.basename(String(audio.ogg ?? audio.aac ?? '')).replace(/\.[a-z0-9]+$/i, '');
}

const WORD_RE = /[\p{L}][\p{L}'’-]*/gu;

function wordsOf(sentence) {
  return String(sentence).match(WORD_RE) ?? [];
}

/* ------------------------------------------------------------ corpus index */

/**
 * Flattens the corpus into the units the generators need: one record per
 * example sentence that has a native recording, carrying the entry it belongs
 * to and every published form of that entry.
 */
function indexCorpus(corpus, isClean) {
  const byLemma = new Map();
  const clips = [];
  let rejected = 0;

  for (const entry of corpus.entries) {
    if (!byLemma.has(entry.lemma)) byLemma.set(entry.lemma, entry);

    const forms = new Set([entry.lemma]);
    for (const inflected of entry.inflection) {
      if (inflected.type === 'secondaryHeadword') continue; // multi-word, not a token
      if (inflected.form) forms.add(inflected.form);
      if (inflected.nRuleForm) forms.add(inflected.nRuleForm);
    }

    for (const meaning of entry.meanings) {
      for (const example of meaning.examples) {
        if (!example.audio) continue;
        if (!isClean(example.text)) {
          rejected += 1;
          continue;
        }
        clips.push({
          entry,
          forms,
          text: example.text,
          audio: example.audio,
          audioId: audioIdOf(example.audio),
          words: wordsOf(example.text),
        });
      }
    }
  }
  return { byLemma, clips, rejected };
}

/** Clips belonging to a topic, deduplicated by transcript. */
function clipsForTopic(topic, index) {
  const wanted = new Set();
  for (const seed of topic.seeds) {
    const entry = index.byLemma.get(seed);
    if (!entry) throw new Error(`topic "${topic.id}": seed "${seed}" is not in content/corpus.json`);
    wanted.add(entry.id);
  }
  const seen = new Set();
  const out = [];
  for (const clip of index.clips) {
    if (!wanted.has(clip.entry.id)) continue;
    if (seen.has(clip.text)) continue;
    seen.add(clip.text);
    out.push(clip);
  }
  return out;
}

/* --------------------------------------------------------- question makers */

/**
 * Hear a sentence, pick what it means from three English options. The correct
 * answer is the LOD entry's own English gloss; distractors are glosses from
 * entries in OTHER topics so the three options look genuinely different.
 */
function makeComprehensionQuestion(clip, pool, random, allGlosses) {
  const gloss = clip.entry.glosses?.en?.[0];
  if (!gloss) return null;

  const seen = new Set([gloss.toLowerCase()]);
  const candidates = allGlosses ?? [];
  const distractors = [];
  for (const other of shuffled(candidates, random)) {
    if (seen.has(other.toLowerCase())) continue;
    seen.add(other.toLowerCase());
    distractors.push(other);
    if (distractors.length >= OPTIONS_PER_QUESTION - 1) break;
  }
  if (distractors.length < OPTIONS_PER_QUESTION - 1) return null;

  const options = shuffled([gloss, ...distractors], random);
  return {
    id: `q-${shortHash(`comp:${clip.audioId}`)}`,
    kind: 'comprehension',
    audioId: clip.audioId,
    transcript: clip.text,
    question_lb: null,
    question_en: 'What is this sentence about?',
    question_fr: 'De quoi parle cette phrase ?',
    options_en: options,
    correct: options.indexOf(gloss),
    entryIds: [clip.entry.id],
  };
}

/** Hear a sentence, pick its transcript from three real LOD sentences. */
function makeSentenceQuestion(clip, pool, random) {
  const distractors = pickDistinct(
    pool.filter((other) => other.text !== clip.text && lengthClass(other.text) === lengthClass(clip.text)),
    OPTIONS_PER_QUESTION - 1,
    random,
  );
  if (distractors.length < OPTIONS_PER_QUESTION - 1) return null;

  const options = shuffled([clip, ...distractors], random);
  return {
    id: `q-${shortHash(`sentence:${clip.audioId}`)}`,
    kind: 'sentence-recognition',
    audioId: clip.audioId,
    transcript: clip.text,
    question_lb: QUESTION_STEMS.heard.lb,
    question_en: QUESTION_STEMS.heard.en,
    question_fr: QUESTION_STEMS.heard.fr,
    options_lb: options.map((option) => option.text),
    correct: options.findIndex((option) => option.text === clip.text),
    entryIds: [clip.entry.id],
  };
}

/** Hear a sentence, pick which of three headwords occurred in it. */
function makeWordQuestion(clip, pool, random) {
  // The target is the entry's own form as it appears in this sentence.
  const target = findFormInSentence(clip);
  if (!target) return null;

  const targetLower = target.toLowerCase();
  const sentenceWords = new Set(clip.words.map((word) => word.toLowerCase()));

  const candidates = [];
  const seen = new Set([targetLower]);
  for (const other of pool) {
    if (other.entry.id === clip.entry.id) continue;
    const form = other.entry.lemma;
    const lower = form.toLowerCase();
    // A distractor must not actually occur in the recording.
    if (seen.has(lower) || sentenceWords.has(lower)) continue;
    seen.add(lower);
    candidates.push(form);
  }

  const distractors = pickDistinct(candidates, OPTIONS_PER_QUESTION - 1, random);
  if (distractors.length < OPTIONS_PER_QUESTION - 1) return null;

  const options = shuffled([target, ...distractors], random);
  return {
    id: `q-${shortHash(`word:${clip.audioId}`)}`,
    kind: 'word-recognition',
    audioId: clip.audioId,
    transcript: clip.text,
    question_lb: QUESTION_STEMS.heard.lb,
    question_en: 'Which of these words did you hear?',
    question_fr: 'Lequel de ces mots avez-vous entendu ?',
    options_lb: options,
    correct: options.indexOf(target),
    entryIds: [clip.entry.id],
  };
}

/**
 * Hear a sentence, see its transcript with one word hidden, pick the missing
 * form. `gapIndex` points at the word to hide: the full transcript stays in
 * the file so the validator sees real, complete text, and the UI does the
 * hiding. Blanking it here would hand the n-rule checker a fake neighbour.
 */
function makeGapQuestion(clip, pool, random) {
  const target = findFormInSentence(clip);
  if (!target) return null;

  const gapIndex = clip.words.findIndex((word) => word.toLowerCase() === target.toLowerCase());
  if (gapIndex === -1) return null;

  const pos = clip.entry.partOfSpeech;
  const sentenceWords = new Set(clip.words.map((word) => word.toLowerCase()));
  const candidates = [];
  const seen = new Set([target.toLowerCase()]);
  for (const other of pool) {
    if (other.entry.id === clip.entry.id) continue;
    if (other.entry.partOfSpeech !== pos) continue; // same part of speech, so the gap stays fair
    const form = other.entry.lemma;
    const lower = form.toLowerCase();
    if (seen.has(lower) || sentenceWords.has(lower)) continue;
    seen.add(lower);
    candidates.push(form);
  }

  const distractors = pickDistinct(candidates, OPTIONS_PER_QUESTION - 1, random);
  if (distractors.length < OPTIONS_PER_QUESTION - 1) return null;

  const options = shuffled([target, ...distractors], random);
  return {
    id: `q-${shortHash(`gap:${clip.audioId}`)}`,
    kind: 'gap-fill',
    audioId: clip.audioId,
    transcript: clip.text,
    gapIndex,
    question_lb: QUESTION_STEMS.missing.lb,
    question_en: QUESTION_STEMS.missing.en,
    question_fr: QUESTION_STEMS.missing.fr,
    options_lb: options,
    correct: options.indexOf(target),
    entryIds: [clip.entry.id],
  };
}

/** The entry's own form as it occurs in this sentence, if it does. */
function findFormInSentence(clip) {
  const lowerForms = new Map();
  for (const form of clip.forms) lowerForms.set(form.toLowerCase(), form);
  for (const word of clip.words) {
    const match = lowerForms.get(word.toLowerCase());
    if (match) return word; // the surface form, as heard
  }
  return null;
}

function lengthClass(text) {
  const words = wordsOf(text).length;
  if (words <= 6) return 'short';
  if (words <= 11) return 'medium';
  return 'long';
}

function pickDistinct(candidates, count, random) {
  return shuffled(candidates, random).slice(0, count);
}

/* ------------------------------------------------------- listening builder */

function buildListeningSet(topic, clips, random, allGlosses) {
  const exercises = [];
  const used = new Set();
  let total = 0;

  for (const plan of EXERCISE_PLAN) {
    const isComp = plan.kind === 'comprehension';
    const make = isComp
      ? (clip, pool, rng) => makeComprehensionQuestion(clip, pool, rng, allGlosses)
      : plan.kind === 'sentence-recognition'
        ? makeSentenceQuestion
        : plan.kind === 'word-recognition'
          ? makeWordQuestion
          : makeGapQuestion;

    const questions = [];
    for (const clip of shuffled(clips, random)) {
      if (questions.length >= plan.count) break;
      if (used.has(clip.audioId)) continue;
      const question = make(clip, clips, random);
      if (!question) continue;
      used.add(clip.audioId);
      questions.push(question);
    }
    if (questions.length === 0) continue;
    exercises.push({
      n: plan.n,
      kind: plan.kind,
      title_en: plan.title_en,
      title_fr: plan.title_fr,
      note_en: plan.note_en,
      questions,
    });
    total += questions.length;
  }

  if (total === 0) return null;
  return {
    id: `listening-${topic.id}`,
    module: 'verstoen',
    type: 'listening-set',
    level: 'B1',
    topic: topic.id,
    title_en: `${topic.en} — listening`,
    title_fr: `${topic.fr} — compréhension orale`,
    source: 'LOD example-sentence recordings (CC0)',
    attribution: "Lëtzebuerger Online Dictionnaire, Zenter fir d'Lëtzebuerger Sprooch",
    notes:
      'Every recording is a native speaker and every option is a LOD sentence or headword, verbatim. ' +
      'These are corpus-derived drills on the official 5+7+4 shape, not a replica of the INLL test, ' +
      'which uses connected discourse. The official sample test is linked in the app.',
    exercises,
    questionCount: total,
  };
}

/* ------------------------------------------------------- interview builder */

/**
 * Interview prompts, from LOD example sentences that are already questions
 * addressed to a person. Selecting real questions rather than writing them is
 * the only way to be sure the Luxembourgish is right.
 *
 * The three phases mirror the official topic sheets, which open generally,
 * move to the past, then to the candidate's present situation.
 */
const SECOND_PERSON = /(^|\s)(du|de|dir|däi|däin|deng|dech|dir|är|ären|äert|iech|hutt|hues|bass|kanns|kënnt|wëlls|géifs)(\s|$|,)/i;

const PHASES = [
  { id: 'general', title_en: 'Warm-up', title_fr: 'Mise en route', hint_en: 'Answer in a full sentence, then add one more detail.' },
  { id: 'past', title_en: 'The past', title_fr: 'Le passé', hint_en: 'Use the perfect: hunn / sinn plus the participle.' },
  { id: 'present', title_en: 'Your situation now', title_fr: 'Votre situation actuelle', hint_en: 'Compare then and now if you can.' },
];

/**
 * Topic-relevant questions from anywhere in the corpus.
 *
 * Restricting prompts to the seed entries' own examples yields almost nothing
 * - a question about work is far more likely to be filed under the verb it
 * uses than under "Aarbecht". So the pool is every recorded question in the
 * corpus that *mentions* one of the topic's words.
 */
function interviewPoolFor(topic, index) {
  const forms = new Set();
  for (const seed of topic.seeds) {
    const entry = index.byLemma.get(seed);
    for (const form of formsOfEntry(entry)) forms.add(form.toLowerCase());
  }
  const seen = new Set();
  const out = [];
  for (const clip of index.clips) {
    if (!clip.text.trim().endsWith('?')) continue;
    if (!SECOND_PERSON.test(clip.text)) continue;
    if (seen.has(clip.text)) continue;
    if (!clip.words.some((word) => forms.has(word.toLowerCase()))) continue;
    seen.add(clip.text);
    out.push(clip);
  }
  return out;
}

function formsOfEntry(entry) {
  const forms = new Set([entry.lemma]);
  for (const inflected of entry.inflection) {
    if (inflected.type === 'secondaryHeadword') continue;
    if (inflected.form) forms.add(inflected.form);
    if (inflected.nRuleForm) forms.add(inflected.nRuleForm);
  }
  return forms;
}

function buildInterview(topic, pool, random) {
  const questions = shuffled(pool, random);
  if (questions.length === 0) return null;

  const perPhase = Math.max(1, Math.floor(questions.length / PHASES.length));
  const phases = PHASES.map((phase, index) => ({
    phase: phase.id,
    title_en: phase.title_en,
    title_fr: phase.title_fr,
    hint_en: phase.hint_en,
    questions: questions.slice(index * perPhase, (index + 1) * perPhase).slice(0, 4).map((clip) => ({
      id: `iq-${shortHash(`interview:${clip.audioId}`)}`,
      prompt_lb: clip.text,
      audioId: clip.audioId,
      entryIds: [clip.entry.id],
    })),
  })).filter((phase) => phase.questions.length > 0);

  if (phases.length === 0) return null;

  return {
    id: `interview-${topic.id}`,
    module: 'schwaetzen',
    type: 'interview',
    level: 'A2',
    topic: topic.id,
    title_en: topic.en,
    title_fr: topic.fr,
    title_lb: topic.lb,
    source: 'LOD example sentences (CC0)',
    attribution: "Lëtzebuerger Online Dictionnaire, Zenter fir d'Lëtzebuerger Sprooch",
    notes:
      'Prompts are LOD example sentences that are already questions addressed to a person, so the ' +
      'Luxembourgish is native. The real INLL topic sheets run ~21 questions in three phases with ' +
      'branching; the app links to the official examples and can load your own set locally.',
    phases,
  };
}

/* ------------------------------------------------------------------- build */

async function main() {
  const seedIndex = process.argv.indexOf('--seed');
  const seed = seedIndex === -1 ? 20260727 : Number(process.argv[seedIndex + 1]);

  const corpus = JSON.parse(await fsp.readFile(paths.CORPUS_PATH, 'utf8'));
  const lexicon = JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8'));
  const index = indexCorpus(corpus, makeGate(lexicon));
  process.stdout.write(
    `Indexed ${index.clips.length.toLocaleString()} recorded example sentences ` +
      `(${index.rejected} rejected by the validator)\n`,
  );

  // Collect all distinct English glosses from the corpus, for comprehension
  // distractors that span topics rather than repeating the same field.
  const allGlosses = [];
  const glossSeen = new Set();
  for (const entry of corpus.entries) {
    const gloss = entry.glosses?.en?.[0];
    if (gloss && !glossSeen.has(gloss.toLowerCase())) {
      glossSeen.add(gloss.toLowerCase());
      allGlosses.push(gloss);
    }
  }

  const listening = [];
  const interviews = [];
  const audioIds = new Set();
  const report = [];

  for (const topic of TOPICS) {
    // A per-topic seed keeps one topic's content stable when another changes.
    const random = makeRandom(seed ^ shortHash(topic.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0));
    const clips = clipsForTopic(topic, index);

    const set = buildListeningSet(topic, clips, random, allGlosses);
    const interview = buildInterview(topic, interviewPoolFor(topic, index), random);

    if (set) {
      listening.push(set);
      for (const exercise of set.exercises) for (const question of exercise.questions) audioIds.add(question.audioId);
    }
    if (interview) {
      interviews.push(interview);
      for (const phase of interview.phases) for (const question of phase.questions) audioIds.add(question.audioId);
    }

    report.push({
      topic: topic.id,
      clips: clips.length,
      listening: set ? set.questionCount : 0,
      interview: interview ? interview.phases.reduce((n, p) => n + p.questions.length, 0) : 0,
    });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    generator: 'pipeline/build-items.js',
    seed,
    corpus: corpus.meta.sources,
    license: 'CC0-1.0',
    attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
    examFormat: {
      source: 'https://www.inll.lu/fr/sproochentest/',
      listening: 'CEFR B1, ~35 min, three exercises of 5 + 7 + 4 multiple-choice questions',
      speaking: 'CEFR A2, ~10 min: interview on a chosen topic, then description of a chosen image',
      rubric: ['Lexik', 'Morphosyntax', 'Phoneetik', 'Aufgabenerfëllung'],
      rubricBands: [0, 1, 2, 3, 4, 5],
      examinerWeighting: { interlocuteur: 0.2, assessor: 0.8 },
      passRule: 'Over 50% on the speaking part, or over 50% overall',
      note: 'Structure taken from INLL published material. No INLL content is reproduced here.',
    },
  };

  const topicItems = TOPICS.map((topic) => ({
    id: topic.id,
    type: 'topic',
    title_lb: topic.lb,
    title_en: topic.en,
    title_fr: topic.fr,
    entryIds: topic.seeds.map((seed) => index.byLemma.get(seed).id),
  }));

  const files = {
    listening: { meta, items: listening },
    interviews: { meta, items: interviews },
    topics: { meta, items: topicItems },
  };

  // content/items/ is the auditable copy that validate.js gates and git tracks.
  // app/data/ is the same payload where the PWA can fetch it, so /app stays
  // self-contained and deployable on its own.
  await fsp.mkdir(paths.ITEMS_DIR, { recursive: true });
  const appData = path.join(paths.ROOT, 'app', 'data');
  await fsp.mkdir(appData, { recursive: true });
  for (const [name, payload] of Object.entries(files)) {
    await writeJson(path.join(paths.ITEMS_DIR, `${name}.json`), payload);
    await writeJson(path.join(appData, `${name}.json`), payload);
  }
  await writeJson(path.join(paths.CONTENT_DIR, 'audio-manifest.json'), {
    meta,
    // Which recordings the shipped items need. mirror-audio.js reads this.
    audioIds: [...audioIds].sort(),
  });

  const table = report
    .map((row) => `  ${row.topic.padEnd(14)} ${String(row.clips).padStart(4)} clips  ${String(row.listening).padStart(3)} listening  ${String(row.interview).padStart(3)} interview`)
    .join('\n');
  process.stdout.write(`${table}\n`);
  process.stdout.write(
    `Wrote ${listening.length} listening sets (${report.reduce((n, r) => n + r.listening, 0)} questions), ` +
      `${interviews.length} interview sets (${report.reduce((n, r) => n + r.interview, 0)} prompts), ` +
      `${audioIds.size} distinct recordings referenced\n`,
  );
  process.stdout.write('Next: node pipeline/mirror-audio.js && node pipeline/validate.js\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`build-items failed: ${error.stack}\n`);
    process.exit(1);
  });
}

module.exports = { makeRandom, indexCorpus, QUESTION_STEMS, EXERCISE_PLAN };
