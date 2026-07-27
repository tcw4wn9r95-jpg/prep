'use strict';

/**
 * Tokenising Luxembourgish for validation.
 *
 * The validator needs two things the naive `split(/\s+/)` does not give it:
 *   1. clitics split off, because LOD writes the article attached ("d'Aen")
 *      but indexes the bare form ("Aen");
 *   2. a record of whether a token was followed by punctuation, because the
 *      Eifeler Regel is a sandhi rule and a pause suspends it.
 */

// Only these clitic prefixes occur in the LOD example corpus: d' (20805x)
// and z' (41x). Anything else is left attached and will fail the lexicon gate
// loudly rather than being silently stripped.
const CLITIC_RE = /^([dz])'/i;

const LETTER = "\\p{L}";
const WORD_RE = new RegExp(`^[${LETTER}][${LETTER}\\-]*$`, 'u');

const TRAILING_PUNCT_RE = /[.,!?;:…»"'”“„)\]]+$/;
const LEADING_PUNCT_RE = /^[«"'”“„(\[]+/;

/** True for tokens made of letters (and internal hyphens) - what we validate. */
function isWordToken(value) {
  return WORD_RE.test(value);
}

/**
 * Splits a sentence into validation tokens.
 *
 * Returns `[{ value, clitic, index, pauseAfter, raw }]` where `value` is the
 * bare form to look up, `clitic` is the stripped prefix (e.g. `d'`) or null,
 * and `pauseAfter` is true when punctuation or end-of-string follows.
 */
function tokenise(sentence) {
  const tokens = [];
  const chunks = String(sentence).split(/\s+/).filter(Boolean);

  chunks.forEach((chunk, chunkIndex) => {
    const leadStripped = chunk.replace(LEADING_PUNCT_RE, '');
    const trailingMatch = leadStripped.match(TRAILING_PUNCT_RE);
    const core = trailingMatch ? leadStripped.slice(0, -trailingMatch[0].length) : leadStripped;
    if (core === '') return;

    // A pause is punctuation on this token, or the end of the sentence.
    const pauseAfter = Boolean(trailingMatch) || chunkIndex === chunks.length - 1;

    const cliticMatch = core.match(CLITIC_RE);
    if (!cliticMatch) {
      tokens.push({ value: core, clitic: null, raw: core, pauseAfter, isClitic: false });
      return;
    }

    const clitic = cliticMatch[0];
    const rest = core.slice(clitic.length);
    // The clitic is glued to its host, so it never ends a phrase itself.
    tokens.push({ value: clitic.slice(0, -1), clitic: null, raw: clitic, isClitic: true, pauseAfter: rest === '' ? pauseAfter : false });
    if (rest !== '') {
      tokens.push({ value: rest, clitic, raw: core, pauseAfter, isClitic: false });
    }
  });

  return tokens.map((token, index) => ({ ...token, index }));
}

/**
 * Splits a document into sentences on terminal punctuation. Used so the
 * n-rule engine never looks across a sentence boundary.
 */
function sentences(text) {
  return String(text)
    .split(/(?<=[.!?…])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

module.exports = { tokenise, sentences, isWordToken };
