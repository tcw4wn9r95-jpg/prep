'use strict';

/**
 * The grammar guide.
 *
 * The prose is English and free to write. The danger is the Luxembourgish
 * quoted inside it: a rule stated with an invented form teaches the invention,
 * and the validator never sees this file because it is app code rather than
 * generated content. So the forms it may quote are checked here, against the
 * shipped decks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const vocab = require(path.join(ROOT, 'app', 'data', 'vocab.json')).items;
const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;
const phrases = require(path.join(ROOT, 'app', 'data', 'phrases.json')).items;
const grammar = require(path.join(ROOT, 'app', 'data', 'grammar.json')).items;

let guide;
test.before(async () => {
  guide = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'grammar-guide.js')).href);
});

/** Every Luxembourgish surface form the shipped decks attest. */
function attestedForms() {
  const forms = new Set();
  const add = (value) => {
    for (const word of String(value ?? '').match(/[\p{L}]+/gu) ?? []) forms.add(word.toLowerCase());
  };
  for (const item of vocab) { add(item.lb); add(item.example?.lb); add(item.article); }
  for (const item of verbs) {
    add(item.infinitive); add(item.pastParticiple); add(item.auxiliaryVerb); add(item.example?.lb);
    for (const form of Object.values(item.present ?? {})) add(form);
  }
  for (const item of phrases) { add(item.lb); add(item.example?.lb); add(item.variant?.lb); }
  for (const item of grammar) {
    add(item.lb); add(item.article); add(item.before); add(item.after); add(item.example?.lb);
    for (const option of item.options_lb ?? []) add(option);
  }
  return forms;
}

test('guide: every topic states a rule and teaches it', () => {
  assert.ok(guide.GRAMMAR_GUIDE.length >= 5, 'the guide should cover more than the three drilled kinds');
  for (const topic of guide.GRAMMAR_GUIDE) {
    assert.ok(topic.id && topic.title, 'a topic needs an id and a title');
    assert.ok(topic.rule.length > 20, `${topic.id}: the rule line is too short to say anything`);
    assert.ok(topic.points.length >= 2, `${topic.id}: needs more than one paragraph of teaching`);
    assert.equal(typeof topic.examples, 'function');
  }
});

test('guide: it is a course — numbered, contiguous, and grouped into units', () => {
  // The topics used to sit in an arbitrary order, which made the guide
  // something to dip into rather than work through. The notecards screen
  // renders them as levels 1..N and walks between them with prev/next, so a
  // duplicated or missing level number is a broken screen, not a cosmetic slip.
  const levels = guide.GRAMMAR_GUIDE.map((topic) => topic.level);
  assert.equal(new Set(levels).size, levels.length, 'two topics claim the same level');
  assert.deepEqual(
    levels,
    [...levels].sort((a, b) => a - b),
    'GRAMMAR_GUIDE should already be in course order',
  );
  assert.deepEqual(levels, Array.from({ length: levels.length }, (_, i) => i + 1), 'levels should run 1..N with no gaps');

  for (const topic of guide.GRAMMAR_GUIDE) {
    assert.ok(guide.UNITS.includes(topic.unit), `${topic.id}: "${topic.unit}" is not one of the declared units`);
  }
  // Units have to stay contiguous, since the contents page prints each one
  // once and lists the levels under it.
  const order = guide.GRAMMAR_GUIDE.map((topic) => guide.UNITS.indexOf(topic.unit));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the units are interleaved rather than in blocks');
});

test('guide: it covers the whole published syllabus, not just the drilled kinds', () => {
  // The course follows RTL Today's Language Basics 1-19. These are the topics
  // that series teaches which the app had no theory for at all before — losing
  // one of them silently would put the numbering back out of step with the
  // articles it claims to follow.
  for (const id of ['opbei', 'ordinals', 'formal', 'present', 'sinn', 'hunn', 'future', 'possessive', 'comparative', 'prepositions', 'wordbuilding', 'origins']) {
    const topic = guide.GRAMMAR_GUIDE.find((entry) => entry.id === id);
    assert.ok(topic, `the course lost its ${id} level`);
    assert.ok(topic.level >= 1 && topic.level <= 19, `${id} should sit inside the 19 levels the series covers`);
  }
});

test('guide: every topic can actually show an example', () => {
  // A topic whose `examples()` returns nothing renders as theory with no
  // illustration, which is the failure mode this whole screen exists to fix.
  // These are mined by pattern out of the shipped sentences, so a content
  // rebuild that drops the wrong sentences would empty one silently.
  const data = { vocab, verbs, phrases, grammar };
  for (const topic of guide.GRAMMAR_GUIDE) {
    const groups = topic.examples(data) ?? [];
    const rows = groups.reduce(
      (sum, group) => sum + (group.items?.length ?? 0) + (group.pairs?.length ?? 0) + (group.sentences?.length ?? 0) + (group.verbs?.length ?? 0),
      0,
    );
    assert.ok(rows > 0, `${topic.id}: the theory has no worked example behind it`);
    for (const group of groups) assert.ok(group.label, `${topic.id}: an example group with no label`);
  }
});

test('guide: a topic that names a drill points at one that exists', () => {
  // The "practise this" button on a notecard. A route that filters to nothing
  // would drop the reader into an empty session straight after reading the
  // rule it was meant to practise.
  const kinds = new Set(grammar.map((item) => item.kind));
  for (const topic of guide.GRAMMAR_GUIDE) {
    if (!topic.drill) continue;
    const match = /^#\/grammar\/(.+)$/.exec(topic.drill);
    if (!match) continue;
    assert.ok(kinds.has(match[1]), `${topic.id}: drills #/grammar/${match[1]}, which the built deck has no items for`);
  }
});

test('guide: the vocabulary-origins level shows LOD’s own translations, not asserted etymologies', () => {
  // LOD records no etymology, so this level cannot claim where a word came
  // from. What it shows instead is evidence: entries whose Luxembourgish
  // headword is spelled exactly like the dictionary's own German or French
  // translation of it. `from` therefore has to *be* that translation — a
  // hand-written source word would turn evidence back into an assertion.
  const strip = (value) => String(value).replace(/^(?:der|die|das|le|la|les|l')\s+/i, '').trim();
  const groups = guide.topicFor('origins').examples({ vocab, verbs, phrases, grammar });
  const items = groups.flatMap((group) => group.items ?? []);
  assert.ok(items.length >= 8, 'the origins level should show a pattern, not one or two words');
  for (const item of items) {
    assert.ok(item.from, `${item.lb}: shown as a loanword with no source word`);
    const entry = vocab.find((row) => row.lb === item.lb.replace(/^(?:d’|d'|de|den|déi)\s*/, ''));
    assert.ok(entry, `${item.lb} is not a vocabulary entry`);
    assert.ok(
      strip(entry.de ?? '') === item.from || strip(entry.fr ?? '') === item.from,
      `${item.lb}: "${item.from}" is not LOD's German or French translation of it`,
    );
  }
});

test('guide: the three drilled kinds each have their theory', () => {
  // drill/engine.js looks a card's theory up by `item.kind`, so these ids are
  // load-bearing rather than decorative.
  for (const kind of ['gender', 'nrule', 'adjective']) {
    assert.ok(guide.topicFor(kind), `no theory for the ${kind} deck`);
  }
  assert.equal(guide.topicFor('nonsense'), null);
});

test('guide: it teaches the past tense, which the interview asks for', () => {
  // The published topic sheets put a whole phase on d'Vergaangenheet and the
  // app taught no past tense at all.
  const perfect = guide.topicFor('perfect');
  assert.ok(perfect, 'no perfect-tense topic');
  const examples = perfect.examples({ verbs });
  const all = examples.flatMap((group) => group.verbs ?? []);
  assert.ok(all.length >= 6, 'the perfect topic should show real verbs from both auxiliaries');
  assert.ok(all.some((verb) => verb.aux === 'hunn') && all.some((verb) => verb.aux === 'sinn'));
  for (const verb of all) {
    const real = verbs.find((item) => item.infinitive === verb.infinitive);
    assert.ok(real, `${verb.infinitive} is not in the verb deck`);
    assert.equal(verb.participle, real.pastParticiple, `${verb.infinitive}: participle does not match LOD`);
    assert.equal(verb.aux, real.auxiliaryVerb, `${verb.infinitive}: auxiliary does not match LOD`);
  }
});

test('guide: no example is invented — every one comes from a shipped deck', () => {
  const data = { vocab, verbs, phrases, grammar };
  const attested = attestedForms();
  for (const topic of guide.GRAMMAR_GUIDE) {
    for (const group of topic.examples(data) ?? []) {
      const quoted = [
        ...(group.items ?? []).map((item) => item.lb),
        ...(group.pairs ?? []).flatMap((pair) => pair.forms),
        ...(group.sentences ?? []).map((sentence) => sentence.lb ?? `${sentence.before ?? ''} ${sentence.form ?? ''} ${sentence.after ?? ''}`),
        ...(group.verbs ?? []).flatMap((verb) => [verb.infinitive, verb.participle, verb.aux]),
      ];
      for (const text of quoted) {
        for (const word of String(text).match(/[\p{L}]+/gu) ?? []) {
          assert.ok(attested.has(word.toLowerCase()), `${topic.id} quotes "${word}", which no shipped deck attests`);
        }
      }
    }
  }
});

test('guide: the Luxembourgish written into the prose is attested too', () => {
  // The teaching text names Luxembourgish forms inline — the articles, the
  // pronouns, the preposition lists, the two auxiliaries. Every one of them
  // still has to be real.
  //
  // Prose is checked against the full LOD form index rather than against the
  // shipped decks alone. The decks are an exam-scoped subset of the
  // dictionary, so a level that has to *name* the dative prepositions or the
  // irregular comparatives will legitimately reach words no deck example
  // happens to contain. `content/lexicon.json` is still LOD — 258,946 real
  // forms — so this stays an attestation check and not a rubber stamp; it
  // rejects plausible-looking inventions like "sinnen" or "geliest".
  //
  // Examples are held to the stricter deck-only rule, in the test above. The
  // asymmetry is deliberate: a rule may name any real word, but an
  // illustration has to be a sentence somebody actually wrote.
  const attested = attestedForms();
  const lexicon = new Set(Object.keys(require(path.join(ROOT, 'content', 'lexicon.json')).forms).map((form) => form.toLowerCase()));
  const LATIN_ONLY = /^[a-zA-ZäëéöüÄËÉÖÜ]+$/;
  const ENGLISH = new Set(
    ('a an and are as at be before but by can change do does end ending endings every everything for form forms from front gender genitive go goes has have here how in is it its kind know learn like many most no not noun nouns of on one or other others out part past perfect place plural position put question questions rule rules same say says sentence sentences several shape so some speaking start starts still subject take takes tense that the their them then there these they thing this those three time to two up use used verb verbs way what when where which who whole why with word words work you your after all also always another any because been being both come comes could down each even first four give given group had hard he her him his if into just keep kept less let long look made make me more much must my near never new next now off often only over own place plain point real reason right run same second see seen sentence set she should side simple since single sit sits small something sound sounds speak spelled spelling still such sure take talk than their there through together too under until very want was were will would write written wrong yes yet').split(
        ' ',
      ),
  );

  for (const topic of guide.GRAMMAR_GUIDE) {
    for (const text of [topic.rule, ...topic.points]) {
      for (const word of text.match(/[\p{L}]+/gu) ?? []) {
        const lower = word.toLowerCase();
        // Only judge words that could plausibly be Luxembourgish tokens and
        // are not ordinary English — anything the decks attest is fine, and
        // anything clearly English is not a Luxembourgish claim at all.
        if (!LATIN_ONLY.test(word)) continue;
        if (ENGLISH.has(lower)) continue;
        if (attested.has(lower) || lexicon.has(lower)) continue;
        // Anything left must be English prose the crude list above missed, not
        // a Luxembourgish form. Flag the ones that look Luxembourgish.
        assert.ok(
          !/[äëéöü’]/.test(word) && !/^(de|den|d|dat|eng|en|dem|der|hunn|sinn|net|ech|du|hien|si|hatt|mir|dir)$/.test(lower),
          `${topic.id}: "${word}" is written into the prose but LOD does not attest it`,
        );
      }
    }
  }
});

test('guide: the article rule it states matches what the corpus actually does', async () => {
  // The bug this guards: the gender topic said "the indefinite is en for
  // masculine, eng for feminine and neuter". That is wrong — `en` covers
  // masculine *and neuter*, and `eng` is the feminine one. A learner hit it as
  // a flat contradiction between the guide and a card whose answer was right,
  // and the earlier test could not catch it because it only checked that the
  // quoted tokens were attested, not that the claim was true.
  //
  // So the claim is measured, not read. Counted over the shipped decks'
  // example sentences rather than the full corpus, which keeps this fast and
  // uses exactly the text the app shows.
  const PLAIN = new Set(['M', 'F', 'N']);
  const gender = new Map(
    vocab.filter((item) => item.pos === 'SUBST' && PLAIN.has(item.gender)).map((item) => [item.lb.toLowerCase(), item.gender]),
  );
  const sentences = [
    ...vocab.map((item) => item.example?.lb),
    ...verbs.map((item) => item.example?.lb),
    ...grammar.map((item) => item.example?.lb),
  ].filter(Boolean);

  const counts = { M: {}, F: {}, N: {} };
  for (const text of sentences) {
    const tokens = text.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const article = tokens[i].toLowerCase();
      if (article !== 'en' && article !== 'eng') continue;
      // The noun may sit one or two words on, past an adjective.
      for (const offset of [1, 2]) {
        const g = gender.get(tokens[i + offset]?.toLowerCase());
        if (!PLAIN.has(g)) continue;
        counts[g][article] = (counts[g][article] ?? 0) + 1;
        break;
      }
    }
  }

  const dominant = (g) => Object.entries(counts[g]).sort((a, b) => b[1] - a[1])[0]?.[0];
  assert.ok(Object.values(counts.F).reduce((a, b) => a + b, 0) > 20, 'not enough feminine evidence to judge');
  assert.equal(dominant('F'), 'eng', 'feminine nouns should mostly take eng');
  assert.equal(dominant('M'), 'en', 'masculine nouns should mostly take en');
  if (Object.values(counts.N).reduce((a, b) => a + b, 0) >= 10) {
    assert.equal(dominant('N'), 'en', 'neuter nouns take en, not eng — this is what the guide got wrong');
  }

  // And the prose has to agree with that.
  const text = guide.topicFor('gender').points.join(' ').toLowerCase();
  assert.ok(
    /\ben for both masculine and neuter\b/.test(text) || /\ben\b[^.]*\bmasculine and neuter\b/.test(text),
    'the gender topic must say en covers masculine and neuter',
  );
  assert.ok(!/eng for feminine and neuter/.test(text), 'the old, wrong claim is back');
});
