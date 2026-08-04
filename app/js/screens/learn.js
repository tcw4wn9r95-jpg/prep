/**
 * Learn — the beginner foundation the exam-format modules assume you already
 * have. Verstoen and Schwätzen drill the INLL exam shape (B1 listening, A2
 * speaking); this hub is where someone starting from zero actually builds the
 * vocabulary those drills take for granted.
 *
 * Three things this screen refuses to do:
 *
 * It does not make you choose a deck before you can answer a question. There
 * is one button, it starts the next cards, and which of the three files those
 * cards came out of is our problem rather than the learner's.
 *
 * It does not report one mastery number. Recognising a word and being able to
 * say it are tracked separately, because the speaking part is scored on the
 * second and a combined figure would read as readiness the candidate does not
 * have.
 *
 * It does not measure a first session against 2,449 words. Three words out of
 * a deck that size is a bar at zero, which reads as "nothing was saved" — so
 * the bar that leads is the one for the step of the path you are actually on.
 */

import { el, screenHead, button, plural, settingsButton } from '../dom.js';
import { Amelie } from '../amelie.js';
import { loadVocab, loadVerbs, loadPhrases, loadGrammar, loadTopics, loadStages, topicIcon } from '../content.js';
import { learnProgress, dueCounts, todayProgress, getLearnDeckState, goalCards, listMistakes, STRANDS } from '../store.js';

export async function render(root, { settings, navigate }) {
  const [vocabItems, verbItems, phraseItems, grammarItems, topics, stages] = await Promise.all([
    loadVocab(),
    loadVerbs(),
    loadPhrases(),
    loadGrammar(),
    loadTopics(),
    loadStages(),
  ]);
  const [vocabRecv, vocabProd, verbRecv, verbProd, phraseRecv, phraseProd, grammarRecv, grammarProd, due, today, seenVocab, seenVerb, seenPhrase, mistakes] =
    await Promise.all([
      learnProgress(settings.playerId, 'vocab', STRANDS.recv, vocabItems.length),
      learnProgress(settings.playerId, 'vocab', STRANDS.prod, vocabItems.length),
      learnProgress(settings.playerId, 'verb', STRANDS.recv, verbItems.length),
      learnProgress(settings.playerId, 'verb', STRANDS.prod, verbItems.length),
      learnProgress(settings.playerId, 'phrase', STRANDS.recv, phraseItems.length),
      learnProgress(settings.playerId, 'phrase', STRANDS.prod, phraseItems.length),
      learnProgress(settings.playerId, 'grammar', STRANDS.recv, grammarItems.length),
      learnProgress(settings.playerId, 'grammar', STRANDS.prod, grammarItems.length),
      dueCounts(settings.playerId),
      todayProgress(settings.playerId, { goal: goalCards(settings) }),
      getLearnDeckState(settings.playerId, 'vocab', STRANDS.recv),
      getLearnDeckState(settings.playerId, 'verb', STRANDS.recv),
      getLearnDeckState(settings.playerId, 'phrase', STRANDS.recv),
      listMistakes(settings.playerId),
    ]);

  // The path runs across all three decks, because a stage does: step 1 is the
  // 28 sentence-skeleton words *and* the 34 frames they slot into.
  const all = [...vocabItems, ...verbItems, ...phraseItems];
  const seen = new Set([...seenVocab.keys(), ...seenVerb.keys(), ...seenPhrase.keys()]);
  const path = stagePath(stages, all, seen);
  const current = path.find((stage) => stage.started < stage.total) ?? null;
  const next = nextAction(due, today, current);

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.setProgress(today.pct, today.met);
  amelie.say(adviceFor(due, vocabRecv, vocabProd, current), 'idle');

  root.append(
    screenHead({
      title: 'Learn',
      sub: 'A1/A2 basics, before the exam format',
      trailing: settingsButton('#/settings'),
    }),
    el('div', { class: 'card' }, amelie.el),

    // One button, like Today. It never asks which deck: the next cards are
    // whatever the path says they are.
    button(next.label, {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      style: { marginBlockStart: 'var(--s4)' },
      onclick: () => navigate(next.href),
    }),
    el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)', textAlign: 'center' } }, next.note),
    el(
      'div',
      { class: 'meter__track', style: { marginBlockStart: 'var(--s2)' } },
      el('div', {
        class: `meter__fill${today.met ? ' is-pass' : ''}`,
        style: { width: `${today.pct === 0 ? 0 : Math.max(today.pct, 2)}%` },
      }),
    ),
    el(
      'p',
      { class: 'card__note', style: { textAlign: 'center' } },
      today.met ? `Goal met — ${plural(today.cards, 'card')} today.` : `${today.cards} of ${today.goal} cards today.`,
    ),

    mistakeRow(mistakes.length),

    sectionLabel('Grammar'),
    el(
      'p',
      { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
      'The exam scores morphosyntax — noun gender, the n-rule, and adjective endings. Every mixed session includes grammar cards; this is a focused round.',
    ),
    deckRow({
      href: '#/grammar',
      icon: '📐',
      title: 'Grammar drills',
      total: grammarItems.length,
      unit: 'exercise',
      recv: grammarRecv,
      prod: grammarProd,
      note: 'Gender, n-rule, adjective agreement',
    }),
    el(
      'div',
      { class: 'row', style: { gap: 'var(--s3)', marginBlockStart: 'var(--s3)' } },
      el(
        'a',
        { class: 'card', href: '#/gender-sort', style: { display: 'block', flex: 1 } },
        el('p', { style: { fontSize: '22px', textAlign: 'center' } }, '⚤'),
        el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'Gender Sort'),
      ),
      el(
        'a',
        { class: 'card', href: '#/reference', style: { display: 'block', flex: 1 } },
        el('p', { style: { fontSize: '22px', textAlign: 'center' } }, '📖'),
        el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'Cheat sheet'),
      ),
    ),

    sectionLabel('Your path'),
    el(
      'p',
      { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
      'Words come in this order — the ones that build sentences first, then whatever turns up most often. Tap a step to drill just that step.',
    ),
    stageList(path, current),

    sectionLabel('Vocabulary decks'),
    el(
      'div',
      { class: 'stack' },
      deckRow({ href: '#/phrases', icon: '💬', title: 'Phrases', total: phraseItems.length, unit: 'sentence frame', recv: phraseRecv, prod: phraseProd }),
      deckRow({ href: '#/vocab', icon: '📇', title: 'Vocabulary', total: vocabItems.length, unit: 'word', recv: vocabRecv, prod: vocabProd }),
      deckRow({ href: '#/verbs', icon: '🔤', title: 'Verbs', total: verbItems.length, unit: 'verb', recv: verbRecv, prod: verbProd }),
    ),

    sectionLabel('For a spare minute'),
    el(
      'a',
      { class: 'card', href: '#/pairs', style: { display: 'block' } },
      el(
        'div',
        { class: 'row' },
        el('span', { style: { fontSize: '28px' } }, '🃏'),
        el(
          'div',
          { class: 'spacer' },
          el('p', { class: 'card__title' }, 'Pairs'),
          el('p', { class: 'card__note' }, 'Match the word to its meaning. Optional, and it does not affect your reviews.'),
        ),
      ),
    ),

    sectionLabel('Or one exam topic'),
    el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'The speaking part offers you two of these.'),
    topicGrid(topics, [...vocabItems, ...verbItems]),
    untaggedNote([...vocabItems, ...verbItems]),
  );

  return { destroy() {} };
}

function sectionLabel(text) {
  return el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)' } }, text);
}

/**
 * The mistakes list, shown only when there is something in it.
 *
 * Hidden at zero on purpose: an empty "0 mistakes" row is a permanent reminder
 * of a thing you cannot do, and the screen already has plenty to read.
 */
function mistakeRow(count) {
  if (count === 0) return null;
  return el(
    'a',
    { class: 'card', href: '#/mistakes', style: { display: 'block', marginBlockStart: 'var(--s5)' } },
    el(
      'div',
      { class: 'row' },
      el('span', { style: { fontSize: '28px' } }, '🎯'),
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'card__title' }, `Clear ${plural(count, 'mistake')}`),
        el('p', { class: 'card__note' }, 'Cards you got wrong, most-missed first. They leave the list when you get them right.'),
      ),
    ),
  );
}

/**
 * The one thing to do now, and the number behind it.
 *
 * Words already met come before new ones: the spacing is the whole mechanism,
 * and a repeat is worth most on the day it falls due. New words otherwise.
 */
function nextAction(due, today, current) {
  const waiting = due.recv + due.prod;
  if (waiting > 0) {
    return {
      label: `Review ${plural(waiting, 'word')}`,
      href: '#/session',
      note: `${due.recv} to understand · ${due.prod} to say · twelve at a time`,
    };
  }

  const left = Math.max(0, due.target - due.newToday);
  if (left > 0) {
    return {
      label: current ? `${current.started > 0 ? 'Carry on' : 'Start'}: ${current.title}` : 'Learn new words',
      href: '#/session',
      note: `${left} new ${left === 1 ? 'word' : 'words'} left today · ${due.newToday} met so far`,
    };
  }

  return {
    label: 'Practise anyway',
    href: '#/session',
    note: `Today's ${due.target} new words are done and nothing is due. Anything more is a bonus.`,
  };
}

/**
 * How far through each stage the learner is.
 *
 * "Word 812 of 2,449" tells you nothing. "You are on Everyday verbs, 14 of 120"
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

/**
 * The path, as links.
 *
 * These used to be plain divs. Tapping "First words" did nothing, which is a
 * worse failure than not offering it at all: the row looks like the way in, so
 * an inert one reads as an app that is broken rather than as a label.
 */
function stageList(path, current) {
  return el(
    'div',
    { class: 'stack' },
    ...path.map((stage) => {
      const pct = stage.total === 0 ? 0 : Math.round((stage.started / stage.total) * 100);
      const isCurrent = stage === current;
      const isDone = stage.started >= stage.total;
      return el(
        'a',
        { class: `stage${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`, href: `#/session/${stage.n}` },
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'stage__n', 'aria-hidden': 'true' }, isDone ? '✓' : String(stage.n)),
          el(
            'div',
            { class: 'spacer' },
            el('p', { class: 'card__title' }, stage.title),
            el('p', { class: 'card__note' }, stage.blurb),
          ),
          el('span', { class: 'meter__value' }, `${stage.started}/${stage.total}`),
        ),
        // Every step gets a bar, not just the current one: the whole point is
        // that a single session visibly moves something.
        el(
          'div',
          { class: 'meter__track', style: { marginBlockStart: 'var(--s2)' } },
          el('div', { class: `meter__fill${pct >= 100 ? ' is-pass' : ''}`, style: { width: `${pct === 0 ? 0 : Math.max(pct, 2)}%` } }),
        ),
      );
    }),
  );
}

/**
 * A deck, as one compact row with two counts rather than two bars.
 *
 * The bar here measures the words you have *met*, not the whole deck: "0% of
 * 2,048" is true, useless and discouraging in week one, whereas "2 of the 9
 * words you have met are holding" is a number that moves. Deck coverage is
 * still stated, as text, where it cannot be mistaken for progress.
 */
function deckRow({ href, icon, title, total, unit, recv, prod, note }) {
  return el(
    'a',
    { class: 'card', href, style: { display: 'block' } },
    el(
      'div',
      { class: 'row' },
      el('span', { style: { fontSize: '28px' } }, icon),
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'card__title' }, title),
        el('p', { class: 'card__note' }, `${recv.started} of ${plural(total, unit)} met`),
        note ? el('p', { class: 'card__note' }, note) : null,
      ),
    ),
    strandBar('Understand', recv),
    strandBar('Say', prod),
  );
}

function strandBar(label, progress) {
  const pct = Math.round(progress.heldPct);
  return el(
    'div',
    { style: { marginBlockStart: 'var(--s3)' } },
    el(
      'div',
      { class: 'row row--between' },
      el('span', { class: 'card__note' }, label),
      el(
        'span',
        { class: 'card__note' },
        progress.started === 0 ? 'not started' : `${progress.strong} of ${progress.started} holding`,
      ),
    ),
    el(
      'div',
      { class: 'meter__track', style: { marginBlockStart: 'var(--s1)' } },
      el('div', { class: `meter__fill${pct > 50 ? ' is-pass' : ''}`, style: { width: `${pct === 0 ? 0 : Math.max(pct, 2)}%` } }),
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
    `${untagged} of ${items.length} words carry no topic tag — the dictionary gave no reliable evidence for one. They are all in the decks above.`,
  );
}

function adviceFor(due, recv, prod, current) {
  if (recv.started === 0) return 'Start at the beginning: I, you, and the words that hold a sentence together. Everything else needs those first.';
  // Not "the ones about to fade": that describes our scheduler, not anything
  // the learner can see or act on, and it reads as a warning about words they
  // have no way to identify. What they actually need to know is that these are
  // words they have met before, and that today is when repeating them sticks.
  if (due.recv + due.prod > 0) {
    return `${due.recv + due.prod} words you have met before are ready to come round again. Today is the day they stick.`;
  }
  if (prod.strong * 2 < recv.strong) return 'You recognise far more than you can say. The speaking part only scores what you can say.';
  if (current) return `You are on ${current.title.toLowerCase()} — ${current.total - current.started} to go.`;
  return 'Nothing due. Pick a topic and take on new words.';
}
