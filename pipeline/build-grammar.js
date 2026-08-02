#!/usr/bin/env node
'use strict';

/**
 * The grammar deck — noun gender, the n-rule, and adjective agreement.
 *
 * Same rule as everywhere else in this pipeline: **it never authors
 * Luxembourgish.** Every option in every exercise is either a value LOD itself
 * assigned (a noun's `gender`/`article` in the corpus) or a span copied
 * verbatim out of a real LOD example sentence. Nothing here is generated,
 * inflected, conjugated or "corrected" by this script — that is exactly the
 * operation `pipeline/README.md` rules out, because the validator is a
 * form-level gate: it cannot tell a well-formed invented sentence from a wrong
 * one, only a real word from a fake one.
 *
 * Three item kinds, three different sources:
 *
 *   gender     — read straight off content/items/vocab.json. Zero mining: the
 *                gender and article are already there, on every noun, unused
 *                by any screen until now.
 *   nrule      — mined from content/corpus.json's own example sentences.
 *                For each adjacent word pair, lib/nrule.js's checker is asked
 *                whether the n-rule is being followed *correctly* there (not
 *                whether it is violated - that is validate.js's job). A pair
 *                the checker has nothing to say about is a clean, real
 *                instance of the rule, and both the kept-n and dropped-n
 *                spellings are independently confirmed against the lexicon
 *                before either is offered as an option.
 *   adjective  — mined the same way cloze.js already finds a word inside its
 *                own example: for each adjective, every one of its own
 *                examples is checked for which surface form actually
 *                appears (base, or a declined variant, whichever LOD wrote).
 *                An adjective attested in two or more different forms across
 *                its own examples yields an agreement item - "which form did
 *                LOD actually use here" - with the other attested forms as
 *                the (real, just wrong-here) distractors.
 *
 *   node pipeline/build-grammar.js
 */

const crypto = require('node:crypto');
const path = require('node:path');
const fsp = require('node:fs/promises');

const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');
const { tokenise, sentences } = require('./lib/lux-text');
const { createChecker, startsTrigger, hasOpaqueOnset } = require('./lib/nrule');
const { locateTarget, spanOf } = require('./lib/cloze');
const { makeGate } = require('./lib/gate');

const OUT_CONTENT = path.join(paths.ITEMS_DIR, 'grammar.json');
const OUT_APP = path.join(paths.ROOT, 'app', 'data', 'grammar.json');

const GENDERS = ['M', 'F', 'N'];

/** Per-pair and overall caps, so one very common word does not crowd out the
 * rest of the deck — variety of *lemmas* teaches the rule; repeating "hien"
 * three hundred times against three hundred different next words does not. */
const MAX_PER_NRULE_PAIR = 2;
const MAX_NRULE_ITEMS = 250;
const MAX_ADJECTIVE_OPTIONS = 4;

function shortHash(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 10);
}

/** A stable, non-random but non-fixed 0/1/2/… rotation, so "the first option
 * is always correct" is never learnable as a shortcut. Derived from the id
 * rather than Math.random so the build stays reproducible. */
function rotate(id, length) {
  const n = parseInt(shortHash(id).slice(0, 4), 16);
  return n % length;
}

/* ------------------------------------------------------------------ gender */

/**
 * "What gender is this word" — straight off the Learn vocab deck. A noun with
 * one of the three plain genders (the ambiguous MF/FN/MN entries are dropped:
 * they do not have one right answer, and a quiz item without one teaches
 * confusion, not grammar).
 */
function genderItems(vocab) {
  const items = [];
  for (const word of vocab) {
    if (word.pos !== 'SUBST') continue;
    if (!GENDERS.includes(word.gender)) continue;
    if (!word.article || !word.example?.lb) continue;

    const id = `gr-gender-${word.id}`;
    const correct = GENDERS.indexOf(word.gender);
    items.push({
      id,
      kind: 'gender',
      lb: word.lb,
      article: word.article,
      gender: word.gender,
      options: GENDERS,
      correct,
      en: word.en,
      example: word.example,
      entryId: word.id,
      level: word.level,
    });
  }
  return items;
}

/* ------------------------------------------------------------------- nrule */

/**
 * Real adjacent-word pairs from the corpus's own sentences where the n-rule
 * is being followed correctly - the mirror image of what validate.js's
 * checkNRule flags. A pair the checker raises no finding about is not
 * "unchecked", it is a clean, real instance either direction: an n kept
 * before a trigger, or dropped before a non-trigger.
 */
function nRuleItems(corpus, lexicon) {
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });
  const forms = lexicon.forms;
  // The same gate build-vocab.js and build-verbs.js already run their own
  // examples through: a sentence that mentions a word outside the lexicon
  // (a rare compound, a proper noun) elsewhere in it is dropped whole, rather
  // than shipping "before"/"after" context the validator would fail on -
  // this script is expected to generate only what already passes its own
  // gate, the same discipline build-items.js documents for listening clips.
  const isClean = makeGate(lexicon);

  const perPair = new Map(); // "full|dropped" -> count kept so far
  const seenSentencePair = new Set();
  const items = [];

  outer: for (const entry of corpus.entries) {
    for (const meaning of entry.meanings) {
      for (const example of meaning.examples) {
        if (!example.text) continue;
        for (const sentence of sentences(example.text)) {
          const tokens = tokenise(sentence);
          const flagged = new Set(checker.checkTokens(tokens).map((f) => `${f.token}|${f.next}`));

          for (let i = 0; i < tokens.length - 1; i += 1) {
            const token = tokens[i];
            const next = tokens[i + 1];
            if (!next || token.pauseAfter || token.isClitic) continue;
            const following = next.clitic ? next.clitic : next.value;
            if (hasOpaqueOnset(next.value)) continue;
            if (flagged.has(`${token.raw}|${next.raw}`)) continue;

            let fullForm = null;
            let droppedForm = null;
            let correctIsFull = null;
            if (checker.isFullForm(token.value) && startsTrigger(following)) {
              fullForm = token.value;
              droppedForm = token.value.slice(0, -1);
              correctIsFull = true;
            } else if (checker.isDroppedForm(token.value) && !token.value.toLowerCase().endsWith('n') && !startsTrigger(following)) {
              droppedForm = token.value;
              fullForm = `${token.value}n`;
              correctIsFull = false;
            } else {
              continue;
            }
            if (fullForm.toLowerCase() === droppedForm.toLowerCase()) continue;
            // Both spellings must be independently real, not just derived by
            // this script adding or removing a letter.
            if (!forms[fullForm.toLowerCase()] || !forms[droppedForm.toLowerCase()]) continue;

            const pairKey = `${fullForm.toLowerCase()}|${droppedForm.toLowerCase()}`;
            const sentenceKey = `${pairKey}|${sentence}`;
            if (seenSentencePair.has(sentenceKey)) continue;
            if ((perPair.get(pairKey) ?? 0) >= MAX_PER_NRULE_PAIR) continue;
            if (!isClean(sentence)) continue;

            const span = spanOf(sentence, token.raw);
            if (!span) continue;

            const id = `gr-nrule-${shortHash(sentenceKey)}`;
            const attested = token.raw;
            const alt = correctIsFull ? droppedForm : fullForm;
            const flip = rotate(id, 2) === 1;
            const options = flip ? [alt, attested] : [attested, alt];

            items.push({
              id,
              kind: 'nrule',
              before: sentence.slice(0, span.start),
              after: sentence.slice(span.end),
              options_lb: options,
              correct: flip ? 1 : 0,
              entryId: entry.id,
            });

            seenSentencePair.add(sentenceKey);
            perPair.set(pairKey, (perPair.get(pairKey) ?? 0) + 1);
            if (items.length >= MAX_NRULE_ITEMS) break outer;
          }
        }
      }
    }
  }
  return items;
}

/* --------------------------------------------------------------- adjective */

/**
 * Adjective agreement, taught the only honest way this corpus allows: not by
 * generating a declension table, but by asking which of an adjective's own
 * *attested* forms LOD actually wrote in one specific sentence. Every option
 * is a span some other real LOD sentence uses for the same lemma - wrong here,
 * but never invented.
 */
function adjectiveItems(corpus, lexicon) {
  const isClean = makeGate(lexicon);
  const items = [];

  for (const entry of corpus.entries) {
    if (entry.partOfSpeech !== 'ADJ') continue;

    // form (lowercased) -> one representative occurrence
    const attested = new Map();
    for (const meaning of entry.meanings) {
      for (const example of meaning.examples) {
        if (!example.text || !isClean(example.text)) continue;
        const located = locateTarget(lexicon, entry.id, entry.lemma, example.text);
        if (!located) continue;
        const key = located.form.toLowerCase();
        if (!attested.has(key)) attested.set(key, { ...located, sentence: example.text });
      }
    }

    const forms = [...attested.values()];
    if (forms.length < 2) continue; // nothing to contrast

    const glosses = entry.glosses?.en ?? [];
    const en = glosses[0] ?? null;

    // One item per attested form, contrasted against the others (capped) -
    // so "schlechten" is drilled as the right answer once, not once per pair.
    for (const target of forms) {
      const distractorForms = forms.filter((f) => f !== target).map((f) => f.form);
      const options = [target.form, ...distractorForms].slice(0, MAX_ADJECTIVE_OPTIONS);
      if (options.length < 2) continue;

      const id = `gr-adj-${shortHash(`${entry.id}|${target.sentence}`)}`;
      const correctPosition = rotate(id, options.length);
      const rotated = [...options];
      [rotated[0], rotated[correctPosition]] = [rotated[correctPosition], rotated[0]];

      items.push({
        id,
        kind: 'adjective',
        before: target.before,
        after: target.after,
        options_lb: rotated,
        correct: correctPosition,
        entryId: entry.id,
        en,
      });
    }
  }
  return items;
}

/* ------------------------------------------------------------------------ */

async function main() {
  const [vocab, corpus, lexicon] = await Promise.all([
    fsp.readFile(path.join(paths.ITEMS_DIR, 'vocab.json'), 'utf8').then(JSON.parse),
    fsp.readFile(paths.CORPUS_PATH, 'utf8').then(JSON.parse),
    fsp.readFile(paths.LEXICON_PATH, 'utf8').then(JSON.parse),
  ]);

  const gender = genderItems(vocab.items);
  const nrule = nRuleItems(corpus, lexicon);
  const adjective = adjectiveItems(corpus, lexicon);
  const items = [...gender, ...nrule, ...adjective];

  console.log(`grammar: ${gender.length} gender, ${nrule.length} n-rule, ${adjective.length} adjective-agreement (${items.length} total)`);

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-grammar.js',
      note:
        'Every option is either a value LOD itself assigned (noun gender/article) or a span copied ' +
        'verbatim from a real LOD example sentence. Nothing here is generated, inflected or corrected ' +
        'by this script - see the file header.',
      counts: { gender: gender.length, nrule: nrule.length, adjective: adjective.length, total: items.length },
    },
    items,
  };

  await writeJson(OUT_CONTENT, payload);
  await writeJson(OUT_APP, payload);
  console.log(`wrote ${path.relative(paths.ROOT, OUT_CONTENT)} and ${path.relative(paths.ROOT, OUT_APP)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { genderItems, nRuleItems, adjectiveItems };
