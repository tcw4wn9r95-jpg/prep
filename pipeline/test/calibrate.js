#!/usr/bin/env node
'use strict';

/**
 * Measures the validator against LOD's own example sentences.
 *
 * These 59,019 sentences are hand-authored by ZLS and are as close to gold as
 * this language gets. Anything the gates flag here is, with few exceptions, a
 * false positive - so this number is the honest statement of how much the
 * validator can be trusted, and it is printed on every `npm test`.
 *
 *   node pipeline/test/calibrate.js [--sample N] [--show N]
 */

const fsp = require('node:fs/promises');

const paths = require('../lib/paths');
const xml = require('../lib/xml');
const { tokenise, sentences } = require('../lib/lux-text');
const { createChecker } = require('../lib/nrule');

async function readGoldSentences() {
  const out = [];
  for await (const record of xml.records(paths.datasetXmlPath('search'), 'entry')) {
    for (const example of xml.findAll(record, 'example')) {
      const text = xml.find(example, 'text')?.text;
      if (text) out.push(text);
    }
  }
  return out;
}

async function calibrate({ sample = Infinity } = {}) {
  const lexicon = JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8'));
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });

  const gold = await readGoldSentences();
  const corpus = sample === Infinity ? gold : gold.slice(0, sample);

  const stats = {
    sentences: corpus.length,
    tokens: 0,
    unknownTokens: 0,
    nRuleErrors: 0,
    nRuleWarnings: 0,
    sentencesWithError: 0,
  };
  const examples = { unknown: [], nRule: [] };

  for (const sentence of corpus) {
    let clean = true;
    for (const token of tokenise(sentence)) {
      if (!/^[\p{L}][\p{L}-]*$/u.test(token.value)) continue;
      stats.tokens += 1;
      const key = token.value.toLowerCase();
      if (lexicon.forms[key]) continue;
      if (key.includes('-') && key.split('-').filter(Boolean).every((part) => lexicon.forms[part])) continue;
      stats.unknownTokens += 1;
      clean = false;
      if (examples.unknown.length < 400) examples.unknown.push({ token: token.raw, sentence });
    }
    for (const part of sentences(sentence)) {
      for (const finding of checker.checkTokens(tokenise(part))) {
        if (finding.severity === 'error') {
          stats.nRuleErrors += 1;
          clean = false;
          if (examples.nRule.length < 400) examples.nRule.push({ ...finding, sentence });
        } else {
          stats.nRuleWarnings += 1;
        }
      }
    }
    if (!clean) stats.sentencesWithError += 1;
  }

  return { stats, examples };
}

function pct(part, whole) {
  return whole === 0 ? '0.000%' : `${((100 * part) / whole).toFixed(3)}%`;
}

async function main() {
  const sampleIndex = process.argv.indexOf('--sample');
  const showIndex = process.argv.indexOf('--show');
  const sample = sampleIndex === -1 ? Infinity : Number(process.argv[sampleIndex + 1]);
  const show = showIndex === -1 ? 12 : Number(process.argv[showIndex + 1]);

  const { stats, examples } = await calibrate({ sample });
  const out = process.stdout;
  out.write('Validator calibration against LOD example sentences (gold)\n');
  out.write(`  sentences               ${stats.sentences.toLocaleString()}\n`);
  out.write(`  word tokens             ${stats.tokens.toLocaleString()}\n`);
  out.write(`  lexicon gate misses     ${stats.unknownTokens.toLocaleString()}  (${pct(stats.unknownTokens, stats.tokens)} of tokens)\n`);
  out.write(`  n-rule errors           ${stats.nRuleErrors.toLocaleString()}\n`);
  out.write(`  n-rule warnings         ${stats.nRuleWarnings.toLocaleString()}\n`);
  out.write(`  sentences that fail     ${stats.sentencesWithError.toLocaleString()}  (${pct(stats.sentencesWithError, stats.sentences)})\n`);

  if (show > 0) {
    out.write('\n  sample lexicon misses:\n');
    for (const item of examples.unknown.slice(0, show)) out.write(`    ${item.token}  «${item.sentence}»\n`);
    out.write('\n  sample n-rule errors:\n');
    for (const item of examples.nRule.slice(0, show)) out.write(`    ${item.token} + ${item.next}  «${item.sentence}»\n`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`calibrate failed: ${error.stack}\n`);
    process.exit(1);
  });
}

module.exports = { calibrate };
