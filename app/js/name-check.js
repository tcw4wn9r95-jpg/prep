/**
 * "Is this your name?" — asked once, on the first launch after this shipped.
 *
 * ## What it does and does not change
 *
 * It changes a **label**. `PLAYERS[].id` is a database key: it is part of every
 * `learn` row's compound key, it backs five IndexedDB indexes, it is the
 * `streak:${playerId}` key, and the Worker's scoreboard validates it against
 * its own fixed list. Renaming that would orphan the person's entire history
 * and desync the duel. So the id never moves, and `settings.displayName`
 * overrides the name shown — see `playerName()` in store.js.
 *
 * ## Why a dialog rather than a screen
 *
 * The same reason the cheat sheet is one. A screen would need a route, and a
 * route can be navigated back to, refreshed into, or deep-linked — none of
 * which is right for a thing that happens once. A native `<dialog>` opens on
 * top of whatever loaded, closes into it, and leaves no history behind.
 *
 * ## Once means once
 *
 * `nameConfirmed` is written whichever way the dialog is dismissed — confirmed,
 * renamed, or closed with Escape. A prompt that returns because you did not
 * answer it "properly" is a prompt that has stopped being a question. Someone
 * who wants to change their mind later has the field in Settings, which is also
 * the answer to the obvious hazard of a one-shot rename: a typo you can never
 * take back.
 */

import { el, button } from './dom.js';
import { getSettings, nameConfirmed, confirmName, playerName, MAX_NAME } from './store.js';

/**
 * The dialog while it is open, and whether this page load is finished with it.
 *
 * Both are needed, and the second one was learned the hard way. `pending` alone
 * stops a quick second navigation opening a second dialog — but a settled
 * promise stays settled, so once it had resolved `true` every later call handed
 * the caller that same `true` again. `main.js` re-routes on `true`, and
 * re-routing calls back in here: the screen re-rendered in a tight loop, which
 * is what "the screen flickers a lot" was.
 *
 * `handled` is the latch. Answered once, this module reports `false` forever
 * after, whatever the promise it once returned still says.
 */
let pending = null;
let handled = false;

/**
 * Shows the prompt if it is due. Resolves `true` only when the displayed name
 * actually changed, so the caller knows whether anything needs redrawing —
 * and `false` on every call after the first, so it cannot ask twice.
 */
export async function askName() {
  if (handled) return false;
  // `route()` runs this on every navigation, and it is async — without this a
  // quick second navigation while the first read is in flight opens a second
  // dialog on top of the first.
  if (pending) return pending;
  const settings = await getSettings();
  // No player yet means onboarding is about to run, and it asks its own way.
  if (!settings.playerId || nameConfirmed(settings)) {
    handled = true;
    return false;
  }

  const current = playerName(settings);
  const field = el('input', {
    type: 'text',
    id: 'name-check',
    class: 'field',
    value: current,
    maxlength: String(MAX_NAME),
    autocomplete: 'given-name',
    autocapitalize: 'words',
    spellcheck: 'false',
    'aria-label': 'Your name',
  });

  pending = new Promise((resolve) => {
    let settled = false;
    const finish = async (name) => {
      if (settled) return;
      settled = true;
      handled = true;
      pending = null;
      await confirmName(name);
      dialog.close();
      dialog.remove();
      // Resolves whether the *label* moved, not whether the dialog was seen.
      // "That is right" changes nothing on screen, so the caller has nothing to
      // redraw — and a redraw it does not need is a flash of the whole app.
      resolve(String(name ?? '').trim() !== current);
    };

    const dialog = el(
      'dialog',
      {
        class: 'ref-sheet name-check',
        // Escape counts as an answer — see the note above. Without this the
        // dialog would come back on the next launch having already been read.
        oncancel: (event) => {
          event.preventDefault();
          finish(current);
        },
      },
      el('p', { class: 'screen__title', style: { fontSize: 'var(--size-lg)' } }, 'Is this your name?'),
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s4)' } },
        'It is what the app calls you on Today and on the scoreboard. Change it if it is wrong — your progress, streak and scores stay exactly where they are.',
      ),
      el('label', { for: 'name-check', class: 'meter__label' }, 'Your name'),
      field,
      el(
        'div',
        { class: 'stack', style: { marginBlockStart: 'var(--s5)' } },
        button('Save', {
          variant: 'primary',
          class: 'btn btn--primary btn--block',
          onclick: () => finish(field.value),
        }),
        button(`That is right, I am ${current}`, {
          variant: 'secondary',
          class: 'btn btn--secondary btn--block',
          onclick: () => finish(current),
        }),
      ),
    );

    document.body.append(dialog);
    dialog.showModal();
    // Selected rather than merely focused: the commonest edit is replacing the
    // whole thing, and the commonest answer is not typing at all.
    field.focus();
    field.select();
  });
  return pending;
}
