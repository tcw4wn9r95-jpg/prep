/**
 * Arcade — the fifteen sentence functions, as games.
 *
 * The decks teach words and the grammar deck teaches rules, but neither
 * answers the question a beginner actually has in a shop or an interview:
 * *how do I say that I want something?* That is a sentence function, and the
 * fifteen here are the ones that carry ordinary life — naming, existence,
 * having, wanting, requesting, ability, obligation, liking, opinion,
 * location, question words, quantity, negation, time and connectors.
 *
 * ## It costs nothing to play
 *
 * Deliberately outside every progress system in the app:
 *
 *   - **no Leitner writes.** Nothing here moves a review schedule, so playing
 *     for an hour cannot push a word's next review past the point the
 *     evidence supports.
 *   - **no daily-goal counting.** These rounds never reach `runSession`, so
 *     they do not add to today's card count and the goal is unaffected.
 *   - **no new-word cap.** Nothing here consults `newWordsLeftToday`, so the
 *     Arcade keeps working when the day's intake is spent. That is the point:
 *     it is the thing to play *after* the budget is gone.
 *
 * It counts for the streak, like Pairs and Gender Sort, because it is
 * genuinely practice — but that is the only number it touches.
 *
 * ## Nothing here is authored
 *
 * Every question is built from material the app already proves: phrase frames
 * attested at least eight times in LOD's own examples, grammar items mined
 * from real corpus sentences, and vocabulary lemmas. See `arcade/patterns.js`
 * for the mapping, including the three functions the corpus could not support
 * and what is shown instead.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { loadPhrases, loadGrammar, loadVocab, loadVerbs } from '../content.js';
import { touchStreak, suppressedFor } from '../store.js';
import { flagSlot } from '../flag.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { choiceInput, bankInput } from '../drill/inputs.js';
import { wordBank } from '../drill/match.js';
import { PATTERNS, patternById, materialFor, isPlayable, briefFor } from '../arcade/patterns.js';
import { VERB_GAMES, verbGameById, verbPool, isVerbGamePlayable } from '../arcade/verbs.js';
import { renderBrief, hasSeenBrief, briefButton } from '../arcade/brief.js';
import { renderVerbRound } from './verb-arcade.js';

const ROUND_SIZE = 8;
const OPTION_COUNT = 4;

function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The questions a pattern can ask, newest mechanic first.
 *
 * Three shapes, all reusing the drill engine's own widgets rather than
 * inventing a fourth kind of button:
 *
 *   `frame`   which opener performs this function — the frame gapped out of
 *             one of its own real example sentences.
 *   `build`   the same sentence, assembled from word tiles.
 *   `item`    a grammar card as mined, for the patterns whose whole content is
 *             a rule (liking, negation, quantity, time).
 *   `word`    a single word gapped out of its own LOD example, for the four
 *             patterns that *are* a small closed set of words — question
 *             words, connectors, the here/there of location, negation.
 *
 * ## The A1 filter
 *
 * On by default, and the reason `a1Only` is a parameter rather than a constant
 * is that it is a Settings switch: "for now" was the ask, so lifting it later
 * is a tap rather than a deploy.
 *
 * What it filters is every sentence a card *shows*, because "build the
 * sentence" is only a structure exercise if you already know the words — one
 * unknown noun and it becomes "guess the noun". The `a1` flag it reads is
 * computed at build time by `pipeline/build-a1.js`, which is where the lexicon
 * and corpus needed to answer the question live.
 *
 * One deliberate exception: a `frame` card's answer and options are always
 * shown, because a frame *is* an A1 opener — it is the thing being taught in
 * that very round. Only its illustrating sentence is filtered, and the card
 * drops the sentence rather than itself when that sentence is above A1.
 */
export function questionsFor(pattern, decks, random = Math.random, { a1Only = true } = {}) {
  const { frames, items, words } = materialFor(pattern, decks);
  const questions = [];
  const readable = (row) => !a1Only || row?.a1 !== false;

  // Decoy tiles for the build questions. wordBank draws them from this pool
  // and nowhere else, so it has to be real Luxembourgish: the other example
  // sentences of this same pattern, which keeps the wrong tiles plausible
  // (same register, same kind of sentence) without a word being invented.
  // Filtered too — a decoy tile is a word you have to read and reject.
  const pool = frames.flatMap((frame) =>
    (frame.examples ?? []).filter(readable).map((example) => example.lb).filter(Boolean),
  );

  const others = frames.length >= OPTION_COUNT ? frames : [...frames, ...(decks.phrases ?? [])];
  for (const frame of frames) {
    const examples = (frame.examples ?? [frame.example]).filter((example) => example?.lb);

    // One choice card per frame, not per example: the answer is the frame, so
    // three examples of it would be the same question asked three times.
    const distractors = shuffle(others.filter((other) => other.lb !== frame.lb), random)
      .slice(0, OPTION_COUNT - 1)
      .map((other) => ({ value: other.lb, correct: false }));
    if (distractors.length === OPTION_COUNT - 1) {
      questions.push({
        kind: 'frame',
        prompt: frame.en,
        // Illustration only, so it is dropped rather than allowed to drag the
        // card above A1. The question still stands without it.
        sentence: examples.find(readable)?.lb ?? '',
        answer: frame.lb,
        options: shuffle([{ value: frame.lb, correct: true }, ...distractors], random),
      });

      // The same frame the other way round: read the opener, choose what it
      // does. Free under the A1 filter — the options are English, and the one
      // Luxembourgish string on the card is the frame itself — and it is what
      // keeps `existence` and `connectors` playable once their above-A1
      // examples are filtered out.
      questions.push({
        kind: 'meaning',
        prompt: frame.lb,
        answer: frame.en,
        options: shuffle(
          [{ value: frame.en, correct: true }, ...distractors.map((option) => ({
            value: others.find((other) => other.lb === option.value)?.en ?? option.value,
            correct: false,
          }))],
          random,
        ),
      });
    }

    // Build cards, on the other hand, are a different sentence every time, so
    // every example the frame carries is worth one. This is what keeps the
    // thin patterns playable: `existence` has only two attested frames, and
    // without their other examples a round would be four cards long.
    for (const example of examples) {
      if (!readable(example)) continue;
      // Short sentences only: a fourteen-word sentence rebuilt from tiles is a
      // memory test, not a structure one.
      const words = example.lb.split(/\s+/).filter(Boolean);
      if (words.length < 3 || words.length > 8) continue;
      questions.push({
        kind: 'build',
        prompt: frame.en,
        answer: example.lb,
        pool: pool.filter((sentence) => sentence !== example.lb),
      });
    }
  }

  for (const item of items) {
    if (!Array.isArray(item.options_lb) || !Number.isInteger(item.correct)) continue;
    if (!readable(item)) continue;
    questions.push({
      kind: 'item',
      prompt: pattern.ask,
      before: item.before,
      after: item.after,
      answer: item.options_lb[item.correct],
      options: shuffle(
        item.options_lb.map((value, index) => ({ value, correct: index === item.correct })),
        random,
      ),
    });
  }

  for (const question of wordQuestions(pattern, words, random, readable)) questions.push(question);

  return shuffle(questions, random).slice(0, ROUND_SIZE);
}

/**
 * Splits an example sentence around the first whole-word occurrence of `word`.
 *
 * Whole-word, so `no` does not gap itself out of `noen` and leave a card whose
 * answer does not fit the hole. Returns null when the lemma does not appear as
 * written — a real case, since LOD's example for a lemma often uses an
 * inflected form — and the caller then simply asks about a different word.
 */
export function gapExample(word, sentence) {
  const tokens = String(sentence ?? '').split(/(\s+)/);
  const index = tokens.findIndex((token) => token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase() === word.toLowerCase());
  if (index === -1) return null;
  return { before: tokens.slice(0, index).join(''), after: tokens.slice(index + 1).join('') };
}

/**
 * Four of the fifteen functions are not a frame or a rule — they *are* a small
 * closed set of words. "Question words" is six words; there is nothing else to
 * teach about it. So each one is gapped out of its own LOD example and the
 * other words of the same pattern are the wrong answers, which is what makes
 * the card discriminating: choosing between wien/wat/wou is the exercise.
 */
function wordQuestions(pattern, words, random, readable) {
  // A gloss shared by two words makes an unanswerable card — keen and keng are
  // both "no". Only ask about words this pattern glosses uniquely; the ones
  // dropped are still taught by the pattern's grammar items.
  const byGloss = new Map();
  for (const word of words) byGloss.set(word.en, [...(byGloss.get(word.en) ?? []), word]);
  const askable = words.filter((word) => byGloss.get(word.en).length === 1);
  if (askable.length < 2) return [];

  const questions = [];
  for (const word of askable) {
    // The sentence is shown whole with one word missing, so it is filtered
    // like a build card rather than like a frame's illustration.
    if (!readable(word.example)) continue;
    const gap = gapExample(word.lb, word.example?.lb);
    if (!gap) continue;
    const distractors = shuffle(askable.filter((other) => other.lb !== word.lb), random)
      .slice(0, OPTION_COUNT - 1)
      .map((other) => ({ value: other.lb, correct: false }));

    questions.push({
      kind: 'word',
      prompt: `${pattern.ask} — “${word.en}”`,
      gloss: word.en,
      ...gap,
      answer: word.lb,
      options: shuffle([{ value: word.lb, correct: true }, ...distractors], random),
    });
  }
  return questions;
}

/**
 * A stable name for one Arcade card.
 *
 * These cards are assembled rather than looked up — a frame plus one of its
 * examples, or a grammar row rendered four different ways — so there is no
 * single deck id to flag. The pattern, the card shape and the answer together
 * identify what the player is actually looking at, and they are the same on
 * every future round, which is what a flag needs in order to still match.
 */
export const arcadeCardId = (pattern, question) => `${pattern.id}:${question.kind}:${question.answer}`;

export async function render(root, { params, settings, navigate }) {
  const [phrases, grammar, vocab, verbs] = await Promise.all([loadPhrases(), loadGrammar(), loadVocab(), loadVerbs()]);
  const decks = { phrases, grammar, vocab };
  // Unset means on: the filter was asked for, so absence is not a refusal —
  // the same reading `sound` gets in Settings.
  const a1Only = settings?.arcadeA1 !== false;
  const flagged = await suppressedFor('arcade', settings?.playerId);

  // The Arcade has two halves and one route. A sentence function and a verb
  // game are both `#/arcade/<id>`, and the ids cannot collide because the verb
  // ones are all prefixed `verb-`.
  const id = params?.[0];
  const pattern = id ? patternById(id) : null;
  if (pattern) return renderRound(root, pattern, decks, { settings, navigate, a1Only, flagged });

  const game = id ? verbGameById(id) : null;
  const verbFlagged = game ? await suppressedFor('verb-arcade', settings?.playerId) : null;
  if (game) return renderVerbRound(root, game, verbs, { settings, navigate, a1Only, flagged: verbFlagged });

  return renderIndex(root, decks, verbs, { navigate, a1Only });
}

/* ------------------------------------------------------------------ index */

/** Matches the heading style Today, Learn and Settings already use. */
function sectionLabel(text) {
  return el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)', marginBlockEnd: 'var(--s2)' } }, text);
}

/** One row of the index. Sentence functions and verb games look the same. */
function gameRow(id, number, title, sub) {
  return el(
    'a',
    { class: 'plan', href: `#/arcade/${id}` },
    el('span', { class: 'plan__n', 'aria-hidden': 'true' }, String(number)),
    el('span', { class: 'spacer' }, el('span', { class: 'card__title' }, title), el('span', { class: 'plan__for' }, sub)),
    el(
      'svg',
      { class: 'plan__chevron', viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' },
      el('path', { d: 'M9 6 L15 12 L9 18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round' }),
    ),
  );
}

function renderIndex(root, decks, verbs, { navigate, a1Only }) {
  void navigate;
  const playable = PATTERNS.filter((pattern) => isPlayable(pattern, decks));
  const pool = verbPool(verbs, { a1Only });
  const verbGames = VERB_GAMES.filter((game) => isVerbGamePlayable(game, pool));

  root.append(
    // `back` because this is no longer a tab: the games belong to the units
    // now and this page is the full list, reached from Learn.
    screenHead({ title: 'All games', sub: 'Every can-do check, in one place', back: '#/learn' }),
    el(
      'p',
      { class: 'card__note' },
      'Play as much as you like — nothing here counts towards the daily goal, moves your review schedule, ' +
        'or is capped by the new-word budget.',
    ),
    a1Only
      ? el(
          'p',
          { class: 'card__note' },
          'Showing A1 words only, so every sentence you are asked to build is one you can already read. ' +
            'Settings turns this off when you want the harder examples.',
        )
      : null,

    sectionLabel('Sentence functions'),
    el(
      'p',
      { class: 'card__note' },
      'Fifteen things you actually need a sentence to do.',
    ),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      ...playable.map((pattern, index) => gameRow(pattern.id, index + 1, pattern.title, pattern.ask)),
    ),

    sectionLabel('Verbs'),
    el(
      'p',
      { class: 'card__note' },
      `Five ways at the same ${pool.length} verbs — what they mean, who is doing it, how the form is built, ` +
        'the past, and the singular against the plural.',
    ),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      ...verbGames.map((game, index) => gameRow(game.id, index + 1, game.title, game.ask)),
    ),

    el(
      'p',
      { class: 'source-note', style: { marginBlockStart: 'var(--s5)' } },
      'Every sentence here is one LOD published — the openers are attested at least eight times in the dictionary’s own examples, ' +
        'and every verb form comes from LOD’s published inflection tables. Where the corpus does not write a pattern, the game says so ' +
        'rather than inventing one.',
    ),
  );

  return { destroy() {} };
}

/* ------------------------------------------------------------------ round */

function renderRound(root, pattern, decks, { settings, navigate, a1Only, flagged }) {
  // A sentence-function card has no deck row behind it — it is assembled from
  // a frame and one of its examples — so a flag is keyed by what the card
  // actually asks. `arcadeCardId` is that key, and it is stable across rounds.
  const questions = questionsFor(pattern, decks, Math.random, { a1Only }).filter(
    (question) => !flagged.has(arcadeCardId(pattern, question)),
  );

  root.append(screenHead({ title: pattern.title, sub: pattern.ask, back: '#/arcade' }));
  const body = el('div', { class: 'stack stack--lg' });
  root.append(body);

  if (questions.length === 0) {
    fill(
      body,
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'Nothing to play here yet.'),
        el('p', { class: 'source-note' }, pattern.gap ?? 'Run npm run content to build the decks this pattern draws on.'),
        button('Back to Arcade', { variant: 'secondary', onclick: () => navigate('#/arcade') }),
      ),
    );
    return { destroy() {} };
  }

  // A short round is a real outcome of the filter, not a fault: `existence`
  // has two attested frames and LOD's examples for them are above A1. Say so,
  // rather than padding the round with sentences the filter just rejected.
  const short = a1Only && questions.length < ROUND_SIZE;

  // The explanation goes in front of the first card, not underneath the answer
  // buttons where it was — same fix, same reason, as the verb games.
  const brief = briefFor(pattern, decks);
  const openBrief = () => {
    fill(body);
    renderBrief(body, brief, { onStart: start, startLabel: hasSeenBrief(pattern.id) ? 'Back to the round' : 'Start' });
  };
  const start = () => {
    fill(body);
    playRound({ body, pattern, questions, settings, navigate, short, onBrief: openBrief });
  };

  if (hasSeenBrief(pattern.id)) start();
  else openBrief();
  return { destroy() {} };
}

function playRound({ body, pattern, questions, settings, navigate, short, onBrief }) {
  let index = 0;
  let correct = 0;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say(
    short
      ? `A short round — only ${questions.length} of these stay inside A1 words.`
      : pattern.gap ?? `This round is about saying: ${pattern.ask}`,
    'idle',
  );

  const scoreLabel = el('span', { class: 'chip' }, `0 of ${questions.length}`);
  const instruction = el('p', { class: 'drill__instruction' });
  const promptCard = el('div', { class: 'card' });
  const inputHolder = el('div', {});
  const flag = flagSlot();

  fill(
    body,
    // The pattern's name is already the screen heading; printing it again here
    // was one of three copies of the same words on one screen. The way back to
    // the explanation goes here instead, and the instruction moves above the
    // card it describes.
    el('div', { class: 'row row--between' }, briefButton(onBrief), scoreLabel),
    instruction,
    promptCard,
    inputHolder,
    el('div', { class: 'card' }, amelie.el),
    flag.el,
  );

  show();

  function show() {
    const question = questions[index];
    flag.set({
      playerId: settings.playerId,
      source: 'arcade',
      id: arcadeCardId(pattern, question),
      label: `${pattern.title}: ${question.answer}`,
    });

    if (question.kind === 'build') {
      // The prompt is the opener's English, so the card has to say that it is
      // context rather than the thing to translate — "Build the sentence" over
      // the words "he has" read as an instruction to translate those two.
      instruction.textContent = 'Tap the words in order to rebuild the sentence.';
      fill(
        promptCard,
        el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'It uses the opener meaning'),
        el('p', { class: 'card__title', style: { textAlign: 'center' } }, question.prompt),
      );
      const input = bankInput(
        { bank: wordBank(question.answer, question.pool ?? []), bankKind: 'word', answer: question.answer },
        (result) => answered(question, result),
      );
      fill(inputHolder, input.el);
      return;
    }

    if (question.kind === 'meaning') {
      instruction.textContent = 'What does this opener mean? Tap the English.';
      fill(promptCard, el('p', { class: 'card__title', style: { textAlign: 'center' } }, question.prompt));
    } else if (question.kind === 'item' || question.kind === 'word') {
      instruction.textContent =
        question.kind === 'word'
          ? `Which word means “${question.gloss}”? Tap it to fill the gap.`
          : 'Tap the option that fills the gap correctly.';
      fill(
        promptCard,
        el('p', { style: { textAlign: 'center' } }, question.before ?? '', el('strong', {}, ' ___ '), question.after ?? ''),
      );
    } else {
      instruction.textContent = 'Which Luxembourgish opener says this? Tap it.';
      fill(
        promptCard,
        el('p', { class: 'card__title', style: { textAlign: 'center' } }, question.prompt),
        el('p', { class: 'card__note', style: { textAlign: 'center', marginBlockStart: 'var(--s2)' } }, question.sentence ?? ''),
      );
    }

    const input = choiceInput({ options: question.options }, (result) => answered(question, result));
    fill(inputHolder, input.el);
  }

  function answered(question, result) {
    if (result.correct) {
      correct += 1;
      chimeCorrect();
      amelie.say(pickLine(AMELIE_LINES.correct), 'celebrating');
    } else {
      resetChimeStreak();
      amelie.say(`It is “${question.answer}”.`, 'encouraging');
    }
    scoreLabel.textContent = `${correct} of ${questions.length}`;

    setTimeout(
      () => {
        index += 1;
        if (index >= questions.length) finish();
        else show();
      },
      result.correct ? 800 : 1800,
    );
  }

  async function finish() {
    // The only number the Arcade touches. No Leitner row, no daily card count,
    // no new-word budget — see the header for why.
    touchStreak(settings.playerId);
    const pct = Math.round((correct / questions.length) * 100);

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(pct >= 80 ? 'That is the pattern. Now it is a sentence you own.' : 'Round done — play it again, it costs nothing.');

    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, 'This round'),
          el('p', { class: 'meter__value' }, `${correct} / ${questions.length}`),
          el('p', { class: 'card__note' }, `${pct}% · ${plural(questions.length, 'question')}`),
        ),
        pattern.gap ? el('div', { class: 'card' }, el('p', { class: 'card__note' }, pattern.gap)) : null,
        button('Again', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(`#/arcade/${pattern.id}`) }),
        button('Another pattern', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/arcade') }),
        el(
          'p',
          { class: 'source-note' },
          'Arcade rounds count for your streak and nothing else: no review schedule moved, no daily goal advanced, no cap on how many you play.',
        ),
      ),
    );
  }
}
