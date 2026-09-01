'use strict';

/**
 * How much of each thing a session actually contains.
 *
 * These are not tests about correctness of content — every card here is
 * already guaranteed by grammar.test.js. They are about *proportion*, which is
 * the thing that gets a learner to stop using an app. A card can be perfectly
 * built and still be wrong to show for the ninth time this week.
 *
 * The bug they were written for: unit 2's grammar was `numbers` (22 items) and
 * `heard` (205), of which 125 are themselves number questions — so two thirds
 * of the unit was numbers before any scheduling happened. On top of that,
 * `orderGrammar` interleaved one item per kind per round, which handed the
 * 22-item kind half of the turns. Reported as "lately I get too many number
 * questions".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'items', `${name}.json`), 'utf8'));

let content;
let cards;
test.before(async () => {
  content = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'content.js')).href);
  cards = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'drill', 'cards.js')).href);
});

/** Every kind present in one unit, with how many items it has. */
function poolByKind(items, unit) {
  const out = new Map();
  for (const item of items) {
    if (item.unit !== unit) continue;
    out.set(item.kind, (out.get(item.kind) ?? 0) + 1);
  }
  return out;
}

test('mix: a kind gets a share of the order in proportion to its size', () => {
  const items = content.orderGrammar(load('grammar').items);

  // Checked on every unit that has more than one kind in it, rather than on
  // the one that was reported — the defect was in the interleave, not in
  // numbers, and the next unit to pair a big kind with a small one would have
  // inherited it silently.
  const units = [...new Set(items.map((item) => item.unit))].sort((a, b) => a - b);
  let checked = 0;

  for (const unit of units) {
    const pool = poolByKind(items, unit);
    if (pool.size < 2) continue;
    checked += 1;

    const inUnit = items.filter((item) => item.unit === unit);
    const head = inUnit.slice(0, 40);
    const total = inUnit.length;

    for (const [kind, size] of pool) {
      const share = head.filter((item) => item.kind === kind).length / head.length;
      const expected = size / total;
      // Generous, because 40 cards cannot land on an exact ratio and the
      // point is the order of magnitude: the flat round-robin gave a kind
      // holding 18% of the pool 50% of the turns, which this fails by a mile.
      assert.ok(
        Math.abs(share - expected) < 0.12,
        `unit ${unit}: ${kind} holds ${(expected * 100).toFixed(0)}% of the pool but takes ${(share * 100).toFixed(0)}% of the first 40 cards`,
      );
    }
  }

  assert.ok(checked >= 3, `expected several mixed units to check, saw ${checked}`);
});

test('mix: every kind still turns up in the first few cards of its unit', () => {
  // The guarantee the flat round-robin existed to give, and the one a
  // proportional merge could plausibly lose: ranking by size alone would put
  // all 291 auxiliary cards before the first anything-else. A learner should
  // meet each rule of the unit in the first session, not the third.
  const items = content.orderGrammar(load('grammar').items);
  const units = [...new Set(items.map((item) => item.unit))];

  for (const unit of units) {
    const inUnit = items.filter((item) => item.unit === unit);
    for (const kind of new Set(inUnit.map((item) => item.kind))) {
      const at = inUnit.findIndex((item) => item.kind === kind) + 1;
      assert.ok(at > 0 && at <= 10, `unit ${unit}: the first ${kind} card is at position ${at}`);
    }
  }
});

test('mix: number cards are both shapes of the same question', () => {
  // `numbers` shows the numeral and asks for the word; `heard` with subject
  // `number` plays a clip and asks which number was said. Different kinds
  // because they are built from different sources, one lesson to a learner —
  // and it was the total of the two that made unit 2 unbearable.
  assert.equal(cards.isNumberCard({ kind: 'numbers' }), true);
  assert.equal(cards.isNumberCard({ kind: 'heard', subject: 'number' }), true);
  assert.equal(cards.isNumberCard({ kind: 'heard', subject: 'weekday' }), false);
  assert.equal(cards.isNumberCard({ kind: 'gender' }), false);
  assert.equal(cards.isNumberCard(null), false);
});

test('mix: numbers have a deck of their own, and the grammar drill does without them', () => {
  const items = content.orderGrammar(load('grammar').items).filter((item) => cards.isDrillable(item, 'grammar'));
  const numbers = items.filter(cards.isNumberCard);
  const rest = items.filter((item) => !cards.isNumberCard(item));

  // Enough to be worth a screen. If a content rebuild ever drops this below a
  // session's worth, #/numbers would open on "nothing due" every time.
  assert.ok(numbers.length >= 40, `only ${numbers.length} number cards`);
  assert.equal(numbers.length + rest.length, items.length);

  // And the unit they came from is no longer mostly numbers.
  const unit2 = rest.filter((item) => item.unit === 2);
  assert.ok(unit2.length > 0, 'unit 2 must still have grammar of its own');
  assert.equal(unit2.filter(cards.isNumberCard).length, 0);
});

test('mix: the numbers deck leads with the shape that is not audio-only', () => {
  // 85% of the number pool is listening cards, so a session drawn from it
  // would be almost all audio — and an audio card is the one that fails when
  // the phone is muted. Both shapes have to be present in any run of cards
  // long enough to be a session.
  const items = content.orderGrammar(load('grammar').items).filter(cards.isNumberCard);
  const head = items.slice(0, 20);
  assert.ok(head.some((item) => item.kind === 'numbers'), 'no read-it card in the first 20');
  assert.ok(head.some((item) => item.kind === 'heard'), 'no hear-it card in the first 20');
});
