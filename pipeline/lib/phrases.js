'use strict';

/**
 * Sentence frames.
 *
 * Single words are not what makes someone sound like they can speak a
 * language. Formulaic sequences — the fixed chunks a fluent speaker reaches
 * for whole rather than assembling — are what raters actually respond to, and
 * an A2 oral exam is largely a sequence of them: *ech hunn…*, *ech sinn…*,
 * *ech war…*, *ech kann…*. A candidate who can produce twelve frames and slot
 * nouns into them will be understood; one who knows four hundred nouns and no
 * frames will not.
 *
 * So this is a third deck, and it is deliberately small. Thirty-odd frames
 * covers the great majority of what an A2 interview needs.
 *
 * **Nothing here is invented Luxembourgish.** Each `lb` below is a string that
 * occurs verbatim in LOD's own recorded example sentences, and
 * `build-phrases.js` **fails the build** if any frame is not attested at least
 * `MIN_ATTESTATIONS` times. I am selecting frames from the corpus, not writing
 * them. The English and French glosses are ours, as the language rule allows.
 *
 * Frames are ordered as they are taught: what you are and have, then modals,
 * then the past, then questions.
 */

/** A frame has to appear at least this many times in recorded corpus sentences. */
const MIN_ATTESTATIONS = 8;

/**
 * @typedef {{lb: string, en: string, fr: string, group: string, note?: string}} Phrase
 */

/** @type {Phrase[]} */
const PHRASES = [
  // Being and having: the two verbs every other sentence leans on.
  { lb: 'ech sinn', en: 'I am', fr: 'je suis', group: 'self' },
  { lb: 'ech hunn', en: 'I have', fr: "j'ai", group: 'self' },
  { lb: 'du bass', en: 'you are', fr: 'tu es', group: 'other' },
  { lb: 'du hues', en: 'you have', fr: 'tu as', group: 'other' },
  { lb: 'hien ass', en: 'he is', fr: 'il est', group: 'other' },
  { lb: 'hien huet', en: 'he has', fr: 'il a', group: 'other' },
  { lb: 'mir sinn', en: 'we are', fr: 'nous sommes', group: 'other' },
  { lb: 'mir hunn', en: 'we have', fr: 'nous avons', group: 'other' },
  { lb: 'si hunn', en: 'they have', fr: 'ils ont', group: 'other' },

  // Pointing at things. `et gëtt` is the one that unlocks describing a photo.
  { lb: 'et ass', en: 'it is', fr: "c'est", group: 'pointing' },
  { lb: 'dat ass', en: 'that is', fr: "c'est cela", group: 'pointing' },
  { lb: 'et gëtt', en: 'there is, there are', fr: 'il y a', group: 'pointing' },

  // Modals. At A2 these carry most of what you can say about your life.
  { lb: 'ech kann', en: 'I can', fr: 'je peux', group: 'modal' },
  { lb: 'ech muss', en: 'I must, I have to', fr: 'je dois', group: 'modal' },
  { lb: 'ech wëll', en: 'I want', fr: 'je veux', group: 'modal' },
  { lb: 'du kanns', en: 'you can', fr: 'tu peux', group: 'modal' },
  { lb: 'du muss', en: 'you must', fr: 'tu dois', group: 'modal' },
  { lb: 'mir mussen', en: 'we must', fr: 'nous devons', group: 'modal' },

  // The past. The interview asks what you did at the weekend, on holiday,
  // last year — without these you can only talk about right now.
  { lb: 'ech war', en: 'I was', fr: "j'étais", group: 'past' },
  { lb: 'ech hat', en: 'I had', fr: "j'avais", group: 'past' },
  { lb: 'hien hat', en: 'he had', fr: 'il avait', group: 'past' },
  { lb: 'mir haten', en: 'we had', fr: 'nous avions', group: 'past' },

  // Politeness. `ech hätt` is how you ask for something without sounding blunt.
  { lb: 'ech hätt', en: 'I would have, I would like', fr: "j'aurais", group: 'polite' },
  { lb: 'ech géif', en: 'I would', fr: 'je ferais', group: 'polite' },

  // Asking. Half of an interview is recognising the question.
  { lb: 'hues du', en: 'do you have', fr: 'as-tu', group: 'asking' },
  { lb: 'wat ass', en: 'what is', fr: "qu'est-ce que c'est", group: 'asking' },
  { lb: 'wéi vill', en: 'how much, how many', fr: 'combien', group: 'asking' },
  { lb: 'wat fir', en: 'what kind of', fr: 'quel genre de', group: 'asking' },

  // Joining two clauses — the difference between A1 and A2 in one word.
  { lb: 'wann ech', en: 'if I, when I', fr: 'si je', group: 'joining' },
  { lb: 'wéi ech', en: 'when I, as I', fr: 'quand je', group: 'joining' },

  // Everyday self-description, all attested.
  { lb: 'ech kommen', en: 'I come', fr: 'je viens', group: 'self' },
  { lb: 'ech wunnen', en: 'I live', fr: "j'habite", group: 'self' },
  { lb: 'ech weess', en: 'I know', fr: 'je sais', group: 'self' },
  { lb: 'ech maachen', en: 'I do, I make', fr: 'je fais', group: 'self' },

  /* ------------------------------------------------ added for the Arcade
   * The Arcade teaches fifteen sentence functions, and the deck was missing a
   * frame for five of them: requesting, opinion, location, asking whether
   * something exists, and the future. Each string below was counted in the
   * corpus before being added here — the figure in the comment is how many
   * recorded example sentences contain it — and build-phrases.js fails the
   * build if any of them is attested fewer than MIN_ATTESTATIONS times, so
   * these are selections rather than inventions like every other frame.
   *
   * Deliberately not added, because the corpus does not support them:
   * `ech heeschen` ("my name is", 0 occurrences), `wou ass` ("where is", 2)
   * and `et gëtt keen` ("there isn't", 0). The Arcade covers those functions
   * from other angles rather than shipping a frame nobody wrote — see
   * app/js/arcade/patterns.js. */
  { lb: 'kann ech', en: 'can I', fr: 'puis-je', group: 'asking' }, // 25
  { lb: 'kanns du', en: 'can you', fr: 'peux-tu', group: 'asking' }, // 12
  { lb: 'gëtt et', en: 'is there', fr: 'y a-t-il', group: 'asking' }, // 64
  { lb: 'ech fannen', en: 'I think, I find', fr: 'je trouve', group: 'self' }, // 13
  { lb: 'hei ass', en: 'here is', fr: 'voici', group: 'pointing' }, // 8
  { lb: 'do ass', en: 'there is (over there)', fr: 'là est', group: 'pointing' }, // 43
  { lb: 'well ech', en: 'because I', fr: 'parce que je', group: 'joining' }, // 44
  { lb: 'ech wäert', en: 'I will', fr: 'je vais', group: 'future' }, // 11
];

/** Human labels for the groups, used to order and head the deck. */
const GROUPS = [
  { id: 'self', title: 'Talking about yourself' },
  { id: 'other', title: 'Talking about other people' },
  { id: 'pointing', title: 'Pointing something out' },
  { id: 'modal', title: 'Can, must, want' },
  { id: 'past', title: 'Talking about the past' },
  { id: 'future', title: 'Talking about what will happen' },
  { id: 'polite', title: 'Being polite' },
  { id: 'asking', title: 'Asking a question' },
  { id: 'joining', title: 'Joining two ideas' },
];

module.exports = { PHRASES, GROUPS, MIN_ATTESTATIONS };
