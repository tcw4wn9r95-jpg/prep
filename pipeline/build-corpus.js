#!/usr/bin/env node
'use strict';

/**
 * Turns the three cached LOD exports into the two files the rest of the
 * project is allowed to read:
 *
 *   content/lexicon.json  every Luxembourgish form we accept, each traced to
 *                         the LOD record id it came from, plus the n-rule
 *                         flags and the corpus-derived exception table.
 *                         This is what validate.js checks against.
 *   content/corpus.json   the exam-scoped authoring vocabulary (LOD's own
 *                         Grondwuertschatz A1/A2 tagging) with glosses,
 *                         inflection, IPA and example sentences.
 *
 * Run: node pipeline/build-corpus.js   (after pipeline/fetch-lod.js)
 */

const fsp = require('node:fs/promises');
const path = require('node:path');

const xml = require('./lib/xml');
const { tokenise } = require('./lib/lux-text');
const { startsTrigger, hasOpaqueOnset } = require('./lib/nrule');
const paths = require('./lib/paths');
const { writeJson, writeJsonWithLineDelimitedMap } = require('./lib/write-json');

const { CORE_CATEGORIES } = paths;

/**
 * A following-token becomes an n-rule exception when LOD's own examples show
 * it genuinely keeps the final n there sometimes - which is a question about
 * evidence, not about a raw percentage. `senger` at 56/248 (23%) is weak per
 * sentence but 248 observations make the variation real; `si` at 8/162 (5%)
 * looks similar but is consistent with noise.
 *
 * So the test is the Wilson 95% lower bound on the retention rate: if even the
 * pessimistic reading says LOD keeps the n before this token more than 5% of
 * the time, we will not fail a build over it. It stays a warning, which is the
 * honest verdict when the reference corpus itself writes both forms.
 */
const RETENTION_LOWER_BOUND = 0.05;
const RETENTION_EXCEPTION_MIN_OBSERVATIONS = 3;

/** Wilson score interval, lower bound, at ~95% (z = 1.96). */
function wilsonLowerBound(successes, total) {
  if (total === 0) return 0;
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return Math.max(0, (centre - margin) / denominator);
}

const log = (message) => process.stdout.write(`${message}\n`);

/* ------------------------------------------------------------------ tab.xml */

/**
 * Every inflected form in the conjugation and declension tables, mapped to the
 * table id it belongs to. These are authoritative: they are the forms LOD
 * itself publishes for each lemma.
 */
async function readInflectionTables(file) {
  const forms = new Map(); // form -> table id
  let tables = 0;

  for await (const record of xml.records(file, 'inflection')) {
    for (const table of record.children) {
      const id = table.attrs.id;
      if (!id) throw new Error(`inflection table without an id in ${path.basename(file)}`);
      tables += 1;
      collectLeafText(table, (value) => {
        for (const form of splitFormCell(value)) {
          if (!forms.has(form)) forms.set(form, id);
        }
      });
    }
  }
  return { forms, tables };
}

/** Table cells hold one form, or several separated by "/" or ",". */
function splitFormCell(value) {
  return String(value)
    .split(/\s*[/,]\s*/)
    .map((part) => part.trim())
    .filter((part) => part !== '' && /\p{L}/u.test(part));
}

function collectLeafText(node, visit) {
  if (node.children.length === 0) {
    if (node.text !== '') visit(node.text);
    return;
  }
  for (const child of node.children) collectLeafText(child, visit);
}

/* ------------------------------------------------------------------ art.xml */

/**
 * Headword-level grammar: IPA, part of speech and gender, the inflected forms
 * listed on the entry (plural, past participle, auxiliary), and the n-rule
 * variant LOD records on each of those forms.
 */
async function readDictionary(file) {
  const entries = new Map();
  /**
   * form (as written) -> entry id -> how many times LOD marks that form as the
   * headword of that entry.
   *
   * The one part of the export the pipeline used to discard, and the answer to
   * the frequency mis-attribution that has been open for weeks: `lexicon.forms`
   * holds a single id per spelling, so a homograph credited every occurrence to
   * whichever record won the index — `wat` "the more…, the more" scored 249 and
   * `wat` "what" scored 0. Each example marks which token *is* the entry, so
   * LOD itself says which record an occurrence belongs to.
   *
   * The counts matter as much as the ids. A spelling that two entries both
   * claim is not a coin flip between them: `hunn` is marked hundreds of times
   * for the auxiliary and a handful for HUNN2 "cockerel", and splitting it
   * evenly is how a rooster lands in unit 3. The weights are what make the
   * split honest.
   *
   * Case is kept for the same reason. Luxembourgish capitalises its nouns, so
   * `Hunn` and `hunn` are already two different words on the page; lowercasing
   * throws away a distinction LOD wrote down.
   *
   * Only examples with exactly one marked token count. A separable verb marks
   * both of its parts (`ubaken` marks "béckt" and "un"), so its particle would
   * otherwise look like evidence for sixty verbs and bury the preposition `un`
   * that genuinely is common. One mark means one whole headword.
   *
   * Note this lives here rather than beside the other example walk: only
   * art.xml carries the markup. search.xml has none of it.
   */
  const headwordForms = new Map();

  for await (const record of xml.records(file, 'entry')) {
    const id = record.attrs.id;

    for (const example of xml.findAll(record, 'example')) {
      const text = xml.find(example, 'text');
      if (!text) continue;
      const heads = (text.children ?? []).filter((node) => node.name === 'inflectedHeadword');
      if (heads.length !== 1) continue;
      const form = String(heads[0].text ?? '').trim();
      if (!form || /\s/.test(form)) continue;
      if (!headwordForms.has(form)) headwordForms.set(form, new Map());
      const byId = headwordForms.get(form);
      byId.set(id, (byId.get(id) ?? 0) + 1);
    }
    const lemma = xml.find(record, 'lemma')?.text ?? '';
    const ipa = xml.find(record, 'ipa')?.text ?? null;

    const inflected = [];
    for (const structure of xml.findAll(record, 'microStructure')) {
      for (const inflection of xml.childrenNamed(structure, 'inflection')) {
        for (const form of xml.childrenNamed(inflection, 'form')) {
          inflected.push({
            type: inflection.attrs.type ?? null,
            form: form.text,
            nRuleForm: form.attrs.nRuleForm ?? null,
          });
        }
      }
      for (const tag of ['pastParticiple', 'auxiliaryVerb', 'secondaryHeadword']) {
        for (const node of xml.findAll(structure, tag)) {
          if (node.text !== '') inflected.push({ type: tag, form: node.text, nRuleForm: null });
        }
      }
    }

    const pos = xml.find(record, 'partOfSpeech');
    entries.set(id, {
      id,
      lemma,
      ipa,
      partOfSpeech: pos?.text ?? null,
      gender: pos?.attrs.gen ?? null,
      inflected,
    });
  }
  return { entries, headwordForms };
}

/* --------------------------------------------------------------- search.xml */

/**
 * The search index is where orthography lives. `suggest="true"` marks a form
 * ZLS has verified; everything else is auto-generated and explicitly not
 * authoritative, except that `reason="n-rule"` identifies the n-dropped
 * variant, which we do want - it is a real form, just not a search entry.
 */
async function readSearchIndex(file) {
  const verified = new Map(); // form -> entry id
  const nRuleForms = new Map(); // n-dropped form -> entry id
  const erroneous = new Map(); // form flagged reason="erroneous-spelling" -> entry id
  const core = [];
  const sentences = [];

  let entryCount = 0;
  let withAudioFlag = 0;

  for await (const record of xml.records(file, 'entry')) {
    entryCount += 1;
    const id = record.attrs.id;
    if (record.attrs.audio === 'true') withAudioFlag += 1;

    // Many entries share a form - "maachen" is a spelling of both MAACHEN1 and
    // BEKANNTMAACHEN1. Whichever entry the form is the *headword* of is the
    // useful trace, so it wins over whichever happened to be read first.
    const headword = (xml.find(record, 'lemma')?.text ?? '').toLowerCase();
    // An n-dropped form is never itself a headword, so it matches on the
    // headword it drops the n from ("maache" -> "maachen").
    const claim = (map, value, dropsN = false) => {
      const lower = value.toLowerCase();
      if (!map.has(value) || lower === headword || (dropsN && `${lower}n` === headword)) map.set(value, id);
    };

    for (const spelling of xml.findAll(record, 'spelling')) {
      const value = spelling.text;
      if (value === '') continue;
      if (spelling.attrs.reason === 'erroneous-spelling') {
        claim(erroneous, value);
        continue;
      }
      if (spelling.attrs.suggest === 'true') claim(verified, value);
      else if (spelling.attrs.reason === 'n-rule') claim(nRuleForms, value, true);
    }

    const categories = xml.childrenNamed(xml.find(record, 'categories') ?? { children: [] }, 'category')
      .map((node) => node.text);
    const allCategories = new Set(xml.findAll(record, 'category').map((node) => node.text));

    for (const example of xml.findAll(record, 'example')) {
      const textNode = xml.find(example, 'text');
      const text = textNode?.text;
      if (text) sentences.push(text);
    }

    if (CORE_CATEGORIES.some((category) => allCategories.has(category))) {
      core.push({
        id,
        lemma: xml.find(record, 'lemma')?.text ?? '',
        relevance: record.attrs.relevance ? Number(record.attrs.relevance) : null,
        hasAudioFlag: record.attrs.audio === 'true',
        categories: [...allCategories].sort(),
        topCategories: categories,
        meanings: readMeanings(record),
      });
    }
  }

  return { verified, nRuleForms, erroneous, core, sentences, entryCount, withAudioFlag };
}

function readMeanings(record) {
  const meanings = [];
  for (const meaning of xml.findAll(record, 'meaning')) {
    if (!meaning.attrs.id) continue; // <meaning> also appears inside <translations>
    const glosses = {};
    for (const block of xml.findAll(meaning, 'translations')) {
      const lang = block.attrs.lang;
      if (!lang) continue;
      const verifiedTranslations = xml
        .childrenNamed(block, 'translation')
        .filter((node) => node.attrs.suggest !== 'false')
        .map((node) => node.text)
        .filter(Boolean);
      if (verifiedTranslations.length > 0) glosses[lang] = verifiedTranslations;
    }
    meanings.push({
      id: meaning.attrs.id,
      number: meaning.attrs.number ? Number(meaning.attrs.number) : null,
      lemma: xml.childrenNamed(meaning, 'lemma')[0]?.text ?? null,
      glosses,
      examples: xml.findAll(meaning, 'example').map((example) => ({
        text: xml.find(example, 'text')?.text ?? '',
        gloss: xml.find(example, 'gloss')?.text ?? null,
        attributes: xml.findAll(example, 'attribute').map((node) => node.text),
      })).filter((example) => example.text !== ''),
    });
  }
  return meanings;
}

/* -------------------------------------------------- n-rule exception table */

/**
 * Derives, from LOD's own example sentences, the following-tokens before which
 * LOD keeps a final n often enough that failing a build on it would be wrong.
 * This is measurement, not judgement: the output lands in lexicon.json where
 * it can be read and diffed.
 */
function deriveRetentionExceptions(sentences, nRuleForms) {
  const flagged = new Set([...nRuleForms.keys()].map((form) => form.toLowerCase()));
  const counts = new Map(); // following token -> { kept, dropped }

  for (const sentence of sentences) {
    const tokens = tokenise(sentence);
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const token = tokens[i];
      const next = tokens[i + 1];
      if (token.pauseAfter || token.isClitic) continue;
      const value = token.value.toLowerCase();
      const following = next.clitic ? next.clitic : next.value;
      const key = following.toLowerCase();
      // Before a trigger the n is kept by the rule itself, so those contexts
      // say nothing about exceptions. Only non-trigger contexts are evidence.
      if (startsTrigger(following)) continue;
      // Numerals and initialisms are skipped by the checker anyway, and
      // listing them here would grow the table with every number LOD happens
      // to use while doing nothing for the number it does not.
      if (hasOpaqueOnset(next.value)) continue;

      let kept = null;
      if (value.endsWith('n') && flagged.has(value.slice(0, -1))) kept = true;
      else if (!value.endsWith('n') && flagged.has(value)) kept = false;
      if (kept === null) continue;

      const bucket = counts.get(key) ?? { kept: 0, dropped: 0 };
      if (kept) bucket.kept += 1;
      else bucket.dropped += 1;
      counts.set(key, bucket);
    }
  }

  const exceptions = {};
  for (const [token, { kept, dropped }] of counts) {
    if (kept < RETENTION_EXCEPTION_MIN_OBSERVATIONS) continue;
    const total = kept + dropped;
    const lowerBound = wilsonLowerBound(kept, total);
    if (lowerBound <= RETENTION_LOWER_BOUND) continue;
    exceptions[token] = {
      kept,
      dropped,
      keptShare: Number((kept / total).toFixed(3)),
      lowerBound: Number(lowerBound.toFixed(3)),
    };
  }
  return { exceptions, observed: counts.size };
}

/* ------------------------------------------------------------------- build */

async function main() {
  const manifest = JSON.parse(await fsp.readFile(paths.MANIFEST_PATH, 'utf8')).datasets;

  log('Reading Flexiounstabellen …');
  const tables = await readInflectionTables(paths.datasetXmlPath('tab'));
  log(`  ${tables.tables.toLocaleString()} tables, ${tables.forms.size.toLocaleString()} distinct forms`);

  log('Reading Linguistesch Daten …');
  const { entries: dictionary, headwordForms } = await readDictionary(paths.datasetXmlPath('art'));
  log(
    `  ${dictionary.size.toLocaleString()} entries, ` +
      `${headwordForms.size.toLocaleString()} marked headword forms ` +
      `(${[...headwordForms.values()].filter((ids) => ids.size > 1).length.toLocaleString()} ambiguous)`,
  );

  log('Reading Sich-Index …');
  const index = await readSearchIndex(paths.datasetXmlPath('search'));
  log(
    `  ${index.entryCount.toLocaleString()} entries, ` +
      `${index.verified.size.toLocaleString()} verified spellings, ` +
      `${index.nRuleForms.size.toLocaleString()} n-rule forms, ` +
      `${index.sentences.length.toLocaleString()} example sentences`,
  );

  // The accepted-form index. Precedence matters: a verified spelling wins over
  // an inflection-table form, because the search index is the orthographic
  // authority and the tables are generated from the same lemma anyway.
  const forms = new Map();
  const addForm = (form, source, id) => {
    const key = form.toLowerCase();
    if (forms.has(key)) return;
    forms.set(key, { form, source, id });
  };
  for (const [form, id] of index.verified) addForm(form, 'spelling', id);
  for (const [form, id] of index.nRuleForms) addForm(form, 'n-rule', id);
  for (const entry of dictionary.values()) {
    addForm(entry.lemma, 'lemma', entry.id);
    for (const inflected of entry.inflected) {
      addForm(inflected.form, 'inflection', entry.id);
      if (inflected.nRuleForm) addForm(inflected.nRuleForm, 'n-rule', entry.id);
    }
  }
  for (const [form, tableId] of tables.forms) addForm(form, 'table', tableId);

  // Multi-word spellings ("virun Ae féieren") are indexed whole. Their parts
  // are only accepted if they also stand alone somewhere in the lexicon, so a
  // phrase entry can never launder an unverified single word.
  let multiWord = 0;
  for (const key of forms.keys()) if (/\s/.test(key)) multiWord += 1;

  log('Deriving n-rule exception table from LOD example sentences …');
  const { exceptions, observed } = deriveRetentionExceptions(index.sentences, index.nRuleForms);
  log(`  ${Object.keys(exceptions).length} exceptions from ${observed.toLocaleString()} observed contexts`);

  const nRuleFormList = [...index.nRuleForms.keys()].map((form) => form.toLowerCase()).sort();

  const lexicon = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/build-corpus.js',
      license: 'CC0-1.0',
      attribution: "Lëtzebuerger Online Dictionnaire (LOD), Zenter fir d'Lëtzebuerger Sprooch, via data.public.lu",
      sources: Object.fromEntries(
        Object.entries(manifest).map(([key, value]) => [
          key,
          { dataset: value.datasetSlug, resourceId: value.resourceId, resource: value.resourceTitle, xmlSha256: value.xmlSha256 },
        ]),
      ),
      counts: {
        forms: forms.size,
        headwordForms: headwordForms.size,
        ambiguousHeadwordForms: [...headwordForms.values()].filter((byId) => byId.size > 1).length,
        multiWordForms: multiWord,
        nRuleForms: nRuleFormList.length,
        erroneousSpellings: index.erroneous.size,
        retentionExceptions: Object.keys(exceptions).length,
      },
      nRuleExceptionRule: {
        wilsonLowerBound: RETENTION_LOWER_BOUND,
        minObservations: RETENTION_EXCEPTION_MIN_OBSERVATIONS,
        note: 'Derived from LOD example sentences; see docs/n-rule-evidence.md',
      },
    },
    // form (as written, case kept) -> { entry id: times LOD marks that form as
    // the headword of that entry }, counted over examples where exactly one
    // token is marked.
    //
    // `forms` below holds *one* id per spelling and is the orthographic
    // authority — "is this a real word?" — which is all it was ever built for.
    // Asking it "which record is this occurrence?" is what mis-credited every
    // homograph. This map answers that question with LOD's own annotation, and
    // says honestly when the answer is more than one — with the weights that
    // make sharing a count between them a measurement rather than a guess.
    headwordForms: Object.fromEntries(
      [...headwordForms.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, byId]) => [key, Object.fromEntries([...byId.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))]),
    ),
    // form (lowercased) -> "<source>:<LOD record id>", so every accepted token
    // traces to a record. Sources: spelling | n-rule | lemma | inflection | table
    forms: Object.fromEntries(
      [...forms.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => [key, `${value.source}:${value.id}`]),
    ),
    nRuleForms: nRuleFormList,
    // Spellings LOD explicitly flags as wrong. Hitting one is a better error
    // message than "unknown word".
    //
    // The flags are per-entry, not global: LOD lists "hir" as an erroneous
    // spelling of "hier" (HIER2) while "hir" is at the same time the correct
    // possessive (HIR3). So a form only counts as erroneous when it is not a
    // verified form of some other entry - otherwise the gate rejects perfectly
    // good words.
    erroneousSpellings: Object.fromEntries(
      [...index.erroneous.entries()]
        .filter(([form]) => !forms.has(form.toLowerCase()))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([form, id]) => [form.toLowerCase(), id]),
    ),
    nRuleRetentionExceptions: exceptions,
  };

  await fsp.mkdir(paths.CONTENT_DIR, { recursive: true });
  await writeJsonWithLineDelimitedMap(paths.LEXICON_PATH, lexicon, ['forms', 'headwordForms', 'erroneousSpellings']);
  log(`Wrote ${path.relative(paths.ROOT, paths.LEXICON_PATH)} (${forms.size.toLocaleString()} forms)`);

  // ---- corpus.json: the exam-scoped authoring vocabulary
  const audio = await readAudioCache();
  const coreEntries = index.core
    .map((entry) => {
      const grammar = dictionary.get(entry.id);
      return {
        id: entry.id,
        lemma: entry.lemma,
        partOfSpeech: grammar?.partOfSpeech ?? null,
        gender: grammar?.gender ?? null,
        ipa: grammar?.ipa ?? null,
        inflection: (grammar?.inflected ?? []).map((form) => ({
          type: form.type,
          form: form.form,
          nRuleForm: form.nRuleForm,
        })),
        level: entry.categories.includes('GWS A1') || entry.categories.includes('A1') ? 'A1' : 'A2',
        categories: entry.categories,
        glosses: mergeGlosses(entry.meanings),
        meanings: entry.meanings.map((meaning) => ({
          id: meaning.id,
          number: meaning.number,
          glosses: meaning.glosses,
          examples: meaning.examples.map((example) => ({
            text: example.text,
            gloss: example.gloss,
            attributes: example.attributes,
            audio: audio.examples[example.text] ?? null,
          })),
        })),
        audioAvailable: entry.hasAudioFlag,
      };
    })
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'lb') || a.id.localeCompare(b.id));

  const withAudio = coreEntries.reduce(
    (total, entry) => total + entry.meanings.reduce((n, m) => n + m.examples.filter((e) => e.audio).length, 0),
    0,
  );

  const corpus = {
    meta: {
      ...lexicon.meta,
      description:
        "Exam-scoped authoring vocabulary: LOD entries tagged with the Grondwuertschatz A1/A2 categories. " +
        'Every Luxembourgish string here is LOD verbatim - nothing in this file was written by a model.',
      counts: {
        entries: coreEntries.length,
        a1: coreEntries.filter((entry) => entry.level === 'A1').length,
        a2: coreEntries.filter((entry) => entry.level === 'A2').length,
        exampleSentences: coreEntries.reduce(
          (total, entry) => total + entry.meanings.reduce((n, m) => n + m.examples.length, 0),
          0,
        ),
        exampleSentencesWithAudio: withAudio,
      },
      audio: {
        resolved: audio.resolvedAt,
        note:
          'Audio URLs are not in the bulk export; pipeline/fetch-audio.js resolves them per entry from the LOD ' +
          'public API and caches them in .cache/lod/audio.json. Unresolved examples carry audio: null.',
      },
    },
    entries: coreEntries,
  };

  await writeJson(paths.CORPUS_PATH, corpus);
  log(
    `Wrote ${path.relative(paths.ROOT, paths.CORPUS_PATH)} ` +
      `(${coreEntries.length.toLocaleString()} entries, ${corpus.meta.counts.exampleSentences.toLocaleString()} examples, ` +
      `${withAudio.toLocaleString()} with audio)`,
  );

  if (withAudio === 0) {
    log('  note: no audio resolved yet - run `node pipeline/fetch-audio.js` and rebuild');
  }
}

async function readAudioCache() {
  try {
    const cache = JSON.parse(await fsp.readFile(paths.AUDIO_CACHE_PATH, 'utf8'));
    return { examples: cache.examples ?? {}, resolvedAt: cache.resolvedAt ?? null };
  } catch {
    return { examples: {}, resolvedAt: null };
  }
}

function mergeGlosses(meanings) {
  const merged = {};
  for (const meaning of meanings) {
    for (const [lang, values] of Object.entries(meaning.glosses)) {
      merged[lang] = [...new Set([...(merged[lang] ?? []), ...values])];
    }
  }
  return merged;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`build-corpus failed: ${error.stack}\n`);
    process.exit(1);
  });
}
