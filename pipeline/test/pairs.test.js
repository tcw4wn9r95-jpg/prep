'use strict';

/**
 * The Pairs game's level maths and word pool.
 *
 * The board is trivial to reason about; the pool is not. Two failures would
 * both produce an unwinnable board rather than an obvious crash, so they are
 * tested against the real generated decks: a duplicate English gloss (which
 * leaves the player guessing which tile is wanted) and a level slice that runs
 * off the end of the deck.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const load = (name) => pathToFileURL(path.join(ROOT, 'app', 'js', name)).href;

const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;

let pairs;
let pool;
test.before(async () => {
  pairs = await import(load('screens/pairs.js'));
  pool = pairs.orderedPairPool(vocab, verbs);
});

test('pairs: the board grows with the level and then stops', () => {
  assert.equal(pairs.pairsForLevel(1), 5);
  assert.equal(pairs.pairsForLevel(2), 5);
  assert.equal(pairs.pairsForLevel(3), 6);
  assert.equal(pairs.pairsForLevel(11), 10);
  // Capped: a board that outgrows the screen stops being a memory game.
  // 14 pairs is 28 tiles, measured as the largest grid that still clears the
  // tab bar on a 360x640 phone once tile height scales with the viewport.
  assert.equal(pairs.pairsForLevel(19), 14);
  assert.equal(pairs.pairsForLevel(500), 14);
});

test('pairs: no tile carries text too long to read at 85px wide', () => {
  // Some LOD glosses are a whole disambiguation clause. They are fine in the
  // drill, where the answer gets a full-width row, and unreadable on a tile.
  for (const word of pool) {
    assert.ok(word.en.length <= 20, `gloss "${word.en}" is ${word.en.length} chars`);
    assert.ok(word.lb.length <= 20, `word "${word.lb}" is ${word.lb.length} chars`);
  }
});

test('pairs: levels tile the deck without overlapping or skipping', () => {
  for (let level = 1; level < 40; level += 1) {
    assert.equal(
      pairs.offsetForLevel(level + 1),
      pairs.offsetForLevel(level) + pairs.pairsForLevel(level),
      `level ${level + 1} does not start where level ${level} ends`,
    );
  }
});

test('pairs: level 1 is the sentence skeleton, not random A2 nouns', () => {
  const first = pairs.wordsForLevel(pool, 1).map((word) => word.lb);
  // The same ordering the Learn path uses, so the easiest level really is the
  // easiest words rather than whatever the deck happened to list first.
  assert.ok(first.includes('ech'), `level 1 was ${first.join(', ')}`);
  for (const word of pairs.wordsForLevel(pool, 1)) {
    assert.equal(word.stage, 1, `${word.lb} is stage ${word.stage}, not foundation vocabulary`);
  }
});

test('pairs: no board can contain the same gloss or the same word twice', () => {
  // Two tiles reading "no" would leave one of them permanently unmatchable.
  const glosses = new Set();
  const lemmas = new Set();
  for (const word of pool) {
    const en = word.en.toLowerCase();
    const lb = word.lb.toLowerCase();
    assert.ok(!glosses.has(en), `gloss "${word.en}" appears twice in the pool`);
    assert.ok(!lemmas.has(lb), `word "${word.lb}" appears twice in the pool`);
    glosses.add(en);
    lemmas.add(lb);
  }
});

test('pairs: every word on a board has both sides to show', () => {
  for (const word of pool) {
    assert.ok(word.lb && word.lb.trim(), `${word.id} has no Luxembourgish side`);
    assert.ok(word.en && word.en.trim(), `${word.id} has no English side`);
  }
});

test('pairs: the last level fits and the one past it does not exist', () => {
  const max = pairs.totalLevels(pool.length);
  assert.ok(max > 100, `expected a long ladder from a ${pool.length}-word pool, got ${max}`);
  assert.ok(pairs.wordsForLevel(pool, max), 'the last level must be playable');
  assert.equal(pairs.wordsForLevel(pool, max + 1), null, 'one past the end must not build a short board');
});

/* ------------------------------------------------- homograph sense picking */

test('pairs: every preferred gloss is a real LOD gloss for that lemma', () => {
  // PREFERRED_GLOSS selects between senses LOD already publishes — it must
  // never introduce a translation of our own. Checked against the shipped
  // decks, so a content rebuild that drops or rewords one of these senses
  // fails here rather than silently reverting the fix.
  const byLemma = new Map();
  const add = (lb, en) => {
    if (!lb || !en) return;
    const key = lb.toLowerCase();
    if (!byLemma.has(key)) byLemma.set(key, new Set());
    byLemma.get(key).add(en);
  };
  for (const item of vocab) add(item.lb, item.en);
  for (const item of verbs) add(item.infinitive, item.en);

  for (const [lemma, gloss] of Object.entries(pairs.PREFERRED_GLOSS)) {
    const glosses = byLemma.get(lemma);
    assert.ok(glosses, `"${lemma}" is named in PREFERRED_GLOSS but is not in the decks at all`);
    assert.ok(
      glosses.has(gloss),
      `PREFERRED_GLOSS says ${lemma} = "${gloss}", which LOD does not publish for it. Real glosses: ${[...glosses].join(', ')}`,
    );
  }
});

test('pairs: the preferred sense is the one that reaches the board', () => {
  // The bug this guards: LOD ships homographs as separate entries, and the
  // pool kept whichever sorted first — which is decided by a frequency count
  // that credits every occurrence of a spelling to a single entry (see the
  // comment on PREFERRED_GLOSS). That put "awer = nevertheless" and
  // "no = nearby" on the board instead of "but" and "after".
  const byLemma = new Map(pool.map((word) => [word.lb.toLowerCase(), word.en]));
  for (const [lemma, gloss] of Object.entries(pairs.PREFERRED_GLOSS)) {
    // A lemma can legitimately be absent — two overrides both resolve to
    // "but", and the English-side deduplication drops the later one.
    if (!byLemma.has(lemma)) continue;
    assert.equal(byLemma.get(lemma), gloss, `${lemma} reached the board glossed "${byLemma.get(lemma)}"`);
  }
});

test('pairs: choosing a sense does not move the word', () => {
  // Correcting *which* entry represents a spelling must not change *where*
  // that spelling sits, or every level's contents shift and a half-finished
  // player's next board is not the one they were expecting.
  const positions = pool.map((word) => word.lb.toLowerCase());
  assert.equal(new Set(positions).size, positions.length, 'a lemma appears twice');
  // The opening levels are the sentence skeleton, whatever the sense fix did.
  assert.deepEqual(positions.slice(0, 5), ['ech', 'net', 'mir', 'hien', 'du']);
});
