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
