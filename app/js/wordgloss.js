/**
 * What one Luxembourgish word means — for the Sentence Builder's word flip.
 *
 * Two sources, in this order:
 *
 *   1. `content/hand-authored/word-english.json`, authored English for the
 *      forms the decks cannot reach or reach wrongly.
 *   2. the vocab and verb decks, joined on the surface spelling.
 *
 * The authored file wins, and it has to. The decks gloss the spelling `de` as
 * "you" — correctly, it is also a clitic of `du` — while in nearly every
 * sentence here it is the masculine article, so a lookup that trusted the deck
 * would flip "de Mount" to "you" and teach something false. `drill/hint.js`
 * refuses to gloss such spellings at all, which is right for a hint that
 * appears uninvited; this is a word the learner has deliberately tapped, so
 * saying "the / you" is better than saying nothing.
 *
 * ## Why an ambiguous spelling is never silently resolved
 *
 * A spelling claimed by two deck entries — `hunn` is both "to have" and a
 * cockerel — is dropped rather than guessed. Picking either is a coin flip
 * presented as a fact, and the whole point of a tap-to-translate is that the
 * learner believes what comes back. Where a form genuinely has two common
 * readings the authored file gives both, the way a dictionary does.
 */

/** Strip the punctuation a tile carries, and fold the two apostrophes into one. */
export function formKey(word) {
  return String(word ?? '')
    .normalize('NFC')
    .replace(/[’ʼ]/g, "'")
    .replace(/^[«"'”“„([]+/, '')
    .replace(/[.,!?;:…»"”“)\]]+$/, '')
    .toLocaleLowerCase('lb');
}

/**
 * form → English.
 *
 * @param {object} authored the `words` map of word-english.json
 * @param {Array} vocab app/data/vocab.json items
 * @param {Array} verbs app/data/verbs.json items
 */
export function buildWordGlossary(authored = {}, vocab = [], verbs = []) {
  /** @type {Map<string, Set<string>>} */
  const claims = new Map();
  const claim = (form, en) => {
    if (!form || !en) return;
    const key = formKey(form);
    if (!key) return;
    const found = claims.get(key);
    if (found) found.add(en);
    else claims.set(key, new Set([en]));
  };

  for (const item of vocab) {
    claim(item.lb, item.en);
    // The form the sentence actually used, where the deck recorded one.
    if (item.cloze?.form) claim(item.cloze.form, item.en);
  }
  for (const item of verbs) {
    claim(item.infinitive, item.en);
    claim(item.pastParticiple, item.en);
    for (const form of Object.values(item.present ?? {})) claim(form, item.en);
  }

  const glossary = new Map();
  for (const [form, entries] of claims) {
    if (entries.size !== 1) continue; // ambiguous spelling — see the header
    glossary.set(form, [...entries][0]);
  }
  // Authored last, so it overrides both a wrong single claim and a dropped
  // ambiguous one.
  for (const [form, en] of Object.entries(authored)) {
    const key = formKey(form);
    if (key && en) glossary.set(key, en);
  }
  return glossary;
}

/**
 * The English for a tile's word, or null when nothing trustworthy is known.
 *
 * The one piece of morphology applied here is the clitic article: `d'Kanner`,
 * `d'Woch`, `d'Aen` are the definite article written onto the front of the
 * noun, and the decks gloss the noun. Splitting it off and saying "the …" is
 * reading Luxembourgish, not writing it — the noun's gloss is still LOD's and
 * the article is still what the text says. Everything else is looked up whole,
 * because guessing at endings is how a gloss becomes fiction.
 */
export function glossFor(glossary, word) {
  const key = formKey(word);
  if (!key) return null;
  const direct = glossary?.get(key);
  if (direct) return direct;

  const clitic = /^d'(.+)$/.exec(key);
  if (clitic) {
    const noun = glossary?.get(clitic[1]);
    if (noun) return `the ${noun}`;
  }
  return null;
}
