'use strict';

/**
 * Turn the study documents into flash cards.
 *
 *     npm run build:notes -- /path/to/folder-of-docx [--audit]
 *
 * The folder is not in the repository and the script is not part of
 * `npm run content`: the documents are somebody's course notes, and what ships
 * is their *content* in `content/hand-authored/speaking-notes.json`, not the
 * files. Re-run it, with the full set, whenever a new document arrives.
 *
 * ## Nothing here writes Luxembourgish
 *
 * Every question, answer and note is a line of a document, verbatim. The only
 * edits are the ones that are not words: whitespace is collapsed, a question's
 * list number is dropped, and a speaker label ("Name:") in front of an answer
 * is dropped. Typos stay typos. They are *reported* (`--audit`), never fixed —
 * correcting them would be authoring, and which spelling the course intends is
 * not this script's call.
 *
 * ## Why a heuristic and an overrides block
 *
 * The documents are working notes, not a format. Questions are usually bold and
 * usually end in "?" and are not always either; answers follow, interleaved with
 * English glosses and grammar reminders. So a paragraph is a **question** if it
 * asks one, a **note** if it is not Luxembourgish, and an **answer** otherwise —
 * and the places that rule gets wrong are named in `notes-config.js`, where the
 * build checks every one still matches a line.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const paths = require('./lib/paths');
const { readDocx } = require('./lib/docx');
const config = require('./notes-config');

const OUT = path.join(paths.CONTENT_DIR, 'hand-authored', 'speaking-notes.json');
const APP_DATA = path.join(paths.ROOT, 'app', 'data');

/**
 * Words that open a question in these notes.
 *
 * A question has to *start* with one. Looking for a "?" anywhere is the obvious
 * test and the wrong one: these are dialogue notes, so an answer routinely
 * carries a follow-up inside it — "Ech hu kee Gaart. Wat maacht Dir do?" — and
 * "mat mengem Mann / mat menger Fra" is an answer that merely begins with "mat".
 */
const QUESTION_OPENERS = new Set([
  'wéi', 'wat', 'wie', 'wien', 'wou', 'wuer', 'wéini', 'wéivill', 'firwat', 'hutt', 'sidd', 'sinn',
  'maacht', 'gitt', 'kaaft', 'iesst', 'denkt', 'mengt', 'liest', 'lauschtert', 'kënnt', 'ginn',
  'gëtt', 'ass', 'wier', 'schafft', 'fuert', 'besicht', 'waart', 'kacht', 'drénkt', 'fëmmt',
  'lieft', 'gesitt', 'sollt', 'hëlleft', 'wäscht', 'probéiert', 'streckt', 'léiert', 'vergläicht',
]);

/** Openers that make a question only when a "?" follows: "Wann ech eng Erkältung hunn…" is an answer. */
const CONDITIONAL_OPENERS = new Set(['wann', 'wa']);

/** Two-word openers, because the first word alone ("mat", "aus", "fir") opens plenty of answers. */
const QUESTION_PHRASES = new Set(['mat wiem', 'mat wat', 'aus wat', 'fir wat']);

/**
 * Words that are English and nothing else, so that a gloss is recognised even
 * when LOD happens to spell some English word: `clean`, `weekend`, `at`, `out`
 * and `happy` are all in the dictionary, which is why "share of words LOD does
 * not know" alone is not enough to tell "botzen = to clean" from Luxembourgish.
 * Deliberately short and function-word heavy; a word that is also Luxembourgish
 * (a, an, in, on, so, no, do, all) is not on it.
 */
const ENGLISH_ONLY = new Set([
  'the', 'to', 'of', 'is', 'are', 'was', 'were', 'be', 'been', 'at', 'it', 'its', 'you', 'your', 'he',
  'she', 'we', 'they', 'i', 'and', 'with', 'for', 'from', 'by', 'this', 'that', 'these', 'those', 'can',
  'could', 'would', 'should', 'only', 'which', 'what', 'when', 'where', 'why', 'how', 'not', 'if', 'but',
  'there', 'their', 'them', 'me', 'my', 'us', 'our', 'his', 'her', 'him', 'every', 'each', 'people',
  'think', 'guess', 'believe', 'mean', 'means', 'singular', 'plural', 'article', 'noun', 'verb', 'adjective',
  'answer', 'question', 'decide', 'want', 'order', 'place', 'time', 'before', 'after', 'inversion',
]);

/** Answers that are one word and are still answers. */
const ONE_WORD_ANSWERS = new Set(['jo', 'nee', 'neen', 'jo.', 'nee.']);

/* ---------------------------------------------------------------- text */

/** Whitespace, and nothing else: non-breaking spaces become spaces, runs collapse. */
const normalise = (text) =>
  String(text ?? '')
    // Word draws list bullets in the Symbol font as private-use glyphs (U+F0B7
    // here); they are formatting, and render as a box anywhere but Word.
    .replace(/[\uE000-\uF8FF\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u2007\u202f\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** What two lines must share to be the same line — letters and digits only. */
const key = (text) => normalise(text).toLocaleLowerCase('lb').replace(/[^\p{L}\p{N}]/gu, '');

const words = (text) => normalise(text).match(/[\p{L}][\p{L}'’-]*/gu) ?? [];

/** The text with every parenthetical removed, including one that is never closed. */
function outsideParens(text) {
  let out = '';
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += char;
  }
  return out;
}

/** True for a line with nothing to say: rules, underscores, bare numbers. */
const isBlank = (text) => !/[\p{L}]/u.test(text);

/* --------------------------------------------------------- classifiers */

/**
 * Is this line a question?
 *
 * It opens with a question word — the first word, or for "mat wiem" the first
 * two. A conditional opener ("wann", "wa") counts only with a "?" outside any
 * parenthesis, which is what keeps "Wann et ze waarm ass, bleiwen ech dobannen"
 * an answer. The others also count without one: several questions in these
 * notes were typed with no question mark at all.
 */
function isQuestion(text) {
  const bare = outsideParens(normalise(text)).trim();
  const list = words(bare).map((word) => word.toLocaleLowerCase('lb'));
  if (list.length === 0) return false;
  const asked = bare.includes('?');

  if (QUESTION_PHRASES.has(`${list[0]} ${list[1] ?? ''}`)) return asked || list.length >= 3;
  if (CONDITIONAL_OPENERS.has(list[0])) return asked;
  if (!QUESTION_OPENERS.has(list[0])) return false;
  return asked || (!/[.!]$/.test(bare) && list.length >= 3);
}

/** A question as it is shown: its list number is not part of it. */
const questionText = (text) => normalise(text).replace(/^\d+\s*[.)]?\s*/, '');

/**
 * Is this line not an answer — an English gloss or a grammar reminder?
 *
 * Three signs, in order of how sure they are:
 *
 *   "botzen = to clean"    a short left side, an equals sign, and anything:
 *                          nobody writes an answer that way
 *   "bequem – comfortable" a one-or-two-word left side and an English right side
 *   "only you can answer"  mostly English, judged against LOD's spellings and
 *                          the short English-only list above
 *
 * Half of "Ech weess et net ( I don't know it)" is Luxembourgish, and it is the
 * half that is the answer, so it is not caught.
 */
function isNote(text, isKnown) {
  const flat = normalise(text);
  const list = words(flat);
  if (list.length === 0) return true;
  if (list.length === 1) return !ONE_WORD_ANSWERS.has(list[0].toLocaleLowerCase('lb'));

  const outside = outsideParens(flat).trim();
  const equals = /^(.{1,40}?)\s*=(?!>)\s*(.+)$/.exec(outside);
  if (equals && words(equals[1]).length <= 4) return true;

  // "a(n)raumen ( to put in the dishwascher": one word and an English gloss.
  const inside = flat.slice(flat.indexOf('(') + 1);
  if (flat.includes('(') && outside.split(/\s+/).filter(Boolean).length === 1 && words(inside).some((word) => ENGLISH_ONLY.has(word.toLocaleLowerCase('lb')))) {
    return true;
  }

  const dash = /^(.{1,30}?)\s+[–—-]\s+(.+)$/.exec(outside);
  if (dash && words(dash[1]).length <= 2 && englishShare(dash[2], isKnown) >= 0.5) return true;

  return englishShare(flat, isKnown) > 0.66;
}

/** The share of a line's words that are English: on the list, or unknown to LOD. */
function englishShare(text, isKnown) {
  const list = words(text);
  if (list.length === 0) return 0;
  const english = list.filter((word) => ENGLISH_ONLY.has(word.toLocaleLowerCase('lb')) || !isKnown(word));
  return english.length / list.length;
}

/**
 * An answer's text: a speaker label in front is who said it, not what was said,
 * and it is a classmate's name, which has no business on a public page.
 *
 * "Name: …" is a label by its shape. "Name Mäi Mann …", with no colon, is only
 * one when `speakers` — the names this document uses *with* a colon somewhere —
 * says so. The first version took any unfamiliar capitalised word followed by
 * another, which would also have eaten the real first word of a line such as
 * "Auchan Amazon …".
 */
function answerText(text, speakers = new Set()) {
  const flat = normalise(text);
  const labelled = flat.replace(/^\p{Lu}\p{L}+\s*:\s+/u, '');
  if (labelled !== flat) return labelled;
  const bare = /^(\p{Lu}\p{L}+)\s+(?=\S)/u.exec(flat);
  return bare && speakers.has(bare[1]) ? flat.slice(bare[0].length) : flat;
}

/** The names a document puts in front of an answer with a colon: its speakers. */
function speakersIn(blocks) {
  const out = new Set();
  for (const block of lines(blocks)) {
    if (block.kind !== 'p') continue;
    const found = /^(\p{Lu}\p{L}+)\s*:\s*\S/u.exec(normalise(block.text));
    if (found) out.add(found[1]);
  }
  return out;
}

/**
 * A soft line break inside a paragraph is a new line of the document.
 *
 * The Vakanz sections put a question and its answer in one paragraph, one under
 * the other. Treating the paragraph as the unit read those as 29 questions and
 * no answers; the line is the unit.
 */
function lines(blocks) {
  const out = [];
  for (const block of blocks) {
    if (block.kind !== 'p') {
      out.push(block);
      continue;
    }
    for (const line of String(block.text ?? '').split(/\n+/)) out.push({ ...block, text: line });
  }
  return out;
}

/* ----------------------------------------------------------------- Q&A */

/**
 * One question-and-answer document.
 *
 * `blocks` are paragraphs and tables from readDocx. Returns the cards, the
 * reading material that was not tied to a question, and the lines that were
 * set aside — so nothing a document says silently vanishes.
 *
 * ## What ends a block
 *
 * A rule line (`_____`), a table, or three blank paragraphs in a row. After one,
 * whatever follows is not an answer to the question above it: the notes put a
 * list of example phrases under a rule, and a glossary and a grammar reminder
 * after a gap, and read as answers they landed on the last card of the section.
 */
function parseQa(blocks, doc, isKnown) {
  const cards = [];
  const extras = [];
  const dropped = [];
  const used = new Set();

  const keys = (list) => new Set((list ?? []).map(key));
  const forceQuestion = keys(config.forceQuestion);
  const forceAnswer = keys(config.forceAnswer);
  const forceNote = keys(config.forceNote);
  const dropLines = keys(config.drop);
  const ignore = keys(doc.ignore);
  const splits = new Map((config.split ?? []).map((line) => [key(line), line]));
  const attach = new Map((config.attach ?? []).map((one) => [key(one.line), one.to]));
  const sections = new Map(Object.entries(doc.sections ?? {}).map(([heading, topic]) => [key(heading), topic]));
  const joins = new Map(config.join.map(([a, b]) => [key(b), key(a)]));
  const joinStarts = new Set(config.join.map(([a]) => key(a)));

  const speakers = speakersIn(blocks);

  let topic = doc.topic ?? null;
  let current = null;
  let previous = null; // the last answer line, which a continuation extends
  let blanks = 0;

  const reading = (text) => {
    const line = answerText(text, speakers);
    const last = extras[extras.length - 1];
    if (last && last.topic === topic && last.from === doc.title) last.lines.push(line);
    else extras.push({ topic, from: doc.title, lines: [line] });
  };
  const endBlock = () => {
    current = null;
    previous = null;
  };

  for (const block of lines(blocks)) {
    if (block.kind === 'table') {
      endBlock();
      // The first row of these tables is the same article cheat-sheet in every
      // document; the rows below it are that document's vocabulary.
      for (const row of block.rows.slice(1)) {
        for (const cell of row) for (const line of cell.map(normalise).filter((one) => !isBlank(one))) reading(line);
      }
      continue;
    }

    const raw = normalise(block.text);
    if (raw === '') {
      blanks += 1;
      if (blanks === 3) endBlock();
      continue;
    }
    if (isBlank(raw)) {
      // `_____` and `-----`: a rule. Not a blank paragraph, but it ends a block.
      if (/[_\-–—=]{4,}/.test(raw)) endBlock();
      continue;
    }
    blanks = 0;

    const k = key(raw);
    for (const set of [forceQuestion, forceAnswer, forceNote, dropLines, ignore]) if (set.has(k)) used.add(k);
    if (joins.has(k) || joinStarts.has(k) || splits.has(k) || attach.has(k)) used.add(k);

    if (sections.has(k)) {
      used.add(k);
      topic = sections.get(k);
      endBlock();
      continue;
    }
    if (ignore.has(k) || dropLines.has(k)) {
      dropped.push(raw);
      continue;
    }

    // A line that is a question and an answer together: "Wéini ass … ? Tëscht Mee an August".
    let text = raw;
    let tail = null;
    if (splits.has(k)) {
      const at = raw.indexOf('?');
      text = raw.slice(0, at + 1);
      tail = raw.slice(at + 1).trim();
    }

    const asking = forceQuestion.has(k) || (!forceAnswer.has(k) && !forceNote.has(k) && isQuestion(text));
    if (asking) {
      current = { topic, q: questionText(text), answers: [], notes: [], from: doc.title };
      cards.push(current);
      previous = null;
      if (tail) {
        current.answers.push(tail);
        previous = { text: tail };
      }
      continue;
    }

    if (!current) {
      // Not under any question: example phrases, a title, a stray line. Kept as
      // reading rather than dropped — a document's words do not vanish.
      reading(raw);
      continue;
    }

    if (forceNote.has(k) || (!forceAnswer.has(k) && isNote(raw, isKnown))) {
      // Before the first answer, a note belongs to the question it annotates.
      // After one it is reading — "botzen = to clean" under a finished answer
      // is vocabulary for the topic, not for that card.
      if (current.answers.length === 0) current.notes.push(answerText(raw, speakers));
      else reading(raw);
      continue;
    }

    const line = answerText(raw, speakers);

    // This answer belongs to a different question than the one above it: two
    // questions share a paragraph and the answer follows both.
    if (attach.has(k)) {
      const target = cards.find((card) => key(card.q) === key(questionText(attach.get(k))));
      if (!target) throw new Error(`attach: no question "${attach.get(k)}" before "${raw}"`);
      target.answers.push(line);
      continue;
    }

    // A sentence cut across two paragraphs: the first ends on a comma, or the
    // config says the second continues the first.
    if (previous && (joins.get(k) === key(previous.text) || /,$/.test(previous.text))) {
      previous.text = `${previous.text} ${line}`;
      current.answers[current.answers.length - 1] = previous.text;
    } else {
      current.answers.push(line);
      previous = { text: line };
    }
  }

  return { cards, extras, dropped, used };
}

/* ------------------------------------------------------------ sections */

/**
 * A document that is a worked example rather than a list of questions: each
 * outline heading is a card, and the lines under it are the model.
 */
function parseSections(blocks, doc) {
  const headings = new Map(doc.outline.map((one) => [key(one.heading), one]));
  const reference = key(doc.referenceFrom ?? '\u0000');
  const cards = [];
  const extras = [];
  const dropped = [];
  const used = new Set();
  let current = null;
  let inReference = false;

  for (const block of lines(blocks)) {
    if (block.kind !== 'p') continue;
    const text = normalise(block.text);
    if (isBlank(text)) continue;
    const k = key(text);

    if (k === reference) {
      inReference = true;
      current = null;
      used.add(k);
    }
    if (inReference) {
      const last = extras[extras.length - 1];
      if (last) last.lines.push(text);
      else extras.push({ topic: doc.topic, from: doc.title, lines: [text] });
      continue;
    }

    if (headings.has(k)) {
      const outline = headings.get(k);
      used.add(k);
      current = { topic: doc.topic, kind: 'section', q: questionText(outline.heading.replace(/\s*:$/, '')), hint_en: outline.hint_en, answers: [], notes: [], from: doc.title };
      cards.push(current);
      continue;
    }
    if (current && !/^[-–—_\s]+$/.test(text)) current.answers.push(text);
    else if (!current) dropped.push(text);
  }
  return { cards, extras, dropped, used };
}

/* --------------------------------------------------------------- build */

/** Merge cards that ask the same question: one card, every answer. */
function merge(cards) {
  const byKey = new Map();
  const out = [];
  for (const card of cards) {
    const id = `${card.topic}|${key(card.q)}`;
    const seen = byKey.get(id);
    if (!seen) {
      byKey.set(id, card);
      out.push(card);
      continue;
    }
    for (const answer of card.answers) if (!seen.answers.some((one) => key(one) === key(answer))) seen.answers.push(answer);
    for (const note of card.notes) if (!seen.notes.some((one) => key(one) === key(note))) seen.notes.push(note);
  }
  return out;
}

const cardId = (card) => `n-${crypto.createHash('sha1').update(`${card.topic}|${key(card.q)}`).digest('hex').slice(0, 10)}`;

function documentFor(file) {
  const stem = path.basename(file).replace(/\.docx$/i, '').replace(/^[0-9a-f]{8}-/i, '');
  return config.documents.find((doc) => doc.file.test(stem)) ?? null;
}

async function build({ dir, audit = false }) {
  if (!dir) throw new Error('usage: npm run build:notes -- <folder of .docx files> [--audit]');
  const files = fs.readdirSync(dir).filter((name) => /\.docx$/i.test(name) && !name.startsWith('~$'));
  if (files.length === 0) throw new Error(`no .docx files in ${dir}`);

  const unknown = files.filter((name) => !documentFor(name));
  if (unknown.length > 0) {
    throw new Error(
      `no entry in pipeline/notes-config.js for:\n  ${unknown.join('\n  ')}\n` +
        'Add one (title, kind, topic) — that is the prompt to say which exam topic it is.',
    );
  }

  const lexicon = JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8')).forms ?? {};
  const isKnown = (word) => Boolean(lexicon[word] ?? lexicon[word.toLocaleLowerCase('lb')]);

  const topics = JSON.parse(await fsp.readFile(path.join(paths.ITEMS_DIR, 'topics.json'), 'utf8')).items ?? [];
  const topicIds = new Set([...topics.map((topic) => topic.id), 'image']);

  const all = [];
  const extras = [];
  const dropped = [];
  const used = new Set();
  const problems = [];

  // Config order, not directory order: the same inputs give the same output.
  for (const doc of config.documents) {
    const file = files.find((name) => documentFor(name) === doc);
    if (!file) continue;
    const blocks = readDocx(path.join(dir, file));
    const parsed = doc.kind === 'sections' ? parseSections(blocks, doc) : parseQa(blocks, doc, isKnown);
    all.push(...parsed.cards);
    extras.push(...parsed.extras);
    for (const line of parsed.dropped) dropped.push(`${doc.title}: ${line}`);
    for (const k of parsed.used) used.add(k);

    for (const card of parsed.cards) {
      if (!card.topic || !topicIds.has(card.topic)) problems.push(`${doc.title}: "${card.q}" has no valid topic (${card.topic})`);
    }

    // A document's own headings have to be there, or the document changed under
    // the config and cards are about to land in the wrong topic.
    for (const heading of [...Object.keys(doc.sections ?? {}), ...(doc.ignore ?? [])]) {
      if (!parsed.used.has(key(heading))) problems.push(`${doc.title}: expected the heading "${heading}"`);
    }
  }

  // Every override has to have found its line, or it is a guess that stopped
  // being true.
  const wanted = [
    ...config.forceQuestion,
    ...config.forceAnswer,
    ...config.forceNote,
    ...config.drop,
    ...config.join.flat(),
    ...(config.split ?? []),
    ...(config.attach ?? []).map((one) => one.line),
  ];
  for (const line of wanted) if (!used.has(key(line))) problems.push(`override matches no line: ${line}`);

  if (problems.length > 0) throw new Error(`build-notes refused:\n  ${problems.join('\n  ')}`);

  const cards = merge(all).map((card) => ({ id: cardId(card), ...card }));
  const ids = new Set();
  for (const card of cards) {
    if (ids.has(card.id)) throw new Error(`duplicate card id for "${card.q}"`);
    ids.add(card.id);
  }

  const counts = new Map();
  for (const card of cards) {
    const row = counts.get(card.topic) ?? { total: 0, answered: 0 };
    row.total += 1;
    if (card.answers.length > 0) row.answered += 1;
    counts.set(card.topic, row);
  }
  const titles = new Map(topics.map((topic) => [topic.id, topic]));
  titles.set('image', { id: 'image', title_lb: 'Bildbeschreiwung', title_en: 'Describe a picture' });

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-notes.js',
      source:
        'Course study notes supplied by the learner. Every question, answer and note is a line of those documents, ' +
        'verbatim: not LOD-derived and not validated against LOD, so spellings may differ from the dictionary. ' +
        'Only whitespace, list numbers and speaker labels were removed.',
      documents: config.documents.filter((doc) => files.some((name) => documentFor(name) === doc)).map((doc) => doc.title),
    },
    topics: [...counts.entries()].map(([id, row]) => ({
      id,
      title_lb: titles.get(id)?.title_lb ?? id,
      title_en: titles.get(id)?.title_en ?? id,
      total: row.total,
      answered: row.answered,
    })),
    cards,
    extras,
  };

  const json = `${JSON.stringify(payload, null, 1)}\n`;
  await fsp.writeFile(OUT, json);
  await fsp.mkdir(APP_DATA, { recursive: true });
  await fsp.writeFile(path.join(APP_DATA, 'speaking-notes.json'), json);

  const answered = cards.filter((card) => card.answers.length > 0).length;
  process.stdout.write(
    `notes: ${cards.length} cards from ${payload.meta.documents.length} documents — ${answered} with a model answer, ` +
      `${cards.length - answered} question-only · ${extras.reduce((n, one) => n + one.lines.length, 0)} reading lines\n`,
  );
  for (const row of payload.topics) process.stdout.write(`  ${row.id.padEnd(12)} ${String(row.total).padStart(3)} (${row.answered} answered)\n`);
  if (dropped.length > 0) process.stdout.write(`  set aside: ${dropped.length} lines (titles, rules, orphans)\n`);

  if (audit) report(cards, isKnown, dropped);
}

/**
 * The Luxembourgish words in a line, as LOD would index them: outside any
 * parenthesis (that is where the English glosses live), with the clitic
 * article and "z'" taken off — LOD lists `Leit`, not `d’Leit`.
 */
function lodWords(text) {
  return words(outsideParens(normalise(text)).replace(/[’']/g, ' '))
    .flatMap((word) => word.split('-'))
    .filter((word) => word.length > 1 && !ENGLISH_ONLY.has(word.toLocaleLowerCase('lb')));
}

/**
 * The tokens LOD does not know, with the line each one is in.
 *
 * This is a list of things to *check*, never to fix: a name, a loanword and a
 * typo all look the same from here, and which spelling the course intends is
 * not this script's call.
 */
function report(cards, isKnown, dropped) {
  const unknown = new Map();
  let total = 0;
  let known = 0;
  for (const card of cards) {
    for (const line of [card.q, ...card.answers]) {
      for (const word of lodWords(line)) {
        total += 1;
        if (isKnown(word)) known += 1;
        else {
          const row = unknown.get(word) ?? { count: 0, line };
          row.count += 1;
          unknown.set(word, row);
        }
      }
    }
  }
  process.stdout.write(`\naudit: ${known}/${total} Luxembourgish tokens outside parentheses are LOD spellings (${((known / total) * 100).toFixed(1)}%)\n`);
  process.stdout.write(`${unknown.size} distinct tokens LOD does not know:\n`);
  for (const [word, row] of [...unknown.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))) {
    process.stdout.write(`  ${word.padEnd(20)} ×${row.count}   ${row.line.slice(0, 70)}\n`);
  }
  if (dropped.length > 0) {
    process.stdout.write('\nset aside:\n');
    for (const line of dropped) process.stdout.write(`  ${line}\n`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  build({ dir: args.find((arg) => !arg.startsWith('--')), audit: args.includes('--audit') }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { build, parseQa, parseSections, isQuestion, isNote, questionText, answerText, speakersIn, normalise, key, merge };
