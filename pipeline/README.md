# /pipeline

Node scripts, run locally. None of this ships to the browser.

Everything here exists to enforce one rule from the project brief: **every
Luxembourgish token that reaches the UI traces to a verified LOD record.**
Nothing in `content/` is written by a model; it is LOD data, restructured.

## Running it

```bash
npm run content     # fetch → build → resolve audio → rebuild → validate
```

Or step by step:

| command | what it does | writes |
| --- | --- | --- |
| `npm run fetch` | resolves the newest release of each of the three LOD datasets on data.public.lu, downloads and unzips it | `.cache/lod/*.xml`, `manifest.json` |
| `npm run build` | streams the XML into the corpus and the accepted-form lexicon | `content/corpus.json`, `content/lexicon.json` |
| `npm run fetch:audio` | resolves native example recordings per entry from the LOD public API | `.cache/lod/audio.json` |
| `npm run validate` | the gate. Exit 1 on any error | — |
| `npm test` | proves the gate catches what it must (23 tests) | — |
| `npm run calibrate` | measures the gate against LOD's own sentences | — |
| `npm run evidence` | regenerates `docs/n-rule-evidence.md` | that file |

`fetch:audio` runs after the first `build` because it walks the entry ids the
build selected; `build` then runs again to fold the recordings in. The audio
cache is resumable, so an interrupted run costs nothing.

No dependencies. Node 22+, `fetch` and `node:test` are built in.

## The files it produces

**`content/lexicon.json`** — what the validator checks against.

- `forms` — 258,946 accepted forms, lowercased, each mapped to
  `<source>:<LOD record id>`. Sources are `spelling` (verified in the search
  index), `n-rule` (the n-dropped variant), `lemma`, `inflection` (listed on
  the entry) and `table` (from the Flexiounstabellen).
- `nRuleForms` — the 30,364 forms LOD flags `reason="n-rule"`.
- `erroneousSpellings` — spellings LOD explicitly marks wrong, so hitting one
  gives a better error than "unknown word".
- `nRuleRetentionExceptions` — measured, not asserted; see below.

**`content/corpus.json`** — the authoring vocabulary: 2,204 entries carrying
LOD's own `GWS A1` / `GWS A2` basic-vocabulary tags, with IPA, gender, plural,
FR/EN/DE/PT glosses, 10,777 example sentences and 10,577 native recordings.

Both are committed so mistakes show up in diffs. `lexicon.json` writes its big
maps one form per line for exactly that reason.

## The three gates

`validate.js` fails the build when:

1. **lexicon** — a Luxembourgish token is not in `forms`, or is a spelling LOD
   flags as erroneous. Hyphenated compounds pass if every part does.
2. **n-rule** — a form contradicts the Eifeler Regel flags. See below.
3. **audio** — an `audioId` does not resolve to a recording in `corpus.json`.

Plus a fourth, structural one: a field that is neither declared Luxembourgish
nor declared free-text is an **error**. Unclassified text would otherwise skip
validation silently, which is the failure mode most likely to go unnoticed.
Adding a field means declaring which language it is.

## Where the n-rule verdicts come from

The rule is driven by LOD's flags, not by anything the model believes. A word
ending in `-n` is subject to the rule exactly when the word minus its `n` is a
flagged form — which is what separates `Aen`/`Ae` from `wann`, `hunn`,
`situatioun`, `terrain`, where the `n` is stem-final.

The trigger set (`n d t z h` + vowels) was measured over 455,751 adjacent word
pairs in LOD's examples: see `docs/n-rule-evidence.md`, regenerable.

Severity is deliberately asymmetric:

- an `-n` **kept** before a non-trigger is an **error** — measurably reliable;
- an `-n` **dropped** before a trigger is a **warning** — homographs (`A` the
  noun vs `a` from `an`) make it fire on 2.9% of LOD's own gold sentences.

Contexts where LOD itself writes both forms are downgraded to warnings. That
list is derived at build time by a Wilson 95% lower bound on the retention
rate, so it reflects the weight of evidence rather than a raw percentage: it
picks up `sech` (346/658) and `senger` (57/249) while correctly leaving out
`si` (8/162, consistent with noise).

## How well it works

`npm run calibrate` runs all gates over LOD's 59,019 hand-authored example
sentences — as close to gold as this language gets — so anything flagged there
is very nearly a false positive:

```
word tokens             536,447
lexicon gate misses     968  (0.180% of tokens)
n-rule errors           111
n-rule warnings         1,930
sentences that fail     1,037  (1.757%)
```

The lexicon misses are compounds LOD does not index (`Büroskolleegin`,
`Theatersaison`, `Internetbanking`). That is the gate working as intended: if
LOD cannot verify a form, we do not ship it.

Run this after every LOD release. A jump means the export changed.

## Known limits

- **Audio is API-only.** The bulk exports carry no audio; filenames are opaque
  asset hashes. `fetch-audio.js` resolves them per entry and joins on the
  example text. That join matches ~99% of examples; the rest are sentences the
  API renders differently from the export.
- **The lexicon is form-level, not grammar-level.** It proves a word exists and
  is spelled correctly. It does not check agreement, case or word order — that
  is what the peer-review layer in Module 2 is for.
- **Multi-word entries are indexed whole.** `virun Ae féieren` is one key; its
  parts only pass if they also stand alone, so a phrase cannot launder an
  unverified single word.
- **The XML parser is hand-rolled** (`lib/xml.js`) to avoid a dependency for
  three machine-generated files. It throws on anything outside the subset LOD
  emits — CDATA, DOCTYPE, namespaces — rather than guessing, so a changed
  export format fails loudly. `lib.test.js` covers that.
