'use strict';

/**
 * The sentence skeleton.
 *
 * `content/corpus.json` is built from the LOD entries carrying the
 * Grondwuertschatz `GWS A1`/`GWS A2` tags. That is the right source for
 * *content* words, and the wrong source for the words that hold a sentence
 * together: LOD does not give the personal pronouns their own dictionary
 * entries at all, so `ech`, `du`, `hien`, `mir` were missing from the deck
 * entirely, and `net` was filtered out for being a particle.
 *
 * The effect was a deck you could not build a single sentence from. It offered
 * `Wunngemeinschaft` ("houseshare") before it offered "I".
 *
 * So these are listed explicitly. **Nothing here is authored Luxembourgish**:
 * every `lb` below is looked up in `content/lexicon.json` at build time and the
 * build fails if it is not there, which pins each one to a real LOD record id.
 * The English glosses are ours to write, as the language rule allows.
 *
 * The list is deliberately short. It is the glue, not a vocabulary — the words
 * that turn a pile of nouns into "ech hunn eng Aarbecht".
 */

/**
 * @typedef {{lb: string, en: string, fr: string, pos: string, note?: string}} Starter
 */

/** @type {Starter[]} */
const STARTERS = [
  // Who is doing it. Without these nothing else can be said.
  { lb: 'ech', en: 'I', fr: 'je', pos: 'PRON' },
  { lb: 'du', en: 'you', fr: 'tu', pos: 'PRON' },
  { lb: 'hien', en: 'he', fr: 'il', pos: 'PRON' },
  { lb: 'si', en: 'she / they', fr: 'elle / ils', pos: 'PRON' },
  { lb: 'hatt', en: 'it', fr: 'il / elle', pos: 'PRON' },
  { lb: 'mir', en: 'we', fr: 'nous', pos: 'PRON' },
  { lb: 'dir', en: 'you (plural)', fr: 'vous', pos: 'PRON' },

  // Yes, no, and not — the first three things you can answer with.
  { lb: 'jo', en: 'yes', fr: 'oui', pos: 'PART' },
  { lb: 'nee', en: 'no', fr: 'non', pos: 'PART' },
  { lb: 'net', en: 'not', fr: 'ne … pas', pos: 'PART' },

  // Asking. An A2 interview is mostly answering these, so recognising them
  // instantly matters more than almost any noun.
  { lb: 'wat', en: 'what', fr: 'quoi', pos: 'PRON' },
  { lb: 'wien', en: 'who', fr: 'qui', pos: 'PRON' },
  { lb: 'wou', en: 'where', fr: 'où', pos: 'ADV' },
  { lb: 'wéini', en: 'when', fr: 'quand', pos: 'ADV' },
  { lb: 'firwat', en: 'why', fr: 'pourquoi', pos: 'ADV' },

  // Joining two ideas.
  { lb: 'an', en: 'and', fr: 'et', pos: 'CONJ' },
  { lb: 'awer', en: 'but', fr: 'mais', pos: 'CONJ' },
  { lb: 'well', en: 'because', fr: 'parce que', pos: 'CONJ' },
  { lb: 'och', en: 'also', fr: 'aussi', pos: 'ADV' },

  // When and where, in the loosest sense.
  { lb: 'elo', en: 'now', fr: 'maintenant', pos: 'ADV' },
  { lb: 'haut', en: 'today', fr: "aujourd'hui", pos: 'ADV' },
  { lb: 'muer', en: 'tomorrow', fr: 'demain', pos: 'ADV' },
  { lb: 'gëschter', en: 'yesterday', fr: 'hier', pos: 'ADV' },
  { lb: 'hei', en: 'here', fr: 'ici', pos: 'ADV' },

  // Quantity and judgement — enough to say whether something was good.
  { lb: 'vill', en: 'a lot', fr: 'beaucoup', pos: 'ADV' },
  { lb: 'wéineg', en: 'little, few', fr: 'peu', pos: 'ADV' },
  { lb: 'gutt', en: 'good', fr: 'bon', pos: 'ADJ' },
  { lb: 'schlecht', en: 'bad', fr: 'mauvais', pos: 'ADJ' },
];

/**
 * Marks the sentence skeleton across a deck.
 *
 * Most of these words *are* already in the Grondwuertschatz — `gutt`, `haut`,
 * `wat`, `an` — complete with an example sentence and a native recording. Those
 * are promoted in place rather than duplicated: a hand-written stub with no
 * audio would be strictly worse than the corpus entry sitting next to it, and
 * two cards reading `haut = today` is just a bug the learner has to live with.
 *
 * Only what the corpus genuinely lacks — the personal pronouns, which LOD gives
 * no dictionary entry of their own — is synthesised, and then only if the form
 * resolves in the lexicon, which pins it to a real LOD record id.
 *
 * Throws rather than skipping a missing one: this is the single place in the
 * pipeline where Luxembourgish is named by hand, so it gets the strictest check.
 *
 * @param {Array} items the existing deck
 * @param {{forms: Record<string,string>}} lexicon
 * @param {(text: string, field?: string) => boolean} isClean
 * @returns {{items: Array, promoted: number, added: number}}
 */
function applyStarters(items, lexicon, isClean) {
  const byLemma = new Map();
  for (const item of items) {
    const key = String(item.lb ?? '').toLowerCase();
    // Prefer the entry a beginner is better served by: one with a recorded
    // example sentence beats one without.
    const existing = byLemma.get(key);
    if (!existing || (!existing.example?.audioId && item.example?.audioId)) byLemma.set(key, item);
  }

  const marked = new Set();
  const added = [];
  const missing = [];

  for (const starter of STARTERS) {
    const key = starter.lb.toLowerCase();
    const existing = byLemma.get(key);
    if (existing) {
      marked.add(existing.id);
      continue;
    }

    const hit = lexicon.forms[starter.lb] ?? lexicon.forms[key];
    if (!hit || !isClean(starter.lb, 'lb')) {
      missing.push(starter.lb);
      continue;
    }
    const lodId = hit.slice(hit.indexOf(':') + 1);
    added.push({
      // Namespaced so it can never collide with a corpus entry id, and so the
      // provenance of these items stays obvious in the committed JSON.
      id: `START-${lodId}`,
      lodId,
      lb: starter.lb,
      pos: starter.pos,
      gender: null,
      article: null,
      level: 'A1',
      en: starter.en,
      fr: starter.fr,
      de: null,
      example: null,
      starter: true,
    });
  }

  if (missing.length > 0) {
    throw new Error(
      `starters not found in the lexicon: ${missing.join(', ')}. ` +
        'Every starter must trace to a LOD record - fix the spelling or drop the word, do not loosen this check.',
    );
  }

  return {
    items: [...added, ...items.map((item) => (marked.has(item.id) ? { ...item, starter: true } : item))],
    promoted: marked.size,
    added: added.length,
  };
}

module.exports = { STARTERS, applyStarters };
