'use strict';

/**
 * Reporting a card, and what that does next time.
 *
 * The failure mode worth guarding is a flag that changes nothing. A button
 * that says "noted" and then serves the same card tomorrow is worse than no
 * button, because it spends the player's goodwill and teaches them the report
 * was ignored. So these tests are about the *consequence*, not the record.
 *
 * The second thing they pin is the difference between the two reasons. "This
 * makes no sense" and "I have seen this too often" are different complaints
 * and a single suppression rule would get one of them wrong: suppressing a
 * repeat forever fights the scheduler, and resting a broken card for a
 * fortnight just delays showing something broken.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');

let store;
test.before(async () => {
  store = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'store.js')).href);
});

const DAY = 24 * 60 * 60 * 1000;
const flag = (over = {}) => ({
  key: 'diego:vocab:HAUT1',
  playerId: 'diego',
  source: 'vocab',
  itemId: 'HAUT1',
  label: 'haut — today',
  reason: 'confusing',
  count: 1,
  at: new Date('2026-08-01T10:00:00Z').toISOString(),
  ...over,
});

test('flags: a card that makes no sense stays out until it is undone', () => {
  const broken = flag({ reason: 'confusing' });
  assert.equal(store.flagActive(broken, Date.parse('2026-08-01T10:00:01Z')), true);
  // Still out a year later. There is nothing to be gained from showing a card
  // whose question or answer is wrong, however long ago it was reported.
  assert.equal(store.flagActive(broken, Date.parse('2027-08-01T10:00:00Z')), true);
});

test('flags: a card seen too often rests, then comes back', () => {
  const tired = flag({ reason: 'repetitive' });
  const at = Date.parse(tired.at);
  assert.equal(store.flagActive(tired, at + DAY), true, 'should still be resting the next day');
  assert.equal(store.flagActive(tired, at + 13 * DAY), true, 'should still be resting on day 13');
  // Suppressing it forever would fight the scheduler: repetition is how a word
  // is learned, and the complaint is about frequency, not about the card.
  assert.equal(store.flagActive(tired, at + 15 * DAY), false, 'should be back after the rest period');
  assert.equal(store.FLAG_REST_DAYS, 14);
});

test('flags: suppression is per player and per exercise', () => {
  const flags = [
    flag({ playerId: 'diego', source: 'vocab', itemId: 'A' }),
    flag({ playerId: 'diana', source: 'vocab', itemId: 'B' }),
    flag({ playerId: 'diego', source: 'objects', itemId: 'C' }),
  ];
  const mine = store.suppressedIds(flags, 'vocab', 'diego');
  assert.deepEqual([...mine], ['A'], 'one player’s report should not silence the other’s deck');

  const objects = store.suppressedIds(flags, 'objects', 'diego');
  assert.deepEqual([...objects], ['C']);

  // The picture game and the vocabulary deck can hold the same lemma id and
  // are not the same card, which is why `source` is part of the key.
  assert.equal(store.suppressedIds(flags, 'objects', 'diego').has('A'), false);
});

test('flags: the session builders leave a reported card out', () => {
  const items = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const states = { recv: new Map(), prod: new Map() };

  const everything = store.buildSession(items, states, { deckId: 'vocab', limit: 10, newTarget: 10 });
  assert.deepEqual(everything.map((entry) => entry.item.id).sort(), ['A', 'B', 'C']);

  const filtered = store.buildSession(items, states, {
    deckId: 'vocab',
    limit: 10,
    newTarget: 10,
    flagged: new Set(['vocab:B']),
  });
  assert.deepEqual(filtered.map((entry) => entry.item.id).sort(), ['A', 'C'], 'B was reported and should not be served');

  // The key is deck-scoped: the same item id in another deck is untouched.
  const other = store.buildSession(items, states, {
    deckId: 'verb',
    limit: 10,
    newTarget: 10,
    flagged: new Set(['vocab:B']),
  });
  assert.deepEqual(other.map((entry) => entry.item.id).sort(), ['A', 'B', 'C']);
});

test('flags: a mixed session applies the filter to every deck it draws on', () => {
  const states = () => ({ recv: new Map(), prod: new Map() });
  const groups = [
    { deck: { id: 'vocab' }, items: [{ id: 'A' }, { id: 'B' }], states: states() },
    { deck: { id: 'verb' }, items: [{ id: 'A' }, { id: 'C' }], states: states() },
  ];
  const plan = store.buildMixedSession(groups, {
    limit: 10,
    newTarget: 10,
    flagged: new Set(['vocab:A', 'verb:C']),
  });
  const served = plan.map((entry) => `${entry.deck.id}:${entry.item.id}`).sort();
  assert.deepEqual(served, ['verb:A', 'vocab:B'], 'each deck should honour its own flags and no others');
});

test('flags: flagging never touches the Leitner row', () => {
  // The card keeps its real schedule and simply stops being drawn, so undoing
  // a flag restores it as it was rather than as a new word. Asserted by
  // showing the plan changes while the states map does not.
  const items = [{ id: 'A' }, { id: 'B' }];
  const states = { recv: new Map([['A', { box: 3, dueAt: 0 }]]), prod: new Map() };
  const before = JSON.stringify([...states.recv]);

  store.buildSession(items, states, { deckId: 'vocab', limit: 10, newTarget: 10, flagged: new Set(['vocab:A']) });

  assert.equal(JSON.stringify([...states.recv]), before, 'the scheduler state must be left alone');
});

test('flags: the key set the builders use spans decks and respects the rest period', () => {
  const at = new Date('2026-08-01T10:00:00Z').toISOString();
  const flags = [
    flag({ source: 'vocab', itemId: 'A', reason: 'confusing', at }),
    flag({ source: 'verb', itemId: 'B', reason: 'repetitive', at }),
  ];
  const fresh = store.flaggedCardKeys(flags, 'diego', Date.parse(at) + DAY);
  assert.deepEqual([...fresh].sort(), ['verb:B', 'vocab:A']);

  // A fortnight on, only the broken one is still held back.
  const later = store.flaggedCardKeys(flags, 'diego', Date.parse(at) + 20 * DAY);
  assert.deepEqual([...later], ['vocab:A']);
});

test('flags: a clip that would not play is held back for good, not rested', () => {
  // Filed by the skip on an audio-only card. It has to behave like `confusing`
  // rather than like `repetitive`: the complaint is that the recording never
  // arrived, and a fortnight's rest does not fix a file. Reported from use as
  // skipped cards that "keep coming back".
  const at = new Date('2026-08-01T10:00:00Z').toISOString();
  const silent = flag({ source: 'grammar', itemId: 'gr-heard-1', reason: 'silent', at });

  assert.equal(store.flagActive(silent, Date.parse(at) + DAY), true);
  assert.equal(store.flagActive(silent, Date.parse(at) + 20 * DAY), true, 'a silent clip must not come back on its own');
  assert.equal(store.flagActive(silent, Date.parse(at) + 400 * DAY), true);

  const keys = store.flaggedCardKeys([silent], 'diego', Date.parse(at) + 400 * DAY);
  assert.deepEqual([...keys], ['grammar:gr-heard-1']);
});

test('flags: every reason the app can file has a label to show for it', () => {
  // The Settings list prints `FLAG_REASONS[flag.reason]`, so a reason written
  // by some screen but missing here renders as its own bare id.
  for (const reason of ['confusing', 'repetitive', 'silent']) {
    assert.ok(store.FLAG_REASONS[reason], `no label for "${reason}"`);
  }
});
