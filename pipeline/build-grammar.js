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
const { makeGate, audioIdOf } = require('./lib/gate');
const { grammarUnits } = require('./lib/frequency');

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
const MAX_BRACKET_ITEMS = 200;
const MAX_SUBCLAUSE_ITEMS = 160;

/**
 * Subordinators reliable enough to mine a verb-final exercise from.
 *
 * Measured over the corpus rather than taken from a list: after `datt` the
 * finite verb closes the clause in 73% of its 208 instances and after `ob` in
 * 68% of 31, while `wéi` and `wou` sit near 30% because they are far more often
 * question words or comparatives than subordinators. Mining those would produce
 * items whose "correct" answer is wrong, so only the two clean ones are used.
 */
const SUBORDINATORS = ['datt', 'ob'];

/** Short, stable id prefixes per kind. */
const ID_PREFIX = { wordorder: 'order', bracket: 'brkt', negation: 'neg', likes: 'likes' };
const MAX_NEGATION_ITEMS = 180;

/**
 * Cardinal numbers 0-19, the tens, and honnert/dausend — a closed class, like
 * the auxiliaries above, so it is named here rather than mined. Each spelling
 * was checked two ways before being trusted: against languagesandnumbers.com
 * (an independent source, not LOD), then against `assertAttested` in main(),
 * which refuses to build if the lexicon does not carry it. That second check
 * is not decorative — several plausible guesses failed it during research
 * ("aachtzéng" for 18, "fënnefzéng" for 15, "siechzeg" for 70) because
 * Luxembourgish numbers are not a regular -zéng/-zeg suffix on the digit the
 * way German's mostly are; the corpus's own spelling is the tie-breaker, not
 * a guess extrapolated from the pattern.
 */
/**
 * The number words, with the value each one names.
 *
 * The words are LOD's; the values are arithmetic, in the same way the English
 * glosses elsewhere are English. Pairing them is what lets a card ask
 * something answerable — see `numberItems`.
 */
const NUMBER_VALUES = {
  null: 0, eent: 1, zwee: 2, dräi: 3, véier: 4, fënnef: 5, sechs: 6, siwen: 7, aacht: 8, néng: 9,
  zéng: 10, eelef: 11, zwielef: 12, dräizéng: 13, véierzéng: 14, fofzéng: 15, siechzéng: 16,
  siwwenzéng: 17, uechtzéng: 18, nonzéng: 19, zwanzeg: 20, drësseg: 30, véierzeg: 40, fofzeg: 50,
  sechzeg: 60, siwwenzeg: 70, achtzeg: 80, nonzeg: 90, honnert: 100, dausend: 1000,
};

const NUMBER_WORDS = Object.keys(NUMBER_VALUES);

/**
 * The words most easily confused with a given one, hardest first.
 *
 * The teen/ten contrast is the whole rule and the whole difficulty: 17 is
 * `siwwenzéng` and 70 is `siwwenzeg`, one letter apart. A distractor set that
 * offers 17 against 0, 4 and 40 tests nothing, so the near-miss is always
 * offered first when one exists.
 */
function numberDistractors(word) {
  const value = NUMBER_VALUES[word];
  const score = (other) => {
    const otherValue = NUMBER_VALUES[other];
    // The -zéng / -zeg pair for the same digit: 17 against 70, 13 against 30.
    if (value >= 13 && value <= 19 && otherValue === (value - 10) * 10) return 0;
    if (value >= 20 && value <= 90 && value % 10 === 0 && otherValue === value / 10 + 10) return 0;
    // Then anything sharing a first syllable, then anything close in value.
    if (other.slice(0, 3) === word.slice(0, 3)) return 1;
    return 2 + Math.min(Math.abs(otherValue - value) / 1000, 0.9);
  };
  return NUMBER_WORDS.filter((other) => other !== word).sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}
const MAX_NUMBER_ITEMS = 150;
const MAX_PER_NUMBER_WORD = 15;

/**
 * The seven dative personal-pronoun forms — also a closed class, checked the
 * same two ways as the numbers above (an independent grammar source, then
 * `assertAttested`). `mir` and `dir` are real traps: they are also the
 * nominative-plural "we" and the formal/plural "you", and the theory topic
 * says so rather than leaving it to be noticed the hard way.
 */
const DATIVE_PRONOUNS = ['mir', 'dir', 'him', 'hir', 'eis', 'iech', 'hinnen'];
const MAX_DATIVE_ITEMS = 150;
const MAX_PER_DATIVE_PRONOUN = 20;

/** Prepositions that always govern the dative case in Luxembourgish. */
const DATIVE_PREPOSITIONS = new Set(['mat', 'bei', 'vun', 'no']);

/** How you say you (dis)like something: gär/gären placed late in the clause,
 * the same slot net occupies — "net gär" is simply both at once. */
const LIKES_WORDS = new Set(['gär', 'gären']);
const MAX_LIKES_ITEMS = 150;

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
          // Per kind, not per shape: wordorder and bracket both run through
          // this function and can legitimately mine the *same* sentence — one
          // moving the finite verb, one the participle — so a shared prefix
          // made them collide on one id.
          const id = `gr-${ID_PREFIX[kind] ?? kind}-${shortHash(sentence)}`;
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


/**
 * Where the second half of the verb goes — the sentence bracket.
 *
 * Same machinery as `orderItems`: three orderings of one real sentence, the
 * attested one and two with a word moved, all gated so they differ in order
 * alone. What moves here is the *non-finite* verb that closes the sentence —
 * the participle of a perfect, or the infinitive after a modal — because that
 * is the half an English speaker leaves stranded in the middle.
 *
 * The distractors put it in the middle rather than at the end, which is wrong
 * by the rule rather than merely unusual, and position 0 is excluded for the
 * same reason it is in `orderItems`.
 */
function bracketItems(corpus, lexicon, verbs) {
  const nonFinite = new Set();
  for (const verb of verbs) {
    if (verb.infinitive) nonFinite.add(verb.infinitive.toLowerCase());
    if (verb.pastParticiple) for (const form of verb.pastParticiple.split('/')) nonFinite.add(form.trim().toLowerCase());
  }
  const finite = new Set();
  for (const verb of verbs) for (const form of Object.values(verb.present ?? {})) if (form) finite.add(form.toLowerCase());

  return orderItems(corpus, lexicon, {
    kind: 'bracket',
    limit: MAX_BRACKET_ITEMS,
    minWords: 5,
    maxWords: 9,
    // The closing non-finite verb, and only when a finite verb opens the
    // bracket — otherwise the last word is just a verb, not a bracket.
    findIndex: (tokens) => {
      const last = tokens.length - 1;
      if (!nonFinite.has(tokens[last]?.value.toLowerCase() ?? '')) return -1;
      const opener = tokens.findIndex((token) => finite.has(token.value.toLowerCase()));
      if (opener === -1 || opener > 2 || opener === last) return -1;
      return last;
    },
  });
}

/**
 * Verb-final in a subordinate clause — the hardest of the three.
 *
 * This one cannot reuse `orderItems`, and the reason is worth recording: that
 * function only accepts sentences whose word tokens rejoin *exactly*, which
 * rules out anything containing a comma — and a subordinate clause in written
 * Luxembourgish is nearly always introduced by one. Run through it, this kind
 * produced zero items.
 *
 * So it permutes segment-wise instead. The sentence is split on its commas,
 * only the segment holding the subordinator is rearranged, and the whole thing
 * is reassembled with every comma back where LOD put it. Words never cross a
 * comma, because moving one across a clause boundary produces something no
 * speaker would write rather than a wrong word order.
 *
 * The distractor is the finite verb pulled out of final position into the
 * main-clause slot right after the subordinator — which is exactly the mistake
 * an English speaker makes, rather than an arbitrary shuffle.
 */
function subclauseItems(corpus, lexicon, verbs) {
  const isClean = makeGate(lexicon);
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });
  const nRuleSilent = (text) => checker.checkTokens(tokenise(text)).length === 0;

  const finite = new Set();
  for (const verb of verbs) for (const form of Object.values(verb.present ?? {})) if (form) finite.add(form.toLowerCase());

  const items = [];
  const seen = new Set();
  outer: for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text) continue;
        for (const sentence of sentences(example.text)) {
          const tail = sentence.match(/[.!?…]+$/)?.[0] ?? '';
          const body = sentence.slice(0, sentence.length - tail.length).trim();
          if (!body.includes(',')) continue; // no clause boundary to work with

          // Segments, and the words inside each. A segment reconstructs
          // exactly or the sentence is skipped, same discipline as elsewhere.
          const segments = body.split(',').map((part) => part.trim());
          if (segments.some((part) => part === '')) continue;
          const wordsOf = (part) => part.split(/\s+/).filter(Boolean);
          if (segments.map(wordsOf).map((w) => w.join(' ')).join(', ') !== segments.join(', ')) continue;

          const at = segments.findIndex((part) => SUBORDINATORS.includes(wordsOf(part)[0]?.toLowerCase() ?? ''));
          if (at === -1) continue;

          const words = wordsOf(segments[at]);
          if (words.length < 4 || words.length > 8) continue;
          const lower = words.map((word) => word.toLowerCase());
          // The finite verb must already be last — that is the pattern taught —
          // and it must be the only one, or "the verb" is ambiguous.
          if (!finite.has(lower[lower.length - 1])) continue;
          if (lower.slice(1, -1).some((word) => finite.has(word))) continue;

          const key = body.toLowerCase();
          if (seen.has(key)) continue;
          if (!isClean(sentence) || !nRuleSilent(sentence)) continue;

          const rebuild = (segment) => segments.map((part, index) => (index === at ? segment : part)).join(', ') + tail;
          const attested = rebuild(words.join(' '));

          // The verb dragged forward to second position inside the clause,
          // which is the main-clause order misapplied — the actual error.
          const moved = [...words];
          const [verb] = moved.splice(moved.length - 1, 1);
          const alternatives = [];
          for (const to of [1, 2]) {
            if (to >= moved.length + 1) continue;
            const candidate = [...moved.slice(0, to), verb, ...moved.slice(to)].join(' ');
            const full = rebuild(candidate);
            if (full.toLowerCase() === attested.toLowerCase()) continue;
            if (!isClean(full) || !nRuleSilent(full)) continue;
            alternatives.push(full);
          }
          if (alternatives.length < 2) continue;

          const id = `gr-subcl-${shortHash(body)}`;
          const options = [attested, ...alternatives];
          const rotation = rotate(id, options.length);
          const rotated = [...options.slice(rotation), ...options.slice(0, rotation)];

          items.push({
            id,
            kind: 'subclause',
            moved: verb,
            conjunction: words[0],
            options_lb: rotated,
            correct: rotated.indexOf(attested),
            entryId: entry.id,
          });
          seen.add(key);
          if (items.length >= MAX_SUBCLAUSE_ITEMS) break outer;
        }
      }
    }
  }
  return items;
}

/* ------------------------------------------------------------------ numbers */

/**
 * A number word, gapped out of a real sentence that already contains one.
 *
 * Same cloze shape as `perfectFormItems`: the sentence is LOD's, the gap is
 * where LOD wrote the number, and the distractors are other real number words
 * from the closed `NUMBER_WORDS` list — wrong for this sentence, never
 * invented. The exam-scoped Grondwuertschatz corpus this app is otherwise
 * built from carries almost no numbers as dictionary headwords (one, "nonzeg"
 * — see docs/ui-content-benchmark.md), so this is the only honest source of
 * number practice available: real sentences that happen to use one, not
 * flashcards for words the corpus never lexicalised.
 *
 * The target is skipped at sentence position 0: a number opening a sentence
 * is capitalised the way none of the other 29 options ever would be, which
 * would make the answer identifiable by casing alone rather than by knowing
 * the word.
 */
function numberItems(corpus, lexicon) {
  const isClean = makeGate(lexicon);
  const wordSet = new Set(NUMBER_WORDS);

  // One card per number word, not per sentence it appears in.
  //
  // The first version of this gapped the numeral out of a real sentence and
  // offered four number words. That card cannot be answered: "the crane
  // injured ___ workers" is nine or two or four depending on nothing the
  // learner can see. A numeral is not determined by its context the way a
  // grammatical form is, so there was no rule to apply and the round was a
  // sequence of one-in-four guesses. Its own feedback line admitted it — "the
  // number LOD actually wrote in this sentence".
  //
  // What the deck was for is how a number is *said*: 0-12 are their own words,
  // 13-19 add -zéng, and the tens take -zeg. So the card gives the value and
  // asks for the word, which is answerable from the rule and drills exactly
  // the contrast that matters. The sentence LOD wrote is kept as evidence
  // shown after answering, so the corpus link survives.
  const evidence = new Map();
  outer: for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text) continue;
        for (const sentence of sentences(example.text)) {
          const tokens = tokenise(sentence);
          for (let i = 1; i < tokens.length; i += 1) {
            const key = tokens[i].value.toLowerCase();
            if (!wordSet.has(key) || evidence.has(key)) continue;
            if (!isClean(sentence)) continue;
            const span = spanOf(sentence, tokens[i].raw);
            if (!span) continue;
            evidence.set(key, { sentence, entryId: entry.id, form: tokens[i].raw });
            if (evidence.size >= wordSet.size) break outer;
          }
        }
      }
    }
  }

  const items = [];
  for (const word of NUMBER_WORDS) {
    const found = evidence.get(word);
    // Every option has to be a word LOD attests, so a number with no attested
    // sentence is simply not asked about rather than being asked about with an
    // unverifiable spelling.
    if (!found) continue;

    const id = `gr-number-${shortHash(word)}`;
    const picked = numberDistractors(word).filter((other) => evidence.has(other)).slice(0, 3);
    if (picked.length < 3) continue;

    const options = [found.form, ...picked];
    const at = rotate(id, options.length);
    const rotated = [...options.slice(at), ...options.slice(0, at)];

    items.push({
      id,
      kind: 'numbers',
      value: NUMBER_VALUES[word],
      options_lb: rotated,
      correct: rotated.indexOf(found.form),
      // Shown once the card is answered, not before — it contains the answer.
      example: { lb: found.sentence },
      entryId: found.entryId,
    });
  }
  return items;
}


/* ------------------------------------------------------- heard: the audio */

/**
 * Months, weekdays and clock words, spelled as LOD spells them.
 *
 * Capitalisation is load-bearing rather than cosmetic. `Mee` is May (MEE1,
 * SUBST) and `mee` is "but" (MEE2, CONJ) — the commonest conjunction in the
 * language. Matching case-insensitively would have put "but" on a card asking
 * which month you heard, several hundred times.
 */
const MONTHS = [
  'Januar', 'Februar', 'Mäerz', 'Abrëll', 'Mee', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const WEEKDAYS = ['Méindeg', 'Dënschdeg', 'Mëttwoch', 'Donneschdeg', 'Freideg', 'Samschdeg', 'Sonndeg'];
const TIME_WORDS = ['Auer', 'Stonn', 'Minutt', 'Véierel', 'Mëtteg', 'Nuecht', 'hallef', 'moies', 'mëttes', 'owes'];

/** A sentence long enough to carry the number and short enough to hold. */
const HEARD_MAX_WORDS = 16;
/** Per distinct answer, so one value cannot fill the deck. */
const MAX_PER_HEARD_ANSWER = 3;

/**
 * Near misses for a number, by ear.
 *
 * 6, 16 and 60 are the confusion worth drilling — the same syllable with
 * -zéng or -zeg after it. Falls back to neighbours when the decades do not
 * apply, so every card still gets three options.
 */
function heardNumberDistractors(value) {
  const candidates = [];
  if (value >= 1 && value <= 9) candidates.push(value + 10, value * 10, value + 1, value - 1);
  else if (value >= 13 && value <= 19) candidates.push((value - 10) * 10, value - 10, value + 1, value - 1);
  else if (value >= 20 && value <= 90 && value % 10 === 0) candidates.push(value / 10 + 10, value / 10, value + 10, value - 10);
  else candidates.push(value + 1, value - 1, value + 10, value * 10, Math.floor(value / 10));
  return [...new Set(candidates)].filter((other) => other !== value && other >= 0);
}

/**
 * Listening cards: a recording, and what was said in it.
 *
 * Asked for as "cut audio snippets where numbers are said, with a few seconds
 * context". No cutting is involved, and that is a feature rather than a
 * shortcut: LOD publishes one recording per example sentence and those run two
 * to eight seconds, so the clip already *is* the snippet with its context.
 * Cutting a longer recording at the right word would need forced alignment —
 * word-level timestamps we do not have and cannot derive offline — and would
 * risk clipping the very word the card is about.
 *
 * Numbers are answered with digits rather than with the written word, on
 * purpose: this is a test of what you heard, and offering the spelling would
 * turn it back into a reading exercise. Months, weekdays and clock words are
 * answered with the word, because there the word *is* the vocabulary.
 */
function heardItems(corpus, lexicon) {
  const isClean = makeGate(lexicon);
  const perAnswer = new Map();
  // LOD reuses the same example — and therefore the same recording — across
  // several dictionary entries, so the outer walk reaches one clip more than
  // once. Without this the deck ships the same card twice under one id.
  const seen = new Set();
  const items = [];

  const subjects = [
    { subject: 'month', words: MONTHS, caseSensitive: true },
    { subject: 'weekday', words: WEEKDAYS, caseSensitive: true },
    { subject: 'time', words: TIME_WORDS, caseSensitive: true },
  ];

  for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        const text = example.text;
        const audioId = example.audio ? audioIdOf(example.audio) : null;
        if (!text || !audioId) continue;
        if (text.split(/\s+/).filter(Boolean).length > HEARD_MAX_WORDS) continue;
        if (!isClean(text)) continue;

        const raw = text.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
        let found = null;

        // A number, written either as a word or as digits.
        for (const token of raw) {
          const lower = token.toLowerCase();
          if (NUMBER_VALUES[lower] !== undefined) {
            found = { subject: 'number', answer: String(NUMBER_VALUES[lower]), spoken: token };
            break;
          }
          if (/^\d{1,4}$/.test(token)) {
            found = { subject: 'number', answer: String(Number(token)), spoken: token };
            break;
          }
        }

        // Otherwise a month, a weekday or a clock word — case-sensitively, so
        // "but" is never offered as a month.
        if (!found) {
          for (const { subject, words } of subjects) {
            const hit = words.find((word) => raw.includes(word));
            if (hit) {
              found = { subject, answer: hit, spoken: hit };
              break;
            }
          }
        }
        if (!found) continue;

        const key = `${found.subject}|${found.answer}`;
        if ((perAnswer.get(key) ?? 0) >= MAX_PER_HEARD_ANSWER) continue;

        const id = `gr-heard-${shortHash(`${audioId}|${found.answer}`)}`;
        if (seen.has(id)) continue;
        let pool;
        if (found.subject === 'number') pool = heardNumberDistractors(Number(found.answer)).map(String);
        else if (found.subject === 'month') pool = MONTHS.filter((word) => word !== found.answer);
        else if (found.subject === 'weekday') pool = WEEKDAYS.filter((word) => word !== found.answer);
        else pool = TIME_WORDS.filter((word) => word !== found.answer);

        const picked = [];
        const rest = [...pool];
        for (let n = 0; n < 3 && rest.length; n += 1) {
          const at = parseInt(shortHash(`${id}:${n}`).slice(0, 6), 16) % rest.length;
          picked.push(rest.splice(at, 1)[0]);
        }
        if (picked.length < 3) continue;

        const options = [found.answer, ...picked];
        const at = rotate(id, options.length);
        const rotated = [...options.slice(at), ...options.slice(0, at)];

        items.push({
          id,
          kind: 'heard',
          subject: found.subject,
          // Never rendered before the answer — the whole card is the sound.
          example: { lb: text, audioId },
          options_lb: rotated,
          correct: rotated.indexOf(found.answer),
          spoken: found.spoken,
          entryId: entry.id,
        });
        perAnswer.set(key, (perAnswer.get(key) ?? 0) + 1);
        seen.add(id);
      }
    }
  }
  return items;
}

/* ------------------------------------------------------------------ dative */

/**
 * A dative personal pronoun, gapped out of a real sentence where it directly
 * follows a preposition that governs the dative (`DATIVE_PREPOSITIONS`).
 *
 * The distractors are the other six dative pronoun forms, never a
 * nominative or accusative one — the question this asks is "which person
 * does this sentence actually name", the same honesty `adjectiveItems`
 * documents for its own contrasts: every option is real and grammatical
 * somewhere, just not what LOD wrote here.
 */
function dativeItems(corpus, lexicon) {
  const isClean = makeGate(lexicon);
  const items = [];
  const seen = new Set();
  const perPronoun = new Map();

  outer: for (const entry of corpus.entries) {
    for (const meaning of entry.meanings ?? []) {
      for (const example of meaning.examples ?? []) {
        if (!example.text) continue;
        for (const sentence of sentences(example.text)) {
          const tokens = tokenise(sentence);
          for (let i = 0; i < tokens.length - 1; i += 1) {
            const prep = tokens[i];
            if (prep.pauseAfter || prep.isClitic) continue;
            if (!DATIVE_PREPOSITIONS.has(prep.value.toLowerCase())) continue;
            const target = tokens[i + 1];
            if (target.isClitic) continue;
            const key = target.value.toLowerCase();
            if (!DATIVE_PRONOUNS.includes(key)) continue;
            if ((perPronoun.get(key) ?? 0) >= MAX_PER_DATIVE_PRONOUN) continue;

            const sentenceKey = `${key}|${sentence}`;
            if (seen.has(sentenceKey)) continue;
            if (!isClean(sentence)) continue;

            const span = spanOf(sentence, target.raw);
            if (!span) continue;

            const id = `gr-dative-${shortHash(sentenceKey)}`;
            const pool = DATIVE_PRONOUNS.filter((pronoun) => pronoun !== key);
            const picked = [];
            for (let n = 0; n < 3 && pool.length; n += 1) {
              const at = parseInt(shortHash(`${id}:${n}`).slice(0, 6), 16) % pool.length;
              picked.push(pool.splice(at, 1)[0]);
            }
            if (picked.length < 3) continue;

            const options = [target.raw, ...picked];
            const at = rotate(id, options.length);
            const rotated = [...options.slice(at), ...options.slice(0, at)];

            items.push({
              id,
              kind: 'dative',
              before: sentence.slice(0, span.start),
              after: sentence.slice(span.end),
              preposition: prep.value,
              options_lb: rotated,
              correct: rotated.indexOf(target.raw),
              entryId: entry.id,
            });
            seen.add(sentenceKey);
            perPronoun.set(key, (perPronoun.get(key) ?? 0) + 1);
            if (items.length >= MAX_DATIVE_ITEMS) break outer;
          }
        }
      }
    }
  }
  return items;
}

/* ------------------------------------------------------------------- likes */

/**
 * Where gär/gären goes — reuses `orderItems` exactly like `negation` does,
 * because it is the same shape of rule: a particle that sits late in the
 * clause rather than glued to the verb. A sentence already carrying `net`
 * ahead of `gär` mines naturally into a "does not like" item; nothing extra
 * is needed to teach the negative case.
 */
function likesItems(corpus, lexicon) {
  return orderItems(corpus, lexicon, {
    kind: 'likes',
    findIndex: (tokens) => tokens.findIndex((token) => LIKES_WORDS.has(token.value.toLowerCase())),
    limit: MAX_LIKES_ITEMS,
    minWords: 4,
    maxWords: 9,
  });
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
  // the two auxiliaries and their finite forms, the numbers, the dative
  // pronouns and the like/dislike particle. They are how each of those
  // exercises is recognised at all, so a typo here would silently mine the
  // wrong sentences or, for numbers/dative, ship a spelling the lexicon
  // itself never attests.
  assertAttested(lexicon, [...AUXILIARIES, ...FINITE_AUX_FORMS, NEGATOR, ...NUMBER_WORDS, ...DATIVE_PRONOUNS, ...LIKES_WORDS]);

  const gender = genderItems(vocab.items);
  const nrule = nRuleItems(corpus, lexicon);
  const adjective = adjectiveItems(corpus, lexicon);
  const perfectAux = perfectAuxItems(verbs);
  const perfectForm = perfectFormItems(corpus, lexicon, verbs);
  const numbers = numberItems(corpus, lexicon);
  const heard = heardItems(corpus, lexicon);
  const dative = dativeItems(corpus, lexicon);
  const likes = likesItems(corpus, lexicon);
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

  const bracket = bracketItems(corpus, lexicon, verbs);
  const subclause = subclauseItems(corpus, lexicon, verbs);

  const items = [
    ...gender, ...nrule, ...adjective, ...perfectAux, ...perfectForm, ...wordorder, ...bracket, ...subclause,
    ...negation, ...numbers, ...heard, ...dative, ...likes,
  ];

  console.log(
    `grammar: ${gender.length} gender, ${nrule.length} n-rule, ${adjective.length} adjective-agreement, ` +
      `${perfectAux.length} perfect-auxiliary, ${perfectForm.length} perfect-participle, ` +
      `${wordorder.length} word-order, ${bracket.length} verb-bracket, ${subclause.length} verb-final, ` +
      `${negation.length} negation, ${numbers.length} numbers, ${heard.length} heard-in-audio, ${dative.length} dative, ${likes.length} likes (${items.length} total)`,
  );

  // Which unit of the learning path each rule belongs to. Sequencing lives in
  // one place — the unit list in lib/frequency.js — rather than being a
  // separate opinion here that could disagree with it.
  const units = grammarUnits();
  for (const item of items) item.unit = units.get(item.kind) ?? null;
  const unplaced = items.filter((item) => item.unit === null);
  if (unplaced.length > 0) {
    const kinds = [...new Set(unplaced.map((item) => item.kind))].join(', ');
    throw new Error(`grammar kinds with no unit on the path: ${kinds} - add them to STAGES in lib/frequency.js`);
  }

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
        bracket: bracket.length,
        subclause: subclause.length,
        negation: negation.length,
        numbers: numbers.length,
        heard: heard.length,
        dative: dative.length,
        likes: likes.length,
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

module.exports = {
  heardItems,
  genderItems, nRuleItems, adjectiveItems, numberItems, dativeItems, likesItems,
  NUMBER_WORDS, DATIVE_PRONOUNS, DATIVE_PREPOSITIONS, LIKES_WORDS,
};
