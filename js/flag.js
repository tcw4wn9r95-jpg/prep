/**
 * "Something is wrong with this card."
 *
 * A small control at the bottom of every exercise. It exists because the decks
 * are generated — mined out of LOD by the pipeline — and generated content
 * fails in ways no test predicts: a gloss that is the wrong sense of a
 * homograph, a cloze whose gap has two right answers, an example sentence that
 * does not illustrate the thing it was chosen for. Several of those have been
 * found and fixed already, each time by someone noticing while using the app
 * and saying so. This is that path, made short.
 *
 * ## Two complaints, two answers
 *
 * The button asks which problem it is, because they are not the same problem:
 *
 *   *This does not make sense* — the card is broken. Nothing is gained by
 *   showing it again, so it stops appearing until the flag is taken off.
 *
 *   *I have seen this far too often* — the card is fine, it is the frequency
 *   that is wrong. Suppressing it permanently would be the wrong fix, because
 *   repetition is how the scheduler works and the word may genuinely not be
 *   learned yet. It rests for a fortnight and then comes back.
 *
 * ## What it deliberately does not do
 *
 * It does not touch the Leitner box. A flagged card keeps its real schedule
 * and simply stops being drawn, so taking the flag off restores the card as it
 * was rather than as a new one. That also means flagging cannot be used —
 * accidentally or otherwise — to make the numbers look better.
 */

import { el, fill } from './dom.js';
import { flagCard, FLAG_REASONS } from './store.js';

/**
 * @param {object} subject
 * @param {string} subject.playerId
 * @param {string} subject.source   which exercise or deck this card came from
 * @param {string} subject.id       the exercise's own id for the item
 * @param {string} [subject.label]  short human-readable version, for Settings
 */
export function flagButton(subject) {
  const wrap = el('div', { class: 'flag' });

  const open = () => {
    fill(
      wrap,
      el('p', { class: 'flag__ask' }, 'What is wrong with this one?'),
      el(
        'div',
        { class: 'flag__choices' },
        ...Object.entries(FLAG_REASONS).map(([reason, text]) =>
          el('button', { type: 'button', class: 'flag__choice', onclick: () => send(reason) }, text),
        ),
        el('button', { type: 'button', class: 'flag__cancel', onclick: closed }, 'Cancel'),
      ),
    );
  };

  const send = async (reason) => {
    // Written before the confirmation is shown: the card is usually about to
    // be replaced, and a flag that was reported as saved but was not is worse
    // than a slow one.
    await flagCard(subject.playerId, { ...subject, reason });
    fill(
      wrap,
      el(
        'p',
        { class: 'flag__done' },
        reason === 'repetitive' ? 'Noted — this one will rest for a couple of weeks.' : 'Noted — you will not see this one again.',
      ),
    );
  };

  function closed() {
    // `el` rather than the `button` helper: that one always applies the
    // `btn btn--variant` pair, and this is deliberately not a call to action —
    // it should sit quietly under the exercise until it is wanted.
    fill(wrap, el('button', { type: 'button', class: 'flag__open', onclick: open }, 'Something wrong with this card?'));
  }

  closed();
  return wrap;
}

/**
 * A flag control that stays put while the card underneath it changes.
 *
 * The drill engine rebuilds its whole body per card and can just call
 * `flagButton` again, but the standalone games swap one card's contents in
 * place — so they need a slot they can re-point at the new card. Re-pointing
 * also resets the control to its closed state, which matters: leaving "Noted"
 * on screen over the *next* card would be a lie about what was flagged.
 */
export function flagSlot() {
  const holder = el('div', {});
  return {
    el: holder,
    set(subject) {
      fill(holder, subject?.id ? flagButton(subject) : null);
    },
  };
}
