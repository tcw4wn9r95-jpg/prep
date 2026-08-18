/**
 * The fifteen sentence functions the Arcade teaches.
 *
 * These are *functions*, not translations. "I like ___" is one idea in
 * English and several different shapes across languages — Spanish inverts it
 * (`me gusta`), and Luxembourgish does not have a verb for it at all: you take
 * an ordinary verb and drop `gär` in late, near where `net` goes. So a pattern
 * here names what you are trying to *do* with a sentence, and the material
 * under it is whatever the corpus actually uses to do that.
 *
 * ## Where the Luxembourgish comes from
 *
 * Nothing here is authored. A pattern points at material the app already
 * ships and proves:
 *
 *   `frames` — `lb` strings from the phrase deck. Every one is attested at
 *              least eight times in LOD's recorded examples, and
 *              build-phrases.js fails the build otherwise.
 *   `kinds`  — exercise kinds from the grammar deck, each mined from real
 *              corpus sentences by build-grammar.js.
 *   `words`  — single words, looked up in the vocabulary deck by lemma.
 *
 * `arcade.test.js` re-checks all three against the shipped files, so a
 * pattern cannot quietly start pointing at something that does not exist.
 *
 * ## Where the corpus could not answer
 *
 * Three of the fifteen ask for something LOD's example sentences do not
 * contain often enough to ship as a frame, and `gap` says so on the screen
 * rather than the app inventing one:
 *
 *   - "My name is ___" — `ech heeschen` occurs 0 times. Naming is taught
 *     through `ech sinn` / `dat ass` instead, which is what the corpus uses.
 *   - "Where is ___?" — `wou ass` occurs twice, below the threshold. Location
 *     is taught from the answering side (`hei ass`, `do ass`) plus the
 *     question word itself.
 *   - "There isn't ___" — `et gëtt keen` occurs 0 times. The negative is
 *     taught as the negation rule, which is where `net` and `keen` are
 *     actually drilled.
 *
 * Saying that out loud is the point: a learner who is told "the corpus does
 * not write it this way" has learned something true, where a learner handed an
 * invented frame has learned something wrong.
 */

/** @typedef {{id:string,title:string,ask:string,frames?:string[],kinds?:string[],words?:string[],gap?:string}} Pattern */

/** @type {Pattern[]} */
export const PATTERNS = [
  {
    id: 'naming',
    title: 'Naming',
    ask: 'This is ___ · I am ___',
    frames: ['ech sinn', 'dat ass', 'et ass', 'hien ass', 'du bass', 'mir sinn'],
    gap: 'Luxembourgish says “ech sinn …” where English often says “my name is”. LOD’s examples never write “ech heeschen”, so it is not drilled here.',
  },
  {
    id: 'existence',
    title: 'Existence',
    ask: 'There is ___ · Is there ___?',
    frames: ['et gëtt', 'gëtt et'],
    gap: 'The negative (“there isn’t”) has no fixed frame in the corpus — it is built with net or keen, which the Negation pattern drills.',
  },
  {
    id: 'having',
    title: 'Having',
    ask: 'I have ___ · Do you have ___?',
    frames: ['ech hunn', 'du hues', 'hien huet', 'mir hunn', 'si hunn', 'hues du'],
  },
  {
    id: 'wanting',
    title: 'Wanting',
    ask: 'I want ___ · I would like ___',
    // The polite conditional is worth meeting early: `ech hätt` is how you ask
    // for something in a shop without sounding blunt.
    frames: ['ech wëll', 'ech hätt', 'ech géif'],
  },
  {
    id: 'requesting',
    title: 'Requesting',
    ask: 'Can I have ___? · Could you ___?',
    frames: ['kann ech', 'kanns du', 'hues du'],
  },
  {
    id: 'ability',
    title: 'Ability & permission',
    ask: 'I can ___ · May I ___?',
    frames: ['ech kann', 'du kanns', 'kann ech'],
  },
  {
    id: 'obligation',
    title: 'Need & obligation',
    ask: 'I have to ___ · I need to ___',
    frames: ['ech muss', 'du muss', 'mir mussen'],
  },
  {
    id: 'liking',
    title: 'Liking',
    ask: 'I like ___ · I don’t like ___',
    // No frame, on purpose: there is no verb "to like" to build one from. The
    // whole pattern is where gär lands in the clause, which is what the likes
    // deck drills.
    kinds: ['likes'],
    gap: 'There is no verb “to like”. You take an ordinary verb and add gär late in the clause — and net gär for the negative.',
  },
  {
    id: 'opinion',
    title: 'Opinion',
    ask: 'I think that ___',
    frames: ['ech fannen', 'ech weess'],
    kinds: ['subclause'],
  },
  {
    id: 'location',
    title: 'Location',
    ask: 'It’s here · over there · near ___',
    frames: ['hei ass', 'do ass'],
    words: ['wou', 'hei', 'do', 'no'],
    gap: '“Wou ass …?” is barely written in the corpus, so this drills the answering side and the question word on its own.',
  },
  {
    id: 'questions',
    title: 'Question words',
    ask: 'who · what · where · when · why · how',
    words: ['wien', 'wat', 'wou', 'wéini', 'firwat', 'wéi'],
    frames: ['wat ass', 'wat fir'],
  },
  {
    id: 'quantity',
    title: 'Quantity & price',
    ask: 'How much is it? · I want two ___',
    frames: ['wéi vill'],
    kinds: ['numbers'],
  },
  {
    id: 'negation',
    title: 'Negation',
    ask: 'not ___',
    kinds: ['negation'],
    words: ['net', 'keen', 'keng'],
  },
  {
    id: 'time',
    title: 'Time reference',
    ask: 'I went ___ · I will ___',
    frames: ['ech war', 'ech hat', 'mir haten', 'ech wäert'],
    kinds: ['perfect-form'],
  },
  {
    id: 'connectors',
    title: 'Connectors',
    ask: 'and · but · because · so · then',
    words: ['an', 'awer', 'well', 'dann', 'och'],
    frames: ['well ech', 'wann ech', 'wéi ech'],
  },
];


/**
 * What each function actually does in Luxembourgish, for the player.
 *
 * Kept beside the material rather than inside it because these are two
 * different jobs: the pattern above says which decks a round draws on, this
 * says what the round is teaching. A test asserts the two lists cover exactly
 * the same ids, so they cannot drift apart.
 *
 * The first version of this shared one generic brief across all fifteen — the
 * "rule" restated the title ("This round is about one thing a sentence has to
 * do: not ___") and every "worth knowing" listed the card formats instead of
 * any Luxembourgish. A round about negation has to teach negation.
 *
 * `guide` names a topic in `grammar-guide.js` where one covers this ground.
 * The brief links to it rather than repeating it, so the long explanation
 * lives in exactly one place.
 */
export const TEACHING = {
  naming: {
    rule: 'sinn is the verb for what something is, and it is irregular in every person — ech sinn, du bass and hien ass share no shape at all.',
    points: [
      'dat ass points at a thing. ech sinn introduces a person.',
      'Where English says “my name is”, Luxembourgish normally says ech sinn and then the name.',
    ],
    guide: 'sinn',
  },
  existence: {
    rule: 'et gëtt covers both “there is” and “there are” — it does not change when the thing is plural.',
    points: [
      'Put the verb first and it becomes a question: gëtt et …? is “is there …?”.',
      'That swap is how yes/no questions are made generally, not something special to this phrase.',
    ],
  },
  having: {
    rule: 'hunn is the other verb you cannot avoid, and it is irregular too: ech hunn, du hues, hien huet.',
    points: [
      'Its plural forms are the infinitive again — mir hunn, si hunn.',
      'Swap the pronoun and the verb to ask: hues du …? is “do you have …?”.',
    ],
    guide: 'hunn',
  },
  wanting: {
    rule: 'ech wëll is a blunt “I want”. To ask for something politely you move to a conditional — ech hätt or ech géif.',
    points: [
      'ech hätt is the conditional of hunn and ech géif of ginn. Both soften a request the way English “would” does.',
      'Which one you open with matters more than the words after it: ech wëll can land as a demand where ech hätt does not.',
    ],
  },
  requesting: {
    rule: 'A request is a yes/no question, and those start with the verb: kann ech …?, kanns du …?, hues du …?',
    points: [
      'A statement is pronoun then verb (ech kann). A question is the two swapped (kann ech).',
      'Who you are talking to changes the verb as well — du forms for people you know, Dir forms for strangers and officials.',
    ],
    guide: 'formal',
  },
  ability: {
    rule: 'kënnen does two jobs at once: “can” for being able to, and “may” for being allowed to.',
    points: [
      'Its singular stem changes — ech kann, du kanns — while the plural goes back to the infinitive, mir kënnen.',
      'Put the verb first and the same words become a request for permission: kann ech …?',
    ],
    guide: 'present',
  },
  obligation: {
    rule: 'mussen is “must” and “have to” together — there is no separate pair of verbs the way English has.',
    points: [
      'The singular is flat: ech muss, du muss and hien muss are all the same word.',
      'The plural returns to the infinitive, mir mussen, which is the usual shape.',
    ],
    guide: 'present',
  },
  liking: {
    rule: 'There is no verb meaning “to like”. You take an ordinary verb and drop gär in late, near where net goes.',
    points: [
      'So “I like reading” is built from the verb for reading plus gär — not from a verb for liking.',
      'The negative is net gär, in that same late position.',
      'This is the one to learn as a shape rather than a translation: English, Spanish and Luxembourgish each do it differently.',
    ],
    guide: 'likes',
  },
  opinion: {
    rule: 'ech fannen and ech weess open an opinion, and what follows them is a subclause — where the verb moves to the end.',
    points: [
      'That end-of-clause verb is the biggest word-order difference from English, and it is worth over-practising.',
      'The same move happens after datt, ob, well and wann.',
    ],
    guide: 'subclause',
  },
  location: {
    rule: 'hei is “here” and do is “there”, and either can open the sentence: hei ass …, do ass …',
    points: [
      'Opening with hei or do pushes the verb into second place, so it lands before the subject.',
      'wou is “where”, but LOD barely writes wou ass — so this drills answering, and the question word on its own.',
    ],
    guide: 'opbei',
  },
  questions: {
    rule: 'Six words carry most questions: wien, wat, wou, wéini, firwat and wéi.',
    points: [
      'The question word goes first and the verb comes straight after it.',
      'wat fir is “what kind of” — two words doing one job.',
      'wéi is also “as” or “like” outside a question, which is why the dictionary glosses it that way here.',
    ],
  },
  quantity: {
    rule: 'wéi vill is both “how much” and “how many” — the noun after it decides which one you mean.',
    points: [
      '0 to 12 are their own words, 13 to 19 add -zéng, and from 21 up the unit comes before the ten.',
      'That last one reverses English: you say the ones digit first, then the tens.',
    ],
    guide: 'numbers',
  },
  negation: {
    rule: 'net negates a sentence and sits after the verb and its object — not in front of the verb the way English puts “not”.',
    points: [
      'For “no” or “not a”, use keen before a masculine or neuter noun and keng before a feminine or plural one.',
      'net takes the same late slot that gär takes for liking, so the two rules reinforce each other.',
    ],
    guide: 'negation',
  },
  time: {
    rule: 'The past is normally hunn or sinn plus a participle. ech war and ech hat are the exceptions — those two verbs kept a real simple past.',
    points: [
      'Being short is exactly why they are used constantly, so they are worth knowing cold.',
      'There is no future tense to learn. ech wäert exists, but the present plus a time word is how the future is usually said.',
    ],
    guide: 'perfect',
  },
  connectors: {
    rule: 'Some joining words change nothing, and some send the verb to the end of the clause. That split is the whole lesson.',
    points: [
      'an, awer and och leave the word order alone.',
      'well, wann and wéi start a subclause, so the verb moves to the end of it.',
      'That is why they are drilled as well ech, wann ech and wéi ech — the shape you actually say out loud.',
    ],
    guide: 'subclause',
  },
};

export const patternById = (id) => PATTERNS.find((pattern) => pattern.id === id) ?? null;

/**
 * What a sentence-function round asks of you, as a brief.
 *
 * These rounds mix card shapes — pick the opener, read one back, rebuild a
 * sentence, fill a gap — so unlike the verb games there is no single action to
 * name. The points below say what the four shapes are, which is the thing that
 * was missing: the first version explained nothing before the first card and
 * put a line of design rationale underneath the answer buttons.
 *
 * The grammar itself is not repeated here. The frames *are* the lesson, and
 * the cheat sheet and notecards already carry the theory; duplicating it would
 * mean two places to keep true.
 */
export function briefFor(pattern, decks) {
  if (!pattern) return null;
  const teaching = TEACHING[pattern.id] ?? {};
  const { frames, words } = materialFor(pattern, decks);

  return {
    id: pattern.id,
    title: pattern.title,
    ask: pattern.ask,
    rule: teaching.rule,
    // A real instruction. The old one — "Answer each card, then the next one
    // appears. Nothing here is timed." — described the software rather than
    // telling anyone what to do.
    how: 'Tap your answer. When a card shows word tiles, tap the words in order and then Check.',
    points: [...(teaching.points ?? []), ...(pattern.gap ? [pattern.gap] : [])],
    guide: teaching.guide,
    // The openers and words this round will actually use, taken from the deck
    // rather than listed by hand — so the brief cannot promise material the
    // round does not have, and the A1 filter is reflected here too.
    vocabulary: [
      ...frames.map((frame) => ({ lb: frame.lb, en: frame.en })),
      ...words.map((word) => ({ lb: word.lb, en: word.en })),
    ],
  };
}

/**
 * Everything a pattern can actually ask about, resolved against the decks.
 *
 * Returns real deck rows, never the strings above — so a frame that stopped
 * shipping simply produces fewer questions instead of a card with nothing
 * behind it.
 */
export function materialFor(pattern, { phrases = [], grammar = [], vocab = [] } = {}) {
  if (!pattern) return { frames: [], items: [], words: [] };

  const wanted = new Set((pattern.frames ?? []).map((lb) => lb.toLowerCase()));
  const frames = phrases.filter((phrase) => wanted.has(String(phrase.lb).toLowerCase()));

  const kinds = new Set(pattern.kinds ?? []);
  const items = kinds.size ? grammar.filter((item) => kinds.has(item.kind)) : [];

  const lemmas = new Set((pattern.words ?? []).map((lb) => lb.toLowerCase()));
  const seen = new Set();
  const words = [];
  for (const item of vocab) {
    const key = String(item.lb ?? '').toLowerCase();
    if (!lemmas.has(key) || seen.has(key) || !item.en) continue;
    seen.add(key);
    words.push(item);
  }

  return { frames, items, words };
}

/** Can this pattern fill a round at all? */
export function isPlayable(pattern, decks) {
  const { frames, items, words } = materialFor(pattern, decks);
  return frames.length + items.length + words.length >= 2;
}
