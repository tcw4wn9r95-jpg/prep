/**
 * Gender Sort — a quick round, not a level to unlock.
 *
 * Same optional-game shape as Pairs: it counts for the streak, but it does not
 * touch the Leitner boxes — sorting a word you can already see is a much
 * lighter task than the grammar deck's own recall cards, and letting an easy
 * win move the same schedule those cards feed would drift it without anything
 * looking wrong. Unlike Pairs it keeps no level to resume: ten words, drawn
 * fresh from the same pool every time, is the whole shape of the game.
 *
 * Every word and its gender comes straight from vocab.json — LOD's own
 * assignment, never guessed here. See pipeline/build-grammar.js for the fuller
 * version of this same rule.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { GENDER_LABELS, joinArticle } from '../drill/cards.js';
import { loadVocab } from '../content.js';
import { touchStreak, suppressedFor } from '../store.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { flagSlot } from '../flag.js';

const ROUND_SIZE = 10;
// The most frequent nouns only — sorting `Wunngemeinschaft`'s gender on sight
// is a different, much harder game, and this one is meant to be quick.
const POOL_CAP = 200;
const GENDERS = ['M', 'F', 'N'];

/** Every clean, unambiguous noun, most frequent first — same ordering rule
 * pairs.js uses, so "common word" means the same thing across both games. */
export function genderPool(vocab) {
  return vocab
    .filter((item) => item.pos === 'SUBST' && GENDERS.includes(item.gender) && item.article && item.lb)
    .sort((a, b) => (a.stage ?? 9) - (b.stage ?? 9) || (a.rank ?? 0) - (b.rank ?? 0))
    .slice(0, POOL_CAP);
}

/** A fresh round: ROUND_SIZE words, drawn at random from the common pool so
 * repeat play does not just replay the same ten in the same order. */
export function roundFrom(pool, random = Math.random) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(ROUND_SIZE, copy.length));
}

export async function render(root, { settings, navigate }) {
  const vocab = await loadVocab();
  // Words called out as not making sense, or as coming round too often, are
  // left out of the draw — see `flagCard` in store.js.
  const flagged = await suppressedFor('gender-sort', settings.playerId);
  const pool = genderPool(vocab).filter((word) => !flagged.has(word.id));

  if (pool.length < ROUND_SIZE) {
    root.append(
      screenHead({ title: 'Gender Sort', back: '#/learn' }),
      el('div', { class: 'empty' }, el('p', {}, 'Not enough gendered nouns loaded yet for a round.')),
    );
    return { destroy() {} };
  }

  root.append(screenHead({ title: 'Gender Sort', sub: 'Männlech, weiblech oder neutral?', back: '#/learn' }));
  const body = el('div', { class: 'stack stack--lg' });
  root.append(body);
  playRound({ body, words: roundFrom(pool), settings, navigate });
  return { destroy() {} };
}

function playRound({ body, words, settings, navigate }) {
  let index = 0;
  let correct = 0;
  let locked = false;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say('Tap the gender this word actually is.', 'idle');

  const scoreLabel = el('span', { class: 'chip' }, `0 of ${words.length}`);
  const wordEl = el('p', { class: 'screen__title', style: { textAlign: 'center', marginBlockStart: 'var(--s4)' } });
  const buttons = el('div', { class: 'options' });

  const flag = flagSlot();

  fill(
    body,
    el('div', { class: 'row row--between' }, el('span', { class: 'meter__label' }, 'Gender Sort'), scoreLabel),
    el('div', { class: 'card' }, wordEl, buttons),
    el('div', { class: 'card' }, amelie.el),
    flag.el,
  );

  showWord();

  function showWord() {
    locked = false;
    const word = words[index];
    wordEl.textContent = word.lb;
    flag.set({ playerId: settings.playerId, source: 'gender-sort', id: word.id, label: word.lb });
    fill(
      buttons,
      ...GENDERS.map((code) =>
        el(
          'button',
          { type: 'button', class: 'option', onclick: () => answer(code) },
          el('span', {}, GENDER_LABELS[code]),
        ),
      ),
    );
  }

  function answer(code) {
    if (locked) return;
    locked = true;
    const word = words[index];
    const right = code === word.gender;
    const chosenButton = [...buttons.children].find((node) => node.textContent === GENDER_LABELS[code]);
    const correctButton = [...buttons.children].find((node) => node.textContent === GENDER_LABELS[word.gender]);
    correctButton?.classList.add('is-correct');
    if (!right) chosenButton?.classList.add('is-wrong');

    if (right) {
      correct += 1;
      chimeCorrect();
      amelie.say(pickLine(AMELIE_LINES.correct), 'celebrating');
    } else {
      resetChimeStreak();
      amelie.say(`${joinArticle(word.article, word.lb)} — ${GENDER_LABELS[word.gender]}.`, 'encouraging');
    }
    scoreLabel.textContent = `${correct} of ${words.length}`;

    setTimeout(
      () => {
        index += 1;
        if (index >= words.length) finish();
        else showWord();
      },
      right ? 700 : 1400,
    );
  }

  async function finish() {
    touchStreak(settings.playerId);
    const pct = Math.round((correct / words.length) * 100);

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(pct >= 80 ? AMELIE_LINES.pairsSetDone : "Round done. Play again — the same words come round quickly.");

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
          el('p', { class: 'meter__value' }, `${correct} / ${words.length}`),
          el('p', { class: 'card__note' }, `${pct}%`),
        ),
        button('Another round', {
          variant: 'primary',
          class: 'btn btn--primary btn--block',
          onclick: () => navigate('#/gender-sort'),
        }),
        button('Back to Learn', {
          variant: 'secondary',
          class: 'btn btn--secondary btn--block',
          onclick: () => navigate('#/learn'),
        }),
        el(
          'p',
          { class: 'source-note' },
          'Every gender here is LOD\'s own. Gender Sort counts for your streak, but — like Pairs — it does not move your review schedule: seeing a word and sorting it is easier than recalling it cold.',
        ),
      ),
    );
  }
}
