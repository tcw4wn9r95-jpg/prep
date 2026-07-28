'use strict';

/**
 * Shared between build-vocab.js and build-verbs.js: the "generator gates its
 * own output" check, and the example-sentence lookup both use to attach a
 * playable clip. Deliberately not shared with build-items.js, which has its
 * own independent (and already working) copy — no reason to risk it.
 */

const path = require('node:path');
const { checkLexicon, checkNRule } = require('../validate');
const { createChecker } = require('./nrule');

function makeGate(lexicon) {
  const checker = createChecker({
    nRuleForms: new Set(lexicon.nRuleForms),
    retentionExceptions: new Set(Object.keys(lexicon.nRuleRetentionExceptions ?? {})),
  });
  return function isClean(text, field = 'example') {
    const findings = [];
    checkLexicon(lexicon, text, field, findings);
    checkNRule(checker, text, field, findings);
    return findings.every((finding) => finding.severity !== 'error');
  };
}

/** The LOD asset id for a recording — matches validate.js's audioIdFor and
 * build-items.js's audioIdOf. This is the file id (the ogg/aac basename), not
 * `audio.entryId`, which is the unrelated LOD dictionary entry id. */
function audioIdOf(audio) {
  return path.basename(String(audio.ogg ?? audio.aac ?? '')).replace(/\.[a-z0-9]+$/i, '');
}

/** The first example sentence a corpus entry has, with a mirrorable audio id
 * if a recording exists. */
function primaryExample(entry) {
  for (const meaning of entry.meanings ?? []) {
    for (const example of meaning.examples ?? []) {
      if (example.text) return { lb: example.text, audioId: example.audio ? audioIdOf(example.audio) : null };
    }
  }
  return null;
}

module.exports = { makeGate, audioIdOf, primaryExample };
