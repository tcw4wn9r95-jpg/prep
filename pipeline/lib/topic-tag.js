'use strict';

/**
 * Attaching exam topics to vocabulary.
 *
 * The deck ships alphabetically, A1 then A2, which is a fine way to store 2,048
 * words and a poor way to revise for an exam that draws its speaking topics
 * from a fixed pool of fourteen. Tagging each word to a topic is what lets the
 * app offer "the words you need to talk about `stot`" the evening before you
 * are asked to talk about `stot`.
 *
 * Three layers of evidence, strongest first, and the winning layer is recorded
 * on the item so the tagging is auditable in the diff rather than a black box:
 *
 *   category — LOD's own semantic categories. Actual lexicographic data.
 *   seed     — the lemma is one of the topic's seed headwords, or a seed
 *              appears in the entry's own example sentence.
 *   gloss    — a keyword in the English/French/German translation.
 *
 * A word matching nothing stays **untagged**. It remains in the all-words deck
 * and no topic is invented for it; a wrong topic would quietly send someone
 * into the exam having revised the wrong list.
 *
 * No Luxembourgish is authored here. The category and gloss tables below are
 * English-side, which the language rule leaves free; every Luxembourgish string
 * involved is a corpus lemma or a corpus example sentence.
 */

const { tokenise } = require('./lux-text');

/**
 * LOD category → exam topic.
 *
 * Only unambiguous mappings are listed. LOD carries plenty of categories with
 * no home in the exam pool (SCHOUL, POL, JUR, MILIT, DEIER, MOOSSEENHEET …) and
 * those are deliberately absent — an animal is not a topic the exam offers, and
 * forcing it into `hobbyen` would be a lie dressed as coverage.
 */
const CATEGORY_TOPICS = {
  IESSEN: 'iessen',
  GEDRENKS: 'iessen',
  UEBST: 'iessen',
  GEMEIS: 'iessen',
  GEWIERZ: 'iessen',
  KRAUTGEWIERZ: 'iessen',
  NOSS: 'iessen',
  HORECA: 'iessen',
  GASTR: 'iessen',
  KLEEDUNGSSTECK: 'kleeder',
  SPORT: 'sport',
  FUSSBALL: 'sport',
  OLYMPIA: 'sport',
  BERUFFSBEZEECHNUNG: 'aarbecht',
  WIRTSCHAFT: 'aarbecht',
  METEO: 'joreszäiten',
  WIEDER: 'joreszäiten',
  MOUNT: 'joreszäiten',
  FAMILL: 'famill',
  MED: 'gesondheet',
  ANAT: 'gesondheet',
  CORONA: 'gesondheet',
  FEIERDEEG: 'feierdeeg',
  FEST: 'feierdeeg',
  KLEESCHEN: 'feierdeeg',
  HALLOWEEN: 'feierdeeg',
  GEFIER: 'transport',
  FUHRERSCHAIN: 'transport',
  MUSEK: 'kreativitéit',
  MUSEKSINSTRUMENT: 'kreativitéit',
  THEATER: 'kreativitéit',
  FAARF: 'kreativitéit',
  LITERATUR: 'liesen',
  LING: 'sproochen',
  TECH: 'medien',
  FILM: 'medien',
  SPILLPLAZ: 'hobbyen',
};

/**
 * Gloss keyword → exam topic, the weakest layer.
 *
 * Matched against whole words in the English, French and German translations
 * LOD publishes, so it catches the large middle of the deck that carries no
 * semantic category and no seed. Keywords are lowercased and matched whole, so
 * "car" does not fire on "cardigan".
 */
const GLOSS_TOPICS = {
  iessen: ['eat', 'food', 'drink', 'meal', 'bread', 'cheese', 'meat', 'fruit', 'vegetable', 'cook', 'kitchen', 'restaurant', 'breakfast', 'lunch', 'dinner', 'hungry', 'thirsty', 'manger', 'boire', 'repas', 'essen', 'trinken'],
  kleeder: ['clothes', 'clothing', 'wear', 'shirt', 'trousers', 'shoe', 'coat', 'jacket', 'dress', 'hat', 'skirt', 'sock', 'vêtement', 'kleidung'],
  sport: ['sport', 'football', 'swim', 'run', 'team', 'match', 'training', 'gym', 'ball', 'bike', 'race', 'sportif'],
  aarbecht: ['work', 'job', 'office', 'employer', 'employee', 'colleague', 'salary', 'profession', 'career', 'boss', 'company', 'travail', 'emploi', 'bureau', 'arbeit'],
  vakanz: ['holiday', 'holidays', 'vacation', 'travel', 'trip', 'journey', 'hotel', 'suitcase', 'tourist', 'abroad', 'beach', 'voyage', 'vacances', 'urlaub', 'reise'],
  gesondheet: ['health', 'healthy', 'ill', 'illness', 'sick', 'doctor', 'hospital', 'medicine', 'pain', 'nurse', 'pharmacy', 'body', 'santé', 'malade', 'médecin', 'gesundheit', 'krank'],
  wunnen: ['house', 'flat', 'apartment', 'room', 'live', 'living', 'kitchen', 'bathroom', 'bedroom', 'garden', 'furniture', 'rent', 'maison', 'logement', 'wohnung', 'wohnen'],
  transport: ['car', 'train', 'bus', 'drive', 'driver', 'road', 'street', 'station', 'ticket', 'plane', 'bicycle', 'traffic', 'voiture', 'route', 'auto', 'zug'],
  hobbyen: ['hobby', 'leisure', 'game', 'play', 'dance', 'sing', 'garden', 'collect', 'free time', 'loisir', 'freizeit'],
  stot: ['clean', 'cleaning', 'wash', 'washing', 'laundry', 'iron', 'tidy', 'household', 'housework', 'dishes', 'rubbish', 'ménage', 'nettoyer', 'haushalt', 'putzen'],
  'kreativitéit': ['paint', 'painting', 'draw', 'drawing', 'colour', 'color', 'music', 'photo', 'photograph', 'art', 'theatre', 'craft', 'peindre', 'musique', 'malen', 'musik'],
  sproochen: ['language', 'speak', 'word', 'grammar', 'translate', 'pronounce', 'accent', 'dialect', 'langue', 'parler', 'sprache', 'sprechen'],
  liesen: ['read', 'reading', 'book', 'newspaper', 'library', 'novel', 'story', 'page', 'write', 'writing', 'lire', 'livre', 'lesen', 'buch'],
  medien: ['internet', 'computer', 'phone', 'telephone', 'television', 'radio', 'film', 'screen', 'website', 'email', 'news', 'media', 'ordinateur', 'téléphone', 'fernsehen'],
  'joreszäiten': ['winter', 'summer', 'spring', 'autumn', 'snow', 'rain', 'sun', 'weather', 'cold', 'warm', 'season', 'hiver', 'été', 'wetter', 'schnee'],
  kaddoen: ['gift', 'present', 'give', 'birthday', 'celebrate', 'party', 'wrap', 'cadeau', 'geschenk'],
  feierdeeg: ['christmas', 'easter', 'holiday', 'festival', 'celebration', 'anniversary', 'carnival', 'fête', 'weihnachten'],
  famill: ['family', 'mother', 'father', 'child', 'children', 'son', 'daughter', 'brother', 'sister', 'parent', 'grandmother', 'grandfather', 'wife', 'husband', 'friend', 'famille', 'familie', 'kind'],
};

/** Inverted once at module load: keyword → topic id. */
const GLOSS_INDEX = new Map();
for (const [topic, keywords] of Object.entries(GLOSS_TOPICS)) {
  for (const keyword of keywords) {
    // First topic to claim a keyword keeps it, so the table above reads in
    // priority order and a duplicate is a no-op rather than a silent override.
    if (!GLOSS_INDEX.has(keyword)) GLOSS_INDEX.set(keyword, topic);
  }
}

/** Builds the seed lookups once for a whole build. */
function makeSeedIndex(topics) {
  const index = new Map();
  for (const topic of topics) {
    for (const seed of topic.seeds) {
      const key = seed.toLowerCase();
      if (!index.has(key)) index.set(key, topic.id);
    }
  }
  return index;
}

/**
 * Topics for one corpus entry.
 *
 * @param {object} entry corpus entry: `{ lemma, categories, glosses, meanings }`
 * @param {{seedIndex: Map<string,string>}} ctx from `makeSeedIndex`
 * @returns {{topics: string[], via: 'category'|'seed'|'gloss'|null}}
 */
function topicsFor(entry, { seedIndex }) {
  const fromCategory = unique((entry.categories ?? []).map((name) => CATEGORY_TOPICS[name]).filter(Boolean));
  if (fromCategory.length > 0) return { topics: fromCategory, via: 'category' };

  const fromSeed = seedTopics(entry, seedIndex);
  if (fromSeed.length > 0) return { topics: fromSeed, via: 'seed' };

  const fromGloss = glossTopics(entry);
  if (fromGloss.length > 0) return { topics: fromGloss, via: 'gloss' };

  return { topics: [], via: null };
}

/**
 * The lemma is itself a topic seed, or a seed appears in the entry's own
 * example sentences. The second case is weaker but real: LOD chose that
 * sentence to illustrate this word, so the company it keeps is evidence.
 */
function seedTopics(entry, seedIndex) {
  const direct = seedIndex.get(String(entry.lemma).toLowerCase());
  if (direct) return [direct];

  const found = [];
  for (const meaning of entry.meanings ?? []) {
    for (const example of meaning.examples ?? []) {
      if (!example.text) continue;
      for (const token of tokenise(example.text)) {
        const topic = seedIndex.get(token.value.toLowerCase());
        if (topic) found.push(topic);
      }
    }
  }
  return unique(found);
}

function glossTopics(entry) {
  const found = [];
  for (const language of ['en', 'fr', 'de']) {
    for (const gloss of entry.glosses?.[language] ?? []) {
      for (const word of String(gloss).toLowerCase().split(/[^\p{L}]+/u)) {
        const topic = GLOSS_INDEX.get(word);
        if (topic) found.push(topic);
      }
    }
  }
  return unique(found);
}

function unique(list) {
  return [...new Set(list)].sort();
}

module.exports = { topicsFor, makeSeedIndex, CATEGORY_TOPICS, GLOSS_TOPICS };
