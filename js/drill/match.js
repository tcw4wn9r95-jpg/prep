/**
 * Comparing a typed answer to the corpus form.
 *
 * The tension: this project treats Luxembourgish spelling as load-bearing —
 * the whole pipeline exists so that no misspelled form ever reaches the UI —
 * but on a phone, `ë`, `é` and `ä` are three taps behind a long-press each. A
 * drill that rejects "letzebuergesch" for missing two diacritics stops being a
 * vocabulary drill and starts being a keyboard drill.
 *
 * So there are three outcomes, not two:
 *
 *   exact   — right, promote normally
 *   partial — right apart from diacritics: the meaning was retrieved, so it
 *             counts, but the box does not advance and the correct spelling is
 *             shown. The word comes back soon with the accents still to prove.
 *   wrong   — anything else
 *
 * Casing is ignored throughout. Luxembourgish capitalises nouns, and that is
 * worth teaching, but not worth failing someone over mid-drill — the article
 * card is where gender and form are actually tested.
 */

/** Unicode-normalised, trimmed, punctuation-stripped, case-folded. */
export function normalise(value) {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/^[«"'”“„([]+/, '')
    .replace(/[.,!?;:…»"'”“)\]]+$/, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('lb');
}

/** Same, with every diacritic decomposed away: "gënschteg" → "gunschteg". */
export function stripDiacritics(value) {
  return normalise(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .normalize('NFC');
}

/**
 * @param {string} input what the learner typed
 * @param {string} expected the corpus form
 * @returns {{correct: boolean, partial: boolean, reason: 'exact'|'accents'|'wrong'}}
 */
export function checkTyped(input, expected) {
  if (normalise(input) === normalise(expected)) {
    return { correct: true, partial: false, reason: 'exact' };
  }
  if (stripDiacritics(input) === stripDiacritics(expected) && stripDiacritics(expected) !== '') {
    return { correct: true, partial: true, reason: 'accents' };
  }
  return { correct: false, partial: false, reason: 'wrong' };
}

/**
 * The letter tiles for a build-it card: the answer's own letters, shuffled,
 * padded with decoys drawn from the alphabet the answer already uses.
 *
 * Decoys matter — a bank holding exactly the right letters can be solved by
 * elimination once two tiles are left, which tests ordering rather than recall.
 */
export function letterBank(answer, { decoys = 4, random = Math.random } = {}) {
  const letters = [...String(answer).replace(/\s+/g, '')];
  const alphabet = [...new Set([...letters, ...'aeiounrstlhgdmbkwfzpvéëäö'])];
  const extra = Array.from({ length: decoys }, () => alphabet[Math.floor(random() * alphabet.length)]);
  return shuffle([...letters, ...extra], random).map((character, index) => ({ id: `${index}:${character}`, character }));
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
