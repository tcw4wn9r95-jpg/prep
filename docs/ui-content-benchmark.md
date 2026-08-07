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
