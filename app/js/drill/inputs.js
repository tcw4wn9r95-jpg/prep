/**
 * The three answer widgets.
 *
 * Each one takes a card and a `onAnswer(result)` callback and returns
 * `{ el, lock() }`. The engine does not care which is on screen — that is what
 * lets a word escalate from tapping an option to typing the word without the
 * renderer growing a branch per stage.
 */

import { el, fill, button } from '../dom.js';
import { checkTyped } from './match.js';
import { joinArticle } from './cards.js';

/* ---------------------------------------------------------------- A/B/C/D */

const KEYS = ['A', 'B', 'C', 'D'];

export function choiceInput(card, onAnswer) {
  const buttons = card.options.map((option, index) =>
    el(
      'button',
      { type: 'button', class: 'option', onclick: () => answer(option) },
      el('span', { class: 'option__key', 'aria-hidden': 'true' }, KEYS[index] ?? ''),
      el('span', {}, option.value),
    ),
  );
  const wrap = el('div', { class: 'options' }, ...buttons);
  let answered = false;

  function answer(chosen) {
    if (answered) return;
    answered = true;
    wrap.classList.add('is-answered');
    const correctIndex = card.options.findIndex((option) => option.correct);
    buttons[correctIndex].classList.add('is-correct');
    if (!chosen.correct) buttons[card.options.indexOf(chosen)].classList.add('is-wrong');
    onAnswer({ correct: Boolean(chosen.correct), partial: false, given: chosen.value });
  }

  return { el: wrap, lock: () => { answered = true; wrap.classList.add('is-answered'); } };
}

/* ------------------------------------------------------------- letter bank */

export function bankInput(card, onAnswer) {
  /** @type {Array<{id: string, character: string}>} */
  let picked = [];
  let answered = false;

  const slots = el('div', { class: 'slots', 'aria-live': 'polite' });
  const bank = el('div', { class: 'bank' });
  const check = button('Check', { variant: 'primary', class: 'btn btn--primary btn--block', disabled: true, onclick: submit });

  const tiles = new Map(
    card.bank.map((tile) => [
      tile.id,
      el('button', { type: 'button', class: 'bank__tile', onclick: () => take(tile) }, tile.character),
    ]),
  );

  function render() {
    fill(
      slots,
      ...(picked.length === 0
        ? [el('span', { class: 'slots__empty' }, card.bankKind === 'word' ? 'Tap the words in order' : 'Tap the letters in order')]
        : picked.map((tile) =>
            el('button', { type: 'button', class: 'slot', 'aria-label': `Remove ${tile.character}`, onclick: () => drop(tile) }, tile.character),
          )),
    );
    check.disabled = picked.length === 0;
  }

  function take(tile) {
    if (answered || picked.some((chosen) => chosen.id === tile.id)) return;
    picked = [...picked, tile];
    tiles.get(tile.id).classList.add('is-used');
    render();
  }

  function drop(tile) {
    if (answered) return;
    picked = picked.filter((chosen) => chosen.id !== tile.id);
    tiles.get(tile.id).classList.remove('is-used');
    render();
  }

  function submit() {
    if (answered || picked.length === 0) return;
    answered = true;
    // Letters run together; words need the spaces back.
    const given = picked.map((tile) => tile.character).join(card.bankKind === 'word' ? ' ' : '');
    const result = checkTyped(given, card.answer);
    slots.classList.add(result.correct ? 'is-correct' : 'is-wrong');
    check.hidden = true;
    onAnswer({ ...result, given });
  }

  fill(bank, ...tiles.values());
  render();

  return {
    el: el('div', { class: 'stack' }, slots, bank, check),
    lock: () => { answered = true; },
  };
}

/* -------------------------------------------------------------- free typing */

export function typeInput(card, onAnswer) {
  let answered = false;
  let article = null;

  const field = el('input', {
    class: 'field',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-label': 'Your answer',
    placeholder: 'Type in Luxembourgish',
    onkeydown: (event) => {
      if (event.key === 'Enter') submit();
    },
    oninput: () => { check.disabled = field.value.trim() === ''; },
  });

  // The accented characters are three taps deep on an iOS keyboard, so they get
  // their own row. Typing them directly works too.
  const accents = el(
    'div',
    { class: 'accents' },
    ...['é', 'ë', 'ä', 'ö', 'ü'].map((character) =>
      el('button', { type: 'button', class: 'accents__key', tabindex: '-1', onclick: () => insert(character) }, character),
    ),
  );

  const ARTICLES = ['de', "d'"];
  const articleButtons = card.article
    ? ARTICLES.map((option) =>
        el(
          'button',
          {
            type: 'button',
            class: 'chip chip--pick',
            'aria-pressed': 'false',
            onclick: () => {
              if (answered) return;
              article = option;
              articleButtons.forEach((other, index) => {
                const isPicked = ARTICLES[index] === option;
                other.setAttribute('aria-pressed', String(isPicked));
                other.classList.toggle('is-picked', isPicked);
              });
            },
          },
          option,
        ),
      )
    : [];

  const check = button('Check', { variant: 'primary', class: 'btn btn--primary btn--block', disabled: true, onclick: submit });

  function insert(character) {
    if (answered) return;
    field.value += character;
    field.focus();
    check.disabled = field.value.trim() === '';
  }

  function submit() {
    if (answered || field.value.trim() === '') return;
    answered = true;
    field.readOnly = true;
    const result = checkTyped(field.value, card.answer);

    // The article is graded alongside the word: getting "Aarbecht" right but
    // calling it "de" is not knowing the noun. It downgrades to a partial
    // rather than a miss, because the word itself was retrieved.
    const articleWrong = Boolean(card.article) && article !== card.article;
    const graded = articleWrong && result.correct ? { correct: true, partial: true, reason: 'article' } : result;

    field.classList.add(graded.correct && !graded.partial ? 'is-correct' : graded.correct ? 'is-partial' : 'is-wrong');
    check.hidden = true;
    onAnswer({ ...graded, given: joinArticle(article, field.value), articleWrong });
  }

  return {
    el: el(
      'div',
      { class: 'stack' },
      articleButtons.length > 0
        ? el('div', { class: 'row', style: { justifyContent: 'center', gap: 'var(--s2)' } },
            el('span', { class: 'card__note' }, 'article'), ...articleButtons)
        : null,
      field,
      accents,
      check,
    ),
    focus: () => field.focus(),
    lock: () => { answered = true; },
  };
}

export const INPUTS = { choice: choiceInput, bank: bankInput, type: typeInput };
