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

/** @typedef {{id:string,title:string,ask:string,kind:string,teaches:string}} VerbGame */

/** @type {VerbGame[]} */
export const VERB_GAMES = [
  {
    id: 'verb-meaning',
    title: 'What does it do?',
    ask: 'Read the verb, know the verb',
    kind: 'meaning',
    teaches: 'Every other verb game assumes you know this one, so it comes first.',
  },
  {
    id: 'verb-person',
    title: 'Who is doing it?',
    ask: 'ech · du · hien · mir · dir · si',
    kind: 'person',
    teaches:
      'Backwards from a normal conjugation drill: you are given the form and have to find the person, so the ending is the only thing that can answer the card.',
  },
  {
    id: 'verb-form',
    title: 'Finish the table',
    ask: 'Build the form yourself',
    kind: 'form',
    teaches: 'Typing it out, not picking it. Producing a form is what makes it available when you speak.',
  },
  {
    id: 'verb-past',
    title: 'hunn or sinn?',
    ask: 'Which one makes the past',
    kind: 'aux',
    teaches:
      'Luxembourgish builds the past with hunn for most verbs and sinn for the rest. Picking wrong is the single most audible beginner mistake.',
  },
  {
    id: 'verb-number',
    title: 'One or many?',
    ask: 'Singular or plural',
    kind: 'number',
    teaches:
      'For every A1 verb the singular and plural forms differ — and the mir/si form is usually just the infinitive again, which is the shortcut worth noticing.',
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
