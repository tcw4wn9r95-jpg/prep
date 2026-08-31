/**
 * The Woch-Duell.
 *
 * The scoreboard is the one bold moment in the app — everything else stays
 * quiet so that this reads as the thing worth coming back for.
 *
 * Points come from three places, and reviewing is weighted the highest on
 * purpose: if reviews get skipped the peer-examiner loop collapses, and
 * grading someone else is itself practice.
 *
 * The handicap exists because nobody keeps playing a game they always lose.
 */

import { el, screenHead, settingsButton, formatPercent, plural, weekLabel } from '../dom.js';
import { topicIcon } from '../content.js';
import { syncNow, lastSyncLabel } from '../sync.js';
import {
  PLAYERS,
  listAttempts,
  listRecordings,
  listReviews,
  listLearnSessions,
  readinessFor,
  getStreak,
  playerName,
  weekSeed,
  POINTS,
} from '../store.js';

/** Scale the trailing player's points once the 4-week gap gets discouraging. */
const HANDICAP_THRESHOLD = 250;
const HANDICAP_SCALE = 1.25;

export async function render(root, { settings }) {
  const [attempts, recordings, reviews, learnSessions] = await Promise.all([
    listAttempts(),
    listRecordings(),
    listReviews(),
    listLearnSessions(),
  ]);
  const seed = weekSeed();
  const streaks = Object.fromEntries(await Promise.all(PLAYERS.map(async (p) => [p.id, await getStreak(p.id)])));

  // Both sides of the scoreboard, with this device's own name applied to
  // whichever of them is its player. Substituted once here rather than at each
  // of the four places a name is printed, so a fifth cannot be forgotten. The
  // id is untouched: it is what every score below is keyed by.
  const roster = PLAYERS.map((player) => ({ ...player, name: playerName(settings, player.id) }));

  const weekly = roster.map((player) => ({
    player,
    ...pointsFor(player.id, { attempts, recordings, reviews, learnSessions, since: seed }),
  }));
  const rolling = roster.map((player) => ({
    player,
    ...pointsFor(player.id, { attempts, recordings, reviews, learnSessions, since: seed - 4 }),
  }));

  applyHandicap(weekly, rolling);

  const leader = weekly[0].total === weekly[1].total ? null : weekly.reduce((a, b) => (a.total > b.total ? a : b));

  root.append(
    screenHead({
      title: 'Woch-Duell',
      sub: `Week of ${weekLabel(seed)} · both of you get the same set`,
      trailing: settingsButton('#/settings', 'Duel settings'),
    }),
  );

  /* --- the scoreboard */
  root.append(
    el(
      'section',
      { class: 'scoreboard' },
      el('p', { class: 'scoreboard__label' }, 'This week'),
      el(
        'div',
        { class: 'scoreboard__grid' },
        ...[weekly[0], null, weekly[1]].map((side) =>
          side === null
            ? el('span', { class: 'scoreboard__vs' }, 'VS')
            : el(
                'div',
                { class: `scoreboard__side${leader?.player.id === side.player.id ? ' is-leading' : ''}` },
                el('p', { class: 'scoreboard__name' }, side.player.name),
                el('p', { class: 'scoreboard__score' }, String(side.total)),
                side.handicapped ? el('span', { class: 'scoreboard__chip' }, 'boosted') : null,
              ),
        ),
      ),
      el(
        'p',
        { class: 'scoreboard__foot' },
        leader ? `${leader.player.name} takes the week so far.` : 'Level. Whoever reviews next goes ahead.',
      ),
    ),
  );

  /* --- where the points came from */
  root.append(
    el(
      'div',
      { class: 'stack stack--lg', style: { marginBlockStart: 'var(--s5)' } },
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'meter__label' }, 'Where the points come from'),
        el(
          'div',
          { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
          ...weekly.map((side) =>
            el(
              'div',
              {},
              el('div', { class: 'row row--between' },
                el('span', { class: 'meter__label' }, side.player.name),
                el('span', { class: 'chip' }, `${side.total} pts`)),
              el(
                'div',
                { class: 'row', style: { gap: 'var(--s2)', marginBlockStart: 'var(--s2)', flexWrap: 'wrap' } },
                el('span', { class: 'chip' }, plural(side.answers, 'answer')),
                el('span', { class: 'chip' }, plural(side.cards, 'card')),
                el('span', { class: 'chip' }, plural(side.recordings, 'recording')),
                el('span', { class: side.reviews > 0 ? 'chip chip--ok' : 'chip' }, plural(side.reviews, 'review')),
                streaks[side.player.id].current > 0
                  ? el('span', { class: 'chip chip--warn' }, `${streaks[side.player.id].current}-day streak`)
                  : null,
              ),
            ),
          ),
        ),
        el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
          `Answer ${POINTS.perCorrectAnswer} · card ${POINTS.perLearnCorrect} · record ${POINTS.perRecording} · review ${POINTS.perReview}. ` +
          'Reviewing is worth most because it is the score of record — and it is practice.'),
        // The duel resets every Monday, but readiness is all-time. Without
        // saying so, a week that starts at zero looks like lost work.
        el('p', { class: 'source-note' },
          'This board counts this week only and resets on Monday. Readiness below counts everything you have ever done.'),
      ),

      /* --- readiness side by side: the number that actually matters */
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'meter__label' }, 'Readiness, head to head'),
        el(
          'div',
          { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
          ...roster.map((player) => {
            const ready = readinessFor(player.id, { attempts, recordings, reviews });
            return el(
              'div',
              { class: 'row row--between' },
              el('span', { class: 'meter__label' }, player.name),
              el(
                'span',
                { class: 'row', style: { gap: 'var(--s2)' } },
                el('span', { class: ready.passesSpeaking ? 'chip chip--ok' : 'chip' }, `speaking ${formatPercent(ready.speakingPct)}`),
                el('span', { class: ready.passesOverall ? 'chip chip--ok' : 'chip' }, `overall ${formatPercent(ready.overallPct)}`),
              ),
            );
          }),
        ),
        el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
          'Pass is over 50% on speaking, or over 50% overall.'),
      ),

      topicHeadToHead(attempts, roster),
      syncCard(settings),
    ),
  );

  return { destroy() {} };
}

function pointsFor(playerId, { attempts, recordings, reviews, learnSessions, since }) {
  const mineAttempts = attempts.filter((a) => a.playerId === playerId && (a.weekSeed ?? 0) >= since);
  const mineRecordings = recordings.filter((r) => r.playerId === playerId);
  const mineReviews = reviews.filter((r) => r.reviewerId === playerId);
  const mineLearn = learnSessions.filter((s) => s.playerId === playerId && (s.weekSeed ?? 0) >= since);

  const answers = mineAttempts.reduce((sum, a) => sum + a.correct, 0);
  // Vocabulary work used to earn nothing here, even though the drill's finish
  // card announced points for it — a promise no scoreboard kept.
  const cards = mineLearn.reduce((sum, session) => sum + session.correct, 0);
  return {
    answers,
    cards,
    recordings: mineRecordings.length,
    reviews: mineReviews.length,
    base:
      answers * POINTS.perCorrectAnswer +
      cards * POINTS.perLearnCorrect +
      mineRecordings.length * POINTS.perRecording +
      mineReviews.length * POINTS.perReview,
    total: 0,
    handicapped: false,
  };
}

/**
 * If the rolling four-week gap has grown past the threshold, scale the trailing
 * player's weekly points. Stated in the UI as "boosted" rather than hidden —
 * a handicap you cannot see feels like a bug.
 */
function applyHandicap(weekly, rolling) {
  for (const side of weekly) side.total = side.base;

  const [a, b] = rolling;
  const gap = Math.abs(a.base - b.base);
  if (gap <= HANDICAP_THRESHOLD) return;

  const trailingId = a.base < b.base ? a.player.id : b.player.id;
  for (const side of weekly) {
    if (side.player.id !== trailingId) continue;
    side.total = Math.round(side.base * HANDICAP_SCALE);
    side.handicapped = true;
  }
}

/** Per-topic, so it is visible that one of you owns `work` and neither owns `stot`. */
/**
 * `roster` is passed in rather than reached for: it is a local of `render`, and
 * this function is a sibling of it, so reading it here was a ReferenceError
 * that took the whole screen down — but only once there was an attempt to break
 * down by topic, which is why it survived a walkthrough that starts empty.
 */
function topicHeadToHead(attempts, roster) {
  if (attempts.length === 0) return null;

  const topics = new Map();
  for (const attempt of attempts) {
    const row = topics.get(attempt.topic) ?? {};
    const side = row[attempt.playerId] ?? { correct: 0, total: 0 };
    side.correct += attempt.correct;
    side.total += attempt.total;
    row[attempt.playerId] = side;
    topics.set(attempt.topic, row);
  }

  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'meter__label' }, 'By topic'),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      ...[...topics.entries()].map(([topic, row]) =>
        el(
          'div',
          { class: 'row row--between' },
          el('span', { class: 'meter__label' }, `${topicIcon(topic)} ${topic}`),
          el(
            'span',
            { class: 'row', style: { gap: 'var(--s2)' } },
            ...roster.map((player) => {
              const side = row[player.id];
              const pct = side ? Math.round((side.correct / side.total) * 100) : null;
              return el('span', { class: pct !== null && pct > 50 ? 'chip chip--ok' : 'chip' }, `${player.initial} ${pct === null ? '—' : `${pct}%`}`);
            }),
          ),
        ),
      ),
    ),
  );
}

function syncCard(settings) {
  const status = el('p', { class: 'source-note' }, lastSyncLabel());
  return el(
    'div',
    { class: 'card' },
    el('div', { class: 'row row--between' },
      el('span', { class: 'meter__label' }, 'Shared scoreboard'),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost',
        onclick: async () => {
          status.textContent = 'Syncing…';
          const result = await syncNow(settings);
          status.textContent = result.message;
        },
      }, 'Sync now')),
    status,
    settings.workerUrl
      ? null
      : el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } },
          'No Worker configured, so scores stay on this device. Both of you can still play — compare the numbers out loud.'),
  );
}
