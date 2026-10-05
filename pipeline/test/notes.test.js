'use strict';

/**
 * The course notes as flash cards: the reader, the parser, the shipped data and
 * the practice logic.
 *
 * What these guard is not "does it parse" but **"does a wrong answer end up on a
 * card"**. The documents are working notes — questions with no question mark,
 * answers that quote a follow-up, glosses interleaved with answers, a classmate's
 * name in front of a line — and every one of those was a way the first version
 * put the wrong text on the back of a card, which for a learner revising an exam
 * answer is worse than having no card. Each regression below is a real line from
 * a real document, reduced.
 *
 * The documents themselves are not in the repository, so the parser is tested on
 * synthetic blocks and the shipped JSON on invariants that must hold whatever
 * it contains.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));

const { readDocx } = require('../lib/docx.js');
const build = require('../build-notes.js');

let notes;
test.before(async () => {
  notes = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'notes.js')).href);
});

/* ---------------------------------------------------------- the reader */

/** A one-entry zip holding `word/document.xml`, deflated, with no CRC (the reader does not check). */
function docx(bodyXml, { method = 8 } = {}) {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  const raw = Buffer.from(xml, 'utf8');
  const data = method === 8 ? zlib.deflateRawSync(raw) : raw;
  const name = Buffer.from('word/document.xml');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  const offset = local.length + name.length + data.length;
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([local, name, data, central, name, end]);
}

const run = (text, { bold = false } = {}) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs) => `<w:p>${runs.join('')}</w:p>`;

test('docx: paragraphs come out in order, with bold only when every run is bold', () => {
  const file = docx(
    para(run('Wat ass dat?', { bold: true })) +
      para(run('Ech si ', { bold: true }), run('frou')) +
      para(run('Jo')),
  );
  for (const method of [0, 8]) {
    const blocks = readDocx(docx(para(run('Wat ass dat?', { bold: true })) + para(run('Ech si ', { bold: true }), run('frou')), { method }));
    assert.deepEqual(blocks.map((block) => block.text), ['Wat ass dat?', 'Ech si frou'], `method ${method}`);
    assert.deepEqual(blocks.map((block) => block.bold), [true, false], 'a sentence with one bold word is not a heading');
  }
  assert.equal(readDocx(file).length, 3);
});

test('docx: a soft line break stays a line break, and entities are decoded', () => {
  // The Vakanz sections put a question and its answer in one paragraph. Losing
  // the break read 29 questions as having no answer.
  const blocks = readDocx(docx('<w:p><w:r><w:t>Wat?</w:t><w:br/><w:t>Ech &amp; du</w:t></w:r></w:p>'));
  assert.equal(blocks[0].text, 'Wat?\nEch & du');
});

test('docx: tables are read as rows of cells of lines', () => {
  const blocks = readDocx(
    docx('<w:tbl><w:tr><w:tc>' + para(run('a')) + para(run('b')) + '</w:tc><w:tc>' + para(run('c')) + '</w:tc></w:tr></w:tbl>'),
  );
  assert.equal(blocks[0].kind, 'table');
  assert.deepEqual(blocks[0].rows, [[['a', 'b'], ['c']]]);
});

test('docx: a file that is not a docx says so', () => {
  assert.throws(() => readDocx(Buffer.from('not a zip at all, just text')), /not a zip/);
});

/* ---------------------------------------------------------- classifiers */

// LOD stand-in: every word is "known". That is the *hard* case for telling a
// gloss from an answer — LOD really does spell clean, weekend, happy and at — so
// the tests below pass on the English-only list and the "=" shape alone, not on
// a vocabulary that happens to be missing the English words.
const known = () => true;

test('questions: a question word has to open the line', () => {
  const { isQuestion } = build;
  assert.ok(isQuestion('Maacht Dir gär de Stot?'));
  assert.ok(isQuestion('Wéini ass de Supermarché op'), 'a question typed with no question mark');
  assert.ok(isQuestion('Vergläicht d’Präisser mat Ärem Heemechtsland'));
  assert.ok(isQuestion('Mat wiem wunnt Dir zesummen?'));
  assert.ok(isQuestion('Wa jo - Wéi war d’Wieder?'));
});

test('questions: an answer that merely contains a question mark or a question word is not one', () => {
  const { isQuestion } = build;
  // Each of these was a card of its own in the first version.
  assert.ok(!isQuestion('mat mengem Mann/ mat menger Fra/ mat menge Kanner'), '"mat" opens answers too');
  assert.ok(!isQuestion('Ech hu kee Gaart- ech si gär dobaussen. Wat maacht Dir do?'), 'an answer that quotes a follow-up');
  assert.ok(!isQuestion('Jo, am Summer ginn ech gär an d’Vakanz – wuer fuert Dir fort?'));
  assert.ok(!isQuestion('Ech vermeide Crevetten z’iessen ( fir wat?'), 'a question mark inside an unclosed parenthesis');
  assert.ok(!isQuestion('Wann et ze waarm ass, bleiwen ech dobannen'), 'a conditional opener needs a "?"');
  assert.ok(!isQuestion('aus kulturelle Grënn'));
});

test('notes: a gloss is not an answer, and an answer with an English aside is', () => {
  const { isNote } = build;
  // LOD spells clean, weekend, happy and at, so "words LOD does not know" alone
  // would have called every one of these an answer.
  assert.ok(isNote('botzen = to clean', known));
  assert.ok(isNote('de Weekend = at the weekend', known));
  assert.ok(isNote('frou, glécklech = happy', known));
  assert.ok(isNote('only you can answer this question', known));
  assert.ok(isNote('bequem', known), 'a bare vocabulary cue');
  assert.ok(isNote('a(n)raumen ( to put in the dishwascher', known), 'one word and an English parenthetical');

  assert.ok(!isNote('Ech weess et net ( I don’t know it)', known), 'half of it is the answer');
  assert.ok(!isNote('Jo', known));
  assert.ok(!isNote('Ech wunne mat=> menger Famill zesummen', known), '"=>" is an arrow, not a gloss');
});

test('answers: a speaker label is removed, a real first word is not', () => {
  const { answerText, speakersIn } = build;
  const speakers = speakersIn([p('Alex: Ech kache gär'), p('Alex Mäi Mann hëlleft mir')]);
  assert.deepEqual([...speakers], ['Alex'], 'a name used with a colon is a speaker');

  assert.equal(answerText('Alex: Ech kache gär'), 'Ech kache gär', 'a colon label is a label by shape');
  assert.equal(answerText('Alex Mäi Mann hëlleft mir', speakers), 'Mäi Mann hëlleft mir', 'no colon, but the document uses Alex as a speaker');
  // The first version took any unfamiliar capitalised word followed by another,
  // which would have eaten the real first word of a line like this.
  assert.equal(answerText('Auchan Amazon sinn zou', speakers), 'Auchan Amazon sinn zou');
  assert.equal(answerText('Jo, ech maachen de Stot gär', speakers), 'Jo, ech maachen de Stot gär');
});

test('questions: a list number is not part of the question', () => {
  const { questionText } = build;
  assert.equal(questionText('23 Lieft Dir gesond?'), 'Lieft Dir gesond?');
  assert.equal(questionText('30Wéini war dat?'), 'Wéini war dat?');
  assert.equal(questionText('Wéi vill Zäit?'), 'Wéi vill Zäit?');
});

/* ------------------------------------------------------------- the parse */

const p = (text) => ({ kind: 'p', text });
const blank = () => p('');
const doc = { title: 'Test notes', kind: 'qa', topic: 'stot' };
const parse = (blocks, extra = {}) => build.parseQa(blocks, { ...doc, ...extra }, known);

test('parse: answers follow their question, and a gloss before the answer annotates the question', () => {
  const { cards } = parse([p('Wéi ass de Stot?'), p('botzen = to clean'), p('Ech maachen de Stot gär'), p('Wat ass dat?'), p('Jo')]);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0].notes, ['botzen = to clean']);
  assert.deepEqual(cards[0].answers, ['Ech maachen de Stot gär']);
});

test('parse: a gloss after the answers is reading for the topic, not an answer on the card', () => {
  const { cards, extras } = parse([p('Wéi ass de Stot?'), p('Ech maachen de Stot gär'), p('botzen = to clean')]);
  assert.deepEqual(cards[0].answers, ['Ech maachen de Stot gär']);
  assert.deepEqual(extras[0].lines, ['botzen = to clean']);
});

test('parse: a question and its answer in one paragraph are two lines', () => {
  const { cards } = parse([p('Wat ass dat?\nJo, ech weess et net')]);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].answers, ['Jo, ech weess et net']);
});

test('parse: a rule line, a table and three blank paragraphs each end the block', () => {
  // Example phrases under a rule were appended to the card above it as answers.
  for (const breaker of [[p('__________')], [{ kind: 'table', rows: [[['x']], [['y']]] }], [blank(), blank(), blank()]]) {
    const { cards, extras } = parse([p('Wat ass dat?'), p('Jo'), ...breaker, p('Sport maachen')]);
    assert.deepEqual(cards[0].answers, ['Jo'], 'the line after the break is not an answer');
    assert.ok(extras.some((block) => block.lines.includes('Sport maachen')) || extras.some((b) => b.lines.includes('y')), 'but it is kept');
  }
  // Two blanks are an ordinary gap between a question and its answer.
  const { cards } = parse([p('Wat ass dat?'), blank(), blank(), p('Jo')]);
  assert.deepEqual(cards[0].answers, ['Jo']);
});

test('parse: a sentence cut across two paragraphs is joined on a trailing comma', () => {
  const { cards } = parse([p('Wat ass dat?'), p('Gesond liewen ass gutt,'), p('an dräimol Yoga.')]);
  assert.deepEqual(cards[0].answers, ['Gesond liewen ass gutt, an dräimol Yoga.']);
});

test('parse: a heading from the config starts a topic and is not read as an answer', () => {
  const { cards } = parse([p('Sport'), p('Wat ass dat?'), p('Jo'), p('Musek'), p('Wéi ass dat?'), p('Nee')], { topic: null, sections: { Sport: 'sport', Musek: 'hobbyen' } });
  assert.deepEqual(cards.map((card) => card.topic), ['sport', 'hobbyen']);
  assert.deepEqual(cards[0].answers, ['Jo'], 'the next heading did not land on this card');
});

test('parse: lines before any question are kept as reading, never dropped', () => {
  const { cards, extras, dropped } = parse([p('Eng Iwwerschrëft'), p('Wat ass dat?'), p('Jo')]);
  assert.equal(cards.length, 1);
  assert.ok(extras.some((block) => block.lines.includes('Eng Iwwerschrëft')));
  assert.deepEqual(dropped, [], 'a title is reading, not a vanished line');
});

test('parse: the same question asked twice is one card with every answer', () => {
  const { cards } = parse([p('Wat ass dat?'), p('Jo'), p('Wat ass dat ?'), p('Nee'), p('Jo')]);
  const merged = build.merge(cards);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].answers, ['Jo', 'Nee']);
});

test('parse: a section document makes a card per heading and keeps the reference apart', () => {
  const sections = {
    title: 'Bild',
    topic: 'image',
    outline: [{ heading: 'Situatioun', hint_en: 'What is the situation?' }, { heading: 'Schluss (end)', hint_en: 'Finish.' }],
    referenceFrom: 'Verbs:',
  };
  const { cards, extras } = build.parseSections([p('Form'), p('Situatioun'), p('Et ass eng Situatioun'), p('Schluss (end)'), p('D’Leit sinn frou'), p('Verbs:'), p('gesinn')], sections);
  assert.deepEqual(cards.map((card) => card.q), ['Situatioun', 'Schluss (end)']);
  assert.ok(cards.every((card) => card.kind === 'section' && card.hint_en));
  assert.deepEqual(extras[0].lines, ['Verbs:', 'gesinn']);
});

/* ------------------------------------------------------ the shipped data */

const DECK = readJson('content', 'hand-authored', 'speaking-notes.json');
const TOPICS = new Set([...readJson('content', 'items', 'topics.json').items.map((topic) => topic.id), 'image']);

test('notes data: ships mirrored to the app, byte for byte', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'app', 'data', 'speaking-notes.json'), 'utf8'), fs.readFileSync(path.join(ROOT, 'content', 'hand-authored', 'speaking-notes.json'), 'utf8'));
});

test('notes data: says whose words they are and that they are not the dictionary\'s', () => {
  // The cards are verbatim from course documents and may differ from LOD; the
  // file has to say so, because nothing downstream will.
  assert.match(DECK.meta.source, /verbatim/);
  assert.match(DECK.meta.source, /not LOD/i);
  assert.ok(DECK.meta.documents.length >= 5);
});

test('notes data: every card is well formed, in a real topic, with a unique id', () => {
  const ids = new Set();
  for (const card of DECK.cards) {
    assert.match(card.id, /^n-[0-9a-f]{10}$/);
    assert.ok(!ids.has(card.id), `duplicate id: ${card.q}`);
    ids.add(card.id);
    assert.ok(TOPICS.has(card.topic), `${card.q}: "${card.topic}" is not an exam topic`);
    assert.ok(card.q.trim().length > 4, `an empty question: ${JSON.stringify(card.q)}`);
    assert.ok(DECK.meta.documents.includes(card.from), `${card.q}: comes from no listed document`);
    for (const line of [card.q, ...card.answers, ...card.notes]) {
      assert.equal(line, line.trim(), `untrimmed: ${JSON.stringify(line)}`);
      assert.ok(!/\s{2,}/.test(line), `a double space: ${JSON.stringify(line)}`);
      assert.ok(!/[-​-‍﻿]/.test(line), `a formatting glyph in: ${JSON.stringify(line)}`);
    }
  }
});

test('notes data: no card is a speaker label, a number, or a bare fragment pretending to be a question', () => {
  for (const card of DECK.cards) {
    assert.ok(!/^\d/.test(card.q), `a list number was left on: ${card.q}`);
    // The first version made "mat mengem Mann/ mat menger Fra" a question.
    // The two the config forces are questions the heuristic cannot see: one ends
    // on a full stop, one opens with a parenthesis.
    const forced = require('../notes-config.js').forceQuestion.map(build.key);
    if (card.kind !== 'section' && !forced.includes(build.key(card.q))) {
      assert.ok(build.isQuestion(card.q) || /[?]/.test(card.q), `does not read as a question: ${card.q}`);
    }
  }
});

test('notes data: nobody\'s name is on a line', () => {
  // A classmate's first name in front of an example answer ("Name: …") is who
  // said it, not what was said, and this file is published. The labels are
  // removed by shape, so the check is by shape too — no names in a test file.
  const label = /^\p{Lu}\p{L}+\s*:\s/u;
  for (const card of DECK.cards) for (const line of [...card.answers, ...card.notes]) assert.ok(!label.test(line), `a speaker label: ${line}`);
  // Reading lines too — a label survived in one of those once. The picture
  // document's grammar tail is left out: it has no speakers, and its noun
  // headings ("Plaz: Schueberfouer, …", "Fra: si ass") have exactly the shape of
  // a name without being one.
  for (const block of DECK.extras.filter((one) => one.topic !== 'image')) {
    for (const line of block.lines) assert.ok(!label.test(line), `a speaker label in reading: ${line}`);
  }
  const flat = JSON.stringify(DECK);
  assert.ok(!/@[\w.-]+\.\w{2,}|https?:\/\//.test(flat), 'a contact address or link got in');
});

test('notes data: the counts it states are the counts it has', () => {
  for (const topic of DECK.topics) {
    const cards = DECK.cards.filter((card) => card.topic === topic.id);
    assert.equal(topic.total, cards.length, `${topic.id}: total`);
    assert.equal(topic.answered, cards.filter((card) => card.answers.length > 0).length, `${topic.id}: answered`);
  }
  assert.equal(DECK.topics.reduce((sum, topic) => sum + topic.total, 0), DECK.cards.length);
  assert.ok(DECK.cards.length >= 200, `only ${DECK.cards.length} cards`);
  assert.ok(DECK.cards.filter((card) => card.answers.length > 0).length >= 150);
});

test('notes data: the picture cards carry an English prompt, because their heading is not a question', () => {
  const section = DECK.cards.filter((card) => card.topic === 'image');
  assert.ok(section.length >= 7);
  for (const card of section) {
    assert.equal(card.kind, 'section');
    assert.ok(card.hint_en && !/[ëéäöü]/.test(card.hint_en), `no English hint: ${card.q}`);
    assert.ok(card.answers.length > 0, `an empty section: ${card.q}`);
  }
});

/* ------------------------------------------------------------- the practice */

const card = (id, topic, answers = ['a']) => ({ id, topic, q: `q ${id}?`, answers, notes: [] });

test('practice: the default pool is the questions with an answer; the rest are a switch', () => {
  const deck = { cards: [card('1', 'stot'), card('2', 'stot', []), card('3', 'sport')], topics: [] };
  assert.deepEqual(notes.poolFor(deck, 'stot').map((one) => one.id), ['1']);
  assert.deepEqual(notes.poolFor(deck, 'stot', { withNoAnswer: true }).map((one) => one.id), ['1', '2']);
  assert.deepEqual(notes.poolFor(deck, notes.MIX).map((one) => one.id), ['1', '3'], 'mix spans topics');
});

test('practice: a card flagged as wrong stops being dealt', () => {
  // The notes are verbatim, typos included, so "something wrong with this card?"
  // has to be a way to take one out of rotation.
  const deck = { cards: [card('1', 'stot'), card('2', 'stot')], topics: [] };
  assert.deepEqual(notes.poolFor(deck, 'stot', { flagged: new Set(['speaking-notes:1']) }).map((one) => one.id), ['2']);
  assert.equal(notes.progress(deck, [], { flagged: new Set(['speaking-notes:1']) })[0].total, 1);
});

test('practice: a round leads with what is not got yet, and is the same for the same seed', () => {
  const pool = Array.from({ length: 30 }, (_, at) => card(String(at), 'stot'));
  const got = new Set(pool.slice(0, 25).map((one) => one.id));
  const round = notes.buildRound(pool, got, { seed: 'x' });
  assert.equal(round.length, notes.ROUND);
  assert.deepEqual(round.slice(0, 5).map((one) => one.id).sort(), ['25', '26', '27', '28', '29'], 'the five unseen come first');
  assert.deepEqual(notes.buildRound(pool, got, { seed: 'x' }).map((one) => one.id), round.map((one) => one.id));
  assert.equal(notes.buildRound([], got).length, 0);
});

test('practice: progress counts questions with an answer, and says how many are still without one', () => {
  const deck = {
    topics: [{ id: 'stot', title_en: 'Household chores' }, { id: 'image', title_en: 'Describe a picture' }, { id: 'sport', title_en: 'Sport' }],
    cards: [card('1', 'stot'), card('2', 'stot'), card('3', 'stot', []), card('4', 'image'), card('5', 'sport')],
  };
  const rows = notes.progress(deck, new Set(['1']));
  // "Household chores" sorts before "Sport": alphabetical by the English title a
  // person reads, not by the id.
  assert.deepEqual(rows.map((row) => row.id), ['image', 'stot', 'sport'], 'the picture task leads, the rest are alphabetical');
  const stot = rows.find((row) => row.id === 'stot');
  assert.deepEqual([stot.total, stot.open, stot.got], [2, 1, 1]);
});

test('practice: a "not yet" card comes round once more, and only once', () => {
  const queue = notes.queueFor([card('1', 'stot'), card('2', 'stot')]);
  const first = queue.next();
  assert.equal(queue.again(first), true);
  assert.equal(queue.remaining(), 2);
  queue.next();
  const again = queue.next();
  assert.equal(again.id, first.id, 'it is dealt again at the end');
  assert.equal(queue.again(again), false, 'a round that can never finish is not a round');
  assert.equal(queue.next(), null);
});

test('practice: a card with no answer still has a back, and it says so', () => {
  assert.equal(notes.backOf(card('1', 'stot', [])).empty, true);
  assert.equal(notes.backOf(card('1', 'stot', ['x'])).empty, false);
});

/* ------------------------------------------------------------ the wiring */

test('screens: the question cards are the first thing on the Speak tab, and recording is still reachable', () => {
  const speaking = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'speaking.js'), 'utf8');
  assert.ok(/topicId === 'cards'\) return renderCards/.test(speaking), 'the cards route must be dispatched');
  const at = (text) => speaking.indexOf(text);
  assert.ok(at('Practise the questions') > 0 && at('Practise the questions') < at('Record for your partner'), 'questions first');
  // Readiness is built from the recordings, so removing them would quietly
  // freeze the speaking score.
  assert.ok(/Record for your partner/.test(speaking) && /#\/speaking\/image\/image/.test(speaking));
});

test('screens: a round is a focused task, and the cards keep their own progress', () => {
  const main = fs.readFileSync(path.join(ROOT, 'app', 'js', 'main.js'), 'utf8');
  assert.ok(/params\[0\] === 'cards'/.test(main) && /params\[2\] !== 'notes'/.test(main), 'a round hides the tab bar, the notes page keeps it');
  const screen = fs.readFileSync(path.join(ROOT, 'app', 'js', 'screens', 'speaking-cards.js'), 'utf8');
  assert.ok(!/recordLearnResult|reviewRow|scheduleNext|answeredByDeck/.test(screen), 'it must not touch the Leitner rows or the daily count');
  assert.ok(/flaggedCards/.test(screen) && /flagSlot/.test(screen), 'a flagged card must be honoured');
  assert.ok(/GOT_KEY/.test(screen), 'progress is kept under its own settings key');
});
