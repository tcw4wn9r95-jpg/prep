/**
 * The verb games: what a verb means, how it conjugates, its past, its plural.
 *
 * ## Why five mechanics rather than five sets of questions
 *
 * The benchmark finding that shaped this is about *salience*. Morphological
 * cues — an ending, a stem vowel — are the least noticeable part of a sentence
 * and are routinely skipped by learners unless instruction forces attention
 * onto them (form-focused instruction; see the docs write-up for sources). A
 * multiple-choice card asking "how do you say we go?" lets you answer from the
 * verb's meaning and never look at the ending at all.
 *
 * So each game is built so that the *only* way to answer is to read the cue:
 *
 *   `meaning`  the one recognition game, and the entry point. Everything else
 *              assumes you know what the verb does.
 *   `person`   a conjugated form, and you choose who is doing it. Backwards
 *              from a normal conjugation drill on purpose: the ending is the
 *              only information on the card, so it cannot be skipped.
 *   `form`     produce a form from letter tiles. Retrieval rather than
 *              recognition — the effect that separates a drill that teaches
 *              from one that feels productive.
 *   `aux`      hunn or sinn in the perfect. A two-way sort, and the round is
 *              balanced because the honest distribution is 86/14 and a player
 *              who always taps hunn would otherwise "score" 86%.
 *   `number`   singular or plural. Rests on a measured fact: for all 111 A1
 *              verbs the third-person singular and the plural differ, so the
 *              question always has an answer in the form itself.
 *
 * ## Ambiguity is the hard constraint
 *
 * Luxembourgish paradigms are full of syncretism — `hunn` is ech, mir *and*
 * si. A card asking "who says hunn?" has three right answers and one accepted
 * one, which teaches the learner that they were wrong when they were not. So
 * `person` and `number` only ever ask about forms that are unique within their
 * own verb's paradigm. Of 371 distinct A1 present-tense forms, 182 identify a
 * person uniquely and 196 identify a number uniquely; those are the ones used.
 *
 * ## Where the Luxembourgish comes from
 *
 * `app/data/verbs.json`, built by `pipeline/build-verbs.js` from LOD's
 * Flexiounstabellen — the published inflection tables, not a generated
 * paradigm. Nothing here is authored.
 */

/** The six persons, in the order the cheat sheet and the drill decks use. */
export const PERSONS = [
  { key: 'p1', pronoun: 'ech', en: 'I', number: 'sing' },
  { key: 'p2', pronoun: 'du', en: 'you', number: 'sing' },
  { key: 'p3', pronoun: 'hien', en: 'he', number: 'sing' },
  { key: 'p4', pronoun: 'mir', en: 'we', number: 'plur' },
  { key: 'p5', pronoun: 'dir', en: 'you (plural)', number: 'plur' },
  { key: 'p6', pronoun: 'si', en: 'they', number: 'plur' },
];

/**
 * @typedef {{
 *   id:string, title:string, ask:string, kind:string,
 *   rule:string, points:string[], how:string, demo?:string
 * }} VerbGame
 */

/**
 * The five games, each with the thing it teaches written for the person
 * playing it.
 *
 * The first version of this file had one `teaches` line per game and it was
 * written in the wrong voice entirely — "backwards from a normal conjugation
 * drill" explains the *design* to a reviewer and tells a learner nothing about
 * Luxembourgish. It also sat below the answer buttons, so it was read after
 * answering if at all. The shape below is the one the rest of the app already
 * uses for teaching (`grammar-guide.js`): a one-line rule, a few points, and
 * what you actually do on a card.
 *
 * `demo` names a verb whose real table is shown alongside the rule. It is a
 * lookup rather than a written-out example, because writing one would mean
 * authoring Luxembourgish — `schaffen` is regular, A1, and shows both the -s
 * and -t endings and the mir/si shortcut in one table.
 */

/** @type {VerbGame[]} */
export const VERB_GAMES = [
  {
    id: 'verb-meaning',
    title: 'What does it mean?',
    ask: 'Match a verb to its meaning, both ways round',
    kind: 'meaning',
    rule: 'The form you look a verb up under ends in -en or -n. That is the infinitive: “to work”, “to go”, “to be”.',
    points: [
      'Every other verb game starts from the infinitive, so this is the one to play first.',
      'Half the cards give you the Luxembourgish and ask for the English. The other half go the other way, which is the direction speaking actually needs.',
      'When you get one right, the sentence LOD publishes for that verb appears underneath — that is the verb doing its job in a real sentence.',
    ],
    how: 'Tap the meaning that matches the word on the card.',
  },
  {
    id: 'verb-person',
    title: 'Who is doing it?',
    ask: 'Read the ending, name the person',
    kind: 'person',
    rule: 'Luxembourgish puts the person on the end of the verb. The stem stays put and the ending changes.',
    points: [
      'The ending is the whole answer here. You are given a form on its own and have to say who it belongs to, so there is nothing else on the card to go on — that is deliberate, because an ending is easy to stop noticing.',
      'An -s ending nearly always means du. A -t ending means hien, si or hatt — or dir.',
      'The mir and si forms are usually just the infinitive again, unchanged.',
      'Some forms fit more than one person. Those are never asked, so the card you see always has exactly one right answer.',
    ],
    how: 'Tap the pronoun that goes with the form shown.',
    demo: 'schaffen',
  },
  {
    id: 'verb-form',
    title: 'Finish the table',
    ask: 'Build the form yourself, letter by letter',
    kind: 'form',
    rule: 'Same endings as “Who is doing it?”, but you produce the form instead of recognising it.',
    points: [
      'Recognising a form and being able to say it are different skills, and only the second one helps when you are speaking.',
      'The card names a verb and a person. You build the form that goes with them.',
      'Some tiles are decoys, so the bank is always longer than the answer.',
    ],
    how: 'Tap the letters in order, then tap Check.',
    demo: 'schaffen',
  },
  {
    id: 'verb-past',
    title: 'hunn or sinn?',
    ask: 'Pick the helper verb that makes the past',
    kind: 'aux',
    rule: 'To say something already happened you use a helper verb plus the participle — the equivalent of “I have worked”.',
    points: [
      'The helper is hunn for most verbs.',
      'It is sinn for verbs of going and becoming — goen, kommen, bleiwen and their relatives.',
      'Getting this wrong is one of the most audible beginner mistakes, because the helper is the second word out of your mouth.',
      'The card shows the participle. Pick the helper that belongs with it.',
    ],
    how: 'Tap hunn or sinn.',
  },
  {
    id: 'verb-number',
    title: 'One or many?',
    ask: 'Is one person doing it, or several?',
    kind: 'number',
    rule: 'The ending also tells you how many people are doing it, without any pronoun in front of it.',
    points: [
      'Singular is ech, du and hien/si/hatt. Plural is mir, dir and si.',
      'For every A1 verb the he/she form and the we/they form are different, so the form on its own always answers the question.',
      'The quickest tell: if the form is the infinitive unchanged, it is mir or si — plural.',
      'A -t ending is the tricky one, because it can be hien or dir. Where a form really is ambiguous the card is not asked at all.',
    ],
    how: 'Tap One person or More than one.',
    demo: 'schaffen',
  },
];

export const verbGameById = (id) => VERB_GAMES.find((game) => game.id === id) ?? null;

/**
 * The verbs a game may draw on.
 *
 * `a1Only` reads the stamp `pipeline/build-a1.js` writes, exactly as the
 * sentence-function patterns do, so the Settings switch governs both halves of
 * the Arcade rather than only one.
 */
export function verbPool(verbs, { a1Only = true } = {}) {
  return (verbs ?? []).filter((verb) => {
    if (a1Only && verb.a1 !== true) return false;
    return Boolean(verb.infinitive && verb.present);
  });
}

/**
 * Forms of one verb that identify a person, or a number, on their own.
 *
 * `by` is 'person' or 'number'. A form shared by two persons is still returned
 * for 'number' when both persons are on the same side of the singular/plural
 * line — `hunn` is ech/mir/si and so is useless for person, but `sinn`'s `sinn`
 * is p1/p4/p6 and equally useless; whereas a form shared by only p4 and p6 is
 * unambiguously plural and perfectly good for 'number'.
 */
export function unambiguousForms(verb, by = 'person') {
  const present = verb?.present ?? {};
  const byForm = new Map();
  for (const person of PERSONS) {
    const form = present[person.key];
    if (!form) continue;
    byForm.set(form, [...(byForm.get(form) ?? []), person]);
  }

  const out = [];
  for (const [form, persons] of byForm) {
    if (by === 'person') {
      if (persons.length === 1) out.push({ form, person: persons[0] });
      continue;
    }
    const numbers = new Set(persons.map((person) => person.number));
    if (numbers.size === 1) out.push({ form, number: persons[0].number, persons });
  }
  return out;
}

/** The past participle, without LOD's "either of these" alternatives. */
export function participleOf(verb) {
  const raw = verb?.pastParticiple;
  if (!raw) return null;
  // LOD writes genuine alternatives as "missen / mussen". Asking a learner to
  // reproduce both is a trick question, so the first is used and the card
  // never asks for the participle to be typed — only recognised.
  return String(raw).split('/')[0].trim() || null;
}

/** Can this game fill a round from this pool? */
export function isVerbGamePlayable(game, pool) {
  if (!game || pool.length === 0) return false;
  if (game.kind === 'meaning') return pool.filter((verb) => verb.en).length >= 4;
  if (game.kind === 'person') return pool.filter((verb) => unambiguousForms(verb, 'person').length > 0).length >= 4;
  if (game.kind === 'form') return pool.length >= 4;
  if (game.kind === 'number') return pool.filter((verb) => unambiguousForms(verb, 'number').length > 0).length >= 4;
  if (game.kind === 'aux') {
    // Both sides have to exist or the sort is not a sort.
    const sinn = pool.filter((verb) => verb.auxiliaryVerb === 'sinn' && participleOf(verb)).length;
    const hunn = pool.filter((verb) => verb.auxiliaryVerb === 'hunn' && participleOf(verb)).length;
    return sinn >= 3 && hunn >= 3;
  }
  return false;
}
