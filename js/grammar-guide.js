/**
 * The theory. What a teacher would say before setting the exercise.
 *
 * The app drilled gender, the n-rule and adjective agreement without ever
 * stating the rules in more than a single line, and never stated the rest at
 * all — word order, the perfect, negation, plurals, questions. A drill you can
 * only pass by having already absorbed the rule somewhere else is a test, not
 * teaching.
 *
 * ## The shape of the course
 *
 * The topics used to sit in an arbitrary order, which made the guide a
 * reference to dip into rather than something you could work through. They are
 * now a numbered course, and the numbering is not invented here: it follows
 * RTL Today's *Learn Luxembourgish: Language Basics* series, levels 1 to 19,
 * which is the one free, Luxembourg-published grammar syllabus aimed at
 * exactly this audience — adults learning the language from English, in the
 * order a Luxembourgish teacher actually introduces it.
 *
 * Levels 1–19 track that series topic for topic. Levels 20–24 are this app's
 * own addition: word order, the verb bracket, subordinate clauses, negation
 * and gär. The series never covers those, and Morphosyntax is a scored
 * criterion in the Sproochentest interview, so they are taught here rather
 * than left out — grouped after the series so it stays clear which is which.
 *
 * ## What may be written here, and what may not
 *
 * The project rule is that **English is free and Luxembourgish is
 * corpus-locked**: explanations, hints and UI chrome may be written, but every
 * Luxembourgish token that ships must trace to a LOD record. So:
 *
 *   - the prose in `rule` and `points` is written here, in English;
 *   - every Luxembourgish form quoted inside it is one LOD publishes — checked
 *     against the shipped decks first and, for words the decks happen not to
 *     carry, against the full LOD form index in `content/lexicon.json`;
 *   - worked examples are not written at all — `examples(data)` pulls real
 *     sentences and real inflection-table forms out of the decks the app
 *     already ships, so an illustration cannot be an invention.
 *
 * `pipeline/test/grammar-guide.test.js` re-checks both halves of that on every
 * run: prose against the lexicon, examples against the decks. The examples are
 * held to the stricter of the two on purpose — a rule may *name* any real
 * Luxembourgish word, but an illustration has to be a sentence somebody
 * actually wrote.
 *
 * Where the syllabus asks for something the decks cannot show, the topic says
 * so in `sources` rather than filling the gap with an invention. The two that
 * matter: the series teaches countries and nationalities in level 1, and the
 * exam-scoped vocabulary the app ships does not lexicalise them; and it lists
 * a fuller set of two-way prepositions in level 16 than the decks attest.
 */

/**
 * A topic. `id` matches the grammar deck's `kind` where one exists, so a drill
 * card can find its own theory.
 *
 * @typedef {object} Topic
 * @property {string} id
 * @property {number} level     position in the course, 1-based
 * @property {string} unit      the block of levels this one belongs to
 * @property {string} title
 * @property {string} rule      one sentence — the thing to remember
 * @property {string[]} points  the teaching, a few short paragraphs
 * @property {string} [drill]   hash route that practises it, where one exists
 * @property {(data: object) => Array} examples  drawn from shipped decks only
 */

/**
 * The blocks the course is grouped into, in order. The notecards screen reads
 * these to break a 24-card list into something you can navigate.
 */
export const UNITS = [
  'Getting started',
  'Verbs and tenses',
  'Agreement',
  'The character of the language',
  'What the Sproochentest also marks',
];

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

/**
 * Every example sentence the app ships, deduplicated, in a stable order.
 *
 * The decks each carry their own example sentences and the same LOD sentence
 * can illustrate a noun, a verb and a grammar card at once, so the pool is
 * deduplicated case-insensitively — otherwise a topic that mines for a common
 * preposition shows the same sentence three times running.
 */
function sentencePool({ vocab, verbs, grammar, phrases }) {
  const seen = new Set();
  const pool = [];
  const push = (lb) => {
    if (!lb) return;
    const key = lb.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push(lb);
  };
  for (const item of vocab ?? []) push(item.example?.lb);
  for (const item of verbs ?? []) push(item.example?.lb);
  for (const item of grammar ?? []) push(item.example?.lb);
  for (const item of phrases ?? []) for (const example of item.examples ?? []) push(example.lb);
  return pool;
}

/**
 * Real sentences that show a pattern, for the topics with no deck of their own.
 *
 * Most of the course has no matching exercise kind — there is no preposition
 * deck, no possessive deck — so the illustration has to come from the sentence
 * pool instead of from a card. Mining it by pattern keeps the guarantee that
 * matters: the sentence is one LOD published, not one written to fit the rule.
 */
function matching(data, pattern, label, count = 3) {
  const hits = sentencePool(data).filter((lb) => pattern.test(lb)).slice(0, count);
  return hits.length ? [{ label, sentences: hits.map((lb) => ({ lb })) }] : [];
}

/** The six present-tense persons, as the verb deck keys them. */
const PERSONS = [
  ['p1', 'ech', 'I'],
  ['p2', 'du', 'you'],
  ['p3', 'hien / hatt', 'he / she'],
  ['p4', 'mir', 'we'],
  ['p5', 'dir', 'you (plural, or formal)'],
  ['p6', 'si', 'they'],
];

/**
 * A verb's full present table, straight out of the deck's Flexiounstabell.
 *
 * Used by the two levels that are *about* a single verb — sinn and hunn. The
 * pronoun is prepended so the row reads as something you could say, but both
 * halves are still corpus forms: the pronouns come from the same lexicon the
 * vocabulary deck does, and the verb form is LOD's own.
 */
function presentTable(verbs, infinitive, label) {
  const verb = (verbs ?? []).find((item) => item.infinitive === infinitive);
  if (!verb?.present) return [];
  const items = PERSONS.map(([key, pronoun, en]) => (verb.present[key] ? { lb: `${pronoun} ${verb.present[key]}`, en } : null)).filter(Boolean);
  return items.length ? [{ label, items }] : [];
}

/**
 * Verbs whose stem holds still, and verbs whose stem mutates in the second and
 * third person singular — the regular/irregular split the course turns on.
 *
 * Worked out from the deck's own tables rather than from a list written here,
 * so the classification cannot drift away from the forms the app shows
 * elsewhere. `p1` is the infinitive-shaped form, so its stem is the one the
 * other persons are measured against.
 */
function stemGroups(verbs, wantIrregular, label, count = 5) {
  // The auxiliaries and modals get their own levels and are irregular in ways
  // this level is not about, so they would illustrate the pattern badly.
  //
  // ginn and goen are skipped for a different reason: LOD's table gives both
  // of them "ginn" in the first person, so the two rows land next to each
  // other reading as one verb conjugated two contradictory ways. Both are
  // correct and the collision is real, but a worked example is the wrong place
  // to meet it.
  const SKIP = new Set(['sinn', 'hunn', 'ginn', 'goen', 'kënnen', 'mussen', 'sollen', 'wëllen', 'däerfen', 'wëssen']);
  const rows = [];
  for (const verb of [...(verbs ?? [])].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))) {
    const present = verb.present;
    if (!present?.p1 || !present?.p2 || !present?.p3 || !verb.en || SKIP.has(verb.infinitive)) continue;
    const stem = present.p1.replace(/en$/, '').toLowerCase();
    if (!stem) continue;
    const mutates = !present.p2.toLowerCase().startsWith(stem) || !present.p3.toLowerCase().startsWith(stem);
    if (mutates !== wantIrregular) continue;
    rows.push({ forms: [present.p1, present.p2, present.p3], en: `${verb.infinitive} — ${verb.en}` });
    if (rows.length >= count) break;
  }
  return rows.length ? [{ label, pairs: rows }] : [];
}

/**
 * Words the corpus itself shows to be borrowed: the ones whose German or
 * French translation is the same string as the Luxembourgish headword.
 *
 * Level 19 is about where the vocabulary comes from, and etymology is not
 * something LOD records — so rather than assert an origin, this shows the
 * evidence and lets it speak. An entry whose `de` is spelled exactly like its
 * `lb` is not proof of borrowing on its own, but a dozen of them together are
 * the pattern the level describes. `from` is the deck's own translation field,
 * never a word written here.
 */
function loanwords(vocab, field, label, count = 8) {
  const strip = (value) => String(value).replace(/^(?:der|die|das|le|la|les|l')\s+/i, '').trim();
  const rows = [];
  for (const item of [...(vocab ?? [])].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))) {
    const foreign = item[field];
    if (!foreign || !item.lb || item.pos !== 'SUBST') continue;
    if (strip(foreign).toLowerCase() !== item.lb.toLowerCase()) continue;
    rows.push({ lb: item.lb, en: item.en, from: strip(foreign) });
    if (rows.length >= count) break;
  }
  return rows.length ? [{ label, items: rows }] : [];
}

/**
 * A noun with its article in front, spaced the way it is written.
 *
 * d’ elides onto the noun and de/den do not, so the two cases need different
 * joining — "d’Blumm" but "de Mupp". Getting this wrong produces a single
 * run-together token that no deck attests, which is exactly what the
 * attestation test is there to catch.
 */
function withArticle(article, lb) {
  if (!article) return lb;
  return /['’]$/.test(article) ? `${article}${lb}` : `${article} ${lb}`;
}

/** Gender codes as the grammar deck writes them. */
const GENDER_ORDER = ['M', 'F', 'N'];

/**
 * The topics, in whatever order is convenient to edit. `GRAMMAR_GUIDE` below
 * sorts them into course order, so a new level can be appended to the end of
 * this literal without disturbing the ones around it.
 *
 * @type {Topic[]}
 */
const TOPICS = [
  {
    id: 'gender',
    level: 3,
    unit: 'Getting started',
    drill: '#/grammar/gender',
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
        byGender[item.gender].push({ lb: withArticle(item.article, item.lb), en: item.en });
      }
      return GENDER_ORDER.filter((code) => byGender[code].length).map((code) => ({
        label: { M: 'männlech (masculine)', F: 'weiblech (feminine)', N: 'neutral' }[code],
        items: byGender[code],
      }));
    },
  },

  {
    id: 'nrule',
    level: 2,
    unit: 'Getting started',
    drill: '#/grammar/nrule',
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
    level: 17,
    unit: 'Agreement',
    drill: '#/grammar/adjective',
    title: 'Adjective endings',
    rule: 'An adjective before a noun takes an ending that agrees with it; after the verb it stays bare.',
    points: [
      'There are two jobs an adjective can do, and only one of them changes its shape. After a verb — “the car is green” — it is a predicate adjective and it never changes: one form, every gender, singular and plural alike. That is also the form the dictionary lists.',
      'In front of a noun it is an attributive adjective, and there it takes an ending. So the useful habit is to notice the position first: after sinn or another verb, use the plain dictionary form; in front of a noun, expect an ending.',
      'Three things decide that ending — the noun’s gender from level 3, whether it is singular or plural, and the case from level 14. An adjective inside a dative phrase is spelled differently from the same adjective in a plain subject.',
      'The n-rule from level 2 then works on whatever ending came out, which is the last reason the same adjective turns up in several shapes across real sentences.',
      'This is a rule to recognise rather than to compute mid-sentence. Getting the ending wrong is a small error and rarely blocks understanding; freezing while you work it out costs far more in an interview.',
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
    level: 10,
    unit: 'Verbs and tenses',
    drill: '#/grammar/perfect-aux',
    title: 'Talking about the past',
    rule: 'The past is normally hunn or sinn plus the past participle — and this is the everyday past tense, not a formal one.',
    points: [
      'The speaking exam asks about the past directly: one of the three phases of the interview is about d’Vergaangenheet. This is the form to use for it.',
      'Most verbs take hunn. A small group — mainly verbs of movement and change of state — takes sinn instead. Which one a verb takes is a fact about that verb, so learn it with the verb, the same way you learn a noun’s article.',
      'The participle goes to the end of the clause and the auxiliary stays in second position, so the two halves of the verb end up wrapped around everything else in the sentence.',
      'Do not reach for a simple past. Unlike some neighbouring languages, this construction is the ordinary way to say what happened, in speech and in writing alike.',
      'How the participle is built depends on the verb. A regular one takes ge- in front and -t on the end. An irregular one may change its vowel, or skip the -t, or skip the ge- entirely — several patterns, none of them predictable from the infinitive, which is why the deck stores LOD’s answer for all 365 verbs rather than deriving it.',
      'Two rules do hold. A verb ending in -éieren never takes ge-, and neither does a verb built on a prefix. For a separable verb the particle goes in front of the participle, so the two halves end up joined in one word.',
      'There are two more past tenses, and neither is worth study time. The simple past survives on only a handful of verbs — you already have the useful ones from levels 8 and 9. The past-perfect is the same construction as this one with the auxiliary put into its simple past. Recognise them; keep producing the perfect.',
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
    level: 20,
    unit: 'What the Sproochentest also marks',
    drill: '#/grammar/wordorder',
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
    level: 21,
    unit: 'What the Sproochentest also marks',
    drill: '#/grammar/bracket',
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
    level: 22,
    unit: 'What the Sproochentest also marks',
    drill: '#/grammar/subclause',
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
    level: 23,
    unit: 'What the Sproochentest also marks',
    drill: '#/grammar/negation',
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
    level: 1,
    unit: 'Getting started',
    drill: '#/grammar/numbers',
    title: 'Numbers',
    rule: '0–12 are their own words; 13–19 add -zéng; from 21 up the unit comes before the ten, like German.',
    points: [
      '0 through 12 are simply words to learn: null, eent, zwee, dräi, véier, fënnef, sechs, siwen, aacht, néng, zéng, eelef, zwielef.',
      '13–19 add -zéng to the digit, but not always the digit’s own spelling: dräizéng, véierzéng, fofzéng, siechzéng, siwwenzéng, uechtzéng, nonzéng. A few of these — fofzéng and uechtzéng especially — do not simply bolt -zéng onto the digit word, so they are worth learning as their own spelling rather than derived on the fly.',
      'The tens are zwanzeg, drësseg, véierzeg, fofzeg, sechzeg, siwwenzeg, achtzeg, nonzeg.',
      'From 21 up, the unit is said before the ten, joined by "an" — the reverse of English and the same order German uses. Whether that joiner is a or an is decided by the n-rule, which is level 2.',
      'Above a hundred nothing new happens. 100 is honnert, 1000 is dausend, and the hundreds are built by putting the digit in front — the same way English does. The larger words are Millioun and Milliard, and note that Milliard is a thousand million, so it does not line up with the English word that looks like it.',
      'The one difference in writing is that Luxembourgish strings a big number together as a single unbroken word, with no "and" anywhere in it. For speaking that hardly matters; the point to carry away is simply that there is no "and" to insert.',
      'The vocabulary deck this app otherwise draws from — LOD’s own exam-scoped Grondwuertschatz — barely lexicalises numbers as separate dictionary words, so there is no flashcard deck for them the way there is for nouns or verbs. What follows instead is real sentences that happen to use a number, which is also closer to how the exam actually asks: understanding an age, a price or a date inside a sentence, not reciting 1–100 in order.',
    ],
    sources: [
      'formation rules cross-checked against languagesandnumbers.com/how-to-count-in-luxembourgish, an independent source, not LOD, and against RTL Today’s Language Basics 1 and 4 for the numbers above a hundred',
      'every spelling above is also checked against the LOD lexicon by pipeline/build-grammar.js\'s assertAttested — the build fails if one is not a real attested form',
      'the series pairs this level with countries and nationalities; the exam-scoped vocabulary the app ships does not lexicalise country names, so they are left out here rather than written in from memory',
    ],
    examples: ({ grammar }) => clozeExamples(grammar, 'numbers', 'Numbers in real sentences'),
  },

  {
    id: 'dative',
    level: 14,
    unit: 'Agreement',
    drill: '#/grammar/dative',
    title: 'The three cases — and the dative that shows',
    rule: 'Nominative and accusative look identical except on pronouns, so the dative is the only case you have to actively produce.',
    points: [
      'There are three cases, and the good news arrives immediately: two of them are spelled the same. A noun in the nominative — the one doing something — and the same noun in the accusative — the one being done to — are identical. So for nouns there is nothing to choose.',
      'The exception is pronouns, which do change: ech becomes mech, du becomes dech, mir becomes eis, dir becomes iech. English does exactly the same thing with I/me and we/us, so the idea is already familiar even if the forms are not.',
      'The dative is the one that shows. It marks the receiver of something — who you are with, at whose place, from whom, after whom — and unlike the other two it changes both the article and the pronoun.',
      'The seven dative pronouns are mir (to me), dir (to you), him (to him/it), hir (to her), eis (to us), iech (to you-all), hinnen (to them). mat, bei, vun and no always take them.',
      'Watch mir and dir closely: mir is also the plural "we" and dir is also the plural/formal "you" — the same spelling, doing a completely different job, and only the sentence around it tells you which. Reading "bei mir" as "we" would be the mistake to catch.',
      'The definite article shifts too — dem for masculine and neuter, der for feminine. That is the form you met in level 12 for naming an owner, and the one that merges with a preposition in level 16.',
      'Which prepositions force which case is level 16. This level is about what the cases are for; that one is about what triggers them.',
    ],
    sources: [
      'the case and preposition list cross-checked against luxembourgishwithanne.lu\'s dative-case and dative-preposition pages, an independent source, not LOD, and against RTL Today’s Language Basics 14 for the nominative/accusative syncretism',
      'every pronoun form is also checked against the LOD lexicon by assertAttested, and every example below is a real sentence where the corpus itself puts that pronoun straight after one of those four prepositions',
    ],
    examples: (data) => [
      ...clozeExamples(data.grammar, 'dative', 'Real sentences, preposition and pronoun together'),
      ...matching(data, /\b(?:mech|dech|iech)\b/i, 'The accusative pronouns — the one place the case is visible', 3),
    ],
  },

  {
    id: 'likes',
    level: 24,
    unit: 'What the Sproochentest also marks',
    drill: '#/grammar/likes',
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
    level: 15,
    unit: 'Agreement',
    title: 'Pronouns, all four kinds',
    rule: 'Six subject pronouns to build sentences with, plus reflexive sech and the relative words that hook one clause onto another.',
    points: [
      'The subject pronouns are the skeleton every sentence hangs off, which is why they are the first words the path introduces: ech, du, hien, hatt, si, mir, dir.',
      'dir is both the plural “you” and the polite singular, so the same form covers addressing a group and addressing one person formally — which is the one you want with an examiner. Level 6 is about that choice.',
      'Several of these lose their final n under the n-rule depending on what follows, so the same pronoun is spelled two ways in real text.',
      'sech is the reflexive — the one that turns an action back on whoever is doing it. It covers he, she, they and the polite you alike, and it is a single form for all of them, so it is far less work than the English -self family.',
      'The relative pronouns hook a second clause onto a noun, and they agree with that noun: deen for masculine, déi for feminine, dat for neuter, and déi again for the plural regardless of gender. They also send the verb to the end of their clause — that is level 22.',
      'There is a fourth group with no English equivalent at all: the partitive der and där, which stand in for a quantity already mentioned. You will hear them long before you need to produce them.',
    ],
    sources: ['pronoun forms are picked out of vocab.json by part of speech, not written here'],
    examples: (data) => {
      const wanted = ['ech', 'du', 'hien', 'si', 'hatt', 'mir', 'dir'];
      const byForm = new Map((data.vocab ?? []).filter((item) => item.lb).map((item) => [item.lb.toLowerCase(), item]));
      const items = wanted.map((form) => byForm.get(form)).filter(Boolean).map((item) => ({ lb: item.lb, en: item.en }));
      return [
        ...(items.length ? [{ label: 'The subject pronouns, from the vocabulary deck', items }] : []),
        ...matching(data, /\bsech\b/i, 'sech — the action turns back on the doer', 3),
        ...matching(data, /,\s*(?:deen|déi|dat)\b/i, 'A relative pronoun opening a second clause', 3),
      ];
    },
  },

  // ---------------------------------------------------------------------
  // Levels the series covers that the app had no theory for at all. These
  // have no exercise kind behind them, so their examples are mined out of
  // the sentence pool rather than out of a deck — see `matching`.
  // ---------------------------------------------------------------------

  {
    id: 'opbei',
    level: 4,
    unit: 'Getting started',
    title: 'op or bei — saying where',
    rule: 'op goes with open places, towns and stations; bei goes with buildings and with people.',
    points: [
      'English uses “to” for all of it — to Kirchberg, to the station, to the supermarket, to the doctor. Luxembourgish splits that in two, and the split is not one you can feel your way to from English.',
      'op is for open places and named towns: a square, a district, a town you are travelling to. It also covers the transport buildings you pass *through* rather than visit — the station and the airport take op.',
      'bei is for buildings you go into, and for people. Going to the supermarket, the post office, the swimming pool, or round to someone’s house is all bei.',
      'bei is also the one that merges with the article: bei plus the masculine or neuter dative gives beim, which is what you will actually hear.',
      'Both take a case, and that is level 16 — op and bei are both two-way prepositions, so movement towards takes the accusative and sitting still takes the dative.',
      'This is a distinction that arrives by ear rather than by rule. Read the sentences below more than once; the pattern sticks faster than the explanation does.',
    ],
    sources: [
      'the op/bei split is taken from RTL Today’s Language Basics 3, an independent source, not LOD',
      'every sentence below is one LOD published — 105 in the shipped decks put op in front of a place, and 104 use bei or beim',
    ],
    examples: (data) => [
      ...matching(data, /\bop\s+(?:d'|de[nmr]?)\s*\w/i, 'op — places, and the stations you pass through', 3),
      ...matching(data, /\bbei\s+\w/i, 'bei — buildings, and people', 3),
      ...matching(data, /\bbeim\s+\w/i, 'beim — bei with the article already merged in', 2),
    ],
  },

  {
    id: 'ordinals',
    level: 5,
    unit: 'Getting started',
    title: 'First, second, third',
    rule: 'The first three are their own words; from four up you add -t, and from twenty up you add -st.',
    points: [
      'Ordinals are the numbers you need for dates and floors and places in a queue, and they are formed off the counting numbers from level 1 rather than learned separately.',
      'éischt, zweet and drëtt are irregular and simply have to be memorised — the same three that are irregular in English.',
      'From four to nineteen, add -t to the number: véiert, fënneft, and so on down the list.',
      'From twenty up, add -st instead: zwanzegst, and the same for every compound built on it.',
      'On top of that ending comes an agreement ending, because an ordinal in front of a noun is an attributive adjective like any other — so the word you actually say is éischte or éischten depending on the noun and on what follows. That is level 17, and the n-rule from level 2 is doing the last part of it.',
    ],
    sources: [
      'the -t / -st formation rule is taken from RTL Today’s Language Basics 5, an independent source, not LOD',
      'the sentences below are LOD’s own; the decks attest éischt, zweet and drëtt inside real sentences but do not lexicalise the ordinals as dictionary entries, so there is no ordinal deck to drill',
    ],
    examples: (data) => matching(data, /\b(?:d[eé]n?|dat|déi)\s+(?:éischt|zweet|drëtt)\w*\b/i, 'Ordinals in real sentences, agreement ending and all', 5),
  },

  {
    id: 'formal',
    level: 6,
    unit: 'Getting started',
    title: 'du or Dir — who you are talking to',
    rule: 'du for friends and family, Dir for strangers, officials and anyone senior — and Dir takes the plural verb form.',
    points: [
      'English lost this distinction and uses “you” for everyone, so it is a choice an English speaker has to make consciously every time rather than one that comes for free.',
      'du is for a friend, a relative, a child — anyone you would be informal with. Dir is for a stranger, a public official, someone senior at work. In writing Dir is capitalised, which is how you tell it apart from the plural dir.',
      'The verb follows the pronoun: Dir takes the same form as the plural “you”, so choosing the polite pronoun also means reaching for a different ending. The pairs below are the ones worth having ready.',
      'The possessives change too — the informal däin family against the formal Ären family. Level 12 covers how those agree.',
      'For the Sproochentest this is not optional politeness: the interview is with an examiner you have never met, so Dir is the register the whole conversation should be in. Getting it wrong with a police officer, as the series drily notes, lands rather worse than getting it wrong with a friend.',
    ],
    sources: [
      'the register rule is taken from RTL Today’s Language Basics 6, an independent source, not LOD',
      'every pair below is LOD’s own Flexiounstabell for that verb — the second-person singular against the second-person plural, not written here',
    ],
    examples: ({ verbs }) => {
      // sinn and hunn lead because they are the two you will actually need in
      // the polite register — "are you", "have you". After them, ordinary
      // verbs; ginn and goen are skipped for the first-person collision
      // described in `stemGroups`, and the modals because LOD's one-word gloss
      // for them ("to be responsible for" for kënnen) would confuse a row that
      // is about the ending rather than the meaning.
      const SKIP = new Set(['ginn', 'goen', 'kënnen', 'mussen', 'sollen', 'wëllen', 'däerfen', 'wëssen']);
      const byRank = [...(verbs ?? [])].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
      const ordered = [
        ...['sinn', 'hunn'].map((name) => byRank.find((verb) => verb.infinitive === name)).filter(Boolean),
        ...byRank.filter((verb) => !SKIP.has(verb.infinitive) && verb.infinitive !== 'sinn' && verb.infinitive !== 'hunn'),
      ];
      const rows = [];
      for (const verb of ordered) {
        if (!verb.present?.p2 || !verb.present?.p5 || !verb.en) continue;
        if (verb.present.p2 === verb.present.p5) continue;
        rows.push({ forms: [verb.present.p2, verb.present.p5], en: `${verb.infinitive} — ${verb.en}` });
        if (rows.length >= 6) break;
      }
      return rows.length ? [{ label: 'du … / Dir … — the same verb, both registers', pairs: rows }] : [];
    },
  },

  {
    id: 'present',
    level: 7,
    unit: 'Verbs and tenses',
    title: 'The present tense',
    rule: 'Drop -en from the infinitive and add the person ending; in an irregular verb the stem vowel also mutates in du and hien / hatt.',
    points: [
      'An infinitive is a stem plus -en. Take the -en off and you have the piece every other form is built on.',
      'The endings are the same for every verb: -en for ech, -s for du, -t for hien / hatt, -en for mir, -t for dir, -en for si. Learn them once and they carry across the whole language.',
      'A regular verb stops there — its stem never changes, so all six forms are the stem plus an ending and nothing else.',
      'An irregular verb mutates its stem vowel in exactly two places: the du form and the hien / hatt form. Everywhere else it looks regular. That is the whole of the irregularity for most verbs, and it is why those two forms are the ones to check when you meet a new verb.',
      'You cannot tell which kind a verb is by looking at the infinitive. The deck stores LOD’s full table for all 365 verbs, so the answer is always a tap away rather than a guess.',
      'A doubled vowel in some forms is spelling, not a different word: a long vowel gets written twice when two or more consonants follow it, so the same stem can look longer in one cell of the table than another.',
    ],
    sources: [
      'the regular/irregular split is taken from RTL Today’s Language Basics 7, an independent source, not LOD',
      'the classification below is computed from LOD’s own Flexiounstabellen for the 365 verbs in the deck — 196 keep the stem, 169 mutate it — and not from a list written here',
    ],
    examples: ({ verbs }) => [
      ...stemGroups(verbs, false, 'Regular — ech / du / hien, one unchanging stem'),
      ...stemGroups(verbs, true, 'Irregular — the vowel shifts in du and hien'),
    ],
  },

  {
    id: 'sinn',
    level: 8,
    unit: 'Verbs and tenses',
    drill: '#/verbs',
    title: 'sinn — to be',
    rule: 'Wholly irregular, the most-used verb in the language, and one of the few with a simple past still in daily use.',
    points: [
      'sinn is irregular in a way no pattern predicts, so it is learned as six flat facts rather than derived. It is worth the effort: you cannot say who you are, where you are from or how old you are without it.',
      'Note that three of the six persons are simply sinn again — ech, mir and si all take it. Only du, hien / hatt and dir have their own forms, so there are really three shapes to memorise, not six.',
      'It is also an auxiliary: the perfect of a movement verb is built on sinn rather than hunn, which is level 10.',
      'And it is one of the handful of verbs that kept a simple past. Most of the language forms the past with an auxiliary plus a participle, but war and its forms are ordinary everyday speech, not a literary register — so this is a past tense worth having.',
      'The past forms follow the same six-person pattern: war for ech and hien / hatt, waars for du, waren for mir and si, waart for dir.',
    ],
    sources: [
      'the present table is LOD’s own Flexiounstabell for sinn',
      'the simple-past forms are attested in the shipped decks’ example sentences — war in 51 of them, waren in 17',
    ],
    examples: (data) => [
      ...presentTable(data.verbs, 'sinn', 'The present, from LOD’s table'),
      ...matching(data, /\bwar\b/i, 'war — the simple past, in real sentences', 3),
      ...matching(data, /\bwaren\b/i, 'waren — the plural', 2),
    ],
  },

  {
    id: 'hunn',
    level: 9,
    unit: 'Verbs and tenses',
    drill: '#/verbs',
    title: 'hunn — to have',
    rule: 'The other essential irregular verb, and the auxiliary behind most of the past tense.',
    points: [
      'hunn is the twin of level 8 and just as irregular. Between them, sinn and hunn account for a large share of everything you will say.',
      'Again three of the six persons collapse into one form — ech, mir and si all take hunn — leaving du, hien / hatt and dir as the forms to learn.',
      'Its main structural job is as the auxiliary of the perfect: the great majority of verbs form their past with hunn plus a participle. Level 10 is about which verbs take which.',
      'Like sinn, it kept a simple past in everyday use: hat, and haten in the plural. You will hear both constantly.',
      'Watch the overlap with level 6: hues is the du form and hutt is the Dir form, so the register choice and the verb form arrive together.',
    ],
    sources: [
      'the present table is LOD’s own Flexiounstabell for hunn',
      'the simple-past forms are attested in the shipped decks’ example sentences — hat in 47 of them, haten in 13',
    ],
    examples: (data) => [
      ...presentTable(data.verbs, 'hunn', 'The present, from LOD’s table'),
      ...matching(data, /\bhat\b/i, 'hat — the simple past, in real sentences', 3),
      ...matching(data, /\bhaten\b/i, 'haten — the plural', 2),
    ],
  },

  {
    id: 'future',
    level: 11,
    unit: 'Verbs and tenses',
    title: 'The future, which barely exists',
    rule: 'There is no future tense — use the present and let a time word carry the future meaning.',
    points: [
      'This is the rare level where the answer is that there is nothing to learn. Luxembourgish has no proper future tense, so there is one fewer conjugation than in most languages you might have studied.',
      'To talk about the future, use the present and add something that fixes the time — tomorrow, next year, in March. The verb does not change at all; the time word does the work.',
      'That means the time word is load-bearing rather than decorative. Take it away and the sentence snaps back to meaning now, which is not what happens in English — “I run a marathon” and “I am going to run a marathon” stay distinct in English without any time word at all.',
      'There is an optional auxiliary, wäert, but it does not mean plain future. It carries a shade of inference — something you expect to happen because of what you have heard, rather than something you know first-hand. Sometimes it even reads as scepticism.',
      'So the useful advice for the exam is: do not reach for wäert. Use the present, name the time, and you are saying exactly what you mean.',
      'Careful reading the corpus: wäert is also an ordinary adjective meaning “worth”, and it is spelled the same. The sentences below are the auxiliary.',
    ],
    sources: [
      'the analysis is taken from RTL Today’s Language Basics 11, an independent source, not LOD',
      'wäert appears as the future auxiliary in only a handful of the shipped decks’ sentences, which is itself evidence for how marginal the construction is',
    ],
    examples: (data) => matching(data, /\bwäert\b\s+\p{L}/iu, 'wäert as the auxiliary — inference, not plain future', 3),
  },

  {
    id: 'possessive',
    level: 12,
    unit: 'Agreement',
    title: 'Whose it is',
    rule: 'A possessive agrees with the thing owned, not the owner — and to name the owner you put them in the dative and add a possessive after.',
    points: [
      'This is the level where gender from level 3 starts earning its keep. “My” is not one word: it is mäi before a masculine or neuter noun and meng before a feminine one, so you cannot choose it until you know the noun’s gender.',
      'The same three-way split runs through the whole set — däi / deng for your, säi / seng for his, hir for her, eise / eis for our, äre / är for your (plural or formal), hire / hir for their.',
      'Crucially the agreement is with the thing owned, not with the owner. A woman’s car still takes the masculine possessive, because Auto is masculine. Coming from English, this is the habit to break.',
      'To name a specific owner there is no possessive -s. Instead the owner goes into the dative — dem for masculine and neuter, der for feminine — and then a possessive follows, agreeing with the thing owned.',
      'Read literally that structure is “the Fernando his book”, which sounds odd in English but is simply how the language builds it. Remember from level 1 that a first name normally carries its article anyway, so the dem or der is not an extra word appearing from nowhere.',
      'This is the construction to recognise before you try to produce it — it turns up constantly in speech, and hearing it as one unit is most of the battle.',
    ],
    sources: [
      'the agreement table and the dative-plus-possessive structure are taken from RTL Today’s Language Basics 12, an independent source, not LOD',
      'the sentences below are LOD’s own; the shipped decks attest the possessive-with-a-named-owner structure in 11 sentences with dem and 7 with der',
    ],
    examples: (data) => [
      ...matching(data, /\b(?:mäi|mäin|meng)\s+\p{L}/iu, 'The possessive agrees with the thing owned', 3),
      ...matching(data, /\bdem\s+\p{L}+\s+(?:säi|säin|seng)\b/iu, 'dem + owner + säi — “the Fernando his book”', 3),
      ...matching(data, /\bder\s+\p{L}+\s+(?:hir|hire|hiren)\b/iu, 'der + owner + hir — the feminine version', 2),
    ],
  },

  {
    id: 'comparative',
    level: 13,
    unit: 'Agreement',
    title: 'More, less, most',
    rule: 'méi … wéi for more-than, esou … wéi for as-as, net esou … wéi for less-than, and -sten for the most.',
    points: [
      'Luxembourgish builds almost every comparative with méi in front of the adjective, where English has two options and picks between them — “faster” but “more polite”. Here it is méi for both, so when in doubt use méi.',
      'The than-word is wéi. So the frame is méi + adjective + wéi + the thing compared, and it does not change shape whatever you put in it.',
      'Equality uses the same wéi with esou in front: esou + adjective + wéi. Negate that with net and you have less-than, without needing a separate word for “less”.',
      'The superlative adds -sten to the adjective, usually with am in front of it. That ending then meets the n-rule from level 2, so the final n comes and goes depending on the next word.',
      'The exceptions are few and worth knowing flat: gutt goes to besser and then am beschten; vill goes to méi and then am meeschten; wéineg goes to manner and then am mannsten. Those are the only ones that will catch you out.',
      'For the interview this is directly useful — comparing two things is one of the easiest ways to say something with content rather than reciting a memorised sentence.',
    ],
    sources: [
      'the comparative, equality and superlative frames are taken from RTL Today’s Language Basics 13, an independent source, not LOD',
      'the shipped decks attest méi in 71 example sentences, besser in 12 and am beschten in 3; the regular -sten superlative is rare enough in them that only the irregular forms can be illustrated from real sentences',
    ],
    examples: (data) => [
      ...matching(data, /\bméi\b/i, 'méi — the everyday comparative', 3),
      ...matching(data, /\bbesser\b/i, 'besser — the one irregular you will use daily', 2),
      ...matching(data, /\bam beschten\b/i, 'am beschten — its superlative', 2),
    ],
  },

  {
    id: 'prepositions',
    level: 16,
    unit: 'Agreement',
    title: 'Prepositions and the case they take',
    rule: 'Some prepositions always take the accusative, more always take the dative, and a third group takes either — accusative for movement, dative for position.',
    points: [
      'A preposition in Luxembourgish does not just sit in front of a noun, it governs it: the article after it changes according to which case that preposition demands. This is the level that ties levels 3, 14 and 17 together.',
      'Always accusative, and it is a short list worth memorising outright: bis, duerch, ëm, fir, géint, ouni, ronderëm.',
      'Always dative, a longer list: aus, ausser, bannent, mat, no, säit, trotz, vun, wéinst, zënter, zu.',
      'The third group takes both, and the choice carries meaning. Movement towards something takes the accusative; being somewhere takes the dative. an, bei, ënner, iwwer, niewent, op, un, virun and tëschent all work this way — the same words from level 4, now with the rule behind them.',
      'So the case is not decoration: it is what tells a listener whether you are going to the doctor or already sitting in the waiting room. Same preposition, different ending.',
      'In the dative, a preposition usually merges with a masculine or neuter article rather than staying separate: an becomes am, op becomes um, vun becomes vum, mat becomes mam, no becomes nom, bei becomes beim. These merged forms are what you will actually hear, so learn them as words in their own right.',
    ],
    sources: [
      'the three lists and the movement/position rule are taken from RTL Today’s Language Basics 16, an independent source, not LOD',
      'every preposition named above is attested in the shipped decks; the series lists a few more two-way prepositions than the decks carry, and those are left unnamed here rather than written in from memory',
    ],
    examples: (data) => [
      ...matching(data, /\b(?:duerch|géint|ouni|ronderëm)\s+\p{L}/iu, 'Always accusative', 3),
      ...matching(data, /\b(?:aus|ausser|trotz|wéinst|zënter)\s+\p{L}/iu, 'Always dative', 3),
      ...matching(data, /\b(?:am|um|vum|mam|nom|beim)\s+\p{L}/iu, 'Merged with the article — the forms you actually hear', 4),
    ],
  },

  {
    id: 'wordbuilding',
    level: 18,
    unit: 'The character of the language',
    title: 'Small words, old cases, and what Luxembourgers do with names',
    rule: 'A -chen ending makes a thing small or fond; the genitive has all but vanished, but it survives in how surnames are used.',
    points: [
      'Three small topics that each explain something you will meet often, none of them big enough for a level of its own.',
      'The diminutive marks something as small, young or fondly regarded, and it is formed with -chen or -elchen. Some words exist mainly in that form — the everyday word for a girl or for a bread roll is already a diminutive.',
      'Forming one usually shifts the stem vowel as well as adding the ending, which is why a diminutive can look less like its base word than you would expect.',
      'There is also an -i ending, used almost only for terms of endearment. It is affectionate rather than grammatical.',
      'The genitive is the fourth case, and it has effectively disappeared — you will only meet it in a few fixed expressions about the start or end of a period, and in one or two frozen phrases.',
      'But it left a trace that is very much alive: Luxembourgers routinely put the surname before the first name and add a genitive ending to it, so the family name becomes possessive — the equivalent of saying “Smith’s John”. Recognising this is what lets you follow a conversation about people, and using it is one of the fastest ways to sound less like a textbook.',
    ],
    sources: [
      'the diminutive, genitive and surname-inversion topics are taken from RTL Today’s Language Basics 18, an independent source, not LOD',
      'the diminutives below are nouns in the shipped vocabulary deck, selected by their ending rather than listed here',
    ],
    examples: ({ vocab }) => {
      const items = (vocab ?? [])
        .filter((item) => item.pos === 'SUBST' && /(?:el)?chen$/i.test(item.lb ?? '') && item.en)
        .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
        .slice(0, 8)
        .map((item) => ({ lb: withArticle(item.article, item.lb), en: item.en }));
      return items.length ? [{ label: 'Diminutives already in the vocabulary deck', items }] : [];
    },
  },

  {
    id: 'origins',
    level: 19,
    unit: 'The character of the language',
    title: 'Where the words come from',
    rule: 'The grammar and most of the vocabulary are Germanic; a large, very visible layer is borrowed straight from French.',
    points: [
      'This level is not a rule to apply but a map to hold, and it pays off directly: knowing where a word is likely to have come from is what lets you guess one you have never met.',
      'The grammar and the core vocabulary are Germanic, and a great many words are recognisably German with Luxembourgish spelling. If you know any German, this is an enormous head start — and a fair number of words are spelled identically.',
      'The French layer is what most distinguishes Luxembourgish from the neighbouring Moselle Franconian dialects. Some French words are used exactly as they are, spelling and all; others have been respelled to Luxembourgish conventions.',
      'There are even compounds built from one German and one French word, or from two French words joined by German rules — which is a fair picture of the language as a whole.',
      'English contributes mostly in technology and business, and mostly unchanged. Watch for one word borrowed with a meaning it never had in English: a mobile phone is a Handy.',
      'A smaller, more colourful layer comes from Yenish, the jargon of a travelling community historically settled in and around Luxembourg City. Those words are informal and worth recognising rather than using.',
      'A caution about the lists below: identical spelling is evidence of borrowing, not proof of it, and LOD does not record etymologies. What you are seeing is the pattern, drawn from the dictionary’s own translations.',
    ],
    sources: [
      'the account of the borrowing layers is taken from RTL Today’s Language Basics 19, an independent source, not LOD',
      'the words below are selected by comparing each entry’s Luxembourgish headword with LOD’s own German and French translations of it — 411 entries match the German exactly and 192 match the French, and the source word shown is the dictionary’s, not one written here',
    ],
    examples: ({ vocab }) => [
      ...loanwords(vocab, 'de', 'Spelled exactly as in German'),
      ...loanwords(vocab, 'fr', 'Spelled exactly as in French'),
    ],
  },
];

/**
 * The course, in the order it should be worked through.
 *
 * Sorted rather than written in order so that `TOPICS` above stays easy to
 * edit — inserting a level in the middle would otherwise mean moving every
 * entry after it.
 */
export const GRAMMAR_GUIDE = [...TOPICS].sort((a, b) => a.level - b.level);

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
  // The listening cards are the numbers topic heard rather than read — plus
  // the months, weekdays and clock words, which are the same skill in the same
  // place: catching a quantity or a date as it goes past.
  heard: 'numbers',
};

/** Find the theory for a grammar card, by its `kind`. */
export function topicFor(kind) {
  const id = TOPIC_BY_KIND[kind] ?? kind;
  return GRAMMAR_GUIDE.find((topic) => topic.id === id) ?? null;
}

/** One-line rules, keyed by id — what the drill shows inline. */
export const RULE_LINES = Object.fromEntries(GRAMMAR_GUIDE.map((topic) => [topic.id, topic.rule]));
