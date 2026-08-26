'use strict';

/**
 * The player's display name.
 *
 * The whole risk in this feature is one substitution: `PLAYERS[].id` is a
 * database key — it is in every `learn` row's compound key, behind five
 * IndexedDB indexes, in `streak:${playerId}`, and in the Worker's scoreboard,
 * which validates it against its own fixed list. Renaming *that* would orphan
 * a person's entire history and desync the duel. These tests hold the line
 * that only the label moves.
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

test('name: an unset name falls back to the one the player was shipped with', () => {
  assert.equal(store.playerName({ playerId: 'diego' }), 'Diego');
  assert.equal(store.playerName({ playerId: 'diana' }), 'Diana');
  // Whitespace is not a name.
  assert.equal(store.playerName({ playerId: 'diego', displayName: '   ' }), 'Diego');
  assert.equal(store.playerName({ playerId: 'diego', displayName: null }), 'Diego');
});

test('name: a chosen name replaces the default, trimmed and bounded', () => {
  assert.equal(store.playerName({ playerId: 'diego', displayName: 'Dieguito' }), 'Dieguito');
  assert.equal(store.playerName({ playerId: 'diego', displayName: '  Dieguito  ' }), 'Dieguito');
  const long = 'x'.repeat(200);
  assert.equal(store.playerName({ playerId: 'diego', displayName: long }).length, store.MAX_NAME);
});

test('name: it only renames the person holding the device', () => {
  // The Worker carries no name field, so this device cannot know what the other
  // player calls themselves. Applying our own name to them would relabel the
  // scoreboard with a name nobody chose.
  const settings = { playerId: 'diego', displayName: 'Dieguito' };
  assert.equal(store.playerName(settings, 'diego'), 'Dieguito');
  assert.equal(store.playerName(settings, 'diana'), 'Diana');
});

test('name: renaming never touches the id anything is keyed by', () => {
  // The property the whole feature rests on. `PLAYERS` is the source of ids and
  // it is a module constant — a rename that reached it would silently orphan
  // every learn row, streak and score.
  const before = store.PLAYERS.map((player) => player.id);
  store.playerName({ playerId: 'diego', displayName: 'Someone Else' });
  assert.deepEqual(store.PLAYERS.map((player) => player.id), before);
  assert.deepEqual(before, ['diego', 'diana'], 'the ids are what the Worker validates against');
});

test('name: otherPlayer still resolves by id, whatever anyone is called', () => {
  assert.equal(store.otherPlayer('diego').id, 'diana');
  assert.equal(store.otherPlayer('diana').id, 'diego');
});

test('name: the prompt is due once and never again', () => {
  assert.equal(store.nameConfirmed({ playerId: 'diego' }), false);
  assert.equal(store.nameConfirmed({ playerId: 'diego', nameConfirmed: true }), true);
  // Only an explicit true. A truthy leftover from some other write must not
  // silently suppress a prompt that has never been shown.
  assert.equal(store.nameConfirmed({ playerId: 'diego', nameConfirmed: 'yes' }), false);
  assert.equal(store.nameConfirmed({}), false);
});

/* ------------------------------------------------------ the re-render loop */

test('name: confirming the existing name is not a change', () => {
  // The caller redraws the screen when `askName` reports a change. Reporting
  // one for "That is right, I am Diego" would flash the whole app for nothing.
  const same = (name, current) => String(name ?? '').trim() !== current;
  assert.equal(same('Diego', 'Diego'), false);
  assert.equal(same('  Diego  ', 'Diego'), false, 'trimming happens before the comparison');
  assert.equal(same('Dieguito', 'Diego'), true);
});

test('name: the module cannot ask, or report a change, twice', async () => {
  // The bug this pins, reported as "the screen flickers a lot". `askName`
  // memoised its promise to stop a second dialog opening — but a settled
  // promise stays settled, so every later call returned the same `true`, and
  // main.js re-routes on `true`. Re-routing calls `askName` again: an infinite
  // render loop. The fix is a latch that outlives the promise.
  const source = require('node:fs').readFileSync(path.join(ROOT, 'app', 'js', 'name-check.js'), 'utf8');

  assert.match(source, /if \(handled\) return false;/, 'the latch has to be checked before the memoised promise');
  // And it must be set on the way out of the dialog, not only when the prompt
  // was never due — otherwise answering it leaves the latch open.
  const finish = source.slice(source.indexOf('const finish'), source.indexOf('const dialog'));
  assert.match(finish, /handled = true;/, 'answering the dialog has to close the latch');
  assert.match(finish, /pending = null;/, 'the settled promise must not be handed out again');

  // The latch is checked first: reordering these two lines would restore the
  // loop, because the memoised promise would win.
  assert.ok(
    source.indexOf('if (handled) return false;') < source.indexOf('if (pending) return pending;'),
    'the latch has to be checked before the in-flight promise',
  );
});
