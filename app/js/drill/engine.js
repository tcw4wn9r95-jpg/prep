/**
 * The drill engine.
 *
 * One session, any deck, any card type. Everything specific to a deck lives in
 * cards.js `DECKS`; everything specific to a question type lives in the card
 * description and the input widget. This file only knows how to run a queue.
 *
 * The one piece of scheduling that lives here rather than in store.js is the
 * within-session re-test: a card answered wrong is pushed back into the queue a
 * few places later and has to be answered correctly before the session ends.
 * A miss that is never re-attempted teaches nothing except that the session is
 * nearly over, and the second attempt after a short delay is where the memory
 * actually gets laid down.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, unlock } from '../audio.js';
import { getSentenceExplanation, saveSentenceExplanation, recordLearnResult, POINTS, touchStreak } from '../store.js';
import { requestExplanation } from '../sync.js';
import { buildCard } from './cards.js';
import { INPUTS } from './inputs.js';

/** How many cards later a missed card comes back. Far enough that it is a
 * retrieval rather than an echo, near enough to still be in the session. */
const RETEST_GAP = 3;

const LINES = {
  correct: ['Right.', 'Yes!', 'Correct.', 'Good.', 'That is it.'],
  wrong: ['Not quite — this one comes back before the end.', 'Close. You will see this again in a moment.'],
  partial: ['Right word, check the accents.', 'That is the word — the spelling needs one more look.'],
  article: ['Right word, wrong article.'],
};

const INSTRUCTION_BY_STRAND = {
  recv: 'Understand it',
  prod: 'Say it',
};

/**
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Array<{item: object, strand: string, isNew: boolean}>} options.plan
 * @param {object} options.deck one of cards.js DECKS
 * @param {Array} options.pool the full deck, for distractors
 * @param {Map} options.boxes item id + strand → box, for choosing card types
 * @param {object} options.settings
 * @param {(hash: string) => void} options.navigate
 * @param {string} options.title
 * @param {string} options.back
 * @param {string} options.again hash to start another session
 */
export function runSession({ root, plan, deck, pool, boxes, settings, navigate, title, sub, back, again }) {
  /** @type {Array<{item, strand, isNew, retry?: boolean}>} */
  let queue = [...plan];
  let index = 0;
  let correctCount = 0;
  let answeredCount = 0;
  let clip = null;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  const progressFill = el('div', { class: 'progress__fill', style: { width: '0%' } });
  const body = el('div', { class: 'stack stack--lg' });

  root.append(
    screenHead({ title, sub, back }),
    el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress' }, progressFill),
    body,
  );

  function destroyClip() {
    if (clip) {
      clip.destroy();
      clip = null;
    }
  }

  function renderCard() {
    destroyClip();
    if (index >= queue.length) {
      finish();
      return;
    }

    const entry = queue[index];
    const box = boxes.get(`${entry.strand}:${entry.item.id}`) ?? 0;
    const card = buildCard({ item: entry.item, strand: entry.strand, box, deck, pool });

    // Clear the previous card's feedback. Leaving it up makes Amelie look like
    // she is commenting on a question that has not been answered yet.
    amelie.say(null, 'idle');

    progressFill.style.width = `${(answeredCount / Math.max(queue.length, 1)) * 100}%`;

    const audioId = card.prompt.audioId ?? null;
    if (audioId) clip = new Clip(audioId);

    const revealed = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s3)', fontStyle: 'italic' }, hidden: true });
    const feedback = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)' }, hidden: true });
    // Offered only once the card is answered: before that it would be a way to
    // read the answer out of the explanation.
    const explain = card.item.example ? explainButton(settings, card.item) : null;
    if (explain) explain.hidden = true;

    const prompt = el(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      el(
        'div',
        { class: 'row', style: { justifyContent: 'center', gap: 'var(--s2)' } },
        el('span', { class: 'meter__label' }, INSTRUCTION_BY_STRAND[card.strand] ?? ''),
        entry.retry ? el('span', { class: 'chip' }, 'again') : null,
      ),
      card.cue ? el('p', { class: 'cue', 'aria-hidden': 'true' }, card.cue) : null,
      ...promptBody(card),
      audioId ? playButton(card) : null,
      revealed,
      feedback,
      explain,
    );

    const inputFactory = INPUTS[card.mode];
    const input = inputFactory(card, (result) => grade(card, entry, result, { revealed, feedback, explain }));

    fill(body, prompt, el('p', { class: 'drill__instruction' }, card.instruction), input.el, amelie.el, nextHolder);
    nextHolder.hidden = true;
    fill(nextHolder, nextButton(entry));

    if (card.mode === 'type' && input.focus) input.focus();
    // Listening cards are useless in silence — play as soon as the card lands,
    // once the first tap of the session has unlocked audio.
    if (card.type === 'listen' && clip) clip.play();
  }

  function promptBody(card) {
    if (card.prompt.cloze) {
      const { before, after } = card.prompt.cloze;
      return [
        el(
          'p',
          { class: 'screen__title', style: { marginBlockStart: 'var(--s2)', fontSize: 'var(--size-md)', lineHeight: 'var(--lh-base)' } },
          before,
          el('span', { class: 'cloze__gap', 'aria-label': 'missing word' }, ' '),
          after,
        ),
      ];
    }
    if (card.prompt.gloss) {
      return [el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, card.prompt.gloss)];
    }
    if (card.prompt.word) {
      return [
        el('p', { class: 'meter__label' }, card.kindLabel),
        el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, card.prompt.word),
        card.prompt.pronoun
          ? el('p', { class: 'drill__pronoun' }, card.prompt.pronoun, el('span', { class: 'drill__blank' }, ' '))
          : null,
        card.prompt.sentence
          ? el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s3)', fontStyle: 'italic' } }, `“${card.prompt.sentence}”`)
          : null,
      ];
    }
    // A listening card shows nothing at all before the answer.
    return [el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, ' ')];
  }

  function playButton(card) {
    const note = el('p', { class: 'card__note', hidden: true });
    const play = el(
      'button',
      {
        type: 'button',
        class: 'player__play',
        'aria-label': card.type === 'listen' ? 'Play the sentence again' : 'Hear the example sentence',
        onclick: async () => {
          unlock();
          play.classList.add('is-playing');
          note.hidden = true;
          const ok = await clip.play();
          if (!ok) {
            play.classList.remove('is-playing');
            note.textContent = 'Audio would not play — try tapping again.';
            note.hidden = false;
          }
        },
      },
      el('svg', { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': 'true', fill: 'currentColor' }, el('path', { d: 'M8 5 L19 12 L8 19 Z' })),
    );
    clip.on('ended', () => play.classList.remove('is-playing'));
    return el('div', { style: { marginBlockStart: 'var(--s3)' } }, play, note);
  }

  const nextHolder = el('div');

  function nextButton(entry) {
    const last = index >= queue.length - 1;
    return button(last ? 'Finish' : 'Next', {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      onclick: () => {
        index += 1;
        renderCard();
      },
    });
  }

  function grade(card, entry, result, { revealed, feedback, explain }) {
    answeredCount += 1;
    if (result.correct) correctCount += 1;

    // A retry is practice, not evidence — grading it would let a word be
    // promoted by the second attempt at the same question in the same minute,
    // which is exactly the spacing the box is supposed to enforce.
    if (!entry.retry) {
      recordLearnResult(settings.playerId, deck.id, card.strand, card.item.id, {
        correct: result.correct,
        partial: result.partial,
      });
    }

    // Always show the full sentence and the exact spelling once the answer is
    // in — the card is over, and this is the moment the correct form is worth
    // reading.
    const reveal = card.prompt.revealAfter ?? card.item.example?.lb ?? null;
    if (reveal) {
      revealed.textContent = `“${reveal}”`;
      revealed.hidden = false;
    }
    if (explain) explain.hidden = false;

    if (!result.correct || result.partial) {
      feedback.textContent = result.articleWrong
        ? `${card.deck.article(card.item)} ${card.lemma}`
        : `${card.lemma}${card.answer !== card.lemma ? ` → ${card.answer}` : ''}`;
      feedback.hidden = false;
    }

    const tone = result.correct && !result.partial ? 'celebrating' : result.correct ? 'thinking' : 'encouraging';
    const line = !result.correct
      ? pickLine(LINES.wrong)
      : result.articleWrong
        ? pickLine(LINES.article)
        : result.partial
          ? pickLine(LINES.partial)
          : pickLine(LINES.correct);
    amelie.say(line, tone);

    if (!result.correct) scheduleRetest(entry);

    fill(nextHolder, nextButton(entry));
    nextHolder.hidden = false;
    nextHolder.firstChild?.focus();
  }

  /** Push a missed card back into the queue, a few cards further on. */
  function scheduleRetest(entry) {
    if (entry.retry) {
      // Already a second attempt and still wrong. Re-queue once more at the
      // very end rather than looping — the session has to be able to finish.
      if (!entry.thirdTime) queue.push({ ...entry, retry: true, thirdTime: true });
      return;
    }
    const at = Math.min(index + RETEST_GAP, queue.length);
    queue = [...queue.slice(0, at), { ...entry, retry: true }, ...queue.slice(at)];
  }

  function finish() {
    destroyClip();
    progressFill.style.width = '100%';
    progressFill.classList.add('progress__fill--ok');
    touchStreak(settings.playerId);

    const pct = answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);
    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(AMELIE_LINES.setDone);

    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, 'This session'),
          el('p', { class: 'meter__value' }, `${correctCount} / ${answeredCount}`),
          el('p', { class: 'card__note' }, `${pct}% · +${correctCount * POINTS.perLearnCorrect} points`),
        ),
        button('Keep going', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(again) }),
        button('Back to Learn', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/learn') }),
      ),
    );
  }

  renderCard();

  return { destroy: destroyClip };
}

/**
 * The empty state, shared by every deck: nothing is due, which is a good
 * outcome and should not read like an error.
 */
export function nothingDue({ root, title, back, navigate, total }) {
  root.append(
    screenHead({ title, back }),
    el(
      'div',
      { class: 'empty' },
      el('p', {}, 'Nothing due right now — you are caught up.'),
      el('p', { class: 'card__note' }, `${plural(total, 'word')} in this deck. Come back when the next review falls due.`),
      button('Back to Learn', { variant: 'secondary', onclick: () => navigate('#/learn') }),
    ),
  );
  return { destroy() {} };
}

/** Explanation button, unchanged in behaviour from the old vocab screen. */
export function explainButton(settings, item) {
  const note = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)', textAlign: 'left' }, hidden: true });
  const trigger = button('Explain this sentence', {
    variant: 'secondary',
    class: 'btn btn--secondary',
    style: { marginBlockStart: 'var(--s3)' },
    onclick: async () => {
      trigger.disabled = true;
      const cached = await getSentenceExplanation(item.id);
      if (cached) {
        note.textContent = cached;
        note.hidden = false;
        trigger.hidden = true;
        return;
      }
      note.textContent = 'Asking…';
      note.hidden = false;
      const result = await requestExplanation(settings, { lb: item.example.lb, word: item.lb ?? item.infinitive, en: item.en });
      if (result.ok) {
        await saveSentenceExplanation(item.id, result.explanation);
        note.textContent = result.explanation;
        trigger.hidden = true;
      } else {
        note.textContent = result.message;
        trigger.disabled = false;
      }
    },
  });
  return el('div', {}, trigger, note);
}
