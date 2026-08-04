# UI and content benchmark, 2026-08-02

A full pass over the app as a beginner would meet it: every screen driven in a
real browser at iPhone size, every claim checked against the data behind it.
The question throughout was the only one that matters — **does this get someone
who knows no Luxembourgish to a pass?** — with two secondary tests: is it
obvious what to do, and is it worth opening tomorrow.

What follows is what was wrong, what changed, and what was deliberately left
alone. The research cited is used to argue with decisions already made, not to
decorate them.

---

## The one that mattered most: the app congratulated a fail

Scoring **4 out of 20** on a B1 listening set produced a full green progress
bar, a confetti burst, and Amelie saying *"Great work! Your listening score
just moved."* Tapping through to the readiness screen ten seconds later
reported the same attempt as **below the pass mark**.

Both cannot be true. The pass rule is INLL's: over 50%, and `readinessFor()`
already measured against exactly that. The end-of-set screen simply never
looked at the score.

This is worse than a cosmetic bug. The whole app is built on the claim that its
numbers predict the exam — the README calls it "readiness, not vanity" and
argues at length against variable-ratio rewards on the grounds that *"every
other number in this app reports real state."* One screen was quietly not
doing that, and it was the screen at the end of the exercise the B1 half is
scored on.

**Fixed.** `setVerdict()` in `store.js` now bands a score against a single
exported `PASS_MARK`, next to `readinessFor()` so the two cannot drift. Amelie
celebrates above the line and says what to do below it. The bar goes red under
50% and carries the same 50% threshold marker the readiness meters draw. Both
screens that end a listening run — the corpus sets and the podcast questions —
read the same function. `srs.test.js` asserts they agree at every percentage
from 0 to 100.

## The second: a wrong answer was never available to learn from

Getting a listening question wrong turned the option red, and then the next
question replaced it. Nothing about the miss survived. At the end you were told
"4 / 20" and offered a speaking exercise.

Retrieval practice is one of the best-evidenced things in learning science, but
the meta-analytic picture is that its effects are *enhanced* by corrective
feedback, and that its absence can be actively harmful with multiple choice
specifically — an unreviewed wrong pick can be remembered later as the familiar
option ([Adesope et al. 2017](https://journals.sagepub.com/doi/abs/10.3102/0034654316689306);
[Frontiers, 2019](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2019.00005/full)).
Sixteen unreviewed wrong picks per set is the shape of practice that can leave
someone worse off.

**Fixed.** A finished set now lists every question that was missed, with what
you chose, what the answer was, and the transcript that settles it. Each row is
summarised by the *sentence* rather than the question stem, because a set asks
"Wat hutt Dir héieren?" eight times and summarising by stem produced eight
identical rows.

There is deliberately **no "try this set again" button**. The questions and
their order are fixed, so a second run is recall of the answer key, and every
attempt is averaged into the B1 estimate — it would inflate the one number the
exam plan reads.

## The third: the gender deck gave away its own answers

`grammar.json` holds 1,134 noun-gender exercises. The card showed
**`de Auto`** above the question *"What gender is this word?"*.

LOD writes `de` for every masculine noun and `d'` for every feminine and neuter
one. So the prompt answered the question outright on the 552 masculine items,
and cut the other 582 from three options to two. Noun gender is one of the
things Morphosyntax is scored on and this deck exists to teach it; it was the
one thing the card never made you retrieve.

**Fixed.** The prompt shows the bare noun. The article moves to the feedback
line, so `d'Kand → neutral` is taught at the moment it is learnable rather than
leaked before. This is the pattern the Gender Sort game already used — the
drill card was the outlier. Tested across 200 real items.

## And a spelling error on roughly half the nouns in the app

`article` holds both `de` and `d'`, and everything joined them with a space:
**`d' Fra`** rather than `d'Fra`. That is 592 of the vocab deck's nouns and 582
grammar exercises, rendered wrong on the gloss card, in every reverse-card
option, in the cheat sheet's gender section, and in the answer shown after a
miss.

For an app whose central rule is that every Luxembourgish token must trace to a
verified corpus entry, teaching the wrong spacing on half the nouns is a real
failure of that rule — the token was right and the rendering was not.

**Fixed** with one `joinArticle()` helper used everywhere, and a test.

## The checklist ticked itself

The home screen's step 2, "Grammar drills", was marked done by
`today.cards >= 6` — which counts cards from *every* deck. Six vocabulary cards
ticked grammar as done. The one step aimed squarely at Morphosyntax could be
skipped every single day while reporting itself complete.

**Fixed.** Sessions now log cards per deck, and the step reads the grammar
count. Old session rows have no per-deck breakdown and contribute nothing to it
rather than being guessed at.

---

## Beginner content

> The brief is "assume I'm a complete beginner", and the hard constraint is that
> no Luxembourgish may be invented — every token traces to LOD.

**An untranslated B1 sentence on the first meeting of an A1 word.** Meeting
`elo` ("now") for the first time, the card showed
*"ech hunn d'Wäsch de Moien ausgehaangen, se misst elo dréche sinn"* — nine
unknown words above four English options.

I checked whether a translation could be shipped instead: it cannot honestly.
LOD's `gloss` field on example sentences is a **Luxembourgish paraphrase**, not
a translation, and only 2,168 of 10,777 examples have one. Machine-translating
them would put an unverified English meaning next to a verified Luxembourgish
sentence, which is the failure mode the corpus rule exists to prevent.

So the fix is subtraction, not addition. Input needs to be most of the way to
comprehensible to be worth anything — the working figure in the literature is
95–98% of tokens known — and this was nowhere near it. **The sentence is now
withheld on a box-0 card and shown from the first review onwards.** Nothing is
lost: the engine already reveals it the instant the card is answered, which is
when it can be read against a meaning that is now known, and the recording
stays on the card throughout because hearing it costs no reading.

**Grammar was drilled but only taught somewhere else.** A card asks *"Which
spelling is correct here (the Eifeler Regel)?"* and, when missed, said which
spelling was right and nothing about why. The rule was on the cheat sheet, one
navigation away, which is the wrong place for it to be the *only* place.

**Fixed.** A missed grammar card now shows the rule it was testing, in an amber
panel, at the moment it is worth reading. The wording is `GRAMMAR_RULES` in
`cards.js`, which the cheat sheet now also reads, so the sheet and the
correction cannot say different things.

---

## Flow and gamification

**The tab bar sat under every drill.** Six tabs on the row a thumb already
rests on, offering six ways out of a half-answered card, and taking ~90px of an
852px phone away from the card itself. Drills, listening runs, grammar, pairs,
gender sort and peer review now run in **focus mode** with the bar hidden. Every
one keeps its back chevron and the drills keep the cheat-sheet button, so
nothing became unreachable — it stopped being one stray tap away. The drill card
and all four options now fit above the fold with room to spare.

**The tab bar was translucent enough to read through.** At 92% opacity the last
card of a long screen slid under it and stayed legible, tangling with the tab
labels. Now opaque.

**Two screens were both called "Moien, Diego".** The Listen tab used the home
screen's greeting as its title. It is called "Listening".

**The streak was a number in a subtitle.** A count says "you are on 4" without
showing what a day looks like, and gave no way to see the two freeze days the
app already grants. There is now a **seven-day strip** under the daily goal.
Every dot is read from the real practice log; a gap is drawn as a gap, because
the point is to be able to see a slip.

**No cue to hang the habit on.** The clearest finding in the habit literature
for an app like this: relying on reminders supports repetition but *hinders*
automaticity and builds dependency on the reminder, whereas **event-based cues**
build the automatic behaviour
([JMIR 2017](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5730820/);
[Interacting with Computers](https://academic.oup.com/iwc/article-abstract/31/2/177/5448908)).
A PWA that cannot send notifications is the right shape for this. Onboarding now
asks **"When will you practise?"** and offers everyday events — *with my morning
coffee*, *on the way to work*, *before bed* — and Today writes the chosen one
back. It schedules nothing and is fully skippable.

**The home screen loaded 1.7 MB of JSON it never used.** Today pulled the vocab,
verb and phrase decks to compute a total it did not render. Removed — this is
the first screen after the splash.

---

## Deliberately not changed

**Six tabs.** `main.js` argues each one: Listen and Speak name the two exam
halves, and the cheat sheet is used *while* doing something else. But the
README's own navigation section says the six-tab layout was the problem the
Today redesign solved — *"all equally prominent and none of them said which to
open first"* — and it has drifted back to six. At 393px they are 65px each.
Focus mode removes the worst symptom. **Recommendation: drop to four (Today ·
Learn · Speak · Duel)**, with Listen reached from Today's step 3 and the sheet
from its in-session button, which is where it is actually used. One line in
`TABS`. Left alone because it reverses a documented decision and that is a
product call, not a bug fix.

**The 1,500 ms minimum splash.** Deliberate, and commented as such. But this is
an app whose whole design goal is being opened every day, and 1.5s of brand
before the first tap is a tax paid daily. Worth reconsidering; not mine to
decide.

**Amelie's prose.** Most screens open with a 4–5 line speech bubble. It is good
writing, but a beginner meets three paragraphs before the first button. Worth a
copy pass; no single line is wrong enough to change unilaterally.

**Points and the Duel board.** The scoreboard is the strongest screen in the
app and needs nothing. Worth noting that the gamification meta-analyses are
consistent that points and badges move *extrinsic* motivation and can shift
attention from the learning to the reward
([Springer 2024](https://link.springer.com/article/10.1007/s11423-023-10337-7)).
This app is unusually well insulated: reviewing your partner's recording is
worth the most points *and* is itself the practice, so the incentive and the
learning point the same way. That is the right design and it should not be
diluted with streak-freeze purchases, gems, or leagues.

**"1,799 exercises" on the Learn hub.** Honest, and dispiriting to a beginner
on day one. A "next 10" framing would read better, but the number is true and
the fix is a copy decision.

---

## Verification

- `npm test` — 136 passing (up from 132; four added cover the pass mark, the
  verdict/readiness agreement, article elision, and the gender-card leak)
- `npm run walkthrough` — 41/41 steps, no console errors
- `node pipeline/validate.js` — PASS

The one 404 the walkthrough reports is `version.json`, which
`.github/workflows/deploy.yml` writes at publish time and `content.js` handles
as absent. Expected locally; not a fault.

---

# Follow-up, 2026-08-03

Three problems reported from real use. All three were real, and all three had
the same root shape: a number or a rule that was right in one place and not
enforced in another.

## "The words to review keep adding up — I think it's when I quit halfway"

Correct diagnosis. `DAILY_NEW_TARGET = 8` is documented as *"new words
introduced per day"*, but it was only ever reaching the scheduler as
`buildMixedSession`'s per-**session** default, and **not one of the five
session entry points passed a remaining amount**. So:

- a 30-card day of 12-card sessions took up to 24 new words, not 8;
- abandoning a session and starting another bought a fresh 8, as often as you
  liked. Simulated: starting and quitting after two cards introduced **27 new
  words on day one**.

The Learn hub was computing "N new words left today" for *display* the whole
time while the builder ignored it — which is precisely how the two came to
disagree. Each surplus word then returned as two strands (`recv`, `prod`) of
recurring reviews, which is the queue that kept climbing.

**Fixed.** `newWordsLeftToday()` is derived from the same evidence the hub
already showed, and every session builder is given it as `newTarget`. The
grammar reserve draws from the same budget — it was topping every session up
with three fresh items regardless, a hole straight through the cap. Simulated
after: day one introduces exactly 8 whichever way you quit.

## "Gender is hard because the sentence doesn't always show the article"

Also correct, and it was partly my fault: the previous pass removed the article
from the prompt because `de`/`d'` gave the answer away, without checking
whether anything else on the card supplied it. Measured: **only 371 of 1,173
nouns have an example sentence containing an article for that noun — 63% give
no cue at all.** Gender is not derivable from a Luxembourgish noun, so those
cards went from free marks to unanswerable.

**Fixed** with the ladder the rest of the app already uses. Box 0 is an
introduction — it shows `d'Kiischt` and asks "Meet this word — which gender is
it?". From box 1 the article is gone and the noun stands alone. Teach, then
test, instead of doing one or the other forever.

I also checked whether the pipeline could simply pick better sentences: 304 of
the 802 without a cue do have an article-bearing alternative in the corpus. Not
taken, because swapping the sentence loses the mirrored recording attached to
the current one, and it would still leave 498 with no cue — the ladder fixes
all 1,173, the swap fixes a quarter of them at a cost. Worth revisiting only
alongside an audio re-mirror.

## "Grammar drills are all listening, and the sentences are far too complex"

The first half is literally true and was not a grammar problem — it was the
vocabulary ladder. **2,010 of the 2,049 words carry a recording, and `listen`
was the only rung at box 1**, so *every* review on your second day was an
audio-only card with no text on screen at all. On sentences with a median of 8
words and a maximum of 19.

Input has to be most of the way to comprehensible to teach anything; a 19-word
LOD sentence containing one word you met once yesterday is not that.

**Fixed** by gating the listening rung on sentence length, banded by level —
A1 words ≤ 7 words, A2 ≤ 9. Long-sentence words get another gloss card at box 1
and **keep their play button**, so no recording is lost; it just stops being
the only channel. Box-1 reviews for the foundation stages go from 100%
listening to roughly half.

**Level banding for the exercises.** Grammar items carried no `stage` or
`rank`, so they sorted last and were introduced in raw file order — 1,134
gender exercises alphabetically by noun, a 19-word sentence as likely to come
first as a 4-word one. They now take a place on the same path the word decks
use: stage by level (A1 gender with the rest of A1; A2 gender, the n-rule and
adjective agreement with A2, since those two operate on whole sentences), and
rank by sentence length, shortest first. Derived in `content.js` rather than
the pipeline, because it is a presentation decision and the exercise is
identical either way.

The first grammar exercises a beginner now meets are 3–4 words
(*et ass Mëtteg*, *d'Zäit bleift net stoen*) instead of 6–10
(*mir ginn all Joer op de Mäertchen e Fësch iessen*).

## Verification

`npm test` 139 passing (three added: the daily cap, the gender teach rung, the
listening-length gate) · `npm run walkthrough` 41/41 · `validate` PASS.

## Note on the deploy

The first push of this benchmark did not reach the phone. `app/sw.js` serves
the shell cache-first and busts on a hand-bumped `VERSION`; a dozen shell files
changed and `VERSION` did not, so `sw.js` was byte-identical to the installed
copy and the browser never looked for an update. Bumping it is not optional
housekeeping — it is the deploy. It is now `v18`.

---

# Follow-up 2, 2026-08-03

## The explanation ignored the exercise you were doing

"Explain this sentence" sent the sentence, the headword and its gloss, and
nothing else — so a noun-gender question, a blind listening card and an Eifeler
Regel question all came back with the same general remarks about word order.
The explanation you want is about the thing you just got wrong.

**Fixed.** Each card type now carries a one-line description of what was
actually asked (`CARD_TASKS` in `cards.js`), sent with the request, and the
prompt is told to answer *that* first — for a gender card, what makes this
noun's gender memorable; for an n-rule card, why the n is kept or dropped at
that exact spot and what sound follows; for a listening card, what is hard to
catch by ear here.

Two things had to change with it. The **cache key** now includes the task —
keyed on the sentence alone, the first explanation a sentence ever got was
replayed for every later exercise on it, which would have thrown the new
context straight away. And cloze and grammar cards, which have a
`before`/`after` pair rather than an `example`, were **never offered an
explanation at all**; they are now, with the answer put back into the sentence
so what gets explained is a real sentence rather than a gapped one.

Both paths — the Worker and the direct API call — build the prompt the same
way, so an explanation does not depend on whether a Worker happens to be
configured.

## Recording five minutes of speech on a few dozen words

The speaking screen offered "Listen & repeat" and the full A2 interview side by
side, with nothing saying which you were ready for or how far off you were.

**Fixed** with the app's own numbers rather than a new invented one: how many
words and how many of the 34 sentence frames you can **produce** — the `prod`
strand, which is the honest measure, since the A2 part credits production only
and `prod` does not unlock until a word has been recognised twice. Below 50
words and 8 frames the exam tasks are muted and the screen says exactly what is
missing, with a button to each.

Deliberately **not a lock**. Someone who wants to try one should be able to,
and a threshold this app invented has no business forbidding practice — it says
so on the screen. Image description (2b) is not held back either: it has no
interlocutor and a picture to point at, which makes it a genuinely easier task.

## A hint on every card

One other word of the sentence, translated, behind a tap. Never the word being
asked for, and never anything appearing among the options — checked in **both
languages**, because a gloss card's options are English and a cloze card's are
Luxembourgish, and the hint prints both sides.

The interesting constraint is that it must never be *wrong*. The lookup is by
surface spelling against the decks already shipped, and Luxembourgish function
words are badly ambiguous: `de` is the masculine article on nearly every page
of the corpus, but the deck also glosses that spelling as "you" (the clitic form
of `du`), so a naive lookup produced `de = you` under `de ganzen Dag`. So the
glossary keeps only spellings that are claimed by exactly one deck entry, are a
content word, and are at least four characters. That drops coverage from 98% of
sentences to about 70% — the right side of this repo's own rule that fewer
correct items beat a full-looking tree.

Nothing here is translated by the app: every gloss is one LOD published, read
out of the decks already on the device. A sentence with no safe candidate
offers no hint rather than a guess — which is what happens on the stage-1
starter words, since those have no example sentence at all.

Taking a hint is not penalised. The card is still graded on the answer, because
the alternative for a beginner facing nine unknown words is to guess, and a
guess teaches nothing.

## Verification

`npm test` 145 passing (six new, covering the ambiguity exclusion, the
both-languages option check and real-deck coverage) · `npm run walkthrough`
41/41 · `validate` PASS · `sw.js` `VERSION` → `v19`, with `js/drill/hint.js`
added to the precache list — a test catches that omission, which is how the
list stays honest.

---

# Follow-up 3, 2026-08-03

## Theory, and teaching it before the exercise

The app drilled gender, the n-rule and adjective agreement with a single line
of rule each, shown **only after a miss** — so the first attempt at every
grammar item was a guess by construction — and taught nothing else at all.

`app/js/grammar-guide.js` is now the theory: seven topics, each with a one-line
rule and a few paragraphs of teaching. Three match the drilled kinds; the other
four are gaps that were simply absent. The largest is **the past tense**, which
the exam asks for directly — one of the three phases of the published interview
sheets is `d'Vergaangenheet` — and which the app did not mention anywhere.

It appears in two places:

- **On the cheat sheet**, as collapsible topics, so the sheet stays scannable
  when it is opened mid-exercise to check one thing.
- **On the card, before the question.** Open on a first meeting, because that
  card is an introduction and there is nothing yet to retrieve; collapsed to
  "Remind me of the rule" from the first review, because re-reading the rule
  every time would replace the recall the drill exists for.

**What may be written there.** English is free; Luxembourgish is corpus-locked.
So the prose is written, the handful of closed-class forms named inline (the
articles, `net`, `hunn`/`sinn`) are real, and **worked examples are not written
at all** — each topic pulls them out of the shipped decks at render time. The
perfect-tense examples come from LOD's own Flexiounstabellen, which carry an
auxiliary and a participle for 364 of the 365 verbs.

`grammar-guide.test.js` enforces it: every Luxembourgish token quoted by an
example, and every one written into the prose, must be attested by a shipped
deck. The validator never sees this file — it gates generated content, and this
is app code — so the test is the gate.

One thing measurement changed: ordering the perfect-tense examples by frequency
put the auxiliaries and modals first, which produced `hunn … ginn` (the
participle of `ginn` is `ginn`) and modals in the perfect, a construction well
past A2. They are excluded, so what shows is `hunn … giess`, `sinn … komm`.

## Explanations reaching for German

Luxembourgish is close enough to German that a model asked to explain it will
reach for German rules, and a beginner has no way to catch it. Both prompts —
the Worker's and the direct API path's — now carry an explicit guardrail naming
the specific traps: no case endings of the German kind and no genitive; the
articles are `den`/`d'`/`en`/`eng`, not `der/die/das`; a noun's gender often
differs from its German cognate; the perfect is the ordinary past, not a
formal alternative to a simple past; and the Eifeler Regel has no German
equivalent at all. Where it is unsure it is told to describe what the sentence
does and say so, rather than fill the gap with German.

## When the audio will not play

A `listen` card shows no word and no sentence — the ear is meant to do the
work. That made failed playback the worst state in the app: an empty card with
four options and nothing to answer from. Offline with an unmirrored clip, a
decode error, or iOS refusing without a gesture all land there.

Playback failure now shows the sentence, and says why. It is a worse exercise
than the one intended, but reading is a way through and a blank screen is not.
The autoplay path falls back immediately rather than waiting for a tap that
would fail the same way.

## "The ones about to fade"

Reported as not making sense, and it doesn't: it describes our scheduler rather
than anything the learner can see, and reads as a warning about words they have
no way to identify. Both places now say what is actually true and actionable —
*"N words you have met before are ready to come round again. Today is the day
they stick."*

## Verification

`npm test` 150 passing (five new on the guide) · `npm run walkthrough` 41/41 ·
`validate` PASS · `sw.js` → `v20`, with `js/grammar-guide.js` added to the
precache list — caught by the test that enforces it, for the second time.
