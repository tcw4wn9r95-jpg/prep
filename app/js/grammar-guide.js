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
    title: 'Where the verb goes',
    rule: 'The conjugated verb is the second element of a main clause — whatever comes first.',
    points: [
      'Second *element*, not second word. If the sentence opens with a time expression or any other phrase, that whole phrase is the first element and the verb still follows it, before the subject.',
      'That is why the subject often turns up after the verb. It has not moved for emphasis; the verb simply holds its place.',
      'In a question with no question word, the verb comes first instead. With a question word, the question word is the first element and the verb follows it.',
      'Anything that is not the conjugated verb — a past participle, an infinitive, a separated prefix — goes to the end of the clause.',
    ],
    sources: ['illustrated with the Phrases deck, whose frames are corpus-attested'],
    examples: ({ phrases }) => {
      const chosen = (phrases ?? [])
        .filter((phrase) => phrase.example?.lb)
        .slice(0, 4)
        .map((phrase) => ({ lb: phrase.example.lb, frame: phrase.lb, en: phrase.en }));
      return chosen.length ? [{ label: 'Real sentences from the Phrases deck', sentences: chosen }] : [];
    },
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
