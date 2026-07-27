'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'lod');
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json');
const CONTENT_DIR = path.join(ROOT, 'content');
const CORPUS_PATH = path.join(CONTENT_DIR, 'corpus.json');
const LEXICON_PATH = path.join(CONTENT_DIR, 'lexicon.json');
const ITEMS_DIR = path.join(CONTENT_DIR, 'items');
const AUDIO_CACHE_PATH = path.join(CACHE_DIR, 'audio.json');

/**
 * The three LOD exports. Slugs are stable; the dated resource inside each is
 * resolved at fetch time, so a rebuild always picks up the newest release and
 * records which one it used.
 */
const DATASETS = {
  art: {
    slug: 'letzebuerger-online-dictionnaire-lod-linguistesch-daten',
    label: 'Linguistesch Daten (full dictionary)',
  },
  search: {
    slug: 'letzebuerger-online-dictionnaire-lod-index-vun-der-sich-funktioun',
    label: 'Index vun der Sich-Funktioun (spelling variants + n-rule flags)',
  },
  tab: {
    slug: 'letzebuerger-online-dictionnaire-lod-flexiounstabellen',
    label: 'Flexiounstabellen (verb + adjective inflection)',
  },
};

/**
 * LOD's own basic-vocabulary tagging. GWS = Grondwuertschatz. These are the
 * categories that correspond to the CEFR level the Sproochentest speaking part
 * is set at, so they define the vocabulary items may be authored from.
 */
const CORE_CATEGORIES = ['GWS A1', 'GWS A2', 'A1', 'A2'];

module.exports = {
  ROOT,
  CACHE_DIR,
  MANIFEST_PATH,
  CONTENT_DIR,
  CORPUS_PATH,
  LEXICON_PATH,
  ITEMS_DIR,
  AUDIO_CACHE_PATH,
  DATASETS,
  CORE_CATEGORIES,
};

module.exports.datasetXmlPath = (key) => path.join(CACHE_DIR, `${key}.xml`);
