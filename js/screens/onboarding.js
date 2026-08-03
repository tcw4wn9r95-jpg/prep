/**
 * Onboarding — the only place Amelie gets the whole screen.
 *
 * Two users, hardcoded, no signup. The shared secret is what the Worker uses
 * to pair the two devices; leaving it blank is fine and keeps the app fully
 * local, which is the honest default before a Worker is deployed.
 */

import { el, button } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { PLAYERS, getSettings, saveSettings } from '../store.js';
import { unlock } from '../audio.js';

/**
 * Everyday events to hang the session off, phrased as the cue rather than the
 * clock. "After breakfast" is a thing that happens; "08:00" is a thing that
 * has to be remembered. Exported so Today can render the chosen one back
 * without a second copy of the wording.
 */
export const PRACTICE_ANCHORS = [
  { id: 'coffee', label: 'With my morning coffee', sentence: 'with your morning coffee' },
  { id: 'commute', label: 'On the way to work', sentence: 'on the way to work' },
  { id: 'lunch', label: 'At lunch', sentence: 'at lunch' },
  { id: 'evening', label: 'After dinner', sentence: 'after dinner' },
  { id: 'bed', label: 'Before bed', sentence: 'before bed' },
];

export async function render(root, { navigate }) {
  const settings = await getSettings();
  let picked = settings.playerId ?? null;

  const amelie = new Amelie({ size: 'lg', bubble: true });
  amelie.el.classList.add('amelie--stack', 'amelie--hero');
  amelie.say(AMELIE_LINES.welcome, 'idle');

  const secret = el('input', {
    type: 'password',
    class: 'option',
    id: 'secret',
    placeholder: 'Shared secret (optional)',
    value: settings.secret ?? '',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });

  const workerUrl = el('input', {
    type: 'url',
    class: 'option',
    id: 'worker',
    placeholder: 'Worker URL (optional)',
    value: settings.workerUrl ?? '',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });

  /**
   * When you will practise — asked once, here, and shown back on Today.
   *
   * This is not a reminder and it does not schedule anything: the app sends no
   * notifications and is not going to start. It is an implementation
   * intention, which is a different mechanism — naming the *event* a habit
   * hangs off ("after coffee") is what builds automaticity, whereas a reminder
   * builds a dependency on the reminder and the behaviour stops when it does.
   * A PWA that cannot nag is actually the right shape for this: the cue has to
   * be something already in the day.
   *
   * Skippable, and skipping it costs nothing but the line on Today.
   */
  let anchor = settings.practiceAnchor ?? null;
  const anchorButtons = PRACTICE_ANCHORS.map((option) =>
    el(
      'button',
      {
        type: 'button',
        class: `chip chip--pick${anchor === option.id ? ' is-picked' : ''}`,
        'aria-pressed': anchor === option.id ? 'true' : 'false',
        onclick: (event) => {
          // Tapping the chosen one again clears it — the answer "I would
          // rather not say" has to be reachable after a stray tap.
          anchor = anchor === option.id ? null : option.id;
          for (const node of anchorButtons) {
            const isMe = node === event.currentTarget && anchor !== null;
            node.classList.toggle('is-picked', isMe);
            node.setAttribute('aria-pressed', isMe ? 'true' : 'false');
          }
        },
      },
      option.label,
    ),
  );

  const start = button('Start practising', {
    variant: 'primary',
    class: 'btn btn--primary btn--block',
    disabled: !picked,
    onclick: async () => {
      // Called inside a tap, so this is the moment iOS lets us prime audio.
      unlock();
      await saveSettings({
        playerId: picked,
        secret: secret.value.trim(),
        workerUrl: workerUrl.value.trim().replace(/\/$/, ''),
        practiceAnchor: anchor,
      });
      navigate('#/today');
    },
  });

  const buttons = PLAYERS.map((player) =>
    el(
      'button',
      {
        type: 'button',
        class: `player-pick__btn${picked === player.id ? ' is-picked' : ''}`,
        'aria-pressed': picked === player.id ? 'true' : 'false',
        onclick: (event) => {
          picked = player.id;
          for (const node of buttons) {
            const isMe = node === event.currentTarget;
            node.classList.toggle('is-picked', isMe);
            node.setAttribute('aria-pressed', isMe ? 'true' : 'false');
          }
          start.disabled = false;
          amelie.say(`Good luck, ${player.name}. Let us start with listening.`, 'celebrating');
        },
      },
      el('span', { class: 'player-pick__avatar' }, player.initial),
      el('span', {}, player.name),
    ),
  );

  root.append(
    el(
      'div',
      { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s6)' } },
      amelie.el,
      el(
        'div',
        { class: 'stack' },
        el('h1', { class: 'screen__title', style: { textAlign: 'center' } }, 'Sproochentest Duel'),
        el(
          'p',
          { class: 'screen__sub', style: { textAlign: 'center' } },
          'Practice for the INLL exam: B1 listening, A2 speaking. You score each other.',
        ),
      ),
      el('div', { class: 'stack' }, el('p', { class: 'meter__label' }, AMELIE_LINES.pickPlayer), el('div', { class: 'player-pick' }, ...buttons)),
      el(
        'div',
        { class: 'stack' },
        el('p', { class: 'meter__label' }, 'When will you practise?'),
        el(
          'p',
          { class: 'card__note' },
          'Pick something already in your day to hang it off. No notifications — this is just written down where you will see it.',
        ),
        el('div', { class: 'chiprow' }, ...anchorButtons),
      ),
      el(
        'details',
        { class: 'card card--flat' },
        el('summary', { class: 'card__title' }, 'Duel settings'),
        el(
          'div',
          { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
          el('label', { for: 'secret', class: 'meter__label' }, 'Shared secret'),
          secret,
          el('label', { for: 'worker', class: 'meter__label' }, 'Worker URL'),
          workerUrl,
          el(
            'p',
            { class: 'source-note' },
            'Leave both blank to practise on your own. Scores stay on this device until a Worker is set, and sync when it is.',
          ),
        ),
      ),
      start,
      el(
        'p',
        { class: 'source-note' },
        'Vocabulary and audio: Lëtzebuerger Online Dictionnaire (CC0), Zenter fir d’Lëtzebuerger Sprooch. ',
        el('a', { href: 'https://www.inll.lu/fr/sproochentest/', target: '_blank', rel: 'noopener' }, 'Official exam information and sample papers'),
        ' are published by the INLL.',
      ),
    ),
  );

  return { destroy() {} };
}
