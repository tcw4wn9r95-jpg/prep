/**
 * Rendering for the worked examples a grammar topic produces.
 *
 * This lived inside screens/reference.js while the cheat sheet was the only
 * place the guide was shown. The notecards screen shows the same topics in a
 * different frame, and two copies of this renderer would drift — one of them
 * would learn about a new group shape and the other would silently drop it.
 * So it moved here, and both screens import it.
 *
 * A group is whatever shape `topic.examples(data)` chose. The shapes are:
 *
 *   items      { lb, en, from? }        a word or phrase and its meaning
 *   pairs      { forms: string[], en }  the same word in two or three forms
 *   verbs      { infinitive, participle, aux, en }
 *   sentences  { lb } or { before, form, after }
 *
 * `from` only appears on the vocabulary-origins topic, where it carries LOD's
 * own German or French translation of the headword — the evidence for the
 * borrowing, rather than a claim written by hand.
 */

import { el } from './dom.js';

/** Renders whichever shape of example a topic produced. */
export function exampleGroup(group) {
  const rows = [];
  for (const item of group.items ?? []) {
    rows.push(
      el(
        'div',
        { class: 'ref-frame' },
        el('span', {}, item.lb),
        el('span', { class: 'card__note' }, item.from ? `${item.en} — ${item.from}` : item.en),
      ),
    );
  }
  for (const verb of group.verbs ?? []) {
    rows.push(
      el(
        'div',
        { class: 'ref-frame' },
        el('span', {}, `${verb.aux} … ${verb.participle}`),
        el('span', { class: 'card__note' }, `${verb.infinitive} — ${verb.en}`),
      ),
    );
  }
  for (const pair of group.pairs ?? []) {
    rows.push(
      el('div', { class: 'ref-frame' }, el('span', {}, pair.forms.join(' / ')), pair.en ? el('span', { class: 'card__note' }, pair.en) : null),
    );
  }
  for (const sentence of group.sentences ?? []) {
    rows.push(
      sentence.form
        ? el('p', { class: 'ref-topic__sentence' }, sentence.before, el('strong', {}, sentence.form), sentence.after)
        : el('p', { class: 'ref-topic__sentence' }, sentence.lb),
    );
  }
  return el('div', { style: { marginBlockStart: 'var(--s3)' } }, el('p', { class: 'meter__label' }, group.label), ...rows);
}

/**
 * A topic's examples, or an empty list if it cannot produce any.
 *
 * Every `examples` function reaches into the shipped decks, and a deck that
 * has not loaded — or a pattern that matches nothing after a content rebuild —
 * should cost the reader the illustrations, not the theory above them.
 */
export function safeExamples(topic, data) {
  try {
    return topic.examples(data) ?? [];
  } catch {
    return [];
  }
}
