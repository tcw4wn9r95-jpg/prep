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
export function briefFor(pattern) {
  if (!pattern) return null;
  return {
    id: pattern.id,
    title: pattern.title,
    ask: pattern.ask,
    rule: `This round is about one thing a sentence has to do: ${pattern.ask}`,
    how: 'Answer each card, then the next one appears. Nothing here is timed.',
    points: [
      'Some cards give you the English and ask which Luxembourgish opener performs it. Others show you the opener and ask what it does.',
      'Some ask you to rebuild a whole sentence by tapping its words in order.',
      'Some gap out one word from a real sentence for you to fill.',
      'Every sentence is one LOD published, so a wrong answer is still real Luxembourgish rather than something invented to fool you.',
      ...(pattern.gap ? [pattern.gap] : []),
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
