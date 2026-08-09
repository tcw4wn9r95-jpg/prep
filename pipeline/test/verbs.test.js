'use strict';

/**
 * Verb conjugation — past tense and the imperative.
 *
 * build-verbs.js reads these straight off LOD's Flexiounstabellen, same rule
 * as the present tense it already shipped: every form is a table cell, never
 * generated. `cleanForm` is the one function that touches the text, so its
 * job is tested directly with the actual malformed LOD cells that caused
 * regressions while this was built — a reflexive pronoun sitting right before
 * the exclamation mark, and a "!" attached only to the second half of a
 * slash-separated variant.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { cleanForm, readComplete, readImperative } = require(path.join(ROOT, 'pipeline', 'build-verbs.js'));

/* ---------------------------------------------------------------- cleanForm */

test('cleanForm: strips a reflexive pronoun placed right before the punctuation', () => {
  // "hief (dech)!" naively becomes "hief !" — a real Luxembourgish sentence
  // never has a space before an exclamation mark — if the parenthetical is
  // removed before the trailing punctuation is accounted for.
  assert.equal(cleanForm('hief (dech)!'), 'hief!');
  assert.equal(cleanForm('freeën (mech)'), 'freeën');
  assert.equal(cleanForm('hunn (mech) gehat'), 'hunn gehat');
});

test('cleanForm: keeps the exclamation mark even when only the second slash variant has it', () => {
  // LOD's own cell for hunn's p5 imperative: the "!" is written once, after
  // the *alternate* spelling — "hutt (iech)" — not after the one this app
  // keeps. Taking the first variant before handling punctuation silently
  // dropped the mark from a form that is a command by nature.
  assert.equal(cleanForm('hieft / hutt (iech)!'), 'hieft!');
});

test('cleanForm: takes the first spelling of an ordinary slash variant', () => {
  assert.equal(cleanForm('hu missen / mussen'), 'hu missen');
  assert.equal(cleanForm('gaangen / gaang'), 'gaangen');
});

test('cleanForm: a genuinely punctuation-less form is left without one', () => {
  // Not every LOD cell carries a "!" — real source variance, not a bug: see
  // astellen's p5 imperative ("stellt (iech) an", no mark) in the shipped
  // deck. Nothing here should invent punctuation LOD did not write.
  assert.equal(cleanForm('stellt (iech) an'), 'stellt an');
});

test('cleanForm: null and empty input produce null, not a stray string', () => {
  assert.equal(cleanForm(null), null);
  assert.equal(cleanForm(''), null);
  assert.equal(cleanForm('   '), null);
  assert.equal(cleanForm('(mech)'), null);
});

/* -------------------------------------------------------------- readComplete */

function node(children) {
  return { children: Object.entries(children).map(([name, text]) => ({ name, text })) };
}

test('readComplete: a full six-person table comes back as {p1..p6}', () => {
  const forms = readComplete(node({ p1: 'a', p2: 'b', p3: 'c', p4: 'd', p5: 'e', p6: 'f' }), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  assert.deepEqual(forms, { p1: 'a', p2: 'b', p3: 'c', p4: 'd', p5: 'e', p6: 'f' });
});

test('readComplete: one missing person voids the whole table rather than leaving a hole', () => {
  // A gap here has no way to be shown on the cheat sheet as a gap — "ech geet
  // / du ___ / hie geet" reads as the app being broken, not as LOD being
  // incomplete — so a partial table becomes no table.
  const forms = readComplete(node({ p1: 'a', p2: 'b', p4: 'd', p5: 'e', p6: 'f' }), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  assert.equal(forms, null);
});

test('readComplete: a missing block is null, not an exception', () => {
  assert.equal(readComplete(undefined, ['p1']), null);
});

/* ------------------------------------------------------------ readImperative */

test('readImperative: partial is normal — one person is kept without the other', () => {
  // Real and common: 21 of the 365 shipped verbs publish only the p5 form,
  // mostly because commanding a single "you" does not make sense for them.
  const table = { children: [{ name: 'imperative', children: [{ name: 'present', children: [{ name: 'p5', text: 'gitt!' }] }] }] };
  assert.deepEqual(readImperative(table), { p2: null, p5: 'gitt!' });
});

test('readImperative: no imperative block at all is null', () => {
  assert.equal(readImperative({ children: [] }), null);
});

test('readImperative: an empty present block is null rather than {p2: null, p5: null}', () => {
  const table = { children: [{ name: 'imperative', children: [{ name: 'present', children: [] }] }] };
  assert.equal(readImperative(table), null);
});

/* ----------------------------------------------- the shipped deck, end to end */

const verbs = require(path.join(ROOT, 'app', 'data', 'verbs.json')).items;

test('verbs: past tense and imperative ship for almost the whole deck', () => {
  // The header comment's own numbers — regression guard against a future
  // change to the XML reading silently starving one of these fields.
  const withPast = verbs.filter((item) => item.past).length;
  const withImperative = verbs.filter((item) => item.imperative).length;
  assert.ok(withPast / verbs.length > 0.9, `expected past tense on most verbs, got ${withPast}/${verbs.length}`);
  assert.ok(withImperative / verbs.length > 0.8, `expected an imperative on most verbs, got ${withImperative}/${verbs.length}`);
});

test('verbs: no shipped past-tense or imperative form carries a reflexive parenthetical or a bare slash', () => {
  for (const item of verbs) {
    for (const field of ['past', 'imperative']) {
      const block = item[field];
      if (!block) continue;
      for (const [person, form] of Object.entries(block)) {
        if (!form) continue;
        assert.ok(!form.includes('('), `${item.infinitive} ${field}.${person} still carries a parenthetical: "${form}"`);
        assert.ok(!form.includes('/'), `${item.infinitive} ${field}.${person} still carries a slash variant: "${form}"`);
        assert.ok(!/\s[!?.,]/.test(form), `${item.infinitive} ${field}.${person} has a space before punctuation: "${form}"`);
        assert.equal(form, form.trim(), `${item.infinitive} ${field}.${person} has leading/trailing whitespace: "${form}"`);
      }
    }
  }
});

test('verbs: a past tense, when present, is complete — six persons, none blank', () => {
  for (const item of verbs) {
    if (!item.past) continue;
    for (const person of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      assert.ok(item.past[person], `${item.infinitive} past tense is missing ${person}`);
    }
  }
});

test('verbs: an imperative, when present, names at least one real person', () => {
  for (const item of verbs) {
    if (!item.imperative) continue;
    assert.ok(item.imperative.p2 || item.imperative.p5, `${item.infinitive} has an imperative object with neither person set`);
  }
});
