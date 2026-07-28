/**
 * Verbs — present-tense conjugation drills.
 *
 * Every form comes verbatim from LOD's Flexiounstabellen (pipeline/build-verbs.js);
 * the drill only decides which cell to ask about and which other cells of the
 * *same* verb to offer as wrong answers. That keeps the choice meaningful —
 * you are picking the right person, not spotting an unrelated word.
 */

import { el, fill, screenHead, button } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { loadVerbs } from '../content.js';
import { getLearnDeckState, recordLearnResult, pickDue, POINTS } from '../store.js';

const SESSION_SIZE = 10;
const PRONOUNS = { p1: 'ech', p2: 'du', p3: 'hie / si / hatt', p4: 'mir', p5: 'dir', p6: 'si' };
const PERSONS = Object.keys(PRONOUNS);

const VERB_LINES = {
  intro: 'Pick the form that matches the pronoun.',
  correct: ['Right.', 'Yes!', 'Correct.', 'Good conjugating.'],
  wrong: ['Not that form — this verb comes back soon.', 'Close. You will see this one again.'],
};

export async function render(root, { settings, navigate }) {
  const [allItems, stateByItemId] = await Promise.all([
    loadVerbs(),
    getLearnDeckState(settings.playerId, 'verb'),
  ]);

  const session = pickDue(allItems, stateByItemId, SESSION_SIZE);

  if (session.length === 0) {
    root.append(
      screenHead({ title: 'Verbs', back: '#/learn' }),
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
    screenHead({ title: 'Verbs', sub: `${session.length} verbs`, back: '#/learn' }),
    el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress' }, progressFill),
    body,
  );

  function renderCard() {
    const item = session[index];
    progressFill.style.width = `${(index / session.length) * 100}%`;

    const person = PERSONS[Math.floor(Math.random() * PERSONS.length)];
    const correctForm = item.present[person];
    const options = shuffle([correctForm, ...pickDistractors(allItems, item, person, 3)]);
    let answered = false;

    const prompt = el(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      el('p', { class: 'meter__label' }, item.en ?? 'verb'),
      el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, item.infinitive),
      el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s3)', fontSize: 'var(--size-lg)', fontWeight: '700' } }, `${PRONOUNS[person]} ___`),
    );

    const optionsEl = el('div', { class: 'options' });
    const optionButtons = options.map((form) =>
      el('button', { type: 'button', class: 'option', onclick: () => answer(form) }, el('span', {}, form)),
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
      const isRight = chosen === correctForm;
      if (isRight) correctCount += 1;

      optionButtons[options.indexOf(correctForm)].classList.add('is-correct');
      if (!isRight) optionButtons[options.indexOf(chosen)].classList.add('is-wrong');

      recordLearnResult(settings.playerId, 'verb', item.id, isRight);
      amelie.say(pickLine(isRight ? VERB_LINES.correct : VERB_LINES.wrong), isRight ? 'celebrating' : 'encouraging');
      next.hidden = false;
      next.focus();
    }

    fill(body, prompt, optionsEl, amelie.el, next);
    if (index === 0) amelie.say(VERB_LINES.intro, 'idle');
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
        button('Conjugate more verbs', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate('#/verbs') }),
        button('Back to Learn', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/learn') }),
      ),
    );
  }

  renderCard();
  return { destroy() {} };
}

/** Wrong answers: other persons' forms of the *same* verb, deduped against the
 * right answer. Tops up with forms from other verbs if a verb's persons are too
 * uniform (several Luxembourgish verbs share a form across p1/p4/p6). */
function pickDistractors(allItems, item, person, count) {
  const correctForm = item.present[person];
  const sameVerb = PERSONS.filter((p) => p !== person)
    .map((p) => item.present[p])
    .filter((form, i, arr) => form !== correctForm && arr.indexOf(form) === i);

  const picks = shuffle(sameVerb).slice(0, count);
  if (picks.length >= count) return picks;

  const filler = [];
  const others = allItems.filter((candidate) => candidate.id !== item.id);
  for (let attempt = 0; attempt < 50 && picks.length + filler.length < count && others.length > 0; attempt += 1) {
    const other = others[Math.floor(Math.random() * others.length)];
    const otherPerson = PERSONS[Math.floor(Math.random() * PERSONS.length)];
    const form = other.present[otherPerson];
    if (form !== correctForm && !picks.includes(form) && !filler.includes(form)) filler.push(form);
  }
  return [...picks, ...filler];
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
