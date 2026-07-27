/**
 * The journey — a vertical trail of topic nodes with Amelie parked at the one
 * you are on.
 *
 * Topic order is fixed per week from the shared seed, so both players walk the
 * same route and the Woch-Duell stays comparable.
 */

import { el, screenHead, formatPercent, plural, weekLabel } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { loadTopics, topicIcon, orderTopicsForWeek } from '../content.js';
import { listAttempts, listRecordings, listReviews, readinessFor, weekSeed, getStreak, PLAYERS } from '../store.js';

export async function render(root, { settings, navigate }) {
  const [topics, attempts, recordings, reviews, streak] = await Promise.all([
    loadTopics(),
    listAttempts(),
    listRecordings(),
    listReviews(),
    getStreak(settings.playerId),
  ]);

  const seed = weekSeed();
  const ordered = orderTopicsForWeek(topics, seed);
  const me = PLAYERS.find((player) => player.id === settings.playerId) ?? PLAYERS[0];
  const ready = readinessFor(settings.playerId, { attempts, recordings, reviews });

  // A topic counts as done once its listening set has been attempted.
  const doneTopics = new Map();
  for (const attempt of attempts.filter((a) => a.playerId === settings.playerId)) {
    const previous = doneTopics.get(attempt.topic);
    const score = attempt.total === 0 ? 0 : attempt.correct / attempt.total;
    if (!previous || score > previous) doneTopics.set(attempt.topic, score);
  }
  const currentIndex = ordered.findIndex((topic) => !doneTopics.has(topic.id));

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.say(AMELIE_LINES.journey, 'idle');

  root.append(
    screenHead({
      title: `Moien, ${me.name}`,
      sub: `Week of ${weekLabel(seed)} · ${plural(ready.answered, 'answer')} · ${formatPercent(ready.overallPct)} overall`,
      trailing: streak.current > 0 ? el('span', { class: 'chip chip--warn' }, `${streak.current}-day streak`) : null,
    }),
  );

  root.append(
    el(
      'div',
      { class: 'card', style: { display: 'flex', gap: 'var(--s3)', alignItems: 'center' } },
      amelie.el,
    ),
  );

  const list = el(
    'ol',
    { class: 'journey__list' },
    ...ordered.map((topic, index) => {
      const score = doneTopics.get(topic.id);
      const isDone = score !== undefined;
      const isCurrent = index === currentIndex || (currentIndex === -1 && index === 0);

      return el(
        'li',
        { class: 'journey__item' },
        el(
          'a',
          {
            class: `node${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`,
            href: `#/listening/${topic.id}`,
            'aria-label': `${topic.title_en}. ${isDone ? `Best ${Math.round(score * 100)} percent.` : 'Not started.'}`,
          },
          el(
            'span',
            { class: 'node__disc' },
            el('span', { class: 'node__emoji', 'aria-hidden': 'true' }, topicIcon(topic.id)),
            isCurrent ? amelieMarker() : null,
          ),
          el('span', { class: 'node__label' }, topic.title_en),
          el('span', { class: 'node__meta' }, isDone ? `${Math.round(score * 100)}%` : topic.title_lb),
        ),
      );
    }),
  );

  root.append(el('div', { class: 'journey' }, el('div', { class: 'journey__trail', 'aria-hidden': 'true' }), list));

  root.append(
    el(
      'p',
      { class: 'source-note', style: { marginBlockStart: 'var(--s5)' } },
      'Listening drills are built from native LOD recordings on the official 5+7+4 shape. The real INLL ',
      el('a', { href: 'https://www.inll.lu/fr/sproochentest/', target: '_blank', rel: 'noopener' }, 'sample test'),
      ' uses connected speech — try it when these feel easy.',
    ),
  );

  // Fly Amelie to the current node once the list has laid out.
  requestAnimationFrame(() => {
    const node = list.querySelector('.node.is-current');
    if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  void navigate;
  return { destroy() {} };
}

/** A small Amelie perched on the current node. */
function amelieMarker() {
  const marker = new Amelie({ size: 'sm', bubble: false });
  marker.setState('flying');
  marker.el.style.position = 'absolute';
  marker.el.style.insetBlockStart = '-26px';
  marker.el.style.insetInlineEnd = '-22px';
  return marker.el;
}
