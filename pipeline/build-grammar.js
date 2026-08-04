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

/** The two perfect auxiliaries, as LOD's tables name them. */
const AUXILIARIES = ['hunn', 'sinn'];

/** Finite forms of those two. A sentence needs one of these before a
 * participle-looking word can be treated as a perfect rather than as an
 * adjective that happens to share the spelling. Every form here is one of the
 * `present` cells LOD publishes for hunn and sinn, plus their two preterites,
 * and `assertAttested` in main() refuses to build if any drifts out of the
 * lexicon. */
const FINITE_AUX_FORMS = new Set(['hunn', 'hu', 'hues', 'huet', 'hutt', 'hat', 'haten', 'sinn', 'si', 'bass', 'ass', 'sidd', 'war', 'waren']);

/**
 * Verbs whose perfect is not a useful question: the two auxiliaries themselves
 * (circular), and the modals, whose participle equals their infinitive and
 * whose perfect is a construction well past A2.
 */
const NOT_WORTH_ASKING = new Set(['hunn', 'sinn', 'ginn', 'kënnen', 'mussen', 'sollen', 'wëllen', 'däerfen', 'wëssen']);

/** `net`. Named here because negation items are found by looking for it. */
const NEGATOR = 'net';

const MAX_PER_PERFECT_VERB = 2;
const MAX_PERFECT_FORM_ITEMS = 300;
const MAX_ORDER_ITEMS = 220;
const MAX_NEGATION_ITEMS = 180;

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


/**
 * Refuses to build if a word this file names by hand is not in the lexicon.
 *
 * Everything else here is copied out of the corpus, so a typo shows up as a
 * missing item. These few are *search keys* — get one wrong and the build
 * quietly mines the wrong sentences, or none, and still succeeds.
 */
function assertAttested(lexicon, words) {
  const missing = [...new Set(words)].filter((word) => !lexicon.forms[word.toLowerCase()]);
  if (missing.length > 0) {
    throw new Error(`build-grammar names ${missing.length} form(s) the lexicon does not attest: ${missing.join(', ')}`);
  }
}

/* ----------------------------------------------------------------- perfect */

/**
 * Which auxiliary a verb takes in the perfect — hunn or sinn.
 *
 * Zero mining, exactly like `gender`: LOD's Flexiounstabellen already record
 * `auxiliaryVerb` and `pastParticiple` for 364 of the 365 verbs, and no screen
 * has ever used either. This is the fact a learner has to memorise per verb,
 * and the A2 interview asks for the past directly.
 */
function perfectAuxItems(verbs) {
  const items = [];
  for (const verb of verbs) {
    if (!verb.auxiliaryVerb || !verb.pastParticiple || !verb.en) continue;
    if (!AUXILIARIES.includes(verb.auxiliaryVerb)) continue;
    // A participle LOD writes two ways cannot illustrate one answer cleanly.
    if (verb.pastParticiple.includes('/')) continue;
    // "Does hunn take hunn or sinn?" is circular, and the modals' participles
    // are identical to their infinitives, so the card would show the answer in
    // its own prompt. Both are also constructions past A2.
    if (NOT_WORTH_ASKING.has(verb.infinitive)) continue;
    if (verb.pastParticiple.toLowerCase() === verb.infinitive.toLowerCase()) continue;

    const id = `gr-perfaux-${verb.id}`;
    const flip = rotate(id, 2) === 1;
    const options = flip ? [...AUXILIARIES].reverse() : [...AUXILIARIES];
    items.push({
      id,
      kind: 'perfect-aux',
      lb: verb.infinitive,
      participle: verb.pastParticiple,
      en: verb.en,
      options_lb: options,
      correct: options.indexOf(verb.auxiliaryVerb),
      entryId: verb.id,
      level: verb.level,
    });
  }
  return items;
}

/**
 * The participle itself, gapped out of a real perfect sentence.
 *
 * Mined rather than assembled: the sentence is LOD's, the gap is where LOD
 * put the participle, and the distractors are other verbs' real participles.
 * Nothing is conjugated here.
 *
 * Two filters do most of the work. A participle that is also some other
 * lemma's spelling is skipped — `ginn`'s participle is `ginn`, and a gap whose
 * answer is indistinguishable from an infinitive teaches nothing. And the
 * sentence must contain a finite form of hunn or sinn, so that what is gapped
 * is actually a perfect and not a bare adjective that happens to look like one.
 */
function perfectFormItems(corpus, lexicon, verbs) {
  const isClean = makeGate(lexicon);
  const byParticiple = new Map();
  const lemmaSpellings = new Set();
  for (const verb of verbs) {
    if (verb.infinitive) lemmaSpellings.add(verb.infinitive.toLowerCase());
    for (const form of Object.values(verb.present ?? {})) if (form) lemmaSpellings.add(form.toLowerCase());
  }
  for (const verb of verbs) {
    if (!verb.pastParticiple || !verb.en || verb.pastParticiple.includes('/')) continue;
    const key = verb.pastParticiple.toLowerCase();
    if (lemmaSpellings.has(key)) continue; // e.g. ginn/ginn — no distinct answer
    if (!byParticiple.has(key)) byParticiple.set(key, verb);
  }
  const participles = [...byParticiple.values()];

  const items = [];
  const perVerb = new Map();
  // The same example text is attached to more than one corpus entry, so the
  // same sentence/verb pair can be reached twice and would ship twice under
  // one id.
  const seenIds = new Set();
  outer: for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text) continue;
        for (const sentence of sentences(example.text)) {
          const tokens = tokenise(sentence);
          const words = tokens.map((token) => token.value.toLowerCase());
          if (!words.some((word) => FINITE_AUX_FORMS.has(word))) continue;

          const hitIndex = words.findIndex((word) => byParticiple.has(word));
          if (hitIndex === -1) continue;
          const verb = byParticiple.get(words[hitIndex]);
          if ((perVerb.get(verb.id) ?? 0) >= MAX_PER_PERFECT_VERB) continue;
          if (!isClean(sentence)) continue;

          const raw = tokens[hitIndex].raw;
          const span = spanOf(sentence, raw);
          if (!span) continue;

          // Distractors are other verbs' real participles, taking the same
          // auxiliary so the choice is about the verb rather than about
          // spotting the odd auxiliary out.
          const pool = participles.filter(
            (other) => other.id !== verb.id && other.auxiliaryVerb === verb.auxiliaryVerb && other.pastParticiple.toLowerCase() !== raw.toLowerCase(),
          );
          if (pool.length < 3) continue;
          const id = `gr-perffrm-${shortHash(`${sentence}|${verb.id}`)}`;
          if (seenIds.has(id)) continue;
          const picked = [];
          for (let i = 0; i < 3; i += 1) {
            const at = parseInt(shortHash(`${id}:${i}`).slice(0, 6), 16) % pool.length;
            const candidate = pool.splice(at, 1)[0];
            if (candidate) picked.push(candidate.pastParticiple);
          }
          if (picked.length < 3) continue;

          const options = [raw, ...picked];
          const at = rotate(id, options.length);
          const rotated = [...options.slice(at), ...options.slice(0, at)];

          items.push({
            id,
            kind: 'perfect-form',
            before: sentence.slice(0, span.start),
            after: sentence.slice(span.end),
            options_lb: rotated,
            correct: rotated.indexOf(raw),
            infinitive: verb.infinitive,
            en: verb.en,
            entryId: entry.id,
            level: verb.level,
          });
          seenIds.add(id);
          perVerb.set(verb.id, (perVerb.get(verb.id) ?? 0) + 1);
          if (items.length >= MAX_PERFECT_FORM_ITEMS) break outer;
        }
      }
    }
  }
  return items;
}

/* --------------------------------------------------- word order & negation */

/**
 * Where a word belongs in the sentence — the finite verb, or `net`.
 *
 * The options are three orderings of the *same real sentence*: the one LOD
 * wrote, and two with one word moved. Every token is therefore attested; only
 * the order is constructed, and it is constructed to be the wrong answer.
 *
 * The hazard this has to avoid is a distractor that is wrong twice. Moving a
 * word changes which word follows which, and the n-rule keys off exactly that
 * — so a reordering can silently break spelling as well as order, which would
 * teach the wrong lesson and mark the item unfit anyway. Every generated
 * ordering therefore goes back through the same gate the rest of this file
 * uses, and an item is dropped unless *all* of its options are clean. What
 * survives differs from the answer in word order and nothing else.
 *
 * @param {'wordorder'|'negation'} kind
 * @param {(tokens: Array) => number} findIndex which word gets moved
 */
function orderItems(corpus, lexicon, { kind, findIndex, limit, minWords, maxWords }) {
  const isClean = makeGate(lexicon);
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });
  /**
   * Stricter than the shared gate, and only here.
   *
   * `makeGate` passes anything without an *error*, and every n-rule finding is
   * a warning — deliberately, because the checker cannot tell a genuine
   * violation from a homograph. That tolerance is right for a sentence LOD
   * wrote and wrong for one this script rearranged: moving a word changes
   * which word follows which, and 19% of the word-order options and 26% of the
   * negation options came out carrying an n-rule finding. A distractor that is
   * misspelled as well as misordered teaches the wrong lesson twice. So an
   * item survives only if the sentence and every option it generates are
   * completely silent on the n-rule.
   */
  const nRuleSilent = (text) => checker.checkTokens(tokenise(text)).length === 0;
  const items = [];
  const seen = new Set();

  outer: for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text) continue;
        for (const sentence of sentences(example.text)) {
          const tokens = tokenise(sentence);
          if (tokens.length < minWords || tokens.length > maxWords) continue;
          // Clitics attach to the word before them; moving anything across one
          // produces a string no speaker would write.
          if (tokens.some((token) => token.isClitic || token.clitic)) continue;

          // Rejoining tokens with single spaces loses every comma, so the
          // "correct" option would be a punctuation-stripped rewrite of the
          // sentence rather than the sentence. Only take sentences that
          // reconstruct *exactly*, keeping any closing mark aside — which also
          // drops the comma-spliced interjection fragments ("a, kuck, ...")
          // whose word order is not what this is trying to teach.
          const tail = sentence.match(/[.!?…]+$/)?.[0] ?? '';
          const body = sentence.slice(0, sentence.length - tail.length).trim();
          const words = tokens.map((token) => token.raw);
          if (words.join(' ') !== body) continue;

          const from = findIndex(tokens);
          if (from === -1) continue;

          const key = sentence.toLowerCase();
          if (seen.has(key)) continue;
          if (!isClean(sentence) || !nRuleSilent(sentence)) continue;

          const alternatives = [];
          // Never position 0. Fronting the finite verb is how a yes/no
          // question is formed, so "hunn ech eng Conjonctivite …" is not wrong
          // Luxembourgish — it is a different sentence type, and offering it
          // as the wrong answer would be marking a correct instinct down.
          for (let to = 1; to < words.length && alternatives.length < 2; to += 1) {
            if (to === from) continue;
            const moved = [...words];
            const [word] = moved.splice(from, 1);
            moved.splice(to, 0, word);
            const candidate = moved.join(' ');
            if (candidate.toLowerCase() === body.toLowerCase()) continue;
            // Wrong in word order and nothing else.
            if (!isClean(candidate) || !nRuleSilent(candidate)) continue;
            alternatives.push(candidate + tail);
          }
          if (alternatives.length < 2) continue;

          const attested = body + tail;
          const id = `gr-${kind === 'negation' ? 'neg' : 'order'}-${shortHash(sentence)}`;
          const options = [attested, ...alternatives];
          const at = rotate(id, options.length);
          const rotated = [...options.slice(at), ...options.slice(0, at)];

          items.push({
            id,
            kind,
            moved: words[from],
            options_lb: rotated,
            correct: rotated.indexOf(attested),
            entryId: entry.id,
          });
          seen.add(key);
          if (items.length >= limit) break outer;
        }
      }
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

  const verbs = JSON.parse(await fsp.readFile(path.join(paths.ITEMS_DIR, 'verbs.json'), 'utf8')).items;
  // Every present-tense form LOD publishes, so "the finite verb" is a lookup.
  const finiteForms = new Set();
  for (const verb of verbs) for (const form of Object.values(verb.present ?? {})) if (form) finiteForms.add(form.toLowerCase());

  // The handful of Luxembourgish strings this file names rather than mines —
  // the two auxiliaries and their finite forms. They are how a perfect is
  // recognised at all, so a typo here would silently mine the wrong sentences.
  assertAttested(lexicon, [...AUXILIARIES, ...FINITE_AUX_FORMS, NEGATOR]);

  const gender = genderItems(vocab.items);
  const nrule = nRuleItems(corpus, lexicon);
  const adjective = adjectiveItems(corpus, lexicon);
  const perfectAux = perfectAuxItems(verbs);
  const perfectForm = perfectFormItems(corpus, lexicon, verbs);
  const wordorder = orderItems(corpus, lexicon, {
    kind: 'wordorder',
    // The finite verb: the word the V2 rule is about. Recognised as a present
    // form LOD publishes for some verb, so this is a lookup rather than a
    // guess at what looks like a verb.
    // Only sentences whose finite verb is already the second word, because
    // that is the rule being taught: moving it anywhere else is then wrong by
    // the rule rather than merely unusual. (Second *word*, which is a subset
    // of second *element* — a sentence opening with a multi-word phrase is
    // skipped rather than judged, since the app cannot parse the phrase.)
    findIndex: (tokens) => (finiteForms.has(tokens[1]?.value.toLowerCase() ?? '') ? 1 : -1),
    limit: MAX_ORDER_ITEMS,
    minWords: 4,
    maxWords: 7,
  });
  const negation = orderItems(corpus, lexicon, {
    kind: 'negation',
    findIndex: (tokens) => tokens.findIndex((token) => token.value.toLowerCase() === NEGATOR),
    limit: MAX_NEGATION_ITEMS,
    minWords: 4,
    maxWords: 9,
  });

  const items = [...gender, ...nrule, ...adjective, ...perfectAux, ...perfectForm, ...wordorder, ...negation];

  console.log(
    `grammar: ${gender.length} gender, ${nrule.length} n-rule, ${adjective.length} adjective-agreement, ` +
      `${perfectAux.length} perfect-auxiliary, ${perfectForm.length} perfect-participle, ` +
      `${wordorder.length} word-order, ${negation.length} negation (${items.length} total)`,
  );

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-grammar.js',
      note:
        'Every option is either a value LOD itself assigned (noun gender/article) or a span copied ' +
        'verbatim from a real LOD example sentence. Nothing here is generated, inflected or corrected ' +
        'by this script - see the file header.',
      counts: {
        gender: gender.length,
        nrule: nrule.length,
        adjective: adjective.length,
        'perfect-aux': perfectAux.length,
        'perfect-form': perfectForm.length,
        wordorder: wordorder.length,
        negation: negation.length,
        total: items.length,
      },
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
