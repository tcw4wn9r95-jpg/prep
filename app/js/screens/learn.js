/**
 * Learn — the beginner foundation the exam-format modules assume you already
 * have. Verstoen and Schwätzen drill the INLL exam shape (B1 listening, A2
 * speaking); this hub is where someone starting from zero actually builds the
 * vocabulary and verb conjugations those drills take for granted.
 */

import { el, screenHead, plural } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { loadVocab, loadVerbs } from '../content.js';
import { learnProgress } from '../store.js';

export async function render(root, { settings }) {
  const [vocabItems, verbItems] = await Promise.all([loadVocab(), loadVerbs()]);
  const [vocabProgress, verbProgress] = await Promise.all([
    learnProgress(settings.playerId, 'vocab', vocabItems.length),
    learnProgress(settings.playerId, 'verb', verbItems.length),
  ]);

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.say('Build the words and verb forms first — the exam drills assume you already know these.', 'idle');

  root.append(
    screenHead({ title: 'Learn', sub: 'A1/A2 basics, before the exam format' }),
    el('div', { class: 'card' }, amelie.el),
    el(
      'div',
      { class: 'stack stack--lg', style: { marginBlockStart: 'var(--s4)' } },
      deckCard({
        href: '#/vocab',
        icon: '📇',
        title: 'Vocabulary',
        note: `${plural(vocabItems.length, 'word')} from the Grondwuertschatz`,
        progress: vocabProgress,
      }),
      deckCard({
        href: '#/verbs',
        icon: '🔤',
        title: 'Verbs',
        note: `${plural(verbItems.length, 'verb')}, present tense`,
        progress: verbProgress,
      }),
    ),
  );

  return { destroy() {} };
}

function deckCard({ href, icon, title, note, progress }) {
  const pct = Math.round(progress.pct);
  return el(
    'a',
    { class: 'card', href, style: { display: 'block' } },
    el(
      'div',
      { class: 'row' },
      el('span', { style: { fontSize: '32px' } }, icon),
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'card__title' }, title),
        el('p', { class: 'card__note' }, note),
      ),
      el('span', { class: 'meter__value' }, `${pct}%`),
    ),
    el(
      'div',
      { class: 'meter__track', style: { marginBlockStart: 'var(--s3)' } },
      el('div', { class: `meter__fill${pct > 50 ? ' is-pass' : ''}`, style: { width: `${pct}%` } }),
    ),
    el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } }, `${progress.mastered} mastered · ${progress.started} started`),
  );
}
