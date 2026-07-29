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
  const recv = new Map(items.slice(0, 20).map((item) => [item.id, seen(1, NOW - 1)]));
  const session = store.buildSession(items, { recv, prod: new Map() }, { limit: 12, newTarget: 4, now: NOW });
  assert.equal(session.length, 12);
  assert.equal(session.filter((card) => card.isNew).length, 4);
  assert.equal(session.filter((card) => !card.isNew).length, 8);
});

test('srs: the session never exceeds its limit', async () => {
  const recv = new Map(items.map((item) => [item.id, seen(4, NOW - 1)]));
  const prod = new Map(items.map((item) => [item.id, seen(1, NOW - 1)]));
  const session = store.buildSession(items, { recv, prod }, { limit: 6, newTarget: 8, now: NOW });
  assert.equal(session.length, 6);
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
