/**
 * Settings — the two places Claude can be reached from, and the duel link.
 *
 * Explanations and the machine estimate both need Claude. There are two ways
 * to get there and they are not equivalent, so the screen says which is which
 * rather than presenting them as interchangeable options:
 *
 *   Worker    — the key lives on a server, explanations are cached once for
 *               both players, and the shared scoreboard works. More setup.
 *   API key   — nothing to deploy, works immediately, but the key sits on this
 *               device and each device pays for its own explanations.
 */

import { el, screenHead, button } from '../dom.js';
import { getSettings, saveSettings } from '../store.js';
import { keyWarning, looksLikeApiKey } from '../anthropic.js';

export async function render(root, { navigate }) {
  const settings = await getSettings();

  const apiKey = field({
    id: 'apikey',
    type: 'password',
    placeholder: 'sk-ant-…',
    value: settings.apiKey ?? '',
  });

  const secret = field({
    id: 'secret',
    type: 'password',
    placeholder: 'Shared secret (optional)',
    value: settings.secret ?? '',
  });

  const workerUrl = field({
    id: 'worker',
    type: 'url',
    placeholder: 'https://…workers.dev',
    value: settings.workerUrl ?? '',
  });

  const status = el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s3)' }, role: 'status' });

  const save = button('Save', {
    variant: 'primary',
    class: 'btn btn--primary btn--block',
    onclick: async () => {
      const key = apiKey.value.trim();
      // Checked rather than assumed: a mistyped key otherwise fails later, on
      // a card, as an unexplained error.
      if (key !== '' && !looksLikeApiKey(key)) {
        status.textContent = 'That does not look like an Anthropic key — they start with "sk-ant-". Saved nothing.';
        return;
      }
      await saveSettings({
        apiKey: key,
        secret: secret.value.trim(),
        workerUrl: workerUrl.value.trim().replace(/\/$/, ''),
      });
      status.textContent = 'Saved.';
    },
  });

  root.append(
    screenHead({ title: 'Settings', sub: 'Explanations, feedback, and the duel', back: '#/today' }),

    sectionLabel('Explanations'),
    el(
      'div',
      { class: 'card' },
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
        'Sentence explanations and the machine estimate both call Claude. Set up either of the two below — an API key is the quicker one.',
      ),
      el('label', { for: 'apikey', class: 'meter__label' }, 'Anthropic API key'),
      apiKey,
      el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } }, keyWarning),
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } },
        'Create one at ',
        el('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noreferrer' }, 'console.anthropic.com'),
        '.',
      ),
    ),

    sectionLabel('Duel'),
    el(
      'div',
      { class: 'card' },
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
        'A Worker shares scores between both phones, and keeps the API key off your device. Both phones need the same two values.',
      ),
      el('label', { for: 'worker', class: 'meter__label' }, 'Worker URL'),
      workerUrl,
      el('label', { for: 'secret', class: 'meter__label', style: { marginBlockStart: 'var(--s3)' } }, 'Shared secret'),
      secret,
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } },
        'Leave both blank to practise on your own. Scores stay on this device until a Worker is set, then sync.',
      ),
    ),

    el('div', { style: { marginBlockStart: 'var(--s5)' } }, save, status),
  );

  return { destroy() {} };
}

function sectionLabel(text) {
  return el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)', marginBlockEnd: 'var(--s2)' } }, text);
}

function field({ id, type, placeholder, value }) {
  return el('input', {
    type,
    id,
    class: 'field',
    placeholder,
    value,
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    style: { textAlign: 'start' },
  });
}
