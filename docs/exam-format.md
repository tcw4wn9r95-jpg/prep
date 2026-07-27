# The exam, as INLL publishes it

Everything here comes from material the Institut national des langues publishes on
[inll.lu/fr/sproochentest](https://www.inll.lu/fr/sproochentest/). Nothing from those
documents is reproduced in this repo — this file records *structure and numbers*, which is
what the app needs in order to be shaped like the real thing.

Checked 2026-07-27. Re-check before trusting it: INLL revises these.

## Two parts, assessed separately

| | level | length | format |
| --- | --- | --- | --- |
| Compréhension orale (Verstoen) | **B1** | ~35 min | 3 audio documents, 16 MCQ |
| Expression orale (Schwätzen) | **A2** | ~10 min | interview, then image description |

**Pass rule:** over 50% on the speaking part, **or** over 50% overall. Both routes are
modelled in the app because they imply different revision.

## Listening: 5 + 7 + 4

From the published answer key (`b1-hv_testbeispill_leisungen-2023.pdf`):

| exercise | document | questions | options |
| --- | --- | ---: | --- |
| 1 | *En Auszuch aus den Noriichte verstoen* — a news extract | 5 | A/B/C, one A/B |
| 2 | *E Gespréich verstoen* — a conversation | 7 | A/B/C, one A/B |
| 3 | *Méi e laangt Gespréich verstoen* — a longer conversation | 4 | A/B/C, two A/B |

**16 questions, all multiple choice.** There are no open answers, contrary to what the
project brief originally assumed.

## Speaking: two tasks

**2a — Interview.** The examiners offer **two** topics; the candidate picks one.

The published topic sheets (e.g. `DOK-56_Theema-_Schlof-an-Entspanung`) are ~21 numbered
questions in three phases, and this is the structure the app's interview screen imitates:

1. general opening — *"fänke mir ganz generell un"*
2. the past — *"Da schwätze mir elo fir d'éischt iwwert d'Vergaangenheet"*
3. the present situation — *"komme mir dann elo zu Ärer aktueller Situatioun"*

Two details worth copying: questions **branch** on a yes/no answer (8A/9A versus 8B/9B),
and most carry **alternate phrasings** the examiner can choose between.

**2b — Image description.** Three images are offered; the candidate describes one.

## The evaluation grid

From `Bewaertung2.png`. Four criteria, each scored 0–5, so **20 points maximum**:

| criterion | Luxembourgish description |
| --- | --- |
| **Lexik** | Bandbreet vum Vocabulaire vum Niveau A2; adequate Gebrauch |
| **Morphosyntax** | Bandbreet vun de grammatesche Strukturen vum Niveau A2; adequate Gebrauch |
| **Phoneetik** | Sech kloer a fléissend ausdrécken |
| **Aufgabenerfëllung** | An engem Gespréich interagéieren, an eng Beschreiwung maachen, sech verständlech a kohärent ausdrécken |

Two examiners score independently, and their marks are **not** weighted equally:

- **Interlocuteur** (Gespréichspartner) gives one global mark — **20%**
- **Assessor** (Bewäerter) fills the grid above — **80%**

`app/js/store.js` implements exactly this in `reviewPercent()`.

## What the app does with this

- `pipeline/build-items.js` generates listening sets on the 5+7+4 shape.
- The speaking screen offers two topics for 2a and three images for 2b, with a 30-second
  prep timer and questions revealed one at a time.
- The review screen is the four-criterion grid with the 20/80 weighting.
- The readiness screen shows speaking % and overall % against the 50% line.

**What it does not do:** reproduce INLL's audio, images, or question text. Practice content
is generated from the LOD open corpus, and the app links to INLL's official samples so the
real thing is one tap away.
