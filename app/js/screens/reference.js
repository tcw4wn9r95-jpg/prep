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
import { GENDER_LABELS, joinArticle } from '../drill/cards.js';
import { GRAMMAR_GUIDE } from '../grammar-guide.js';
import { exampleGroup, safeExamples } from '../grammar-examples.js';

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

/** The imperative only ever addresses "you" — matches pipeline/build-verbs.js
 * `IMPERATIVE_PERSONS`, and only those two keys exist on `item.imperative`. */
const IMPERATIVE_LABELS = [
  { key: 'p2', pronoun: 'du' },
  { key: 'p5', pronoun: 'dir' },
];

/** How many entries the "100 verbs" tab shows. Not a round import of the
 * whole deck: 100 is what fits a quick lookup, ranked by how often each verb
 * actually turns up in the corpus (pipeline/build-learn.js `rank`), so the
 * cut lands after the verbs a beginner is actually likely to reach for. */
const VERB_LIST_SIZE = 100;

/** One line of English on what each phrase group is for. Grammar description,
 * not translation — nothing here is Luxembourgish text of its own. */
const GROUP_NOTES = {
  self: 'The subject is always ech.',
  other: 'Same verb, a different ending for each subject.',
  pointing: 'et and dat name a situation before saying who or what is in it.',
  modal: 'Can, must, want — a second verb follows at the end, in its plain form.',
  past: 'The simple past of hunn and sinn, for what already happened.',
  future: 'wäert plus a verb at the end, for what is going to happen.',
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

/** One `{pronoun, form}` row per label that actually has a form — an
 * imperative missing its "du" side (rare, but real: see build-verbs.js) drops
 * that row rather than showing a blank one. */
function personForms(byPerson, labels) {
  return labels.map(({ key, pronoun }) => ({ pronoun, form: byPerson?.[key] ?? null })).filter((row) => row.form);
}

/** A raw verbs.json entry, reduced to what a cheat-sheet card renders: its
 * gloss, its six present-tense forms, and past/imperative forms where LOD
 * publishes them (pipeline/build-verbs.js — most verbs have both, a handful
 * of modals have neither imperative nor a natural command form). `null` for
 * anything without a complete present tense, since that is the one thing
 * every card on this screen assumes it can show. */
function toVerbTable(item) {
  if (!item?.present) return null;
  return {
    infinitive: item.infinitive,
    en: item.en,
    forms: personForms(item.present, PERSON_LABELS),
    pastForms: item.past ? personForms(item.past, PERSON_LABELS) : null,
    imperativeForms: item.imperative ? personForms(item.imperative, IMPERATIVE_LABELS) : null,
  };
}

/** One row per core verb — the handful that carry most sentences, present +
 * past + imperative, in the fixed person order the conjugation drill uses. */
export function verbTables(verbs) {
  return CORE_VERBS.map((infinitive) => toVerbTable(verbs.find((item) => item.infinitive === infinitive))).filter(Boolean);
}

/** The most-used verbs in the corpus, ranked, present + past + imperative —
 * the "100 verbs" tab. Same card shape as `verbTables`, just a longer and
 * frequency-ordered list rather than the nine hand-picked core verbs. */
export function rankedVerbTables(verbs, count = VERB_LIST_SIZE) {
  return [...verbs]
    .filter((item) => typeof item.rank === 'number')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(toVerbTable)
    .filter(Boolean);
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

/**
 * Builds the cheat sheet body into `container`. Shared by the routed screen
 * and the in-session sheet, so the two never drift apart.
 *
 * Two tabs, not one long scroll with a 100th verb added to the bottom of it.
 * "Basics" is everything this screen already showed — pronouns, the nine
 * verbs that carry most sentences, sentence patterns, the grammar rules — and
 * stays the default, since it is what "cheat sheet" has always meant here.
 * "100 verbs" is a lookup table: ranked by how often each verb actually turns
 * up in the corpus, present + past + imperative, for the moment mid-sentence
 * when the verb needed is not one of the nine.
 */
export function renderContent(container, { vocab, verbs, phrases, groups, grammar }) {
  const panels = {
    basics: () => basicsPanel({ vocab, verbs, phrases, groups, grammar }),
    verbs: () => verbListPanel(verbs),
  };

  const body = el('div', {});
  const tabs = TABS.map((tab) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: `chip chip--pick${tab.id === TABS[0].id ? ' is-picked' : ''}`,
        'aria-selected': tab.id === TABS[0].id ? 'true' : 'false',
        onclick: () => selectTab(tab.id),
      },
      tab.label,
    ),
  );

  function selectTab(id) {
    for (const [index, node] of tabs.entries()) {
      const isMe = TABS[index].id === id;
      node.classList.toggle('is-picked', isMe);
      node.setAttribute('aria-selected', isMe ? 'true' : 'false');
    }
    body.replaceChildren(panels[id]());
  }

  container.append(el('div', { class: 'row', role: 'tablist', style: { gap: 'var(--s2)', marginBlockEnd: 'var(--s4)' } }, ...tabs), body);
  body.append(panels[TABS[0].id]());
}

const TABS = [
  { id: 'basics', label: 'Basics' },
  { id: 'verbs', label: '100 verbs' },
];

function basicsPanel({ vocab, verbs, phrases, groups, grammar }) {
  return el(
    'div',
    { class: 'stack stack--lg' },
    section('Subject pronouns', el('div', { class: 'ref-pronouns' }, ...pronounRows(vocab).map(pronounTile))),
    section(
      'Key verbs',
      el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'Tap a verb for its present, past and imperative.'),
      ...verbTables(verbs).map(verbDetails),
    ),
    section(
      'Sentence patterns',
      el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'From the Phrases deck, by what you are trying to say.'),
      ...phraseGroups(phrases, groups).map(groupCard),
    ),
    // The theory, from grammar-guide.js. Each topic is collapsed so the sheet
    // stays scannable when it is opened mid-exercise to check one thing — the
    // use it was built for — and opens to the full explanation when there is
    // time to read it.
    section(
      'Grammar rules',
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
        'The rules the exam marks you on. Tap one to read it properly.',
      ),
      ...GRAMMAR_GUIDE.map((topic) => topicCard(topic, { vocab, verbs, phrases, grammar })),
    ),
    section(
      'Gender & articles, in practice',
      ...genderExamples(grammar).map(genderCard),
    ),
    section(
      'The n-rule, in practice',
      el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'Real sentences, both directions:'),
      ...nruleExamples(grammar).map(nruleCard),
    ),
    section(
      'Adjective endings, in practice',
      el('p', { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } }, 'Both spellings below are real:'),
      ...adjectiveExamples(grammar).map(adjectiveCard),
    ),
  );
}

function verbListPanel(verbs) {
  const list = rankedVerbTables(verbs);
  return el(
    'div',
    { class: 'stack stack--lg' },
    section(
      `${list.length} most-used verbs`,
      el(
        'p',
        { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
        'Ranked by how often each one actually turns up in the corpus, most first. Tap one for its present, past and imperative.',
      ),
      ...list.map(verbDetails),
    ),
  );
}

/**
 * One topic of the guide: the rule, the teaching, and worked examples.
 *
 * The examples are never written here — `topic.examples(data)` reaches into
 * the decks the app already ships, so an illustration cannot be an invention.
 * Which is also why a topic that finds nothing to illustrate simply renders
 * without examples instead of falling back to a made-up sentence.
 */
function topicCard(topic, data) {
  const groups = safeExamples(topic, data);

  return el(
    'details',
    { class: 'ref-verb ref-topic' },
    el('summary', {}, el('span', { class: 'card__title' }, topic.title)),
    el('p', { class: 'ref-topic__rule' }, topic.rule),
    ...topic.points.map((point) => el('p', { class: 'ref-topic__point' }, point)),
    ...groups.map(exampleGroup),
    topic.sources?.length
      ? el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } }, `Forms from LOD — ${topic.sources.join('; ')}.`)
      : null,
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

/**
 * A verb's card: present always, past and imperative only where LOD publishes
 * them (a few modals — kënnen, mussen, sollen, wëllen — have neither, since
 * "can!" is not a command in any language). Labelled subgroups only appear
 * once there is more than one tense to tell apart; a verb with present alone
 * still reads as a plain table, the way this card always has.
 */
function verbDetails({ infinitive, en, forms, pastForms, imperativeForms }) {
  const groups = [{ label: 'Present', forms }];
  if (pastForms?.length) groups.push({ label: 'Past', forms: pastForms });
  if (imperativeForms?.length) groups.push({ label: 'Imperative', forms: imperativeForms });

  return el(
    'details',
    { class: 'ref-verb' },
    el('summary', {}, el('span', { class: 'card__title' }, infinitive), el('span', { class: 'card__note' }, ` — ${en}`)),
    ...groups.map((group) => verbFormGroup(group, groups.length > 1)),
  );
}

function verbFormGroup({ label, forms }, labelled) {
  return el(
    'div',
    { style: { marginBlockStart: 'var(--s2)' } },
    labelled ? el('p', { class: 'meter__label', style: { marginBlockStart: 'var(--s3)', marginBlockEnd: 'var(--s1)' } }, label) : null,
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
          el('span', {}, joinArticle(word.article, word.lb)),
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
