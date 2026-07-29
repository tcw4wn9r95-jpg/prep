/**
 * Learn — the beginner foundation the exam-format modules assume you already
 * have. Verstoen and Schwätzen drill the INLL exam shape (B1 listening, A2
 * speaking); this hub is where someone starting from zero actually builds the
 * vocabulary those drills take for granted.
 *
 * Two things this screen refuses to do:
 *
 * It does not report one mastery number. Recognising a word and being able to
 * say it are tracked separately, because the speaking part is scored on the
 * second and a combined figure would read as readiness the candidate does not
 * have.
 *
 * It does not show the whole deck as a single wall of 2,048 words. The exam
 * asks you to talk about one of fourteen topics, so the deck is offered the
 * same way.
 */

import { el, screenHead, plural, settingsButton } from '../dom.js';
import { Amelie } from '../amelie.js';
import { loadVocab, loadVerbs, loadTopics, loadStages, topicIcon } from '../content.js';
import { learnProgress, dueCounts, getLearnDeckState, STRANDS } from '../store.js';

export async function render(root, { settings }) {
  const [vocabItems, verbItems, topics, stages] = await Promise.all([loadVocab(), loadVerbs(), loadTopics(), loadStages()]);
  const [vocabRecv, vocabProd, verbRecv, verbProd, due, startedVocab, startedVerb] = await Promise.all([
    learnProgress(settings.playerId, 'vocab', STRANDS.recv, vocabItems.length),
    learnProgress(settings.playerId, 'vocab', STRANDS.prod, vocabItems.length),
    learnProgress(settings.playerId, 'verb', STRANDS.recv, verbItems.length),
    learnProgress(settings.playerId, 'verb', STRANDS.prod, verbItems.length),
    dueCounts(settings.playerId),
    getLearnDeckState(settings.playerId, 'vocab', STRANDS.recv),
    getLearnDeckState(settings.playerId, 'verb', STRANDS.recv),
  ]);

  const all = [...vocabItems, ...verbItems];
  const seen = new Set([...startedVocab.keys(), ...startedVerb.keys()]);
  const path = stagePath(stages, all, seen);

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.say(adviceFor(due, vocabRecv, vocabProd, path), 'idle');

  root.append(
    screenHead({ title: 'Learn', sub: 'A1/A2 basics, before the exam format', trailing: settingsButton('#/settings') }),
    el('div', { class: 'card' }, amelie.el),
    todayCard(due),

    sectionLabel('Your path'),
    el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'Words come in this order — the ones that build sentences first, then whatever turns up most often.'),
    stageList(path),

    sectionLabel('Decks'),
    el(
      'div',
      { class: 'stack stack--lg' },
      deckCard({
        href: '#/vocab',
        icon: '📇',
        title: 'Vocabulary',
        note: `${plural(vocabItems.length, 'word')} from the Grondwuertschatz`,
        recv: vocabRecv,
        prod: vocabProd,
      }),
      deckCard({
        href: '#/verbs',
        icon: '🔤',
        title: 'Verbs',
        note: `${plural(verbItems.length, 'verb')}, present tense`,
        recv: verbRecv,
        prod: verbProd,
      }),
    ),

    sectionLabel('By exam topic'),
    el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'The speaking part offers you two of these. Drill the words for one.'),
    topicGrid(topics, all),
    untaggedNote(all),
  );

  return { destroy() {} };
}

function sectionLabel(text) {
  return el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)' } }, text);
}

/**
 * How far through each stage the learner is.
 *
 * "Word 812 of 2,049" tells you nothing. "You are on Everyday verbs, 14 of 60"
 * tells you where you are and what it is for.
 */
function stagePath(stages, items, seen) {
  return stages
    .map((stage) => {
      const inStage = items.filter((item) => item.stage === stage.n);
      const started = inStage.filter((item) => seen.has(item.id)).length;
      return { ...stage, total: inStage.length, started };
    })
    .filter((stage) => stage.total > 0);
}

function stageList(path) {
  // The stage you are on is the first one you have not finished.
  const currentIndex = path.findIndex((stage) => stage.started < stage.total);
  return el(
    'div',
    { class: 'stack' },
    ...path.map((stage, index) => {
      const pct = stage.total === 0 ? 0 : Math.round((stage.started / stage.total) * 100);
      const isCurrent = index === currentIndex;
      const isDone = stage.started >= stage.total;
      return el(
        'div',
        { class: `stage${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}` },
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'stage__n', 'aria-hidden': 'true' }, isDone ? '✓' : String(stage.n)),
          el(
            'div',
            { class: 'spacer' },
            el('p', { class: 'card__title' }, stage.title),
            el('p', { class: 'card__note' }, isCurrent ? stage.blurb : `${stage.started} of ${stage.total}`),
          ),
          isCurrent ? el('span', { class: 'meter__value' }, `${stage.started}/${stage.total}`) : null,
        ),
        isCurrent
          ? el(
              'div',
              { class: 'meter__track', style: { marginBlockStart: 'var(--s2)' } },
              el('div', { class: 'meter__fill', style: { width: `${Math.max(pct, 2)}%` } }),
            )
          : null,
      );
    }),
  );
}

/** What is waiting right now — the only number that should drive a session. */
function todayCard(due) {
  const total = due.recv + due.prod;
  const left = Math.max(0, due.target - due.newToday);
  return el(
    'div',
    { class: 'card', style: { marginBlockStart: 'var(--s4)' } },
    el(
      'div',
      { class: 'row' },
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'meter__label' }, 'Due now'),
        el('p', { class: 'meter__value' }, String(total)),
        el(
          'p',
          { class: 'card__note' },
          total === 0
            ? 'Nothing to review — start something new.'
            : `${due.recv} to understand · ${due.prod} to say`,
        ),
      ),
      el(
        'div',
        { style: { textAlign: 'right' } },
        el('p', { class: 'meter__label' }, 'New today'),
        el('p', { class: 'meter__value' }, `${due.newToday}/${due.target}`),
        el('p', { class: 'card__note' }, left === 0 ? 'Target met' : `${left} left`),
      ),
    ),
  );
}

/**
 * A deck row with two bars rather than one. The gap between them is the point:
 * it is normal for the productive bar to sit well below the receptive one, and
 * seeing that is what tells you which drill to open.
 */
function deckCard({ href, icon, title, note, recv, prod }) {
  return el(
    'a',
    { class: 'card', href, style: { display: 'block' } },
    el(
      'div',
      { class: 'row' },
      el('span', { style: { fontSize: '32px' } }, icon),
      el('div', { class: 'spacer' }, el('p', { class: 'card__title' }, title), el('p', { class: 'card__note' }, note)),
    ),
    strandBar('Understand', recv),
    strandBar('Say', prod),
  );
}

function strandBar(label, progress) {
  const pct = Math.round(progress.pct);
  return el(
    'div',
    { style: { marginBlockStart: 'var(--s3)' } },
    el(
      'div',
      { class: 'row row--between' },
      el('span', { class: 'card__note' }, label),
      el('span', { class: 'card__note' }, `${progress.mastered} mastered · ${progress.started} started`),
    ),
    el(
      'div',
      { class: 'meter__track', style: { marginBlockStart: 'var(--s1)' } },
      el('div', { class: `meter__fill${pct > 50 ? ' is-pass' : ''}`, style: { width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` } }),
    ),
  );
}

/** One chip per exam topic, sized by how many words carry that tag. */
function topicGrid(topics, items) {
  const counts = new Map();
  for (const item of items) {
    for (const topic of item.topics ?? []) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }

  const cards = topics
    .filter((topic) => (counts.get(topic.id) ?? 0) > 0)
    .map((topic) =>
      el(
        'a',
        { class: 'topic-tile', href: `#/vocab/${encodeURIComponent(topic.id)}` },
        el('span', { class: 'topic-tile__icon', 'aria-hidden': 'true' }, topicIcon(topic.id)),
        el('span', { class: 'topic-tile__name' }, topic.title_en ?? topic.en ?? topic.id),
        el('span', { class: 'topic-tile__count' }, plural(counts.get(topic.id) ?? 0, 'word')),
      ),
    );

  return el('div', { class: 'topic-grid' }, ...cards);
}

/**
 * Stated rather than hidden: a large part of the deck carries no topic,
 * because the evidence to tag it honestly was not there.
 */
function untaggedNote(items) {
  const untagged = items.filter((item) => (item.topics ?? []).length === 0).length;
  if (untagged === 0) return null;
  return el(
    'p',
    { class: 'source-note' },
    `${untagged} of ${items.length} words carry no topic tag — the dictionary gave no reliable evidence for one. They are all in the two decks above.`,
  );
}

function adviceFor(due, recv, prod, path) {
  if (recv.started === 0) return 'Start at the beginning: I, you, and the words that hold a sentence together. Everything else needs those first.';
  if (due.recv + due.prod > 0) return `${due.recv + due.prod} cards are waiting. Reviews first — they are the ones about to fade.`;
  const current = path.find((stage) => stage.started < stage.total);
  if (prod.mastered * 2 < recv.mastered) return 'You recognise far more than you can say. The speaking part only scores what you can say.';
  if (current) return `You are on ${current.title.toLowerCase()} — ${current.total - current.started} to go.`;
  return 'Nothing due. Pick a topic and take on new words.';
}
