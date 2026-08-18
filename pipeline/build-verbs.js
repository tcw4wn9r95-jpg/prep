#!/usr/bin/env node
'use strict';

/**
 * Generates verb conjugation drill items.
 *
 * Present tense, past tense and the imperative all come straight from LOD's
 * own Flexiounstabellen (`.cache/lod/tab.xml`, `<verbConjugation>` records) —
 * nothing here is generated or guessed, same rule as the rest of the
 * pipeline: every Luxembourgish form ships verbatim from a LOD table cell.
 *
 * "Past tense" is LOD's `presentPerfect` block (aux + participle, per
 * person), not the literary `pastSimple` (Präteritum). That is a deliberate
 * choice, not a simplification: the app's own explanations already tell the
 * learner that the perfect is "the ordinary way to talk about the past"
 * (see anthropic.js's system prompt) — Luxembourgish does not use a simple
 * past in everyday speech the way English or German do, and LOD only
 * publishes `pastSimple` for 66 of these 365 verbs, almost all of them the
 * two auxiliaries and a few strong verbs used in narration. `presentPerfect`
 * is complete for 364 of 365 and is what a beginner actually needs to say
 * "I ate" or "we went".
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
const { makeGate, primaryExample } = require('./lib/gate');

const PERSONS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const PRONOUNS = { p1: 'ech', p2: 'du', p3: 'hien/si/hatt', p4: 'mir', p5: 'dir', p6: 'si' };
/** The imperative only ever addresses "you" — singular (p2) or plural/formal
 * (p5). LOD's table follows the same `<present>` shape as every other mood
 * here, just with two persons instead of six. */
const IMPERATIVE_PERSONS = ['p2', 'p5'];

function textOf(node, name) {
  const child = node.children.find((c) => c.name === name);
  return child && child.text ? child.text.trim() : null;
}

/**
 * One LOD table cell, reduced to the bare form a learner should read.
 *
 * Two things get stripped, and both are LOD conventions rather than this
 * app's invention: a cell may offer a second accepted spelling after a slash
 * ("géif / géing", "missen / mussen") — the first is kept, since a cheat
 * sheet has room for one answer, not two; and a reflexive verb's cell carries
 * its reflexive pronoun in parentheses ("hunn (mech) gefreet") — dropped
 * because this app teaches no reflexive pronouns elsewhere, so showing one
 * here would raise a question nothing else answers.
 */
function cleanForm(raw) {
  if (!raw) return null;
  // The imperative's closing "!" is punctuation on the whole cell, but some
  // cells put it only after the *second* slash variant ("hieft / hutt
  // (iech)!") — so taking the first variant before removing anything else
  // silently dropped the mark from forms that are exclamations by nature.
  // Lifting it off the end first, and back on afterwards, keeps it regardless
  // of which variant survives the rest of the cleaning.
  const trailing = raw.match(/[!?.]+\s*$/)?.[0]?.trim() ?? '';
  const body = raw
    .replace(/[!?.]+\s*$/, '')
    .split('/')[0]
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!body) return null;
  return trailing && !body.endsWith(trailing) ? `${body}${trailing}` : body;
}

/**
 * A `<present>`-shaped block (present tense, past tense, or the imperative
 * all use the same shape) reduced to `{person: form}`, or `null` unless every
 * person in `persons` came out non-empty.
 *
 * All-or-nothing, not "fill in what exists": a table with a hole in it has no
 * way to say so on the cheat sheet, and "ech geet" next to a blank "du ___"
 * reads as broken rather than as a gap in the source.
 */
function readComplete(block, persons) {
  if (!block) return null;
  const forms = {};
  for (const person of persons) {
    forms[person] = cleanForm(textOf(block, person));
    if (!forms[person]) return null;
  }
  return forms;
}

/**
 * The imperative specifically: partial is normal, not a defect. 21 of these
 * 365 verbs publish only the p5 (formal/plural) form — mostly verbs where
 * commanding a single "you" does not make sense — so this keeps whichever
 * persons exist rather than discarding the whole thing for want of the other.
 */
function readImperative(table) {
  const block = table.children.find((c) => c.name === 'imperative')?.children.find((c) => c.name === 'present');
  if (!block) return null;
  const forms = {};
  for (const person of IMPERATIVE_PERSONS) forms[person] = cleanForm(textOf(block, person));
  return forms.p2 || forms.p5 ? forms : null;
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
      const present = readComplete(indicative?.children.find((c) => c.name === 'present'), PERSONS);
      if (!present) continue;

      const past = readComplete(indicative?.children.find((c) => c.name === 'presentPerfect'), PERSONS);
      const imperative = readImperative(table);

      if (!byInfinitive.has(infinitive)) {
        byInfinitive.set(infinitive, {
          id: table.attrs.id,
          infinitive,
          pastParticiple: textOf(table, 'pastParticiple'),
          auxiliaryVerb: textOf(table, 'auxiliaryVerb'),
          present,
          past,
          imperative,
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
  // Two indexes, and the id one has to win.
  //
  // Keying only by lemma loses homographs: `kënnen` is both KENNEN1 ("can")
  // and KENNEN3 ("to be responsible for"), `ginn` is GINN1 ("to give") and
  // GINN4 ("there is"), and whichever entry the corpus happened to list last
  // overwrote the other. The inflection table then took its forms from
  // KENNEN1 and its gloss from KENNEN3 — a row correctly identified as the
  // modal verb, labelled with an unrelated meaning.
  //
  // The table id and the dictionary entry id are the same LOD identifier, so
  // matching on it is exact rather than a guess. Lemma stays as the fallback
  // for the tables whose id is not itself a corpus entry.
  const corpusVerbsById = new Map();
  const corpusVerbs = new Map();
  for (const entry of corpus.entries) {
    if (entry.partOfSpeech !== 'VRB') continue;
    corpusVerbsById.set(entry.id, entry);
    if (!corpusVerbs.has(entry.lemma.toLowerCase())) corpusVerbs.set(entry.lemma.toLowerCase(), entry);
  }

  console.log('Reading Flexiounstabellen verb tables …');
  const tables = await readVerbTables(paths.datasetXmlPath('tab'));
  console.log(`  ${tables.size} verbs with a complete present tense`);

  const items = [];
  let droppedUnclean = 0;
  let droppedExamples = 0;
  let droppedPast = 0;
  let droppedImperative = 0;
  for (const [infinitive, table] of tables) {
    const corpusEntry = corpusVerbsById.get(table.id) ?? corpusVerbs.get(infinitive.toLowerCase());
    if (!corpusEntry) continue; // outside the A1/A2 Grondwuertschatz, out of scope for a beginner drill
    // The present tense is this item's reason to exist — every other screen
    // that reads verbs.json assumes it — so an unclean present drops the
    // whole verb. Past tense and the imperative are additions on top of an
    // already-useful item, so an unclean one is nulled rather than taking the
    // present tense down with it.
    if (!PERSONS.every((p) => isClean(table.present[p], 'present'))) {
      droppedUnclean += 1;
      continue;
    }

    let past = table.past;
    if (past && !PERSONS.every((p) => isClean(past[p], 'past'))) {
      past = null;
      droppedPast += 1;
    }

    let imperative = table.imperative;
    if (imperative && !IMPERATIVE_PERSONS.every((p) => !imperative[p] || isClean(imperative[p], 'imperative'))) {
      imperative = null;
      droppedImperative += 1;
    }

    let example = primaryExample(corpusEntry);
    if (example && !isClean(example.lb, 'example')) {
      example = null;
      droppedExamples += 1;
    }

    items.push({
      id: table.id,
      infinitive: table.infinitive,
      pastParticiple: table.pastParticiple,
      auxiliaryVerb: table.auxiliaryVerb,
      level: corpusEntry.level,
      en: corpusEntry.glosses?.en?.[0] ?? null,
      present: table.present,
      past,
      imperative,
      example,
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
    counts: {
      items: items.length,
      a1: items.filter((i) => i.level === 'A1').length,
      a2: items.filter((i) => i.level === 'A2').length,
      past: items.filter((i) => i.past).length,
      imperative: items.filter((i) => i.imperative).length,
    },
  };

  const payload = { meta, items };
  await writeJson(path.join(paths.ITEMS_DIR, 'verbs.json'), payload);
  const appData = path.join(paths.ROOT, 'app', 'data');
  await writeJson(path.join(appData, 'verbs.json'), payload);

  console.log(
    `verbs: ${items.length} conjugation sets (${meta.counts.a1} A1, ${meta.counts.a2} A2), ` +
      `${meta.counts.past} with a past tense, ${meta.counts.imperative} with an imperative, ` +
      `${droppedUnclean} dropped by the gate, ${droppedPast} past-tense fields dropped, ` +
      `${droppedImperative} imperatives dropped, ${droppedExamples} example sentences dropped`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { cleanForm, readComplete, readImperative };
