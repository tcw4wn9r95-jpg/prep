/**
 * Speaking notes — the flash-card screens. See `app/js/notes.js` for what a card
 * is and where its words come from.
 *
 *   #/speaking/cards/<topic>          a round: question, say it, reveal, grade
 *   #/speaking/cards/all              the same, across every topic
 *   #/speaking/cards/<topic>/notes    the topic as a list, and the reading beside it
 *
 * The round is built for one habit: answer out loud *before* looking. The back
 * of the card is a single tap away and nothing else on the front competes with
 * the question. Grading is honest and private — "Got it" or "Not yet" — because
 * nobody else can hear the answer, so nobody else can mark it.
 *
 * Like the other side activities it keeps its own progress and does not move the
 * Leitner boxes or the daily count.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie } from '../amelie.js';
import { loadSpeakingNotes, topicIcon } from '../content.js';
import { touchStreak, getSettings, saveSettings, flaggedCards } from '../store.js';
import { chimeCorrect } from '../chime.js';
import { flagSlot } from '../flag.js';
import {
  ROUND,
  IMAGE,
  MIX,
  GOT_KEY,
  ALL_KEY,
  poolFor,
  buildRound,
  progress,
  gotIn,
  backOf,
  hasAnswer,
  queueFor,
} from '../notes.js';

const icon = (topic) => (topic === IMAGE ? '🖼️' : topic === MIX ? '🎲' : topicIcon(topic));

/* -------------------------------------------------------------- progress */

async function loadGot() {
  return new Set((await getSettings())[GOT_KEY] ?? []);
}

async function setGot(id, value) {
  const settings = await getSettings();
  const got = new Set(settings[GOT_KEY] ?? []);
  if (value) got.add(id);
  else got.delete(id);
  await saveSettings({ [GOT_KEY]: [...got] });
}

/* ---------------------------------------------------- the speaking index */

/**
 * The block the Speaking tab opens with: every topic that has cards, and a mix.
 *
 * Returned as an element so `speaking.js` can place it; it loads its own data
 * and says so plainly when there is none, which is the state of a build that
 * does not ship the notes.
 */
export async function notesSection({ settings }) {
  const [deck, got, flagged] = await Promise.all([loadSpeakingNotes(), loadGot(), flaggedCards(settings.playerId)]);
  const rows = progress(deck, got, { flagged });
  const wrap = el('div', { class: 'stack' });

  if (rows.length === 0) {
    wrap.append(
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'card__title' }, 'No question cards here yet'),
        el('p', { class: 'card__note' }, 'The course notes are not loaded in this copy of the app.'),
      ),
    );
    return wrap;
  }

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const done = gotIn(rows);

  wrap.append(
    el(
      'a',
      { class: 'card notes__mix', href: `#/speaking/cards/${MIX}`, style: { display: 'block' } },
      el(
        'div',
        { class: 'row row--between' },
        el(
          'div',
          { class: 'row' },
          el('span', { style: { fontSize: '26px' }, 'aria-hidden': 'true' }, icon(MIX)),
          el(
            'div',
            {},
            el('p', { class: 'card__title' }, 'Ten questions, any topic'),
            el('p', { class: 'card__note' }, 'Like the interview: you do not know which one is next.'),
          ),
        ),
        el('span', { class: 'chip' }, `${done} / ${total}`),
      ),
    ),
    ...rows.map((row) => {
      const complete = row.total > 0 && row.got >= row.total;
      return el(
        'div',
        { class: `card${complete ? ' is-done' : ''}` },
        el(
          'div',
          { class: 'row row--between' },
          el('span', { class: 'card__title' }, `${icon(row.id)} ${row.title_en}`),
          el('span', { class: 'chip' }, complete ? 'done' : `${row.got} / ${row.total}`),
        ),
        el(
          'p',
          { class: 'card__note' },
          row.open > 0 ? `${plural(row.total, 'question')} with an answer · ${row.open} without` : plural(row.total, 'question')),
        el(
          'div',
          { class: 'meter__track', style: { marginBlock: 'var(--s2)' } },
          el('div', {
            class: `meter__fill${complete ? ' is-pass' : ''}`,
            style: { width: `${row.total === 0 ? 0 : Math.max((row.got / row.total) * 100, 2)}%` },
          }),
        ),
        el(
          'div',
          { class: 'row', style: { gap: 'var(--s2)' } },
          el('a', { class: 'chip chip--action', href: `#/speaking/cards/${row.id}` }, 'Practise'),
          el('a', { class: 'chip chip--action', href: `#/speaking/cards/${row.id}/notes` }, 'Your notes'),
        ),
      );
    }),
    el(
      'p',
      { class: 'source-note' },
      `From your course documents: ${deck.documents.join(' · ')}. The answers are quoted exactly as written there, so a spelling may differ from the dictionary.`,
    ),
  );
  return wrap;
}

/* ------------------------------------------------------------------ route */

export async function renderCards(root, { params, settings, navigate }) {
  const topic = params[1] ?? null;
  const mode = params[2] ?? null;
  const deck = await loadSpeakingNotes();

  const known = topic === MIX || deck.cards.some((card) => card.topic === topic);
  if (!topic || !known) {
    root.append(
      screenHead({ title: 'Questions', back: '#/speaking' }),
      el('div', { class: 'empty' }, el('p', {}, 'Those questions are not in the notes.'), button('Back', { variant: 'secondary', onclick: () => navigate('#/speaking') })),
    );
    return { destroy() {} };
  }
  if (mode === 'notes' && topic !== MIX) return renderNotes(root, deck, topic);
  return renderRound(root, deck, topic, { settings, navigate });
}

/* ------------------------------------------------------------ one round */

async function renderRound(root, deck, topic, { settings, navigate }) {
  const [got, flagged] = await Promise.all([loadGot(), flaggedCards(settings.playerId)]);
  let withNoAnswer = Boolean((await getSettings())[ALL_KEY]);

  const titles = new Map(deck.topics.map((one) => [one.id, one]));
  const title = topic === MIX ? 'Ten questions' : titles.get(topic)?.title_en ?? topic;

  const body = el('div', { class: 'stack drill__body' });
  const bar = el('div', { class: 'drill__next nc__bar', hidden: true });
  const progressFill = el('div', { class: 'meter__fill' });
  const flag = flagSlot();
  const amelie = new Amelie({ size: 'sm', bubble: true });
  const head = el('div');

  root.append(head, el('div', { class: 'meter__track', style: { marginBlockEnd: 'var(--s3)' } }, progressFill), body, bar);

  let queue = null;
  let planned = 0;
  let slots = 0; // the cards dealt, plus one more for each "not yet"
  let asked = 0;
  let gotNow = 0;
  let seen = new Set();

  function start() {
    const pool = poolFor(deck, topic, { withNoAnswer, flagged });
    const plan = buildRound(pool, got, { size: ROUND, seed: `${settings.playerId}:${topic}:${got.size}:${Date.now() % 997}` });
    queue = queueFor(plan);
    planned = plan.length;
    slots = plan.length;
    asked = 0;
    gotNow = 0;
    seen = new Set();

    fill(
      head,
      screenHead({ title, sub: pool.length === 0 ? null : plural(plan.length, 'question'), back: '#/speaking' }),
    );
    if (plan.length === 0) return empty();
    step();
  }

  function empty() {
    bar.hidden = true;
    const everything = poolFor(deck, topic, { withNoAnswer: true, flagged });
    fill(
      body,
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'card__title' }, 'No questions with an answer here yet'),
        el('p', { class: 'card__note' }, everything.length > 0 ? `${plural(everything.length, 'question')} in your notes have no model answer.` : 'Nothing in the notes for this topic.'),
      ),
      everything.length > 0
        ? button('Practise them anyway', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => { withNoAnswer = true; saveSettings({ [ALL_KEY]: true }); start(); } })
        : null,
    );
  }

  function step() {
    amelie.say(null, 'idle');
    const card = queue.next();
    if (!card) return finish();

    progressFill.style.width = `${(asked / slots) * 100}%`;
    const again = seen.has(card.id);
    seen.add(card.id);
    flag.set({ playerId: settings.playerId, source: 'speaking-notes', id: card.id, label: card.q });

    const front = el(
      'div',
      { class: 'card nc__card' },
      el(
        'div',
        { class: 'row', style: { justifyContent: 'center', gap: 'var(--s2)' } },
        el('span', { class: 'meter__label' }, `${Math.min(asked + 1, slots)} of ${slots}`),
        again ? el('span', { class: 'chip' }, 'again') : null,
      ),
      topic === MIX ? el('p', { class: 'nc__topic' }, `${icon(card.topic)} ${titles.get(card.topic)?.title_en ?? ''}`) : null,
      el('p', { class: 'nc__q' }, card.q),
      // A section card has no question — its heading is the prompt — so it says
      // in English what is being asked.
      card.hint_en ? el('p', { class: 'card__note' }, card.hint_en) : null,
    );
    const answerHolder = el('div');
    fill(body, front, answerHolder, flag.el);

    fill(
      bar,
      button('Show the answer', {
        variant: 'primary',
        class: 'btn btn--primary btn--block',
        onclick: () => reveal(card, front, answerHolder),
      }),
    );
    bar.hidden = false;
    bar.querySelector('button')?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });

    // Said, once, before the first card: the whole method is in this line.
    if (asked === 0) {
      amelie.say('Say your answer out loud first. Then look.', 'idle');
      amelie.el.hidden = false;
      front.append(amelie.el);
    }
  }

  function reveal(card, front, holder) {
    const back = backOf(card);
    amelie.el.hidden = true;
    front.classList.add('is-revealed');

    fill(
      holder,
      back.empty
        ? el(
            'div',
            { class: 'card nc__back' },
            el('p', { class: 'nc__label' }, 'No model answer yet'),
            el('p', { class: 'card__note' }, 'Your notes have the question but not an answer. Say yours, and check it with your teacher.'),
            ...back.notes.map((line) => el('p', { class: 'nc__note' }, line)),
          )
        : el(
            'div',
            { class: 'card nc__back' },
            el('p', { class: 'nc__label' }, back.answers.length > 1 ? 'Model answers' : 'Model answer'),
            el('div', { class: 'stack' }, ...back.answers.map((line) => el('p', { class: 'nc__answer' }, line))),
            back.notes.length > 0 ? el('div', { class: 'nc__notes' }, ...back.notes.map((line) => el('p', { class: 'nc__note' }, line))) : null,
            el('p', { class: 'source-note' }, `From: ${card.from}`),
          ),
    );

    // The last thing on the card, so the grading buttons never hide an answer.
    fill(
      bar,
      el(
        'div',
        { class: 'nc__grade' },
        button('Not yet', {
          variant: 'secondary',
          class: 'btn btn--secondary',
          onclick: () => grade(card, false),
        }),
        button('Got it', {
          variant: 'primary',
          class: 'btn btn--primary',
          onclick: () => grade(card, true),
        }),
      ),
    );
    bar.querySelector('.btn--primary')?.focus({ preventScroll: true });
    holder.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  async function grade(card, right) {
    asked += 1;
    if (right) {
      gotNow += 1;
      got.add(card.id);
      chimeCorrect();
      await setGot(card.id, true);
    } else {
      got.delete(card.id);
      await setGot(card.id, false);
      if (queue.again(card)) slots += 1;
    }
    step();
  }

  async function finish() {
    bar.hidden = true;
    progressFill.style.width = '100%';
    progressFill.classList.add('is-pass');
    touchStreak(settings.playerId).catch(() => {});

    const celebrate = planned > 0 && gotNow >= planned;
    const closing = new Amelie({ size: 'sm', bubble: true });
    if (celebrate) closing.celebrate('Every one, out loud.');
    else closing.say(`${gotNow} of ${planned} got.`, 'idle');

    const rows = progress(deck, got, { flagged });
    const left = rows.find((row) => row.id === topic);

    fill(
      body,
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'card__title' }, celebrate ? 'A clean round' : `${gotNow} of ${planned}`),
        el(
          'p',
          { class: 'card__note' },
          left ? `${left.got} of ${plural(left.total, 'question')} in this topic are marked got.` : 'The ones marked not yet come back first.',
        ),
      ),
      closing.el,
      button('Another ten', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => start() }),
      topic === MIX ? null : button('Your notes for this topic', { variant: 'secondary', onclick: () => navigate(`#/speaking/cards/${topic}/notes`) }),
      button('Back to the questions', { variant: 'ghost', onclick: () => navigate('#/speaking') }),
    );
  }

  start();
  return { destroy() {} };
}

/* ---------------------------------------------------------- the notes page */

/**
 * A topic as a list, to read rather than be tested on: every question with its
 * model answer behind a tap, and the vocabulary and grammar the documents kept
 * beside them. The night before the exam this is the page, not the round.
 */
function renderNotes(root, deck, topic) {
  const titles = new Map(deck.topics.map((one) => [one.id, one]));
  const cards = deck.cards.filter((card) => card.topic === topic);
  const extras = deck.extras.filter((one) => one.topic === topic);

  root.append(
    screenHead({ title: titles.get(topic)?.title_en ?? topic, sub: `${plural(cards.length, 'question')}, from your notes`, back: '#/speaking' }),
    el('div', { class: 'stack' }, ...cards.map(noteRow)),
  );

  if (extras.length > 0) {
    root.append(
      el(
        'details',
        { class: 'card nc__reading', style: { marginBlockStart: 'var(--s4)' } },
        el('summary', { class: 'card__title' }, `Vocabulary and grammar from your notes (${extras.reduce((sum, one) => sum + one.lines.length, 0)})`),
        ...extras.map((block) =>
          el('div', { class: 'stack', style: { marginBlockStart: 'var(--s3)' } }, el('p', { class: 'source-note' }, block.from), ...block.lines.map((line) => el('p', { class: 'nc__note' }, line))),
        ),
      ),
    );
  }

  root.append(
    el('a', { class: 'btn btn--primary btn--block', href: `#/speaking/cards/${topic}`, style: { marginBlockStart: 'var(--s4)' } }, 'Practise these'),
  );
  return { destroy() {} };
}

function noteRow(card) {
  const back = backOf(card);
  return el(
    'details',
    { class: 'card nc__row' },
    el('summary', { class: 'nc__rowq' }, card.q, hasAnswer(card) ? null : el('span', { class: 'chip', style: { marginInlineStart: 'var(--s2)' } }, 'no answer')),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      ...(card.hint_en ? [el('p', { class: 'card__note' }, card.hint_en)] : []),
      ...back.answers.map((line) => el('p', { class: 'nc__answer' }, line)),
      ...back.notes.map((line) => el('p', { class: 'nc__note' }, line)),
    ),
  );
}
