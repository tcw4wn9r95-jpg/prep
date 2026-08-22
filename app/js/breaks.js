/**
 * The mid-session breaks — offered a third and two thirds of the way through
 * the day's goal.
 *
 * ## What the evidence actually says, and why these are not Zip clones
 *
 * The brief was "games to reset the brain, like LinkedIn's Zip or Patches, but
 * also look for science backed small games". Those two things pull in opposite
 * directions, and the research is unusually clear about which way to lean.
 *
 * Break activities that are **high in executive control and produce tension
 * rather than relaxation** measurably *harm* the cognitive task that follows;
 * that is the finding from the n-back work comparing wakeful rest, music and
 * video gaming (Rieger & Kämpfe). Attention Restoration Theory says the same
 * thing from the other end: directed attention recovers when the break makes
 * few demands on directed attention. A timed constraint-satisfaction puzzle is
 * the opposite of that — it draws on exactly the resource the drill just spent.
 *
 * The one thing casual games clearly *do* give is **affect**. Rupp et al.
 * (2017) found casual play beat a passive break on mood and engagement while
 * the passive break "prevented cognitive restoration". And a break nobody takes
 * restores nothing, so mood is not a soft concern — it is the adherence
 * mechanism.
 *
 * So: **Zip's format, not Zip's load.** Small, self-contained, one screen,
 * finished in under a minute, visual rather than verbal — and deliberately
 * low-arousal, with no timer to race and nothing to fail. Three of the four
 * make almost no demand at all; `trace` is the one concession to wanting a
 * game, and it is defanged on purpose (no clock, no fail state, always
 * solvable).
 *
 * ## Why none of them is about Luxembourgish
 *
 * Asked for, and right anyway. Both the drill and any word game run through
 * the same verbal system, so a language mini-game is not a break from language
 * — it is more of the task wearing a different hat. Everything here is spatial,
 * postural or respiratory.
 *
 * ## Sources
 *
 * - Lee, Williams, Sargent, Williams & Johnson (2015), *40-second green roof
 *   views sustain attention*, J. Environmental Psychology — the shortest
 *   restorative micro-break with a measured effect on sustained attention.
 * - Rieger & Kämpfe (2015), *Differential effects of wakeful rest, music and
 *   video game playing on working memory performance in the n-back task*.
 * - Rupp, Sweetman, Sosa, Smither & McConnell (2017), *Searching for Affective
 *   and Cognitive Restoration*, Human Factors.
 * - Albulescu et al. (2022), *"Give me a break!"*, PLOS ONE — meta-analysis:
 *   even very short pauses beat none, and the segmentation itself helps.
 */

import { el, button } from './dom.js';

/** Where in the day's goal a break is offered, as a fraction. */
export const CHECKPOINTS = [1 / 3, 2 / 3];

/**
 * The card counts at which a break is due, for a given daily goal.
 *
 * Rounded up and deduplicated: on the 15-card goal a third and two thirds are
 * 5 and 10, but nothing stops a future goal being small enough that the two
 * land on the same card, and offering the same break twice in a row is worse
 * than offering it once.
 */
export function checkpointsFor(goal) {
  const marks = CHECKPOINTS.map((share) => Math.ceil(goal * share)).filter((mark) => mark >= 1);
  return [...new Set(marks)];
}

/**
 * Which checkpoint a session has just crossed, or null.
 *
 * Measured against the *day*, not the session, because the goal is a daily one
 * and two short sessions should not each offer both breaks. `taken` is the
 * marks already offered today.
 */
export function dueCheckpoint({ before, after, goal, taken = [] }) {
  for (const mark of checkpointsFor(goal)) {
    if (taken.includes(mark)) continue;
    if (before < mark && after >= mark) return mark;
  }
  return null;
}

/**
 * The four breaks, easiest first.
 *
 * `load` is what the activity asks of directed attention, and it is shown to
 * the learner rather than kept as an implementation note — picking a break is
 * itself a decision, and "which of these is the least effort" is the useful
 * axis when you are already tired.
 */
export const BREAKS = [
  {
    id: 'distance',
    title: 'Look far away',
    blurb: 'Twenty seconds looking at the furthest thing you can see.',
    load: 'no effort',
    seconds: 20,
    why: 'The shortest break with a measured effect on sustained attention is about this long, and looking into the distance relaxes the focusing muscle a screen keeps tensed.',
  },
  {
    id: 'breath',
    title: 'Breathe square',
    blurb: 'In for four, hold, out for four, hold. Three rounds.',
    load: 'no effort',
    seconds: 48,
    why: 'Slow paced breathing lowers arousal, and low arousal is the state the next block of learning wants — the opposite of what a race against a clock leaves behind.',
  },
  {
    id: 'stretch',
    title: 'Stand and stretch',
    blurb: 'Three slow moves, fifteen seconds each.',
    load: 'no effort',
    seconds: 45,
    why: 'Movement without anything to work out is the break the research keeps landing on. Standing up also breaks the posture, which is doing you no favours either.',
  },
  {
    id: 'trace',
    title: 'Trace the dots',
    blurb: 'Join 1 to 4 without crossing your own path. No clock.',
    load: 'a little thinking',
    seconds: null,
    why: 'The one here that is actually a game. Kept deliberately gentle — a hard timed puzzle spends the same attention the drill just did, and measurably makes what follows worse.',
  },
];

export const breakById = (id) => BREAKS.find((entry) => entry.id === id) ?? null;

/* ------------------------------------------------------------------ timers */

/**
 * A ring that closes over `seconds`, with a caption underneath.
 *
 * Shared by the three timed breaks. Returns `{ el, destroy }` and calls
 * `onDone` once. `caption(elapsed)` decides what the middle says, which is how
 * the same ring serves a plain countdown and a four-phase breath cycle.
 */
function timerRing({ seconds, caption, onDone }) {
  const RADIUS = 54;
  const circumference = 2 * Math.PI * RADIUS;
  const track = el('circle', { cx: 60, cy: 60, r: RADIUS, class: 'brk__track' });
  const arc = el('circle', {
    cx: 60,
    cy: 60,
    r: RADIUS,
    class: 'brk__arc',
    'stroke-dasharray': String(circumference),
    'stroke-dashoffset': '0',
  });
  const label = el('p', { class: 'brk__label', role: 'status' }, caption(0));
  const svg = el('svg', { viewBox: '0 0 120 120', class: 'brk__ring', 'aria-hidden': 'true' }, track, arc);

  const started = Date.now();
  let frame = null;
  let finished = false;
  const tick = () => {
    const elapsed = Math.min(seconds, (Date.now() - started) / 1000);
    arc.setAttribute('stroke-dashoffset', String(circumference * (elapsed / seconds)));
    label.textContent = caption(elapsed);
    if (elapsed >= seconds) {
      if (!finished) {
        finished = true;
        onDone();
      }
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    el: el('div', { class: 'brk__timer' }, svg, label),
    destroy() {
      if (frame) cancelAnimationFrame(frame);
    },
  };
}

function distanceBreak(onDone) {
  return timerRing({
    seconds: 20,
    onDone,
    caption: (elapsed) => (elapsed >= 20 ? 'Done' : `${Math.ceil(20 - elapsed)}`),
  });
}

/** 4-4-4-4, three times round. */
const BREATH_PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];

function breathBreak(onDone) {
  return timerRing({
    seconds: 48,
    onDone,
    caption: (elapsed) => {
      if (elapsed >= 48) return 'Done';
      const phase = BREATH_PHASES[Math.floor(elapsed / 4) % 4];
      const left = 4 - (elapsed % 4);
      return `${phase} · ${Math.ceil(left)}`;
    },
  });
}

/**
 * Three moves, fifteen seconds each.
 *
 * Named as things to do with a body rather than exercises, and none of them
 * needs space or anyone not to be watching — this is meant to be doable at a
 * kitchen table halfway through a session.
 */
const STRETCHES = [
  'Roll your shoulders back, slowly',
  'Look left, then right, as far as is comfortable',
  'Stand up and reach for the ceiling',
];

function stretchBreak(onDone) {
  return timerRing({
    seconds: 45,
    onDone,
    caption: (elapsed) => {
      if (elapsed >= 45) return 'Done';
      const move = STRETCHES[Math.min(STRETCHES.length - 1, Math.floor(elapsed / 15))];
      return `${move} · ${Math.ceil(15 - (elapsed % 15))}`;
    },
  });
}

/* ------------------------------------------------------------------- trace */

export const TRACE_SIZE = 5;
export const TRACE_DOTS = 4;

const cellKey = (x, y) => `${x},${y}`;
const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/**
 * A path puzzle that is always solvable, because it is generated from a
 * solution.
 *
 * A self-avoiding random walk is grown across the grid, then four dots are
 * dropped along it in order. The walk itself is one answer, so the puzzle can
 * never be impossible — the failure mode a generated puzzle usually has, and
 * the one that would turn a break into a source of stress.
 *
 * Any valid path counts, not just the generated one. The rules are only:
 * steps are orthogonal, no cell is used twice, and the dots are reached in
 * order.
 */
export function tracePuzzle(random = Math.random) {
  const MIN_WALK = TRACE_SIZE * 2 + 2;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const start = { x: Math.floor(random() * TRACE_SIZE), y: Math.floor(random() * TRACE_SIZE) };
    const walk = [start];
    const used = new Set([cellKey(start.x, start.y)]);

    for (;;) {
      const last = walk[walk.length - 1];
      const options = [
        { x: last.x + 1, y: last.y },
        { x: last.x - 1, y: last.y },
        { x: last.x, y: last.y + 1 },
        { x: last.x, y: last.y - 1 },
      ].filter(
        (cell) =>
          cell.x >= 0 && cell.x < TRACE_SIZE && cell.y >= 0 && cell.y < TRACE_SIZE && !used.has(cellKey(cell.x, cell.y)),
      );
      if (options.length === 0) break;
      const next = options[Math.floor(random() * options.length)];
      walk.push(next);
      used.add(cellKey(next.x, next.y));
    }

    if (walk.length < MIN_WALK) continue;

    // Dots spread along the walk, first and last always included, so the
    // puzzle spans the board rather than clustering in one corner.
    const dots = [];
    for (let i = 0; i < TRACE_DOTS; i += 1) {
      const at = Math.round((i / (TRACE_DOTS - 1)) * (walk.length - 1));
      dots.push(walk[at]);
    }
    if (new Set(dots.map((dot) => cellKey(dot.x, dot.y))).size !== TRACE_DOTS) continue;
    return { dots, solution: walk };
  }
  // Every attempt produced a short walk — vanishingly unlikely, but a break
  // must never be the thing that throws.
  return null;
}

/**
 * Is this path a solution?
 *
 * Exported so the rule is testable without a DOM: the four dots in order,
 * every step orthogonal, no cell twice.
 */
export function traceSolved(path, dots) {
  if (path.length === 0) return false;
  const seen = new Set();
  for (const [index, cell] of path.entries()) {
    const key = cellKey(cell.x, cell.y);
    if (seen.has(key)) return false;
    seen.add(key);
    if (index > 0 && !adjacent(path[index - 1], cell)) return false;
  }
  let next = 0;
  for (const cell of path) {
    if (next < dots.length && cell.x === dots[next].x && cell.y === dots[next].y) next += 1;
  }
  return next === dots.length;
}

function traceBreak(onDone) {
  const puzzle = tracePuzzle();
  if (!puzzle) {
    onDone();
    return { el: el('p', { class: 'card__note' }, 'Take twenty seconds instead — look at the furthest thing you can see.'), destroy() {} };
  }
  const { dots } = puzzle;
  let path = [];
  let done = false;

  const status = el('p', { class: 'brk__label', role: 'status' }, 'Start on 1.');
  const cells = new Map();
  const grid = el('div', { class: 'brk__grid', style: { '--brk-cols': String(TRACE_SIZE) } });

  const dotAt = (x, y) => dots.findIndex((dot) => dot.x === x && dot.y === y);

  const paint = () => {
    for (const [key, node] of cells) {
      const on = path.some((cell) => cellKey(cell.x, cell.y) === key);
      node.classList.toggle('is-on', on);
      const last = path[path.length - 1];
      node.classList.toggle('is-head', Boolean(last) && cellKey(last.x, last.y) === key);
    }
    if (done) return;
    if (traceSolved(path, dots)) {
      done = true;
      status.textContent = 'Nice. That is the break.';
      onDone();
    } else {
      const next = dots.findIndex((dot, index) => {
        const reachedBefore = dots.slice(0, index).every((earlier) => path.some((cell) => cell.x === earlier.x && cell.y === earlier.y));
        return reachedBefore && !path.some((cell) => cell.x === dot.x && cell.y === dot.y);
      });
      status.textContent = path.length === 0 ? 'Start on 1.' : `Now reach ${next === -1 ? 'the last dot' : next + 1}.`;
    }
  };

  for (let y = 0; y < TRACE_SIZE; y += 1) {
    for (let x = 0; x < TRACE_SIZE; x += 1) {
      const number = dotAt(x, y);
      const cell = el(
        'button',
        {
          type: 'button',
          class: 'brk__cell',
          'aria-label': number >= 0 ? `Dot ${number + 1}` : `Cell ${x + 1}, ${y + 1}`,
          onclick: () => {
            if (done) return;
            const last = path[path.length - 1];
            // Tapping the head undoes it, which is the whole of "I went wrong"
            // — there is no fail state to recover from.
            if (last && last.x === x && last.y === y) path = path.slice(0, -1);
            else if (path.length === 0) {
              if (x !== dots[0].x || y !== dots[0].y) return;
              path = [{ x, y }];
            } else if (adjacent(last, { x, y }) && !path.some((cell2) => cell2.x === x && cell2.y === y)) {
              path = [...path, { x, y }];
            } else return;
            paint();
          },
        },
        number >= 0 ? String(number + 1) : '',
      );
      if (number >= 0) cell.classList.add('is-dot');
      cells.set(cellKey(x, y), cell);
      grid.append(cell);
    }
  }
  paint();

  return {
    el: el(
      'div',
      { class: 'brk__trace' },
      grid,
      status,
      button('Start over', {
        variant: 'secondary',
        onclick: () => {
          if (done) return;
          path = [];
          paint();
        },
      }),
    ),
    destroy() {},
  };
}

const RENDERERS = {
  distance: distanceBreak,
  breath: breathBreak,
  stretch: stretchBreak,
  trace: traceBreak,
};

/** Build one break's interactive body. `onDone` fires when it is finished. */
export function renderBreak(id, onDone) {
  const make = RENDERERS[id];
  return make ? make(onDone) : null;
}
