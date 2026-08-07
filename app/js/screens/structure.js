/**
 * Sentence structure — the theory first, then the practice, in three steps.
 *
 * This is the one part of the grammar an English speaker cannot pick up by
 * absorbing vocabulary, because English and Luxembourgish disagree about what
 * a sentence is *for*: English fixes the order subject-verb-object, and
 * Luxembourgish fixes the verb's position and lets everything else move around
 * it. Someone who has never been told that will produce English word order in
 * Luxembourgish words for as long as they study, and Morphosyntax is a scored
 * criterion in the Sproochentest interview.
 *
 * So this screen leads with the rule rather than with a card. Three topics, in
 * the order they build on each other:
 *
 *   1. the conjugated verb is the second element
 *   2. the other half of the verb closes the sentence  (the bracket)
 *   3. after datt / ob, the verb goes to the end       (subordinate clauses)
 *
 * Each one assumes the one before it, which is why they are numbered and why
 * the practice buttons sit under the theory rather than above it.
 *
 * Nothing Luxembourgish on this screen is written here. The rules are English
 * prose from grammar-guide.js; every example sentence is pulled out of the
 * grammar deck, which pipeline/build-grammar.js mined from LOD.
 */

import { el, screenHead, button, plural } from '../dom.js';
import { loadGrammar } from '../content.js';
import { getLearnDeckState, STRANDS } from '../store.js';
import { STRUCTURE_KINDS } from '../drill/cards.js';
import { topicFor } from '../grammar-guide.js';

export async function render(root, { settings, navigate }) {
  const [grammar, met] = await Promise.all([loadGrammar(), getLearnDeckState(settings.playerId, 'grammar', STRANDS.recv)]);

  const steps = STRUCTURE_KINDS.map((kind, index) => {
    const items = grammar.filter((item) => item.kind === kind);
    return {
      kind,
      n: index + 1,
      topic: topicFor(kind),
      total: items.length,
      started: items.filter((item) => met.has(item.id)).length,
      // The shortest few, which after content.js's ordering are also the
      // easiest — worked examples, not decoration.
      examples: items.slice(0, 3).map((item) => item.options_lb?.[item.correct]).filter(Boolean),
    };
  });

  const totalStarted = steps.reduce((sum, step) => sum + step.started, 0);

  root.append(
    screenHead({ title: 'Sentence structure', sub: 'Where the verb goes — the rule, then the practice', back: '#/learn' }),

    el(
      'div',
      { class: 'card' },
      el('p', { class: 'card__title' }, 'Why this one matters most'),
      el(
        'p',
        { class: 'card__note' },
        'The interview is marked on Morphosyntax as well as on vocabulary, and word order is what an English speaker gets wrong there — not because the words are missing, but because English puts them in a different place. These cards are in every daily session for that reason.',
      ),
      totalStarted === 0
        ? null
        : el('p', { class: 'card__note' }, `${plural(totalStarted, 'sentence')} practised so far.`),
    ),

    ...steps.map(stepCard),

    button('Practise all three', {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      style: { marginBlockStart: 'var(--s5)' },
      onclick: () => navigate('#/grammar/structure'),
    }),
    el(
      'p',
      { class: 'card__note', style: { marginBlockStart: 'var(--s2)', textAlign: 'center' } },
      'Ten cards, easiest first. They also come round on their own in every daily session.',
    ),
    el(
      'p',
      { class: 'source-note', style: { marginBlockStart: 'var(--s5)' } },
      'Rules from Grammaire de la langue luxembourgeoise (Zenter fir d’Lëtzebuerger Sprooch, ISBN 978-99959-1-206-2). Every example sentence is one LOD publishes.',
    ),
  );

  return { destroy() {} };
}

/** One step of the ladder: the rule, the teaching, real sentences, a way in. */
function stepCard(step) {
  const { topic } = step;
  if (!topic) return null;
  const pct = step.total === 0 ? 0 : Math.round((step.started / step.total) * 100);

  return el(
    'div',
    { class: 'card', style: { marginBlockStart: 'var(--s4)' } },
    el(
      'div',
      { class: 'row' },
      el('span', { class: 'stage__n', 'aria-hidden': 'true' }, String(step.n)),
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'card__title' }, topic.title.replace(/^Sentence structure \d+ — /, '')),
        el('p', { class: 'ref-topic__rule' }, topic.rule),
      ),
    ),

    ...topic.points.map((point) => el('p', { class: 'ref-topic__point' }, point)),

    step.examples.length
      ? el(
          'div',
          { style: { marginBlockStart: 'var(--s3)' } },
          el('p', { class: 'meter__label' }, 'The order LOD wrote'),
          ...step.examples.map((sentence) => el('p', { class: 'ref-topic__sentence' }, sentence)),
        )
      : null,

    el(
      'div',
      { class: 'meter__track', style: { marginBlockStart: 'var(--s3)' } },
      el('div', { class: `meter__fill${pct >= 100 ? ' is-pass' : ''}`, style: { width: `${pct === 0 ? 0 : Math.max(pct, 2)}%` } }),
    ),
    el(
      'p',
      { class: 'card__note' },
      step.started === 0 ? `${plural(step.total, 'sentence')} to practise` : `${step.started} of ${step.total} seen`,
    ),

    el(
      'a',
      { class: 'btn btn--block', href: `#/grammar/${step.kind}`, style: { marginBlockStart: 'var(--s3)' } },
      step.started === 0 ? 'Practise this one' : 'Practise this one again',
    ),
  );
}
