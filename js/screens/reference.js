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
 * as its own screen.
 */

import { el, screenHead } from '../dom.js';
import { loadVocab, loadVerbs, loadPhrases, loadPhraseGroups } from '../content.js';

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

/** Builds the cheat sheet body into `container`. Shared by the routed screen
 * and the in-session sheet, so the two never drift apart. */
export function renderContent(container, { vocab, verbs, phrases, groups }) {
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
  );
}

export async function render(root, { navigate }) {
  void navigate;
  const [vocab, verbs, phrases, groups] = await Promise.all([loadVocab(), loadVerbs(), loadPhrases(), loadPhraseGroups()]);

  // No back button: this is a tab, and tabs are destinations rather than
  // somewhere you arrived from.
  root.append(screenHead({ title: 'Cheat sheet', sub: 'The basics, to keep open while you practise' }));
  const body = el('div', { class: 'stack stack--lg', style: { paddingBlockEnd: 'var(--s6)' } });
  root.append(body);
  renderContent(body, { vocab, verbs, phrases, groups });

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
