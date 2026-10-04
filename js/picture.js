/**
 * Describing a picture — the words, and where things are.
 *
 * Part 2b of the speaking exam is: three photographs are offered, you describe
 * one. The app could already practise that — record yourself against a photo —
 * but nothing taught what a description is made of, which is two things and
 * only two:
 *
 *   naming      the clothes, the body, the colours, the weather, what is
 *               outside in nature and in the town
 *   placing     uewen, ënnen, lénks, riets, an der Mëtt, niewent, virun,
 *               hannert, iwwer, ënner
 *
 * So the section is six word fields and one position round, and it ends with
 * a link into the speaking task, because the point of knowing the words is to
 * stand in front of an examiner and use them.
 *
 * ## Why the questions come in three shapes
 *
 * `lb → en` is recognition and is the easy half: four English meanings, pick
 * one. `en → lb` is production, which is what the exam actually scores — you
 * cannot describe a photograph by recognising words. And where the deck has a
 * photograph of the thing itself, the question is the photograph, which is as
 * close to the exam task as a four-option card can get.
 *
 * Like the other side games this keeps its own progress and does not move the
 * Leitner boxes — see `app/js/screens/adjectives.js` for that argument.
 */

import { seeded, shuffle } from './sentences.js';
import { joinArticle } from './drill/cards.js';

/** How many questions one round asks. */
export const ROUND = 10;

export const fieldById = (deck, id) => (deck.fields ?? []).find((field) => field.id === id) ?? null;

/** The rounds the index offers: the six fields, then position. */
export const POSITION = 'position';

/**
 * One word question.
 *
 * Wrong answers are drawn from the same field, so the four options are four
 * things of the same kind — four colours, four garments. Across fields they
 * would be a sorting puzzle rather than a vocabulary question: nobody has to
 * know what `Mutz` means to rule out `Reen`.
 */
export function wordQuestion(word, field, { random, shape = null }) {
  const pool = field.words.filter((one) => one.id !== word.id);
  const pick = (list, count, key) => {
    const seen = new Set([key(word)]);
    const out = [];
    for (const one of shuffle(list, random)) {
      const value = key(one);
      if (seen.has(value)) continue;
      seen.add(value);
      out.push(value);
      if (out.length === count) break;
    }
    return out;
  };

  // A photograph of the thing is the best question this deck can ask, so it is
  // asked whenever there is one — but only of a word that has it, and the
  // round decides that, not the caller.
  const kind = shape ?? (word.imageUrl ? 'image' : 'recall');

  if (kind === 'image') {
    const wrong = pick(pool, 3, (one) => one.lb);
    return {
      kind,
      imageUrl: word.imageUrl,
      prompt: null,
      instruction: 'What is this?',
      answer: word.lb,
      options: shuffle([word.lb, ...wrong], random),
      word,
    };
  }

  if (kind === 'recall') {
    const wrong = pick(pool, 3, (one) => one.lb);
    return {
      kind,
      prompt: word.en,
      instruction: 'Say it in Luxembourgish',
      answer: word.lb,
      options: shuffle([word.lb, ...wrong], random),
      word,
    };
  }

  const wrong = pick(pool, 3, (one) => one.en);
  return {
    kind: 'meaning',
    // `d'Blumm` and `de Schong`: the clitic article joins the noun, the
    // others stand off it. The helper the vocabulary cards already use.
    prompt: word.article ? joinArticle(word.article, word.lb) : word.lb,
    instruction: 'What does it mean?',
    answer: word.en,
    options: shuffle([word.en, ...wrong], random),
    word,
  };
}

/**
 * One position question: a real LOD sentence with the position word taken out.
 *
 * Cut by offset rather than by replacing the word — `uewen` and `ënnen` are
 * short and can occur twice in the same sentence, and a blind replace would
 * blank the wrong one.
 */
export function placementQuestion(placement, positions, { random }) {
  const answer = positions.find((one) => one.id === placement.positionId);
  const wrong = shuffle(positions.filter((one) => one.id !== placement.positionId), random)
    .slice(0, 3)
    .map((one) => one.lb);
  return {
    kind: 'placement',
    prompt: gapped(placement),
    instruction: 'Which word says where it is?',
    answer: placement.form,
    // The options are lemmas and the answer is this sentence's spelling of
    // one. They are the same for every position word in the deck — all of them
    // are invariable — and a test holds that, because the day one is not, the
    // answer would be the only option wearing an ending.
    options: shuffle([placement.form, ...wrong], random),
    sentence: placement.lb,
    audioId: placement.audioId ?? null,
    english: answer?.en ?? null,
  };
}

/** The sentence with the position word taken out. */
export function gapped(placement) {
  return {
    before: placement.lb.slice(0, placement.at),
    after: placement.lb.slice(placement.at + placement.form.length),
  };
}

/** What a round of this kind can ask about. */
export function poolFor(id, deck) {
  if (id === POSITION) return deck.placements ?? [];
  return fieldById(deck, id)?.words ?? [];
}

/**
 * A round: what has not been answered yet, then the rest to top up.
 *
 * Seeded per player and field, so leaving and coming back does not reshuffle
 * the same ten questions into a different ten.
 */
export function buildRound(id, pool, done, { size = ROUND, seed = 'pic' } = {}) {
  const seen = done instanceof Set ? done : new Set(done ?? []);
  if (pool.length === 0) return [];
  const random = seeded(seed);
  const fresh = shuffle(pool.filter((one) => !seen.has(doneKey(id, one))), random);
  const again = shuffle(pool.filter((one) => seen.has(doneKey(id, one))), random);
  return [...fresh, ...again].slice(0, size);
}

/**
 * Which shape each question of a round takes.
 *
 * Not random: a round that asked ten meanings would be ten easy questions, and
 * one that asked ten recalls would be ten hard ones. Every word is asked the
 * way it can be — a photograph where there is one — and the rest alternate, so
 * a round is always half recognition and half production.
 */
export function shapesFor(plan) {
  let production = false;
  return plan.map((word) => {
    if (word.imageUrl) return 'image';
    production = !production;
    return production ? 'recall' : 'meaning';
  });
}

/** `field:id`, which is how a finished question is remembered. */
export const doneKey = (id, item) => `${id}:${item.id}`;

/** How far through each field you are. */
export function progress(deck, done) {
  const seen = done instanceof Set ? done : new Set(done ?? []);
  const rows = (deck.fields ?? []).map((field) => ({
    id: field.id,
    title: field.title_en,
    blurb: field.blurb,
    cue: field.cue,
    total: field.words.length,
    finished: field.words.filter((word) => seen.has(doneKey(field.id, word))).length,
  }));
  const placements = deck.placements ?? [];
  rows.push({
    id: POSITION,
    title: 'Where things are',
    blurb: 'Real sentences that put one thing beside, behind or above another.',
    cue: '📍',
    total: placements.length,
    finished: placements.filter((one) => seen.has(doneKey(POSITION, one))).length,
  });
  return rows;
}
