/**
 * Sentence Builder — say it in Luxembourgish, one word tile at a time.
 *
 * The only exercise in the app that asks for a **whole sentence**. Everything
 * else tests a word, a form or a choice between four; this is the one that
 * makes you produce the thing the Sproochentest actually asks for, which is an
 * answer to a question in front of a person.
 *
 * ## Why tiles rather than typing
 *
 * Typing a nine-word Luxembourgish sentence on a phone is a keyboard test, not
 * a language test — `ë`, `é` and `ä` are a long-press each, and a learner who
 * knows the sentence perfectly still loses to autocorrect. Tiles put the whole
 * of the difficulty where it belongs: which words, in which order. Word order
 * is the thing an English speaker is actually marked down on.
 *
 * ## Where the sentences come from
 *
 * Two files, and the split is provenance, not convenience — see
 * `pipeline/build-sentences.js`. `sentences.json` is LOD's own example
 * sentences, corpus-validated. `sentence-answers.json` is real Sproochentest
 * answers written by a human tutor, and those carry the question they answer,
 * so the card can ask "How would you answer this?" rather than "translate
 * this". Not one word of Luxembourgish in either file was written by this app.
 */

import { normalise, stripDiacritics } from './drill/match.js';

/** How many sentences one round asks for. */
export const ROUND = 8;

/**
 * Extra word tiles beyond the sentence's own.
 *
 * Without them the exercise degrades into an anagram you can finish by
 * elimination — with the last two tiles there is only one place left to put
 * them. Decoys mean every tile is a decision. Four is enough to remove the
 * end-game certainty without turning the bank into a wall.
 */
export const DECOYS = 4;

/* ------------------------------------------------------------ the round */

/**
 * A deterministic shuffle, seeded from a string.
 *
 * Seeded rather than random so a sentence's tiles land the same way for both
 * players and on every reload — a learner who leaves mid-round and comes back
 * to a different arrangement has to re-read the whole bank — and so the tests
 * can assert on an actual arrangement.
 */
export function seeded(seed) {
  let hash = 0;
  for (let i = 0; i < String(seed).length; i += 1) hash = (Math.imul(31, hash) + String(seed).charCodeAt(i)) | 0;
  let state = hash >>> 0 || 1;
  return () => {
    // xorshift32 — small, fast, and good enough to shuffle a dozen tiles.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

export function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The words of a sentence, as tiles are cut: on whitespace, punctuation kept. */
export const wordsOf = (sentence) => String(sentence ?? '').trim().split(/\s+/).filter(Boolean);

/**
 * The tiles for one sentence: its own words, plus decoys, shuffled.
 *
 * Decoys are drawn from *other sentences on the same topic*, so every tile on
 * screen is a real Luxembourgish word in a plausible register — a decoy pulled
 * from a different topic reads as obviously foreign to the sentence and gets
 * eliminated without being thought about.
 *
 * A decoy is never a word the sentence already uses, case-insensitively.
 * Otherwise the learner places it, the sentence is right, and the check fails
 * on a tile that was indistinguishable from the correct one.
 */
export function tilesFor(item, pool, { decoys = DECOYS } = {}) {
  const own = wordsOf(item.lb);
  const taken = new Set(own.map((word) => normalise(word)));

  const candidates = [];
  for (const other of pool ?? []) {
    if (other.id === item.id || other.topic !== item.topic) continue;
    for (const word of wordsOf(other.lb)) {
      const key = normalise(word);
      if (!key || taken.has(key)) continue;
      // A decoy has to be a word. Sentences carry the odd bare numeral — "Ech
      // liese mindestens 2 oder 3 Bicher de Mount" — and a tile reading "2"
      // beside eight Luxembourgish words is not a decoy, it is a typo the
      // learner has to reason about.
      if (!/\p{Letter}/u.test(word)) continue;
      taken.add(key);
      candidates.push(word);
    }
  }

  const random = seeded(item.id);
  const chosen = shuffle(candidates, random).slice(0, decoys);
  const tiles = shuffle(
    [...own.map((word, at) => ({ id: `w${at}`, word })), ...chosen.map((word, at) => ({ id: `d${at}`, word, decoy: true }))],
    random,
  );
  return { tiles, answer: item.lb };
}

/* ----------------------------------------------------------- the marking */

/**
 * Is the built sentence the published one?
 *
 * Diacritics are forgiven the same way `checkTyped` forgives them elsewhere in
 * the app — except that here they cannot actually go wrong, because the tiles
 * carry the spelling. What this really guards is the join: tiles are compared
 * as one string so that punctuation attached to a word ("Jo,") lines up.
 */
export function checkBuilt(picked, answer) {
  const given = picked.map((tile) => tile.word).join(' ');
  if (normalise(given) === normalise(answer)) return { correct: true, given };
  if (stripDiacritics(given) === stripDiacritics(answer)) return { correct: true, given };
  return { correct: false, given };
}

/**
 * Which tiles are in the right place, for marking a wrong answer.
 *
 * Position by position against the published sentence. A learner who put seven
 * of nine words right has done something quite different from one who guessed,
 * and showing which two moved is the feedback that teaches word order — "wrong"
 * on its own teaches nothing about where the verb should have gone.
 */
export function markPlaces(picked, answer) {
  const want = wordsOf(answer);
  return picked.map((tile, at) => normalise(tile.word) === normalise(want[at] ?? ''));
}

/* ---------------------------------------------------------- what is next */

/** Every topic that has sentences, with how many and how many are done. */
export function topicProgress(items, done) {
  const seen = done instanceof Set ? done : new Set(done ?? []);
  const byTopic = new Map();
  for (const item of items ?? []) {
    const row = byTopic.get(item.topic) ?? { topic: item.topic, total: 0, finished: 0, answers: 0 };
    row.total += 1;
    if (seen.has(item.id)) row.finished += 1;
    if (item.source === 'model-answers') row.answers += 1;
    byTopic.set(item.topic, row);
  }
  return [...byTopic.values()].sort((a, b) => b.total - a.total);
}

/**
 * The next round: unfinished sentences first, then finished ones to top up.
 *
 * Topping up rather than stopping is deliberate. This is a set to work through,
 * not a scheduler — but a learner who has finished a topic and taps it again
 * should get practice, not an empty screen telling them they are done.
 *
 * Within the unfinished ones, the exam answers come first, and among those the
 * ones that *open* an answer come first again. They are the reason the activity
 * exists; a round that opens on four dictionary examples buries the thing the
 * learner is actually preparing for, and one that opens on the third sentence
 * of somebody's reply reads as a non sequitur.
 */
export function buildRound(items, done, { topic = null, size = ROUND, seed = 'round' } = {}) {
  const seen = done instanceof Set ? done : new Set(done ?? []);
  const pool = (items ?? []).filter((item) => !topic || item.topic === topic);
  if (pool.length === 0) return [];

  const rank = (item) => (item.source !== 'model-answers' ? 2 : item.opensAnswer ? 0 : 1);
  const fresh = pool.filter((item) => !seen.has(item.id)).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const again = shuffle(pool.filter((item) => seen.has(item.id)), seeded(seed));

  return [...fresh, ...again].slice(0, size);
}

/** A short, honest label for where a sentence came from. */
export const sourceLabel = (item) =>
  item?.source === 'model-answers' ? 'A real exam answer' : 'A Luxembourgish dictionary sentence';
