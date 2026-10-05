'use strict';

/**
 * What the build needs to know about each study document, and nothing it could
 * work out for itself.
 *
 * ## Nothing in here is Luxembourgish *content*
 *
 * The cards are the documents' own words, verbatim; this file only says which
 * document is which, which exam topic a heading belongs to, and where the
 * heuristic in build-notes.js guessed wrong. Every string in `ignore`, `force*`
 * and `join` is a *key* — a line quoted from a document so it can be found — and
 * the build refuses any key that matches no line, so a stale override fails
 * loudly instead of quietly doing nothing.
 *
 * ## Adding a document
 *
 * New file → one entry in `documents`. The build stops with the name of any
 * .docx it has no entry for, which is the prompt to add one.
 */

/** The ids of the 18 exam topics, plus the one this feature adds. */
const IMAGE = 'image';

module.exports = {
  /** Pulled from the filename: `e6f1e304-De_Stot-….docx` → `De_Stot-…`. */
  documents: [
    {
      file: /^De_Stot/,
      title: 'De Stot / Kommissioune maachen',
      kind: 'qa',
      topic: 'stot',
    },
    {
      file: /^de_Summer/,
      title: 'de Summer – de Wanter',
      kind: 'qa',
      topic: 'joreszäiten',
      // The document runs summer, then winter, and each opens with a heading.
      // Both are the same exam topic; the headings only stop being read as answers.
      sections: { 'De Summer': 'joreszäiten', 'de Wanter': 'joreszäiten' },
    },
    {
      file: /^Gesond_Liewen/,
      title: 'Gesond Liewen',
      kind: 'qa',
      topic: 'gesondheet',
    },
    {
      file: /^Additionals/,
      title: 'Additionals fir de Sproochentest',
      kind: 'qa',
      // A heading in this document starts a topic. Keys are the headings as the
      // document spells them; values are the app's exam-topic ids.
      sections: {
        Sport: 'sport',
        Sproochen: 'sproochen',
        'Moud a Kleeder': 'kleeder',
        'de Summer': 'joreszäiten',
        'de Wanter': 'joreszäiten',
        Wunnen: 'wunnen',
        Technologien: 'medien',
        Liesen: 'liesen',
        // The exam's eighteen topics have no music of its own. Hobbies is the
        // nearest; this is a judgement and is the one most likely to be wrong.
        Musek: 'hobbyen',
        Kaddoen: 'kaddoen',
        Vakanz: 'vakanz',
        Tourismus: 'vakanz',
        'de Stot maachen': 'stot',
        Kreativitéit: 'kreativitéit',
        Transport: 'transport',
        'Gesond Liewen': 'gesondheet',
      },
      // Sub-headings inside a topic. They group questions on the page and are
      // not questions, answers or topics.
      ignore: [
        'Virbereedung op d’Vakanz',
        '🏖️ D’Vakanz selwer',
        '🌦️ Erfarungen an Androck',
        '💬 Reesen an d’Zukunft',
        '🧠 Allgemeng Reflexiounen',
      ],
    },
    {
      file: /^Bildbeschreiwung/,
      title: 'Bildbeschreiwung',
      kind: 'sections',
      topic: IMAGE,
      // The document is a worked description, not a list of questions, so each
      // heading becomes a card: the heading is the prompt, what follows is the
      // model. `hint_en` is English, written here because the headings are not
      // sentences and several have no English of their own.
      outline: [
        { heading: 'Dobaussen, dobannen', hint_en: 'Was the photo taken outside or inside?' },
        { heading: 'faarweg, schwaarz wäiss, Comicbild', hint_en: 'Colour, black and white, or a drawing?' },
        { heading: 'Wieder dobaussen', hint_en: 'The weather, when the picture is outside.' },
        { heading: 'Wieder dobannen', hint_en: 'The weather, when the picture is inside: what are people wearing?' },
        { heading: 'Situatioun', hint_en: 'What is the situation — where are they, how many, doing what?' },
        { heading: 'Beschreiwungen :', hint_en: 'Describe the people: who, where, what they look like.' },
        { heading: 'op der lénkser Säit, op der rietser Säit, am Hannergrond', hint_en: 'Say where things are, with the verb in second place.' },
        { heading: 'Schluss (end)', hint_en: 'Finish: the atmosphere, and whether people look happy.' },
      ],
      // Everything from here on is grammar and vocabulary scaffolding rather
      // than something to say, so it is kept as reading, not as cards.
      referenceFrom: 'Verbs:',
    },
  ],

  /**
   * Where the heuristic is wrong. Each list holds lines quoted from a document.
   *
   * forceQuestion  a question that carries no question mark and does not open
   *                with a question word
   * forceAnswer    a line that looks like a question and is not — an answer
   *                that quotes a follow-up
   * forceNote      a line that reads as an answer and is a gloss or a reminder
   * drop           a line that is neither: a title, a rule, a stray fragment
   * join           [a, b] — b continues a, which was cut across two paragraphs
   */
  forceQuestion: [
    // Ends on a full stop.
    'Wat hutt Dir haut de Mëtteg am Restaurant gedronk.',
    // Opens with a parenthesis, so no question word is first.
    '( Gefält et Iech) Dir et, mat lokale Leit ze schwätzen, wann Dir reest?',
  ],
  forceAnswer: [],
  // A stray example sentence under an unrelated answer: reading, not an answer.
  forceNote: ['Ech fueren heiansdo mam Vëlo'],
  // Document titles, which are not content.
  drop: ['De Stot/ Kommissioune maachen', 'de Summer – de Wanter', 'Gesond Liewen'],
  join: [
    ['Ech versichen aacht Stonnen ze schlofen, vill Waasser ze drénken', 'an Uebst a Geméis z’iessen.'],
  ],
  // The question and its answer are one line: split after the "?".
  split: ['Wéini ass de Summer a P. ? Tëscht Mee an August'],
  // Two questions share a paragraph and the answer that follows is to the first.
  attach: [
    {
      line: 'Ech schwätze frëndlech mat mengen Noperen',
      to: 'Wat maacht Dir, wann et Problemer mat Noperen oder Geräischer gëtt ?',
    },
  ],
};
