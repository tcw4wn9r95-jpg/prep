/**
 * The cheat sheet, opened over the current card instead of navigated to.
 *
 * `#/reference` is a fine destination when browsing from Learn, but a drill
 * session has an in-progress queue: navigating away loses whatever has not
 * been answered yet, exactly the moment someone reaches for a cheat sheet
 * least. A native `<dialog>` sidesteps that — it opens on top of the running
 * session and closes back into it, no router involved.
 */

import { el, button, bookIcon } from '../dom.js';
import { loadVocab, loadVerbs, loadPhrases, loadPhraseGroups, loadGrammar } from '../content.js';
import { renderContent } from '../screens/reference.js';

/** A book icon that opens the sheet. One dialog is built lazily on first tap
 * and reused for the rest of the session, so re-opening it costs nothing. */
export function referenceSheet() {
  let dialog = null;
  let ready = null;

  async function open() {
    if (!dialog) {
      const body = el('div', { class: 'stack stack--lg' }, el('p', { class: 'card__note' }, 'Loading…'));
      dialog = el(
        'dialog',
        { class: 'ref-sheet', onclick: (event) => { if (event.target === dialog) dialog.close(); } },
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 'var(--s4)' } },
          el('p', { class: 'screen__title', style: { fontSize: 'var(--size-lg)' } }, 'Cheat sheet'),
          button('Close', { variant: 'secondary', onclick: () => dialog.close() }),
        ),
        body,
      );
      document.body.append(dialog);
      ready = Promise.all([loadVocab(), loadVerbs(), loadPhrases(), loadPhraseGroups(), loadGrammar()]).then(
        ([vocab, verbs, phrases, groups, grammar]) => {
          body.replaceChildren();
          renderContent(body, { vocab, verbs, phrases, groups, grammar });
        },
      );
    }
    await ready;
    dialog.showModal();
  }

  const trigger = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Cheat sheet', onclick: open }, bookIcon());

  // The dialog lives on document.body, not inside the session screen, so it
  // survives navigation unless something removes it — one per session run
  // would otherwise pile up in the DOM as the pair moves from screen to screen.
  return { el: trigger, destroy: () => dialog?.remove() };
}
