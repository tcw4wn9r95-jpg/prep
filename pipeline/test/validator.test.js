'use strict';

/**
 * Proof that the gate holds.
 *
 * The brief's step 1 is "prove the validator catches a deliberately misspelled
 * word before writing any UI". That is `catches a deliberate misspelling`
 * below; the rest of the file proves the other two gates, and proves the gate
 * does not simply reject everything - a validator that fails valid LOD text is
 * as useless as one that passes typos.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { validate } = require('../validate');
const paths = require('../lib/paths');

const FIXTURES = path.join(paths.ROOT, 'pipeline', 'fixtures');

const codesFor = (findings, id) =>
  findings.filter((finding) => finding.where.includes(`[${id}]`) || finding.where.includes(id)).map((f) => f.code);

let bad;
let good;

test.before(async () => {
  bad = await validate([path.join(FIXTURES, 'bad-items.json')]);
  good = await validate([path.join(FIXTURES, 'valid-item.json')]);
});

test('gate 1: catches a deliberate misspelling', () => {
  // "Aarbescht" is "Aarbecht" (LOD entry AARBECHT1) with one letter changed.
  const finding = bad.findings.find((f) => f.token === 'Aarbescht');
  assert.ok(finding, 'the misspelled word was not reported at all');
  assert.equal(finding.severity, 'error');
  assert.equal(finding.code, 'lexicon/unknown');
});

test('gate 1: catches a spelling LOD itself flags as wrong', () => {
  const finding = bad.findings.find((f) => f.code === 'lexicon/erroneous');
  assert.ok(finding, 'no erroneous-spelling finding');
  assert.match(finding.message, /erroneous spelling \(entry [A-Z0-9]+\)/);
});

test('gate 2: catches an n-rule violation', () => {
  const finding = bad.findings.find((f) => f.code === 'n-rule/keep' && f.severity === 'error');
  assert.ok(finding, 'no n-rule error');
  assert.equal(finding.token, 'maachen');
  assert.equal(finding.next, 'reegelméisseg');
  assert.match(finding.message, /write "maache"/);
});

test('gate 3: catches an audio id that does not resolve', () => {
  const finding = bad.findings.find((f) => f.code === 'audio/unresolved');
  assert.ok(finding, 'no audio finding');
  assert.equal(finding.token, '0000000000000000000000000000dead');
});

test('an unclassified field is an error, not a silent pass', () => {
  const finding = bad.findings.find((f) => f.code === 'schema/unknown-field');
  assert.ok(finding, 'unknown field slipped through unvalidated');
  assert.equal(finding.token, 'subtitle');
});

test('every deliberately broken fixture is caught', () => {
  const ids = [
    'fixture-misspelling',
    'fixture-erroneous-spelling',
    'fixture-n-rule',
    'fixture-missing-audio',
    'fixture-unknown-field',
  ];
  ids.forEach((id, index) => {
    const forItem = bad.findings.filter((f) => f.where.includes(`[${index}]`) && f.severity === 'error');
    assert.ok(forItem.length > 0, `${id} produced no error`);
  });
  void codesFor;
});

test('a valid item passes cleanly', () => {
  const errors = good.findings.filter((f) => f.severity === 'error');
  assert.deepEqual(errors, [], `valid fixture produced errors: ${JSON.stringify(errors, null, 2)}`);
});

test('the lexicon is big enough to be the real thing', () => {
  // A truncated or half-built lexicon would let anything through, so the gate
  // asserts its own inputs rather than trusting them.
  assert.ok(good.lexiconSize > 200000, `lexicon has only ${good.lexiconSize} forms`);
  assert.ok(good.audioCount > 5000, `only ${good.audioCount} recordings resolved`);
});
