/**
 * Pairs — the optional matching game.
 *
 * A board of face-down tiles: half Luxembourgish words, half English glosses.
 * Turn two, keep them if they belong together. It is the lightest thing in the
 * app on purpose — something to play in a queue that still leaves vocabulary
 * behind, rather than a drill that has to be earned.
 *
 * Two deliberate limits, both stated in the UI so they cannot read as bugs:
 *
 * It does not touch the Leitner boxes. Matching a word against a handful of
 * visible alternatives is far easier than producing it, and letting an easy
 * win promote a word would push its next review further out than the evidence
 * supports — the spaced-repetition schedule the exam plan rests on would drift
 * without anything looking wrong.
 *
 * It does not score duel points, for the same reason in a different currency:
 * a matching board is the cheapest activity in the app, and if it paid out,
 * the fastest way to win the week would be to stop doing the hard parts. It
 * does count for the daily streak, because it is genuinely practice.
 *
 * Levels walk the same ordering as the Learn path — sentence skeleton first,
 * then by how often a word actually occurs — so level 1 is `ech` and `net`,
 * not a random pair of A2 nouns.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { loadVocab, loadVerbs } from '../content.js';
import { getPairsProgress, savePairsResult, touchStreak } from '../store.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';

/**
 * Board size by level: 5 pairs, growing to 14. Capped because the whole board
 * has to stay visible on a phone — remembering where a tile was is the entire
 * game, and a board you have to scroll past takes that away.
 *
 * The cap is measured, not guessed, and the binding case is the *small* phone.
 * A tall iPhone (393x852) has room for 18 pairs; a 360x640 Android does not.
 * 28 tiles in seven rows of four clears the tab bar on both, given the
 * viewport-tracking tile height in `.pairs__tile`. The walkthrough asserts the
 * largest board still fits rather than leaving that as a comment.
 */
const MIN_PAIRS = 5;
const MAX_PAIRS = 14;
const LEVELS_PER_STEP = 2;

/** How long a wrong pair stays visible before turning back. */
const FLIP_BACK_MS = 900;

/**
 * How long the finished board stays up before the win card replaces it.
 *
 * Without this the last pair is matched and gone in the same frame, so the one
 * word you just worked hardest for is the one you never get to read.
 */
const WIN_HOLD_MS = 1100;

/**
 * Longest text a tile can hold and still be readable.
 *
 * Tiles are ~85px wide on a phone, and some LOD glosses are a full
 * disambiguation — "(female) pupil [primary or secondary school student,
 * college student]" is 69 characters and would render as an unreadable block.
 * Excluding them costs 18 of 1,829 words and no foundation vocabulary at all.
 */
const MAX_TILE_CHARS = 20;

export function pairsForLevel(level) {
  return Math.min(MAX_PAIRS, MIN_PAIRS + Math.floor((level - 1) / LEVELS_PER_STEP));
}

/** Where in the ordered pool a level starts — every previous level's words. */
export function offsetForLevel(level) {
  let offset = 0;
  for (let n = 1; n < level; n += 1) offset += pairsForLevel(n);
  return offset;
}

/**
 * Which sense wins when one spelling is two different words.
 *
 * LOD ships homographs as separate entries — `awer` is both an adverb
 * ("nevertheless") and a conjunction ("but"), `no` both an adjective
 * ("nearby") and a preposition ("after"). A tile can only carry one gloss, so
 * the pool has to pick, and left to itself it picked the wrong one on every
 * word below.
 *
 * The reason is a frequency bug one layer down, in `pipeline/lib/frequency.js`.
 * It counts surface forms against `lexicon.forms`, which maps a spelling to
 * exactly *one* entry id — so every one of the 209 occurrences of `no` in the
 * corpus is credited to the adjective and the preposition is left on zero.
 * The artefact then wins the sort, and the everyday sense of the word sorts
 * near the bottom of the deck. Same for `fir` (1035 occurrences all to the
 * conjunction, "for" on zero) and `un` (315 to the adverb, "on" on zero).
 *
 * Fixing the count properly needs the corpus part-of-speech tagged, which is
 * not something this pipeline can do honestly. So the *display* choice is
 * corrected here instead, by hand, for the words where the automatic pick is
 * plainly wrong for a beginner.
 *
 * Every value below is a gloss LOD itself publishes for that lemma — this
 * selects between real senses, it does not write new ones, and
 * `pairs.test.js` fails if any of them stops matching a shipped entry.
 * Left alone deliberately: `hunn` ("to have", not "cock"), `iessen` ("to eat",
 * not "meal"), `an` ("and", not "in") and the rest, where the automatic pick
 * is already the sense a learner wants.
 */
export const PREFERRED_GLOSS = {
  awer: 'but', // not "nevertheless"
  ginn: 'to give', // the bare infinitive; "there is" is the et gëtt construction
  no: 'after', // not "nearby" — and it is one of the four dative prepositions
  fir: 'for', // not "to"
  un: 'on', // not "to be on"
  mee: 'but', // not "May"
  puer: '(a) few', // "e puer" — not "pair"
  grad: 'right now', // not "degree"
};

/**
 * The word pool, most basic first.
 *
 * Deduplicated on both sides. Two tiles reading "no" (`keen` and `keng` both
 * gloss that way) would make a board with no correct answer — the player
 * cannot know which one is wanted, and one of the two can never be matched.
 * The same applies to a repeated Luxembourgish lemma.
 */
export function orderedPairPool(vocab, verbs) {
  const words = [
    ...vocab.map((item) => ({ id: item.id, lb: item.lb, en: item.en, stage: item.stage, rank: item.rank })),
    ...verbs.map((item) => ({ id: item.id, lb: item.infinitive, en: item.en, stage: item.stage, rank: item.rank })),
  ].filter((word) => word.lb && word.en && word.lb.length <= MAX_TILE_CHARS && word.en.length <= MAX_TILE_CHARS);

  words.sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9) || (a.rank ?? 0) - (b.rank ?? 0));

  // Which entry represents each spelling — the named sense where there is one,
  // otherwise the first as before. Chosen up front and separately from the
  // walk below, so that picking a different *sense* never moves the *word*:
  // a lemma still enters the pool at the position its earliest entry earned,
  // and levels stay exactly where they were.
  const chosen = new Map();
  for (const word of words) {
    const lb = word.lb.toLowerCase();
    const wanted = PREFERRED_GLOSS[lb];
    const current = chosen.get(lb);
    if (!current) chosen.set(lb, word);
    else if (wanted && word.en === wanted && current.en !== wanted) chosen.set(lb, word);
  }

  const seenLb = new Set();
  const seenEn = new Set();
  const pool = [];
  for (const word of words) {
    const lb = word.lb.toLowerCase();
    if (seenLb.has(lb)) continue;
    const pick = chosen.get(lb);
    const en = pick.en.toLowerCase();
    if (seenEn.has(en)) continue;
    seenLb.add(lb);
    seenEn.add(en);
    pool.push(pick);
  }
  return pool;
}

/** The words for one level, or null once the pool runs out. */
export function wordsForLevel(pool, level) {
  const offset = offsetForLevel(level);
  const size = pairsForLevel(level);
  if (offset + size > pool.length) return null;
  return pool.slice(offset, offset + size);
}

/** How many levels the deck can actually fill. */
export function totalLevels(poolSize) {
  let level = 1;
  while (offsetForLevel(level) + pairsForLevel(level) <= poolSize) level += 1;
  return level - 1;
}

export async function render(root, { params, settings, navigate }) {
  const [vocab, verbs, progress] = await Promise.all([loadVocab(), loadVerbs(), getPairsProgress(settings.playerId)]);
  const pool = orderedPairPool(vocab, verbs);
  const maxLevel = totalLevels(pool.length);

  const requested = params?.[0] ? Number(params[0]) : null;
  // An out-of-range level in the URL falls back to where the player actually
  // is, rather than rendering an empty board.
  const level =
    requested && requested >= 1 && requested <= maxLevel ? requested : Math.min(progress.level ?? 1, maxLevel);

  const words = wordsForLevel(pool, level);
  if (!words) {
    root.append(
      screenHead({ title: 'Pairs', back: '#/learn' }),
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'Every level is finished — that is the whole deck matched.'),
        button('Back to Learn', { variant: 'secondary', onclick: () => navigate('#/learn') }),
      ),
    );
    return { destroy() {} };
  }

  root.append(
    screenHead({
      title: `Pairs · level ${level}`,
      sub: `${plural(words.length, 'pair')} · ${maxLevel} levels in all`,
      back: '#/learn',
    }),
  );

  const body = el('div', { class: 'stack stack--lg' });
  root.append(body);
  playLevel({ body, words, level, maxLevel, settings, navigate, progress });

  return { destroy() {} };
}

/* ------------------------------------------------------------------ board */

function playLevel({ body, words, level, maxLevel, settings, navigate, progress }) {
  const tiles = shuffle(
    words.flatMap((word) => [
      { key: `${word.id}:lb`, pairId: word.id, side: 'lb', text: word.lb },
      { key: `${word.id}:en`, pairId: word.id, side: 'en', text: word.en },
    ]),
  );

  /** @type {Array<{tile: object, node: HTMLElement}>} */
  let turned = [];
  const matched = new Set();
  let moves = 0;
  let locked = false;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say('Turn two tiles. Keep the ones that belong together.', 'idle');

  const movesLabel = el('span', { class: 'chip' }, '0 moves');
  const board = el('div', { class: 'pairs' });

  const nodes = new Map(
    tiles.map((tile) => [
      tile.key,
      el(
        'button',
        {
          type: 'button',
          class: `pairs__tile pairs__tile--${tile.side}`,
          'aria-label': 'Face-down tile',
          onclick: () => turn(tile),
        },
        el('span', { class: 'pairs__face' }, tile.text),
      ),
    ]),
  );

  fill(
    board,
    ...tiles.map((tile) => nodes.get(tile.key)),
  );

  fill(
    body,
    el(
      'div',
      { class: 'row row--between' },
      el('span', { class: 'meter__label' }, `${matched.size / 2} of ${words.length} found`),
      movesLabel,
    ),
    board,
    el('div', { class: 'card' }, amelie.el),
  );

  const foundLabel = () => body.querySelector('.meter__label');

  function turn(tile) {
    if (locked || matched.has(tile.pairId)) return;
    const node = nodes.get(tile.key);
    if (node.classList.contains('is-up')) return;

    node.classList.add('is-up');
    node.setAttribute('aria-label', tile.text);
    turned.push({ tile, node });
    if (turned.length < 2) return;

    moves += 1;
    movesLabel.textContent = plural(moves, 'move');
    const [first, second] = turned;

    if (first.tile.pairId === second.tile.pairId) {
      matched.add(first.tile.pairId);
      for (const { node: found } of turned) found.classList.add('is-found');
      turned = [];
      foundLabel().textContent = `${matched.size} of ${words.length} found`;
      chimeCorrect();
      amelie.say(pick(['Yes.', 'That is a pair.', 'Good.']), 'celebrating');
      if (matched.size === words.length) win();
      return;
    }

    // Wrong: both stay visible long enough to be read, which is where the
    // learning in a matching game actually happens.
    locked = true;
    resetChimeStreak();
    amelie.say('Not a pair — remember where they were.', 'encouraging');
    setTimeout(() => {
      for (const { node: wrong } of turned) {
        wrong.classList.remove('is-up');
        wrong.setAttribute('aria-label', 'Face-down tile');
      }
      turned = [];
      locked = false;
    }, FLIP_BACK_MS);
  }

  async function win() {
    locked = true;
    touchStreak(settings.playerId);
    const saved = await savePairsResult(settings.playerId, level, { moves });

    // Let the completed board sit for a moment. The last pair turned face-up
    // in the same instant the win card used to replace it, which meant the
    // word you had just spent the most turns hunting was the one word you
    // never actually read.
    amelie.say('That is the board.', 'celebrating');
    await new Promise((resolve) => setTimeout(resolve, WIN_HOLD_MS));
    const perfect = moves === words.length;
    const previousBest = progress.best?.[level];

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(AMELIE_LINES.pairsSetDone);

    const nextLevel = level + 1 <= maxLevel ? level + 1 : null;

    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, `Level ${level} cleared`),
          el('p', { class: 'meter__value' }, plural(moves, 'move')),
          el(
            'p',
            { class: 'card__note' },
            perfect
              ? 'Not one wrong turn.'
              : previousBest !== undefined && moves < previousBest
                ? `Your best yet — ${previousBest} last time.`
                : `${words.length} would be perfect.`,
          ),
        ),
        // The words themselves, in full. A matching game where the board
        // vanishes the moment you finish teaches nothing on the way out — this
        // is the one moment the learner is looking at exactly the set they
        // just worked through, so it is worth writing down.
        el(
          'div',
          { class: 'card' },
          el('p', { class: 'meter__label' }, 'What you matched'),
          el(
            'div',
            { style: { marginBlockStart: 'var(--s2)' } },
            ...words.map((word) =>
              el(
                'div',
                { class: 'ref-frame' },
                el('span', { style: { fontWeight: '700' } }, word.lb),
                el('span', { class: 'card__note' }, word.en),
              ),
            ),
          ),
        ),
        nextLevel
          ? button(`Level ${nextLevel}`, {
              variant: 'primary',
              class: 'btn btn--primary btn--block',
              onclick: () => navigate(`#/pairs/${nextLevel}`),
            })
          : el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'That was the last level.'),
        button('Play this level again', {
          variant: 'secondary',
          class: 'btn btn--secondary btn--block',
          onclick: () => navigate(`#/pairs/${level}`),
        }),
        button('Back to Learn', {
          variant: 'secondary',
          class: 'btn btn--secondary btn--block',
          onclick: () => navigate('#/learn'),
        }),
        el(
          'p',
          { class: 'source-note' },
          `Unlocked to level ${saved.level}. Pairs is practice: it counts for your streak, but it does not move your review schedule or the duel score — matching a word is much easier than saying it.`,
        ),
      ),
    );
  }
}

/* ----------------------------------------------------------------- helpers */

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}
