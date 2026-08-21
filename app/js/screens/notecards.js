/**
 * Notecards — the grammar as a course you can work through, one card at a time.
 *
 * The theory already existed, in grammar-guide.js, but it was only reachable
 * two ways: folded into the cheat sheet as one collapsed row among many, and
 * flashed up by the drill engine at the moment a grammar card was missed.
 * Neither of those is *studying*. Both assume you already know which rule you
 * are short of, and the cheat sheet in particular is built to be scanned mid-
 * exercise rather than read start to finish — its whole layout works against
 * sitting down and learning something new.
 *
 * So this screen is the third shape: the same 24 topics, numbered, in the
 * order they build on each other, with a card per level that states the rule,
 * teaches it, and shows real sentences. The numbering follows RTL Today's
 * *Language Basics* series (see grammar-guide.js) so the course has an
 * external spine rather than one invented here, and so someone reading the
 * articles alongside the app can line the two up.
 *
 *   #/notecards        the contents page, grouped into units
 *   #/notecards/<id>   one card, with the previous and next one a tap away
 *
 * Nothing Luxembourgish is written on this screen. Every rule and every
 * paragraph is English prose from grammar-guide.js; every example is pulled
 * out of the shipped decks by that topic's own `examples()` function.
 */

import { el, screenHead, button, emphasise } from '../dom.js';
import { loadVocab, loadVerbs, loadPhrases, loadGrammar } from '../content.js';
import { GRAMMAR_GUIDE, UNITS } from '../grammar-guide.js';
import { exampleGroup, safeExamples } from '../grammar-examples.js';

export async function render(root, { params, navigate }) {
  const [vocab, verbs, phrases, grammar] = await Promise.all([loadVocab(), loadVerbs(), loadPhrases(), loadGrammar()]);
  const data = { vocab, verbs, phrases, grammar };

  const id = params?.[0];
  const topic = id ? GRAMMAR_GUIDE.find((entry) => entry.id === id) : null;

  // An unknown id lands on the contents page rather than on an error. A stale
  // bookmark from before a topic was renamed should still get you somewhere
  // useful.
  if (id && !topic) {
    navigate('#/notecards');
    return { destroy() {} };
  }

  if (topic) renderCard(root, topic, data, navigate);
  else renderContents(root);

  return { destroy() {} };
}

/** The contents page: every level, grouped into its unit. */
function renderContents(root) {
  const total = GRAMMAR_GUIDE.length;

  root.append(
    screenHead({ title: 'Notecards', sub: `The grammar in ${total} levels — the rule, then real examples`, back: '#/learn' }),

    el(
      'div',
      { class: 'card' },
      el('p', { class: 'card__title' }, 'How to use these'),
      el(
        'p',
        { class: 'card__note' },
        'One card per topic, in the order they build on each other. Read the rule at the top, then the teaching, then the sentences — the sentences are the part that makes it stick, so do not skip them. Where a card has a drill behind it, the button at the bottom goes straight there.',
      ),
      el(
        'p',
        { class: 'card__note' },
        'Levels 1 to 19 follow RTL Today’s Language Basics series. The last few are this app’s own: word order and negation, which that series never covers and which the interview is marked on.',
      ),
    ),

    ...UNITS.flatMap((unit) => {
      const topics = GRAMMAR_GUIDE.filter((entry) => entry.unit === unit);
      if (topics.length === 0) return [];
      return [
        el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s5)', marginBlockEnd: 'var(--s2)' } }, unit),
        ...topics.map(contentsRow),
      ];
    }),

    el(
      'p',
      { class: 'source-note', style: { marginBlockStart: 'var(--s5)' } },
      'Syllabus after RTL Today, Learn Luxembourgish: Language Basics 1–19. Every Luxembourgish word and sentence shown is one LOD publishes.',
    ),
  );
}

/** One row of the contents page. */
function contentsRow(topic) {
  return el(
    'a',
    { class: 'card', href: `#/notecards/${topic.id}`, style: { display: 'block', marginBlockEnd: 'var(--s2)' } },
    el(
      'div',
      { class: 'row', style: { gap: 'var(--s3)', alignItems: 'baseline' } },
      el('span', { class: 'card__note', style: { minWidth: '1.6em', textAlign: 'right' } }, String(topic.level)),
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'card__title' }, topic.title),
        el('p', { class: 'card__note' }, topic.rule),
      ),
    ),
  );
}

/** One notecard: the rule, the teaching, the examples, and where to go next. */
function renderCard(root, topic, data, navigate) {
  const index = GRAMMAR_GUIDE.indexOf(topic);
  const previous = GRAMMAR_GUIDE[index - 1] ?? null;
  const next = GRAMMAR_GUIDE[index + 1] ?? null;
  const groups = safeExamples(topic, data);

  root.append(
    screenHead({
      title: topic.title,
      sub: `Level ${topic.level} of ${GRAMMAR_GUIDE.length} · ${topic.unit}`,
      back: '#/notecards',
    }),

    // The rule alone, in its own card. This is the one sentence worth carrying
    // out of the screen, and burying it as the first line of the teaching is
    // how it stops being noticed.
    el('div', { class: 'card' }, el('p', { class: 'ref-topic__rule', style: { margin: '0' } }, topic.rule)),

    el('div', { class: 'card' }, ...topic.points.map((point) => el('p', { class: 'ref-topic__point' }, ...emphasise(point)))),

    groups.length
      ? el(
          'div',
          { class: 'card' },
          el('p', { class: 'card__title', style: { marginBlockEnd: 'var(--s2)' } }, 'In real sentences'),
          ...groups.map(exampleGroup),
        )
      : null,

    topic.drill
      ? button('Practise this', {
          variant: 'primary',
          class: 'btn btn--primary btn--block',
          style: { marginBlockStart: 'var(--s5)' },
          onclick: () => navigate(topic.drill),
        })
      : null,

    el(
      'div',
      { class: 'row', style: { gap: 'var(--s3)', marginBlockStart: 'var(--s4)' } },
      previous
        ? el('a', { class: 'card', href: `#/notecards/${previous.id}`, style: { display: 'block', flex: 1 } },
            el('p', { class: 'card__note' }, `← ${previous.level}. ${previous.title}`))
        : el('span', { class: 'spacer' }),
      next
        ? el('a', { class: 'card', href: `#/notecards/${next.id}`, style: { display: 'block', flex: 1, textAlign: 'right' } },
            el('p', { class: 'card__note' }, `${next.level}. ${next.title} →`))
        : null,
    ),

    topic.sources?.length
      ? el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s5)' } }, `Sources — ${topic.sources.join('; ')}.`)
      : null,
  );
}
