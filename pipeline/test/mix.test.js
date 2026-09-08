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

/* ------------------------------------------------- how much of one thing */

let store;
test.before(async () => {
  store = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'store.js')).href);
});

/** A group of `n` items, all unseen, so every one of them is a new card. */
function group(deckId, n, extra = {}) {
  return {
    deck: { id: deckId },
    items: Array.from({ length: n }, (_, i) => ({ id: `${deckId}-${i}`, stage: 1, rank: i })),
    states: { recv: new Map(), prod: new Map() },
    ...extra,
  };
}

test('mix: a capped group cannot take over a session', () => {
  // The reported case, in miniature: one group with far more due than
  // everything else. Without a cap it does not win a share of the session, it
  // *is* the session — a measured unit-3 session was 53% gender, because
  // gender is 1,134 cards against that unit's 150 new words.
  const big = { ...group('grammar', 400), reserveId: 'gender' };
  const small = group('vocab', 100);

  const plan = store.buildMixedSession([small, big], {
    limit: 12,
    newTarget: 12,
    caps: { gender: 2 },
    random: () => 0.5,
  });

  const gender = plan.filter((entry) => entry.deck.id === 'grammar').length;
  assert.equal(plan.length, 12, 'the cap must give its slots away, not shrink the session');
  assert.ok(gender <= 2, `capped at 2 but got ${gender}`);
  assert.equal(plan.length - gender, 10, 'the freed slots go to whatever else is due');
});

test('mix: a cap beats a reserve on the same group', () => {
  // A group can be both. The floor says "this deck matters every day" and the
  // ceiling says "I am seeing too much of it"; the learner's complaint is the
  // more recent information, so the ceiling wins.
  const capped = { ...group('grammar', 50), reserveId: 'gender' };
  const other = group('vocab', 50);

  const plan = store.buildMixedSession([other, capped], {
    limit: 12,
    newTarget: 12,
    reserve: { gender: 5 },
    caps: { gender: 1 },
    random: () => 0.5,
  });

  assert.equal(plan.filter((entry) => entry.deck.id === 'grammar').length, 1);
});

test('mix: a reserve that finds nothing does not shorten the session', () => {
  // Unit 3 has no sentence structure at all, and once gender moved to its own
  // capped group its grammar group was empty too — so six of twelve slots
  // were held for groups with nothing to put in them and the session came out
  // six cards long. Wrong since the reserves were introduced; the gender cap
  // is only what made it visible.
  const plan = store.buildMixedSession([group('vocab', 100)], {
    limit: 12,
    newTarget: 12,
    reserve: { grammar: 3, structure: 3 },
    random: () => 0.5,
  });

  assert.equal(plan.length, 12, `expected a full session, got ${plan.length}`);
});

test('mix: topping up an under-filled session still respects the new-word budget', () => {
  // The top-up fills wasted slots; it must not become a back door that pours
  // new words in past `newTarget`. With nothing else due, a short session
  // stays short rather than overshooting.
  const plan = store.buildMixedSession([group('vocab', 100)], {
    limit: 12,
    newTarget: 4,
    reserve: { grammar: 3 },
    random: () => 0.5,
  });

  assert.equal(plan.filter((entry) => entry.isNew).length, 4, 'the new-word allowance is the allowance');
  assert.ok(plan.length <= 12);
});

/* ------------------------------------- the real decks, the real proportions */

/**
 * Walk `sessions` unit sessions with the real decks and the real plan, and
 * report what came out. Empty state to start, and every card answered, which
 * is the best case for the learner and the worst case for a deck that repeats.
 */
function walk(plan, decks, stage, sessions = 30) {
  const states = {
    vocab: { recv: new Map(), prod: new Map() },
    verb: { recv: new Map(), prod: new Map() },
    phrase: { recv: new Map(), prod: new Map() },
    grammar: { recv: new Map(), prod: new Map() },
  };
  const tally = {};
  let now = Date.UTC(2026, 0, 1);
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let total = 0;
  let shortest = Infinity;
  let mostGender = 0;
  const lengths = [];

  for (let n = 0; n < sessions; n += 1) {
    const { groups, options } = plan.unitGroups({ ...decks, states, stage });
    const chosen = store.buildMixedSession(groups, { limit: plan.SESSION_SIZE, ...options, now, random });
    let gender = 0;
    for (const entry of chosen) {
      const label = entry.deck.id === 'grammar' ? `grammar:${entry.item.kind}` : entry.deck.id;
      if (entry.item.kind === 'gender') gender += 1;
      tally[label] = (tally[label] ?? 0) + 1;
      total += 1;
      const rows = states[entry.deck.id][entry.strand];
      rows.set(entry.item.id, { box: Math.min((rows.get(entry.item.id)?.box ?? 0) + 1, 6), dueAt: now + 86400000 });
    }
    lengths.push(chosen.length);
    shortest = Math.min(shortest, chosen.length);
    mostGender = Math.max(mostGender, gender);
    now += 86400000;
  }
  return {
    tally,
    total,
    shortest,
    mostGender,
    lengths,
    average: total / sessions,
    share: (key) => (tally[key] ?? 0) / total,
  };
}

test('mix: a unit-3 session is mostly vocabulary, not mostly gender', async () => {
  // The report: "I see a lot of questions about guessing the gender, let's not
  // over index on this. I'd rather improve my vocabulary and learn how to
  // properly conjugate as my goal is the exam." Measured at the time, unit 3
  // came out 53% gender — its only grammar kind is gender, and gender is 1,134
  // cards against the unit's 150 new words.
  const plan = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'drill', 'plan.js')).href);
  const decks = {
    vocab: load('vocab').items,
    verbs: load('verbs').items,
    phrases: load('phrases').items,
    grammar: content.orderGrammar(load('grammar').items),
  };

  const run = walk(plan, decks, 3);
  const gender = run.share('grammar:gender');

  assert.ok(run.mostGender <= plan.GENDER_CAP, `a single session held ${run.mostGender} gender cards`);
  assert.ok(gender < 0.25, `unit 3 is ${(gender * 100).toFixed(0)}% gender`);
  assert.ok(run.share('vocab') > gender * 2, 'vocabulary should lead the unit that teaches vocabulary');
});

test('mix: every unit gets conjugation practice, including the one with no verbs of its own', async () => {
  // The other half of the same request. The path has 60 verbs at stage 2, none
  // at stage 3, and 35 at stage 4 — so unit 3 sessions contained no verb card
  // at all until `carriedVerbs` let a unit with none of its own reach back.
  const plan = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'drill', 'plan.js')).href);
  const decks = {
    vocab: load('vocab').items,
    verbs: load('verbs').items,
    phrases: load('phrases').items,
    grammar: content.orderGrammar(load('grammar').items),
  };

  for (const stage of [3, 4, 7]) {
    const run = walk(plan, decks, stage);
    assert.ok(run.share('verb') > 0.05, `unit ${stage} is only ${(run.share('verb') * 100).toFixed(0)}% verbs`);
    // And not the opposite mistake: carrying earlier verbs in unconditionally
    // took unit 7 to 49%, which is revision crowding out the unit's own point.
    assert.ok(run.share('verb') < 0.45, `unit ${stage} is ${(run.share('verb') * 100).toFixed(0)}% verbs`);
  }
});

test('mix: a unit session runs to its full length once there is material for one', async () => {
  // Reserves hold back a slot each whether or not they can be filled, and a
  // unit with no sentence structure and no un-capped grammar had six of its
  // twelve slots held for nothing — so unit 3 served six-card sessions
  // indefinitely. Fixed by handing unclaimed slots back to the general pool.
  //
  // Measured as an average rather than a minimum, because the first sessions
  // of a unit are legitimately short: everything in them is new, and the daily
  // new-word allowance (`newSessionTarget`, 8 of 12) is the binding limit
  // until a review backlog exists. Unit 3 climbs 6 → 12 over eleven sessions
  // and then runs full; before the fix it averaged 6.0 forever.
  const plan = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'drill', 'plan.js')).href);
  const decks = {
    vocab: load('vocab').items,
    verbs: load('verbs').items,
    phrases: load('phrases').items,
    grammar: content.orderGrammar(load('grammar').items),
  };

  for (const stage of [1, 2, 3, 4, 7]) {
    const run = walk(plan, decks, stage, 30);
    assert.ok(
      run.average >= plan.SESSION_SIZE - 2,
      `unit ${stage} averages ${run.average.toFixed(1)} cards against a limit of ${plan.SESSION_SIZE} (${run.lengths.join(',')})`,
    );
    // And it does actually reach the limit rather than plateauing below it.
    assert.equal(Math.max(...run.lengths), plan.SESSION_SIZE, `unit ${stage} never reaches a full session`);
  }
});
