/**
 * What is this? — a picture-naming game, not a level to unlock.
 *
 * Same optional-game shape as Pairs and Gender Sort: it counts for the
 * streak, but it never touches the Leitner boxes. Naming a word from a photo
 * in front of you is a different, easier task than the recall the main decks
 * test, and letting an easy win move that schedule would drift it without
 * anything looking wrong.
 *
 * One round is one multiple-choice pass over eight pictures — recognise the
 * word, not produce it from memory. The input widget is the drill engine's
 * own (`drill/inputs.js`) — a picture card has nothing to teach a shared "tap
 * the right option" widget the vocabulary drill has not already taught it, so
 * this screen borrows it rather than building a second copy. Spelling from
 * memory is what the vocabulary drill's production cards already test, once
 * a word is strong enough to be asked that way — this screen stays a quick,
 * low-stakes recognition game rather than duplicating that harder task.
 *
 * Every photograph is openly licensed, sourced by pipeline/fetch-object-images.js
 * from Wikimedia Commons, for a word the vocabulary deck already ships — never
 * an image chosen or a word invented here. See that file for the full rule on
 * which words qualify and why (concrete, picturable categories only; no
 * people, no months, no abstractions that slipped through the category tags).
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { loadWordImages } from '../content.js';
import { touchStreak, suppressedFor } from '../store.js';
import { flagSlot } from '../flag.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { choiceInput } from '../drill/inputs.js';

const ROUND_SIZE = 8;
const OPTION_COUNT = 4;

function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** A fresh round: ROUND_SIZE pictures, drawn at random so repeat play does
 * not just replay the same eight in the same order. Same shape as
 * gender-sort.js's `roundFrom` — the two games share the "quick round from a
 * shuffled pool" idea, not the code, since the pools are different shapes. */
export function roundFrom(pool, size = ROUND_SIZE, random = Math.random) {
  return shuffle(pool, random).slice(0, Math.min(size, pool.length));
}

/** `count` wrong answers for `item`, drawn from the rest of the pool. Every
 * word in word-images.json names a different real-world thing — the fetch
 * script drops true synonyms before it ever writes the file — so a random
 * draw cannot hand back a second word that is also secretly correct. */
export function distractorsFor(item, pool, count, random = Math.random) {
  const candidates = pool.filter((other) => other.lb !== item.lb);
  return shuffle(candidates, random).slice(0, Math.min(count, candidates.length));
}

/** The four options a multiple-choice round shows: the real word plus its
 * distractors, in a random position — never last, never first, so the
 * correct answer is not learnable by button position alone. */
export function choiceOptionsFor(item, pool, random = Math.random) {
  const wrong = distractorsFor(item, pool, OPTION_COUNT - 1, random);
  return shuffle([{ value: item.lb, correct: true }, ...wrong.map((other) => ({ value: other.lb, correct: false }))], random);
}

export async function render(root, { settings, navigate }) {
  const flagged = await suppressedFor('objects', settings.playerId);
  const images = (await loadWordImages()).filter((item) => !flagged.has(item.id));

  if (images.length < ROUND_SIZE) {
    root.append(
      screenHead({ title: 'What is this?', back: '#/learn' }),
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'Not enough object photos loaded yet for a round.'),
        el(
          'p',
          { class: 'source-note' },
          'Run ',
          el('code', {}, 'npm run fetch:object-images'),
          ' to pull openly licensed photos from Wikimedia Commons for the vocabulary deck’s everyday-object words.',
        ),
      ),
    );
    return { destroy() {} };
  }

  root.append(screenHead({ title: 'What is this?', sub: 'Name the picture in Lëtzebuergesch', back: '#/learn' }));
  const body = el('div', { class: 'stack stack--lg' });
  root.append(body);
  playRound({ body, pool: images, words: roundFrom(images), settings, navigate });
  return { destroy() {} };
}

/**
 * `words` is one fixed set of pictures for the round, each shown once as a
 * multiple-choice card.
 */
function playRound({ body, pool, words, settings, navigate }) {
  let index = 0;
  let correct = 0;
  const totalCards = words.length;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  const scoreLabel = el('span', { class: 'chip' }, `0 of ${totalCards}`);
  const photo = el('img', { alt: '', loading: 'lazy', style: { width: '100%', borderRadius: 'var(--r-lg)' } });
  const credit = el('p', { class: 'source-note', style: { textAlign: 'center' } });
  const instruction = el('p', { class: 'drill__instruction' }, 'What is this?');
  const inputHolder = el('div', {});
  const flag = flagSlot();

  fill(
    body,
    el('div', { class: 'row row--between' }, el('span', { class: 'meter__label' }, 'Multiple choice'), scoreLabel),
    el('div', { class: 'card', style: { textAlign: 'center' } }, photo, credit),
    instruction,
    inputHolder,
    el('div', { class: 'card' }, amelie.el),
    flag.el,
  );

  amelie.say('What is this? Tap the Lëtzebuergesch word.', 'idle');

  showCard();

  function showCard() {
    const item = words[index];
    flag.set({ playerId: settings.playerId, source: 'objects', id: item.id, label: item.lb ?? item.id });
    photo.src = item.imageUrl;
    photo.alt = 'Guess the word';
    credit.textContent = `${item.imageCredit ?? 'Unknown'} · ${item.imageLicence ?? ''}`;

    const input = choiceInput({ options: choiceOptionsFor(item, pool) }, (result) => onAnswer(item, result));
    fill(inputHolder, input.el);
  }

  function onAnswer(item, result) {
    if (result.correct) {
      correct += 1;
      chimeCorrect();
      amelie.say(pickLine(AMELIE_LINES.correct), 'celebrating');
    } else {
      resetChimeStreak();
      amelie.say(`That was ${item.lb} — ${item.en}.`, 'encouraging');
    }
    scoreLabel.textContent = `${correct} of ${totalCards}`;

    setTimeout(
      () => {
        index += 1;
        if (index >= words.length) {
          finish();
          return;
        }
        showCard();
      },
      result.correct ? 700 : 1600,
    );
  }

  async function finish() {
    touchStreak(settings.playerId);
    const pct = Math.round((correct / totalCards) * 100);

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(pct >= 80 ? 'Well named! You know these pictures.' : 'Round done. Play again — the same pictures come round quickly.');

    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, 'This round'),
          el('p', { class: 'meter__value' }, `${correct} / ${totalCards}`),
          el('p', { class: 'card__note' }, `${pct}% · ${plural(words.length, 'picture')}`),
        ),
        button('Another round', {
          variant: 'primary',
          class: 'btn btn--primary btn--block',
          onclick: () => navigate('#/objects'),
        }),
        button('Back to Learn', {
          variant: 'secondary',
          class: 'btn btn--secondary btn--block',
          onclick: () => navigate('#/learn'),
        }),
        el(
          'p',
          { class: 'source-note' },
          'Photos from Wikimedia Commons, openly licensed and credited under each one. What Is This counts for ' +
            'your streak, but — like Pairs and Gender Sort — it does not move your review schedule: naming a word ' +
            'you can see is easier than recalling it cold.',
        ),
      ),
    );
  }
}
