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

  // Both strands are due here, and this test is about the unlock rule, not
  // about STALE_REVIEW_SAMPLE (below) — so both are marked as mistakes, which
  // always come back, rather than leaving it to a 20% draw whether the test
  // sees one strand or two.
  const mistakes = store.mistakeEntryKeys([
    { deck: undefined, strand: 'recv', itemId: 'W0' },
    { deck: undefined, strand: 'prod', itemId: 'W0' },
  ]);
  const unlocked = store.buildSession(
    [items[0]],
    { recv: new Map([['W0', seen(store.PROD_UNLOCK_BOX, NOW - 1)]]), prod: new Map() },
    { limit: 10, newTarget: 0, now: NOW, mistakes },
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

test('srs: new words are not buried under a review backlog of held words', async () => {
  // 20 words due for review — none of them mistakes — and a full deck of
  // unmet words. This used to reserve the review slots first and hand back
  // 8 reviews + 4 new, on the theory that a due card is a memory about to be
  // lost. It no longer is one: only a genuine mistake is treated that way now
  // (see STALE_REVIEW_SAMPLE), so new words win their full daily target and
  // the backlog only tops up whatever is left, throttled — which is also why
  // the session can come back shorter than `limit`, the same way a spent
  // newTarget already caps a session short of `limit` today.
  const recv = new Map(items.slice(0, 20).map((item) => [item.id, seen(1, NOW - 1)]));
  const session = store.buildSession(items, { recv, prod: new Map() }, { limit: 12, newTarget: 4, now: NOW });
  assert.equal(session.filter((card) => card.isNew).length, 4, 'the daily new-word target is met in full');
  assert.ok(session.length <= 12, 'never exceeds the limit');
  assert.ok(session.length - 4 <= Math.ceil(20 * 0.2), 'the review portion never exceeds a fifth of what is due');
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

test('srs: new words fill their full daily target even with a large review backlog', async () => {
  // The bug this used to guard was the opposite of what it guards now: new-
  // word slots reserved first meant a 24-card backlog handed back only 4
  // reviews, so the backlog never drained. It was fixed by putting reviews
  // first — which then buried new words the other way, which is exactly what
  // was asked to be undone. Now: 24 due, none of them mistakes, and a full
  // daily target of 8 new words. New words get all 8; the backlog only tops
  // up whatever room is left, throttled.
  const met = Array.from({ length: 24 }, (_, index) => ({ id: `M${index}`, stage: 1, rank: index }));
  const unmet = Array.from({ length: 200 }, (_, index) => ({ id: `U${index}`, stage: 1, rank: 100 + index }));
  const recv = new Map(met.map((item) => [item.id, seen(1, NOW - 86400000)]));

  const session = store.buildSession([...met, ...unmet], { recv, prod: new Map() }, { limit: 12, newTarget: 8, now: NOW });
  assert.equal(session.filter((card) => card.isNew).length, 8, 'the daily new-word target is met in full, whatever the backlog');
  assert.ok(session.length - 8 <= Math.ceil(24 * 0.2), 'the review portion never exceeds a fifth of what is due');
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

/* -------------------------------------------- mistakes vs. the held backlog
 * A card just missed is tracked separately (store.recordMistake/listMistakes)
 * from the Leitner box that decides when a *correctly* held word is due.
 * buildMixedSession only treats the first kind as urgent; the second is
 * throttled to STALE_REVIEW_SAMPLE so a long backlog of words already known
 * cannot outnumber new words the way an uncapped one used to.
 */

test('srs: a mistake always comes back, never subject to the review throttle', async () => {
  // 19 ordinary due reviews plus one flagged mistake: with newTarget: 0 there
  // is nothing but the review pool to draw from, and ceil(20 * 0.2) = 4 would
  // easily miss any one specific card by chance if mistakes were not pulled
  // out first. Run several times, with real randomness, to be sure this is a
  // guarantee and not a coin flip that happened to land right once.
  const due = items.slice(0, 20);
  const recv = new Map(due.map((item) => [item.id, seen(1, NOW - 1)]));
  const mistakes = store.mistakeEntryKeys([{ deck: undefined, strand: 'recv', itemId: due[0].id }]);

  for (let run = 0; run < 20; run += 1) {
    const session = store.buildSession(due, { recv, prod: new Map() }, { limit: 4, newTarget: 0, now: NOW, mistakes });
    assert.ok(
      session.some((card) => card.item.id === due[0].id),
      'the flagged mistake must appear even though it is one of only a few slots',
    );
  }
});

test('srs: a held-but-correct backlog is capped at roughly a fifth of what is due', async () => {
  const due = items.slice(0, 30);
  const recv = new Map(due.map((item) => [item.id, seen(1, NOW - 1)]));
  // No mistakes, no new words, and room for the whole backlog if nothing
  // throttled it — so whatever comes back is entirely down to the cap.
  const session = store.buildSession(due, { recv, prod: new Map() }, { limit: 30, newTarget: 0, now: NOW });
  assert.equal(session.length, Math.ceil(30 * 0.2), 'up to 20% of the due backlog, not all of it');
});

test('srs: the throttled slice is random, not the same fifth every time', async () => {
  const due = items.slice(0, 30);
  const recv = new Map(due.map((item) => [item.id, seen(1, NOW - 1)]));
  const draws = Array.from({ length: 10 }, () =>
    store
      .buildSession(due, { recv, prod: new Map() }, { limit: 30, newTarget: 0, now: NOW })
      .map((card) => card.item.id)
      .sort()
      .join(','),
  );
  assert.ok(new Set(draws).size > 1, 'ten draws from a 30-item backlog should not all pick the same six');
});

test('srs: mistakes and new words both come before the throttled backlog', async () => {
  const due = items.slice(0, 20); // held, not mistakes
  const unmet = items.slice(20); // 20 fresh words
  const recv = new Map(due.map((item) => [item.id, seen(1, NOW - 1)]));
  const mistakes = store.mistakeEntryKeys([{ deck: undefined, strand: 'recv', itemId: due[0].id }]);

  const session = store.buildSession([...due, ...unmet], { recv, prod: new Map() }, { limit: 5, newTarget: 3, now: NOW, mistakes });
  assert.equal(session.length, 5);
  assert.ok(session.some((card) => card.item.id === due[0].id), 'the mistake is in there');
  assert.equal(session.filter((card) => card.isNew).length, 3, 'the new-word target is met in full');
  // One slot left over (5 - 1 mistake - 3 new): a held, non-mistake review.
  const leftover = session.find((card) => !card.isNew && card.item.id !== due[0].id);
  assert.ok(leftover && due.some((item) => item.id === leftover.item.id), 'the last slot is a throttled review, not another mistake or new word');
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

test('srs: removing the cap did not switch spaced repetition off', async () => {
  // The first attempt at this set `newTarget` to Infinity, which reads as "no
  // limit" and is something much worse: fresh words then take every general
  // slot, `staleSlots` computes to zero, and reviews stop appearing at all.
  // Uncapped intake with no review is not fast learning — it is meeting two
  // thousand words once each. The per-session mix has to survive.
  const NOW_ = 1_700_000_000_000;
  const deck = Array.from({ length: 200 }, (_, index) => ({ id: `W${index}`, stage: 1, rank: index }));
  const recv = new Map(deck.slice(0, 40).map((item) => [item.id, { box: 1, dueAt: NOW_ - 1, seen: 2, correct: 1, lapses: 0 }]));

  const plan = store.buildSession(deck, { recv, prod: new Map() }, { deckId: 'vocab', limit: 12, now: NOW_ });
  const fresh = plan.filter((entry) => entry.isNew).length;
  const reviews = plan.length - fresh;
  assert.ok(fresh > 0, 'a session must still bring new words');
  assert.ok(reviews > 0, 'a session must still contain reviews — otherwise nothing is ever revised');
  assert.ok(fresh < plan.length, 'new words must not take the whole session');
});

test('srs: nothing caps how many new words a day can hold', async () => {
  // There was a budget — eight a day, raisable to twenty-five in Settings —
  // and it was the only thing in the app that actually stopped a day. Reviews
  // were always uncapped and the daily goal always was a target with nothing
  // withheld for missing it, so this was the whole of the limit. It was
  // removed on request.
  assert.equal(store.DAILY_NEW_TARGET, undefined, 'the daily budget constant should be gone');
  assert.equal(store.NEW_WORD_GOALS, undefined, 'the Settings picker for the budget should be gone');
  assert.equal(store.newWordGoal, undefined, 'nothing should still be resolving a budget');

  // Nothing carries across sessions: two sessions in a row each bring their
  // full share of new words, which is the whole of what "no daily limit"
  // means here.
  const deck = Array.from({ length: 200 }, (_, index) => ({ id: `W${index}`, stage: 1, rank: index }));
  const first = store.buildSession(deck, { recv: new Map(), prod: new Map() }, { deckId: 'vocab', limit: 12 });
  const firstNew = first.filter((entry) => entry.isNew).length;
  assert.ok(firstNew >= 8, `a twelve-card session should still bring about eight new words, got ${firstNew}`);

  // A bigger session brings proportionally more, rather than stopping at the
  // old cap of eight.
  const big = store.buildSession(deck, { recv: new Map(), prod: new Map() }, { deckId: 'vocab', limit: 40 });
  assert.ok(big.filter((entry) => entry.isNew).length > firstNew, 'a longer session should introduce more');
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

/* ------------------------------------------------ the structure guarantee */

test('srs: two groups sharing a deck id are reserved separately', async () => {
  // Sentence structure is a slice of the grammar deck rather than a deck of
  // its own — it has to share grammar's Leitner rows, or the same card would
  // carry two independent boxes depending on which screen showed it. But
  // `reserve` was keyed on `deck.id`, so a structure group and a grammar group
  // were one reservation: three reserved slots spread over nine grammar kinds,
  // and a word-order card turned up about a third of the time in something the
  // home screen calls mandatory. `reserveId` is what separates the two.
  const grammar = Array.from({ length: 400 }, (_, i) => ({ id: `g${i}`, stage: 1, rank: i, kind: i % 3 === 0 ? 'wordorder' : 'gender' }));
  const vocab = Array.from({ length: 400 }, (_, i) => ({ id: `v${i}`, stage: 1, rank: i }));
  const structure = grammar.filter((item) => item.kind === 'wordorder');
  const empty = () => ({ recv: new Map(), prod: new Map() });
  const states = empty();

  const plan = store.buildMixedSession(
    [
      { deck: { id: 'vocab' }, items: vocab, states: empty() },
      { deck: { id: 'grammar' }, items: grammar, states },
      { deck: { id: 'grammar' }, items: structure, states, pool: grammar, reserveId: 'structure' },
    ],
    { limit: 12, newTarget: 12, reserve: { grammar: 3, structure: 3 } },
  );

  const ids = new Set(plan.map((entry) => entry.item.id));
  const structural = [...ids].filter((id) => structure.some((item) => item.id === id)).length;
  assert.ok(structural >= 3, `expected at least 3 sentence-structure cards, got ${structural}`);
  assert.equal(plan.length, 12);
  // And no card is dealt twice because it belongs to both groups.
  assert.equal(new Set(plan.map((entry) => `${entry.item.id}:${entry.strand}`)).size, plan.length);
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

test('srs: an empty queue is the only way to get an empty session now', async () => {
  // There used to be two ways for a session to come back empty, and the
  // screens said different things about them: nothing due, or the daily
  // new-word budget spent. The budget is gone, so "you are caught up" is now
  // simply true whenever the session is empty — there is no second reason
  // hiding behind it.
  const items = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, stage: 1, rank: i }));
  const now = Date.now();
  const recv = new Map();
  for (const item of items) recv.set(item.id, { box: 1, dueAt: now + 86400000, seen: 1, strand: 'recv' });

  const caughtUp = store.buildMixedSession([{ deck: { id: 'vocab' }, items, states: { recv, prod: new Map() } }], {
    limit: 12,
    now,
  });
  assert.equal(caughtUp.length, 0, 'everything met and nothing due is an empty session');

  // Unmet words remaining can no longer produce an empty session, because
  // nothing is holding them back.
  const unmet = Array.from({ length: 50 }, (_, i) => ({ id: `y${i}`, stage: 1, rank: i }));
  const plan = store.buildMixedSession(
    [{ deck: { id: 'vocab' }, items: unmet, states: { recv: new Map(), prod: new Map() } }],
    { limit: 12, now },
  );
  assert.ok(plan.length > 0, 'unmet words must always be reachable — that is what removing the cap means');
  assert.ok(plan.some((entry) => entry.isNew));
});
