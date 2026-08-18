/**
 * The card that explains a game before you play it.
 *
 * Written after a plain report that the Arcade gave no idea what was expected.
 * That was accurate, and it had three separate causes:
 *
 *   1. the only explanation on screen sat *below* the answer buttons, in
 *      Amelie's bubble, so it was read after answering if at all;
 *   2. what it said was design rationale rather than teaching — "backwards
 *      from a normal conjugation drill" tells a reviewer something and a
 *      learner nothing;
 *   3. nothing anywhere said what to physically do with the card.
 *
 * So the explanation moved in front of the round, got rewritten in the
 * learner's voice, and gained a "what you do" line. This is the same shape the
 * rest of the app already teaches with — a one-line rule, a few points, then
 * the exercise — rather than a new idea; see `grammar-guide.js`.
 *
 * It is shown automatically the first time a game is opened and is one tap
 * away afterwards, because an explanation you cannot get back to is only
 * slightly better than none.
 */

import { el, button } from '../dom.js';
import { Amelie } from '../amelie.js';
import { PERSONS } from './verbs.js';

/** Games whose brief has been seen, so it only interrupts once. */
const STORAGE_KEY = 'arcade.briefed';

function seen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function hasSeenBrief(id) {
  return seen().has(id);
}

export function markBriefSeen(id) {
  try {
    const all = seen();
    all.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...all]));
  } catch {
    // A private-mode failure here costs the player one extra card to dismiss,
    // which is not worth failing the screen over.
  }
}

/**
 * The present tense of one verb, straight out of the deck.
 *
 * A written-out example would mean authoring Luxembourgish, which this project
 * does not do anywhere — so the table on the teaching card is the same table
 * the game draws its questions from. If the verb is missing the table is
 * simply left out and the words carry the explanation.
 */
export function demoTable(verbs, infinitive) {
  const verb = (verbs ?? []).find((row) => row.infinitive === infinitive);
  if (!verb?.present) return null;
  return {
    infinitive: verb.infinitive,
    en: verb.en,
    rows: PERSONS.map((person) => ({
      pronoun: person.pronoun,
      en: person.en,
      form: verb.present[person.key],
      // The shortcut the number game turns on, marked where it happens rather
      // than only described.
      isInfinitive: verb.present[person.key] === verb.infinitive,
    })).filter((row) => row.form),
  };
}

function tableCard(table) {
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'meter__label' }, `${table.infinitive}${table.en ? ` · ${table.en}` : ''}`),
    el(
      'div',
      { class: 'brief__table' },
      ...table.rows.flatMap((row) => [
        el('span', { class: 'brief__person' }, `${row.pronoun} `, el('span', { class: 'brief__gloss' }, row.en)),
        el('span', { class: row.isInfinitive ? 'brief__form brief__form--same' : 'brief__form' }, row.form),
      ]),
    ),
    table.rows.some((row) => row.isInfinitive)
      ? el('p', { class: 'source-note' }, 'The highlighted forms are the infinitive again, unchanged.')
      : null,
  );
}

/**
 * The words this round will actually put in front of you.
 *
 * Generated from the same deck lookup the round uses, so it cannot advertise
 * material the round does not have — and when the A1 filter takes something
 * out, it disappears from here too. Seeing the openers before meeting them as
 * questions is most of what "I didn't know what was expected" was asking for.
 */
function vocabularyCard(vocabulary) {
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'meter__label' }, 'What comes up'),
    el(
      'div',
      { class: 'brief__table' },
      ...vocabulary.flatMap((entry) => [
        el('span', { class: 'brief__form' }, entry.lb),
        el('span', { class: 'brief__gloss' }, entry.en ?? ''),
      ]),
    ),
  );
}

/**
 * Renders the brief into `root`, calling `onStart` when the player is ready.
 *
 * `game` needs `title`, `ask` and `how`; `rule` and `points` are shown when
 * present, which lets the sentence-function patterns reuse this with a shorter
 * brief than the verb games carry.
 */
export function renderBrief(root, game, { verbs, onStart, startLabel = 'Start' }) {
  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.say(game.rule ?? game.ask, 'idle');

  const table = game.demo ? demoTable(verbs, game.demo) : null;

  root.append(
    el(
      'div',
      { class: 'stack stack--lg' },
      el('div', { class: 'card' }, amelie.el),

      // What you physically do, first and on its own. This is the line that
      // was missing entirely, and it is the one a player needs soonest.
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'meter__label' }, 'What you do'),
        el('p', { class: 'card__title' }, game.how),
      ),

      table ? tableCard(table) : null,
      game.vocabulary?.length ? vocabularyCard(game.vocabulary) : null,

      game.points?.length
        ? el(
            'div',
            { class: 'card' },
            el('p', { class: 'meter__label' }, 'Worth knowing'),
            el('ul', { class: 'brief__points' }, ...game.points.map((point) => el('li', {}, point))),
            // The long version lives in the cheat sheet's notecards, so the
            // brief points at it instead of growing a second copy that would
            // have to be kept true separately.
            game.guide
              ? el(
                  'a',
                  { class: 'brief__more', href: `#/notecards/${game.guide}` },
                  'The full rule, with examples →',
                )
              : null,
          )
        : null,

      button(startLabel, {
        variant: 'primary',
        class: 'btn btn--primary btn--block',
        onclick: () => {
          markBriefSeen(game.id);
          onStart();
        },
      }),
    ),
  );
}

/**
 * The "how does this work again?" control that sits on a running round.
 *
 * No aria-label: the visible text is already the label, and an aria-label
 * *replaces* the accessible name rather than adding to it — so a mismatched
 * one gives a screen reader different words from the ones on screen.
 */
export function briefButton(onOpen) {
  return el('button', { type: 'button', class: 'chip chip--action', onclick: onOpen }, 'How it works');
}
