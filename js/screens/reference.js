/**
 * Reference — the cheat sheet.
 *
 * Everything Learn drills one word or one card at a time. This is the opposite
 * shape on purpose: subject pronouns, the handful of verbs that carry most
 * sentences, and the sentence frames already drilled in the Phrases deck, all
 * on one screen a learner can hold in view while they answer something else.
 *
 * Every Luxembourgish word here is pulled from the same generated JSON the
 * drills use — nothing is authored in this file. The pronoun table is picked
 * out of vocab.json by part of speech, the verb tables are the `present`
 * conjugation LOD's Flexiounstabellen already produced for the Verbs deck, and
 * the sentence patterns are the 34 corpus-attested frames from Phrases,
 * grouped by the same eight use-cases build-phrases.js already sorts them
 * into. That is also why there is no ninth, made-up pattern here: only the
 * groups that already exist as drilled content are shown.
 *
 * `renderContent()` is exported separately from `render()` so the exact same
 * markup can be reused in the drill engine's in-session sheet (engine.js) —
 * the whole point of a cheat sheet is being reachable mid-exercise, not just
 * as its own screen. That includes a *grammar* drill session: someone stuck
 * on a gender or n-rule card can open this over that exact card and read the
 * rule it is testing, without losing their place in the session.
 *
 * The grammar section holds to the same rule as everything else here, just
 * pointed at grammar.json instead of vocab/verbs/phrases: the rule statements
 * are English commentary (free text, like every other note in this file),
 * and every Luxembourgish example is one of pipeline/build-grammar.js's own
 * items — never a new one written for this screen.
 */

import { el, screenHead } from '../dom.js';
import { loadVocab, loadVerbs, loadPhrases, loadPhraseGroups, loadGrammar } from '../content.js';
import { GENDER_LABELS } from '../drill/cards.js';

const PRONOUNS = ['ech', 'du', 'hien', 'si', 'hatt', 'mir', 'dir'];

/** The verbs that carry most sentences — the same set Learn's "Everyday
 * verbs" stage leads with, plus the four modals every A2 answer leans on. */
const CORE_VERBS = ['sinn', 'hunn', 'ginn', 'kënnen', 'wëllen', 'mussen', 'sollen', 'goen', 'maachen'];

const PERSON_LABELS = [
  { key: 'p1', pronoun: 'ech' },
  { key: 'p2', pronoun: 'du' },
  { key: 'p3', pronoun: 'hien / si / hatt' },
  { key: 'p4', pronoun: 'mir' },
  { key: 'p5', pronoun: 'dir' },
  { key: 'p6', pronoun: 'si' },
];

/** One line of English on what each phrase group is for. Grammar description,
 * not translation — nothing here is Luxembourgish text of its own. */
const GROUP_NOTES = {
  self: 'The subject is always ech.',
  other: 'Same verb, a different ending for each subject.',
  pointing: 'et and dat name a situation before saying who or what is in it.',
  modal: 'Can, must, want — a second verb follows at the end, in its plain form.',
  past: 'The simple past of hunn and sinn, for what already happened.',
  polite: 'The conditional — for requests and "would".',
  asking: 'The verb moves in front of the subject to make a question.',
  joining: 'wann and wéi push the conjugated verb to the end of their clause.',
};

/** Pull the seven subject pronouns straight out of the vocab deck, in the
 * fixed order a learner meets them (matches PRONOUNS in drill/cards.js). */
export function pronounRows(vocab) {
  return PRONOUNS.map((word) => vocab.find((item) => item.pos === 'PRON' && item.lb.toLowerCase() === word))
    .filter(Boolean)
    .map((item) => ({ lb: item.lb, en: item.en }));
}

/** One row per core verb: its gloss and its six present-tense forms, in the
 * fixed person order the conjugation drill card already uses. */
export function verbTables(verbs) {
  return CORE_VERBS.map((infinitive) => verbs.find((item) => item.infinitive === infinitive))
    .filter((item) => item?.present)
    .map((item) => ({
      infinitive: item.infinitive,
      en: item.en,
      forms: PERSON_LABELS.map(({ key, pronoun }) => ({ pronoun, form: item.present[key] })),
    }));
}

/** The 34 phrase frames, grouped and titled the same way Phrases drills them. */
export function phraseGroups(phrases, groups) {
  return groups
    .map((group) => ({
      ...group,
      note: GROUP_NOTES[group.id] ?? null,
      frames: phrases.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.frames.length > 0);
}

const GENDER_ORDER = ['M', 'F', 'N'];

/** A few common nouns per gender, straight off the `gender` grammar items —
 * which are themselves straight off vocab.json's own gender/article fields. */
export function genderExamples(grammar, perGender = 3) {
  const byGender = { M: [], F: [], N: [] };
  for (const item of grammar) {
    if (item.kind !== 'gender') continue;
    if (byGender[item.gender].length >= perGender) continue;
    byGender[item.gender].push(item);
  }
  return GENDER_ORDER.map((code) => ({ code, label: GENDER_LABELS[code], words: byGender[code] }));
}

/** A few real sentences illustrating the n-rule — kept and dropped both, one
 * per distinct source sentence. build-grammar.js can mine more than one pair
 * out of the same sentence (a different word pair each time), which would
 * otherwise show the same sentence twice with only the bolded word changed. */
export function nruleExamples(grammar, count = 4) {
  const seen = new Set();
  const kept = [];
  const dropped = [];
  for (const item of grammar) {
    if (item.kind !== 'nrule') continue;
    // Keyed on the reconstructed sentence, not on before/after: two different
    // pairs mined from the same sentence split at different points (one
    // testing the article, one the next word along) still share one before
    // and after only by coincidence — the sentence itself is what repeats.
    const sentenceKey = `${item.before}${item.options_lb[item.correct]}${item.after}`.toLowerCase();
    if (seen.has(sentenceKey)) continue;
    seen.add(sentenceKey);
    (item.options_lb[item.correct].toLowerCase().endsWith('n') ? kept : dropped).push(item);
  }
  // The copy above says "both directions" — that has to be true regardless of
  // which direction happens to sort first in the file, so half the slots are
  // reserved for each rather than just taking the first `count` in file order.
  const half = Math.ceil(count / 2);
  return [...kept.slice(0, half), ...dropped.slice(0, count - Math.min(half, kept.length))];
}

/** One example per distinct adjective lemma, not one per item — an item
 * exists per attested form, and showing "aarm/aarme" and "aarme/aarm" back
 * to back would just be the same pair twice. */
export function adjectiveExamples(grammar, count = 4) {
  const seen = new Set();
  const picked = [];
  for (const item of grammar) {
    if (item.kind !== 'adjective' || seen.has(item.entryId)) continue;
    seen.add(item.entryId);
    picked.push(item);
    if (picked.length >= count) break;
  }
  return picked;
}

/** Builds the cheat sheet body into `container`. Shared by the routed screen
 * and the in-session sheet, so the two never drift apart. */
export function renderContent(container, { vocab, verbs, phrases, groups, grammar }) {
  container.append(
    section('Subject pronouns', el('div', { class: 'ref-pronouns' }, ...pronounRows(vocab).map(pronounTile))),
    section(
      'Key verbs',
      el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'Tap a verb for all six forms.'),
      ...verbTables(verbs).map(verbDetails),
    ),
    section(
      'Sentence patterns',
      el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'From the Phrases deck, by what you are trying to say.'),
      ...phraseGroups(phrases, groups).map(groupCard),
    ),
    section(
      'Gender & articles',
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
        'Every noun is männlech, weiblech or neutral, and the article agrees with it.',
      ),
      ...genderExamples(grammar).map(genderCard),
    ),
    section(
      'The n-rule (Eifeler Regel)',
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
        'A word ending in -n drops it, unless the next word starts with n, d, t, z, h or a vowel. Real sentences, both directions:',
      ),
      ...nruleExamples(grammar).map(nruleCard),
    ),
    section(
      'Adjective endings',
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
        'An adjective’s ending changes with the noun it describes — there is no one fixed form. Both spellings below are real:',
      ),
      ...adjectiveExamples(grammar).map(adjectiveCard),
    ),
  );
}

export async function render(root, { navigate }) {
  void navigate;
  const [vocab, verbs, phrases, groups, grammar] = await Promise.all([
    loadVocab(),
    loadVerbs(),
    loadPhrases(),
    loadPhraseGroups(),
    loadGrammar(),
  ]);

  // No back button: this is a tab, and tabs are destinations rather than
  // somewhere you arrived from.
  root.append(screenHead({ title: 'Cheat sheet', sub: 'The basics, to keep open while you practise' }));
  const body = el('div', { class: 'stack stack--lg', style: { paddingBlockEnd: 'var(--s6)' } });
  root.append(body);
  renderContent(body, { vocab, verbs, phrases, groups, grammar });

  return { destroy() {} };
}

function section(title, ...children) {
  return el('section', {}, el('p', { class: 'meter__label', style: { marginBlockEnd: 'var(--s3)' } }, title), ...children);
}

function pronounTile({ lb, en }) {
  return el('div', { class: 'ref-pronoun' }, el('p', { class: 'ref-pronoun__lb' }, lb), el('p', { class: 'ref-pronoun__en' }, en));
}

function verbDetails({ infinitive, en, forms }) {
  return el(
    'details',
    { class: 'ref-verb' },
    el('summary', {}, el('span', { class: 'card__title' }, infinitive), el('span', { class: 'card__note' }, ` — ${en}`)),
    el(
      'div',
      { class: 'ref-verb__forms' },
      ...forms.map(({ pronoun, form }) =>
        el('div', { class: 'ref-verb__form' }, el('span', { class: 'card__note' }, pronoun), el('span', {}, form)),
      ),
    ),
  );
}

function genderCard({ label, words }) {
  return el(
    'div',
    { class: 'card ref-group' },
    el('p', { class: 'card__title' }, label),
    el(
      'div',
      { style: { marginBlockStart: 'var(--s2)' } },
      ...words.map((word) =>
        el(
          'div',
          { class: 'ref-frame' },
          el('span', {}, `${word.article} ${word.lb}`),
          el('span', { class: 'card__note' }, word.en),
        ),
      ),
    ),
  );
}

function nruleCard(item) {
  const correctForm = item.options_lb[item.correct];
  const kept = correctForm.toLowerCase().endsWith('n');
  return el(
    'div',
    { class: 'card ref-group' },
    el('p', { class: 'card__note' }, kept ? 'kept — the next word starts with a trigger sound' : 'dropped — the next word does not'),
    el('p', { style: { marginBlockStart: 'var(--s1)' } }, item.before, el('strong', {}, correctForm), item.after),
  );
}

function adjectiveCard(item) {
  return el(
    'div',
    { class: 'card ref-group' },
    el('p', { class: 'card__title' }, item.options_lb.join(' / ')),
    item.en ? el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s1)' } }, item.en) : null,
  );
}

function groupCard(group) {
  return el(
    'div',
    { class: 'card ref-group' },
    el('p', { class: 'card__title' }, group.title),
    group.note ? el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s1)' } }, group.note) : null,
    el(
      'div',
      { style: { marginBlockStart: 'var(--s3)' } },
      ...group.frames.map((frame) =>
        el(
          'div',
          { class: 'ref-frame' },
          el('span', {}, frame.lb),
          el('span', { class: 'card__note' }, frame.en),
        ),
      ),
    ),
  );
}
