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

import { el, fill, screenHead, button } from '../dom.js';
import { listFlags, unflagCard, flagActive, FLAG_REASONS, getSettings, saveSettings, DAILY_GOALS, goalCards, breaksEnabled, playerName, MAX_NAME } from '../store.js';
import { keyWarning, looksLikeApiKey } from '../anthropic.js';
import { setChimeEnabled, chimePreview } from '../chime.js';
import { loadDeployInfo } from '../content.js';

export async function render(root, { navigate }) {
  const settings = await getSettings();
  const deployInfo = await loadDeployInfo();
  const flags = (await listFlags()).filter((flag) => flag.playerId === settings.playerId);

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

  // Default on: the sound was asked for, so an unset value means "yes".
  const sound = el('input', { type: 'checkbox', id: 'sound', class: 'switch', checked: settings.sound !== false });

  // Same reading, same reason: the A1 filter was asked for, so unset means on.
  const arcadeA1 = el('input', { type: 'checkbox', id: 'arcade-a1', class: 'switch', checked: settings.arcadeA1 !== false });
  const breaks = el('input', { type: 'checkbox', id: 'breaks', class: 'switch', checked: breaksEnabled(settings) });

  // The same label the one-time prompt sets. Here as well as there because a
  // prompt that appears once and can never be revisited makes a typo permanent.
  const displayName = field({ id: 'displayname', type: 'text', placeholder: 'Your name', value: playerName(settings) });
  displayName.setAttribute('maxlength', String(MAX_NAME));
  displayName.setAttribute('autocapitalize', 'words');
  // Applied on tap rather than on save, so the preview below tells the truth.
  sound.addEventListener('change', () => {
    setChimeEnabled(sound.checked);
    if (sound.checked) chimePreview();
  });

  // The daily goal, picked rather than imposed. Applied on tap like the sound
  // switch, because the number it changes is on the very next screen.
  let goal = DAILY_GOALS.find((option) => option.cards === goalCards(settings))?.id ?? 'steady';
  const goalButtons = DAILY_GOALS.map((option) =>
    el(
      'button',
      {
        type: 'button',
        class: `chip chip--pick${goal === option.id ? ' is-picked' : ''}`,
        'aria-pressed': goal === option.id ? 'true' : 'false',
        onclick: () => {
          goal = option.id;
          for (const [index, node] of goalButtons.entries()) {
            const isMe = DAILY_GOALS[index].id === goal;
            node.classList.toggle('is-picked', isMe);
            node.setAttribute('aria-pressed', isMe ? 'true' : 'false');
          }
          goalNote.textContent = `${option.cards} cards a day — ${option.note}.`;
        },
      },
      option.label,
    ),
  );
  const goalNote = el(
    'p',
    { class: 'card__note' },
    `${DAILY_GOALS.find((option) => option.id === goal)?.cards ?? 30} cards a day — ${DAILY_GOALS.find((option) => option.id === goal)?.note ?? ''}.`,
  );

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
        sound: sound.checked,
        arcadeA1: arcadeA1.checked,
        breaksOff: !breaks.checked,
        // Blank means "use the default for this player" rather than an empty
        // heading — `playerName` falls back when it is unset.
        displayName: displayName.value.trim(),
        dailyGoal: goal,
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

    sectionLabel('Your name'),
    el(
      'div',
      { class: 'card' },
      el('label', { for: 'displayname', class: 'meter__label' }, 'What the app calls you'),
      displayName,
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } },
        'Only the label changes. Your progress, streak and scores are stored against the player you picked at the start, not against this name, so renaming yourself moves nothing. Leave it empty to go back to the default.',
      ),
    ),

    sectionLabel('Daily goal'),
    el(
      'div',
      { class: 'card' },
      el('div', { class: 'chiprow' }, ...goalButtons),
      goalNote,
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
        'This is the bar on Today. It counts cards you have actually answered, so it only ever goes up — and nothing is withheld if you pass it or miss it.',
      ),
    ),

    sectionLabel('Sound'),
    el(
      'div',
      { class: 'card' },
      el(
        'label',
        { class: 'row row--between', for: 'sound' },
        el(
          'span',
          { class: 'spacer' },
          el('span', { class: 'card__title' }, 'Sound on a right answer'),
          el('span', { class: 'card__note' }, 'A short rising chime that climbs with each correct answer in a row.'),
        ),
        sound,
      ),
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
        'It stays silent while a recording is playing, so it never covers the listening exercise.',
      ),
    ),

    sectionLabel('Breaks'),
    el(
      'div',
      { class: 'card' },
      el(
        'label',
        { class: 'row row--between', for: 'breaks' },
        el(
          'span',
          { class: 'spacer' },
          el('span', { class: 'card__title' }, 'Offer a break mid-session'),
          el('span', { class: 'card__note' }, 'A minute to look away, breathe, stretch or trace a path — a third and two thirds of the way through the day’s goal.'),
        ),
        breaks,
      ),
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
        'Nothing in them is Luxembourgish and nothing is scored. Short pauses beat none, and the ones that ask least of your attention are the ones the next block of learning benefits from — which is why none of these is a hard puzzle against a clock.',
      ),
    ),

    sectionLabel('Cards you reported'),
    flagsCard(flags, settings.playerId),

    sectionLabel('Arcade'),
    el(
      'div',
      { class: 'card' },
      el(
        'label',
        { class: 'row row--between', for: 'arcade-a1' },
        el(
          'span',
          { class: 'spacer' },
          el('span', { class: 'card__title' }, 'A1 words only'),
          el('span', { class: 'card__note' }, 'Every sentence the Arcade asks you to build uses only words from the A1 list.'),
        ),
        arcadeA1,
      ),
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
        'Turning it off opens up LOD’s harder examples. Some patterns then have more to play — but a build card can ask for words you have not met.',
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

    sectionLabel('About'),
    el('div', { class: 'card' }, ...aboutRows(deployInfo)),
  );

  return { destroy() {} };
}

const REPO_URL = 'https://github.com/tcw4wn9r95-jpg/prep';

/**
 * What's actually running, so a stale phone (this is a cache-first PWA) is
 * visibly stale rather than silently out of date. `deployInfo` is null on
 * `npm run serve` — that is reported as a fact, not swallowed as an error.
 */
function aboutRows(deployInfo) {
  if (!deployInfo) {
    return [el('p', { class: 'card__note' }, 'Local build — no deploy info (expected when running npm run serve).')];
  }
  const builtAt = new Date(deployInfo.builtAt);
  const when = Number.isNaN(builtAt.getTime()) ? deployInfo.builtAt : builtAt.toLocaleString();
  return [
    el(
      'p',
      { class: 'card__note' },
      'Version ',
      el('a', { href: `${REPO_URL}/commit/${deployInfo.sha}`, target: '_blank', rel: 'noreferrer' }, deployInfo.shortSha ?? deployInfo.sha?.slice(0, 7)),
      ` · deployed ${when}`,
    ),
    el(
      'p',
      { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } },
      'If this looks old, the app is a cache-first PWA — fully close and reopen it (or hard-refresh a browser tab) to pick up a newer deploy.',
    ),
  ];
}

/**
 * What has been reported, and the way to undo it.
 *
 * A report that cannot be taken back is a trap: the whole point is that these
 * are snap judgements made mid-exercise, and some of them will be wrong — a
 * card flagged in irritation on a bad day should not be gone for good with no
 * way to find out what was lost.
 */
function flagsCard(flags, playerId) {
  if (flags.length === 0) {
    return el(
      'div',
      { class: 'card' },
      el(
        'p',
        { class: 'card__note' },
        'Nothing reported yet. Every exercise has a “Something wrong with this card?” link at the bottom — use it when a question does not make sense, or when you have seen it far too often. Skipping a listening card you cannot hear reports it here too.',
      ),
    );
  }

  const rows = el('div', { class: 'stack' });
  const render = (list) => {
    fill(
      rows,
      ...list.map((flag) => {
        const resting = flag.reason === 'repetitive';
        const active = flagActive(flag);
        return el(
          'div',
          { class: 'row row--between', style: { gap: 'var(--s3)', alignItems: 'flex-start' } },
          el(
            'span',
            { class: 'spacer' },
            el('span', { class: 'card__title' }, flag.label),
            el(
              'span',
              { class: 'card__note' },
              `${FLAG_REASONS[flag.reason] ?? flag.reason}` +
                (resting ? (active ? ' · resting' : ' · back in the deck') : '') +
                (flag.count > 1 ? ` · reported ${flag.count} times` : ''),
            ),
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'chip chip--action',
              onclick: async () => {
                await unflagCard(playerId, flag.source, flag.itemId);
                const remaining = list.filter((row) => row.key !== flag.key);
                render(remaining);
              },
            },
            'Undo',
          ),
        );
      }),
    );
  };
  render(flags);

  return el(
    'div',
    { class: 'card' },
    rows,
    el(
      'p',
      { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } },
      'A card that does not make sense, or whose recording would not play, stays out until you undo it. One you have simply seen too often rests for a fortnight and then comes back. Your place in the review schedule is untouched either way — reporting a card is not getting it wrong.',
    ),
  );
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
