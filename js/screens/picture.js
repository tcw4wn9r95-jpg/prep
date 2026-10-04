/**
 * Describing a picture — the screen. See `app/js/picture.js` for what each
 * round asks and why.
 *
 * Four views behind one route:
 *
 *   #/picture             the task, the six word fields, and position
 *   #/picture/words/<id>  one field as a list, to read rather than be tested on
 *   #/picture/<id>        a round of ten over that field, or over position
 *   #/picture/position    the position words as a reference list
 *
 * The lists are not an afterthought. "Build a section to learn all about
 * describing a picture" is a reference request as much as a drill one, and a
 * learner the night before the exam wants to read the clothes words, not be
 * quizzed on them.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, unlock } from '../audio.js';
import { loadPicture } from '../content.js';
import { touchStreak, getSettings, saveSettings } from '../store.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { flagSlot } from '../flag.js';
import { joinArticle } from '../drill/cards.js';
import { seeded } from '../sentences.js';
import {
  ROUND,
  POSITION,
  fieldById,
  poolFor,
  wordQuestion,
  placementQuestion,
  buildRound,
  shapesFor,
  doneKey,
  progress,
} from '../picture.js';

/* -------------------------------------------------------------- progress */

async function loadDone() {
  const settings = await getSettings();
  return new Set(settings.picture ?? []);
}

async function markDone(keys) {
  const settings = await getSettings();
  const done = new Set(settings.picture ?? []);
  let changed = false;
  for (const key of keys) if (!done.has(key)) { done.add(key); changed = true; }
  if (changed) await saveSettings({ picture: [...done] });
  return done;
}

/* ------------------------------------------------------------------ index */

export async function render(root, { params, settings, navigate }) {
  const [deck, done] = await Promise.all([loadPicture(), loadDone()]);

  const first = params?.[0] ?? null;
  if (first === 'words') return renderWords(root, deck, params?.[1] ?? null);
  if (first === POSITION && params?.[1] !== 'round') return renderPositions(root, deck);
  if (first) {
    const id = first === POSITION ? POSITION : first;
    if (poolFor(id, deck).length > 0) return renderRound(root, id, deck, done, { settings, navigate });
  }

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say('Name what you see, then say where it is. That is the whole task.', 'idle');

  const rows = progress(deck, done);

  root.append(
    screenHead({ title: 'Describe a picture', sub: 'Part 2b of the speaking exam', back: '#/learn' }),
    el(
      'div',
      { class: 'card' },
      el('div', { class: 'row' }, amelie.el),
      el(
        'p',
        { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } },
        'Three photographs are offered and you describe one. A description is two things: naming what is in the picture, and saying where it is — so this section is the words for the first and the sentences for the second.',
      ),
      el(
        'a',
        { class: 'btn btn--secondary btn--block', href: '#/speaking/image/image', style: { marginBlockStart: 'var(--s3)' } },
        'Try the real task',
      ),
    ),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s4)' } },
      ...rows.map((row) => {
        const complete = row.total > 0 && row.finished >= row.total;
        return el(
          'div',
          { class: `card${complete ? ' is-done' : ''}` },
          el(
            'div',
            { class: 'row row--between' },
            el('span', { class: 'card__title' }, `${row.cue ?? ''} ${row.title}`.trim()),
            el('span', { class: 'chip' }, complete ? 'done' : `${row.finished} / ${row.total}`),
          ),
          el('p', { class: 'card__note' }, row.blurb),
          el(
            'div',
            { class: 'meter__track', style: { marginBlock: 'var(--s2)' } },
            el('div', {
              class: `meter__fill${complete ? ' is-pass' : ''}`,
              style: { width: `${row.total === 0 ? 0 : Math.max((row.finished / row.total) * 100, 2)}%` },
            }),
          ),
          el(
            'div',
            { class: 'row', style: { gap: 'var(--s2)' } },
            el(
              'a',
              { class: 'chip chip--action', href: row.id === POSITION ? '#/picture/position' : `#/picture/words/${row.id}` },
              'The words',
            ),
            el(
              'a',
              { class: 'chip chip--action', href: row.id === POSITION ? '#/picture/position/round' : `#/picture/${row.id}` },
              'Practise',
            ),
          ),
        );
      }),
    ),
  );
  return { destroy() {} };
}

/* --------------------------------------------------------------- the words */

function wordRow(word) {
  // A photograph where the deck has one, the deck's emoji cue where it has
  // that, and nothing at all otherwise — 101 of the 181 words have neither,
  // and a grey box with a dot in it is worse than a row that simply starts at
  // the margin.
  const badge = word.imageUrl
    ? el('img', { class: 'pic__thumb', src: word.imageUrl, alt: '', loading: 'lazy' })
    : word.cue
      ? el('span', { class: 'pic__cue', 'aria-hidden': 'true' }, word.cue)
      : null;

  return el(
    'div',
    { class: 'card pic__row' },
    el(
      'div',
      { class: 'row' },
      badge,
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'pic__word' }, word.article ? joinArticle(word.article, word.lb) : word.lb),
        el('p', { class: 'card__note' }, word.en),
      ),
    ),
    // LOD's own sentence for the word. A word in a sentence is worth more than
    // a word in a list, and it is the sentence a description can borrow.
    word.example ? el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } }, word.example.lb) : null,
  );
}

function renderWords(root, deck, id) {
  const field = fieldById(deck, id);
  if (!field) {
    root.append(
      screenHead({ title: 'Describe a picture', back: '#/picture' }),
      el('div', { class: 'empty' }, el('p', {}, 'That is not one of the word fields.')),
    );
    return { destroy() {} };
  }

  const search = el('input', {
    class: 'field',
    type: 'search',
    placeholder: `Find a word`,
    'aria-label': 'Find a word',
    autocomplete: 'off',
  });
  const body = el('div', { class: 'stack' });

  function draw() {
    const needle = search.value.trim().toLocaleLowerCase('lb');
    const shown = needle
      ? field.words.filter((word) => word.lb.toLocaleLowerCase('lb').includes(needle) || word.en.toLowerCase().includes(needle))
      : field.words;
    fill(
      body,
      ...(shown.length === 0 ? [el('p', { class: 'card__note' }, 'Nothing matches that.')] : shown.map(wordRow)),
    );
  }

  search.addEventListener('input', draw);
  draw();

  root.append(
    screenHead({ title: field.title_en, sub: `${plural(field.words.length, 'word')}, most used first`, back: '#/picture' }),
    el('div', { style: { marginBlockEnd: 'var(--s3)' } }, search),
    body,
    el(
      'a',
      { class: 'btn btn--primary btn--block', href: `#/picture/${field.id}`, style: { marginBlockStart: 'var(--s4)' } },
      'Practise these',
    ),
  );
  return { destroy() {} };
}

/* ------------------------------------------------------------- positions */

function renderPositions(root, deck) {
  root.append(
    screenHead({ title: 'Where things are', sub: `${plural(deck.positions.length, 'word')}`, back: '#/picture' }),
    el(
      'div',
      { class: 'card' },
      el(
        'p',
        { class: 'card__note' },
        'These are the words that put one thing beside, behind or above another. Each one is shown with a real sentence from the dictionary — the shape to copy.',
      ),
    ),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      ...deck.positions.map((one) =>
        el(
          'div',
          { class: 'card pic__row' },
          el(
            'div',
            { class: 'row row--between' },
            el('span', { class: 'pic__word' }, one.lb),
            el('span', { class: 'card__note' }, one.en),
          ),
          one.example ? el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } }, one.example.lb) : null,
        ),
      ),
    ),
    // Said rather than hidden: the one thing a describer reaches for that this
    // app cannot give them, and what to say instead.
    el(
      'p',
      { class: 'source-note', style: { marginBlockStart: 'var(--s4)' } },
      'There is no word here for the foreground: the dictionary this app is built from does not publish one. Say where something is with uewen, ënnen, lénks, riets and an der Mëtt instead.',
    ),
    el(
      'a',
      { class: 'btn btn--primary btn--block', href: '#/picture/position/round', style: { marginBlockStart: 'var(--s3)' } },
      'Practise these',
    ),
  );
  return { destroy() {} };
}

/* ------------------------------------------------------------- one round */

function renderRound(root, id, deck, done, { settings, navigate }) {
  const field = fieldById(deck, id);
  const pool = poolFor(id, deck);
  const plan = buildRound(id, pool, done, { size: ROUND, seed: `${settings.playerId}:${id}` });
  const shapes = id === POSITION ? plan.map(() => 'placement') : shapesFor(plan);
  const title = field ? field.title_en : 'Where things are';

  const body = el('div', { class: 'stack drill__body' });
  const amelie = new Amelie({ size: 'sm', bubble: true });
  const flag = flagSlot();
  const progressFill = el('div', { class: 'meter__fill' });

  let index = 0;
  let correct = 0;
  let streak = 0;
  let best = 0;
  const finished = [];
  let clip = null;
  const destroyClip = () => { if (clip) { clip.destroy(); clip = null; } };

  root.append(
    screenHead({ title, sub: `${plural(plan.length, 'question')}`, back: '#/picture' }),
    el('div', { class: 'meter__track', style: { marginBlockEnd: 'var(--s3)' } }, progressFill),
    body,
  );

  if (plan.length === 0) {
    fill(body, el('div', { class: 'card' }, el('p', { class: 'card__note' }, 'Nothing to ask here yet.')));
    return { destroy() {} };
  }

  function step() {
    destroyClip();
    amelie.say(null, 'idle');
    amelie.el.hidden = true;
    if (index >= plan.length) return finish();

    const item = plan[index];
    progressFill.style.width = `${(index / plan.length) * 100}%`;
    const random = seeded(`${id}:${item.id}`);
    const question =
      id === POSITION
        ? placementQuestion(item, deck.positions, { random })
        : wordQuestion(item, field, { random, shape: shapes[index] });

    let answered = false;
    const after = el('div', { hidden: true });
    const note = el('p', { class: 'drill__rule', hidden: true });

    const buttons = question.options.map((option) =>
      el(
        'button',
        {
          type: 'button',
          class: 'option',
          dataset: { value: option },
          onclick: () => {
            if (answered) return;
            answered = true;
            const right = option === question.answer;
            for (const node of buttons) {
              if (node.dataset.value === question.answer) node.classList.add('is-correct');
              else if (node.dataset.value === option) node.classList.add('is-wrong');
              node.disabled = true;
            }
            if (right) {
              correct += 1;
              streak += 1;
              best = Math.max(best, streak);
              finished.push(doneKey(id, item));
              chimeCorrect();
              amelie.say(streak >= 3 ? `${streak} in a row!` : pickLine(AMELIE_LINES.correct ?? ['Right.']), 'celebrating');
            } else {
              streak = 0;
              resetChimeStreak();
              amelie.say('Not that one — the right answer is marked.', 'encouraging');
            }
            amelie.el.hidden = false;

            if (question.sentence) {
              // The sentence whole, once the gap is filled, and what the word
              // means — a placement you cannot read teaches nothing.
              note.textContent = question.english
                ? `${question.sentence}  (${question.answer} — ${question.english})`
                : question.sentence;
              note.hidden = false;
            } else if (question.word?.example) {
              const named = question.word.article ? joinArticle(question.word.article, question.word.lb) : question.word.lb;
              note.textContent = `${named} — ${question.word.en} · ${question.word.example.lb}`;
              note.hidden = false;
            }

            const audioId = question.audioId ?? question.word?.example?.audioId ?? null;
            fill(
              after,
              audioId
                ? button('Hear it', {
                    variant: 'secondary',
                    onclick: async () => {
                      unlock();
                      destroyClip();
                      clip = new Clip(audioId);
                      await clip.play();
                    },
                  })
                : null,
              button(index >= plan.length - 1 ? 'Finish' : 'Next', {
                variant: 'primary',
                class: 'btn btn--primary btn--block',
                onclick: () => { index += 1; step(); },
              }),
            );
            after.hidden = false;
            after.querySelector('button:last-child')?.focus();
          },
        },
        option,
      ),
    );

    flag.set({ playerId: settings.playerId, source: 'picture', id: item.id, label: question.sentence ?? item.lb });

    fill(
      body,
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'meter__label' }, `${index + 1} of ${plan.length}`),
        question.imageUrl
          ? el('img', { class: 'pic__shot', src: question.imageUrl, alt: 'What is this?' })
          : null,
        question.prompt === null
          ? null
          : typeof question.prompt === 'string'
            ? el('p', { class: 'prompt__word' }, question.prompt)
            : el(
                'p',
                { class: 'prompt__sentence' },
                question.prompt.before,
                el('span', { class: 'cloze__gap' }, '____'),
                question.prompt.after,
              ),
      ),
      el('p', { class: 'drill__instruction' }, question.instruction),
      el('div', { class: 'options' }, ...buttons),
      note,
      amelie.el,
      after,
      flag.el,
    );
  }

  async function finish() {
    destroyClip();
    progressFill.style.width = '100%';
    progressFill.classList.add('is-pass');
    if (finished.length > 0) await markDone(finished);
    touchStreak(settings.playerId).catch(() => {});

    const perfect = correct === plan.length;
    if (perfect) amelie.celebrate('Every one.');
    else amelie.say(`${correct} of ${plan.length}.`, 'idle');
    amelie.el.hidden = false;

    fill(
      body,
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'card__title' }, perfect ? 'Perfect round' : `${correct} of ${plan.length}`),
        el('p', { class: 'card__note' }, best > 1 ? `Best run: ${best} in a row.` : 'The ones you missed come back.'),
      ),
      amelie.el,
      button('Another round', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(`#/picture/${id === POSITION ? 'position/round' : id}`) }),
      // The point of the words is the task they are for.
      button('Describe a real picture', { variant: 'secondary', onclick: () => navigate('#/speaking/image/image') }),
      button('Back to the section', { variant: 'ghost', onclick: () => navigate('#/picture') }),
    );
  }

  step();
  return { destroy: destroyClip };
}
