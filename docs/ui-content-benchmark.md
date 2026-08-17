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

---

# Follow-up 4, 2026-08-03 — the missing decks

The guide added theory for four rules that had no exercises behind them. This
builds the exercises: **1,004 new items**, taking the grammar deck from 1,799
to 2,789.

| kind | items | the question |
| --- | ---: | --- |
| `perfect-aux` | 290 | does this verb take hunn or sinn? |
| `perfect-form` | 300 | which past participle fills the gap? |
| `wordorder` | 220 | which of three orderings is right? |
| `negation` | 180 | where does net go? |

Nothing is authored. The auxiliary and participle come off LOD's
Flexiounstabellen; the gapped sentences and the orderings are LOD's own example
sentences.

## The interesting part: distractors made of real words

`wordorder` and `negation` offer three orderings of the *same* sentence — the
one LOD wrote, and two with one word moved. Every token is attested; only the
order is constructed, and constructed to be wrong. Four things had to be true
for that to be honest, and measuring found three of them broken first:

**The correct option has to be what LOD actually wrote.** Rejoining tokens with
single spaces drops every comma, so the first build shipped
`a bon dat wousst ech net` as "correct" for `a (bon), dat wousst ech net!`.
An item is now taken only if its tokens reconstruct the sentence exactly, with
any closing mark kept aside — which also drops the comma-spliced interjection
fragments whose word order was never the point.

**A wrong answer must be wrong for one reason.** Moving a word changes which
word follows which, and the n-rule keys off exactly that: 19% of word-order
options and 26% of negation options came out carrying an n-rule finding, i.e.
misspelled *as well as* misordered. The shared gate passes those because every
n-rule finding is a warning by design. These two kinds now require the sentence
and every generated option to be completely silent on the n-rule. Validator
warnings went from 371 back to 243 against a 232 baseline, and the yield did
not drop.

**A distractor must not be a correct sentence of another kind.** Fronting the
finite verb is how Luxembourgish forms a yes/no question, so
`hunn ech eng Conjonctivite …` is not wrong — it is a different sentence type.
Position 0 is never offered.

**The rule has to be the thing being tested.** `wordorder` takes only sentences
whose finite verb is already the second word, so moving it is wrong *by the V2
rule* rather than merely unusual. Second word is a subset of second element —
a sentence opening with a multi-word phrase is skipped rather than judged,
because the app cannot parse the phrase.

## Two things measurement caught after that

`perfect-aux` first shipped **"does *hunn* take hunn or sinn?"**, and the
modals, whose participle is identical to their infinitive — the answer in the
prompt. Both excluded.

And ranking the deck by sentence length put all 290 auxiliary cards first: they
have no sentence, so they scored zero. A learner would have answered "hunn or
sinn?" 290 times before meeting a gender card. Grammar is now ordered by a
**round-robin across the seven kinds**, each internally shortest-first, so every
rule gets a turn from the first session.

## What is still theory-only

**Pronouns.** Deliberately not built: the `conjugate` card already drills the
pronoun/verb-form relationship from the other direction, the cheat sheet has
the table, and a pronoun deck would be the one place this pipeline had to write
Luxembourgish by hand rather than mine it.

## Guards added

The pipeline now **refuses to build** if a form it names by hand — the two
auxiliaries, their finite forms, `net` — is absent from the lexicon. It caught
`haat` on the first run, a preterite that is not attested. Everything else is
copied from the corpus, where a typo shows up as a missing item; these few are
search keys, and a wrong one quietly mines the wrong sentences and still
succeeds.

`validate.js` gained `participle` and `moved` as declared Luxembourgish fields —
it rejected them as unclassified, which is the schema gate working: an
undeclared field is never checked, so it is never allowed.

## Verification

`npm test` 155 passing (five new on the deck shapes) · `npm run walkthrough`
41/41 · `validate` PASS, 243 warnings against a 232 baseline · `sw.js` → `v21`.

---

# Duolingo benchmark, 2026-08-03

Asked to benchmark Duolingo and apply the same logic. Below is the mechanic-by-
mechanic mapping, what was adopted, and — the more useful half — what was
rejected and why.

The framing matters: Duolingo optimises for **daily active users on an open-
ended goal**. This app optimises for **two people passing a dated exam**. Most
of the machinery transfers; the parts built to keep someone playing when they
have no reason to do not, and this repo has already ruled several of them out
in writing.

## The mapping

| Duolingo | Here | Verdict |
| --- | --- | --- |
| Streak, freezes | Streak, 2 freezes/week, 7-day strip | **Have it** |
| XP as one shared currency | Points across answers, recordings, reviews, cards | **Have it** |
| Leagues — 30 strangers, weekly promote/demote | Woch-Duell, 1v1, handicapped | **Better for two people** |
| Path, units, sections | Stages 1–5, journey, grammar round-robin | **Have it** |
| Combo bonus inside a lesson | The chime's pentatonic ladder | **Have it** |
| Lesson ≈ 15–20 exercises | 12 | Close enough |
| Birdbrain adaptive difficulty | Leitner boxes + the card ladder | Ours is transparent; theirs is better. Not worth a rewrite |
| **Practice Hub "Mistakes"** | *nothing* | **Adopted — biggest gap** |
| **Goal chosen at signup (Casual→Intense)** | fixed 30 | **Adopted** |
| Hearts / lives | none | **Rejected** |
| Guilt notifications | none, deliberately | **Rejected** |
| Gems, shop, Super | none | **Rejected** |
| Legendary levels, XP boosts | none | **Rejected** |

## Adopted: a mistakes list

Duolingo's Practice Hub collects your errors into a named list you can go and
clear, and it is the one thing here that had no equivalent at all. The drill
re-asked a missed card three cards later and that was its only second chance:
once the session ended the miss was gone, and whether the word came back was
left to its Leitner box — correct scheduling, and completely invisible.

The insight worth copying is not the scheduling. It is that a learner wants
something **finite and completable**. "These 14, and then you are done" is a
different offer from "the algorithm has it in hand", and only one of them is a
thing you can decide to do this evening.

So `#/mistakes` is a *view*, not a second scheduler. Nothing in it changes when
a word is next due. A row is written when a card is missed, removed the moment
that card is answered correctly anywhere, and ordered most-missed-first —
because a card got wrong three times is both the one worth the next ten minutes
and the one you remember failing. Retries are excluded for the same reason they
are not graded, and an accent-only miss does not count, or the list would fill
with keyboard slips rather than things that are not known.

## Adopted: the daily goal is now a choice

Duolingo asks at signup and offers four levels. That is not decoration — a goal
you set is committed to differently from one handed to you, and the person here
knows what their week looks like and when the exam is. Settings now offers
Light (15) · Steady (30) · Serious (50) · Exam soon (80). 30 stays the default.
Every option is a real number of cards and `todayProgress` measures against
whichever is chosen; there is no separate "effective" goal.

## Rejected: hearts

The one mechanic that is actively wrong here. Hearts limit how many mistakes
you may make and then stop you practising, which is punitive in an app with a
deadline: the learner who most needs another ten minutes is the one getting
things wrong. It is also the mechanic Duolingo takes the most criticism for —
[research on it](https://medium.com/@flordaniele/duolingo-case-study-research-on-gamification-90b5bac3ada0)
finds the life system makes learning feel truncated, and the same literature
finds leagues can push people to play for position rather than to learn.

We already went the other way on purpose: a missed card comes back within the
session, mistakes now collect into a list to clear, and nothing anywhere gates
practice.

## Rejected: notification pressure, and the streak as the point

Streaks are Duolingo's single biggest growth lever, and the cost is documented:
streak anxiety, and people practising to protect a number rather than to learn.
The README already chose the softer version — two freezes a week, no guilt copy,
no nagging — and a PWA that cannot send notifications is the right shape for
that rather than a limitation to work around. Unchanged.

## Rejected: currency, shops, and anything paid

There is nothing to monetise in a two-person tool, and gems exist to make hearts
matter. Both stay out.

## What Duolingo does better and we are not copying yet

**Birdbrain.** Their difficulty adapts per learner from a trained model
([the published spaced-repetition work is worth reading](https://research.duolingo.com/papers/settles.acl16.pdf));
ours is a five-box Leitner ladder with fixed intervals. Theirs is better. But
ours is inspectable, testable and explainable on screen, and replacing it would
mean training something on two people's data. The honest position is that this
is a real gap and the wrong one to close at this scale.

**Session shape.** Duolingo interleaves lesson types within a unit more
aggressively than our fixed 12-card mixed session does. The grammar round-robin
added earlier is a step in that direction.

## Verification

`npm test` 155 · `npm run walkthrough` 41/41 · `validate` PASS · `sw.js` → `v22`,
IndexedDB → v5 for the new `mistakes` store.

---

# Follow-up 5, 2026-08-03 — "I drill and nothing moves"

Two reports, both true, both reproduced before touching anything.

## The deck bars could not move for eleven days

The Learn deck rows filled by `heldPct` — items at box 3 or higher. The Leitner
intervals are 0/1/3/7/16 days, so:

```
day 0: answer right -> box 1
day 1: answer right -> box 2
day 4: answer right -> box 3   <- earliest anything counts as "holding"
=> day 11 before the bar can move at all; day 27 for "mastered"
```

So both bars on every deck row were pinned at zero for a beginner's first
fortnight, no matter how much they drilled. That is indistinguishable from the
app not saving anything — and the grammar row made it worse, because "12 of
2,789 exercises met" also renders as visually zero.

The comment above `deckRow` claimed `heldPct` was "the number that moves after
a single session". It was not, and the arithmetic was there to check.

**Fixed.** `learnProgress` now also returns the box distribution, and the bar is
a **ladder**: one segment per Leitner box, sized by how many met items sit in
each. A correct answer moves width from one segment to the next *the same day*,
because that is exactly what a correct answer does. The caption still reports
"N of M holding" — that remains the number that means something about the exam
— it is just no longer the only thing on screen, nor the thing that has to move
for the row to look alive. Verified: 0 segments → 2 segments and "7 met" after
ten grammar cards.

## The step counter was frozen by my own fix

"It says I need 4 more but when I do it, no change." Exactly right, and this one
was a regression introduced by the daily new-word cap two commits earlier.

A path step reads `116/120` and links to a stage-scoped session. Once the day's
eight new words are spent, that session contains **zero cards** — reviews of
that stage are not due yet and no new words may be introduced — and the empty
screen said *"Nothing due right now — you are caught up."* Which is false: there
are four words left, and the app is holding them back on purpose.

The cap is right and stays. What was wrong is that nothing said so, in three
places at once:

- the empty session now distinguishes **"That is today's new words done"** from
  "you are caught up", and explains that reviews still count today;
- the path intro says the counts stop here until tomorrow;
- the current step carries a **"more tomorrow"** note next to its `116/120`, so
  the number and the reason sit together.

Verified by seeding a spent budget: all three appear, and the stage session no
longer claims to be caught up.

## Verification

`npm test` 157 (two new: that "holding" is provably far off, and that a spent
budget is distinguishable from an empty queue) · `npm run walkthrough` 41/41 ·
`sw.js` → `v23`.

---

# Follow-up 6, 2026-08-03 — "I keep seeing the same words"

Reported as a suspicion. Simulated over 90 days of realistic use (30 cards a
day, 85% accuracy) before changing anything, and it is correct — but the cause
is not a bug, which is why it needed measuring rather than fixing blind.

## What the simulation found

| daily goal | distinct words met in 90 days | peak review backlog |
| --- | ---: | ---: |
| 30 (default) | **149** | 56 |
| 50 | 254 | 65 |
| 80 ("Exam soon") | 371 | 93 |

`DAILY_NEW_TARGET` is 8, so the theoretical ceiling is 720 words in 90 days.
At the default goal the learner gets **21% of that**, and roughly **half of
every day's cards are words seen the day before**.

Nothing is broken. `buildMixedSession` takes due reviews before new words —
deliberately, because a due card is a memory about to be lost — and a 12-card
session saturates once forty-odd items are in circulation across two strands.
Intake then falls to near zero and the deck stops advancing.

The tempting fix is a floor of guaranteed new words per session. It was
simulated too, and it reproduces exactly the failure the README already
documents: at 30 cards a day a floor of 2 lifts coverage to 373 words but the
**backlog explodes from 56 to 454**. Reviews-first stays.

So the real constraint is throughput: meeting more words requires answering
more cards, and the lever is the daily goal — which is now a setting.

## What shipped

A **"Are you moving forward?"** panel on Learn, reading the learner's own rows,
because none of this was inferable from the screen:

- **words met** — the total, which was already there
- **new in 7 days** — the number that says whether the front of the deck is
  still moving. A large total with a stalled weekly figure is exactly the state
  being complained about, and nothing distinguished them before.
- **keep coming back** — items sitting at box 0. Box 0 is due *immediately* by
  design, so every one of these returns in the very next session. This is the
  literal, per-item answer to "why do I keep seeing the same words".

When intake is below a quarter of the cap the panel says so and names the
mechanism and the lever, rather than leaving the learner to conclude the app is
broken.

`learn` rows now carry `firstAt`, written once on first encounter — the store
could say how many words were known but not whether that number was still
moving. Rows written before this count in the total and are excluded from the
weekly figure, and the panel says how many those are rather than guessing.

## Verification

`npm test` 157 · `npm run walkthrough` 41/41 · `sw.js` → `v24`. Panel checked
against a seeded profile: 40 met, 6 at box 0, and the box-0 explanation shown.

---

# Follow-up 7, 2026-08-03 — the gender rule was wrong, and mine was the wrong one

Reported as a contradiction between the guide's gender rule and a card's
correct answer, on this explanation of `Puer`:

> *Puer* is neutral, which you can see from the article *en* (the neutral
> indefinite article). Notice that *Puer* takes the same article as other
> neutral nouns like *en Bréck* (a bridge) or *en Bréck* (a break). The word
> *Schaffschong* (flip-flops) …

Checked every claim against the data. The result was not what I expected.

## The card was right, the explanation was half right, and the guide was wrong

`Puer` is neuter in LOD, so the card's answer stands. And `en` **is** the
neuter indefinite article — the explanation was right about that, and **my
guide was wrong**. I had written:

> "The indefinite is en for masculine, eng for feminine and neuter."

Counted over LOD's own example sentences:

| gender | indefinite | definite |
| --- | --- | --- |
| masculine | **en** 89% | de 69%, den 24% |
| feminine | **eng** 99% | d' 97% |
| neuter | **en** 99% | d' 93% |

So `eng` is feminine only, and `en` covers masculine **and** neuter. I had it
backwards, in prose I hand-wrote, and the existing test could not catch it
because it only checked that quoted tokens were *attested* — `en` and `eng`
both are — never that the claim was *true*.

The corrected topic now also makes the point the numbers actually support, and
which is more useful than either version: **neither article alone identifies
the gender.** `d'` narrows to feminine-or-neuter, `en` narrows to
masculine-or-neuter; it is the pair together that pins it down.

## The explanation was inventing the rest

Two fabrications in three sentences:

- **`en Bréck (a bridge) or en Bréck (a break)`** — the same word twice with
  two different glosses, offered as examples of *neuter* nouns. `Bréck` is
  **feminine** in LOD, glossed "bridge". Neither the duplication, the second
  meaning, nor the gender is real.
- **`Schaffschong (flip-flops)`** — not in the deck at all, and not what the
  compound means.

Both are the model filling a gap it could not look up. Two fixes, because
asking it not to is not a mechanism:

**It is now told the facts.** `factsFor()` in `cards.js` sends what LOD already
records — a noun's gender and article, a verb's auxiliary and participle — as
authoritative. There is no gap left to fill.

**It is now forbidden to introduce examples.** Both prompts say to use only the
words in the given sentence, never to invent a gloss, and never to claim a
gender, article or meaning it was not given. The `en Bréck` failure is quoted
in the prompt as the thing not to do.

The explanation cache key includes the facts, so nothing already cached under
the old prompt is replayed.

## The guard that was missing

`grammar-guide.test.js` now *measures* the article claim rather than reading
it: it counts article-to-gender pairs across the shipped decks' sentences and
asserts the dominant article per gender, then asserts the prose says the same
thing and that the old wrong wording has not returned. A rule stated in English
about Luxembourgish is still a claim about Luxembourgish, and it needs the same
kind of gate as the tokens do.

## Verification

`npm test` 158 (one new) · `npm run walkthrough` 41/41 · `validate` PASS ·
`sw.js` → `v25`. Worker redeployed: the `/explain` contract gained `facts`.

---

# Follow-up 8 — sentence structure, and the wrong goal

Four things reported together:

> "Add a section on sentence structure practice … do a complete research on
> official Luxembourg sources … start with the theory and then move into the
> practice increasing in difficulty. Make these mandatory for the daily goal.
> … when opening the app we should start with the today tab selected. …
> the main goal is not to learn words but to pass the exam, understand this
> and see if it changes your approach. The words met and holding part is not
> intuitive."

## The sources

The official reference is **Grammaire de la langue luxembourgeoise**, Zenter
fir d'Lëtzebuerger Sprooch (ISBN 978-99959-1-206-2). It is print-only — there
is no machine-readable edition to mine — so it is cited as the authority for
the rules while every Luxembourgish example ships from LOD, as everywhere else
in this repo. Each rule was then re-checked against the corpus before being
written down:

| rule | corpus evidence (of 10,777 LOD example sentences) |
| --- | --- |
| the conjugated verb is the second element | 3,288 sentences put a finite verb in position 2 |
| the second half of the verb closes the clause | 1,981 sentences show the bracket |
| after *datt* / *ob* the verb goes last | 73% of subordinate clauses are introduced by *datt* |

## What shipped

**Theory.** Three new guide topics — `wordorder`, `bracket`, `subclause` —
written as a ladder, each assuming the one before. They join the cheat sheet
and are shown inline before their own exercises by the existing `teachBefore()`.

**Practice.** Two new mined kinds, `bracket` (200 items) and `subclause` (98),
alongside the existing `wordorder` (220). The grammar deck is now 3,087 items
across nine kinds. `subclause` needed a bespoke miner: `orderItems()` rejects
any sentence containing punctuation, and a subordinate clause is defined by
its comma, so it returned zero until the permutation was made comma-aware. The
test asserts no option gains, loses or crosses a comma.

**A screen.** `#/structure` — the three rules with real LOD sentences under
each, a graded "practise this one" per step, and "practise all three".
`#/grammar/<kind>` is the focused round behind those buttons.

## "Mandatory" had to be built, not written

The reserve mechanism keys on `deck.id`, and sentence structure is a slice of
the grammar deck rather than a deck of its own — it has to share grammar's
Leitner rows, or one card would carry two independent boxes depending on which
screen showed it. So a `structure` group and the `grammar` group were **one
reservation**: three reserved slots spread across nine kinds, and a word-order
card turned up about a third of the time in something the home screen would be
calling mandatory. `buildMixedSession` now takes a `reserveId` that defaults to
the deck id, so two groups can share a deck and be reserved separately.

Writing the test for that found a second bug in the same mechanism. Overlapping
groups meant the same `{deck, strand, item}` was in both pools, and
`fresh.slice()` took it **twice** — the same question, twice, in one twelve-card
session, which reads as the app having lost its place. Selection is now
deduplicated as it picks.

And the checklist can now drift out of reach of the session: Today asks for 3
structure cards, `STRUCTURE_RESERVE` guarantees 3. A test reads both constants
out of their files and fails if the goal ever exceeds the reserve — the same
failure as the frozen stage counters, one level up, and invisible until someone
reports it.

## The Today tab

`ROUTES[name] ?? today` fell back to Today for an unknown hash but computed the
highlighted tab as `name || 'journey'`. Every cold start from the home screen
has an empty hash, so the app rendered Today while highlighting Listen. One
line each.

## The exam is the goal, so the screens now say what for

Taking the third point seriously changed more than wording.

**Today's plan could never reach the exam.** `nextAction()` returned the first
unfinished step, and step 1 is a 30-card daily goal that is unfinished for most
of most days. So words won the primary button every single time, and the two
halves the exam is actually marked on — Verstoen and Schwätzen — sat
permanently below them. An overdue speaking recording now jumps the queue, the
way a partner's waiting review already does. Only once there is a habit to have
broken: a learner who has never recorded is not behind, they are being held
back on purpose by the readiness gate.

**Every step now says which part of the exam it is for**, and the list is
introduced by what it is measured against — two halves, pass on speaking alone
or on the two together, words and grammar not scored on their own.

**Deck size is no longer a denominator.** "57 of 2,449 met" states a target
nobody has to hit. It reads as "in the deck" now, and the Learn hub says
plainly that the decks are pools to draw on rather than lists to finish.

## "Met" and "holding" were our words, not the learner's

A deck row read `12 of 47 holding` under a heading of `Understand`. "Met" is
the scheduler's term for an item with a database row; "holding" is its term for
box 3 or higher. Neither is anything a learner asked about. What they want to
know is whether they could follow the word in the listening paper and produce
it in the interview, so:

| was | is |
| --- | --- |
| Understand / Say | Can follow it / Can say it |
| 12 of 47 holding | 12 solid of 47 seen |
| 47 met · just seen → holding | left to right: just seen → solid |

"Solid" is defined once, where the bars are explained: three correct answers on
three separate days, which is what box 3 actually costs. The walkthrough now
fails if the word "holding" reappears on the Learn hub.

## Verification

`npm test` 162 (three new) · `npm run walkthrough` · `validate` PASS ·
`sw.js` → `v26`.

---

# Follow-up 9 — explaining a grammar card

> "For the grammar parts add a explain this sentence which explains the rule
> but in the context of that specific sentence. Also use plain language so it's
> easy to understand"

## Three grammar shapes had no explain button at all

The button is built only when the engine can find a sentence on the card, and
it looks in three places: the prompt's sentence, the reveal text, or
`item.example.lb`. Three shapes have none of those.

| kind | why the lookup failed | share of the deck |
| --- | --- | --- |
| `wordorder`, `bracket`, `subclause`, `negation` | render **no prompt at all** — the three options *are* the sentence | 798 items |
| `perfect-aux` | a verb and two auxiliaries; no sentence exists | 290 items |
| `gender` with no example sentence | 63% of nouns have none | ~740 items |

So roughly **half the grammar deck** could not be asked about, and it was the
half where the answer is least self-evident. A card can now be explainable
without a sentence: `lb` may be null, and the question rests on the word, the
task and the facts, which is enough to answer "why does this verb take sinn?".

The button also names what it is offering. "Explain this sentence" is wrong on
a card with no sentence, and wrong on a word-order card too, where the question
is not what the sentence means but why this arrangement of it is right. It now
reads **"Why is this the right order?"**, **"Why this one?"**, **"Why this
gender?"** or "Explain this sentence" as appropriate.

## In the context of *this* sentence

For a word-order card all three options mean the same thing, so an explanation
that reaches for the sentence's meaning explains nothing. `factsFor()` now
tells the model what the card actually is:

> All three options are the same real LOD sentence with one word in a different
> place. The only word that moves is "hunn"; every other word is in the same
> position in all three. The order LOD published, which is the correct answer:
> ech hunn eng Conjonctivite am lénksen A. The wrong orders they could have
> picked: …

and the prompt asks for a fixed shape: which word moved, where it ended up in
*this* sentence and what it sits next to, then why the wrong option is wrong.

Every other grammar kind gained facts too — the n-rule card now states the word
that *follows* the gap, which is the entire question; the adjective card states
that both forms are real; the participle card states that the distractors are
genuine participles of other verbs.

## Plain language

The prompt now bans the vocabulary the explanations were reaching for — finite
verb, auxiliary, participle, clause, subordinate, inversion, conjugation,
declension, the cases, morphosyntax — and gives replacements ("the verb that
changes with I/you/he", "the second half of the verb", "the part starting with
datt"). Terms the learner will meet anyway (männlech, the Eifeler Regel, the
perfect) may be used, but must be glossed in the same breath, and never used to
explain each other. And it asks for the sentence's own words: *"hunn comes right
after ech"* beats *"the verb occupies second position"*.

## Two Worker bugs found on the way

**The facts never reached the model.** `/explain` read `facts` off the request,
folded it into the cache key, and then called `explainPrompt({ lb, word, en,
task })` — dropping it. So the entire fix for the invented `en Bréck (a bridge)`
explanation only ever applied on the direct-API path, which is not the one most
requests take. One argument.

**A missing sentence was a 400.** `if (!lb) return json(…, 400)` would have
rejected every card in the two shapes above. It now needs `lb` *or* `word`.

## Explanations are cached forever, so a new prompt needs a new key

By design, on the device and in the Worker's KV. A rewritten prompt would
otherwise reach only cards nobody had asked about yet. Both caches now carry
`EXPLAIN_PROMPT_VERSION`, and a test fails if the two files disagree — along
with one that checks the shared paragraphs are present in both prompts, since
they are duplicated rather than imported (the Worker deploys separately).

## Verification

`npm test` 167 (five new) · `npm run walkthrough` 43/43 (one new step drives the
real button on a word-order card and asserts what reached the API) ·
`validate` PASS · `sw.js` → `v27`. Worker redeployed.

---

# Follow-up 10 — the translation comes first

> "When asking for a sentence explanation start at the top with the English
> translation"

The prompt said the opposite, and had since it was written:

> "Do NOT just translate the sentence — the learner already has the gloss."

The gloss is the *headword's* meaning, not the sentence's. So an explanation
opened straight into the point about word order or gender, on top of nine words
the learner very often could not read at all — and an observation about a
sentence you cannot read has nothing to attach to. On a word-order card it is
worse than useless: all three options mean the same thing, so without the
translation there is nothing at all on the card in a language the learner
speaks.

The translation now leads, as **its own field** rather than as the first
sentence of the explanation — a format enforced by prose is a format that
drifts, and this one has to be reliably first to be reliably rendered first.
The reply shape is `{"translation": "…", "explanation": "…"}`, rendered as a
larger, darker line above the explanation.

`translation` is optional and `explanation` is not. A card with no sentence —
`perfect-aux`, or a gender noun with no example — has nothing to translate, but
there is always something to explain, so a reply carrying only a translation is
a failed reply. Both paths also drop a translation offered for a sentence that
was never sent, which is the model filling a field rather than reading one.

`EXPLAIN_PROMPT_VERSION` → `v3`, so the device cache and the Worker's KV both
miss and every explanation is rewritten with the translation on top.

## Verification

`npm test` 168 (one new) · `npm run walkthrough` 43/43 — the word-order step now
asserts the rendered order with `compareDocumentPosition`, not just that both
strings are on screen · `validate` PASS · `sw.js` → `v28`. Worker redeployed.

---

# Follow-up 11 — past tense, imperative, and a 100-verb lookup

> "Lets add in the cheat sheet a separate tab with a list of 100 verbs that
> when tapping on each I have their conjugation, past tense and imperative.
> Also add past tense and imperative on the most used verbs in the main cheat
> sheet"

## Where the forms come from

LOD's Flexiounstabellen (`.cache/lod/tab.xml`) already carry both, verbatim,
for the same 365 verbs the app already ships:

- **Past tense** is LOD's `presentPerfect` block (aux + participle, per
  person) — not the literary `pastSimple` (Präteritum). Deliberate, not a
  simplification: the app's own explanations already tell the learner that
  the perfect is "the ordinary way to talk about the past" — Luxembourgish
  does not use a simple past in everyday speech the way English or German do.
  LOD publishes `pastSimple` for only 66 of these 365 verbs (mostly the two
  auxiliaries and a few verbs used in narration); `presentPerfect` is complete
  for 364.
- **Imperative** is LOD's own `<imperative><present>` block, p2 (du) and p5
  (dir). 343 of 365 verbs have one — the exceptions are mostly modals
  (kënnen, mussen, sollen, wëllen), where "can!" is not a command in any
  language, so the source simply omits it. Kept as partial rather than
  discarded: 21 verbs publish only the p5 form.

## Two cleaning bugs found while shipping it

The present-tense cleaner already existed (strip a slash-separated second
spelling, strip a reflexive pronoun in parens) — reusing it on the new fields
surfaced two cases it had never been asked to handle:

- **`hief (dech)!`** → stripping `(dech)` before the punctuation left `hief !`,
  a space before an exclamation mark that no real Luxembourgish sentence has.
- **`hieft / hutt (iech)!`** → LOD attaches the `!` to only the *second* slash
  variant. Taking the first variant first, as the present-tense cleaner
  always had, silently dropped the mark from a form that is a command by
  nature.

`cleanForm()` now lifts trailing punctuation off the whole cell before
splitting or stripping anything, and reattaches it after — regardless of
which variant survives. `pipeline/test/verbs.test.js` tests both cases
directly, plus a form LOD genuinely ships with no `!` at all (astellen's p5,
real source variance, not a bug), so the fix cannot mistake "missing" for
"failed to preserve".

Each new field is gated the same way the present tense already was, but drops
only that field on failure rather than the whole verb: an unclean past tense
does not have to cost a verb its otherwise-good present-tense entry.

## What shipped

**The cheat sheet is now two tabs.** "Basics" is everything it already
showed. "100 verbs" is new: the most-used verbs in the corpus, ranked by
`rank` (already computed for the Learn path), each a collapsed card that
expands to Present / Past / Imperative — only the groups a given verb
actually has, so the four modals with no imperative show two groups instead
of a blank third one.

**The nine core verbs in "Basics" gained the same two groups.** `hunn`,
`sinn`, `ginn` and the rest now expand to past tense and imperative
alongside the present tense they already showed, in the same card.

Both consume one shared transform (`toVerbTable`) and one shared render
function (`verbDetails`) — the only difference between the "Key verbs"
section and the "100 verbs" tab is which nine-or-hundred items get handed to
it, not two copies of how a verb card is built.

## Verification

`npm test` 187 (19 new — `pipeline/test/verbs.test.js` is new, plus five in
`reference.test.js`) · `npm run walkthrough` 44/44, including a new step that
switches tabs, confirms the list is ranked (hunn first) and expands a card to
check for the Imperative group · `validate` PASS · `sw.js` → `v29`.

---

# Follow-up 12 — a picture-naming game

> "Let's add a new game which takes pictures of everyday objects and I have to
> guess the name. Start with multiple choice then letter selection. Use
> pictures from the internet but use the words found on the exam guide you
> have"

## The word list is the vocabulary deck, not a new one

"The exam guide you have" is the shipped vocab.json — every object word this
game can ask about already exists there, filtered to categories that mean
"a physical thing you could point at": food, drink, fruit, vegetables,
clothing, animals, plants, vehicles, instruments, and a couple of
place-nouns (restaurant, school). The filter is deliberately narrower than
it first looks:

- **No people.** LOD's own "Kach" (chef) carries both `HORECA` and `PERSOUN`
  — an object-category tag is not enough on its own; a person-shaped
  category anywhere on the entry excludes it, so a photo-naming game never
  goes looking for photos of identifiable strangers.
- **No body parts (`ANAT`), despite qualifying on paper.** Found by actually
  running the searches: Commons' results for "nose", "foot", "leg" skew hard
  toward dissection photography and pathology illustrations — a correct
  answer to the search term and a bad flashcard. Cut entirely rather than
  patched around.
- **A short hand-reviewed exclude list** for words a category tag let
  through that are not single photographable things anyway — "Verb" is
  tagged `SCHOUL`, "Reegel" (rule) is tagged `ANAT` because LOD's other sense
  of the word is a medical term, "Uebst" (fruit, the generic collective) is
  indistinguishable in one photo from any of its own members.
- **True synonyms merged.** "Hond" and "Mupp" are both just "dog" — left as
  two rounds, a photo captioned one could offer the other as a wrong answer
  that is not actually wrong. Kept the more frequent spelling. "Peffer" and
  "Paprika" both gloss to "pepper" but are genuinely different objects (a
  spice and a vegetable) and are deliberately exempted from the merge.

150 words qualify this way, most frequent first.

## Sourcing real photos, and three ways the search got it wrong first

Wikimedia Commons only, same free-licence allowlist `fetch-images.js`
already uses (now shared, in `pipeline/lib/wikimedia.js`, rather than
duplicated). Every photograph is a full-text search for the word's English
gloss — there is no "Category:Apples" for most of these — and three real
mismatches turned up while building it, each fixed rather than shipped:

1. **Wrong subject entirely.** Searching "water" surfaced a photo titled
   "IceBirdWithFledgling" — a bird, with no textual connection to water at
   all. Fix: a result only counts if the *file's own title* contains the
   word searched for.
2. **A disambiguating word became an over-strict requirement.** A bare
   body-part word needed a "human" prefix to search well ("head" alone
   returns mostly unrelated results), but requiring "human" back out of the
   *title* rejected a correctly-titled anatomical diagram in favour of a
   literal "Male human head louse" photo — a real result for the words in
   its title, and not what "head" means here. Fixed by checking the title
   against the original gloss only, never against words this app added to
   help the search along.
3. **Popular but wrong.** "Train" surfaced the famous 1895 Montparnasse
   crash photo before anything showing an intact train; "wine" surfaced a
   1924 film poster before an actual glass of it. Both are correct answers
   to their literal search terms and both are wrong for a flashcard. Fixed
   with a standing exclusion list (crash, wreck, disaster, poster, and
   related terms) applied to every search — including the ones for "Buch"
   (book), which is why "book," "film" and the like are deliberately *not*
   on that list: excluding a word this app is trying to find a photo of
   would just be another way to fail that search.

A fourth issue was in the title check itself, not the search: requiring the
*exact* word rejected "Egg" for a title that said "Eggs", "Chip" for
"Chips" — real Commons titles pluralise as often as not. Loosened to a
leading word-boundary only.

## The round: multiple choice, and only that

One round is eight pictures, each a multiple-choice card (the real word plus
three distractors, reusing `drill/inputs.js`'s `choiceInput`) — recognise the
word, not produce it. This originally shipped as two passes over the same
eight pictures, choice then a letter-tile spelling pass, but that duplicated
what the vocabulary drill's own production cards already test once a word is
strong enough to be asked that way; asked to narrow the game back to
guessing, the spelling pass was cut rather than kept as a second, weaker copy
of a task the main deck already owns. The input widget is still the drill
engine's own — a picture card has nothing to teach a "tap the right option"
control the vocabulary drill has not already taught it. Same optional-game
shape as Pairs and Gender Sort: counts for the streak, never touches the
Leitner boxes.

## What did not ship today

Wikimedia Commons rate-limited this session hard while sourcing the 150
photos — Retry-After climbing past 50 seconds per request, with every
request in a multi-hour span refused. That is an artefact of this session's
network conditions, not of the code: `collectWords`, the search-quality
fixes above, and the game itself are all tested against fixtures and pass.
What could not happen today is actually *running* the fetch to completion
against the live API.

Two things came out of hitting that wall rather than just waiting it out.
First, the fetch script now **checkpoints after every photo** and **resumes
by word** rather than only writing output once the entire list has been
searched — the previous shape meant a run interrupted at word 140 of 150
saved nothing at all, discarding real progress for want of ten more words.
Second, the honest state is shipped rather than papered over: `app/js/screens/objects.js`
already has a graceful "not enough photos yet — run `npm run fetch:object-images`"
state for exactly this situation (mirroring `speaking.js`'s existing
image-description empty state), and the walkthrough test covers *both*
branches — the full round when photos exist, the empty state when
they do not — so either state a real checkout is in is a tested path, not a
gap. Running `npm run fetch:object-images` (idempotent, resumable, and now
part of the `content` pipeline) on a connection Commons has not rate-limited
will populate it.

## Verification

`npm test` 202 (15 new in `pipeline/test/object-images.test.js`, exercising
the category/exclusion/dedup logic against fixtures — the one real-data
check in the same file skips cleanly when word-images.json has not been
fetched yet) · `npm run walkthrough` 45/45 steps, covering the empty-state branch as
described above · `validate` PASS · `sw.js` → `v30`. The walkthrough's own
console-error reporting now logs the failing resource's URL, not just
Chromium's generic "Failed to load resource" text — useful the moment
`data/word-images.json` legitimately 404s and remains useful for whatever
the next one is.

## Running it for real: 145 fetched, 29 wrong, 116 shipped

The rate-limiting wall above cleared later the same session; running
`npm run fetch:object-images` for real (resumed across a container restart
mid-run without losing progress, exactly as the checkpoint design intended)
found 145 of the 150 candidate words a free-licensed photo.

`titleMatches` only checks that the searched word appears in a Commons
file's title, and 145 real photos turned up three ways that a title can
contain the right word for the wrong reason — none of them visible without
actually looking at the picture:

1. **Proper-noun collisions.** The search term is also a place, a brand, or
   a surname. "Saumon" (salmon) returned an aerial photograph of the town of
   Salmon, Idaho, correctly titled and utterly unrelated to the fish.
2. **Polysemy.** The English gloss's dominant sense on Commons differs from
   the Luxembourgish word's actual category. "Kantin" (canteen) returned a
   metal field flask, not a cafeteria; "Peffer" (pepper) returned a bell
   pepper stuffed with vegetables, not the spice its category (`GEWIERZ`)
   actually names; "Pullover" (jumper) returned an electronics jumper wire.
3. **An identifiable person.** "Bikini" returned a photograph of an
   identifiable woman on a beach — a direct hit on this feature's own stated
   principle that a photo of an identifiable stranger is a different thing
   from a photo of an apple, and not something `titleMatches` (or any
   title-only check) can ever catch, because the title's job is to name the
   subject, not to say whether the subject is a person.

Found by viewing every one of the 145 mirrored photos by hand — the only
way to catch a title that is technically correct and semantically wrong.
29 words came out this way and were added to `EXCLUDE_WORDS` (so a future
`fetch:object-images` run does not just refetch the same wrong photo — the
search terms behind cases 1 and 2 above have no way to disambiguate),
their entries removed from `word-images.json`, and their mirrored `.jpg`s
deleted. 116 shipped, all hand-checked. `npm test` 203, `validate` PASS.
Fewer correct pictures beat a full-looking deck with a stranger's photo or
a metal nut captioned "Noss" in it.

---

# Follow-up 9 — multiple choice only, and three new grammar topics

Two requests together: make the picture game only about guessing (no
spelling pass), and "make sure I'm learning the N rule, how to describe
what I like (and not), the dative and speaking in the past."

## What is this? — multiple choice only

The game shipped as two passes over the same eight pictures: choice, then a
letter-tile spelling pass on the same eight. Asked to narrow it back to
guessing, the spelling pass is cut rather than kept as a weaker second copy
of a task the vocabulary drill's own production cards already own. A round
is now one multiple-choice pass, half the length it was.

## The audit: which of the four were already built

Before writing anything new, each of the four asks was checked against what
already ships, the same way every feature in this doc starts from what is
actually there rather than an assumption:

- **The n-rule** already has a theory topic, 250 mined practice items, a
  cheat-sheet section, and a guaranteed share of every session's grammar
  reserve. Checked the round-robin ordering (`content.js orderGrammar`)
  specifically for the bug that motivated `STRUCTURE_RESERVE` in Follow-up
  8 — a kind with many more items crowding out one with few — and it does
  not apply here: fresh items are introduced in a fixed round-robin across
  all nine (now twelve) kinds, one per kind per round, so `nrule`'s pool
  size relative to `gender`'s 1,134 doesn't change how often either is
  introduced. Nothing to fix.
- **Speaking in the past** already has a theory topic (`perfect`, citing
  that the interview has a whole phase on it) and, more directly, 17 of the
  18 interview topics carry a `past` phase with the hint "Use the perfect:
  hunn / sinn plus the participle" — an actual spoken-and-recorded task, not
  a written recognition drill. Nothing to fix.
- **The dative** and **likes/dislikes** were genuinely missing — not a
  single grammar kind covers either, and vocab.json ships `gär` and
  `gefalen` as ordinary one-word flashcards with no theory around them at
  all.

## Numbers, dative and likes: same shape, three new mined kinds

All three follow the pattern `pipeline/build-grammar.js` already uses:
closed-class Luxembourgish forms are named by hand (like the two perfect
auxiliaries or the gender articles), checked against an independent source,
then checked again by `assertAttested` against the LOD lexicon so the build
fails rather than ships a typo. Everything else is mined from real corpus
sentences.

**Numbers.** LOD's own Grondwuertschatz — the exam-scoped word list this
whole app is built from — turns out to lexicalise almost no numbers: of
2,204 entries, exactly one ("nonzeg") is a number word. So there is no
flashcard deck to build the way there is for nouns. What exists instead is
518 real, audio-backed example sentences that happen to use a number in
context — an age, a price, a quantity — which is also closer to what the
exam actually asks. `numberItems()` gaps the number out of one of those
sentences; the three distractors are other real number words from a
hand-specified, lexicon-verified list of the 30 needed for 0–19, the tens,
honnert and dausend. Two of those spellings — fofzéng (not "fënnefzéng"),
uechtzéng (not "aachtzéng") — are not the regular digit+suffix an English
speaker would predict, which is exactly why they are checked against a
source rather than derived. 150 items.

**Dative.** mat, bei, vun and no always take the dative, and the seven
personal pronouns shift form for it: mir, dir, him, hir, eis, iech, hinnen.
`dativeItems()` mines a real sentence where one of those pronouns directly
follows one of those four prepositions, gaps the pronoun, and offers the
other six as distractors — real forms, just naming a different person here.
mir and dir are flagged explicitly in the theory: both are also, in a
different sentence, the nominative plural "we" and the plural/formal "you"
— the same spelling doing an unrelated job, the same trap the pronouns
topic already calls out for dir alone. 96 items.

**Likes and dislikes.** There is no separate Luxembourgish verb for "to
like" — gär (or gären) is added to an ordinary verb and, like net, sits
late in the clause rather than glued to it. `likesItems()` reuses
`orderItems()` — the exact machinery `negation` already uses — pointed at
gär/gären instead of net: three real orderings of one real sentence, only
one of them correct. A sentence that already contains both net and gär
mines naturally into a "doesn't like" item; nothing extra was needed for
the negative case. 38 items.

## Wiring three new kinds through, not just adding data

Mining the items was the smaller half. Making them actually reachable
touched: `drill/cards.js`'s `has.grammarChoice` gate (without this, the
items exist but are never offered — the mistake that would make this land
as "nothing happened"), the per-kind instruction/task/fact text so an
explanation and a missed-card correction both know what to say, `likes`
joining `SENTENCE_KINDS` (it shares negation's whole-sentence-options
shape), `content.js`'s round-robin `KIND_ORDER`, and `pipeline/validate.js`
— the new `preposition` field on dative items was rejected outright by the
schema gate until it was declared, which is that gate doing exactly its
job on a field nobody had told it about yet.

The "explain this" system prompt (both `app/js/anthropic.js` and the
Cloudflare Worker's copy, kept in sync by hand as the header there already
requires) also needed a correction: it told the model Luxembourgish "has no
case endings... and no genitive" while banning the word "dative" outright.
That was fine when nothing taught a case; it is now misleading, so both
copies now name the dative as a real, small exception — pronouns only,
nowhere else — rather than let a model contradict a lesson the app itself
just taught.

## Verification

`npm test` 211 (12 new fixture and real-data tests for the three miners) ·
`validate` PASS (the `preposition` schema fix above) · `npm run walkthrough`
45/45, including the shortened multiple-choice-only picture round · a direct
in-browser check that a numbers, dative and likes item each build into a
real card with no thrown error, and that all twelve grammar-guide topics
render on the cheat sheet with zero console errors.

---

# Follow-up 10 — old words stop crowding out new ones

> "We shouldn't bring back old words that much, especially before new words.
> Let's remove that completely, only bring back mistakes and then after a few
> days randomly bring back up to 20% of the old words." Plus: remove the copy
> that told a learner 197 words had to be repeated before any new one, and
> "same as the review 197 words path, I want to move forward."

## What was actually happening

`buildMixedSession` (`app/js/store.js`) put every due review ahead of every
new word, on purpose — a deliberate fix from earlier in this project (a
review backlog used to get crowded out by new words, meaning it could never
drain). That fix solved the wrong side of the trade for a two-person app with
thousands of words already met: a big, entirely healthy backlog of
correctly-held words could now block new intake for as long as it kept
refilling, which is the exact complaint above. Today's screen said so in as
many words: "197 words you have met before are ready to come round again …
so they come before new words."

## The fix keeps two kinds of "due" apart

The app already tracks a card just gotten wrong separately from the Leitner
box — `store.recordMistake`/`listMistakes`, the data behind the existing
"Your mistakes" screen, cleared the moment that exact card is answered right
again. That distinction turns out to be exactly the one asked for:

- **A mistake** — a card currently in that list — still comes back
  reliably, same as before. It is a gap actively closing, not a queue.
- **A held word** — correctly answered, its Leitner box interval simply
  elapsed — is no longer treated as equally urgent. `buildMixedSession` now
  draws only a random slice of these, capped at `STALE_REVIEW_SAMPLE` (20%)
  of whatever is currently due, re-rolled every time a session is built.

Fill order is now: mistakes, then new words up to the daily target, then the
throttled slice of held words fills whatever is left. A session can
legitimately come back shorter than its limit when the backlog is being
rationed rather than padded out — the same way a spent new-word budget
already caps a session short today, so this isn't a new kind of behaviour,
just a second reason for it.

Every screen that draws from the scheduler (`#/session`, `#/vocab`,
`#/verbs`, `#/phrases`, `#/grammar`) now fetches the mistake list and passes
it through — `buildSession`'s single-deck callers name their deck with a new
`deckId` option so the mistake lookup does not need `card.deck`, which
stays `undefined` for a single-deck plan exactly as before.

## The copy

Today's and Learn's own "what to do now" logic both put reviews first with
the removed line built in — Learn's had its own, independent copy of the
same policy ("Words already met come before new ones … New words
otherwise"), not just Today's. Both now check new words first, and the
"N words are ready to come round again … so they come before new words"
framing is gone from both — replaced with copy that describes what actually
happens now (a mistake comes straight back; everything else "only now and
then"), not a promise about volume that the throttle would immediately
contradict. The Learn hub's own "are you moving forward" panel made a
similar claim in its own words ("reviews are taken before new words … once
enough are in circulation intake stops," with a simulated "settles around
150 words met" figure) — also rewritten, since intake is no longer gated by
the backlog at all now, only by the existing daily new-word cap.

## Verification

`npm test` 215 (rewrote the two srs.test.js cases that asserted the old
review-first priority, since asserting the opposite is now correct; added
four new ones covering the mistake guarantee under real randomness, the ~20%
cap measured directly, that the throttled slice actually varies run to run,
and the mistake/new/throttled fill order together) · `validate` PASS ·
`npm run walkthrough` 45/45 · direct in-browser checks of both Today branches
(new words available, and new words spent) and the Learn hub's own button,
all rendering the new copy with zero console errors.

---

# Follow-up 11 — an activity for the dative

> "Create an activity to learn the dative and those type of grammar skills"

## What the drill could not teach

Follow-up 9 added 96 mined `dative` items, and they are good items — a real
LOD sentence with the pronoun gapped out, four real dative pronouns to choose
from. But every one of them is a *recognition* question, and a recognition
question about a closed set of seven words can be answered by ear, or by
elimination, without ever learning the thing underneath.

The thing underneath is a table. `ech` becomes `mir`; `mir` becomes `eis`;
`du` becomes `dir` and `dir` becomes `iech`. Until those pairs are known, a
dative card is a guess between four plausible-looking words — and the deck
has no exercise that asks for the pair directly.

## Change the word — `#/forms`

So the activity asks the transformation itself: **`bei` + `ech` → ?**, four
real dative pronouns to pick from. That is the production form of the skill,
which is what the interview actually needs and what the gapped card cannot
test.

Two design decisions carry most of the value:

**The English gloss is always shown.** `mir` and `dir` sit on *both* sides of
this table — `mir` is "we" going in and "to me" coming out, `dir` is "to you"
from `du` while "you (plural)" produces `iech` — and `si` is both "she"
(→ hir) and "they" (→ hinnen). Without a gloss, several cards would be
genuinely unanswerable rather than hard. A test asserts the gloss is present
and that the two `si` rows are told apart by it.

**Every card ends on a real sentence.** Answering reveals LOD's own sentence
using that exact preposition and pronoun — `dës Decisioun gouf vun **eis**
alleguer guttgeheescht` — pulled from the mined items, so the table never
stays an abstraction and no example here is written. This also decides the
question set: the pool is built *from* those items, so a pair only becomes a
card if the corpus attests it — 20 of the 28 the table allows, covering all
seven pronouns and all four prepositions. One card per preposition+pronoun
pair, because "bei eis" is mined fifteen times and fifteen cards with the
same answer is not a round.

The round ends on the whole eight-row table, rendered from the same constant
the questions are asked from, so the summary and the questions cannot
disagree.

Same optional-game shape as Pairs, Gender Sort and What is this?: counts for
the streak, never touches the Leitner boxes. The grammar deck's own dative
cards remain the scheduled version of this material.

## The one thing here that cannot be mined

Every other Luxembourgish claim in this app traces to a corpus record. This
one cannot: LOD attests "bei mir" but nowhere says that `mir` is what `ech`
becomes. The mapping is a grammatical claim, taken from the same cited source
the `dative` guide topic already uses, and that makes it exactly the kind of
thing that can rot silently. So `pipeline/test/forms.test.js` checks it from
three directions: every form in the table is attested by a shipped deck; the
table's dative side is asserted **deep-equal** to the `DATIVE_PRONOUNS` set
`build-grammar.js` mines against, so the game and the miner cannot drift
apart; and every generated question is traced back to the mined item it came
from, with its sentence pieces and answer compared field by field.

## Also fixed

Two labels had gone stale when Follow-up 9 added three kinds: Learn's grammar
row and Today's grammar step both still described the deck as "gender, the
n-rule, adjective endings, the perfect". Both now name the newer kinds too.

## Verification

`npm test` 223 (8 new in `pipeline/test/forms.test.js`) · `validate` PASS ·
`npm run walkthrough` 46/46, the new step asserting the transformation prompt,
the disambiguating gloss, four options, the revealed LOD sentence and the
closing table · screenshots checked by eye, including the Learn hub's grammar
row now carrying three tiles at iPhone width with no horizontal overflow ·
`sw.js` → `v32`, with `js/screens/forms.js` added to the precache list.

---

# Follow-up 12 — the podcast catalogue, and a look at LuxASR

> "Make the podcasts better organized by level and also add a filter to remove
> the audio only. Also, keep track of the ones where I pass the quiz to avoid
> doing it twice. Finally, look if we can use this tool for the speaking
> https://luxasr.uni.lu"

## 200 episodes in first-appearance order

The index did group by level, but by *first appearance in the feed* — so the
headings came out in whatever order INLL happened to publish that month, and
B1 above A1 was the normal case. That is a cosmetic problem at 10 episodes and
a real one at 200, which is what the catalogue now holds: A1 17, A1-A2 4,
A2 111, A2-B1 7, B1 48, B1-B2 4, and 9 unlabelled.

**Levels are now CEFR-ordered** (`LEVEL_ORDER`), each section headed with its
count, newest episode first inside it. A section shows 8 rows before offering
"Show all N" — A2 alone is 111 episodes, and rendering every one of them is a
scroll rather than a list.

**Three filters, and they persist.** Level chips, "With questions", "Hide
passed". A hyphenated level answers to either band — "A2-B1" is genuinely
useful at both, so it appears under both filters rather than needing a third
chip. The choices are saved to settings: a filter you have to reapply on every
visit is not a filter.

**"With questions" is the audio-only filter.** 84 of the 200 episodes have no
INLL transcript, and questions are quoted verbatim from one, so those can only
ever be listened to. Note that only a hard `hasTranscript === false` counts —
an index built before that field existed leaves it undefined, which is unknown
rather than absent, and dropping those would hide real episodes.

## Passing an episode, tracked without new storage

Finishing an episode's questions already wrote an attempt tagged
`topic: 'podcast'` with the episode id — so "have I done this one" was
answerable from data the app was already keeping, and needed no schema change,
no migration and no second source of truth. `episodeScores()` reads the
attempt log and keeps the **best** attempt per episode, so passing once is
permanent: going back for a re-listen and scoring worse cannot un-pass it.

A passed episode shows ✅, a "passed" chip and its score on the row, so a
re-listen is a choice rather than a rediscovery — and "Hide passed" takes them
out of the way entirely. Deliberately, only a *pass* is hidden: an episode
scored 1/10 stays in the list, because it still needs doing.

## LuxASR — usable, but not something to switch on unasked

`https://luxasr.uni.lu` is the University of Luxembourg's Luxembourgish ASR
(Peter Gilles, Dept. of Humanities). It is a genuinely good fit for the one
thing this app cannot currently do: the speaking module records an answer and
hands it to a human partner to score, so between recordings there is no
feedback at all. An ASR transcript would show the learner what a machine
actually heard, which is the closest thing to pronunciation feedback available
without a teacher.

The API is a queued job flow: `POST /asr2` with the raw file bytes in the body
(not multipart) and an `audio/*` content type, then poll
`GET /v3/asr/jobs/<id>` and fetch `GET /v3/asr/jobs/<id>/result`.

Four things decide how it should be used, and together they say "offer it,
do not default to it":

1. **Permission is required first.** Access is explicitly limited, and the
   published terms say to contact them before integrating into another
   application. That is an email to peter.gilles@uni.lu, not a code change,
   and it has to happen before any traffic is sent.
2. **It uploads the learner's voice.** Recordings currently never leave the
   phone except to the partner. Sending them to a third party — even a
   university one that states it stores nothing and processes only in
   Luxembourg — is a different privacy posture and needs an explicit opt-in,
   not a default.
3. **It cannot be a score.** This repo already tells the learner that
   Luxembourgish speech recognition is poor, in the note under machine-made
   podcast questions. A transcript is evidence to read, never a mark; the
   existing human-scored rubric stays the assessment.
4. **It would route through the Worker.** A browser calling a third-party host
   directly runs into CORS, and the Worker already exists for exactly this
   shape of call.

There is also `unilux/whisper-medium-v1-luxembourgish` on Hugging Face — the
same group's model, self-hostable, which sidesteps the permission and privacy
questions at the cost of running it somewhere.

Nothing was built for this. It is a feasibility answer, and the next step is
an email rather than a commit.

## Verification

`npm test` 229 (14 new in `pipeline/test/podcasts.test.js`, including a check
against the real 200-episode catalogue that every level label the live feed
uses is one the CEFR ordering knows — the assertion that catches INLL
inventing a new label) · `validate` PASS · `npm run walkthrough` 48/48, two new
steps driving the filters, their persistence across a reload, and a passed
episode being marked and then hidden · `sw.js` → `v33`.

---

# Follow-up 13 — measuring the Luxembourgish ASR model

> "Try the huggingface path"

Follow-up 12 flagged `unilux/whisper-medium-v1-luxembourgish` as the
self-hostable alternative to LuxASR's hosted service, which needs written
permission before use. This is what happened when it was actually run.

## The test set was already on disk

The model card publishes no WER, so the number had to be measured. It could
be measured honestly rather than eyeballed because the repo already mirrors
2,263 LOD example recordings and knows the exact transcript of each — the
`example.lb` string the vocabulary deck ships. That is 2,010 (audio,
known-correct text) pairs with no annotation needed, and the reference text
is the corpus's own rather than something written for the test.

`research/asr/benchmark.py` samples 30 of them with a fixed seed, transcribes,
and scores against the corpus text. Full output and per-clip results are in
`research/asr/`.

## It is much better than its reputation

| metric | value |
| --- | --- |
| WER | **3.8%** |
| CER | **1.5%** |
| exact-match sentences | 22 / 30 |
| speed | **0.20× realtime** on 4 CPU cores |

3.8% is a good ASR by any standard, and it contradicts the note this app
currently shows under machine-made podcast questions. That note stays anyway,
for the reason below.

**The number is an upper bound.** Every clip is a studio recording of a
prepared sentence read by a professional dictionary voice. A learner's answer
is a phone mic, a room, hesitation and a foreign accent. Nothing here measures
that, and that is the only case the speaking module has. 3.8% means "good at
clean Luxembourgish", not "this is what a learner would see".

## How it fails matters more than how often

One error decided the recommendation on its own:

```
truth: ech muss nach haut iwwer eng wichteg saach mat der schwätzen
heard: ech muss haut nach iwwer eng wichteg saach mat der schwätzen
```

The model silently reordered two words into a more frequent pattern. This app
teaches word order, reserves session slots for it, and the interview is scored
on it. An ASR that quietly normalises a learner's correct ordering — or
invents a wrong one — is actively harmful feedback on the exact criterion that
matters most. The other misses (`d'e-maile` → `déi maile`, `pijen` → `pigen`)
are elided articles and rare words coming out as plausible neighbours, which
read as the learner's mistake unless the transcript is heavily caveated.

## Why it is still not shippable

- **Not on HF's serverless Inference API.** The model's API record returns
  `inferenceProviderMapping: null` (128 downloads a month), so there is no
  free hosted endpoint. A dedicated Inference Endpoint is a paid always-on
  instance.
- **0.20× realtime on CPU** — a 60-second answer is about five minutes of
  compute. GPU-only in practice.
- **Nowhere in this stack to run it.** Static Pages site plus a Cloudflare
  Worker; a Worker cannot hold 2.9 GB of PyTorch, and Workers AI ships base
  Whisper rather than this fine-tune.

So the open-weights path trades LuxASR's permission-and-privacy problem for a
hosting bill. Still nothing built — but the question is now answered with a
number instead of a guess, and `whisper-small`/`base` are the obvious next
measurement if this gets pursued.

## Verification

No app code changed. `npm test` 229 and `validate` PASS are unaffected;
`research/` is documentation and a standalone script, outside the build.

---

# Follow-up 14 — the whole Whisper family, and a surprise

Follow-up 13 measured `unilux/whisper-medium-v1-luxembourgish` at 3.8% WER but
ruled it out on cost: 0.20× realtime on CPU means a GPU, and there is nowhere
in a Pages-plus-Worker stack to put one. The obvious next question was whether
a smaller sibling is fast enough to change that. All four were run on the
identical 30 clips and seed.

| model | params | WER | exact | speed |
| --- | --- | --- | --- | --- |
| tiny | 39 M | 10.3% | 14/30 | 4.10× realtime |
| **base** | **74 M** | **5.0%** | **22/30** | **2.33× realtime** |
| small | 244 M | 8.8% | 17/30 | 0.77× realtime |
| medium | 769 M | 3.8% | 22/30 | 0.20× realtime |

**`base` is the answer.** 1.2 points of WER behind `medium`, the *same* 22/30
exact sentences, and **11.6× faster** — comfortably above realtime, so a
60-second answer transcribes in about 26 seconds on four CPU cores.

**`small` is worse than `base` on both axes**, which model size does not
predict: three times slower and nearly twice the error rate. That is a
property of these checkpoints rather than of Whisper, and it is exactly the
kind of thing that only shows up if you measure instead of assuming the middle
option is the safe one.

## A scoring bug found by reading the output

`tiny` and `small` write the elided article with a space — `d' zäit` where the
corpus writes `d'zäit`. Scored naively that is two word errors on a four-word
sentence. It was costing `tiny` six points of WER and `small` seven, entirely
for an orthographic convention that no learner-facing use of a transcript
would care about. Corrected in `norm()` and re-scored from the saved outputs
without re-running anything; `base` and `medium` were unaffected because they
already close it up. Both figures are published in `research/asr/README.md`
rather than only the flattering one.

## What it does not change

`base` makes the same word-order error `medium` did — silently reordering
`muss nach haut` into the more frequent `muss haut nach` — and one of its
other misses is an n-rule difference (`en` → `den`). Those are two of the
things this app most explicitly teaches and marks. So the conclusion holds at
every size: a transcript is evidence for the learner to read, never a score,
and the screen would have to say that a strange-looking word may be the
machine rather than them.

## What it does change

The hosting objection is gone. At ~145 MB and 2.33× realtime, `base` runs on a
small CPU box with no GPU — and in-browser via `transformers.js`/ONNX becomes
plausible rather than fanciful, which would remove the privacy question
entirely by keeping the recording on the phone. That last part is **not
tested**: it needs an ONNX export of this fine-tune and a measurement on a
phone-class device, with mobile Safari the likely obstacle.

Still nothing built, and still no app code touched. But the open question is
now a specific experiment rather than a shrug.

## Verification

No app code changed. `npm test` 229 and `validate` PASS are unaffected;
`research/` is documentation plus a standalone script, outside the build.

---

# Follow-up 15 — the browser is out, and vanilla Whisper is useless

> "Yes, I'm ok if the grading is not exact in all cases it's just an
> indication"

That settles the *product* question — a transcript shown as an indication, not
a grade — so this round was purely about where the model can run. Two
experiments, both negative, and both worth having run.

## ONNX in the browser: out on payload

`unilux/whisper-base` exported to ONNX cleanly (max logit diff 5e-05). int8
quantisation does not get it small enough:

| file | int8 |
| --- | --- |
| encoder | 23.2 MB |
| decoder | 79.1 MB |
| decoder_with_past (needed for usable speed) | 75.9 MB |
| **minimum / realistic total** | **106 MB / 182 MB** |

An offline-first PWA cannot ask a phone for a 106–182 MB download — and that
is before asking whether WASM inference would hit realtime on a phone CPU,
which at 2.33× on four desktop cores it almost certainly would not.

(Export note worth keeping: `decoder_model_merged.onnx` barely shrinks under
dynamic quantisation, 315 MB → 314.8 MB, because its weights sit inside `If`
subgraphs that `quantize_dynamic` skips. The unmerged pair quantises properly,
which is why the realistic figure carries two decoders.)

## Cloudflare Workers AI: out on accuracy

Workers AI ships `@cf/openai/whisper`, which would have been almost free to
adopt — the app already runs a Worker. On the same 30 clips:

| model | WER | exact |
| --- | --- | --- |
| `unilux/whisper-base` (fine-tuned) | **5.0%** | 22/30 |
| `openai/whisper-base` (vanilla) | **143.5%** | 0/30 |

143.5% is worse than useless: it renders Luxembourgish as German-ish
approximations (`d'geessen` → `gesen`, `d'relève` → `trelef`). The
Luxembourgish fine-tune is not an optimisation, it is the entire thing — so
there is no general-purpose ASR to lean on, and either the University of
Luxembourg hosts it or we do.

## What is left

| path | verdict |
| --- | --- |
| In-browser ONNX | out — payload |
| Workers AI | out — 143.5% WER |
| Self-host `base` on a CPU box | works — 5.0% at 2.33× realtime, no GPU, but a server to pay for |
| **LuxASR** | **the practical one** — free, purpose-built; needs written permission first |

LuxASR's own accuracy is deliberately **not** measured here. Their terms ask
that you make contact before integrating, and sending either a learner's audio
or a batch of corpus clips to evaluate it is the wrong side of that line to
cross unasked.

So the blocker is now an email rather than engineering, and
`research/asr/permission-email.md` is a ready-to-send draft — including the
benchmark numbers above, which make the case that the ask is informed and the
volume is tiny.

The app-side design is already settled by the earlier error analysis: an
opt-in "what did the machine hear?" panel beside the recording, labelled
approximate, with the human INLL rubric untouched as the actual score. Nothing
is built until there is somewhere to send the audio.

## Verification

No app code changed. `npm test` 229 and `validate` PASS are unaffected;
`research/` is documentation plus standalone scripts, outside the build.

---

# Follow-up 16 — wrong translations in Pairs, and the bug underneath

> "Check that the word translations in the card match games are correct. There
> are some that seem wrong"

They were. `awer = "nevertheless"` on level 5, `ginn = "there is"` on level 6,
`no = "nearby"`, `fir = "to"`, `puer = "pair"`, `grad = "degree"`.

## Not bad glosses — the wrong sense of a homograph

Every one of those is a real LOD gloss. The problem is that LOD ships
homographs as separate entries — `awer` is an adverb ("nevertheless") *and* a
conjunction ("but"); `no` an adjective ("nearby") *and* a preposition
("after") — and a Pairs tile can only carry one. The pool deduplicates by
lemma and kept whichever sorted first, which turned out to be the rarer sense
almost every time.

## Why it was almost every time

Not luck. `pipeline/lib/frequency.js` counts surface forms against
`lexicon.forms`, and that index maps a spelling to exactly **one** entry id.
So the entire corpus count for a spelling lands on one homograph and its
sibling is left on zero:

| lemma | kept sense | freq | dropped sense | freq |
| --- | --- | --- | --- | --- |
| `fir` | "to" (CONJ) | 1035 | **"for"** (PREP) | 0 |
| `un` | "to be on" (ADV) | 315 | **"on"** (PREP) | 0 |
| `no` | "nearby" (ADJ) | 209 | **"after"** (PREP) | 0 |
| `mee` | "May" (SUBST) | 84 | **"but"** (CONJ) | 0 |

The artefact wins the sort every time, so the everyday sense is the one that
loses. `no` is the sharpest case: it is one of the four dative prepositions
the app now teaches, while Pairs was calling it "nearby".

## What was fixed, and what was not

Fixing the count properly needs the corpus part-of-speech tagged, which this
pipeline cannot do honestly — and re-ranking the deck would reshuffle the
learning path under a half-finished learner. So the **display choice** is
corrected instead: `PREFERRED_GLOSS` in `screens/pairs.js` names the eight
lemmas where the automatic pick is plainly wrong for a beginner.

Two properties make that safe rather than a patch:

- **It selects, it does not author.** Every value is a gloss LOD already
  publishes for that lemma, and a test fails if one stops matching a shipped
  entry — so a content rebuild cannot silently revert the fix.
- **It changes the sense, never the position.** The representative entry is
  chosen up front and separately from the ordering walk, so a lemma still
  enters the pool where its earliest entry earned. `awer` is still #22. A test
  pins that too, because otherwise every level's contents shift and a
  half-finished player's next board is not the one they were promised.

Left alone deliberately: `hunn` ("to have", not "cock"), `iessen` ("to eat",
not "meal"), `an` ("and", not "in") and the rest of the 31 collisions, where
the automatic pick is already the sense a learner wants.

`un` and `mee` now drop out of the pool entirely rather than appear wrong —
their correct glosses ("on", "but") are already taken by `op` and `awer`, and
two tiles reading the same English is the unmatchable board the pool has
always refused to build.

## Only Pairs was affected

Checked rather than assumed: the vocabulary drill ships each sense as its own
card (`AWER1` and `AWER2` are both in the deck, at stages 1 and 4), so it
teaches both and is correct as it stands. Pairs is the only screen that has to
make one tile stand for a whole spelling.

## Still open

The frequency mis-attribution itself. It does not only affect glosses — it
sets `stage` and `rank`, so `fir` = "for" currently sits at rank 1972 and is
introduced near the end of the deck, while `fir` = "to" is taught at rank 6.
Correcting it means either POS-tagging the corpus or splitting an ambiguous
count across its candidates, and either way it reorders the path. Worth doing,
worth doing on purpose, and not folded into a translation fix.

## Verification

`npm test` 238 (3 new in `pairs.test.js`: every override is a real LOD gloss,
the preferred sense is what reaches the board, and choosing a sense does not
move the word) · `validate` PASS · `npm run walkthrough` 49/49 · `sw.js` → `v36`.

---

# Follow-up 17 — the Arcade: fifteen sentence functions, off the clock

> "Create a new tab called arcade which has different games with the goal to
> learn the standard sentence structures: 1. Naming, 2. Existence, 3. Having,
> 4. Wanting, 5. Requesting, 6. Ability & permission, 7. Need & obligation,
> 8. Liking (note: many languages invert this, e.g. Spanish me gusta, so learn
> the structure, not the translation), 9. Opinion, 10. Location, 11. Question
> words, 12. Quantity & price, 13. Negation, 14. Time reference,
> 15. Connectors. These games do not count on the daily goals so are also not
> limited to a number of words per day or anything."

## Functions, not translations

The brief already contains the hard part, in the note on Liking. A sentence
function is what you are *trying to do* — ask for something, say where it is,
say you like it — and the shape that performs it is different per language.
Luxembourgish has no verb "to like" at all: you take an ordinary verb and drop
`gär` in late, near where `net` goes. So a pattern in `app/js/arcade/patterns.js`
names the function and points at whatever the corpus actually uses to do it,
rather than translating an English sentence.

That matters most where the two diverge, which is exactly where a learner who
translates gets stuck.

## Everything is corpus-attested, including what is missing

The corpus-lock rule applies unchanged: no Luxembourgish was written for this
tab. Each of the fifteen points at material already shipped and already
proven — phrase frames (attested ≥ 8× in LOD's own examples, or
`build-phrases.js` fails the build), grammar items mined from real sentences,
and vocabulary lemmas. `arcade.test.js` re-resolves every one of those
references against the shipped decks, so a pattern cannot quietly start
pointing at something that stopped shipping.

Eight new frames were needed and all eight cleared the threshold on their own:

| frame | gloss | attestations |
| --- | --- | --- |
| `gëtt et` | is there | 66 |
| `do ass` | there is (over there) | 45 |
| `well ech` | because I | 44 |
| `kann ech` | can I | 25 |
| `ech fannen` | I think, I find | 15 |
| `kanns du` | can you | 12 |
| `ech wäert` | I will | 11 |
| `hei ass` | here is | 8 |

The phrase deck is now 42 frames. `ech wäert` also needed a new `future`
group — it had been mis-filed under `past`, which is the wrong half of the
timeline to teach it from.

### Four functions the corpus does not write the expected way

Audited before designing, not discovered after:

| wanted | occurrences | what is taught instead |
| --- | --- | --- |
| `ech heeschen` ("my name is") | 0 | `ech sinn` / `dat ass`, which is what LOD uses |
| `wou ass` ("where is") | 2 | the answering side (`hei ass`, `do ass`) plus `wou` itself |
| `et gëtt keen` ("there isn't") | 0 | the negation rule, where `net` and `keen` are actually drilled |
| a verb "to like" | — | where `gär` lands in the clause |

Each of those patterns carries a `gap` note that says so on screen. A learner
told "the corpus does not write it this way" has learned something true; one
handed an invented frame has learned something wrong.

## Four card shapes, chosen by what the pattern is

Not every function is the same kind of thing, so one mechanic would have been
wrong for most of them:

- **`frame`** — which opener performs this? The frame, chosen against three
  other real frames. One per frame, not per example: the answer is the frame,
  so three examples of it is the same question three times.
- **`build`** — the same sentence reassembled from word tiles, one per short
  example (3–8 words; a fourteen-word sentence rebuilt from tiles is a memory
  test, not a structure one). This is what keeps the thin patterns playable —
  `existence` has only two attested frames, and without their other examples a
  round would be four cards long.
- **`item`** — a mined grammar card, for the patterns whose whole content is a
  rule: liking (38 items), negation (180), quantity (150), time (300).
- **`word`** — for the four functions that *are* a closed set of words. Question
  words is six words; there is nothing else to teach about it. Each is gapped
  out of its own LOD example and the pattern's other words are the wrong
  answers, so choosing between `wien`/`wat`/`wou` is the exercise.

Two things the `word` shape had to get right. It gaps on whole words, so `no`
does not cut itself out of `noen` and leave a card whose own answer will not
fit the hole. And it only asks about words the pattern glosses *uniquely* —
`keen` and `keng` are both "no", and a card with two right answers is not a
card. Both are pinned by tests.

Fourteen of the fifteen fill the full eight-card round. `wanting` reaches six,
because its three frames all carry long examples; six is asserted as the floor
so a pattern cannot decay into a tile on the index that disappoints.

## The tab costs nothing to play

This is the whole reason it exists — somewhere to keep going once the day's
new-word budget is spent — so it is enforced rather than intended:

- **no Leitner writes.** Nothing here moves a review schedule, so playing for
  an hour cannot push a word's next review past what the evidence supports.
- **no daily-goal counting.** Rounds never reach `runSession`, so the day's
  card count is untouched.
- **no new-word cap.** Nothing consults `newWordsLeftToday`, so the Arcade
  still works when the budget is gone.

`touchStreak` is the one number it moves, like Pairs and Gender Sort, because
it is genuinely practice.

Asserted twice, deliberately. `arcade.test.js` reads `screens/arcade.js` and
fails if the words `recordLearnResult`, `recordLearnSession`,
`newWordsLeftToday`, `buildSession`, `buildMixedSession` or `runSession`
appear — a property of what is *not* called, which only the source can show.
And the walkthrough plays a full round in the browser between two reads of
Today's card count and fails if the number moved.

## Two bugs the verification caught

**`wordBank` was called without its pool.** `wordBank(answer, pool)` draws its
decoy tiles from `pool` and nowhere else — precisely so no plausible-looking
Luxembourgish is invented to pad a bank. Calling it one-argument threw `pool is
not iterable` on the first build card the walkthrough reached. Fixed by giving
each build question the other example sentences of its own pattern, which keeps
the wrong tiles in the same register as the right ones; a test now fails if a
build question ships without a pool, or with a pool sentence that is not from
the phrase deck.

**Seven tabs overflowed at 360px.** Adding Arcade made it seven, and
`grid-auto-columns: 1fr` refuses to shrink a column below its label, so the bar
ran off the side on the narrowest common Android width while looking correct on
the iPhone viewport everything else is measured at. Fixed with
`minmax(0, 1fr)`, `min-width: 0` and an ellipsis on the label; the walkthrough
now measures the bar at 393, 360 and 320px.

## Pre-existing, not introduced

The walkthrough exits non-zero on `main` today and did so before this change:
thirteen listening clips referenced by `listening.json` were never mirrored to
`app/assets/audio/`, and are absent from the audio manifest too, so they 404.
Confirmed against a stashed tree — the same thirteen, same count. Fixing it
needs a LOD fetch, so it is left as its own piece of work rather than folded in
here.

## Verification

`npm test` 248 (10 new in `arcade.test.js`) · `validate` PASS · `npm run
walkthrough` 52/52 steps, run twice for flakiness · `sw.js` → `v37`.

---

# Follow-up 18 — the Arcade at A1, and why the obvious filter does not work

> "The problem with the arcade games is that I'm supposed to build a sentence
> but there are many words I still don't know. Can we make it A1 only for now?"

Fair, and the build card is the specific offender. "Which opener says this?"
shows a sentence; "build the sentence" makes you *produce* every word in it. A
structure exercise only teaches structure when the words are already known —
one unknown noun and it silently becomes "guess the noun".

## The obvious implementation is backwards, and measurably wrong

The natural approach is to take each word of a sentence, resolve it through
`lexicon.forms` to a LOD id, and ask whether that id is banded A1. It does not
work, and the way it fails is instructive.

`lexicon.forms` is single-valued — one id per spelling, with verified spellings
winning the slot — so a homograph resolves to whichever record won the index
rather than to the sense actually used in the sentence. Measured against the
phrase deck it sends `vu` to `FEDEREIERTSTAATEVUMIKRONESIEN1` and `ass` to
`ASS1`, and rejects **125 of 126** example sentences, almost entirely on words
a beginner reads on day one: `ass`, `huet`, `et`, `de`, `eng`, `am`. It is the
same mis-attribution documented in Follow-up 16, in a new place.

So `pipeline/lib/a1.js` goes the other way — **forward expansion**. Start from
the lemmas that *are* A1 and expand each into every surface form LOD publishes
for it, by inverting the lexicon (id → all spellings). Under-inclusive when a
form's index entry points at a homograph — that form is simply not added — but
never wrong in the direction that matters, which is calling an A2 word A1.

| step | forms known |
| --- | --- |
| A1 vocabulary lemmas | 872 |
| \+ every lexicon form resolving to an A1 id (this is what supplies the inflection tables) | 3,594 |
| \+ A1 verb conjugations from the verb deck | 3,622 |
| \+ plurals and participles LOD records on A1 entries, the shipped frames, the pronoun/dative/possessive tables | **3,667** |

Two smaller things mattered more than expected. The clitic article had to be
split off — `d'Post` is the A1 noun `Post` behind `d'`, and one token made it
unknown. And the shipped phrase frames count as known by construction: `ech
hätt` is not an unknown word on a card whose entire subject is `ech hätt`.

What survives the filter is genuinely A2+ content vocabulary — `Schnéi`,
`Conservatoire`, `Tomatenzooss`, `däischter`, `fitness-zenter`. That is the
right boundary, and it is the evidence the filter is calibrated rather than
merely strict.

## Decided at build time, shipped as a boolean

The lexicon and corpus are 22 MB and will never reach a phone, so the question
is answered once in `pipeline/build-a1.js` — a new last step of `npm run
content` — and the answer travels as `a1` on the row and on each example.

| deck | rows readable at A1 |
| --- | --- |
| phrases (frames) | 42 / 42 |
| phrase example sentences | 26 / 126 |
| grammar | 453 / 3,371 |
| vocab | 889 / 2,049 |
| verbs | 111 / 365 |

One correction found while writing it: the row flag first folded a frame's
three examples into the frame, which marked `ech hunn` unreadable because one
of its examples mentions a Conservatoire. A frame and each of its examples are
*separate cards*, so they get separate flags. A second: the spelling test alone
promoted A2 words whose form collides with an A1 one — 945 vocabulary rows
"readable" against 889 actually banded — so for decks that carry LOD's own CEFR
tag, the tag now has the last word.

## What the filter costs, and the card that pays for it

Filtering examples takes real material away, and two patterns cannot fill a
full round without it: `existence` has two attested frames whose LOD examples
are both above A1, and `quantity` has one. Rather than pad those rounds with
the sentences just rejected, the round is short and says so —
"a short round — only 4 of these stay inside A1 words."

The rest stay playable because of one new card shape. A **`meaning`** card runs
the frame backwards: read the Luxembourgish opener, choose what it does. It is
free under the filter — the options are English and the single Luxembourgish
string is the frame itself — and it is genuine recognition practice rather than
filler.

| | A1 filter on | off |
| --- | --- | --- |
| patterns filling 6+ cards | 13 / 15 | 15 / 15 |
| patterns filling 4+ cards | 15 / 15 | 15 / 15 |

## "For now" is a switch, not a deploy

The ask said *for now*, so Settings carries **Arcade → A1 words only**,
defaulting on and read the same way `sound` is (unset means on, because the
thing was asked for). Turning it off restores LOD's harder examples and every
pattern goes back to a full round.

## Verification

`npm test` 257 (6 new in `a1.test.js`, 4 new in `arcade.test.js`) · `validate`
PASS · `npm run walkthrough` 54/54 · `sw.js` → `v38`.

The load-bearing test sweeps 20 shuffles of all fifteen patterns and asserts
that **every** string a card shows — answers, gapped sentences, decoy tiles and
wrong options alike — passes `isA1Sentence`. It checks ~10,000 strings and
finds zero leaks; a distractor full of unknown words is as discouraging as a
bad card, so the wrong answers are in scope too. A second test asserts the
stamp is present and non-degenerate, so a rebuild that skips `build:a1` fails
loudly instead of silently un-filtering the tab.
