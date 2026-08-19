'use strict';

/**
 * How common a word actually is.
 *
 * The deck shipped in alphabetical order within A1 then A2, which is a fine way
 * to store 2,048 words and a terrible order to meet them in: it offers
 * `Aarbechtskolleegin` and `Wunngemeinschaft` before `hunn` and `goen`. A
 * beginner needs the words that recur in every sentence first, because those
 * are the ones that make the next sentence readable.
 *
 * There is no frequency list for Luxembourgish in the LOD export, but there are
 * 10,777 example sentences written by lexicographers, and counting across all
 * of them gives a usable ranking. Inflected forms are resolved back to their
 * entry through the lexicon's form index, so `akaaft` counts towards `akafen`.
 *
 * **What this is not.** These are dictionary examples, not a spoken corpus, so
 * the ranking reflects the Luxembourgish LOD chose to illustrate words with
 * rather than the Luxembourgish spoken in Luxembourg. For ordering a beginner
 * deck that is more than good enough — the top of the list comes out as `ech`,
 * `hunn`, `sinn`, `net`, `kënnen`, `goen`, which is exactly right — but it is
 * not a citable frequency list and is not presented as one.
 */

const { tokenise } = require('./lux-text');

/**
 * Counts every corpus entry across every example sentence in the corpus.
 *
 * @param {{entries: Array}} corpus
 * @param {{forms: Record<string,string>}} lexicon
 * @returns {Map<string, number>} LOD record id → occurrences
 */
function countEntries(corpus, lexicon) {
  const counts = new Map();
  for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text) continue;
        for (const token of tokenise(example.text)) {
          const hit = lexicon.forms[token.value] ?? lexicon.forms[token.value.toLowerCase()];
          if (!hit) continue;
          const id = hit.slice(hit.indexOf(':') + 1);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/**
 * The units a learner walks, in order.
 *
 * ## Why this is not a frequency list
 *
 * It was one, and that was the flaw. The old path had five bands — 28 starter
 * words, 60 verbs, 150 core words, then "the rest of A1" (716) and "A2"
 * (1,095). The first three are right and are kept: you need a sentence engine
 * before a wide vocabulary, and every published course starts the same way.
 * The last two were not a path at all. At eight new words a day, "the rest of
 * A1" is ninety days inside one undifferentiated bucket with no milestone, no
 * theme and no way to tell what you can now *do*.
 *
 * The official course does not work that way and neither does the framework it
 * is built on. INLL splits the same ground into five taught blocks (A1.1, A1.2,
 * A2.1–A2.3), and LLO.LU — INL's own free platform — organises every level by
 * theme: personal identification, daily life, food and drink, house and home,
 * free time, shopping. CEFR itself is a functional syllabus: A2 is defined by
 * what you can do — greet someone, ask a price, order a meal, make an
 * arrangement — not by how many words you have met.
 *
 * ## So the units are themed, and the themes are the exam's own
 *
 * The Sproochentest interview offers two topics and you take one. The eighteen
 * topics already in `topics.json` are those topics. Ordering the path by them
 * means finishing a unit is the same event as being able to sit that interview,
 * which is the only milestone that matters here.
 *
 * Order within the themes is by how early a beginner needs them, which lines up
 * with LLO.LU's own sequence: people first, then food, then where you live,
 * then work, then getting around.
 *
 * ## Every unit says what you can do at the end of it
 *
 * `canDo` is the unit's point, written as the framework writes them. It is what
 * the screen shows, and it is what decides which of the games belongs to the
 * unit: `games` names the sentence functions and verb games that check exactly
 * that ability. Those used to be a separate tab with its own progress; they are
 * the checkpoint of a unit now, which is where a can-do check belongs.
 *
 * `topics` are the vocabulary themes the unit draws on, `grammar` the exercise
 * kinds that become due in it — sequenced by `grammar-guide.js`'s own teaching
 * order rather than arriving at random, which is what happened before: the
 * whole grammar deck carried no stage at all, so adjective endings could turn
 * up on day three next to the definite article.
 */
const STAGES = [
  {
    n: 1,
    id: 'starters',
    title: 'First words',
    level: 'A1.1',
    canDo: 'I can say who is doing what, answer yes and no, and ask a question.',
    blurb: 'Who is doing what, yes, no, the question words — and the frames they slot into.',
    games: ['naming', 'questions'],
  },
  {
    n: 2,
    id: 'verbs',
    title: 'Everyday verbs',
    level: 'A1.1',
    size: 60,
    canDo: 'I can say what I have and what I do, and change a verb for the person doing it.',
    blurb: 'The verbs that carry most sentences.',
    games: ['having', 'verb-meaning', 'verb-person', 'verb-number'],
    grammar: ['numbers'],
  },
  {
    n: 3,
    id: 'core',
    title: 'Everyday words',
    level: 'A1.1',
    size: 150,
    canDo: 'I can name the things around me with the right article, and say that something exists.',
    blurb: 'The nouns and adjectives you will reach for constantly.',
    games: ['existence', 'quantity'],
    grammar: ['gender'],
  },
  {
    n: 4,
    id: 'famill',
    title: 'People and family',
    level: 'A1.2',
    canDo: 'I can introduce myself and the people around me, and join two ideas together.',
    blurb: 'The first thing any interview asks about, and the words for the people in your life.',
    topics: ['famill'],
    games: ['connectors', 'verb-form'],
    grammar: ['nrule', 'wordorder'],
  },
  {
    n: 5,
    id: 'iessen',
    title: 'Food and drink',
    level: 'A1.2',
    canDo: 'I can ask for what I want in a shop or a café, and say what I do not want.',
    blurb: 'Ordering, shopping, and saying no politely.',
    topics: ['iessen'],
    games: ['wanting', 'requesting'],
    grammar: ['negation'],
  },
  {
    n: 6,
    id: 'wunnen',
    title: 'Where you live',
    level: 'A1.2',
    canDo: 'I can say where something is, and say what I like and do not like.',
    blurb: 'Your home, the household, and where things are.',
    topics: ['wunnen', 'stot'],
    games: ['location', 'liking'],
    grammar: ['likes'],
  },
  {
    n: 7,
    id: 'aarbecht',
    title: 'Work and languages',
    level: 'A2.1',
    canDo: 'I can say what I do for a living, what I have to do, and what I did.',
    blurb: 'The most common interview topic of all, and the past tense it needs.',
    topics: ['aarbecht', 'sproochen'],
    games: ['obligation', 'verb-past'],
    grammar: ['perfect-aux', 'perfect-form'],
  },
  {
    n: 8,
    id: 'transport',
    title: 'Getting around',
    level: 'A2.1',
    canDo: 'I can say how I travel, when, and what I can and cannot do.',
    blurb: 'Transport, journeys and holidays — and the verb bracket they pull apart.',
    topics: ['transport', 'vakanz'],
    games: ['ability', 'time'],
    grammar: ['bracket'],
  },
  {
    n: 9,
    id: 'gesondheet',
    title: 'Health and sport',
    level: 'A2.2',
    canDo: 'I can say how I feel, what hurts, and say no to things properly.',
    blurb: 'The body, staying well, and sport — plus the dative these lean on.',
    topics: ['gesondheet', 'sport'],
    games: ['negation'],
    grammar: ['dative'],
  },
  {
    n: 10,
    id: 'fräizäit',
    title: 'Free time',
    level: 'A2.2',
    canDo: 'I can give an opinion and say why, in a sentence with two halves.',
    blurb: 'Hobbies, reading, media and making things — and the clause that carries an opinion.',
    topics: ['hobbyen', 'liesen', 'medien', 'kreativitéit'],
    games: ['opinion'],
    grammar: ['subclause'],
  },
  {
    n: 11,
    id: 'feierdeeg',
    title: 'The year and celebrations',
    level: 'A2.3',
    canDo: 'I can describe people and things in detail — which is the second exam task.',
    blurb: 'Seasons, holidays, presents and clothes, with the adjective endings a description needs.',
    topics: ['joreszäiten', 'feierdeeg', 'kaddoen', 'kleeder'],
    grammar: ['adjective'],
  },
  {
    n: 12,
    id: 'exam',
    title: 'Exam ready',
    level: 'A2.3 · B1 listening',
    canDo: 'I can hold the interview on any of the published topics, and follow a conversation at B1.',
    blurb: 'What is left of the A2 vocabulary, and the listening the exam sets a whole level higher.',
  },
];

/**
 * Assigns `freq`, `rank` and `stage` across a whole deck.
 *
 * Ranking is by frequency descending, ties broken by lemma so the output is
 * deterministic and the committed JSON diffs cleanly.
 *
 * @param {Array} items deck items carrying `id`/`lodId`, `level` and `pos`
 * @param {Map<string, number>} counts from `countEntries`
 */
function rankDeck(items, counts) {
  const freqOf = (item) => counts.get(item.lodId ?? item.id) ?? 0;

  const ordered = [...items].sort((a, b) => {
    const byFreq = freqOf(b) - freqOf(a);
    if (byFreq !== 0) return byFreq;
    return String(a.lb ?? a.infinitive).localeCompare(String(b.lb ?? b.infinitive));
  });

  // Stage 1 is the hand-listed sentence skeleton, whatever its frequency.
  // Stages 2 and 3 take the most frequent verbs, then the most frequent
  // everything-else, so the learner gets a working engine before a wide
  // vocabulary. What is left falls to A1 then A2.
  const stage = new Map();
  const verbBand = [];
  const coreBand = [];

  // Which unit first wants a given theme. A word carrying several themes lands
  // in the earliest one that wants it, so nothing is taught twice and the unit
  // that needs it soonest gets it.
  const unitOfTopic = new Map();
  for (const unit of STAGES) {
    for (const topic of unit.topics ?? []) if (!unitOfTopic.has(topic)) unitOfTopic.set(topic, unit.n);
  }
  const themed = (item) => {
    let earliest = null;
    for (const topic of item.topics ?? []) {
      const n = unitOfTopic.get(topic);
      if (n && (earliest === null || n < earliest)) earliest = n;
    }
    return earliest;
  };
  const LAST = STAGES[STAGES.length - 1].n;

  for (const item of ordered) {
    if (item.starter) {
      stage.set(item.id, 1);
      continue;
    }
    const isVerb = item.pos === 'VRB' || Boolean(item.present);
    if (isVerb && verbBand.length < (STAGES[1].size ?? 0)) {
      verbBand.push(item.id);
      stage.set(item.id, 2);
    } else if (!isVerb && coreBand.length < (STAGES[2].size ?? 0) && freqOf(item) > 0) {
      coreBand.push(item.id);
      stage.set(item.id, 3);
    } else {
      // Everything past the engine is placed by theme, because that is how the
      // exam asks about it and how the official course teaches it. A word with
      // no theme has no unit to belong to, so it waits for the last one — which
      // is where the leftover A2 vocabulary genuinely belongs.
      stage.set(item.id, themed(item) ?? LAST);
    }
  }

  const rankById = new Map(ordered.map((item, index) => [item.id, index + 1]));
  return items.map((item) => ({
    ...item,
    freq: freqOf(item),
    rank: rankById.get(item.id),
    stage: stage.get(item.id) ?? STAGES[STAGES.length - 1].n,
  }));
}

/**
 * The unit a grammar exercise belongs to, by its kind.
 *
 * Built from the units themselves so there is one list rather than two that can
 * disagree. Before this the grammar deck carried no unit at all and was mixed
 * in by a round-robin, which meant adjective endings — an A2 topic the guide
 * teaches seventeenth — could appear on day three beside the definite article.
 */
function grammarUnits() {
  const byKind = new Map();
  for (const unit of STAGES) {
    for (const kind of unit.grammar ?? []) byKind.set(kind, unit.n);
  }
  return byKind;
}

module.exports = { countEntries, rankDeck, grammarUnits, STAGES };
