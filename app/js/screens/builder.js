/**
 * Sentence Builder — the screen. See `app/js/sentences.js` for what it asks
 * and why it asks it that way.
 *
 * Two views behind one route. `#/builder` is the topic board — eighteen exam
 * topics with how far through each one you are. `#/builder/<topic>` runs a
 * round of eight sentences in it.
 *
 * ## Why it does not touch the Leitner boxes or the daily count
 *
 * Asked for as "it doesn't count toward daily goals", and that is also the
 * honest design. The daily goal counts *cards answered*, and one sentence here
 * is worth several of those in effort — folding it in would let a good ten
 * minutes on this screen tick a box that the spaced-repetition schedule then
 * behaves as though it had seen. It keeps its own list of finished sentences
 * in settings, and it touches the streak, because turning up is the thing
 * worth rewarding.
 *
 * It is still **required**: Today lists it as a step of the day. Required and
 * uncounted is the combination the request names, and they are not in tension
 * — "you should do this every day" and "this is not how the day is measured"
 * are different statements.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, unlock } from '../audio.js';
import { loadSentences, topicIcon, loadTopics } from '../content.js';
import { touchStreak, getSettings, saveSettings, markBuilderDone } from '../store.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { flagSlot } from '../flag.js';
import {
  ROUND,
  buildRound,
  tilesFor,
  checkBuilt,
  markPlaces,
  topicProgress,
  sourceLabel,
  wordsOf,
} from '../sentences.js';

/* -------------------------------------------------------------- progress */

/** Finished sentence ids, kept in settings — see the note in verbschool.js. */
async function loadDone() {
  const settings = await getSettings();
  return new Set(settings.builder ?? []);
}

async function markDone(ids) {
  const settings = await getSettings();
  const done = new Set(settings.builder ?? []);
  let changed = false;
  for (const id of ids) if (!done.has(id)) { done.add(id); changed = true; }
  if (changed) await saveSettings({ builder: [...done] });
  return done;
}

/* ----------------------------------------------------------------- index */

export async function render(root, { params, settings, navigate }) {
  const [items, topics, done] = await Promise.all([loadSentences(), loadTopics(), loadDone()]);
  const names = new Map((topics ?? []).map((topic) => [topic.id, topic.title_en]));

  const wanted = params?.[0] ?? null;
  if (wanted && items.some((item) => item.topic === wanted)) {
    return renderRound(root, wanted, items, done, { settings, navigate, name: names.get(wanted) ?? wanted });
  }

  const rows = topicProgress(items, done);
  const finished = rows.reduce((sum, row) => sum + row.finished, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say(
    finished === 0
      ? 'Pick a topic. I show you the English, you build the Luxembourgish.'
      : `${finished} of ${total} sentences built. Keep going.`,
    'idle',
  );

  root.append(
    screenHead({ title: 'Sentence Builder', sub: 'Say it in Luxembourgish', back: '#/today' }),
    el(
      'div',
      { class: 'card' },
      el('div', { class: 'row' }, amelie.el),
      el(
        'p',
        { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } },
        'You get the English and a pile of Luxembourgish words. Tap them into order. Every sentence is one somebody really wrote — the exam answers come from a tutor, the rest from the dictionary.',
      ),
      el(
        'div',
        { class: 'meter__track', style: { marginBlockStart: 'var(--s3)' } },
        el('div', {
          class: `meter__fill${finished >= total && total > 0 ? ' is-pass' : ''}`,
          style: { width: `${total === 0 ? 0 : Math.max((finished / total) * 100, 2)}%` },
        }),
      ),
      el('p', { class: 'source-note' }, `${finished} of ${plural(total, 'sentence')} built`),
    ),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s4)' } },
      ...rows.map((row) => {
        const complete = row.finished >= row.total;
        return el(
          'a',
          { class: `card builder__topic${complete ? ' is-done' : ''}`, href: `#/builder/${row.topic}` },
          el(
            'div',
            { class: 'row' },
            el('span', { style: { fontSize: '24px' } }, topicIcon(row.topic)),
            el(
              'div',
              { class: 'spacer' },
              el('p', { class: 'card__title' }, names.get(row.topic) ?? row.topic),
              el(
                'p',
                { class: 'card__note' },
                row.answers > 0 ? `${plural(row.answers, 'real exam answer')}` : 'Dictionary sentences',
              ),
            ),
            el('span', { class: 'chip' }, complete ? 'done' : `${row.finished} / ${row.total}`),
          ),
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

/* ------------------------------------------------------------- one round */

function renderRound(root, topic, items, done, { settings, navigate, name }) {
  const plan = buildRound(items, done, { topic, size: ROUND, seed: `${settings.playerId}:${topic}` });
  const body = el('div', { class: 'stack drill__body' });
  const amelie = new Amelie({ size: 'sm', bubble: true });
  const flag = flagSlot();

  let index = 0;
  let correct = 0;
  let streak = 0;
  let best = 0;
  const built = [];
  let clip = null;

  const destroyClip = () => {
    if (clip) { clip.destroy(); clip = null; }
  };

  const progressFill = el('div', { class: 'meter__fill' });
  root.append(
    screenHead({ title: name, sub: `${plural(plan.length, 'sentence')}`, back: '#/builder' }),
    el('div', { class: 'meter__track', style: { marginBlockEnd: 'var(--s3)' } }, progressFill),
    body,
  );

  if (plan.length === 0) {
    fill(body, el('div', { class: 'card' }, el('p', { class: 'card__note' }, 'No sentences for this topic yet.')));
    return { destroy() {} };
  }

  function step() {
    destroyClip();
    amelie.say(null, 'idle');
    amelie.el.hidden = true;
    if (index >= plan.length) return finish();

    const item = plan[index];
    progressFill.style.width = `${(index / plan.length) * 100}%`;
    const { tiles, answer } = tilesFor(item, items);

    /** @type {Array<{id: string, word: string}>} */
    let picked = [];
    let answered = false;

    const slots = el('div', { class: 'builder__slots', 'aria-live': 'polite' });
    const bank = el('div', { class: 'builder__bank' });
    const feedback = el('p', { class: 'drill__rule', hidden: true });
    const after = el('div', { hidden: true });
    const check = button('Check', { variant: 'primary', class: 'btn btn--primary btn--block', disabled: true, onclick: submit });

    const buttons = new Map(
      tiles.map((tile) => [
        tile.id,
        el('button', { type: 'button', class: 'builder__tile', onclick: () => take(tile) }, tile.word),
      ]),
    );

    function draw() {
      fill(
        slots,
        ...(picked.length === 0
          ? [el('span', { class: 'builder__empty' }, 'Tap the words in order')]
          : picked.map((tile, at) =>
              el(
                'button',
                {
                  type: 'button',
                  class: `builder__slot${answered ? (places[at] ? ' is-correct' : ' is-wrong') : ''}`,
                  'aria-label': `Remove ${tile.word}`,
                  onclick: () => drop(tile),
                },
                tile.word,
              ),
            )),
      );
      check.disabled = picked.length === 0 || answered;
    }

    let places = [];

    function take(tile) {
      if (answered || picked.some((chosen) => chosen.id === tile.id)) return;
      picked = [...picked, tile];
      buttons.get(tile.id).classList.add('is-used');
      draw();
    }

    function drop(tile) {
      if (answered) return;
      picked = picked.filter((chosen) => chosen.id !== tile.id);
      buttons.get(tile.id).classList.remove('is-used');
      draw();
    }

    function submit() {
      if (answered || picked.length === 0) return;
      answered = true;
      const result = checkBuilt(picked, answer);
      places = result.correct ? picked.map(() => true) : markPlaces(picked, answer);
      draw();
      for (const node of buttons.values()) node.disabled = true;
      check.hidden = true;

      if (result.correct) {
        correct += 1;
        streak += 1;
        best = Math.max(best, streak);
        built.push(item.id);
        chimeCorrect();
        amelie.say(streak >= 3 ? `${streak} in a row!` : pickLine(AMELIE_LINES.correct ?? ['Right.']), 'celebrating');
      } else {
        streak = 0;
        resetChimeStreak();
        // The published sentence, in full. A word-order mistake is only
        // instructive next to the order that was wanted.
        feedback.replaceChildren(el('strong', {}, 'The sentence is: '), document.createTextNode(answer));
        feedback.hidden = false;
        amelie.say('Not quite — read it once more and carry on.', 'encouraging');
      }
      amelie.el.hidden = false;

      fill(
        after,
        item.audioId
          ? button('Hear it', {
              variant: 'secondary',
              onclick: async () => {
                unlock();
                destroyClip();
                clip = new Clip(item.audioId);
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
    }

    fill(bank, ...buttons.values());
    draw();

    flag.set({ playerId: settings.playerId, source: 'builder', id: item.id, label: item.lb });

    fill(
      body,
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'meter__label' }, `${index + 1} of ${plan.length} · ${sourceLabel(item)}`),
        // The exam question this sentence answers, where there is one. It turns
        // "translate this" into "answer this", which is the task the exam sets.
        //
        // A tutor's reply runs two to four sentences, so most of these are a
        // *part* of an answer rather than the whole of one, and the card says
        // which. Presenting the third sentence of a reply as the answer to the
        // question reads as a non sequitur — "I get a headache." under "Do you
        // use electronic books?" — and tells the learner to produce the wrong
        // thing.
        item.question_en
          ? el(
              'p',
              { class: 'builder__question' },
              item.opensAnswer ? `“${item.question_en}”` : `Part of an answer to “${item.question_en}”`,
            )
          : null,
        el('p', { class: 'builder__en' }, item.en),
      ),
      el('p', { class: 'drill__instruction' }, item.opensAnswer ? 'Answer it in Luxembourgish' : 'Say it in Luxembourgish'),
      slots,
      bank,
      check,
      feedback,
      amelie.el,
      after,
      flag.el,
    );
  }

  async function finish() {
    destroyClip();
    progressFill.style.width = '100%';
    progressFill.classList.add('is-pass');
    if (built.length > 0) await markDone(built);
    // Ticks Today's step. Finishing the round is what counts, not getting them
    // all right — the day's requirement is to have sat down and built
    // sentences, and marking it on a perfect round only would make a hard
    // topic a reason to avoid the activity.
    await markBuilderDone();
    touchStreak(settings.playerId).catch(() => {});

    const perfect = correct === plan.length;
    if (perfect) amelie.celebrate('Every one. That is exam standard.');
    else amelie.say(`${correct} of ${plan.length}. The ones you missed come back.`, 'idle');
    amelie.el.hidden = false;

    fill(
      body,
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'card__title' }, perfect ? 'Perfect round' : `${correct} of ${plan.length}`),
        el('p', { class: 'card__note' }, best > 1 ? `Best run: ${best} in a row.` : 'Every sentence you build is one you could say out loud.'),
      ),
      amelie.el,
      button('Another round', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(`#/builder/${topic}`) }),
      button('Back to the topics', { variant: 'secondary', onclick: () => navigate('#/builder') }),
    );
  }

  step();
  return { destroy: destroyClip };
}

/** Exported for the walkthrough, which needs to know how long a round is. */
export const roundSize = ROUND;
export { wordsOf };
