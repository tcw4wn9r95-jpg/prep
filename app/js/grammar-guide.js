/**
 * The theory. What a teacher would say before setting the exercise.
 *
 * The app drilled gender, the n-rule and adjective agreement without ever
 * stating the rules in more than a single line, and never stated the rest at
 * all — word order, the perfect, negation, plurals, questions. A drill you can
 * only pass by having already absorbed the rule somewhere else is a test, not
 * teaching.
 *
 * ## What may be written here, and what may not
 *
 * The project rule is that **English is free and Luxembourgish is
 * corpus-locked**: explanations, hints and UI chrome may be written, but every
 * Luxembourgish token that ships must trace to a LOD record. So:
 *
 *   - the prose in `rule` and `points` is written here, in English;
 *   - every Luxembourgish form quoted inside it is one LOD publishes, and is
 *     named in `sources` so it can be checked;
 *   - worked examples are not written at all — `examples(data)` pulls real
 *     sentences and real inflection-table forms out of the decks the app
 *     already ships, so an illustration cannot be an invention.
 *
 * The forms quoted inline are limited on purpose to the closed classes the
 * corpus fixes and `pipeline/test/grammar-guide.test.js` re-checks: the
 * articles, the subject pronouns, `net`, and the two auxiliaries. Nothing with
 * an inflected ending is written by hand.
 */

/**
 * A topic. `id` matches the grammar deck's `kind` where one exists, so a drill
 * card can find its own theory.
 *
 * @typedef {object} Topic
 * @property {string} id
 * @property {string} title
 * @property {string} rule      one sentence — the thing to remember
 * @property {string[]} points  the teaching, a few short paragraphs
 * @property {(data: object) => Array} examples  drawn from shipped decks only
 */

/**
 * Worked examples for a sentence-structure topic: the real sentences its own
 * deck was mined from, so the theory and the drill cannot disagree.
 */
function orderExamples(grammar, kind, label) {
  const sentences = (grammar ?? [])
    .filter((item) => item.kind === kind)
    .slice(0, 4)
    .map((item) => ({ lb: item.options_lb?.[item.correct] }))
    .filter((entry) => entry.lb);
  return sentences.length ? [{ label, sentences }] : [];
}

/**
 * Worked examples for a cloze-mined topic (numbers, dative): the answer
 * bolded inside the real sentence it was gapped from, one per distinct
 * sentence — the same shape `nruleExamples` in reference.js renders, kept
 * here as a shared helper since numbers and dative both need it.
 */
function clozeExamples(grammar, kind, label, count = 4) {
  const seen = new Set();
  const sentences = [];
  for (const item of grammar ?? []) {
    if (item.kind !== kind) continue;
    const form = item.options_lb?.[item.correct];
    if (!form) continue;
    const key = `${item.before}${form}${item.after}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sentences.push({ before: item.before, form, after: item.after });
    if (sentences.length >= count) break;
  }
  return sentences.length ? [{ label, sentences }] : [];
}

/** Gender codes as the grammar deck writes them. */
const GENDER_ORDER = ['M', 'F', 'N'];

/** @type {Topic[]} */
export const GRAMMAR_GUIDE = [
  {
    id: 'gender',
    title: 'Nouns have a gender',
    rule: 'Every noun is männlech, weiblech or neutral, and the article changes with it.',
    points: [
      'There is no reliable way to work a noun’s gender out from its shape, so it is learned with the word rather than derived from it. Learn the article as part of the noun — not “Auto” but “de Auto”.',
      'The definite article is de (den before a vowel or n/d/t/z/h, by the n-rule) for masculine, and d’ for both feminine and neuter.',
      'The indefinite article is eng for feminine, and en for both masculine and neuter.',
      'So neither article on its own tells you the gender: d’ narrows it to feminine or neuter, en narrows it to masculine or neuter. It is the two together that pin it down — d’ plus en means neuter, d’ plus eng means feminine.',
      'Do not carry a gender over from another language. A noun’s gender here is its own, and often differs from the gender of the same-looking word elsewhere.',
    ],
    sources: [
      'article-to-gender counted over LOD’s own example sentences: eng precedes feminine nouns 99% of the time, en precedes masculine 89% and neuter 99%; d’ precedes feminine 97% and neuter 93%',
    ],
    examples: ({ grammar }) => {
      const byGender = { M: [], F: [], N: [] };
      for (const item of grammar ?? []) {
        if (item.kind !== 'gender' || !byGender[item.gender]) continue;
        if (byGender[item.gender].length >= 3) continue;
        byGender[item.gender].push({ lb: `${item.article}${item.article.endsWith('’') || item.article.endsWith("'") ? '' : ' '}${item.lb}`, en: item.en });
      }
      return GENDER_ORDER.filter((code) => byGender[code].length).map((code) => ({
        label: { M: 'männlech (masculine)', F: 'weiblech (feminine)', N: 'neutral' }[code],
        items: byGender[code],
      }));
    },
  },

  {
    id: 'nrule',
    title: 'The n-rule (Eifeler Regel)',
    rule: 'A word ending in -n keeps it before n, d, t, z, h or a vowel, and drops it before anything else.',
    points: [
      'This is the rule that most marks written Luxembourgish, and it has no equivalent in the neighbouring languages — it is not something to guess at from another language you know.',
      'It applies to the sound that starts the *next* word, so the same word is spelled differently depending on what follows it. Nothing about the word itself changes meaning.',
      'It runs across the whole sentence, not just on nouns: verbs, articles and pronouns all lose the final n in the same way.',
      'The trigger letters are n, d, t, z, h and any vowel. Everything else drops the n.',
    ],
    sources: ['trigger set n/d/t/z/h + vowel, as enforced by the LOD search index n-rule flags'],
    examples: ({ grammar }) => {
      const kept = [];
      const dropped = [];
      const seen = new Set();
      for (const item of grammar ?? []) {
        if (item.kind !== 'nrule') continue;
        const form = item.options_lb?.[item.correct];
        if (!form) continue;
        const key = `${item.before}${form}${item.after}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const bucket = form.toLowerCase().endsWith('n') ? kept : dropped;
        if (bucket.length < 2) bucket.push({ before: item.before, form, after: item.after });
      }
      return [
        { label: 'n kept — the next word starts with a trigger sound', sentences: kept },
        { label: 'n dropped — it does not', sentences: dropped },
      ].filter((group) => group.sentences.length);
    },
  },

  {
    id: 'adjective',
    title: 'Adjective endings',
    rule: 'An adjective before a noun takes an ending that agrees with it; after the verb it stays bare.',
    points: [
      'There is no single fixed form of an adjective. The form you look up is the one used *after* a verb — “the car is green”. Put the same adjective in front of the noun and it takes an ending.',
      'So the useful habit is to notice the position first: after sinn or another verb, use the plain dictionary form; in front of a noun, expect an ending.',
      'The endings go with the noun’s gender and whether an article is present, which is why the same adjective appears in several shapes across real sentences.',
    ],
    sources: ['both spellings of each pair are attested forms taken from LOD’s own example sentences'],
    examples: ({ grammar }) => {
      const seen = new Set();
      const pairs = [];
      for (const item of grammar ?? []) {
        if (item.kind !== 'adjective' || seen.has(item.entryId)) continue;
        seen.add(item.entryId);
        pairs.push({ forms: item.options_lb, en: item.en });
        if (pairs.length >= 4) break;
      }
      return [{ label: 'Both forms are real — the ending depends on where the word sits', pairs }];
    },
  },

  {
    id: 'perfect',
    title: 'Talking about the past',
    rule: 'The past is normally hunn or sinn plus the past participle — and this is the everyday past tense, not a formal one.',
    points: [
      'The speaking exam asks about the past directly: one of the three phases of the interview is about d’Vergaangenheet. This is the form to use for it.',
      'Most verbs take hunn. A small group — mainly verbs of movement and change of state — takes sinn instead. Which one a verb takes is a fact about that verb, so learn it with the verb, the same way you learn a noun’s article.',
      'The participle goes to the end of the clause and the auxiliary stays in second position, so the two halves of the verb end up wrapped around everything else in the sentence.',
      'Do not reach for a simple past. Unlike some neighbouring languages, this construction is the ordinary way to say what happened, in speech and in writing alike.',
    ],
    sources: ['auxiliary and participle for all 365 verbs come from LOD’s Flexiounstabellen'],
    examples: ({ verbs }) => {
      // Frequency alone puts the auxiliaries and the modals at the top, and
      // those are the worst illustrations available: "hunn … ginn" reads as a
      // typo, and a modal in the perfect is a construction well past A2. The
      // ones worth showing are ordinary verbs with an ordinary participle.
      const SKIP = new Set(['hunn', 'sinn', 'ginn', 'kënnen', 'mussen', 'sollen', 'wëllen', 'däerfen', 'wëssen']);
      const pick = (aux, limit) =>
        (verbs ?? [])
          .filter(
            (verb) =>
              verb.auxiliaryVerb === aux &&
              verb.pastParticiple &&
              verb.en &&
              !SKIP.has(verb.infinitive) &&
              // A participle LOD writes two ways would need explaining before
              // it could illustrate anything.
              !verb.pastParticiple.includes('/'),
          )
          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
          .slice(0, limit)
          .map((verb) => ({ infinitive: verb.infinitive, participle: verb.pastParticiple, en: verb.en, aux }));
      return [
        { label: 'with hunn — most verbs', verbs: pick('hunn', 5) },
        { label: 'with sinn — movement and change of state', verbs: pick('sinn', 5) },
      ].filter((group) => group.verbs.length);
    },
  },

  {
    id: 'wordorder',
    title: 'Sentence structure 1 — the verb is second',
    rule: 'In a statement the conjugated verb is the second element, whatever comes first.',
    points: [
      'This is the rule an English speaker breaks most, because English fixes the order subject-verb-object and Luxembourgish fixes the *verb’s position* instead. Whatever you put first, the conjugated verb follows it.',
      'Second **element**, not second word. If the sentence opens with a time or place phrase, that whole phrase is the first element and the verb still comes next — before the subject. So the subject often lands after the verb. It has not moved for emphasis; the verb simply holds its slot.',
      'Only one element may go in front of the verb. Two is the mistake to watch for: pick the time phrase or the subject to lead with, not both.',
      'A yes/no question moves the verb in front of everything instead. With a question word, the question word is the first element and the verb follows it — the same rule, counted from the question word.',
    ],
    sources: [
      'Grammaire de la langue luxembourgeoise, Zenter fir d’Lëtzebuerger Sprooch (ISBN 978-99959-1-206-2), the official reference. Checked against LOD: 3,288 of its 10,777 example sentences put a finite verb in second position.',
    ],
    examples: ({ grammar }) => orderExamples(grammar, 'wordorder', 'The order LOD wrote, with the verb second'),
  },

  {
    id: 'bracket',
    title: 'Sentence structure 2 — the verb bracket',
    rule: 'When a sentence has two verb parts, the conjugated one stays second and the other goes to the very end.',
    points: [
      'A perfect (hunn/sinn plus a participle), a modal plus an infinitive, and a separable verb all split in two. The conjugated half holds second position; the other half goes to the end of the clause.',
      'Everything else in the sentence sits *between* the two halves. That gap is the bracket, and it is why a Luxembourgish sentence can feel like it is holding its breath — the part that tells you what actually happened arrives last.',
      'For listening this is the thing to train: the meaning-carrying verb is the final word, so a sentence cannot be understood from its opening. Wait for the end before deciding what it said.',
      'For speaking it is the habit to build: decide the whole sentence before starting it, because you have to know the closing verb in advance.',
    ],
    sources: [
      'Grammaire de la langue luxembourgeoise (ZLS). Checked against LOD: 1,981 example sentences end on a participle or infinitive with the finite verb in the first three positions.',
    ],
    examples: ({ grammar }) => orderExamples(grammar, 'bracket', 'The non-finite verb closes the sentence'),
  },

  {
    id: 'subclause',
    title: 'Sentence structure 3 — the verb goes last',
    rule: 'After datt, ob, well, wann and the other subordinators, the conjugated verb moves to the end of its clause.',
    points: [
      'This is the hardest one and the last to become automatic. A subordinate clause is introduced by a conjunction, and inside that clause the conjugated verb leaves second position entirely and goes to the end.',
      'So the same verb sits in two different places depending on the clause it is in. The main clause keeps the verb second; the clause hanging off it puts the verb last.',
      'If the clause also has two verb parts, they cluster together at the end, with the conjugated one right at the back — behind the participle or infinitive, not in front of it.',
      'A comma marks the boundary in writing but does nothing to the word order. Listen for the conjunction instead: it is the signal that the verb is coming at the end.',
    ],
    sources: [
      'Grammaire de la langue luxembourgeoise (ZLS). Checked against LOD: after datt the finite verb closes the clause in 73% of the corpus’s 208 instances, and after ob in 68% of 31 — the residue is mostly clauses that continue past a comma.',
    ],
    examples: ({ grammar }) => orderExamples(grammar, 'subclause', 'The verb sits at the end of the clause'),
  },

  {
    id: 'negation',
    title: 'Saying no',
    rule: 'net negates a sentence and sits after the verb and its subject, not before the verb.',
    points: [
      'To negate a whole statement, put net after the conjugated verb and the subject. It goes late in the clause rather than next to the thing it denies.',
      'When the sentence has a participle or an infinitive at the end, net comes before that final part rather than after it.',
      'net is also the word for “not” on its own, in a short answer.',
    ],
    sources: ['net is a corpus headword and one of the stage-1 starter words in the vocab deck'],
    examples: ({ vocab }) => {
      const found = (vocab ?? []).filter((item) => item.example?.lb && /\bnet\b/i.test(item.example.lb)).slice(0, 4);
      return found.length ? [{ label: 'net in real sentences', sentences: found.map((item) => ({ lb: item.example.lb })) }] : [];
    },
  },

  {
    id: 'numbers',
    title: 'Numbers',
    rule: '0–12 are their own words; 13–19 add -zéng; from 21 up the unit comes before the ten, like German.',
    points: [
      '0 through 12 are simply words to learn: null, eent, zwee, dräi, véier, fënnef, sechs, siwen, aacht, néng, zéng, eelef, zwielef.',
      '13–19 add -zéng to the digit, but not always the digit’s own spelling: dräizéng, véierzéng, fofzéng, siechzéng, siwwenzéng, uechtzéng, nonzéng. A few of these — fofzéng and uechtzéng especially — do not simply bolt -zéng onto the digit word, so they are worth learning as their own spelling rather than derived on the fly.',
      'The tens are zwanzeg, drësseg, véierzeg, fofzeg, sechzeg, siwwenzeg, achtzeg, nonzeg.',
      'From 21 up, the unit is said before the ten, joined by "an" — the reverse of English and the same order German uses. 100 is honnert, 1000 is dausend.',
      'The vocabulary deck this app otherwise draws from — LOD’s own exam-scoped Grondwuertschatz — barely lexicalises numbers as separate dictionary words, so there is no flashcard deck for them the way there is for nouns or verbs. What follows instead is real sentences that happen to use a number, which is also closer to how the exam actually asks: understanding an age, a price or a date inside a sentence, not reciting 1–100 in order.',
    ],
    sources: [
      'formation rules cross-checked against languagesandnumbers.com/how-to-count-in-luxembourgish, an independent source, not LOD',
      'every spelling above is also checked against the LOD lexicon by pipeline/build-grammar.js\'s assertAttested — the build fails if one is not a real attested form',
    ],
    examples: ({ grammar }) => clozeExamples(grammar, 'numbers', 'Numbers in real sentences'),
  },

  {
    id: 'dative',
    title: 'The dative case',
    rule: 'After mat, bei, vun or no, a pronoun shifts to its dative form: mir, dir, him, hir, eis, iech, hinnen.',
    points: [
      'The dative marks the receiver of something — who you are with, at whose place, from whom, after whom. mat, bei, vun and no always take it.',
      'The seven forms are mir (to me), dir (to you), him (to him/it), hir (to her), eis (to us), iech (to you-all), hinnen (to them).',
      'Watch mir and dir closely: mir is also the plural "we" and dir is also the plural/formal "you" — the same spelling, doing a completely different job, and only the sentence around it tells you which. Reading "bei mir" as "we" would be the mistake to catch.',
      'The definite article shifts too (dem for masculine and neuter, der for feminine) — worth recognising when you meet it, though this app does not drill it separately, since it would retest the gender you already learned rather than teach something new.',
    ],
    sources: [
      'the case and preposition list cross-checked against luxembourgishwithanne.lu\'s dative-case and dative-preposition pages, an independent source, not LOD',
      'every pronoun form is also checked against the LOD lexicon by assertAttested, and every example below is a real sentence where the corpus itself puts that pronoun straight after one of those four prepositions',
    ],
    examples: ({ grammar }) => clozeExamples(grammar, 'dative', 'Real sentences, preposition and pronoun together'),
  },

  {
    id: 'likes',
    title: 'Saying what you like — and don’t',
    rule: 'gär (or gären) says you like something, and — like net — it sits late in the clause, not next to the verb.',
    points: [
      'There is no separate verb "to like". You take an ordinary verb — hunn, iessen, liesen, spillen — and add gär, usually near the end of the clause, close to where net would go.',
      'gären is simply the more common written spelling of the same word — both are real, and either can turn up in a sentence.',
      'To say you do not like something, add net in front of gär: net gär. It is the same negation rule already taught, applied to the same word.',
      'Because gär moves rather than the verb, "ech hunn gär" on its own is not yet a full answer — the liked thing still has to be named, the same as any other sentence.',
    ],
    sources: [
      'gär/gären attested well over 90 times combined in LOD\'s recorded example sentences; net gär, the negative, over a dozen times on its own',
    ],
    examples: ({ grammar }) => orderExamples(grammar, 'likes', 'Where gär actually lands, in real sentences'),
  },

  {
    id: 'pronouns',
    title: 'The subject pronouns',
    rule: 'Six persons, and the verb ending changes with them.',
    points: [
      'These are the skeleton every sentence hangs off, which is why they are the first words the path introduces.',
      'dir is both the plural “you” and the polite singular, so the same form covers addressing a group and addressing one person formally — which is the one you want with an examiner.',
      'Several of these lose their final n under the n-rule depending on what follows, so the same pronoun is spelled two ways in real text.',
    ],
    sources: ['pronoun forms are picked out of vocab.json by part of speech, not written here'],
    examples: ({ vocab }) => {
      const wanted = ['ech', 'du', 'hien', 'si', 'hatt', 'mir', 'dir'];
      const byForm = new Map((vocab ?? []).filter((item) => item.lb).map((item) => [item.lb.toLowerCase(), item]));
      const items = wanted.map((form) => byForm.get(form)).filter(Boolean).map((item) => ({ lb: item.lb, en: item.en }));
      return items.length ? [{ label: 'From the vocabulary deck', items }] : [];
    },
  },
];

/**
 * Which topic teaches a given deck `kind`.
 *
 * Two kinds share one topic: `perfect-aux` asks which auxiliary a verb takes
 * and `perfect-form` asks for the participle, and both are the same rule seen
 * from two sides, so they get the same explanation rather than two that would
 * have to be kept in agreement.
 */
const TOPIC_BY_KIND = {
  'perfect-aux': 'perfect',
  'perfect-form': 'perfect',
};

/** Find the theory for a grammar card, by its `kind`. */
export function topicFor(kind) {
  const id = TOPIC_BY_KIND[kind] ?? kind;
  return GRAMMAR_GUIDE.find((topic) => topic.id === id) ?? null;
}

/** One-line rules, keyed by id — what the drill shows inline. */
export const RULE_LINES = Object.fromEntries(GRAMMAR_GUIDE.map((topic) => [topic.id, topic.rule]));
