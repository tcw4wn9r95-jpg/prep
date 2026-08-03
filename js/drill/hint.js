/**
 * The hint: one other word in the sentence, translated.
 *
 * A drill card shows a real LOD sentence the learner mostly cannot read. The
 * useful help is not the answer and not a full translation — it is a foothold:
 * one word of the surrounding sentence, so the sentence stops being a wall and
 * the answer becomes inferable rather than guessable.
 *
 * Two rules make it a hint rather than a giveaway:
 *
 *   1. never the word being asked for, and
 *   2. never a word that appears among the options — in either language,
 *      because some cards offer English glosses and some offer Luxembourgish
 *      forms, and a hint reading "Buch = book" next to an option reading
 *      "book" has answered the question.
 *
 * **Nothing here is translated by this file.** Every gloss is one LOD already
 * publishes, read out of the decks this app already ships. That is also why
 * the lookup is deliberately narrow — see `buildGlossary`.
 */

/**
 * Parts of speech a hint may come from.
 *
 * Content words only. The function words are where a spelling-based lookup
 * goes wrong: `de` is a masculine article on nearly every page of the corpus,
 * but it is also a clitic form of `du`, so the vocab deck glosses the spelling
 * as "you" — and a hint saying `de = you` under "de ganzen Dag" teaches
 * something false. A wrong hint is worse than no hint, so they are excluded
 * wholesale rather than disambiguated by a rule we cannot verify.
 */
const CONTENT_POS = new Set(['SUBST', 'VRB', 'ADJ', 'ADV']);

/**
 * Shortest spelling worth glossing. Below four characters the Luxembourgish
 * function words (`et`, `an`, `se`, `mir`, `dat`) dominate, and they are
 * exactly the ambiguous ones.
 */
const MIN_LENGTH = 4;

/**
 * spelling → English, for spellings that mean exactly one thing.
 *
 * A spelling claimed by more than one deck entry is dropped: with only the
 * surface form to go on there is no way to tell which entry a sentence meant,
 * and picking either is a coin flip presented as a fact. That costs coverage —
 * roughly 1,490 of 2,015 spellings survive, and about 70% of sentences end up
 * with at least one hintable word — which is the right side of this repo's own
 * rule that fewer correct items beat a full-looking tree.
 *
 * @param {Array} vocab app/data/vocab.json items
 * @param {Array} verbs app/data/verbs.json items
 */
export function buildGlossary(vocab = [], verbs = []) {
  /** @type {Map<string, Array<{en: string, pos: string}>>} */
  const claims = new Map();
  const claim = (form, entry) => {
    if (!form || !entry.en) return;
    const key = form.toLowerCase();
    const list = claims.get(key);
    if (list) list.push(entry);
    else claims.set(key, [entry]);
  };

  for (const item of vocab) claim(item.lb, { en: item.en, pos: item.pos });
  for (const item of verbs) claim(item.infinitive, { en: item.en, pos: 'VRB' });

  const glossary = new Map();
  for (const [form, entries] of claims) {
    if (entries.length !== 1) continue; // ambiguous spelling
    const [entry] = entries;
    if (!CONTENT_POS.has(entry.pos)) continue;
    if (form.length < MIN_LENGTH) continue;
    glossary.set(form, entry.en);
  }
  return glossary;
}

const WORD = /[\p{L}][\p{L}'’-]*/gu;

function normalise(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Picks the hint for a card, or null when the sentence offers none.
 *
 * Ties break toward the longest word, which in practice means a noun — the
 * most contentful thing in the sentence and the one most worth knowing.
 *
 * @param {Map<string,string>} glossary from `buildGlossary`
 * @param {string} sentence the sentence on the card
 * @param {{exclude?: Array<string|null|undefined>}} [options] words that would
 *   give the answer away: the target, and every option shown
 * @returns {{lb: string, en: string}|null}
 */
export function hintFor(glossary, sentence, { exclude = [] } = {}) {
  if (!glossary || !sentence) return null;

  // Excluded in both languages: the options on a gloss card are English and
  // the options on a cloze card are Luxembourgish, and the hint prints both
  // sides, so either one can leak.
  const banned = new Set();
  for (const value of exclude) {
    const text = normalise(value);
    if (!text) continue;
    banned.add(text);
    // An option can be a phrase ("d'Kand", "to have"); ban its words too, so a
    // hint cannot quote half of one back.
    for (const word of text.match(WORD) ?? []) banned.add(word);
  }

  const seen = new Set();
  let best = null;
  for (const word of String(sentence).match(WORD) ?? []) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (banned.has(key)) continue;
    const en = glossary.get(key);
    if (!en) continue;
    // The gloss itself must not be an option either.
    if (banned.has(normalise(en))) continue;
    if (!best || word.length > best.lb.length) best = { lb: word, en };
  }
  return best;
}
