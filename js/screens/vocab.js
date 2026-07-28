/**
 * Vocabulary — Duolingo-style flashcard drill over the A1/A2 Grondwuertschatz.
 *
 * Every card is a corpus lemma with a translation LOD itself publishes (see
 * pipeline/build-vocab.js). This is the foundation layer the exam-format
 * modules assume you already have: a beginner starts here, not in Verstoen.
 *
 * Progress is a tiny Leitner box per player+word (store.js), so a session is
 * new words mixed with whatever has come due for review — never the same
 * random shuffle of everything, every time.
 */

import { el, fill, screenHead, button } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { loadVocab } from '../content.js';
import { getLearnDeckState, recordLearnResult, pickDue, POINTS } from '../store.js';

const SESSION_SIZE = 10;

const VOCAB_LINES = {
  intro: 'Pick the right meaning. Get it wrong and it comes back sooner.',
  correct: ['Right.', 'Yes!', 'Correct.', 'Good.'],
  wrong: ['Not quite — that word comes back soon.', 'Close. You will see this one again.'],
};

export async function render(root, { settings, navigate }) {
  const [allItems, stateByItemId] = await Promise.all([
    loadVocab(),
    getLearnDeckState(settings.playerId, 'vocab'),
  ]);

  const session = pickDue(allItems, stateByItemId, SESSION_SIZE);

  if (session.length === 0) {
    root.append(
      screenHead({ title: 'Vocabulary', back: '#/learn' }),
      el('div', { class: 'empty' }, el('p', {}, 'Nothing due right now — you are caught up.'), button('Back to Learn', { variant: 'secondary', onclick: () => navigate('#/learn') })),
    );
    return { destroy() {} };
  }

  let index = 0;
  let correctCount = 0;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  const progressFill = el('div', { class: 'progress__fill', style: { width: '0%' } });
  const body = el('div', { class: 'stack stack--lg' });

  root.append(
    screenHead({ title: 'Vocabulary', sub: `${session.length} words`, back: '#/learn' }),
    el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress' }, progressFill),
    body,
  );

  function renderCard() {
    const item = session[index];
    progressFill.style.width = `${(index / session.length) * 100}%`;

    const distractors = pickDistractors(allItems, item, 3);
    const options = shuffle([item, ...distractors]);
    let answered = false;

    const word = el(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      el('p', { class: 'meter__label' }, item.pos === 'SUBST' ? 'noun' : item.pos === 'VRB' ? 'verb' : item.pos === 'ADJ' ? 'adjective' : 'word'),
      el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, item.article ? `${item.article} ${item.lb}` : item.lb),
      item.example ? el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s3)', fontStyle: 'italic' } }, `“${item.example.lb}”`) : null,
    );

    const optionsEl = el('div', { class: 'options' });
    const optionButtons = options.map((option) =>
      el(
        'button',
        { type: 'button', class: 'option', onclick: () => answer(option) },
        el('span', {}, option.en),
      ),
    );
    fill(optionsEl, ...optionButtons);

    const next = button(index === session.length - 1 ? 'Finish' : 'Next', {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      hidden: true,
      onclick: () => {
        if (index === session.length - 1) finish();
        else { index += 1; renderCard(); }
      },
    });

    function answer(chosen) {
      if (answered) return;
      answered = true;
      optionsEl.classList.add('is-answered');
      const isRight = chosen.id === item.id;
      if (isRight) correctCount += 1;

      const rightBtn = optionButtons[options.findIndex((o) => o.id === item.id)];
      rightBtn.classList.add('is-correct');
      if (!isRight) optionButtons[options.findIndex((o) => o.id === chosen.id)].classList.add('is-wrong');

      recordLearnResult(settings.playerId, 'vocab', item.id, isRight);
      amelie.say(pickLine(isRight ? VOCAB_LINES.correct : VOCAB_LINES.wrong), isRight ? 'celebrating' : 'encouraging');
      next.hidden = false;
      next.focus();
    }

    fill(body, word, optionsEl, amelie.el, next);
    if (index === 0) amelie.say(VOCAB_LINES.intro, 'idle');
  }

  function finish() {
    progressFill.style.width = '100%';
    progressFill.classList.add('progress__fill--ok');

    const pct = Math.round((correctCount / session.length) * 100);
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
          el('p', { class: 'meter__value' }, `${correctCount} / ${session.length}`),
          el('p', { class: 'card__note' }, `${pct}% · +${correctCount * POINTS.perLearnCorrect} points`),
        ),
        button('Study more words', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate('#/vocab') }),
        button('Back to Learn', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/learn') }),
      ),
    );
  }

  renderCard();
  return { destroy() {} };
}

/** Distractor glosses: prefer same part of speech so the choice isn't trivial. */
function pickDistractors(allItems, item, count) {
  const samePos = allItems.filter((candidate) => candidate.id !== item.id && candidate.pos === item.pos && candidate.en !== item.en);
  const pool = samePos.length >= count ? samePos : allItems.filter((candidate) => candidate.id !== item.id && candidate.en !== item.en);
  return shuffle([...pool]).slice(0, count);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
