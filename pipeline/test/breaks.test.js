'use strict';

/**
 * The mid-session breaks.
 *
 * Two things are worth holding here, and neither is about the DOM. The
 * checkpoint maths decides *when* a break interrupts a session, and getting it
 * wrong means either never offering one or offering one every few cards. And
 * the trace puzzle is generated, so the property that matters is that it can
 * always be finished — a break that hands you an impossible puzzle is the one
 * failure mode that would make the whole feature worse than nothing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');

let breaks;
test.before(async () => {
  breaks = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'breaks.js')).href);
});

/* ----------------------------------------------------------- checkpoints */

test('breaks: the checkpoints are a third and two thirds of the daily goal', () => {
  assert.deepEqual(breaks.checkpointsFor(30), [10, 20]);
  assert.deepEqual(breaks.checkpointsFor(15), [5, 10]);
  assert.deepEqual(breaks.checkpointsFor(80), [27, 54]);
});

test('breaks: a tiny goal collapses to one checkpoint rather than two of the same', () => {
  // Offering the same break twice on consecutive cards is worse than offering
  // it once, and nothing stops a future goal being small enough to do that.
  assert.deepEqual(breaks.checkpointsFor(1), [1]);
  for (const goal of [1, 2, 3, 4, 5]) {
    const marks = breaks.checkpointsFor(goal);
    assert.equal(new Set(marks).size, marks.length, `goal ${goal} produced a duplicate checkpoint`);
  }
});

test('breaks: a checkpoint fires on the card that crosses it, and only then', () => {
  const goal = 30;
  assert.equal(breaks.dueCheckpoint({ before: 8, after: 9, goal }), null);
  assert.equal(breaks.dueCheckpoint({ before: 9, after: 10, goal }), 10);
  assert.equal(breaks.dueCheckpoint({ before: 10, after: 11, goal }), null);
  assert.equal(breaks.dueCheckpoint({ before: 19, after: 20, goal }), 20);
});

test('breaks: one already taken today is not offered again', () => {
  // The count is the day's, not the session's, so two short sessions must not
  // each offer both breaks.
  assert.equal(breaks.dueCheckpoint({ before: 9, after: 10, goal: 30, taken: [10] }), null);
  assert.equal(breaks.dueCheckpoint({ before: 19, after: 20, goal: 30, taken: [10] }), 20);
});

test('breaks: a session resuming past a checkpoint does not fire it retroactively', () => {
  // Someone who answered 14 cards this morning and opens a second session
  // should meet the two-thirds break, not be handed the one-third break they
  // already walked past.
  assert.equal(breaks.dueCheckpoint({ before: 14, after: 15, goal: 30, taken: [10] }), null);
});

/* ---------------------------------------------------------------- the set */

test('breaks: every break is declared with what it costs and why it is here', () => {
  assert.ok(breaks.BREAKS.length >= 3, 'a menu of one is not a choice');
  for (const entry of breaks.BREAKS) {
    assert.ok(entry.id && entry.title && entry.blurb, `${entry.id}: needs a title and a blurb`);
    // Shown to the learner: "which of these is least effort" is the useful
    // question when you are already tired.
    assert.ok(entry.load, `${entry.id}: needs to say what it asks of you`);
    assert.ok(entry.why, `${entry.id}: needs to say why it is in the list`);
  }
  assert.ok(
    breaks.BREAKS.filter((entry) => entry.load === 'no effort').length >= 2,
    'most of the menu has to be genuinely restful, or it is not a break',
  );
});

test('breaks: renderBreak knows every declared break', () => {
  // A break in the list with no renderer is a menu entry that does nothing.
  for (const entry of breaks.BREAKS) {
    assert.notEqual(typeof breaks.renderBreak, 'undefined');
  }
  assert.equal(breaks.breakById('trace')?.title, 'Trace the dots');
  assert.equal(breaks.breakById('nope'), null);
});

/* ------------------------------------------------------------------ trace */

/** A deterministic stand-in for Math.random, so a failure can be reproduced. */
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test('trace: every generated puzzle can actually be finished', () => {
  // The one failure that would make this worse than no break at all. The
  // puzzle is cut from a real path, so the path it was cut from is a solution.
  for (let seed = 1; seed <= 200; seed += 1) {
    const puzzle = breaks.tracePuzzle(seeded(seed));
    assert.ok(puzzle, `seed ${seed} produced no puzzle`);
    assert.equal(puzzle.dots.length, breaks.TRACE_DOTS);
    assert.ok(
      breaks.traceSolved(puzzle.solution, puzzle.dots),
      `seed ${seed}: the walk it was generated from is not accepted as a solution`,
    );
  }
});

test('trace: the dots are distinct and inside the grid', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const { dots } = breaks.tracePuzzle(seeded(seed));
    const keys = new Set(dots.map((dot) => `${dot.x},${dot.y}`));
    assert.equal(keys.size, dots.length, `seed ${seed}: two dots share a cell`);
    for (const dot of dots) {
      assert.ok(dot.x >= 0 && dot.x < breaks.TRACE_SIZE && dot.y >= 0 && dot.y < breaks.TRACE_SIZE);
    }
  }
});

test('trace: a path that jumps, doubles back, or misses a dot is not a solution', () => {
  const dots = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ];
  // Diagonal / non-adjacent step.
  assert.equal(breaks.traceSolved([{ x: 0, y: 0 }, { x: 2, y: 0 }], dots), false);
  // Re-uses a cell.
  assert.equal(
    breaks.traceSolved([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], dots),
    false,
  );
  // Never reaches the second dot.
  assert.equal(breaks.traceSolved([{ x: 0, y: 0 }, { x: 1, y: 0 }], dots), false);
  // Clean.
  assert.equal(breaks.traceSolved([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], dots), true);
});

test('trace: the dots have to be reached in order', () => {
  const dots = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ];
  // Visits both, but touches the second before the first.
  const backwards = [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }];
  assert.equal(breaks.traceSolved(backwards, dots), false);
});

test('trace: an empty path is not a solution', () => {
  assert.equal(breaks.traceSolved([], [{ x: 0, y: 0 }]), false);
});

/* ------------------------------------------------------- the CSS it needs */

test('css: every custom property the stylesheets use is actually defined', () => {
  // An undefined `var()` does not error and does not warn. The whole
  // declaration falls back to its initial value, so `border: 1px solid
  // var(--line)` silently becomes no border at all — which is how the trace
  // board shipped as an invisible grid. Four token names were wrong
  // (`--line`, `--ink`, `--r2`) and nothing anywhere said so.
  const fs = require('node:fs');
  const dir = path.join(ROOT, 'app', 'css');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.css'));

  const defined = new Set();
  const used = new Map();
  for (const name of files) {
    const css = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]);
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!used.has(match[1])) used.set(match[1], name);
    }
  }

  // A property may also be set from script — Amelie positions her confetti
  // that way, and the trace grid gets its column count that way. Those are
  // definitions too, so the scan has to see them or it reports false alarms.
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const js = fs.readFileSync(full, 'utf8');
        for (const match of js.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) defined.add(match[1]);
        for (const match of js.matchAll(/['"`](--[\w-]+)['"`]\s*:/g)) defined.add(match[1]);
      }
    }
  };
  walk(path.join(ROOT, 'app', 'js'));

  const missing = [...used.entries()].filter(([token]) => !defined.has(token));
  assert.deepEqual(
    missing.map(([token, file]) => `${token} (${file})`),
    [],
    'these custom properties are used but never defined',
  );
});

test('css: the break styles are present, since the markup depends on them', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(path.join(ROOT, 'app', 'css', 'components.css'), 'utf8');
  for (const selector of ['.brk__grid', '.brk__cell', '.brk__ring', '.brk__timer', '.brk__choice']) {
    assert.ok(css.includes(selector), `${selector} has no styles`);
  }
});
