/**
 * Today — the home screen, and the answer to "what do I do now".
 *
 * The app had six tabs and no starting point. Learn, Journey, Speak, Review,
 * Duel and Ready were all equally prominent, all reachable at once, and none
 * of them said which to open first — so every session began with a decision
 * instead of with practice.
 *
 * This screen makes that decision. It has exactly one primary button, which is
 * always the single most useful thing available right now, and beneath it the
 * three steps of a day laid out in the order they should be done. Everything
 * else — the scoreboard, the readiness estimate, the topic path — is reachable
 * but deliberately quieter, because none of it is an action.
 *
 * The ordering rule for the primary action, most urgent first:
 *
 *   1. your partner is waiting on a review — it blocks *their* progress, and
 *      it is worth the most points for exactly that reason
 *   2. no listening this week — the B1 half needs a set
 *   3. no speaking in three days — the half you must pass
 *   4. otherwise, new words — a card just got wrong still comes straight
 *      back on its own (store.js buildMixedSession), but a backlog of
 *      correctly-held words is no longer treated as more urgent than a word
 *      never met at all
 */

import { el, screenHead, button, plural, formatPercent, settingsButton } from '../dom.js';
import { Amelie } from '../amelie.js';
import { PRACTICE_ANCHORS } from './onboarding.js';
import { loadTopics } from '../content.js';
import {
  listAttempts,
  listRecordings,
  listReviews,
  readinessFor,
  dueCounts,
  todayProgress,
  getStreak,
  weekSeed,
  otherPlayer,
  goalCards,
  listMistakes,
  PLAYERS,
} from '../store.js';

const SPEAKING_GAP_DAYS = 3;

/** Grammar cards that count as having done the focused grammar step. One
 * `#/grammar` session is ten cards, so this is most of one. */
const GRAMMAR_CARDS_GOAL = 6;

/**
 * …of which this many must be sentence structure — where the verb goes.
 *
 * Mandatory rather than optional, because it is the criterion an English
 * speaker actually loses marks on and the one no amount of vocabulary fixes.
 * Set to match `STRUCTURE_RESERVE` in screens/session.js, which guarantees
 * three structure cards in every twelve-card mixed session: so a learner who
 * simply does their daily sessions ticks this without ever visiting the
 * sentence-structure screen. It is a floor under the day, not an errand added
 * to it.
 */
const STRUCTURE_CARDS_GOAL = 3;

export async function render(root, { settings, navigate }) {
  void navigate;
  // Deliberately does not load the decks. It used to pull vocab, verbs and
  // phrases — 1.7 MB of JSON — to add their lengths into a `totalWords` that
  // nothing on the screen ever rendered. This is the first screen after the
  // splash, so that was pure cold-start cost on the one screen that has to
  // feel instant.
  const [attempts, recordings, reviews, streak, due, today, topics] = await Promise.all([
    listAttempts(),
    listRecordings(),
    listReviews(),
    getStreak(settings.playerId),
    dueCounts(settings.playerId),
    todayProgress(settings.playerId, { goal: goalCards(settings) }),
    loadTopics(),
  ]);

  const me = PLAYERS.find((player) => player.id === settings.playerId) ?? PLAYERS[0];
  const partner = otherPlayer(settings.playerId);
  const ready = readinessFor(settings.playerId, { attempts, recordings, reviews });
  const state = assess({ settings, attempts, recordings, reviews, due, today, topics });
  const next = nextAction(state, partner);

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.setProgress(today.pct, today.met);
  amelie.say(next.why, 'idle');

  root.append(
    screenHead({
      title: `Moien, ${me.name}`,
      sub: streak.current > 0 ? `${plural(streak.current, 'day')} in a row` : 'One session is enough for today',
      trailing: settingsButton('#/settings'),
    }),

    el('div', { class: 'card' }, amelie.el),

    // The one button. Everything below it is context for this decision, not a
    // competing one.
    button(next.label, {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      style: { marginBlockStart: 'var(--s4)' },
      onclick: () => navigate(next.href),
    }),

    // The day's practice, as a bar that only fills. Everything else here is a
    // queue that refills as it is worked, so this is the only thing on the
    // screen that answers "did I get anywhere today".
    el(
      'div',
      { class: 'card', style: { marginBlockStart: 'var(--s4)' } },
      el(
        'div',
        { class: 'row row--between' },
        el('span', { class: 'meter__label' }, "Today's practice"),
        // Past the goal the fraction stops making sense — "103 / 30" reads as
        // a mistake rather than as a good day.
        el('span', { class: 'meter__value' }, today.met ? plural(today.cards, 'card') : `${today.cards} / ${today.goal}`),
      ),
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
        { class: 'card__note' },
        today.met
          ? `Goal met${streak.current > 0 ? ` · ${plural(streak.current, 'day')} in a row` : ''}. Anything more is a bonus.`
          : today.cards === 0
            ? `${today.goal} cards is the day's goal. Unlike the counts below, this one only goes up.`
            : `${today.correct} correct so far. Cards due move up and down as you work — this does not.`,
      ),
      weekStrip(streak, today.cards > 0),
    ),

    sectionLabel('Today'),
    // Says what the list is measured against. Without it the four steps read
    // as four equal chores; with it, two of them are the exam and two are what
    // the exam needs.
    el(
      'p',
      { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
      'The exam is two halves: Verstoen, the B1 listening paper, and Schwätzen, the A2 interview. You pass on speaking alone or on the two together. Words and grammar are not scored on their own — they are what those two halves run on.',
    ),
    el(
      'div',
      { class: 'stack' },
      ...state.plan.map((step, index) => planRow(step, index + 1)),
    ),

    sectionLabel('Where you are'),
    el(
      'a',
      { class: 'card', href: '#/readiness', style: { display: 'block' } },
      el(
        'div',
        { class: 'row' },
        el(
          'div',
          { class: 'spacer' },
          el('p', { class: 'card__title' }, 'Exam readiness'),
          el('p', { class: 'card__note' }, ready.advice),
        ),
      ),
      el(
        'div',
        { class: 'row', style: { marginBlockStart: 'var(--s3)', gap: 'var(--s5)' } },
        miniMeter('Speaking', ready.speakingPct),
        miniMeter('Overall', ready.overallPct),
      ),
    ),
    el(
      'a',
      { class: 'card', href: '#/duel', style: { display: 'block', marginBlockStart: 'var(--s3)' } },
      el(
        'div',
        { class: 'row' },
        el('span', { style: { fontSize: '28px' } }, '⚔️'),
        el(
          'div',
          { class: 'spacer' },
          el('p', { class: 'card__title' }, 'Woch-Duell'),
          el('p', { class: 'card__note' }, `You and ${partner.name}, same items this week`),
        ),
      ),
    ),

    anchorNote(settings, today.met),

    el(
      'p',
      { class: 'source-note' },
      'Official exam information: ',
      el('a', { href: 'https://www.inll.lu', target: '_blank', rel: 'noreferrer' }, 'inll.lu'),
    ),
  );

  return { destroy() {} };
}

/* ------------------------------------------------------------------ state */

/**
 * Everything the screen needs to decide, in one pass over local data.
 *
 * `plan` is the visible three-step day; `next` is chosen from the same facts,
 * so the button and the checklist can never disagree.
 */
function assess({ settings, attempts, recordings, reviews, due, today, topics }) {
  const mine = attempts.filter((attempt) => attempt.playerId === settings.playerId);
  const week = weekSeed();
  const listenedThisWeek = mine.some((attempt) => attempt.weekSeed === week);

  const reviewed = new Set(reviews.map((review) => review.recordingId));
  const waitingOnMe = recordings.filter(
    (record) => record.playerId !== settings.playerId && !reviewed.has(record.id),
  ).length;

  const myRecordings = recordings.filter((record) => record.playerId === settings.playerId);
  const lastSpoke = myRecordings.reduce((latest, record) => Math.max(latest, Date.parse(record.at) || 0), 0);
  const daysSinceSpoke = lastSpoke === 0 ? Infinity : (Date.now() - lastSpoke) / 86400000;

  const newLeft = Math.max(0, due.target - due.newToday);
  const grammarToday = today.byDeck?.grammar ?? 0;
  // Counted separately by drill/engine.js, because "six grammar cards" can be
  // six gender cards — and gender is not the thing the interview marks an
  // English speaker down for.
  const structureToday = today.byDeck?.structure ?? 0;
  const grammarDone = grammarToday >= GRAMMAR_CARDS_GOAL && structureToday >= STRUCTURE_CARDS_GOAL;

  // `for` names the part of the exam each step is actually for. The plan used
  // to read as a study list — words, grammar, listening, speaking — which is
  // the wrong frame: none of those is the goal, and a day spent entirely on
  // vocabulary can look complete while leaving both scored halves untouched.
  const plan = [
    {
      id: 'words',
      title: 'Words & grammar',
      for: 'What both halves are built on',
      href: '#/session',
      done: today.met,
      note: today.met
        ? `Done — ${plural(today.cards, 'card')} today (incl. grammar)`
        : `${today.cards} of ${today.goal} cards · vocabulary + grammar mixed`,
    },
    {
      id: 'grammar',
      title: 'Grammar & sentence structure',
      for: 'Morphosyntax, a scored criterion in the interview',
      // Points at the theory when structure is the unmet half, because the
      // fix for "I keep getting word order wrong" is reading the rule, not
      // answering three more cards.
      href: structureToday < STRUCTURE_CARDS_GOAL ? '#/structure' : '#/grammar',
      // Grammar cards specifically, not "any six cards". The old condition was
      // `today.cards >= 6`, which counts every deck — so six vocabulary cards
      // ticked this step without a single grammar question being answered, and
      // the one part of the plan aimed at Morphosyntax could be skipped every
      // day while reporting itself done. Sentence structure is now a floor
      // inside it for the same reason, one level down.
      done: grammarDone,
      note: grammarDone
        ? `Done — ${grammarToday} grammar, ${structureToday} of them sentence structure`
        : `${grammarToday} of ${GRAMMAR_CARDS_GOAL} grammar · ${structureToday} of ${STRUCTURE_CARDS_GOAL} sentence structure`,
    },
    {
      id: 'listening',
      title: 'Listening',
      for: 'Verstoen — the B1 half, 16 questions',
      href: '#/journey',
      done: listenedThisWeek,
      note: listenedThisWeek ? 'Done this week' : `One set from ${plural(topics.length, 'topic')}`,
    },
    {
      id: 'speaking',
      title: 'Speaking',
      for: 'Schwätzen — the half you must pass',
      href: '#/speaking',
      done: daysSinceSpoke <= SPEAKING_GAP_DAYS,
      // Overdue only once there is a habit to have broken. A learner who has
      // never recorded is not behind — they are being held back on purpose by
      // the readiness gate in screens/speaking.js, and telling them they are
      // late for a thing the app will not let them do yet is just noise.
      urgent: daysSinceSpoke !== Infinity && daysSinceSpoke > SPEAKING_GAP_DAYS,
      note:
        daysSinceSpoke === Infinity
          ? 'Not recorded yet — this is the half you must pass'
          : daysSinceSpoke <= SPEAKING_GAP_DAYS
            ? 'Recorded recently'
            : `${Math.floor(daysSinceSpoke)} days since the last one`,
    },
  ];

  return { newLeft, today, waitingOnMe, listenedThisWeek, daysSinceSpoke, plan };
}

/**
 * The single most useful thing to do right now.
 *
 * Two things jump the queue. A partner waiting on a review, because it blocks
 * *their* progress rather than yours. And an overdue exam half — which is a
 * correction, not a nicety: the daily card goal is thirty cards and is
 * therefore unfinished for most of most days, so "the first unfinished step"
 * meant words won every single time and the two halves the exam is actually
 * marked on sat permanently below them. A study plan that can never reach step
 * 4 is a study plan for learning vocabulary, which is not what this is for.
 *
 * Everything else is still simply the first unfinished step, which is what
 * keeps the button and the checklist agreeing.
 */
function nextAction(state, partner) {
  if (state.waitingOnMe > 0) {
    return {
      label: `Score ${partner.name}'s recording`,
      href: '#/review',
      why: `${partner.name} is waiting on a score. Doing it first unblocks them — and it is worth the most points.`,
    };
  }

  const step = state.plan.find((candidate) => candidate.urgent && !candidate.done) ?? state.plan.find((candidate) => !candidate.done);
  if (!step) {
    return {
      label: 'Practise anyway',
      href: '#/session',
      why: 'Everything is done for today. Anything more is a bonus.',
    };
  }

  if (step.id === 'words') {
    const left = state.today.goal - state.today.cards;
    if (state.today.cards > 0) {
      return {
        label: `Carry on — ${left} cards to go`,
        href: '#/session',
        why: `${state.today.cards} cards done today, ${left} to reach the goal. The count of what is due moves around as you work; this one only goes up.`,
      };
    }
    return state.newLeft > 0
      ? {
          label: `Learn ${state.newLeft} new words`,
          href: '#/session',
          why: `New words come first. Today's goal is ${state.today.goal} cards — a card you get wrong comes straight back, and older words you already know return only now and then.`,
        }
      : {
          label: 'Practise today\'s words',
          href: '#/session',
          why: `Today's new words are done. This round is mistakes plus a handful of older words — today's goal is ${state.today.goal} cards.`,
        };
  }
  if (step.id === 'grammar') {
    return {
      label: step.href === '#/structure' ? 'Sentence structure' : 'Grammar practice',
      href: step.href,
      why:
        step.href === '#/structure'
          ? 'Where the verb goes. It is the rule English speakers break most, and Morphosyntax is marked in the interview — read it, then three cards.'
          : 'Gender, the n-rule, adjective endings, numbers, the dative — a quick focused round.',
    };
  }
  if (step.id === 'listening') {
    return {
      label: 'Do a listening set',
      href: '#/journey',
      why: 'Words are done for today. One listening set keeps the B1 half honest.',
    };
  }
  return {
    label: 'Record a speaking answer',
    href: '#/speaking',
    why:
      state.daysSinceSpoke === Infinity
        ? 'You have not recorded anything yet. Speaking is the half you have to pass.'
        : 'It has been a few days since you spoke. Speaking is the half you have to pass.',
  };
}

/* -------------------------------------------------------------------- UI */

/**
 * The cue chosen at onboarding, written back where it can be read.
 *
 * The plan is only worth asking for if it is visible afterwards — an
 * implementation intention works by making the cue easy to bring to mind, and
 * a preference saved into IndexedDB and never shown again does none of that.
 * Once the day is done it switches from a plan to an observation, because
 * "practise after dinner" is not useful advice at 9pm when you already have.
 */
function anchorNote(settings, met) {
  const anchor = PRACTICE_ANCHORS.find((option) => option.id === settings.practiceAnchor);
  if (!anchor) return null;
  return el(
    'p',
    { class: 'source-note', style: { marginBlockStart: 'var(--s5)' } },
    met ? `Done for today — same time tomorrow, ${anchor.sentence}.` : `Your plan: one session ${anchor.sentence}.`,
  );
}

function sectionLabel(text) {
  return el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)', marginBlockEnd: 'var(--s2)' } }, text);
}

function planRow(step, number) {
  return el(
    'a',
    { class: `plan${step.done ? ' is-done' : ''}`, href: step.href },
    el('span', { class: 'plan__n', 'aria-hidden': 'true' }, step.done ? '✓' : String(number)),
    el(
      'span',
      { class: 'spacer' },
      el('span', { class: 'card__title' }, step.title),
      // What this step is *for*, above what is left of it. The exam is the
      // reason any of these rows exist, and it was the one thing the list
      // never said.
      step.for ? el('span', { class: 'plan__for' }, step.for) : null,
      el('span', { class: 'card__note' }, step.note),
    ),
    el(
      'svg',
      { class: 'plan__chevron', viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' },
      el('path', { d: 'M9 6 L15 12 L9 18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round' }),
    ),
  );
}

/**
 * The last seven days, as seven dots.
 *
 * The streak was a number in the subtitle and nothing else, which is the one
 * form it cannot do its job in: a count says "you are on 4" without showing
 * what a day looks like, so there is nothing to keep unbroken and no way to
 * see the two freeze days the app already grants. Seven dots show the shape of
 * the week, which is the thing a habit is actually made of.
 *
 * Every state here is read off `streak.days`, which only ever records days
 * that were actually practised. Nothing is inferred, and a gap is drawn as a
 * gap — the point is to be able to see a slip, not to be protected from it.
 */
function weekStrip(streak, practisedToday) {
  const done = new Set(streak.days ?? []);
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86400000);
    const key = date.toISOString().slice(0, 10);
    // Today counts as soon as a card is answered, before the session that
    // writes it to the streak log has finished — otherwise the dot the learner
    // just earned stays grey until they leave the screen and come back.
    const filled = done.has(key) || (offset === 0 && practisedToday);
    days.push({
      key,
      filled,
      today: offset === 0,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
    });
  }

  return el(
    'div',
    { class: 'weekstrip', style: { marginBlockStart: 'var(--s3)' } },
    ...days.map((day) =>
      el(
        'div',
        {
          class: `weekstrip__day${day.filled ? ' is-done' : ''}${day.today ? ' is-today' : ''}`,
          title: `${day.label}${day.filled ? ' — practised' : ''}`,
        },
        el('span', { class: 'weekstrip__dot', 'aria-hidden': 'true' }),
        el('span', { class: 'weekstrip__label' }, day.label.slice(0, 1)),
      ),
    ),
  );
}

function miniMeter(label, value) {
  const pct = value ?? 0;
  return el(
    'div',
    { class: 'spacer' },
    el('p', { class: 'meter__label' }, label),
    el('p', { class: 'meter__value' }, formatPercent(value)),
    el(
      'div',
      { class: 'meter__track', style: { marginBlockStart: 'var(--s1)' } },
      el('div', { class: `meter__fill${pct > 50 ? ' is-pass' : ''}`, style: { width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` } }),
      el('span', { class: 'meter__threshold', 'aria-hidden': 'true' }),
    ),
  );
}
