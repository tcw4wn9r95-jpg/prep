/**
 * Verb school — the verbs from the course handouts, worked one at a time.
 *
 * ## Where the content comes from
 *
 * The handouts supply the **selection**: which forty-two verbs, and which nine
 * adverbs. Nothing else. Every form the app shows — the present table, the
 * participle, the auxiliary, the gloss, the example sentence, the recording —
 * comes from the shipped LOD decks, because the project rule is that no
 * Luxembourgish ships unless it traces to a LOD record, and a printed handout
 * is not one.
 *
 * That distinction is not pedantic here. The modal table on the handout writes
 * the ech form of `kënnen` as `ka(nn)`, folding the n-rule into the cell.
 * LOD publishes `kann`, and the app has a whole separate machine for when the
 * n drops. Taking the handout's spelling would have put a form on screen that
 * contradicts the Eifeler Regel deck.
 *
 * `pipeline/test/verbschool.test.js` re-checks the whole selection against the
 * shipped decks on every run, so a verb that stops resolving fails the build
 * rather than rendering as a blank card.
 *
 * ## Why these categories and not the handouts' own grouping
 *
 * The handouts arrive as "thirty verbs", "six more verbs" and "the modal
 * table". The first two are batches rather than categories — they say when a
 * class met a verb, not what the verb is for. Grouped by meaning instead, the
 * set teaches something the batches cannot:
 *
 *   sëtzen / setzen · leien / leeën · stoen / stellen
 *
 * Three pairs where one member is what you *are* doing and the other is what
 * you *do to something else* — sit vs seat, lie vs lay, stand vs stand-up. They
 * are the reason both handouts carry both members, they are the classic
 * confusion, and they only look like a pattern when they sit next to each
 * other. The modals stay their own category, which they already were.
 *
 * ## The three things you can know about a verb
 *
 * A verb you can only translate is a verb you cannot use. Each one is worked
 * through three stages, in this order, and the order is the point:
 *
 *   meaning   — what it means, against the other verbs in its own category,
 *               which is harder and more useful than against random words
 *   table     — the six present forms, chosen from that verb's own forms, so
 *               the question is about the ending and nothing else
 *   sentence  — the verb doing its job in the sentence LOD published for it,
 *               with the form gapped, and then the recording
 *
 * Adverbs have no table, so they run meaning then sentence. Saying they
 * "conjugate" to keep the shape uniform would be teaching something false.
 */

/** The six persons, in table order, with the pronoun LOD's tables key them by. */
export const PERSONS = [
  { key: 'p1', pronoun: 'ech', en: 'I' },
  { key: 'p2', pronoun: 'du', en: 'you' },
  { key: 'p3', pronoun: 'hien / si / hatt', en: 'he / she / it' },
  { key: 'p4', pronoun: 'mir', en: 'we' },
  { key: 'p5', pronoun: 'dir', en: 'you (plural)' },
  { key: 'p6', pronoun: 'si', en: 'they' },
];

/**
 * The categories, and the verbs in each.
 *
 * The strings here are infinitives and adverb spellings — a selection from the
 * decks, not authored Luxembourgish. Every one is checked against the shipped
 * decks by the test named in the file header.
 */
export const CATEGORIES = [
  {
    id: 'core',
    title: 'Being and having',
    blurb: 'The two verbs every other sentence leans on.',
    note: 'Both are irregular, and both are worth knowing cold — they carry the past tense for everything else.',
    verbs: ['sinn', 'hunn'],
  },
  {
    id: 'motion',
    title: 'Coming and going',
    blurb: 'Getting yourself from one place to another.',
    note: 'These are the verbs that take sinn in the past rather than hunn, which is the other reason to learn them together.',
    verbs: ['kommen', 'goen', 'fueren'],
  },
  {
    id: 'saying',
    title: 'Saying and asking',
    blurb: 'Everything you do with your mouth in an interview.',
    note: 'The A2 speaking exam is five minutes of exactly these.',
    verbs: ['soen', 'froen', 'äntweren', 'schwätzen', 'heeschen'],
  },
  {
    id: 'senses',
    title: 'Seeing and hearing',
    blurb: 'Taking things in.',
    note: 'Two pairs worth keeping apart: kucken is looking on purpose and gesinn is what you see; lauschteren is listening and héieren is what you hear.',
    verbs: ['kucken', 'gesinn', 'lauschteren', 'héieren', 'liesen'],
  },
  {
    id: 'position',
    title: 'Sitting, standing, lying',
    blurb: 'Where a thing is, and putting it there.',
    note: 'The three pairs to watch: sëtzen / setzen, leien / leeën, stoen / stellen. The first of each is what you are doing; the second is what you do to something else.',
    verbs: ['sëtzen', 'setzen', 'stoen', 'stellen', 'leien', 'leeën', 'sprangen', 'schlofen'],
  },
  {
    id: 'having',
    title: 'Getting and giving',
    blurb: 'Things changing hands.',
    note: 'kréien is to get and ginn is to give — and ginn is also the everyday verb for becoming, which is why it turns up everywhere.',
    verbs: ['kréien', 'bréngen', 'huelen', 'ginn', 'kafen'],
  },
  {
    id: 'daily',
    title: 'Everyday things',
    blurb: 'A day described from start to finish.',
    note: 'These are the verbs the interview topics are actually made of — where you live, what you do, what you eat.',
    verbs: ['wunnen', 'schaffen', 'kachen', 'drénken', 'iessen', 'maachen', 'sangen', 'schreiwen'],
  },
  {
    id: 'modal',
    title: 'Modal verbs',
    blurb: 'Can, want, may, must, should, need.',
    note: 'These take a second verb and send it to the end of the sentence. Learn the table first — the sending-to-the-end is a word-order lesson of its own.',
    verbs: ['kënnen', 'wëllen', 'däerfen', 'mussen', 'sollen', 'brauchen'],
  },
  {
    id: 'adverbs',
    title: 'How often, how much',
    blurb: 'The words that say how often you do all of the above.',
    note: 'Not verbs, so there is no table to learn — just what they mean and where they sit in a sentence.',
    kind: 'adverb',
    verbs: ['ni', 'heiansdo', 'dacks', 'oft', 'meeschtens', 'ëmmer', 'näischt', 'eppes', 'vill', 'alles'],
  },
];

/** The stages a verb is worked through, in order. */
export const STAGES = [
  { id: 'meaning', title: 'What it means', short: 'Meaning' },
  { id: 'table', title: 'The six forms', short: 'Table' },
  { id: 'sentence', title: 'In a sentence', short: 'Sentence' },
];

/**
 * The stages a given word can actually be worked through.
 *
 * Per word, not per category, and that matters twice. Adverbs do not conjugate,
 * so they have no table — saying they did to keep the shape uniform would be
 * teaching something false. And a verb whose LOD example does not contain any
 * form of it has no sentence stage: `kréien`'s example uses `kritt`, which LOD
 * files under a sibling entry, so there is nothing in that sentence to gap.
 *
 * Deriving it per word is what lets such a word still reach 100%. A fixed list
 * of three would leave those categories permanently one stage short of finished
 * through no fault of the learner's.
 */
export function stagesFor(category, entry = null, siblings = []) {
  let stages = STAGES;
  if (category?.kind === 'adverb') stages = stages.filter((stage) => stage.id !== 'table');
  if (entry && !sentenceQuestion(entry, siblings)) stages = stages.filter((stage) => stage.id !== 'sentence');
  return stages;
}

/**
 * English clarifiers for words LOD glosses identically.
 *
 * `stoen` and `stellen` are both published as "to stand", which makes a
 * four-option meaning card unanswerable: the right answer appears twice and one
 * of the two is marked wrong. That is the same defect the numbers cards had.
 *
 * The fix is English, not Luxembourgish. The gloss LOD assigned is untouched —
 * this only adds the parenthetical that says which of the two is meant, and
 * English is the half of this app that may be written. It is the same move the
 * dative cards make when they name the person in English to avoid colliding
 * with the Luxembourgish options.
 *
 * Applied only when a sibling in the same category actually shares the gloss,
 * so a word that is unambiguous on its own is left as the dictionary has it.
 */
const CLARIFY = {
  stellen: 'to stand (something) up',
  stoen: 'to stand (yourself)',
};

/** The gloss to show, disambiguated only where it has to be. */
export function glossOf(entry, siblings = []) {
  const clash = siblings.some((other) => other.id !== entry.id && other.en === entry.en);
  if (!clash) return entry.en;
  return CLARIFY[String(entry.word).toLowerCase()] ?? entry.en;
}

export const categoryById = (id) => CATEGORIES.find((entry) => entry.id === id) ?? null;

/** Every word this module names, for the attestation check. */
export const allWords = () => CATEGORIES.flatMap((category) => category.verbs);

/**
 * Resolve a category's words against the shipped decks.
 *
 * Anything that does not resolve is dropped rather than rendered — a card for a
 * word with no gloss and no table is a blank card, and dropping is the same
 * call every generator in the pipeline makes.
 */
export function entriesFor(category, { verbs = [], vocab = [] } = {}) {
  if (!category) return [];
  if (category.kind === 'adverb') {
    const byLb = new Map();
    for (const item of vocab) {
      const key = item.lb?.toLowerCase();
      // First wins: `vill` is two entries and VILL1 ("a lot") is the one the
      // handout means. Taking the later one would gloss it "a lot (of)".
      if (key && !byLb.has(key)) byLb.set(key, item);
    }
    return category.verbs
      .map((word) => byLb.get(word))
      .filter((item) => item?.en)
      .map((item) => ({ id: item.id, word: item.lb, en: item.en, example: item.example ?? null, present: null }));
  }
  const byInf = new Map(verbs.map((verb) => [verb.infinitive?.toLowerCase(), verb]));
  return category.verbs
    .map((word) => byInf.get(word))
    .filter((verb) => verb?.en && verb.present)
    .map((verb) => ({
      id: verb.id,
      word: verb.infinitive,
      en: verb.en,
      example: verb.example ?? null,
      present: verb.present,
      imperative: verb.imperative ?? null,
      pastParticiple: verb.pastParticiple ?? null,
      auxiliaryVerb: verb.auxiliaryVerb ?? null,
    }));
}

/* ------------------------------------------------------------- questions */

const shuffled = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * "What does it mean?" — the gloss, against its own category.
 *
 * Distractors come from the same category on purpose. Picking "to drink" out of
 * {to drink, to run, to buy, to write} tests almost nothing; picking it out of
 * {to drink, to eat, to cook, to make} is the distinction that actually has to
 * be held.
 */
export function meaningQuestion(entry, siblings, random = Math.random) {
  const answer = glossOf(entry, siblings);
  // Deduplicated by the label actually shown, not by the word behind it. Two
  // buttons reading the same thing is one right answer and one that marks you
  // wrong, whichever verbs they came from.
  const seen = new Set([answer]);
  const distractors = [];
  for (const other of shuffled(siblings, random)) {
    if (other.id === entry.id) continue;
    const label = glossOf(other, siblings);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    distractors.push(label);
    if (distractors.length === 3) break;
  }
  return {
    stage: 'meaning',
    word: entry.word,
    answer,
    options: shuffled([answer, ...distractors], random),
  };
}

/**
 * The present table, one person at a time.
 *
 * Options are the verb's **own** other forms, never another verb's. That keeps
 * the question about the ending — which is the only thing that varies — rather
 * than about recognising the stem, which the meaning stage already covered.
 *
 * A person whose form is identical to the one already asked is still asked:
 * `mir` and `si` usually share the infinitive, and knowing that they do is part
 * of knowing the table.
 */
export function tableQuestions(entry, random = Math.random) {
  const present = entry.present ?? {};
  const distinct = [...new Set(PERSONS.map((person) => present[person.key]).filter(Boolean))];
  if (distinct.length < 2) return [];

  return PERSONS.filter((person) => present[person.key]).map((person) => {
    const answer = present[person.key];
    const others = shuffled(distinct.filter((form) => form !== answer), random).slice(0, 2);
    return {
      stage: 'table',
      word: entry.word,
      person,
      answer,
      options: shuffled([answer, ...others], random),
    };
  });
}

/**
 * The verb in the sentence LOD published for it, with its form gapped.
 *
 * The form in the sentence is whichever one the sentence happens to use, so the
 * gap is found by looking for any of the verb's forms in the text rather than
 * by assuming a person. Returns null when none of them is actually there —
 * plenty of LOD examples illustrate a verb through a participle or a noun, and
 * gapping a word that is not the verb would ask an unanswerable question.
 */
export function sentenceQuestion(entry, siblings = [], random = Math.random) {
  const text = entry.example?.lb;
  if (!text) return null;
  const candidates = gappableForms(entry, siblings);
  if (candidates.length < 2) return null;

  // Longest first: `ginn` and `gitt` can both be present, and gapping the
  // shorter one inside the longer would cut a word in half.
  for (const form of [...candidates].sort((a, b) => b.length - a.length)) {
    const at = text.search(new RegExp(`(^|[^\\p{L}])${escape(form)}([^\\p{L}]|$)`, 'iu'));
    if (at === -1) continue;
    const start = text.toLowerCase().indexOf(form.toLowerCase(), at);
    const before = text.slice(0, start);
    const after = text.slice(start + form.length);
    const others = shuffled(candidates.filter((other) => other.toLowerCase() !== form.toLowerCase()), random).slice(0, 2);
    if (others.length === 0) return null;
    return {
      stage: 'sentence',
      word: entry.word,
      before,
      after,
      answer: text.slice(start, start + form.length),
      options: shuffled([text.slice(start, start + form.length), ...others], random),
      audioId: entry.example?.audioId ?? null,
      en: entry.en,
    };
  }
  return null;
}

const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every form of this word that a real sentence might be using.
 *
 * Half the examples did not contain a present-tense form at all, and the three
 * reasons are all worth handling rather than skipping:
 *
 *   the Eifeler Regel — "ech **liese** grad e spannend Buch", "Äre Bouf **ka**
 *     gutt zeechnen". The final n is dropped before the next word, so an exact
 *     search for `liesen` or `kann` finds nothing. The n-dropped variant is a
 *     real LOD form, not a truncation, so it is searched for too.
 *   an imperative — "**kuck** mech emol an d'Aen!"
 *   a perfect — "d'Aarbechter hu séier an effikass **geschafft**"
 *
 * Including all of them turns the question into "which form of this verb does
 * the sentence need?", which is a better exercise than the present-only version
 * would have been anyway: the answer is sometimes a participle, and noticing
 * that is the point.
 *
 * An adverb has no forms of its own, so its distractors are the other adverbs
 * in its category — "which of these fits here?", which is the only sensible
 * reading of the question for a word that does not inflect.
 */
function gappableForms(entry, siblings = []) {
  if (!entry.present) {
    const others = siblings.filter((other) => other.id !== entry.id && other.word).map((other) => other.word);
    return [entry.word, ...others];
  }
  const forms = new Set([entry.word]);
  for (const form of Object.values(entry.present)) if (form) forms.add(form);
  for (const form of Object.values(entry.imperative ?? {})) {
    // LOD writes imperatives with their exclamation mark. The sentence will not.
    if (form) forms.add(String(form).replace(/!+$/, '').trim());
  }
  for (const part of String(entry.pastParticiple ?? '').split('/')) {
    const trimmed = part.trim();
    if (trimmed) forms.add(trimmed);
  }
  // The n-dropped variant, for the Eifeler Regel. A doubled -nn loses both:
  // `kann` becomes `ka`, which LOD attests under the same entry, and which is
  // what "Äre Bouf ka gutt zeechnen" actually says.
  for (const form of [...forms]) {
    if (/nn$/i.test(form) && form.length > 3) forms.add(form.slice(0, -2));
    else if (/n$/i.test(form) && form.length > 2) forms.add(form.slice(0, -1));
  }
  return [...forms].filter(Boolean);
}

/* -------------------------------------------------------------- progress */

/** One key per verb and stage, so progress survives a category being renamed. */
export const progressKey = (wordId, stage) => `${wordId}:${stage}`;

/**
 * What is finished in a category, out of what could be.
 *
 * Counts stages rather than verbs: a verb you can translate but not conjugate
 * is genuinely half learned, and a bar that only moved on the third stage would
 * hide most of the work.
 */
export function categoryProgress(category, entries, done = new Set()) {
  let total = 0;
  let finished = 0;
  for (const entry of entries) {
    for (const stage of stagesFor(category, entry, entries)) {
      total += 1;
      if (done.has(progressKey(entry.id, stage.id))) finished += 1;
    }
  }
  return { finished, total, ratio: total === 0 ? 0 : finished / total };
}

/** The next verb and stage to work on, or null when the category is finished. */
export function nextUp(category, entries, done = new Set()) {
  for (const entry of entries) {
    for (const stage of stagesFor(category, entry, entries)) {
      if (!done.has(progressKey(entry.id, stage.id))) return { entry, stage };
    }
  }
  return null;
}
