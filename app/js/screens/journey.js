/**
 * The journey — a vertical trail of topic nodes with Amelie parked at the one
 * you are on.
 *
 * Topic order is fixed per week from the shared seed, so both players walk the
 * same route and the Woch-Duell stays comparable.
 */

import { el, screenHead, formatPercent, plural, weekLabel } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { loadTopics, loadVocab, loadVerbs, topicIcon, orderTopicsForWeek } from '../content.js';
import { listAttempts, listRecordings, listReviews, readinessFor, learnProgress, weekSeed, getStreak, PLAYERS, STRANDS } from '../store.js';

export async function render(root, { settings, navigate }) {
  const [topics, attempts, recordings, reviews, streak, vocabItems, verbItems] = await Promise.all([
    loadTopics(),
    listAttempts(),
    listRecordings(),
    listReviews(),
    getStreak(settings.playerId),
    loadVocab(),
    loadVerbs(),
  ]);
  // Productive mastery, not receptive: this card sits above the speaking
  // module on the journey, and being able to say a word is what feeds it.
  const [vocabProgress, verbProgress] = await Promise.all([
    learnProgress(settings.playerId, 'vocab', STRANDS.prod, vocabItems.length),
    learnProgress(settings.playerId, 'verb', STRANDS.prod, verbItems.length),
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

  root.append(basicsSection(vocabItems, vocabProgress, verbItems, verbProgress));

  root.append(el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)' } }, '2 · Listening'));

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

  root.append(el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)' } }, '3 · Speaking'));
  root.append(speakingSection(ready));

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

/** Compact "1 · Basics" summary card — vocab + verb progress combined, linking to Learn. */
function basicsSection(vocabItems, vocabProgress, verbItems, verbProgress) {
  const totalItems = vocabItems.length + verbItems.length;
  const totalMastered = vocabProgress.mastered + verbProgress.mastered;
  const pct = totalItems === 0 ? 0 : Math.round((totalMastered / totalItems) * 100);

  return el(
    'div',
    { class: 'stack', style: { marginBlockStart: 'var(--s5)' } },
    el('p', { class: 'meter__label' }, '1 · Basics'),
    el(
      'a',
      { class: 'card', href: '#/learn', style: { display: 'block' } },
      el(
        'div',
        { class: 'row' },
        el('span', { style: { fontSize: '28px' } }, '📇'),
        el(
          'div',
          { class: 'spacer' },
          el('p', { class: 'card__title' }, 'Vocabulary & verbs'),
          el('p', { class: 'card__note' }, `${totalMastered} of ${totalItems} you can say without help`),
        ),
        el('span', { class: 'meter__value' }, `${pct}%`),
      ),
      el(
        'div',
        { class: 'meter__track', style: { marginBlockStart: 'var(--s3)' } },
        el('div', { class: `meter__fill${pct > 50 ? ' is-pass' : ''}`, style: { width: `${pct}%` } }),
      ),
    ),
  );
}

/** Compact "3 · Speaking" summary card, linking to Schwätzen. */
function speakingSection(ready) {
  return el(
    'div',
    { class: 'stack' },
    el(
      'a',
      { class: 'card', href: '#/speaking', style: { display: 'block' } },
      el(
        'div',
        { class: 'row' },
        el('span', { style: { fontSize: '28px' } }, '🎤'),
        el(
          'div',
          { class: 'spacer' },
          el('p', { class: 'card__title' }, 'Speaking'),
          el(
            'p',
            { class: 'card__note' },
            ready.reviewCount === 0 ? 'Not started yet' : `${plural(ready.reviewCount, 'peer score')} · pass mark 50%`,
          ),
        ),
        el('span', { class: 'meter__value' }, formatPercent(ready.speakingPct)),
      ),
    ),
  );
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
