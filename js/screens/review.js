/**
 * The peer examiner.
 *
 * The real exam is judged by two people: an interlocutor who gives one global
 * mark worth 20%, and an assessor who fills the four-criterion grid worth 80%.
 * This screen is both, because there are only two of you — playback on one
 * side, the official grid on the other, one tap per band.
 *
 * This is the score of record. Nothing here is machine-generated.
 */

import { el, fill, screenHead, button, formatClock, formatPercent } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { topicIcon } from '../content.js';
import {
  CRITERIA,
  RUBRIC_MAX,
  EXAMINER_WEIGHT,
  listRecordings,
  listReviews,
  saveReview,
  reviewPercent,
  otherPlayer,
  POINTS,
} from '../store.js';

export async function render(root, { params, settings, navigate }) {
  const [recordings, reviews] = await Promise.all([listRecordings(), listReviews()]);
  const partner = otherPlayer(settings.playerId);

  // You review your partner's work, never your own.
  const reviewed = new Set(reviews.map((review) => review.recordingId));
  const queue = recordings
    .filter((record) => record.playerId !== settings.playerId && !reviewed.has(record.id))
    .sort((a, b) => a.at.localeCompare(b.at));

  const target = params[0] ? recordings.find((record) => record.id === params[0]) : queue[0];

  if (!target) return renderEmpty(root, { partner, recordings, reviews, settings, navigate });
  return renderGrid(root, { record: target, remaining: queue.length, settings, navigate });
}

function renderEmpty(root, { partner, recordings, reviews, settings, navigate }) {
  const amelie = new Amelie({ size: 'md', bubble: true });
  const mine = recordings.filter((record) => record.playerId === settings.playerId);
  const myReviewed = reviews.filter((review) => mine.some((record) => record.id === review.recordingId));

  amelie.say(
    mine.length === 0
      ? 'Nothing to review yet. Record a speaking answer and your partner will score it.'
      : `Nothing waiting from ${partner.name} right now.`,
    'idle',
  );

  root.append(
    screenHead({ title: 'Review', sub: `Score ${partner.name}’s answers` }),
    el('div', { class: 'card' }, amelie.el),
    el(
      'div',
      { class: 'empty' },
      el('p', {}, `${partner.name} has nothing waiting for you.`),
      mine.length > 0
        ? el('p', { class: 'source-note' }, `${myReviewed.length} of your ${mine.length} answers have been scored.`)
        : null,
      button('Record an answer', { variant: 'primary', onclick: () => navigate('#/speaking') }),
    ),
  );
  return { destroy() {} };
}

function renderGrid(root, { record, remaining, settings, navigate }) {
  const partner = otherPlayer(settings.playerId);
  /** @type {Record<string, number>} */
  const bands = {};
  let globalNote = null;
  let objectUrl = null;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say(AMELIE_LINES.reviewIntro, 'idle');

  objectUrl = URL.createObjectURL(record.blob);
  const audio = el('audio', { controls: '', src: objectUrl, preload: 'metadata', style: { width: '100%' } });

  const runningTotal = el('p', { class: 'meter__value' }, '—');
  const submit = button(`Submit score (+${POINTS.perReview} points)`, {
    variant: 'primary',
    class: 'btn btn--primary btn--block',
    disabled: true,
    onclick: async () => {
      const saved = await saveReview({
        recordingId: record.id,
        reviewerId: settings.playerId,
        bands,
        globalNote,
        note: noteField.value.trim(),
      });
      showResult(saved);
    },
  });

  function refresh() {
    const filled = CRITERIA.every((criterion) => bands[criterion.id] !== undefined) && globalNote !== null;
    submit.disabled = !filled;
    const gridTotal = CRITERIA.reduce((sum, criterion) => sum + (bands[criterion.id] ?? 0), 0);
    runningTotal.textContent = filled
      ? `${formatPercent(reviewPercent({ bands, globalNote }))}`
      : `${gridTotal} / ${RUBRIC_MAX}`;
  }

  /** One criterion row: name, the official description, six bands. */
  function criterionRow(criterion) {
    const buttons = [0, 1, 2, 3, 4, 5].map((band) =>
      el(
        'button',
        {
          type: 'button',
          class: 'band',
          'aria-label': `${criterion.name}: ${band} out of 5`,
          'aria-pressed': 'false',
          onclick: (event) => {
            bands[criterion.id] = band;
            for (const node of buttons) {
              const isMe = node === event.currentTarget;
              node.classList.toggle('is-picked', isMe);
              node.setAttribute('aria-pressed', isMe ? 'true' : 'false');
            }
            refresh();
          },
        },
        String(band),
      ),
    );

    return el(
      'div',
      { class: 'card' },
      el('div', { class: 'criterion__head' }, el('span', { class: 'criterion__name' }, criterion.name)),
      el('p', { class: 'criterion__desc' }, criterion.desc_en),
      el('div', { class: 'bands' }, ...buttons),
    );
  }

  const globalButtons = [0, 1, 2, 3, 4, 5].map((band) =>
    el(
      'button',
      {
        type: 'button',
        class: 'band',
        'aria-label': `Global impression: ${band} out of 5`,
        'aria-pressed': 'false',
        onclick: (event) => {
          globalNote = band;
          for (const node of globalButtons) {
            const isMe = node === event.currentTarget;
            node.classList.toggle('is-picked', isMe);
            node.setAttribute('aria-pressed', isMe ? 'true' : 'false');
          }
          refresh();
        },
      },
      String(band),
    ),
  );

  const noteField = el('textarea', {
    class: 'option',
    rows: '3',
    placeholder: 'One thing to fix next time (optional)',
    style: { display: 'block', width: '100%', resize: 'vertical' },
  });

  const body = el(
    'div',
    { class: 'stack stack--lg' },
    el(
      'div',
      { class: 'card' },
      el('div', { class: 'row row--between' },
        el('span', { class: 'chip' }, `${topicIcon(record.topic)} ${record.topic}`),
        el('span', { class: 'chip' }, formatClock(record.durationMs))),
      el('p', { class: 'card__note', style: { marginBlock: 'var(--s2)' } },
        record.kind === 'interview' ? 'Part 2a · interview' : 'Part 2b · image description'),
      audio,
      record.prompts?.length
        ? el('details', { style: { marginBlockStart: 'var(--s3)' } },
            el('summary', { class: 'source-note' }, 'Questions they answered'),
            el('ul', { class: 'stack', style: { marginBlockStart: 'var(--s2)' } },
              ...record.prompts.map((prompt) => el('li', { class: 'source-note' }, prompt))))
        : null,
    ),
    amelie.el,
    el('div', { class: 'rubric' }, ...CRITERIA.map(criterionRow)),
    el(
      'div',
      { class: 'card' },
      el('div', { class: 'criterion__head' }, el('span', { class: 'criterion__name' }, 'Global impression')),
      el('p', { class: 'criterion__desc' },
        `The interlocutor’s single mark. It carries ${Math.round(EXAMINER_WEIGHT.interlocuteur * 100)}% of the result; the grid above carries ${Math.round(EXAMINER_WEIGHT.assessor * 100)}%.`),
      el('div', { class: 'bands' }, ...globalButtons),
    ),
    noteField,
    el('div', { class: 'card', style: { textAlign: 'center' } }, el('p', { class: 'meter__label' }, 'Score so far'), runningTotal),
    submit,
    el('p', { class: 'source-note' }, 'Criteria and weighting follow the INLL evaluation grid published at inll.lu.'),
  );

  root.append(
    screenHead({
      title: `Score ${partner.name}`,
      sub: remaining > 1 ? `${remaining} waiting` : 'Last one waiting',
      back: '#/journey',
    }),
    body,
  );

  function showResult(saved) {
    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(AMELIE_LINES.reviewDone);
    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el('div', { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, `${partner.name}’s score`),
          el('p', { class: 'meter__value' }, formatPercent(reviewPercent(saved))),
          el('p', { class: 'card__note' }, `+${POINTS.perReview} points to you for reviewing`)),
        button(remaining > 1 ? 'Review the next one' : 'Back to the journey', {
          variant: 'primary',
          class: 'btn btn--primary btn--block',
          onclick: () => navigate(remaining > 1 ? '#/review' : '#/journey'),
        }),
      ),
    );
  }

  refresh();
  return {
    destroy() {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
  };
}
