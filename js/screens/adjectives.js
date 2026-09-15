/**
 * Adjectives — the screen. See `app/js/adjectives.js` for what each round asks
 * and why.
 *
 * Three views behind one route:
 *
 *   #/adjectives              the five rounds, with how far through each
 *   #/adjectives/<mode>       a round of ten
 *   #/adjectives/list         every adjective with its opposite and both
 *                             degrees, to read rather than be tested on
 *
 * The list is not an afterthought. "Add the adjectives, the opposite, the
 * comparative and the superlative" is a reference request as much as a game
 * one, and a drill that never lets you simply *look at* the table is a drill
 * you cannot revise from.
 *
 * Like the other side games it keeps its own progress and does not move the
 * Leitner boxes — picking one of four adjectives is a lighter task than the
 * vocab deck's own recall cards, and letting it promote the same rows would
 * drift the review schedule with nothing looking wrong.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, unlock } from '../audio.js';
import { loadAdjectives } from '../content.js';
import { touchStreak, getSettings, saveSettings } from '../store.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { flagSlot } from '../flag.js';
import { seeded } from '../sentences.js';
import { MODES, ROUND, modeById, poolFor, questionFor, buildRound, doneKey, progress } from '../adjectives.js';

/* -------------------------------------------------------------- progress */

async function loadDone() {
  const settings = await getSettings();
  return new Set(settings.adjectives ?? []);
}

async function markDone(keys) {
  const settings = await getSettings();
  const done = new Set(settings.adjectives ?? []);
  let changed = false;
  for (const key of keys) if (!done.has(key)) { done.add(key); changed = true; }
  if (changed) await saveSettings({ adjectives: [...done] });
  return done;
}

/* ------------------------------------------------------------------ index */

export async function render(root, { params, settings, navigate }) {
  const [deck, done] = await Promise.all([loadAdjectives(), loadDone()]);
  const { items, comparisons } = deck;

  const wanted = params?.[0] ?? null;
  if (wanted === 'list') return renderList(root, items);
  if (wanted && modeById(wanted)) {
    return renderRound(root, wanted, deck, done, { settings, navigate });
  }

  const rows = progress(items, comparisons, done);
  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say('Pick a round. The superlative is the one worth your time.', 'idle');

  root.append(
    screenHead({ title: 'Adjectives', sub: `${plural(items.length, 'word')}, with both degrees`, back: '#/learn' }),
    el(
      'div',
      { class: 'card' },
      el('div', { class: 'row' }, amelie.el),
      el(
        'p',
        { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } },
        'Every comparative and superlative here is the one the dictionary publishes, not one worked out by rule — which is why grouss becomes am gréissten and not am groussten.',
      ),
    ),
    el(
      'a',
      { class: 'card', href: '#/adjectives/list', style: { display: 'block', marginBlockStart: 'var(--s3)' } },
      el(
        'div',
        { class: 'row' },
        el('span', { style: { fontSize: '24px' } }, '📋'),
        el(
          'div',
          { class: 'spacer' },
          el('p', { class: 'card__title' }, 'The whole table'),
          el('p', { class: 'card__note' }, 'Every adjective with its opposite, its comparative and its superlative.'),
        ),
      ),
    ),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s4)' } },
      ...rows.map((row) => {
        const complete = row.total > 0 && row.finished >= row.total;
        return el(
          'a',
          { class: `card${complete ? ' is-done' : ''}`, href: `#/adjectives/${row.id}` },
          el(
            'div',
            { class: 'row row--between' },
            el('span', { class: 'card__title' }, row.title),
            el('span', { class: 'chip' }, complete ? 'done' : `${row.finished} / ${row.total}`),
          ),
          el('p', { class: 'card__note' }, row.blurb),
          el(
            'div',
            { class: 'meter__track', style: { marginBlockStart: 'var(--s2)' } },
            el('div', {
              class: `meter__fill${complete ? ' is-pass' : ''}`,
              style: { width: `${row.total === 0 ? 0 : Math.max((row.finished / row.total) * 100, 2)}%` },
            }),
          ),
        );
      }),
    ),
  );
  return { destroy() {} };
}

/* ------------------------------------------------------------- the table */

function renderList(root, items) {
  const search = el('input', {
    class: 'field',
    type: 'search',
    placeholder: 'Find an adjective',
    'aria-label': 'Find an adjective',
    autocomplete: 'off',
  });
  const body = el('div', { class: 'stack' });
  const byId = new Map(items.map((item) => [item.id, item]));

  function draw() {
    const needle = search.value.trim().toLocaleLowerCase('lb');
    const shown = needle
      ? items.filter((item) => item.lb.toLocaleLowerCase('lb').includes(needle) || item.en.toLowerCase().includes(needle))
      : items;
    fill(
      body,
      ...(shown.length === 0
        ? [el('p', { class: 'card__note' }, 'Nothing matches that.')]
        : shown.map((item) =>
            el(
              'div',
              { class: 'card adj__row' },
              el(
                'div',
                { class: 'row row--between' },
                el('span', { class: 'adj__word' }, item.lb),
                el('span', { class: 'card__note' }, item.en),
              ),
              el(
                'div',
                { class: 'adj__forms' },
                el('span', {}, item.comparative),
                el('span', {}, item.superlative),
              ),
              item.oppositeIds.length > 0
                ? el(
                    'p',
                    { class: 'source-note' },
                    `opposite: ${item.oppositeIds.map((id) => byId.get(id)?.lb).filter(Boolean).join(', ')}`,
                  )
                : null,
              // Said plainly rather than hidden: gutt is the one adjective in
              // here whose degrees LOD files as separate headwords, so the link
              // is this app's assertion and not the dictionary's.
              item.irregular ? el('p', { class: 'source-note' }, 'irregular — LOD lists these as their own entries') : null,
            ),
          )),
    );
  }

  search.addEventListener('input', draw);
  draw();

  root.append(
    screenHead({ title: 'Every adjective', sub: `${plural(items.length, 'word')}`, back: '#/adjectives' }),
    el('div', { style: { marginBlockEnd: 'var(--s3)' } }, search),
    body,
  );
  return { destroy() {} };
}

/* ------------------------------------------------------------- one round */

function renderRound(root, mode, deck, done, { settings, navigate }) {
  const { items, comparisons } = deck;
  const byId = new Map(items.map((item) => [item.id, item]));
  const pool = poolFor(mode, items, comparisons);
  const plan = buildRound(mode, pool, done, { size: ROUND, seed: `${settings.playerId}:${mode}` });
  const named = modeById(mode);

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
    screenHead({ title: named.title, sub: `${plural(plan.length, 'question')}`, back: '#/adjectives' }),
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
    const question = questionFor(mode, item, { items, byId, random: seeded(`${mode}:${item.id}`) });

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
              finished.push(doneKey(mode, item));
              chimeCorrect();
              amelie.say(streak >= 3 ? `${streak} in a row!` : pickLine(AMELIE_LINES.correct ?? ['Right.']), 'celebrating');
            } else {
              streak = 0;
              resetChimeStreak();
              amelie.say('Not that one — the right answer is marked.', 'encouraging');
            }
            amelie.el.hidden = false;

            // The whole sentence, once the gap is filled. A comparison is only
            // instructive read end to end.
            if (question.sentence) {
              // The sentence whole, and what the missing word means — a
              // comparison you cannot read teaches nothing about comparing.
              note.textContent = question.english
                ? `${question.sentence}  (${question.answer} — ${question.english})`
                : question.sentence;
              note.hidden = false;
            } else if (mode !== 'meaning') {
              note.textContent = `${item.lb} — ${item.en} · ${item.comparative} · ${item.superlative}`;
              note.hidden = false;
            }

            fill(
              after,
              question.audioId
                ? button('Hear it', {
                    variant: 'secondary',
                    onclick: async () => {
                      unlock();
                      destroyClip();
                      clip = new Clip(question.audioId);
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

    flag.set({ playerId: settings.playerId, source: 'adjectives', id: item.id, label: question.sentence ?? item.lb });

    fill(
      body,
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'meter__label' }, `${index + 1} of ${plan.length}`),
        typeof question.prompt === 'string'
          ? el('p', { class: 'prompt__word' }, question.prompt)
          : el(
              'p',
              { class: 'prompt__sentence' },
              question.prompt.before,
              el('span', { class: 'cloze__gap' }, '____'),
              question.prompt.after,
            ),
        question.sub ? el('p', { class: 'card__note' }, question.sub) : null,
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
      button('Another round', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(`#/adjectives/${mode}`) }),
      button('Back to the rounds', { variant: 'secondary', onclick: () => navigate('#/adjectives') }),
    );
  }

  step();
  return { destroy: destroyClip };
}

export { MODES };
