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
