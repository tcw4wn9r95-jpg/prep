'use strict';

/**
 * Unit tests for the three pieces the gate is built from. The XML parser is
 * hand-rolled instead of a dependency, so it carries the burden of proving it
 * handles what LOD emits and refuses what it does not.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const xml = require('../lib/xml');
const { tokenise, sentences } = require('../lib/lux-text');
const { createChecker, startsTrigger, hasOpaqueOnset } = require('../lib/nrule');

function withTempXml(contents, run) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lod-')), 'sample.xml');
  fs.writeFileSync(file, contents);
  return run(file);
}

/* ------------------------------------------------------------------- xml.js */

test('xml: reads attributes, nested text and self-closing tags', async () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<entries>
  <entry id="A1" audio="true">
    <lemma ipa="a&#x2D0;">A</lemma>
    <spellings>
      <spelling suggest="true">A</spelling>
      <spelling suggest="false" reason="n-rule">Ae</spelling>
    </spellings>
    <empty/>
  </entry>
</entries>`;
  const records = await withTempXml(source, async (file) => {
    const out = [];
    for await (const record of xml.records(file, 'entry')) out.push(record);
    return out;
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].attrs.id, 'A1');
  assert.equal(xml.find(records[0], 'lemma').text, 'A');
  assert.equal(xml.find(records[0], 'lemma').attrs.ipa, 'aː');
  const spellings = xml.findAll(records[0], 'spelling');
  assert.equal(spellings.length, 2);
  assert.equal(spellings[1].attrs.reason, 'n-rule');
});

test('xml: decodes the entities LOD actually emits', () => {
  assert.equal(xml.decodeEntities('d&apos;A&amp;B &lt;x&gt; &#233; &#xE9;'), "d'A&B <x> é é");
});

test('xml: refuses markup outside the supported subset', async () => {
  await assert.rejects(
    withTempXml('<r><![CDATA[x]]></r>', async (file) => {
      for await (const record of xml.records(file, 'r')) void record;
    }),
    /unsupported markup declaration/,
  );
});

test('xml: refuses a mismatched closing tag', async () => {
  await assert.rejects(
    withTempXml('<r><a></b></r>', async (file) => {
      for await (const record of xml.records(file, 'a')) void record;
    }),
    /mismatched close/,
  );
});

test('xml: handles a tag split across read chunks', async () => {
  // 2 MB of padding forces the 1 MB read buffer to split mid-document.
  const padding = '<pad>x</pad>\n'.repeat(160000);
  const source = `<lod>${padding}<entry id="LAST"><lemma>Aarbecht</lemma></entry></lod>`;
  const found = await withTempXml(source, async (file) => {
    const out = [];
    for await (const record of xml.records(file, 'entry')) out.push(record.attrs.id);
    return out;
  });
  assert.deepEqual(found, ['LAST']);
});

/* -------------------------------------------------------------- lux-text.js */

test('lux-text: splits the d-clitic off its host', () => {
  const tokens = tokenise("d'Aarbecht ass fäerdeg");
  assert.deepEqual(tokens.map((token) => token.value), ['d', 'Aarbecht', 'ass', 'fäerdeg']);
  assert.equal(tokens[1].clitic, "d'");
});

test('lux-text: records a pause after punctuation and at the end', () => {
  const tokens = tokenise('ech war midd, ech hunn geschlof');
  assert.equal(tokens[2].value, 'midd');
  assert.equal(tokens[2].pauseAfter, true);
  assert.equal(tokens[1].pauseAfter, false);
  assert.equal(tokens[tokens.length - 1].pauseAfter, true);
});

test('lux-text: splits sentences on terminal punctuation only', () => {
  assert.deepEqual(sentences('Moien! Wéi geet et? Gutt, merci.'), ['Moien!', 'Wéi geet et?', 'Gutt, merci.']);
});

/* ----------------------------------------------------------------- nrule.js */

test('nrule: trigger set is n/d/t/z/h plus vowels', () => {
  for (const word of ['Dag', 'Tut', 'Zäit', 'Nuecht', 'Haus', 'Aarbecht', 'ëmmer', 'Owend']) {
    assert.ok(startsTrigger(word), `${word} should trigger`);
  }
  for (const word of ['Sport', 'Mann', 'Bass', 'Frënd', 'gutt', 'Kand', 'Land', 'Wee', 'Plaz']) {
    assert.ok(!startsTrigger(word), `${word} should not trigger`);
  }
});

test('nrule: onsets we cannot pronounce from spelling are skipped', () => {
  for (const word of ['CV', 'CD-Player', 'CDen', '20', '32.000', 'S']) {
    assert.ok(hasOpaqueOnset(word), `${word} should be treated as opaque`);
  }
  for (const word of ['Sport', 'Aarbecht', 'reegelméisseg']) {
    assert.ok(!hasOpaqueOnset(word), `${word} should not be opaque`);
  }
});

test('nrule: flags a kept n before a non-trigger, allows it before a trigger', () => {
  const checker = createChecker({ nRuleForms: ['maache', 'ae'], retentionExceptions: [] });

  const bad = checker.checkTokens(tokenise('ech maachen reegelméisseg Sport'));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].severity, 'error');
  assert.equal(bad[0].code, 'n-rule/keep');

  assert.deepEqual(checker.checkTokens(tokenise('ech maachen all Dag Sport')), []);
});

test('nrule: a pause suspends the rule', () => {
  const checker = createChecker({ nRuleForms: ['maache'], retentionExceptions: [] });
  assert.deepEqual(checker.checkTokens(tokenise('ech maachen, Sport')), []);
});

test('nrule: words whose n is stem-final are never touched', () => {
  // "wann", "hunn", "situatioun" have no n-rule flag, so they are not subject.
  const checker = createChecker({ nRuleForms: ['maache'], retentionExceptions: [] });
  assert.deepEqual(checker.checkTokens(tokenise('wann hunn situatioun Sport maachen')), []);
});

test('nrule: a corpus-attested exception downgrades to a warning', () => {
  const checker = createChecker({ nRuleForms: ['maache'], retentionExceptions: ['sech'] });
  const findings = checker.checkTokens(tokenise('si maachen sech prett'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warning');
});

test('nrule: the homograph-prone direction only ever warns', () => {
  const checker = createChecker({ nRuleForms: ['a', 'wee'], retentionExceptions: [] });
  const findings = checker.checkTokens(tokenise('hie kuckt am A an d Täsch'));
  assert.ok(findings.every((finding) => finding.severity === 'warning'));
});
