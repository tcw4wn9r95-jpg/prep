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
 *
 * And it does not treat the decks as things to finish. Nobody passes the
 * Sproochentest by emptying a word list; the exam asks you to follow a B1
 * conversation and hold an A2 one, and the decks are a pool those two draw
 * from. So the deck size is stated as context and never as a denominator, and
 * the numbers that lead are the two the exam actually turns on: how much you
 * can follow, and how much you can produce.
 */

import { el, screenHead, button, plural, settingsButton } from '../dom.js';
import { Amelie } from '../amelie.js';
import { loadVocab, loadVerbs, loadPhrases, loadGrammar, loadTopics, loadStages, topicIcon } from '../content.js';
import { learnProgress, dueCounts, todayProgress, getLearnDeckState, goalCards, listMistakes, newWordsLeftToday, throughput, DAILY_NEW_TARGET, STRANDS } from '../store.js';

export async function render(root, { settings, navigate }) {
  const [vocabItems, verbItems, phraseItems, grammarItems, topics, stages] = await Promise.all([
    loadVocab(),
    loadVerbs(),
    loadPhrases(),
    loadGrammar(),
    loadTopics(),
    loadStages(),
  ]);
  const [vocabRecv, vocabProd, verbRecv, verbProd, phraseRecv, phraseProd, grammarRecv, grammarProd, due, today, seenVocab, seenVerb, seenPhrase, mistakes, newLeft, flow] =
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
      newWordsLeftToday(settings.playerId),
      throughput(settings.playerId),
    ]);

  // The path runs across all three decks, because a stage does: step 1 is the
  // 28 sentence-skeleton words *and* the 34 frames they slot into.
  const all = [...vocabItems, ...verbItems, ...phraseItems];
  const seen = new Set([...seenVocab.keys(), ...seenVerb.keys(), ...seenPhrase.keys()]);
  const path = stagePath(stages, all, seen);
  const current = path.find((stage) => stage.started < stage.total) ?? null;
  const next = nextAction(due, today, current, mistakes.length);

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.setProgress(today.pct, today.met);
  amelie.say(adviceFor(vocabRecv, vocabProd, current), 'idle');

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

    progressPanel(flow, today),
    mistakeRow(mistakes.length),

    sectionLabel('Grammar'),
    el(
      'p',
      { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
      'Morphosyntax is one of the criteria the interview is marked on — word order, noun gender, the n-rule, adjective endings. Every mixed session includes grammar cards; these are focused rounds.',
    ),
    // Sentence structure gets its own card, above the general grammar row. It
    // is theory-first — the rule, then the practice — because word order is
    // the one thing an English speaker will not absorb by answering cards: the
    // mistake feels correct until someone explains why it is not.
    el(
      'a',
      { class: 'card', href: '#/structure', style: { display: 'block', marginBlockEnd: 'var(--s3)' } },
      el(
        'div',
        { class: 'row' },
        el('span', { style: { fontSize: '28px' } }, '🧩'),
        el(
          'div',
          { class: 'spacer' },
          el('p', { class: 'card__title' }, 'Sentence structure'),
          el('p', { class: 'card__note' }, 'Where the verb goes — the three rules, then graded practice. In every daily session, and required for the day to count.'),
        ),
      ),
    ),
    deckRow({
      href: '#/grammar',
      icon: '📐',
      title: 'Grammar drills',
      total: grammarItems.length,
      unit: 'exercise',
      recv: grammarRecv,
      prod: grammarProd,
      note: 'Gender, n-rule, adjectives, the perfect, word order, numbers, the dative',
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
      // The dative as a table to learn rather than four options to guess
      // between — see screens/forms.js for why that is a different exercise
      // from the deck's own dative cards.
      el(
        'a',
        { class: 'card', href: '#/forms', style: { display: 'block', flex: 1 } },
        el('p', { style: { fontSize: '22px', textAlign: 'center' } }, '🔁'),
        el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'Change the word'),
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
      newLeft === 0
        ? "Today's new words are done, so these counts stop here until tomorrow. Tapping a step still reviews what you have already met."
        : `Words come in this order — the ones that build sentences first, then whatever turns up most often. ${plural(newLeft, 'new word')} left today.`,
    ),
    stageList(path, current, newLeft),

    sectionLabel('Vocabulary decks'),
    // The one place the two bars are explained, rather than a gloss repeated
    // on every row. They are the same two bars on the grammar row above, so
    // this reads as the key to the whole screen.
    el(
      'p',
      { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
      'These are pools to draw on, not lists to finish — nobody passes by emptying one. The two bars on each row are what counts: can follow it, which is the listening paper, and can say it, which is the interview. A word turns solid once you have got it right on three separate days.',
    ),
    el(
      'div',
      { class: 'stack' },
      deckRow({ href: '#/phrases', icon: '💬', title: 'Phrases', total: phraseItems.length, unit: 'sentence frame', recv: phraseRecv, prod: phraseProd }),
      deckRow({ href: '#/vocab', icon: '📇', title: 'Vocabulary', total: vocabItems.length, unit: 'word', recv: vocabRecv, prod: vocabProd }),
      deckRow({ href: '#/verbs', icon: '🔤', title: 'Verbs', total: verbItems.length, unit: 'verb', recv: verbRecv, prod: verbProd }),
    ),

    sectionLabel('For a spare minute'),
    el(
      'div',
      { class: 'row', style: { gap: 'var(--s3)' } },
      el(
        'a',
        { class: 'card', href: '#/pairs', style: { display: 'block', flex: 1 } },
        el('p', { style: { fontSize: '28px', textAlign: 'center' } }, '🃏'),
        el('p', { class: 'card__title', style: { textAlign: 'center' } }, 'Pairs'),
        el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'Match the word to its meaning.'),
      ),
      el(
        'a',
        { class: 'card', href: '#/objects', style: { display: 'block', flex: 1 } },
        el('p', { style: { fontSize: '28px', textAlign: 'center' } }, '📷'),
        el('p', { class: 'card__title', style: { textAlign: 'center' } }, 'What is this?'),
        el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'Name the picture.'),
      ),
    ),
    el(
      'p',
      { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } },
      'Both are optional, and neither affects your reviews.',
    ),

    sectionLabel('Or one exam topic'),
    el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'The speaking part offers you two of these.'),
    topicGrid(topics, [...vocabItems, ...verbItems]),
    untaggedNote([...vocabItems, ...verbItems]),
  );

  return { destroy() {} };
}

/**
 * "Am I actually getting anywhere?" — the question the other numbers dodge.
 *
 * A large "met" total says nothing about whether it is still moving, and a
 * learner grinding the same forty words every evening sees a big number and a
 * stalled reality. So this reports the front of the deck rather than its size:
 * how many words were met *this week*, and how many keep coming back.
 *
 * The note at the bottom is the honest mechanism. New words go into every
 * session first, up to the daily cap (`DAILY_NEW_TARGET`) — a review backlog
 * no longer stands between a learner and the next new word, the way it used
 * to. So the ceiling on intake is now just the daily cap itself: practise on
 * fewer days, or stop a session early most days, and `perDay` falls below it
 * without anything holding new words back on purpose.
 */
function progressPanel(flow, today) {
  if (flow.met === 0) return null;
  const perDay = flow.perDay;
  const stalling = perDay < DAILY_NEW_TARGET / 4;

  return el(
    'div',
    { class: 'card', style: { marginBlockStart: 'var(--s5)' } },
    el('p', { class: 'card__title' }, 'Are you moving forward?'),
    el(
      'div',
      { class: 'row', style: { marginBlockStart: 'var(--s3)', gap: 'var(--s5)' } },
      figure(String(flow.met), 'words seen'),
      figure(String(flow.metRecent), `new in ${flow.days} days`),
      figure(String(flow.sticking), 'keep coming back'),
    ),
    flow.sticking > 0
      ? el(
          'p',
          { class: 'card__note' },
          `${plural(flow.sticking, 'word')} sat at the first box because you missed them last time — those are due again immediately, which is most of why the same ones keep appearing.`,
        )
      : null,
    stalling
      ? el(
          'p',
          { class: 'card__note' },
          `About ${perDay.toFixed(1)} new words a day lately, against a cap of ${DAILY_NEW_TARGET} a day. New words are the first thing in every session now — start one on the days you skip to close the gap.`,
        )
      : el('p', { class: 'card__note' }, `About ${perDay.toFixed(1)} new words a day lately. ${today.met ? "Today's goal is met." : ''}`),
    flow.undated > 0
      ? el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } }, `${flow.undated} were met before this screen started recording dates, so they count in the total but not in the weekly figure.`)
      : null,
  );
}

function figure(value, label) {
  return el(
    'div',
    { class: 'spacer' },
    el('p', { class: 'meter__value' }, value),
    el('p', { class: 'card__note', style: { marginBlockStart: '0' } }, label),
  );
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
 * New words come first, up to the daily budget — a big backlog of words
 * already held should never be the thing standing between a learner and the
 * next new one. A mistake still comes back on its own (`#/session` always
 * includes it) and a named, finite mistake list is one tap away; everything
 * else already known resurfaces only occasionally, a few at a time.
 */
function nextAction(due, today, current, mistakeCount) {
  const left = Math.max(0, due.target - due.newToday);
  if (left > 0) {
    return {
      label: current ? `${current.started > 0 ? 'Carry on' : 'Start'}: ${current.title}` : 'Learn new words',
      href: '#/session',
      note: `${left} new ${left === 1 ? 'word' : 'words'} left today · ${due.newToday} met so far`,
    };
  }

  if (mistakeCount > 0) {
    return {
      label: `Clear ${plural(mistakeCount, 'mistake')}`,
      href: '#/mistakes',
      note: 'Cards you got wrong, most-missed first — they leave the list once you get them right.',
    };
  }

  return {
    label: 'Practise anyway',
    href: '#/session',
    note: `Today's ${due.target} new words are done. Anything more is a bonus.`,
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
function stageList(path, current, newLeft = 0) {
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
          el(
            'div',
            { style: { textAlign: 'end' } },
            el('span', { class: 'meter__value' }, `${stage.started}/${stage.total}`),
            // Without this, a step reading "116/120" links to a session that
            // introduces nothing and shows an empty screen — the counter looks
            // stuck and the app looks broken. It is the daily cap doing its
            // job; it just has to say so.
            isCurrent && !isDone && newLeft === 0
              ? el('p', { class: 'card__note', style: { marginBlockStart: '0' } }, 'more tomorrow')
              : null,
          ),
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
 * A deck, as one compact row with two bars.
 *
 * The bars measure the words you have actually seen, not the whole deck: "0%
 * of 2,048" is true, useless and discouraging in week one. Deck size is still
 * stated — but as "in the deck", never as "of", because a denominator is a
 * target and this is not one. You do not have to finish a deck to pass.
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
        el('p', { class: 'card__note' }, `${recv.started} seen · ${plural(total, unit)} in the deck`),
        note ? el('p', { class: 'card__note' }, note) : null,
      ),
    ),
    strandBar('Can follow it', recv),
    strandBar('Can say it', prod),
  );
}

/**
 * One strand, as a bar that actually responds to today's session.
 *
 * It used to fill by `heldPct` — items at box 3 or higher. The intervals are
 * 0/1/3/7 days, so the earliest an item can reach box 3 is **day 11**, and
 * "mastered" is day 27. Both bars on every deck row were therefore frozen at
 * zero for a beginner's first fortnight no matter how much they drilled, which
 * is indistinguishable from the app not saving anything.
 *
 * Now the bar is the *distribution*: one segment per Leitner box, so a correct
 * answer visibly moves width from one segment to the next on the same day.
 *
 * The words changed too. It used to read "12 of 47 holding", under a heading
 * of "Understand" — two pieces of our own vocabulary in six words. "Met" is
 * the scheduler's term for an item that has a row in the database, and
 * "holding" is its term for box 3 or higher; neither is anything the learner
 * asked about. What they are actually trying to find out is whether they could
 * follow this word in the listening paper and produce it in the interview, so
 * that is what the bar says now: **seen** for the ones that have come up, and
 * **solid** for the ones that keep coming back right.
 */
function strandBar(label, progress) {
  const met = progress.started;
  const boxes = progress.boxes ?? [];
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
        met === 0 ? 'not started yet' : `${progress.strong} solid of ${met} seen`,
      ),
    ),
    el(
      'div',
      { class: 'ladder', style: { marginBlockStart: 'var(--s1)' } },
      ...boxes.map((count, box) =>
        count === 0
          ? null
          : el('span', {
              class: `ladder__seg ladder__seg--${box}`,
              style: { flexGrow: String(count) },
              title: `${count} at box ${box}`,
            }),
      ),
      met === 0 ? el('span', { class: 'ladder__empty' }) : null,
    ),
    met === 0
      ? null
      : el('p', { class: 'ladder__caption' }, 'left to right: just seen → solid'),
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

function adviceFor(recv, prod, current) {
  if (recv.started === 0) return 'Start at the beginning: I, you, and the words that hold a sentence together. Everything else needs those first.';
  if (prod.strong * 2 < recv.strong) return 'You recognise far more than you can say. The speaking part only scores what you can say.';
  if (current) return `You are on ${current.title.toLowerCase()} — ${current.total - current.started} to go.`;
  return 'Pick a topic and take on new words.';
}
