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
 *   2. cards are due — spaced repetition only works if reviews happen on time
 *   3. no listening this week — the B1 half needs a set
 *   4. no speaking in three days — the half you must pass
 *   5. otherwise, new words
 */

import { el, screenHead, button, plural, formatPercent, settingsButton } from '../dom.js';
import { Amelie } from '../amelie.js';
import { loadVocab, loadVerbs, loadPhrases, loadTopics } from '../content.js';
import {
  listAttempts,
  listRecordings,
  listReviews,
  readinessFor,
  dueCounts,
  getStreak,
  weekSeed,
  otherPlayer,
  PLAYERS,
} from '../store.js';

const SPEAKING_GAP_DAYS = 3;

export async function render(root, { settings, navigate }) {
  void navigate;
  const [attempts, recordings, reviews, streak, due, topics, vocab, verbs, phrases] = await Promise.all([
    listAttempts(),
    listRecordings(),
    listReviews(),
    getStreak(settings.playerId),
    dueCounts(settings.playerId),
    loadTopics(),
    loadVocab(),
    loadVerbs(),
    loadPhrases(),
  ]);

  const me = PLAYERS.find((player) => player.id === settings.playerId) ?? PLAYERS[0];
  const partner = otherPlayer(settings.playerId);
  const ready = readinessFor(settings.playerId, { attempts, recordings, reviews });
  const state = assess({ settings, attempts, recordings, reviews, due, topics, decks: { vocab, verbs, phrases } });
  const next = nextAction(state, partner);

  const amelie = new Amelie({ size: 'md', bubble: true });
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

    sectionLabel('Today'),
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
function assess({ settings, attempts, recordings, reviews, due, topics, decks }) {
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

  const totalWords = decks.vocab.length + decks.verbs.length + decks.phrases.length;
  const dueTotal = due.recv + due.prod;
  const newLeft = Math.max(0, due.target - due.newToday);

  const plan = [
    {
      id: 'words',
      title: 'Words',
      // Straight into the cards, not to the hub. A step that lands on another
      // menu is a step that has not been taken.
      href: '#/session',
      done: dueTotal === 0 && newLeft === 0,
      note:
        dueTotal > 0
          ? `${plural(dueTotal, 'card')} due`
          : newLeft > 0
            ? `${newLeft} new words to meet · ${totalWords} in the decks`
            : 'Done for today',
    },
    {
      id: 'listening',
      title: 'Listening',
      href: '#/journey',
      done: listenedThisWeek,
      note: listenedThisWeek ? 'Done this week' : `One set from ${plural(topics.length, 'topic')}`,
    },
    {
      id: 'speaking',
      title: 'Speaking',
      href: '#/speaking',
      done: daysSinceSpoke <= SPEAKING_GAP_DAYS,
      note:
        daysSinceSpoke === Infinity
          ? 'Not recorded yet — this is the half you must pass'
          : daysSinceSpoke <= SPEAKING_GAP_DAYS
            ? 'Recorded recently'
            : `${Math.floor(daysSinceSpoke)} days since the last one`,
    },
  ];

  return { dueTotal, newLeft, waitingOnMe, listenedThisWeek, daysSinceSpoke, plan };
}

/**
 * The single most useful thing to do right now.
 *
 * Only one thing jumps the queue: a partner waiting on a review, because it
 * blocks *their* progress rather than yours. Everything else is simply the
 * first unfinished step of the plan — which is what keeps the button and the
 * checklist agreeing. A button that said "do a listening set" while step 1 sat
 * unticked would be two different instructions on one screen.
 */
function nextAction(state, partner) {
  if (state.waitingOnMe > 0) {
    return {
      label: `Score ${partner.name}'s recording`,
      href: '#/review',
      why: `${partner.name} is waiting on a score. Doing it first unblocks them — and it is worth the most points.`,
    };
  }

  const step = state.plan.find((candidate) => !candidate.done);
  if (!step) {
    return {
      label: 'Practise anyway',
      href: '#/session',
      why: 'Everything is done for today. Anything more is a bonus.',
    };
  }

  if (step.id === 'words') {
    return state.dueTotal > 0
      ? {
          label: `Study ${plural(state.dueTotal, 'card')}`,
          href: '#/session',
          why: `${plural(state.dueTotal, 'card')} are due. These are the ones about to fade, so they come first.`,
        }
      : {
          label: `Learn ${state.newLeft} new words`,
          href: '#/session',
          why: 'Nothing is due yet. Start with words — the listening and speaking drills assume you have them.',
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
      el('span', { class: 'card__note' }, step.note),
    ),
    el(
      'svg',
      { class: 'plan__chevron', viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' },
      el('path', { d: 'M9 6 L15 12 L9 18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round' }),
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
