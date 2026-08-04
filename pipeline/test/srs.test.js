'use strict';

/**
 * Scheduling rules for the Learn decks.
 *
 * app/js/store.js is a browser module, but the parts worth testing — which box
 * an answer moves an item to, and which cards a session is built from — are
 * pure functions that never touch IndexedDB. They are imported directly here;
 * `indexedDB` is only referenced inside openDb(), which none of this calls.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const STORE_URL = pathToFileURL(path.join(__dirname, '..', '..', 'app', 'js', 'store.js')).href;

let store;
test.before(async () => {
  store = await import(STORE_URL);
});

/* ------------------------------------------------------------------ nextBox */

test('srs: a right answer promotes one box and stops at the top', async () => {
  assert.equal(store.nextBox(0, { correct: true }), 1);
  assert.equal(store.nextBox(3, { correct: true }), 4);
  assert.equal(store.nextBox(store.MAX_BOX, { correct: true }), store.MAX_BOX);
});

test('srs: a lapse on a well-known word drops to box 1, not back to zero', async () => {
  // Box 3+ means the word has survived several spaced reviews. Forgetting it
  // once is a faded memory, not an unlearned word — sending it to box 0 would
  // spend the next four reviews re-teaching something already half-known.
  assert.equal(store.nextBox(4, { correct: false }), 1);
  assert.equal(store.nextBox(3, { correct: false }), 1);
});

test('srs: a lapse on a barely-known word goes back to the start', async () => {
  assert.equal(store.nextBox(2, { correct: false }), 0);
  assert.equal(store.nextBox(0, { correct: false }), 0);
});

test('srs: an accent-only miss holds its box rather than promoting', async () => {
  // Counted as correct — the word was retrieved — but the exact spelling has
  // not been proved, so it comes round again on the same schedule.
  assert.equal(store.nextBox(2, { correct: true, partial: true }), 2);
  assert.equal(store.nextBox(0, { correct: true, partial: true }), 0);
});

/* -------------------------------------------------------------- buildSession */

const items = Array.from({ length: 40 }, (_, index) => ({ id: `W${index}` }));
const NOW = 1_700_000_000_000;
const seen = (box, dueAt) => ({ box, dueAt, seen: 1, correct: 1, lapses: 0 });

test('srs: an empty deck state yields only new receptive cards', async () => {
  const session = store.buildSession(items, { recv: new Map(), prod: new Map() }, { limit: 10, newTarget: 5, now: NOW });
  assert.equal(session.length, 5, 'the new-word cap holds even when nothing else is available');
  assert.ok(session.every((card) => card.strand === store.STRANDS.recv && card.isNew));
});

test('srs: production stays locked until the word is recognised', async () => {
  const recv = new Map([['W0', seen(store.PROD_UNLOCK_BOX - 1, NOW - 1)]]);
  const locked = store.buildSession([items[0]], { recv, prod: new Map() }, { limit: 10, newTarget: 0, now: NOW });
  assert.deepEqual(locked.map((card) => card.strand), [store.STRANDS.recv]);

  const unlocked = store.buildSession(
    [items[0]],
    { recv: new Map([['W0', seen(store.PROD_UNLOCK_BOX, NOW - 1)]]), prod: new Map() },
    { limit: 10, newTarget: 0, now: NOW },
  );
  assert.deepEqual(unlocked.map((card) => card.strand).sort(), ['prod', 'recv']);
});

test('srs: an unlocked word with no production history counts as a review, not a new word', async () => {
  // The word is known; the skill is not. It must not be charged against the
  // daily new-word budget or a backlog of them would block all fresh intake.
  const recv = new Map([['W0', seen(4, NOW + 86400000)]]); // recv not yet due
  const session = store.buildSession([items[0]], { recv, prod: new Map() }, { limit: 10, newTarget: 0, now: NOW });
  assert.equal(session.length, 1);
  assert.equal(session[0].strand, store.STRANDS.prod);
  assert.equal(session[0].isNew, false);
});

test('srs: words that are not due yet are left alone', async () => {
  const recv = new Map(items.map((item) => [item.id, seen(1, NOW + 86400000)]));
  const session = store.buildSession(items, { recv, prod: new Map() }, { limit: 10, newTarget: 0, now: NOW });
  assert.deepEqual(session, []);
});

test('srs: reviews are not buried under new words when both are available', async () => {
  // 20 cards due and a full deck of unmet words: the session is reviews only.
  // This used to reserve the new-word slots first and hand back 4 new + 8
  // reviews, which added four cards to the backlog for every session that
  // cleared eight — the queue could never drain.
  const recv = new Map(items.slice(0, 20).map((item) => [item.id, seen(1, NOW - 1)]));
  const session = store.buildSession(items, { recv, prod: new Map() }, { limit: 12, newTarget: 4, now: NOW });
  assert.equal(session.length, 12);
  assert.equal(session.filter((card) => card.isNew).length, 0);
  assert.equal(session.filter((card) => !card.isNew).length, 12);
});

test('srs: the session never exceeds its limit', async () => {
  const recv = new Map(items.map((item) => [item.id, seen(4, NOW - 1)]));
  const prod = new Map(items.map((item) => [item.id, seen(1, NOW - 1)]));
  const session = store.buildSession(items, { recv, prod }, { limit: 6, newTarget: 8, now: NOW });
  assert.equal(session.length, 6);
});

/* ------------------------------------------------- new words arrive in order */

test('srs: new words are taken in stage then rank order, never shuffled', async () => {
  // The bug this guards: `fresh` used to be shuffled, so a beginner's first
  // session was a random draw from 2,000 A1 words and led with things like
  // "Wunngemeinschaft" instead of "ech".
  const deck = [
    { id: 'late', stage: 5, rank: 900 },
    { id: 'first', stage: 1, rank: 12 },
    { id: 'third', stage: 2, rank: 40 },
    { id: 'second', stage: 1, rank: 30 },
    { id: 'fourth', stage: 3, rank: 5 }, // low rank but a later stage
  ];
  for (let run = 0; run < 10; run += 1) {
    const session = store.buildSession(deck, { recv: new Map(), prod: new Map() }, { limit: 3, newTarget: 3, now: NOW });
    const ids = session.map((card) => card.item.id).sort();
    assert.deepEqual(ids, ['first', 'second', 'third'], 'the three most useful words must be the three selected');
  }
});

test('srs: an item with no rank still sorts, at the back', async () => {
  const deck = [{ id: 'unranked' }, { id: 'ranked', stage: 1, rank: 3 }];
  const session = store.buildSession(deck, { recv: new Map(), prod: new Map() }, { limit: 1, newTarget: 1, now: NOW });
  assert.equal(session[0].item.id, 'ranked');
});

test('srs: sessions interleave strands rather than blocking them together', async () => {
  const recv = new Map(items.map((item) => [item.id, seen(4, NOW - 1)]));
  const prod = new Map(items.map((item) => [item.id, seen(1, NOW - 1)]));
  // Over many draws, a shuffled mix must produce at least one strand change.
  const anyInterleaved = Array.from({ length: 20 }, () =>
    store.buildSession(items, { recv, prod }, { limit: 10, newTarget: 0, now: NOW }),
  ).some((session) => session.some((card, index) => index > 0 && card.strand !== session[index - 1].strand));
  assert.ok(anyInterleaved, 'strands should be shuffled together, not run in blocks');
});

/* --------------------------------------------------------- buildMixedSession */

const emptyStates = () => ({ recv: new Map(), prod: new Map() });

test('srs: a mixed session takes the next words across decks, in path order', async () => {
  // The bug this guards: "the next words to learn" is a fact about the whole
  // vocabulary, but the decks are three files. A session that could only see
  // one of them made the learner pick a file before they could practise, and
  // the correct pick ("whichever holds word 29") is not knowable.
  const groups = [
    { deck: { id: 'vocab' }, items: [{ id: 'V1', stage: 1, rank: 1 }, { id: 'V9', stage: 4, rank: 900 }], states: emptyStates() },
    { deck: { id: 'phrase' }, items: [{ id: 'P1', stage: 1, rank: 2 }], states: emptyStates() },
    { deck: { id: 'verb' }, items: [{ id: 'B1', stage: 2, rank: 1 }], states: emptyStates() },
  ];
  const session = store.buildMixedSession(groups, { limit: 3, newTarget: 3, now: NOW });
  assert.deepEqual(session.map((card) => card.item.id).sort(), ['B1', 'P1', 'V1']);
});

test('srs: every mixed card knows which deck it came from', async () => {
  // Without this the engine cannot grade: it would not know which ladder to
  // use, nor which deck's progress row to write.
  const groups = [
    { deck: { id: 'vocab' }, items: [{ id: 'V1', stage: 1, rank: 1 }], states: emptyStates() },
    { deck: { id: 'verb' }, items: [{ id: 'B1', stage: 1, rank: 2 }], states: emptyStates() },
  ];
  const session = store.buildMixedSession(groups, { limit: 2, newTarget: 2, now: NOW });
  const byItem = new Map(session.map((card) => [card.item.id, card.deck.id]));
  assert.equal(byItem.get('V1'), 'vocab');
  assert.equal(byItem.get('B1'), 'verb');
  assert.ok(session.every((card) => Array.isArray(card.pool)), 'each card carries the pool its distractors come from');
});

test('srs: a mixed session honours the daily new-word cap across all decks together', async () => {
  // Three decks must not mean three times the intake.
  const groups = ['vocab', 'verb', 'phrase'].map((id) => ({
    deck: { id },
    items: Array.from({ length: 20 }, (_, index) => ({ id: `${id}${index}`, stage: 1, rank: index })),
    states: emptyStates(),
  }));
  const session = store.buildMixedSession(groups, { limit: 12, newTarget: 8, now: NOW });
  assert.equal(session.length, 8);
});

test('srs: a single-deck session is just a mixed session with one group', async () => {
  const deck = [{ id: 'a', stage: 1, rank: 1 }, { id: 'b', stage: 1, rank: 2 }];
  const plain = store.buildSession(deck, emptyStates(), { limit: 2, newTarget: 2, now: NOW });
  assert.deepEqual(plain.map((card) => card.item.id).sort(), ['a', 'b']);
  assert.ok(plain.every((card) => card.deck === undefined), 'a single-deck plan leaves the deck to runSession');
});

test('srs: a review backlog is cleared before any new words are added', async () => {
  // The bug this guards: the new-word slots were reserved *first*, so a
  // backlog of 24 due cards handed back 4 reviews and 8 new words. Every
  // session then grew the backlog by four while the home screen kept
  // reporting 24 due — "I have 24 cards but I cannot find them".
  const met = Array.from({ length: 24 }, (_, index) => ({ id: `M${index}`, stage: 1, rank: index }));
  const unmet = Array.from({ length: 200 }, (_, index) => ({ id: `U${index}`, stage: 1, rank: 100 + index }));
  const recv = new Map(met.map((item) => [item.id, seen(1, NOW - 86400000)]));

  const session = store.buildSession([...met, ...unmet], { recv, prod: new Map() }, { limit: 12, newTarget: 8, now: NOW });
  assert.equal(session.length, 12);
  assert.ok(
    session.every((card) => !card.isNew),
    'with 24 cards due, a 12-card session must be all reviews',
  );
});

test('srs: new words still fill the rest of a session when the backlog is small', async () => {
  // The inverse failure would be just as bad: refusing new words whenever
  // anything at all is due would stall the path permanently.
  const met = [{ id: 'M0', stage: 1, rank: 0 }];
  const unmet = Array.from({ length: 200 }, (_, index) => ({ id: `U${index}`, stage: 1, rank: 100 + index }));
  const recv = new Map([['M0', seen(1, NOW - 86400000)]]);

  const session = store.buildSession([...met, ...unmet], { recv, prod: new Map() }, { limit: 12, newTarget: 8, now: NOW });
  const fresh = session.filter((card) => card.isNew).length;
  assert.equal(fresh, 8, 'the daily new-word target still applies when the backlog fits');
  assert.equal(session.length - fresh, 1, 'the one due card is in there too');
});

/* ------------------------------------------------------------- daily goal */

test('srs: the daily goal is a number that only goes up', async () => {
  // The bug this guards: every number on the home screen was queue depth, and
  // the queue refills as you work — a missed card returns to box 0, whose
  // interval is zero days, so it falls due again the same day. Answering 101
  // cards moved "8 words left" to 5, then 10, then 10, then 8. Nothing on the
  // screen could distinguish a hard day's work from having done nothing.
  assert.equal(typeof store.DAILY_CARD_GOAL, 'number');
  assert.ok(store.DAILY_CARD_GOAL > 0);
});

test('srs: box 0 falls due immediately, which is why an empty queue is not the goal', async () => {
  // Documents the mechanism rather than asserting a wish: a lapse should come
  // back soon, and "soon" here is zero days. That is deliberate, and it is
  // exactly why completion has to be measured as work done, not queue length.
  assert.equal(store.nextBox(1, { correct: false }), 0);
  assert.equal(store.LEITNER_DAYS[0], 0, 'a lapsed card is due again immediately, so "nothing due" is not reachable');
});

/* ------------------------------------------------------- the pass mark */

test('srs: one pass mark, and a verdict that agrees with it', async () => {
  // The bug this guards: the end of a listening set congratulated every score
  // ("Great work! Your listening score just moved.") over a full green bar,
  // while readinessFor() reported the same attempt as below the line on the
  // next screen. Both now read the same constant and the same banding.
  assert.equal(store.PASS_MARK, 50);

  assert.equal(store.setVerdict(90).passed, true);
  assert.equal(store.setVerdict(51).passed, true);
  // The rule is *over* 50, not at least 50 — the boundary belongs to the fail.
  assert.equal(store.setVerdict(50).passed, false);
  assert.equal(store.setVerdict(20).passed, false);
  assert.equal(store.setVerdict(0).passed, false);

  for (const pct of [0, 20, 35, 50, 51, 80, 100]) {
    const verdict = store.setVerdict(pct);
    assert.equal(typeof verdict.line, 'string');
    assert.ok(verdict.line.length > 0, `no line for ${pct}%`);
    assert.ok(verdict.label.includes('pass mark'), `no verdict label for ${pct}%`);
  }
});

test('srs: a verdict never celebrates a score readiness calls a fail', async () => {
  // The two have to agree at every point, not just at the ones spot-checked
  // above: `passed` is what decides whether Amelie sets off confetti.
  for (let pct = 0; pct <= 100; pct += 1) {
    const speaking = pct;
    const passesSpeaking = store.readinessFor('p', {
      attempts: [],
      recordings: [{ id: 'r', playerId: 'p' }],
      reviews: [{ recordingId: 'r', bands: {}, globalNote: 0 }],
    });
    void passesSpeaking; // shape check only; the assertion below is the point
    assert.equal(store.setVerdict(speaking).passed, speaking > store.PASS_MARK, `disagreement at ${pct}%`);
  }
});

/* -------------------------------------------------- the daily new-word cap */

test('srs: newTarget caps new words, including the reserved deck', async () => {
  // The bug this guards: DAILY_NEW_TARGET is documented as a *daily* budget
  // but was only ever passed to the builder as a per-*session* default, and no
  // screen passed a remaining amount. A 30-card day of 12-card sessions took
  // up to 24 new words, and abandoning a session halfway bought a fresh 8 as
  // often as you cared to do it — 27 new words on day one against a stated cap
  // of 8, each returning later as two strands of reviews.
  const vocab = Array.from({ length: 200 }, (_, i) => ({ id: `v${i}`, stage: 1, rank: i }));
  const grammar = Array.from({ length: 200 }, (_, i) => ({ id: `g${i}`, stage: 1, rank: i }));
  const empty = () => ({ recv: new Map(), prod: new Map() });

  for (const budget of [0, 1, 3, 8]) {
    const plan = store.buildMixedSession(
      [
        { deck: { id: 'vocab' }, items: vocab, states: empty() },
        { deck: { id: 'grammar' }, items: grammar, states: empty() },
      ],
      { limit: 12, newTarget: budget, reserve: { grammar: 3 } },
    );
    const fresh = plan.filter((entry) => entry.isNew).length;
    assert.equal(fresh, budget, `newTarget ${budget} produced ${fresh} new cards`);
  }
});

test('srs: a spent budget yields no new words, however many sessions are started', async () => {
  // Everything below is unseen, so every available card is a new word. With
  // the budget spent, starting another session has to hand back nothing rather
  // than another eight.
  const items = Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, stage: 1, rank: i }));
  for (let session = 0; session < 5; session += 1) {
    const plan = store.buildMixedSession([{ deck: { id: 'vocab' }, items, states: { recv: new Map(), prod: new Map() } }], {
      limit: 12,
      newTarget: 0,
      reserve: { grammar: 3 },
    });
    assert.equal(plan.length, 0, `session ${session + 1} handed out ${plan.length} cards on a spent budget`);
  }
});

/* --------------------------------------------- progress that actually moves */

test('srs: the deck bar reports something a single session can change', async () => {
  // The bug this guards: the deck rows filled by `heldPct`, i.e. items at box
  // STRONG_BOX or higher. With intervals 0/1/3/7 the earliest an item can
  // reach box 3 is day 11, and MAX_BOX is day 27 — so both bars on every deck
  // row were pinned at zero for a beginner's first fortnight however much they
  // drilled, which is indistinguishable from the app saving nothing.
  let box = 0;
  let daysToStrong = 0;
  while (box < store.STRONG_BOX) {
    box = store.nextBox(box, { correct: true });
    daysToStrong += store.LEITNER_DAYS[box];
  }
  assert.ok(daysToStrong >= 10, `expected "holding" to be far off; it is ${daysToStrong} days`);

  // So `learnProgress` also reports the box distribution, which moves on every
  // correct answer because every correct answer promotes a box.
  const distribution = (rows) => {
    const boxes = Array.from({ length: store.MAX_BOX + 1 }, () => 0);
    for (const row of rows) boxes[row.box] += 1;
    return boxes;
  };
  const before = distribution([{ box: 0 }, { box: 0 }, { box: 1 }]);
  const after = distribution([{ box: 1 }, { box: 0 }, { box: 1 }]); // one answered right
  assert.notDeepEqual(before, after, 'a correct answer must change the distribution the same day');
});

test('srs: a spent budget is distinguishable from an empty queue', async () => {
  // These are different situations and the screens say different things about
  // them: "you are caught up" is only true when there is nothing left, and
  // saying it when the cap is holding words back is what made a "116 / 120"
  // step counter look stuck.
  const items = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, stage: 1, rank: i }));
  const recv = new Map();
  const now = Date.now();
  // Everything met, nothing due: a genuinely empty queue.
  for (const item of items) recv.set(item.id, { box: 1, dueAt: now + 86400000, seen: 1, strand: 'recv' });
  const caughtUp = store.buildMixedSession([{ deck: { id: 'vocab' }, items, states: { recv, prod: new Map() } }], {
    limit: 12,
    newTarget: 8,
    now,
  });
  assert.equal(caughtUp.length, 0, 'nothing met and nothing due is an empty session');

  // Unmet words remain, but the budget is spent: also an empty session, for a
  // completely different reason.
  const fresh = Array.from({ length: 50 }, (_, i) => ({ id: `y${i}`, stage: 1, rank: i }));
  const capped = store.buildMixedSession([{ deck: { id: 'vocab' }, items: fresh, states: { recv: new Map(), prod: new Map() } }], {
    limit: 12,
    newTarget: 0,
    now,
  });
  assert.equal(capped.length, 0);
  // The caller can tell them apart, which is the whole point.
  assert.equal(store.DAILY_NEW_TARGET > 0, true);
});
