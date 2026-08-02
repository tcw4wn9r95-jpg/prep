'use strict';

/**
 * Finding a word inside its own example sentence, so the app can gap it out.
 *
 * A flashcard that shows a word next to its translation teaches the pair. A
 * gapped sentence — "mir haten d'Boma bis zum Schluss bei eis am ____" — makes
 * you retrieve the word from meaning, in context, with the native recording
 * playing. That is a strictly harder retrieval than picking one of four
 * glosses, and it needs no new content: every vocab item already carries a
 * corpus example and 2,019 of them already carry a mirrored recording of it.
 *
 * The hard part is that LOD examples use inflected forms. AKAFEN1's own
 * example contains "akaaft", not "akafen", so a naive indexOf(lemma) misses
 * about one entry in eight. The lexicon's form index is what resolves it: it
 * maps every accepted form back to the entry it belongs to, which is exactly
 * the question being asked here.
 *
 * Nothing in this module authors Luxembourgish. It only ever slices a sentence
 * that is already in the corpus.
 */

const { tokenise } = require('./lux-text');

/**
 * The entry a lexicon form belongs to. Values look like `spelling:AKAFEN1` or
 * `inflection:AKAFEN1`; only the id half matters here.
 */
function entryIdOfForm(lexicon, token) {
  const hit = lexicon.forms[token] ?? lexicon.forms[token.toLowerCase()];
  return hit ? hit.slice(hit.indexOf(':') + 1) : null;
}

/**
 * Locates `lemma` (entry `entryId`) inside `sentence`.
 *
 * Two strategies, tried in order, and which one fired is recorded so the
 * generated JSON stays auditable:
 *
 *   `lexicon` — a token resolves through the form index to this exact entry.
 *               Catches inflections, and is the only evidence that is actually
 *               proof rather than string coincidence.
 *   `surface` — the token is the lemma spelled out. The fallback for entries
 *               whose form index points at a homograph sibling (`al` resolves
 *               to a different AL* entry than the one being built), where the
 *               match is still unambiguous because the spelling is identical.
 *
 * Returns `{ before, form, after, via }` with `before + form + after` exactly
 * reconstructing the input, or `null` when the word cannot be found — in which
 * case the caller ships no cloze rather than guessing at one.
 */
function locateTarget(lexicon, entryId, lemma, sentence) {
  const text = String(sentence);
  const tokens = tokenise(text).filter((token) => !token.isClitic);
  if (tokens.length === 0) return null;

  const byLexicon = tokens.find((token) => entryIdOfForm(lexicon, token.value) === entryId);
  const target = byLexicon ?? tokens.find((token) => token.value.toLowerCase() === String(lemma).toLowerCase());
  if (!target) return null;

  const span = spanOf(text, target.value);
  if (!span) return null;

  return {
    before: text.slice(0, span.start),
    form: text.slice(span.start, span.end),
    after: text.slice(span.end),
    via: byLexicon ? 'lexicon' : 'surface',
  };
}

/**
 * Character offsets of `value` in `text`, as a whole word.
 *
 * tokenise() reports token order, not offsets, and it strips clitics and
 * punctuation — so the surface form has to be located again here. The word
 * boundary check is what stops "Aen" matching inside "Aendokter"; it is done
 * with explicit letter tests rather than \b because \b does not understand
 * ë/é/ä.
 */
function spanOf(text, value) {
  let from = 0;
  for (;;) {
    const start = text.indexOf(value, from);
    if (start === -1) return null;
    const end = start + value.length;
    if (!isLetter(text[start - 1]) && !isLetter(text[end])) return { start, end };
    from = start + 1;
  }
}

const LETTER_RE = /\p{L}/u;

function isLetter(character) {
  return typeof character === 'string' && LETTER_RE.test(character);
}

module.exports = { locateTarget, entryIdOfForm, spanOf };
