/**
 * Change the word — the dative, drilled as the transformation it actually is.
 *
 * The grammar deck already asks about the dative, but only ever as a gap in a
 * finished sentence: "ëm wéi vill Auer gëtt bei ___ zu Nuecht giess?" with
 * four pronouns to choose from. That is a recognition question, and it can be
 * answered by ear without ever learning the thing underneath — which is a
 * table. `ech` becomes `mir` after mat, bei, vun or no; `mir` becomes `eis`;
 * `du` becomes `dir` and `dir` becomes `iech`. Until those pairs are known,
 * every dative card is a guess between four plausible-looking words.
 *
 * So this asks the transformation directly — `bei` + `ech` → ? — which is the
 * production skill the interview needs, and the one the drill cannot test.
 *
 * Two traps this exists to expose, and they are why the English gloss is
 * always shown next to the pronoun:
 *
 *   - `mir` and `dir` are on *both* sides of the table. `mir` is "we" going in
 *     and "to me" coming out; `dir` is "to you" coming out of `du`, and "you
 *     (plural)" going in to produce `iech`. The same spelling, two unrelated
 *     jobs, and only the sentence around it tells you which.
 *   - `si` is both "she" (→ hir) and "they" (→ hinnen), so the pronoun alone
 *     does not determine the answer.
 *
 * Every card ends on a real LOD sentence that actually uses that preposition
 * and pronoun together, pulled from the mined `dative` items in grammar.json —
 * so the table is never left as an abstraction, and no example here is
 * written. The pool is built *from* those items, which means a pair only
 * becomes a question if the corpus attests it: 20 of the 28 the table allows.
 *
 * Same optional-game shape as Pairs, Gender Sort and What is this?: it counts
 * for the streak, and it never touches the Leitner boxes. The grammar deck's
 * own dative cards are the scheduled version of this material; letting a quick
 * round move that schedule would drift it without anything looking wrong.
 */

import { el, fill, screenHead, button } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { loadGrammar } from '../content.js';
import { touchStreak, suppressedFor } from '../store.js';
import { flagSlot } from '../flag.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';

const ROUND_SIZE = 10;
const OPTION_COUNT = 4;

/**
 * The dative pronoun table.
 *
 * Hand-written here, like the closed classes in pipeline/build-grammar.js, and
 * held to the same rule: the *mapping* is a grammatical claim taken from a
 * cited source (luxembourgishwithanne.lu's dative-case page — an independent
 * source, not LOD, the same one the `dative` topic in grammar-guide.js cites),
 * while every Luxembourgish form in it is one LOD itself publishes.
 * `pipeline/test/forms.test.js` re-checks both halves: that each form is
 * attested in the shipped decks, and that the dative side matches the set
 * build-grammar.js actually mines against.
 *
 * Order matters. `him` is the dative of both `hien` and `hatt`, so a reverse
 * lookup has to pick one; `hien` comes first and is the one a card shows.
 */
export const DATIVE_TABLE = [
  { nom: 'ech', en: 'I', dat: 'mir' },
  { nom: 'du', en: 'you', dat: 'dir' },
  { nom: 'hien', en: 'he', dat: 'him' },
  { nom: 'hatt', en: 'it', dat: 'him' },
  { nom: 'si', en: 'she', dat: 'hir' },
  { nom: 'mir', en: 'we', dat: 'eis' },
  { nom: 'dir', en: 'you (plural)', dat: 'iech' },
  { nom: 'si', en: 'they', dat: 'hinnen' },
];

/** Every distinct dative form — the option pool a card draws its wrong
 * answers from, so a distractor is always a real dative pronoun rather than
 * an arbitrary word. */
export const DATIVE_FORMS = [...new Set(DATIVE_TABLE.map((row) => row.dat))];

function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The questions this game can ask, built from the mined `dative` items.
 *
 * One card per preposition+pronoun pair rather than per item — the corpus has
 * "bei eis" fifteen times, and fifteen cards with the same answer is not a
 * round. The first item for a pair supplies the sentence, and items are
 * already ordered by the build, so the pick is stable rather than arbitrary.
 */
export function formsPool(grammar) {
  const byDative = new Map();
  for (const row of DATIVE_TABLE) if (!byDative.has(row.dat)) byDative.set(row.dat, row);

  const seen = new Set();
  const pool = [];
  for (const item of grammar ?? []) {
    if (item.kind !== 'dative' || !item.preposition) continue;
    const answer = item.options_lb?.[item.correct];
    if (!answer) continue;
    const row = byDative.get(answer.toLowerCase());
    if (!row) continue;

    const key = `${item.preposition.toLowerCase()}|${row.dat}`;
    if (seen.has(key)) continue;
    seen.add(key);

    pool.push({
      id: item.id,
      preposition: item.preposition,
      nom: row.nom,
      en: row.en,
      dat: row.dat,
      // The sentence exactly as LOD wrote it, kept in three pieces so the
      // pronoun can be shown in place rather than described.
      before: item.before,
      after: item.after,
    });
  }
  return pool;
}

/** A fresh round, drawn at random so repeat play is not the same ten in the
 * same order — same shape as gender-sort.js's own `roundFrom`. */
export function roundFrom(pool, size = ROUND_SIZE, random = Math.random) {
  return shuffle(pool, random).slice(0, Math.min(size, pool.length));
}

/** The four forms a card offers: the right one plus three other real dative
 * pronouns, in a random position. */
export function optionsFor(card, random = Math.random) {
  const wrong = shuffle(DATIVE_FORMS.filter((form) => form !== card.dat), random).slice(0, OPTION_COUNT - 1);
  return shuffle([card.dat, ...wrong], random);
}

export async function render(root, { settings, navigate }) {
  const grammar = await loadGrammar();
  const flagged = await suppressedFor('forms', settings.playerId);
  const pool = formsPool(grammar).filter((item) => !flagged.has(item.id));

  if (pool.length < OPTION_COUNT) {
    root.append(
      screenHead({ title: 'Change the word', back: '#/learn' }),
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'Not enough dative sentences loaded yet for a round.'),
        el('p', { class: 'source-note' }, 'Run ', el('code', {}, 'npm run build:grammar'), ' to mine them from the corpus.'),
      ),
    );
    return { destroy() {} };
  }

  root.append(
    screenHead({
      title: 'Change the word',
      sub: 'The dative — what happens after mat, bei, vun and no',
      back: '#/learn',
    }),
  );
  const body = el('div', { class: 'stack stack--lg' });
  root.append(body);
  playRound({ body, cards: roundFrom(pool), settings, navigate });
  return { destroy() {} };
}

function playRound({ body, cards, settings, navigate }) {
  let index = 0;
  let correct = 0;
  let locked = false;

  const amelie = new Amelie({ size: 'sm', bubble: true });
  amelie.say('After mat, bei, vun and no the pronoun changes. Which form?', 'idle');

  const scoreLabel = el('span', { class: 'chip' }, `0 of ${cards.length}`);
  const prompt = el('p', { class: 'screen__title', style: { textAlign: 'center', marginBlockStart: 'var(--s3)' } });
  const gloss = el('p', { class: 'card__note', style: { textAlign: 'center' } });
  const options = el('div', { class: 'options' });
  // The real sentence, revealed only after answering — shown up front it would
  // contain the answer.
  const evidence = el('div', { style: { display: 'none' } });
  const flag = flagSlot();

  fill(
    body,
    el('div', { class: 'row row--between' }, el('span', { class: 'meter__label' }, 'Dative'), scoreLabel),
    el('div', { class: 'card' }, prompt, gloss, options),
    evidence,
    el('div', { class: 'card' }, amelie.el),
    flag.el,
  );

  showCard();

  function showCard() {
    locked = false;
    const card = cards[index];
    flag.set({ playerId: settings.playerId, source: 'forms', id: card.id, label: `${card.preposition} + ${card.nom}` });
    prompt.textContent = `${card.preposition} + ${card.nom} → ?`;
    gloss.textContent = `${card.nom} means “${card.en}” here`;
    evidence.style.display = 'none';
    fill(evidence);

    fill(
      options,
      ...optionsFor(card).map((form) =>
        el('button', { type: 'button', class: 'option', onclick: () => answer(form) }, el('span', {}, form)),
      ),
    );
  }

  function answer(form) {
    if (locked) return;
    locked = true;
    const card = cards[index];
    const right = form === card.dat;

    for (const node of options.children) {
      const value = node.textContent;
      if (value === card.dat) node.classList.add('is-correct');
      else if (value === form) node.classList.add('is-wrong');
    }

    // The whole point of the game: the abstract pair, then LOD's own sentence
    // using it, with the pronoun in place.
    evidence.style.display = '';
    fill(
      evidence,
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'meter__label' }, `${card.preposition} + ${card.nom} → ${card.dat}`),
        el('p', { style: { marginBlockStart: 'var(--s2)' } }, card.before, el('strong', {}, card.dat), card.after),
        el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s2)' } }, 'A real sentence from LOD.'),
      ),
    );

    if (right) {
      correct += 1;
      chimeCorrect();
      amelie.say(pickLine(AMELIE_LINES.correct), 'celebrating');
    } else {
      resetChimeStreak();
      amelie.say(hintFor(card), 'encouraging');
    }
    scoreLabel.textContent = `${correct} of ${cards.length}`;

    setTimeout(
      () => {
        index += 1;
        if (index >= cards.length) finish();
        else showCard();
      },
      right ? 1400 : 2600,
    );
  }

  async function finish() {
    touchStreak(settings.playerId);
    const pct = Math.round((correct / cards.length) * 100);

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(pct >= 80 ? 'You have the table. That is the hard part done.' : 'Round done — these eight pairs are the whole dative. Play again.');

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
          el('p', { class: 'meter__value' }, `${correct} / ${cards.length}`),
          el('p', { class: 'card__note' }, `${pct}%`),
        ),
        // The whole table, once, at the end — the thing to actually take away.
        tableCard(),
        button('Another round', {
          variant: 'primary',
          class: 'btn btn--primary btn--block',
          onclick: () => navigate('#/forms'),
        }),
        button('Back to Learn', {
          variant: 'secondary',
          class: 'btn btn--secondary btn--block',
          onclick: () => navigate('#/learn'),
        }),
        el(
          'p',
          { class: 'source-note' },
          'Every sentence here is LOD’s own. Change the word counts for your streak, but — like Pairs and Gender Sort — it does not move your review schedule: the grammar deck’s dative cards are the scheduled version of this.',
        ),
      ),
    );
  }
}

/** Said when a card is missed. Names the actual confusion where there is a
 * specific one, rather than only restating the answer. */
function hintFor(card) {
  if (card.dat === 'mir' || card.dat === 'eis') {
    return `${card.preposition} ${card.dat}. Careful: mir is “we” going in and “to me” coming out.`;
  }
  if (card.dat === 'dir' || card.dat === 'iech') {
    return `${card.preposition} ${card.dat}. Careful: dir is “to you” from du, and “you all” going in gives iech.`;
  }
  if (card.dat === 'hir' || card.dat === 'hinnen') {
    return `${card.preposition} ${card.dat}. si is both “she” and “they” — hir for one, hinnen for the group.`;
  }
  return `${card.preposition} ${card.dat} — from ${card.nom}, “${card.en}”.`;
}

/** The eight-row table, rendered from the same constant the game asks from,
 * so the summary and the questions cannot disagree. */
function tableCard() {
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'card__title' }, 'The whole table'),
    el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s2)' } }, 'After mat, bei, vun and no:'),
    ...DATIVE_TABLE.map((row) =>
      el(
        'div',
        { class: 'ref-frame' },
        el('span', {}, `${row.nom} → ${row.dat}`),
        el('span', { class: 'card__note' }, row.en),
      ),
    ),
  );
}
