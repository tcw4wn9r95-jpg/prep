#!/usr/bin/env node
'use strict';

/**
 * The hard gate. Nothing reaches the UI without passing this.
 *
 * Three checks, from the brief:
 *   1. every Luxembourgish word in generated content is present in the corpus
 *      or the inflection tables, and traces to a LOD record id;
 *   2. no form contradicts the n-rule flags in the search index;
 *   3. every audio id an exercise references resolves to a real recording.
 *
 * Exit code 1 on any error. Warnings are printed and do not fail the build -
 * see lib/nrule.js for which n-rule direction is which, and why.
 *
 *   node pipeline/validate.js [paths…]   (default: content/items)
 *   node pipeline/validate.js --json
 */

const fsp = require('node:fs/promises');
const path = require('node:path');

const paths = require('./lib/paths');
const { tokenise, sentences, isWordToken } = require('./lib/lux-text');
const { createChecker } = require('./lib/nrule');

/* --------------------------------------------------------------- the model */

/**
 * Which fields of an item are Luxembourgish, and therefore corpus-locked.
 *
 * The brief splits the languages hard: Luxembourgish is corpus-locked, English
 * and French explanations are free text. Encoding that split as an explicit
 * allowlist - rather than "validate every string" - is what stops the gate
 * from being quietly weakened later by someone adding a field. An unknown
 * field is an error, not a pass.
 */
const LUXEMBOURGISH_FIELDS = new Set([
  'lb', // any field literally named for the language
  'transcript',
  'prompt_lb',
  'question_lb',
  'text_lb',
  'options_lb',
  'answer_lb',
  'title_lb',
  // pipeline/build-verbs.js — present-tense forms and the infinitive/
  // participle/auxiliary LOD lists on the same verbConjugation table.
  'infinitive',
  'pastParticiple',
  'auxiliaryVerb',
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
  'p6',
  // pipeline/build-learn.js — the three slices of a cloze card. `form` is the
  // word the learner has to produce and `before`/`after` are the rest of the
  // corpus example sentence, so all three are Luxembourgish and all three get
  // the full lexicon and n-rule treatment. Splitting a validated sentence is
  // exactly the operation that could break the n-rule, which is a sandhi rule
  // across a boundary the split has just invented.
  'before',
  'form',
  'after',
]);

const FREE_TEXT_FIELDS = new Set([
  'id',
  'type',
  'module',
  'level',
  'topic',
  'source',
  'sourceUrl',
  'licence',
  'attribution',
  'notes',
  'title',
  'title_en',
  'title_fr',
  'prompt_en',
  'prompt_fr',
  'question_en',
  'question_fr',
  'explanation_en',
  'explanation_fr',
  'hint_en',
  'hint_fr',
  'reference_en',
  'reference_fr',
  'options_en',
  'options_fr',
  'answer_en',
  'answer_fr',
  'correct',
  'points',
  'speaker',
  'audioId',
  'audio',
  'entryIds',
  'createdAt',
  'seed',
  // item structure (pipeline/build-items.js)
  'kind',
  'phase',
  'audioSrc',
  'format',
  // Learn deck enrichment (pipeline/build-learn.js). These are all machine
  // labels rather than prose: `topics` holds taxonomy ids, `topicVia` and
  // `via` name which evidence layer fired, and `cue` is a single emoji.
  'topics',
  'topicVia',
  'cue',
  'via',
  // image-description items
  'image',
  'imageUrl',
  'imageCredit',
  'imageLicence',
  'imageSource',
  // pipeline/build-vocab.js — translations and metadata, not Luxembourgish.
  'pos',
  'gender',
  'article',
  'en',
  'fr',
  'de',
  // LOD example-sentence audio references (pipeline/build-vocab.js)
  'ogg',
  'aac',
  'entryId',
]);

/* ------------------------------------------------------------------ gate 1 */

function checkLexicon(lexicon, text, where, findings) {
  for (const token of tokenise(text)) {
    if (!isWordToken(token.value)) continue;
    const key = token.value.toLowerCase();

    const erroneousFor = lexicon.erroneousSpellings[key];
    if (erroneousFor) {
      findings.push({
        severity: 'error',
        code: 'lexicon/erroneous',
        where,
        token: token.raw,
        message: `"${token.raw}" is flagged by LOD as an erroneous spelling (entry ${erroneousFor})`,
      });
      continue;
    }

    if (lexicon.forms[key]) continue;

    // Hyphenated compounds are accepted when every part is, which is how LOD
    // itself indexes them ("Wanter-Sport" is not an entry, "Wanter" and
    // "Sport" are).
    if (key.includes('-')) {
      const parts = key.split('-').filter(Boolean);
      if (parts.length > 1 && parts.every((part) => lexicon.forms[part])) continue;
    }

    findings.push({
      severity: 'error',
      code: 'lexicon/unknown',
      where,
      token: token.raw,
      message: `"${token.raw}" is not in the LOD corpus or the inflection tables`,
    });
  }
}

/* ------------------------------------------------------------------ gate 2 */

function checkNRule(checker, text, where, findings) {
  for (const sentence of sentences(text)) {
    for (const finding of checker.checkTokens(tokenise(sentence))) {
      findings.push({ ...finding, where });
    }
  }
}

/* ------------------------------------------------------------------ gate 3 */

function checkAudio(audioIndex, item, where, findings) {
  const referenced = [];
  collectAudioRefs(item, referenced);
  for (const { id, at } of referenced) {
    if (audioIndex.has(id)) continue;
    findings.push({
      severity: 'error',
      code: 'audio/unresolved',
      where: `${where}${at}`,
      token: id,
      message: `audio id "${id}" does not resolve to a recording in content/corpus.json`,
    });
  }
}

function collectAudioRefs(node, out, at = '') {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectAudioRefs(item, out, `${at}[${index}]`));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'audioId' && typeof value === 'string') out.push({ id: value, at: `${at}.${key}` });
    else collectAudioRefs(value, out, `${at}.${key}`);
  }
}

/* ------------------------------------------------------------------- walk */

/** Walks an item, routing each string to the right gate by its field name. */
function walkItem(node, context, where) {
  const { findings } = context;

  const visit = (value, key, at) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, key, `${at}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey, `${at}.${childKey}`);
      return;
    }
    if (typeof value !== 'string' || value.trim() === '') return;

    if (LUXEMBOURGISH_FIELDS.has(key) || key.endsWith('_lb')) {
      checkLexicon(context.lexicon, value, `${where}${at}`, findings);
      checkNRule(context.checker, value, `${where}${at}`, findings);
      return;
    }
    if (FREE_TEXT_FIELDS.has(key) || key.endsWith('_en') || key.endsWith('_fr')) return;

    findings.push({
      severity: 'error',
      code: 'schema/unknown-field',
      where: `${where}${at}`,
      token: key,
      message:
        `field "${key}" is neither a declared Luxembourgish field nor a declared free-text field. ` +
        'Add it to LUXEMBOURGISH_FIELDS or FREE_TEXT_FIELDS in pipeline/validate.js - unclassified text is not validated, so it is not allowed.',
    });
  };

  for (const [key, value] of Object.entries(node)) visit(value, key, `.${key}`);
}

/* ------------------------------------------------------------------- main */

async function loadLexicon() {
  return JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8'));
}

async function loadAudioIndex() {
  const index = new Set();
  try {
    const corpus = JSON.parse(await fsp.readFile(paths.CORPUS_PATH, 'utf8'));
    for (const entry of corpus.entries) {
      for (const meaning of entry.meanings) {
        for (const example of meaning.examples) {
          if (example.audio) index.add(audioIdFor(example.audio));
        }
      }
    }
  } catch {
    /* no corpus yet - gate 3 will fail loudly on any reference */
  }
  return index;
}

/** The stable id for a recording: the LOD asset hash out of its URL. */
function audioIdFor(audio) {
  const url = audio.ogg ?? audio.aac ?? '';
  return path.basename(String(url)).replace(/\.[a-z0-9]+$/i, '');
}

async function collectItemFiles(targets) {
  const files = [];
  for (const target of targets) {
    const stat = await fsp.stat(target).catch(() => null);
    if (!stat) throw new Error(`no such path: ${target}`);
    if (stat.isDirectory()) {
      for (const name of await fsp.readdir(target)) {
        if (name.endsWith('.json')) files.push(path.join(target, name));
      }
    } else {
      files.push(target);
    }
  }
  return files.sort();
}

async function validate(targets) {
  const lexicon = await loadLexicon();
  const audioIndex = await loadAudioIndex();
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });

  const findings = [];
  const context = { lexicon, checker, findings };
  const files = await collectItemFiles(targets);

  for (const file of files) {
    const where = path.relative(paths.ROOT, file);
    let payload;
    try {
      payload = JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch (error) {
      findings.push({ severity: 'error', code: 'schema/unparsable', where, token: '', message: error.message });
      continue;
    }
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [payload];
    items.forEach((item, index) => {
      const label = `${where}${Array.isArray(payload) || payload.items ? `[${index}]` : ''}`;
      walkItem(item, context, label);
      checkAudio(audioIndex, item, label, findings);
    });
  }

  return { files, findings, lexiconSize: Object.keys(lexicon.forms).length, audioCount: audioIndex.size };
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const asJson = process.argv.includes('--json');
  const targets = args.length > 0 ? args : [paths.ITEMS_DIR];

  const result = await validate(targets);
  const errors = result.findings.filter((finding) => finding.severity === 'error');
  const warnings = result.findings.filter((finding) => finding.severity === 'warning');

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ...result, ok: errors.length === 0 }, null, 2)}\n`);
  } else {
    const out = process.stdout;
    out.write(
      `validate: ${result.files.length} file(s), ` +
        `${result.lexiconSize.toLocaleString()} accepted forms, ${result.audioCount.toLocaleString()} recordings\n`,
    );
    for (const finding of result.findings) {
      const tag = finding.severity === 'error' ? 'ERROR' : 'warn ';
      out.write(`  ${tag} ${finding.where}: ${finding.message}  [${finding.code}]\n`);
    }
    if (errors.length === 0) out.write(`PASS${warnings.length ? ` (${warnings.length} warning(s))` : ''}\n`);
    else out.write(`FAIL: ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  }

  process.exit(errors.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`validate failed: ${error.stack}\n`);
    process.exit(2);
  });
}

module.exports = { validate, checkLexicon, checkNRule, audioIdFor, LUXEMBOURGISH_FIELDS, FREE_TEXT_FIELDS };
