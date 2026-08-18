/**
 * The verb games' rounds.
 *
 * Split out of `screens/arcade.js` because the mechanics genuinely differ —
 * two of the five are sorts with their own combo counter, one is a production
 * card — and folding them into the sentence-function round would have meant a
 * `show()` with eight branches. The two files share the index, the streak
 * rule, and the A1 filter.
 *
 * Nothing here is authored. Every form comes from `app/data/verbs.json`, built
 * from LOD's published Flexiounstabellen; see `arcade/verbs.js` for what each
 * game teaches and why the ambiguous forms are excluded.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { touchStreak } from '../store.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { choiceInput, bankInput } from '../drill/inputs.js';
import { letterBank } from '../drill/match.js';
import { PERSONS, verbPool, unambiguousForms, participleOf } from '../arcade/verbs.js';
import { renderBrief, hasSeenBrief, briefButton } from '../arcade/brief.js';

const ROUND_SIZE = 8;
const SORT_ROUND_SIZE = 10;
const OPTION_COUNT = 4;

function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * A pronoun with its English, because `si` on its own is unanswerable.
 *
 * `si` is both "she" and "they" and `mir` is both "we" and "to me". The dative
 * game learned this the hard way and shows the gloss for exactly this reason;
 * the verb games shipped without it and had the same defect.
 */
const label = (person) => `${person.pronoun} · ${person.en}`;

/**
 * A round's worth of cards for one verb game.
 *
 * Exported for the tests, which check the properties that cannot be seen from
 * the screen: that no card is ambiguous, that the sort is balanced, and that
 * nothing above A1 leaks through when the filter is on.
 */
export function verbQuestions(game, verbs, random = Math.random, { a1Only = true } = {}) {
  const pool = verbPool(verbs, { a1Only });
  if (!game || pool.length === 0) return [];

  if (game.kind === 'meaning') return meaningCards(pool, random);
  if (game.kind === 'person') return personCards(pool, random);
  if (game.kind === 'form') return formCards(pool, random);
  if (game.kind === 'aux') return auxCards(pool, random);
  if (game.kind === 'number') return numberCards(pool, random);
  return [];
}

/* ------------------------------------------------------------- 1. meaning */

/**
 * Both directions, alternating. Luxembourgish→English is the easier
 * recognition; English→Luxembourgish is closer to what speaking asks for, and
 * having both in one round stops the game becoming a rhythm you can tap
 * through without reading.
 */
function meaningCards(pool, random) {
  const glossed = pool.filter((verb) => verb.en);
  const cards = [];
  for (const verb of shuffle(glossed, random).slice(0, ROUND_SIZE)) {
    const others = shuffle(glossed.filter((other) => other.en !== verb.en), random).slice(0, OPTION_COUNT - 1);
    if (others.length < OPTION_COUNT - 1) continue;
    const toEnglish = cards.length % 2 === 0;

    cards.push({
      kind: 'meaning',
      instruction: toEnglish
        ? 'What does this verb mean? Tap the English.'
        : 'Which verb means this? Tap the Luxembourgish.',
      prompt: toEnglish ? verb.infinitive : verb.en,
      answer: toEnglish ? verb.en : verb.infinitive,
      // Shown after answering, and only when it is readable — the same rule
      // the sentence-function cards use for their illustrations.
      example: verb.example?.a1 ? verb.example.lb : null,
      options: shuffle(
        [
          { value: toEnglish ? verb.en : verb.infinitive, correct: true },
          ...others.map((other) => ({ value: toEnglish ? other.en : other.infinitive, correct: false })),
        ],
        random,
      ),
    });
  }
  return cards;
}

/* -------------------------------------------------------------- 2. person */

/**
 * The form is given, the person is the answer.
 *
 * Only forms that identify exactly one person are asked, because Luxembourgish
 * paradigms are full of syncretism and a card with three right answers teaches
 * the learner they were wrong when they were not.
 */
function personCards(pool, random) {
  const candidates = [];
  for (const verb of pool) {
    for (const option of unambiguousForms(verb, 'person')) candidates.push({ verb, ...option });
  }

  return shuffle(candidates, random)
    .slice(0, ROUND_SIZE)
    .map(({ verb, form, person }) => {
      const others = shuffle(PERSONS.filter((other) => other.key !== person.key), random).slice(0, OPTION_COUNT - 1);
      return {
        kind: 'person',
        instruction: 'Who is doing it? Tap the pronoun that goes with this form.',
        prompt: form,
        // The infinitive is on the card on purpose: this is a question about a
        // paradigm, not a guess about a word in isolation.
        hint: `from ${verb.infinitive}${verb.en ? ` · ${verb.en}` : ''}`,
        answer: person.pronoun,
        options: shuffle(
          [
            { value: person.pronoun, correct: true, label: label(person) },
            ...others.map((other) => ({ value: other.pronoun, correct: false, label: label(other) })),
          ],
          random,
        ),
      };
    });
}

/* ---------------------------------------------------------------- 3. form */

/** Produce the form from letter tiles rather than choosing it. */
function formCards(pool, random) {
  const cards = [];
  for (const verb of shuffle(pool, random)) {
    if (cards.length >= ROUND_SIZE) break;

    // Ask about a person whose form is actually worth building, rather than
    // drawing one at random and dropping the verb when the draw is unusable.
    // Two thirds of the paradigm is skippable: for 95 of the 111 A1 verbs the
    // mir/si forms are the infinitive, which is already printed on the card,
    // and separable verbs conjugate into two words — `doheembleiwen` becomes
    // `bleift doheem` — which a letter bank cannot express because it has
    // nowhere to put the space. Where the split goes is a word-order lesson
    // and the sentence-function games are where it belongs.
    const usable = shuffle(PERSONS, random).filter((person) => {
      const form = verb.present?.[person.key];
      return form && form !== verb.infinitive && !/\s/.test(form) && form.length > 1;
    });
    if (usable.length === 0) continue;

    const person = usable[0];
    cards.push({
      kind: 'form',
      // The same "X + Y → ?" shape the dative game uses, rather than two
      // words joined by a dot that never explained what it meant.
      instruction: `Build the ${person.pronoun} form of ${verb.infinitive}.`,
      prompt: `${verb.infinitive} + ${person.pronoun} → ?`,
      hint: verb.en ? `${verb.infinitive} means “${verb.en}”` : '',
      answer: verb.present[person.key],
    });
  }
  return cards;
}

/* ----------------------------------------------------------------- 4. aux */

/**
 * hunn or sinn, as a two-way sort.
 *
 * Drawn half from each side. The honest distribution is 95 hunn to 15 sinn at
 * A1, so an unbalanced round would let a player who always taps hunn finish on
 * 86% — a score that says nothing and teaches less.
 */
function auxCards(pool, random) {
  const usable = pool.filter((verb) => participleOf(verb) && verb.auxiliaryVerb);
  const sinn = shuffle(usable.filter((verb) => verb.auxiliaryVerb === 'sinn'), random);
  const hunn = shuffle(usable.filter((verb) => verb.auxiliaryVerb === 'hunn'), random);

  const half = Math.floor(SORT_ROUND_SIZE / 2);
  const chosen = shuffle([...sinn.slice(0, half), ...hunn.slice(0, SORT_ROUND_SIZE - half)], random);

  return chosen.map((verb) => ({
    kind: 'aux',
    instruction: 'Tap the helper verb that makes this one’s past.',
    prompt: participleOf(verb),
    hint: `${verb.infinitive}${verb.en ? ` · ${verb.en}` : ''}`,
    answer: verb.auxiliaryVerb,
    options: [
      { value: 'hunn', correct: verb.auxiliaryVerb === 'hunn' },
      { value: 'sinn', correct: verb.auxiliaryVerb === 'sinn' },
    ],
  }));
}

/* -------------------------------------------------------------- 5. number */

/** Singular or plural, from the form alone. Balanced the same way. */
function numberCards(pool, random) {
  const candidates = [];
  for (const verb of pool) {
    for (const option of unambiguousForms(verb, 'number')) candidates.push({ verb, ...option });
  }
  const sing = shuffle(candidates.filter((row) => row.number === 'sing'), random);
  const plur = shuffle(candidates.filter((row) => row.number === 'plur'), random);
  const half = Math.floor(SORT_ROUND_SIZE / 2);

  return shuffle([...sing.slice(0, half), ...plur.slice(0, SORT_ROUND_SIZE - half)], random).map(
    ({ verb, form, number, persons }) => ({
      kind: 'number',
      instruction: 'Is one person doing this, or more than one? Tap your answer.',
      prompt: form,
      hint: `from ${verb.infinitive}`,
      answer: number,
      // Named after the answer, so the feedback can say *which* persons.
      persons: persons.map((person) => person.pronoun).join(', '),
      options: [
        { value: 'sing', correct: number === 'sing' },
        { value: 'plur', correct: number === 'plur' },
      ],
    }),
  );
}

/* --------------------------------------------------------------- the round */

// Spelled out, so the button answers the question as it was asked. "One" on
// its own read as a quantity of something rather than a number of people.
const SORT_LABELS = {
  hunn: 'hunn',
  sinn: 'sinn',
  sing: 'One person',
  plur: 'More than one',
};

export function renderVerbRound(root, game, verbs, { settings, navigate, a1Only }) {
  const questions = verbQuestions(game, verbs, Math.random, { a1Only });

  root.append(screenHead({ title: game.title, sub: game.ask, back: '#/arcade' }));
  const body = el('div', { class: 'stack stack--lg' });
  root.append(body);

  if (questions.length > 0) {
    // The explanation comes first, not after the answer buttons. Once you have
    // seen it the game opens straight into the round, and "How it works" on
    // the round brings it back.
    const openBrief = () => {
      fill(body);
      renderBrief(body, game, { verbs, onStart: start, startLabel: hasSeenBrief(game.id) ? 'Back to the round' : 'Start' });
      body.scrollIntoView?.({ block: 'start' });
    };
    const start = () => {
      fill(body);
      playVerbRound({ body, game, questions, settings, navigate, onBrief: openBrief });
    };

    if (hasSeenBrief(game.id)) start();
    else openBrief();
    return { destroy() {} };
  }

  if (questions.length === 0) {
    fill(
      body,
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'Nothing to play here yet.'),
        el('p', { class: 'source-note' }, 'Run npm run content to build the verb tables this game draws on.'),
        button('Back to Arcade', { variant: 'secondary', onclick: () => navigate('#/arcade') }),
      ),
    );
    return { destroy() {} };
  }

  return { destroy() {} };
}

function playVerbRound({ body, game, questions, settings, navigate, onBrief }) {
  let index = 0;
  let correct = 0;
  let streak = 0;
  let best = 0;
  let locked = false;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say(game.rule, 'idle');

  const scoreLabel = el('span', { class: 'chip' }, `0 of ${questions.length}`);
  // The combo is the one piece of pure game here, and it earns its place on
  // the sorts: a run of ten fast taps is the whole feel of those two games,
  // and a number that climbs is what makes the run legible.
  const comboLabel = el('span', { class: 'chip', hidden: true });
  const instruction = el('p', { class: 'drill__instruction' });
  const promptCard = el('div', { class: 'card' });
  const inputHolder = el('div', {});

  fill(
    body,
    // The game's name is already in the screen heading — repeating it here and
    // again as the instruction was three copies of the same words on one
    // screen. This row carries the way back to the explanation instead.
    el(
      'div',
      { class: 'row row--between' },
      briefButton(onBrief),
      el('span', { class: 'row' }, comboLabel, scoreLabel),
    ),
    // The instruction goes *above* the card it applies to, so it is read
    // before the thing it is describing rather than after it.
    instruction,
    promptCard,
    inputHolder,
    el('div', { class: 'card' }, amelie.el),
  );

  show();

  function show() {
    locked = false;
    const question = questions[index];
    instruction.textContent = question.instruction;

    fill(
      promptCard,
      el('p', { class: 'screen__title', style: { textAlign: 'center' } }, question.prompt),
      question.hint
        ? el('p', { class: 'card__note', style: { textAlign: 'center', marginBlockStart: 'var(--s2)' } }, question.hint)
        : null,
    );

    if (question.kind === 'form') {
      const input = bankInput(
        { bank: letterBank(question.answer), bankKind: 'letter', answer: question.answer },
        (result) => answered(question, result),
      );
      fill(inputHolder, input.el);
      return;
    }

    if (question.kind === 'aux' || question.kind === 'number') {
      // Two big targets rather than a list — these are meant to be answered by
      // reflex, and the combo only reads as a run if the taps are quick.
      fill(
        inputHolder,
        el(
          'div',
          { class: 'options' },
          ...question.options.map((option) =>
            el(
              'button',
              { type: 'button', class: 'option', onclick: () => answered(question, { correct: option.correct, given: option.value }) },
              el('span', {}, SORT_LABELS[option.value] ?? option.value),
            ),
          ),
        ),
      );
      return;
    }

    const input = choiceInput({ options: question.options }, (result) => answered(question, result));
    fill(inputHolder, input.el);
  }

  function answered(question, result) {
    if (locked) return;
    locked = true;

    if (result.correct) {
      correct += 1;
      streak += 1;
      best = Math.max(best, streak);
      chimeCorrect();
      amelie.say(question.example ?? pickLine(AMELIE_LINES.correct), 'celebrating');
    } else {
      streak = 0;
      resetChimeStreak();
      amelie.say(wrongLine(question), 'encouraging');
    }

    scoreLabel.textContent = `${correct} of ${questions.length}`;
    comboLabel.hidden = streak < 2;
    comboLabel.textContent = `${streak} in a row`;

    setTimeout(
      () => {
        index += 1;
        if (index >= questions.length) finish();
        else show();
      },
      result.correct ? 800 : 1800,
    );
  }

  /** What the card should have taught, said back. */
  function wrongLine(question) {
    if (question.kind === 'number') return `“${question.prompt}” goes with ${question.persons}.`;
    if (question.kind === 'aux') return `${question.hint.split(' · ')[0]} takes ${question.answer}.`;
    if (question.kind === 'person') return `${question.answer} ${question.prompt}.`;
    return `It is “${question.answer}”.`;
  }

  async function finish() {
    // Same promise as the rest of the Arcade: the streak, and nothing else.
    touchStreak(settings.playerId);
    const pct = Math.round((correct / questions.length) * 100);

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(pct >= 80 ? 'That is the table, not a guess.' : 'Round done — play it again, it costs nothing.');

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
          el('p', { class: 'meter__value' }, `${correct} / ${questions.length}`),
          el('p', { class: 'card__note' }, `${pct}% · ${plural(questions.length, 'card')}${best >= 3 ? ` · best run ${best}` : ''}`),
        ),
        el('div', { class: 'card' }, el('p', { class: 'card__note' }, game.teaches)),
        button('Again', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(`#/arcade/${game.id}`) }),
        button('Another game', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/arcade') }),
        el(
          'p',
          { class: 'source-note' },
          'Every form here is one LOD publishes in its own inflection tables. Arcade rounds count for your streak and nothing else.',
        ),
      ),
    );
  }
}
