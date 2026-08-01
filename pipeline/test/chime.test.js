'use strict';

/**
 * The correct-answer chime's pitch ladder.
 *
 * The oscillators need a browser, but the part that carries the design — which
 * two frequencies a given streak position plays — is pure arithmetic and is
 * where the research is actually encoded. If these drift, the sound stops
 * being consonant or stops escalating, and nothing else would notice.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const load = (name) => pathToFileURL(path.join(ROOT, 'app', 'js', name)).href;

let chime;
test.before(async () => {
  chime = await import(load('chime.js'));
});

test('chime: the two notes are always a perfect fifth apart', () => {
  // 3:2 is the simplest ratio after the octave, and simple ratios are the ones
  // heard as consonant rather than rough.
  for (let position = 0; position < 10; position += 1) {
    const { low, high } = chime.tonesForStreak(position);
    assert.ok(Math.abs(high / low - 1.5) < 1e-9, `position ${position} is not a fifth: ${high / low}`);
  }
});

test('chime: every step up the streak raises the pitch', () => {
  // Ascending contour reads as positive; a streak that did not climb would be
  // a fully predicted reward, which is the one thing the dopamine literature
  // says produces no response at all.
  let previous = 0;
  for (let position = 0; position < 6; position += 1) {
    const { low } = chime.tonesForStreak(position);
    assert.ok(low > previous, `position ${position} did not rise (${low} after ${previous})`);
    previous = low;
  }
});

test('chime: the ladder is pentatonic, so no two rungs clash', () => {
  // Any pair of rungs must be a consonant interval. A major scale would put a
  // semitone between two of them, which is the harshest interval there is.
  const semitones = [];
  for (let position = 0; position < 6; position += 1) {
    const { low } = chime.tonesForStreak(position);
    semitones.push(Math.round(12 * Math.log2(low / chime.tonesForStreak(0).low)));
  }
  assert.deepEqual(semitones, [0, 2, 4, 7, 9, 12]);
  for (let i = 1; i < semitones.length; i += 1) {
    const gap = semitones[i] - semitones[i - 1];
    assert.ok(gap >= 2, `rungs ${i - 1}→${i} are only ${gap} semitone(s) apart`);
  }
});

test('chime: the ladder caps rather than climbing out of hearing', () => {
  const top = chime.tonesForStreak(5);
  for (const position of [6, 20, 500]) {
    const beyond = chime.tonesForStreak(position);
    assert.equal(beyond.low, top.low);
    assert.equal(beyond.capped, true);
  }
  // A capped run still has to stay comfortable: the upper note of the top rung
  // is the highest pitch the app can produce.
  assert.ok(top.low * 1.5 < 1700, `top note is ${top.low * 1.5} Hz`);
});

test('chime: the bottom rung is in a register that carries on a phone speaker', () => {
  const { low } = chime.tonesForStreak(0);
  assert.ok(low > 400 && low < 700, `${low} Hz is outside the intended register`);
});
