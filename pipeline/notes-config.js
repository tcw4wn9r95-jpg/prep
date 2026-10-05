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
      file: /^Moud_a_Kleeder/,
      title: 'Moud a Kleeder',
      kind: 'qa',
      topic: 'kleeder',
    },
    {
      file: /^Liesen/,
      title: 'Liesen',
      kind: 'qa',
      topic: 'liesen',
    },
    {
      file: /^Kaddoen/,
      title: 'Kaddoen',
      kind: 'qa',
      topic: 'kaddoen',
    },
    {
      file: /^Kreativite_it/,
      title: 'Kreativitéit / Fräizäit / Hobbyen',
      kind: 'qa',
      // One document for two of the exam's topics. Most of it is hobbies; the
      // questions that ask about creativity itself go to Creativity.
      topic: 'hobbyen',
      route: [{ match: /kreativ/i, topic: 'kreativitéit' }],
    },
    {
      file: /^Musek/,
      title: 'Musek',
      kind: 'qa',
      // The exam's eighteen topics have no music of its own, so this joins the
      // music questions already filed under Hobbies.
      topic: 'hobbyen',
      // A PDF has lines, not paragraphs. The page wraps a sentence at about 90
      // characters, and a line that reaches that and is followed by something
      // that does not start a new item is the front of a sentence cut in two.
      wrapAt: 88,
    },
    {
      file: /^Tourismus/,
      title: 'Tourismus',
      kind: 'qa',
      topic: 'vakanz',
      // "M." and "V." say which of two learners is answering.
      initials: ['M', 'V'],
      ignore: ['Tourismus an Ärem Land'],
    },
    {
      file: /^Sport/,
      title: 'Sport',
      kind: 'qa',
      topic: 'sport',
      // The questions are inside a table, one cell, rather than in paragraphs.
      tablesAsContent: true,
      initials: ['M', 'V'],
      ignore: ['Sport'],
    },
    {
      file: /^Transportme_ttelen/,
      title: 'Transportmëttelen',
      kind: 'qa',
      topic: 'transport',
      ignore: ['Transportmëttelen'],
    },
    {
      file: /^Wunnen/,
      title: 'Wunnen',
      kind: 'qa',
      topic: 'wunnen',
      ignore: ['Wunnen'],
    },
    {
      file: /^Technologien/,
      title: 'Technologien / Technik / Medien',
      kind: 'qa',
      topic: 'medien',
      initials: ['M', 'V'],
      ignore: ['Technologien'],
    },
    {
      file: /^Sproochen/,
      title: 'Sproochen',
      kind: 'qa',
      topic: 'sproochen',
      ignore: ['Sproochen'],
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
    // Open with a noun, with the verb second.
    'Technesch Apparater, ass dat a gudde Kaddo?',
    'An Ärer Famill, wien huet als nächst Persoun Gebuertsdag?',
    // Ends on a full stop, or has no question word first.
    '46Hutt Dir eng LIeblingsstatioun ( = Lieblingssender) zu L.',
    'Fuert Dir mam ëffentlechen Transport. Benotzt Dir..',
    'Gefält et Iech do ( do you like it)',
    '28Ennerscheed tëscht engem E-Scooter an engem E-bike?',
    '6 Säit ( zanter) weini? Wei laang schonn?',
    '10Wei oft?',
    'Virdeeler vum Tram',
  ],
  // "Wou?" is the follow-up in the answer to "Sidd Dir beschäftegt?", not a question of its own.
  forceAnswer: [
    'Wou? – um Kierchbierg',
    // The answer to "Wéi Dir kleng waart, hat Dir do en Hobby", which opens with "Wéi".
    'Wéi ech kleng war, hunn ech ganz vill gelies',
  ],
  // A stray example sentence under an unrelated answer: reading, not an answer.
  forceNote: [
    'Ech fueren heiansdo mam Vëlo',
    // Grammar reminders under answers.
    'benotzen + Artikel- ech benotzen de Bus',
    'mat mengem Frënd (m)',
    'mat menger Frëndin (f)',
    'mat mengem Kand (n)',
    'mat menge (n) Frënn (pl)',
    'hie kënnt aus Ägypten _ he comes from Ä.',
    'verbesseren (improve)',
    // Examples of how "kee(n)" negates, run on under "Spillt Dir en Instrument?".
    'net: “not”',
    'd’Wieder ass net gutt',
    'ech hu keen Auto',
    'ech hu keng Fra',
    'ech spille kee Museksinstrument',
    'ech hu keng Kanner/ ech hu keng Haiser, ..',
    'et gi(nn) keng Butteker',
    'opmaachen- ech maachen d’Fënster op',
    'et ass wichteg, d’Fënster opzemaachen',
  ],
  // Document titles, which are not content.
  drop: [
    'De Stot/ Kommissioune maachen',
    'de Summer – de Wanter',
    'Gesond Liewen',
    'Moud a Kleeder',
    'Liesen',
    'Kaddoen',
    'Kreativitéit/Fräizait/Hobbyen',
    'Musek',
    // A stray heading at the top of the music PDF, ahead of its question list.
    'Darea',
    // Leads into a list of answers; it is not one.
    'Wa Jo:',
  ],
  join: [
    ['Ech versichen aacht Stonnen ze schlofen, vill Waasser ze drénken', 'an Uebst a Geméis z’iessen.'],
    // A parenthesis opened on one line and closed on the next.
    ['Technologie ass fir mech zum Beispill den Internet', 'an elektronesch Apparater ( den Handy, de Computer)'],
    ['Ech liesen d‘Noriichten um Handy./ ech benotze mäin Handy a mäi Laptop', 'fir d‘Noriichten.'],
    ['M Heiansdo maachen ech Fotoen op mengem Handy , wann', 'ech wanderen.'],
    ['Ech lauschteren all Dag Musek ( All Dag lauschteren ech Musek', 'ech hu gär Rockmusek, Popmusek, Klassik)'],
  ],
  // The question and its answer are one line: split after the "?".
  split: [
    'Wéini ass de Summer a P. ? Tëscht Mee an August',
    'A Wéini war dat? Dat war 2019 oder…',
    'Wéi gitt Dir shoppen? Ech fuere mam Auto',
    'Wéi en Transportmëttel hutt Dir an der Vakanz benotzt? Ech hu mäin Auto benotzt.',
    'Sidd Dir beschäftegt?- Jo ech hunn eng Aarbecht',
    'Wéi gitt Dir op d\'Aarbecht? – Ech fuere mam Auto op d‘Aarbecht',
    'Wéi vill Zäit braucht ( to need) Dir?- Ech brauch zwanzeg Minutten',
    'Wien huet gespillt? d’Taylor Swift huet um ( op + dem) Concert gesongen // oder op engem',
    'Wéi gitt Dir an d\'Vakanz?- Ech fuere mam Auto an d‘Vakanz',
  ],
  // The same, where what follows the "?" is the learner's own gloss.
  splitNote: [
    'Wat ass Är Haaptsprooch? mäin language',
    'Wat fir aner Sprooche schwätzt Dir nach? – other language',
    'Wéi gefält Iech Äre Quartier / Äert Duerf? Gefalen + Dativ',
    '34 Wéini kaaft Dir en neien Handy? (m) „it“ for male things: e(n)',
  ],
  // Two questions share a paragraph and the answer that follows is to the first.
  attach: [
    {
      line: 'Ech schwätze frëndlech mat mengen Noperen',
      to: 'Wat maacht Dir, wann et Problemer mat Noperen oder Geräischer gëtt ?',
    },
    // The music notes run two questions together, and these answers are out of order.
    {
      line: 'Ech war am Juli op engem Concert. Wou? – de Concert war zu London?',
      to: 'Wien huet gespillt?',
    },
    {
      line: '- b)Nee, ech hunn nach ni meng Lieblingsband perséinlech getraff',
      to: 'Hutt Dir schonn eng Kéier Äre Lieblingsmuseker perséinlech getraff?',
    },
    // Two questions stacked, and the answer under them is to the first.
    {
      line: 'En ideale Kaddo ass fir mech eppes Perséinleches',
      to: 'Wat ass fir Iech en ideale Kaddo?',
    },
  ],
};
