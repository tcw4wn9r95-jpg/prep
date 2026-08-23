/**
 * Readiness — the headline number.
 *
 * Not points, not a level: estimated readiness against the thresholds the
 * examiners actually use. INLL passes you on **over 50% in the speaking part,
 * or over 50% overall**, so both are shown, because they lead to different
 * revision. A leaderboard that does not predict passing is decoration.
 */

import { el, screenHead, formatPercent, plural } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { topicIcon } from '../content.js';
import { listAttempts, listRecordings, listReviews, readinessFor, PLAYERS, CRITERIA, reviewPercent, playerName } from '../store.js';

export async function render(root, { settings }) {
  const [attempts, recordings, reviews] = await Promise.all([listAttempts(), listRecordings(), listReviews()]);
  const me = PLAYERS.find((player) => player.id === settings.playerId) ?? PLAYERS[0];
  const ready = readinessFor(settings.playerId, { attempts, recordings, reviews });

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say(AMELIE_LINES.readiness, 'idle');

  root.append(
    screenHead({ title: 'Readiness', sub: `${playerName(settings)} · against the real thresholds` }),
    el('div', { class: 'card' }, amelie.el),
  );

  root.append(
    el(
      'div',
      { class: 'stack stack--lg', style: { marginBlockStart: 'var(--s4)' } },
      meter({
        label: 'Speaking (A2)',
        value: ready.speakingPct,
        caption:
          ready.reviewCount === 0
            ? 'No peer scores yet. This is the part you must pass.'
            : `${ready.reviewCount} peer ${ready.reviewCount === 1 ? 'score' : 'scores'} · pass mark is over 50%`,
        pass: ready.passesSpeaking,
      }),
      meter({
        label: 'Listening (B1)',
        value: ready.listeningPct,
        caption: `${plural(ready.answered, 'answer')} so far`,
        pass: ready.listeningPct !== null && ready.listeningPct > 50,
      }),
      meter({
        label: 'Overall',
        value: ready.overallPct,
        caption: 'The second route: over 50% overall also passes',
        pass: ready.passesOverall,
      }),
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'meter__label' }, 'What would move it most'),
        el('p', { style: { marginBlockStart: 'var(--s2)' } }, ready.advice),
      ),
      verdict(ready),
      criteriaBreakdown(settings.playerId, { recordings, reviews }),
      topicBreakdown(settings.playerId, attempts),
      el(
        'p',
        { class: 'source-note' },
        'Thresholds and weighting from the INLL evaluation grid. This is an estimate from your own practice, not a prediction of the examiners’ marks.',
      ),
    ),
  );

  return { destroy() {} };
}

function meter({ label, value, caption, pass }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return el(
    'div',
    { class: 'card' },
    el(
      'div',
      { class: 'meter' },
      el('div', { class: 'meter__head' }, el('span', { class: 'meter__label' }, label), el('span', { class: 'meter__value' }, formatPercent(value))),
      el(
        'div',
        { class: 'meter__track' },
        el('div', { class: `meter__fill${value === null ? '' : pass ? ' is-pass' : ' is-fail'}`, style: { width: `${width}%` } }),
        // The pass mark, drawn where the examiners put it.
        el('div', { class: 'meter__threshold', title: 'Pass mark: 50%' }),
      ),
      el('p', { class: 'meter__caption' }, caption),
    ),
  );
}

function verdict(ready) {
  if (ready.speakingPct === null && ready.listeningPct === null) {
    return el('div', { class: 'card' }, el('p', {}, 'Do one listening set and record one answer, and this page starts telling you something.'));
  }
  const passing = ready.passesSpeaking || ready.passesOverall;
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'meter__label' }, 'On today’s practice'),
    el(
      'p',
      { style: { marginBlockStart: 'var(--s2)', fontWeight: '650' } },
      passing
        ? ready.passesSpeaking
          ? 'You would pass on the speaking route.'
          : 'You would pass on the overall route, but speaking is still under the line.'
        : 'You would not pass yet on either route.',
    ),
  );
}

/** Which of the four official criteria is holding the speaking score down. */
function criteriaBreakdown(playerId, { recordings, reviews }) {
  const mine = new Set(recordings.filter((record) => record.playerId === playerId).map((record) => record.id));
  const myReviews = reviews.filter((review) => mine.has(review.recordingId));
  if (myReviews.length === 0) return null;

  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'meter__label' }, 'Speaking, by criterion'),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      ...CRITERIA.map((criterion) => {
        const average =
          myReviews.reduce((sum, review) => sum + (review.bands[criterion.id] ?? 0), 0) / myReviews.length;
        return el(
          'div',
          { class: 'meter' },
          el('div', { class: 'meter__head' },
            el('span', { class: 'meter__label' }, criterion.name),
            el('span', { class: 'chip' }, `${average.toFixed(1)} / 5`)),
          el('div', { class: 'meter__track' }, el('div', { class: `meter__fill${average > 2.5 ? ' is-pass' : ' is-fail'}`, style: { width: `${(average / 5) * 100}%` } })),
        );
      }),
    ),
    el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
      `Average of ${myReviews.length} peer ${myReviews.length === 1 ? 'score' : 'scores'}. ` +
      `Latest: ${formatPercent(reviewPercent(myReviews[myReviews.length - 1]))}.`),
  );
}

/** Per-topic listening, so it is visible where the gaps are. */
function topicBreakdown(playerId, attempts) {
  const mine = attempts.filter((attempt) => attempt.playerId === playerId);
  if (mine.length === 0) return null;

  const byTopic = new Map();
  for (const attempt of mine) {
    const row = byTopic.get(attempt.topic) ?? { correct: 0, total: 0 };
    row.correct += attempt.correct;
    row.total += attempt.total;
    byTopic.set(attempt.topic, row);
  }

  const rows = [...byTopic.entries()]
    .map(([topic, row]) => ({ topic, pct: (row.correct / row.total) * 100, ...row }))
    .sort((a, b) => a.pct - b.pct);

  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'meter__label' }, 'Listening, by topic'),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      ...rows.map((row) =>
        el(
          'div',
          { class: 'meter' },
          el('div', { class: 'meter__head' },
            el('span', { class: 'meter__label' }, `${topicIcon(row.topic)} ${row.topic}`),
            el('span', { class: 'chip' }, `${row.correct}/${row.total}`)),
          el('div', { class: 'meter__track' }, el('div', { class: `meter__fill${row.pct > 50 ? ' is-pass' : ' is-fail'}`, style: { width: `${row.pct}%` } })),
        ),
      ),
    ),
  );
}
