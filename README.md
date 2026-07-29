# SPROOCHENTEST DUEL — Project Brief for Claude Code

## What this is

A two-player Luxembourgish trainer built around the **Sproochentest Lëtzebuergesch** (the INLL language exam required for Luxembourg naturalisation). Two users only: **Diego** and **Diana**. Not a product, not multi-tenant, no signup. Personal tool, deployed privately.

The point is not vocabulary gamification. The point is: **both users pass the actual exam**, and racing each other is the mechanism that keeps them showing up.

---

## Status

Build order steps 1–4 are done. The app runs.

```bash
npm run content      # fetch LOD → corpus → items → mirror audio → images → validate
npm run serve        # http://localhost:8080
npm test             # 23 unit tests
npm run walkthrough  # drives the real app in Chromium at iPhone size, screenshots each screen
```

| | |
| --- | --- |
| corpus | 2,204 GWS A1/A2 entries · 258,946 accepted forms · 10,577 native recordings |
| items | 287 listening questions · 169 interview prompts · 18 topics |
| learn decks | 2,048 words · 365 verbs · 1,796 topic-tagged · 2,246 cloze targets · 359 visual cues |
| shipped assets | 2,263 recordings (68 MB, AAC) · 16 CC images (5.5 MB) |
| verification | `npm test` 71/71 · `validate` PASS · walkthrough 17/17, no console errors |

**Known limits, stated plainly.** Listening items are corpus-derived drills on the official
5+7+4 shape, not replicas of INLL's connected-speech test — the app says so and links to the
official sample. The validator is form-level: it proves a word exists and is spelled
correctly, not that a sentence is grammatical. Recording has been exercised in Chromium, not
on real iOS Safari, though the mimeType negotiation is written for it. 617 of the 2,413
Learn items carry no topic tag and 167 no cloze target, because the dictionary gave no
reliable evidence for one — they stay in the all-words deck rather than being given a
guessed tag.

See `pipeline/README.md` for the content pipeline and `worker/README.md` for the scoreboard.

---

## The exam we are training for (this is the spec, follow it exactly)

Organised by the INLL. Two parts, assessed separately, both must be passed.

### Part 1 — Compréhension orale / Verstoen (CEFR **B1**), ~35 min
- Three audio documents, played to the whole room:
  1. a radio news item
  2. an everyday conversation between two people
  3. a presentation or exchange on a defined topic
- Candidate answers a written questionnaire: **16 multiple-choice questions in three
  exercises — 5, then 7, then 4** — each A/B/C, some A/B.

> **Corrected against INLL, 2026-07.** This section originally said ~25 min and "multiple
> choice plus short open answers". INLL's published answer key
> (`b1-hv_testbeispill_leisungen-2023.pdf`) shows the 5+7+4 structure and **no open
> answers at all**. The app follows INLL. See `docs/exam-format.md`.

### Part 2 — Expression orale / Schwätzen (CEFR **A2**), ~10 min, in front of two examiners
- **2a — Interview (~5 min):** candidate picks one of **two** offered topics, then discusses it with the examiners.
- **2b — Image description (~5 min):** candidate picks one of **three** images and describes it.

Known A2 topic pool (use exactly these as the topic taxonomy):
`sports`, `work`, `travel & vacation`, `healthy living`, `my living space`, `transportation`, `hobbies`, `household chores`, `creativity`, `languages`, `reading`, `media & technology`, `summer & winter`, `giving gifts`.

A2 speaking competencies to be assessed: introduce oneself; speak simply about family, other people, living conditions, education and profession; describe and compare people, things and activities in simple terms.

Pass rule: **>50% on the speaking part, or >50% of the overall mark.** Model both, and surface both, because they create different revision strategies.

**Do not scrape, mirror, or redistribute INLL official exam papers.** Use the published format description above and generate original items. Link to inll.lu for the official samples rather than copying them into the repo.

---

## Non-negotiable language rule

Luxembourgish is a low-resource language. Your Luxembourgish output will drift on spelling, gender, plurals, and the **Eifeler Regel (n-rule)**. Assume you are wrong.

**Every Luxembourgish token that ships to the UI must trace to a verified corpus entry.** Not "checked by the model" — traceable to a record ID.

Source of truth: the **Lëtzebuerger Online Dictionnaire (LOD)** open data on data.public.lu, published CC0 by the Zenter fir d'Lëtzebuerger Sprooch:
- `Linguistesch Daten` — full dictionary, entry IDs, translations (FR/DE/EN/PT), example sentences
- `Flexiounstabellen` — verb and adjective inflection tables
- `Index vun der Sich-Funktioun` — spelling variants; note the `@suggest='true'` attribute marks orthographically verified forms, and `@reason="n-rule"` marks n-rule forms. Everything else is auto-generated and **not** authoritative.

Build a `validate` step that runs on every content build and **fails the build** if:
1. any Luxembourgish word in generated content is absent from the corpus or the inflection tables
2. any form contradicts the n-rule flags in the search index
3. any exercise references an audio ID that doesn't resolve

Explanations, hints, feedback and UI chrome are in **English and French** — those you may write freely. The Luxembourgish is corpus-locked.

---

## Architecture

Match the existing personal stack: cheap, mostly static, no ops burden.

```
/pipeline      Node scripts, run locally. Never runs in the browser.
  fetch-lod.js       pull + cache the three LOD datasets
  build-corpus.js    → corpus.json + lexicon.json
  fetch-audio.js     resolve native recordings per entry (not in the bulk export)
  build-items.js     → content/items/*.json, gated through validate.js as it builds
  build-vocab.js     → the A1/A2 word deck
  build-verbs.js     → the present-tense verb deck (needs the cached LOD tables)
  build-learn.js     adds topics, visual cues and cloze targets to both decks
  mirror-audio.js    download the AAC the shipped items use
  fetch-images.js    openly licensed photos for the image-description task
  validate.js        the hard gate described above
  test/              unit tests, calibration, and the browser walkthrough
/content       generated JSON, committed to the repo (auditable diffs)
/app           the PWA — static, no build step, zero runtime dependencies
  js/screens/        onboarding · journey · learn · vocab · verbs · listening · speaking ·
                     review · readiness · duel
  js/drill/          the Learn engine: one session runner, seven card types
  js/amelie.js       the guide: one inline SVG, six CSS states
/worker        one tiny Cloudflare Worker + KV: the shared scoreboard. Nothing else.
```

No runtime dependencies at all: `lib/xml.js` is a hand-rolled streaming parser for the LOD
exports, and the app is vanilla ES modules. The single devDependency is `playwright-core`
(browserless — it drives the Chromium already in the environment) for the walkthrough.

- **Local-first.** All progress in IndexedDB. The Worker only holds the shared duel state (scores, weekly item seed, pending speaking submissions). If it's down, solo practice still works.
- Auth is a shared secret in a query param. Two users. Don't build OAuth.
- Deploy `/app` to GitHub Pages. PWA manifest + service worker for offline — this needs to work on a phone with no signal.
- Audio: LOD serves `.m4a` and `.ogg` from `lod.lu/uploads/...`, path-sharded by the first two characters of the ID. Mirror the files you actually use into the repo so the app works offline; keep the entry ID as attribution in the JSON.

---

## Module 1 — Verstoen (B1 listening)

Replicate the three-document structure. The hard constraint is **audio**: Luxembourgish TTS is poor and synthetic audio will train the wrong ear. Ranked sources:

1. **Native LOD example-sentence recordings.** Real speakers, CC0, already tied to entry IDs. Use these for the "everyday conversation" document — assemble exchanges from sentences that plausibly chain.
2. **RTL.lu** news and radio, at natural speed, for the news item. **Link and stream, do not mirror.** This is the authentic B1 input.
3. **Each other.** Ship a recording mode: either user can record a short monologue or read a generated script, and it becomes a listening item for the other. Recording for your partner earns points (see below).

Do **not** fall back to generic TTS to fill gaps. An empty slot is better than a wrong accent.

Questions: MCQ plus short open answers, generated by Claude from the transcript, validated against corpus. Open answers graded by Claude against a reference answer, lenient on spelling, strict on comprehension.

---

## Module 2 — Schwätzen (A2 speaking) — the core of the app

This is where the tool has to be better than flashcards. Three-layer scoring:

**Layer 1 — Capture.** `MediaRecorder` in the browser. Two exercise types mirroring the exam:
- *Interview*: app offers two topics from the pool, user picks one, gets a 30s prep timer, then records up to 5 min against follow-up prompts revealed one at a time (simulating examiner questions).
- *Image description*: app offers three images, user picks one, records up to 5 min. Source images that reflect life in Luxembourg — everyday scenes, not stock abstraction.

**Layer 2 — Instant machine feedback.** Transcribe with Whisper (`language="lb"`). **Be honest in the UI that this is unreliable** — lb ASR quality is low. Feed the transcript to Claude with the A2 rubric and an explicit instruction: *the transcript is noisy, do not penalise probable transcription artefacts, flag uncertainty rather than inventing errors.* Output is formative only, labelled "machine estimate."

**Layer 3 — Peer examiner (this is the real score).** The actual exam is judged by two humans. So: the recording goes to the partner, who listens and scores it against the same rubric in a purpose-built review screen (rubric on one side, waveform + playback on the other, one-tap band selection per criterion, optional voice note back).

Rubric criteria — **INLL's own grid**, four criteria, each 0–5, max 20:

| criterion | what it measures |
| --- | --- |
| `Lexik` | range of A2 vocabulary, and whether it is used appropriately |
| `Morphosyntax` | range of A2 grammatical structures, used appropriately |
| `Phoneetik` | expressing yourself clearly and fluently |
| `Aufgabenerfëllung` | interacting, describing an image, being understood and coherent |

Two examiners, weighted as INLL weights them: the **interlocutor**'s single global mark
counts **20%**, the **assessor**'s grid counts **80%**.

> **Corrected against INLL, 2026-07.** This originally listed six invented criteria
> (`range`/`accuracy`/`fluency`/`interaction`/`coherence`/`task achievement`) and no
> weighting. The four above are from INLL's published `Bewäertungsskala`.

The peer score is the score of record. The machine score is a between-sessions sparring partner. This design turns the weakest technical link — Luxembourgish ASR — into the strongest engagement loop, because grading each other is itself practice.

---

## Module 0 — Learn (the vocabulary foundation)

> **Added 2026-07.** The exam modules assume a vocabulary the candidate does not have yet.
> This is where it gets built.

The deck is the A1/A2 Grondwuertschatz: 2,048 words and 365 verbs, every one a corpus lemma
with a translation LOD itself publishes. What matters is not the deck but the questions.

**Two strands per word, not one score.** Learners recognise two to three times more words
than they can produce, and the A2 speaking part credits only production. So each item carries
two Leitner boxes — `recv` (understand it) and `prod` (say it) — and the Learn hub shows two
bars. The gap between them is the number worth reading. `prod` stays locked until `recv`
reaches box 2.

**The question escalates with the box.** By strand:

| box | receptive | productive |
| --- | --- | --- |
| 0 | see the word, pick the meaning | see the meaning, pick the word |
| 1 | **hear the sentence, no text**, pick the meaning | build the word from letter tiles |
| 2+ | the sentence with the word gapped | type the word — **and its article, for nouns** |
| 3+ | | type the inflected form into the gap (verbs: conjugate) |

A card type whose data is missing is skipped, never faked: no recording → no listening card,
no locatable cloze → no cloze card. An item that cannot answer any rung is filtered out of
the deck entirely (`isDrillable`), which is what happens to the seven LOD verbs that carry no
English gloss.

**Why audio and not photographs.** The repo already ships 2,263 native recordings covering
the example sentence of 2,019 of 2,048 words. For an exam that tests listening and speaking,
that is the better second encoding channel than a 30 MB photo set, and it is already paid
for. Concrete nouns additionally get a single emoji cue — the useful part of a picture is
distinctiveness, not photography — and abstract words get none rather than a decorative one.

**Topic decks.** Every word is tagged against the same 18-topic taxonomy the speaking module
uses, from three layers of evidence (LOD semantic category, topic seed headword, gloss
keyword), with the winning layer recorded in the JSON so the tagging is auditable. `#/vocab/<topic>`
drills one topic. Words with no reliable evidence stay untagged.

Two smaller rules that matter more than they look:

- A missed card comes back three cards later and must be answered before the session ends.
  The retry is practice, not evidence, so it is not graded — otherwise a word could be
  promoted by the second attempt at the same question in the same minute.
- A typed answer right apart from its diacritics counts as correct but holds its box. On a
  phone `ë`/`é`/`ä` are several taps deep, and failing someone over that turns a vocabulary
  drill into a keyboard drill. The exact spelling is shown, and the word comes back.

---

## Module 3 — The duel

Two profiles, hardcoded: Diego, Diana.

- **Woch-Duell.** Every Monday the Worker fixes a seed. Both users get the identical set of items that week. Scores are directly comparable. Winner takes the week.
- **Points.** Completing items earns points. So does *reviewing your partner's speaking submission* — weight this generously, otherwise reviews get skipped and the whole thing collapses.
- **Handicap.** If the rolling 4-week gap exceeds a threshold, scale the trailing player's points. Nobody keeps playing a game they always lose.
- **Streaks, forgivingly.** Two freeze days per week, no guilt copy, no notification nagging. If a streak breaks, the app says what to do next, not how disappointing that is.
- **Readiness, not vanity.** The headline number per player is **estimated exam readiness against the real thresholds** — speaking % and overall % — with a plain statement of what would move it most. A leaderboard that doesn't predict passing is decoration.
- **Head-to-head history**: per-topic breakdown, so it's visible that one of you is strong on `work` and weak on `household chores`.

---

## Design direction

> **Revised, 2026-07.** The original direction below ruled out a mascot: *"Think exam
> paper, not owl mascot. A serious, slightly bureaucratic frame is funnier and more
> motivating than cartoon encouragement."* That was reversed deliberately: the app now has
> **Amelie**, a butterfly who guides you through the journey, and a warm UI.
>
> What was kept from the original direction: the palette is grounded in Luxembourg's built
> environment (ardoise roofing, Bock sandstone, oxidised-copper petrol) rather than generic
> language-app brights, and the **duel scoreboard is still the one bold moment**. Amber is
> reserved for Amelie alone, so warm colour anywhere on screen means she is speaking.
>
> Amelie is a butterfly because metamorphosis is the honest metaphor for the last step of
> naturalisation — not because mascots are cute.

Give it a point of view.

Ground it in the subject: a state examination, and Luxembourg's own visual vernacular — administrative forms, signage, the trilingual reality of the country.

- Pick a palette and type pairing deliberately; avoid the cream-background/serif/terracotta default, and avoid the near-black/acid-accent default.
- The signature element should be the **duel scoreboard**, treated as the one bold moment. Everything else stays quiet.
- Copy in English, sentence case, active voice, no filler. Errors say what happened and what to do. Empty states invite an action.
- Quality floor without announcing it: works one-handed on a phone, large tap targets, keyboard focus visible, `prefers-reduced-motion` respected, all audio has a visible transcript toggle.

---

## Build order

1. `/pipeline`: LOD ingest → `corpus.json` → validator. Prove the validator catches a deliberately misspelled word before writing any UI.
2. Static app shell + local storage + one working listening item, hand-authored.
3. Speaking capture + peer review flow. Ship this before the machine scoring — it's the part that has to feel good.
4. Worker + shared scoreboard + Woch-Duell seeding.
5. Whisper + Claude formative feedback.
6. Content generation at volume, only once the validator is trusted.

## Working agreements

- Flag it loudly when you are unsure about a Luxembourgish form rather than shipping a confident guess. A wrong item taught twice is worse than a missing item.
- Prefer fewer, correct items over a full-looking tree.
- Commit generated content as readable JSON so mistakes are visible in diffs.
- No dependency gets added without a one-line justification in the commit message.
- When a design decision has a real tradeoff, state it and pick one. Don't build both.
