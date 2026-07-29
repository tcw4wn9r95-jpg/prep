/**
 * Duel settings, reachable after onboarding via the gear on the Duel screen.
 *
 * Onboarding sets the shared secret and Worker URL once, on the very first
 * screen, and the router skips past that screen forever once a player is
 * picked. This is the way back to those two fields without re-picking a
 * player or losing local progress.
 */

import { el, screenHead, button } from '../dom.js';
import { getSettings, saveSettings } from '../store.js';

export async function render(root, { navigate }) {
  const settings = await getSettings();

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

  const status = el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } });

  const save = button('Save', {
    variant: 'primary',
    class: 'btn btn--primary btn--block',
    onclick: async () => {
      await saveSettings({
        secret: secret.value.trim(),
        workerUrl: workerUrl.value.trim().replace(/\/$/, ''),
      });
      status.textContent = 'Saved.';
      navigate('#/duel');
    },
  });

  root.append(
    screenHead({ title: 'Duel settings', sub: 'Both phones need the same values.', back: '#/duel' }),
    el(
      'div',
      { class: 'stack' },
      el('label', { for: 'secret', class: 'meter__label' }, 'Shared secret'),
      secret,
      el('label', { for: 'worker', class: 'meter__label' }, 'Worker URL'),
      workerUrl,
      el(
        'p',
        { class: 'source-note' },
        'Leave both blank to practise on your own. Scores stay on this device until a Worker is set, and sync when it is.',
      ),
      save,
      status,
    ),
  );

  return { destroy() {} };
}
