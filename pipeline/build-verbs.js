#!/usr/bin/env node
'use strict';

/**
 * Generates verb conjugation drill items.
 *
 * Present-tense forms come straight from LOD's own Flexiounstabellen
 * (`.cache/lod/tab.xml`, `<verbConjugation>` records) — nothing here is
 * generated or guessed, same rule as the rest of the pipeline: every
 * Luxembourgish form ships verbatim from a LOD table cell.
 *
 * The set is restricted to verbs that also appear in the A1/A2 Grondwuertschatz
 * corpus, so the drill stays scoped to what a beginner is actually learning
 * elsewhere in the app, rather than the full ~14,000-verb LOD table.
 *
 *   node pipeline/build-verbs.js
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const paths = require('./lib/paths');
const xml = require('./lib/xml');
const { writeJson } = require('./lib/write-json');
const { checkLexicon, checkNRule } = require('./validate');
const { createChecker } = require('./lib/nrule');

/** Same gate build-items.js and build-vocab.js use: drop rather than ship a
 * form the validator would reject. A handful of separable verbs' bare stems
 * ("reegen" for "opreegen") are not independently indexed by LOD. */
function makeGate(lexicon) {
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });
  return function isClean(text) {
    const findings = [];
    checkLexicon(lexicon, text, 'form', findings);
    checkNRule(checker, text, 'form', findings);
    return findings.every((finding) => finding.severity !== 'error');
  };
}

const PERSONS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const PRONOUNS = { p1: 'ech', p2: 'du', p3: 'hien/si/hatt', p4: 'mir', p5: 'dir', p6: 'si' };

function textOf(node, name) {
  const child = node.children.find((c) => c.name === name);
  return child && child.text ? child.text.trim() : null;
}

async function readVerbTables(file) {
  const byInfinitive = new Map(); // infinitive -> record, first wins (LOD lists a table only once per id anyway)
  for await (const record of xml.records(file, 'inflection')) {
    for (const table of record.children) {
      if (table.name !== 'verbConjugation') continue;
      const infinitive = textOf(table, 'infinitive');
      if (!infinitive) continue;
      // Separable-prefix duplicates ("agoen" alongside "goen") are kept — a
      // beginner needs the prefixed form drilled on its own, not folded away.
      const indicative = table.children.find((c) => c.name === 'indicative');
      const present = indicative?.children.find((c) => c.name === 'present');
      if (!present) continue;

      const forms = {};
      for (const person of PERSONS) {
        const form = textOf(present, person);
        if (!form) { forms[person] = null; continue; }
        // A handful of cells list a variant separated by "/" (e.g. "géif / géing agoen"),
        // and reflexive verbs interleave an optional pronoun hint in parens
        // ("halen (mech) op") — the drill wants the bare conjugated form.
        forms[person] = form
          .split('/')[0]
          .replace(/\([^)]*\)/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      if (PERSONS.some((p) => !forms[p])) continue; // incomplete table, skip

      if (!byInfinitive.has(infinitive)) {
        byInfinitive.set(infinitive, {
          id: table.attrs.id,
          infinitive,
          pastParticiple: textOf(table, 'pastParticiple'),
          auxiliaryVerb: textOf(table, 'auxiliaryVerb'),
          present: forms,
        });
      }
    }
  }
  return byInfinitive;
}

async function main() {
  const corpus = require(paths.CORPUS_PATH);
  const lexicon = JSON.parse(await fsp.readFile(paths.LEXICON_PATH, 'utf8'));
  const isClean = makeGate(lexicon);
  const corpusVerbs = new Map();
  for (const entry of corpus.entries) {
    if (entry.partOfSpeech === 'VRB') corpusVerbs.set(entry.lemma.toLowerCase(), entry);
  }

  console.log('Reading Flexiounstabellen verb tables …');
  const tables = await readVerbTables(paths.datasetXmlPath('tab'));
  console.log(`  ${tables.size} verbs with a complete present tense`);

  const items = [];
  let droppedUnclean = 0;
  for (const [infinitive, table] of tables) {
    const corpusEntry = corpusVerbs.get(infinitive.toLowerCase());
    if (!corpusEntry) continue; // outside the A1/A2 Grondwuertschatz, out of scope for a beginner drill
    if (!PERSONS.every((p) => isClean(table.present[p]))) {
      droppedUnclean += 1;
      continue;
    }
    items.push({
      id: table.id,
      infinitive: table.infinitive,
      pastParticiple: table.pastParticiple,
      auxiliaryVerb: table.auxiliaryVerb,
      level: corpusEntry.level,
      en: corpusEntry.glosses?.en?.[0] ?? null,
      present: table.present,
    });
  }

  items.sort((a, b) => (a.level === b.level ? a.infinitive.localeCompare(b.infinitive) : a.level === 'A1' ? -1 : 1));

  const meta = {
    generatedAt: new Date().toISOString(),
    generator: 'pipeline/build-verbs.js',
    license: 'CC0-1.0',
    corpus: corpus.meta.sources,
    attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu — Flexiounstabellen",
    pronouns: PRONOUNS,
    counts: { items: items.length, a1: items.filter((i) => i.level === 'A1').length, a2: items.filter((i) => i.level === 'A2').length },
  };

  const payload = { meta, items };
  await writeJson(path.join(paths.ITEMS_DIR, 'verbs.json'), payload);
  const appData = path.join(paths.ROOT, 'app', 'data');
  await writeJson(path.join(appData, 'verbs.json'), payload);

  console.log(`verbs: ${items.length} conjugation sets (${meta.counts.a1} A1, ${meta.counts.a2} A2), ${droppedUnclean} dropped by the gate`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
