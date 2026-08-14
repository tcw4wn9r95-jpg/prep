# Can Luxembourgish ASR give a learner feedback on their speaking?

The speaking module records an answer and hands it to a human partner to
score, so between recordings there is no feedback at all. An automatic
transcript would at least show the learner what a machine heard, which is the
closest thing to pronunciation feedback available without a teacher.

Two candidates: **LuxASR** (`luxasr.uni.lu`, the University of Luxembourg's
hosted service, which requires written permission before integrating) and the
same group's **open-weights Whisper fine-tunes** on Hugging Face. This
directory measures the second — all four sizes.

## Why this could be measured rather than guessed at

The repo already mirrors 2,263 LOD example recordings, and the exact
transcript of each is the `example.lb` string in `app/data/vocab.json`. So
there are 2,010 (audio, known-correct text) pairs sitting on disk — a real
ground-truth test set that needed no annotation, whose reference text is the
corpus's own rather than something written for this test.

`benchmark.py` samples 30 of them with a fixed seed (identical clips for every
model) and scores against the corpus text.

## Results — 30 clips, 4 CPU cores, 2026-08-11

| model | params | WER | CER | exact | speed | per clip |
| --- | --- | --- | --- | --- | --- | --- |
| tiny | 39 M | 10.3% | 3.7% | 14/30 | **4.10× realtime** | 0.7 s |
| **base** | **74 M** | **5.0%** | **1.8%** | **22/30** | **2.33× realtime** | **1.3 s** |
| small | 244 M | 8.8% | 3.3% | 17/30 | 0.77× realtime | 3.9 s |
| medium | 769 M | 3.8% | 1.5% | 22/30 | 0.20× realtime | 14.6 s |

**`base` is the result worth having.** At 74 M parameters it scores 5.0% WER —
1.2 points behind `medium` — with the *same* 22/30 exact-match count, while
running **11.6× faster** and comfortably above realtime. A 60-second exam
answer transcribes in about 26 seconds on four CPU cores, which is the
difference between "needs a GPU" and "runs on a cheap box".

**`small` is worse than `base`, which is not what model size predicts.** It is
both three times slower and nearly twice the error rate. That non-monotonicity
is a property of these particular checkpoints, not of Whisper — the `small`
fine-tune looks weaker than its siblings. Worth knowing before reaching for
the middle option on the assumption that bigger is safer.

### One scoring correction, applied to all four

`tiny` and `small` emit the elided article with a space — `d' zäit` where the
corpus writes `d'zäit`. Scored naively that is two word errors on a four-word
sentence, and it cost `tiny` six points of WER and `small` seven. It is an
orthographic convention rather than a mishearing, and no learner-facing use of
a transcript would care, so `norm()` now closes it up. `base` and `medium`
were unaffected — they already write it closed. Raw and corrected figures:

| model | WER raw | WER corrected |
| --- | --- | --- |
| tiny | 16.4% | 10.3% |
| base | 5.0% | 5.0% |
| small | 15.3% | 8.8% |
| medium | 3.8% | 3.8% |

## The accuracy number is an upper bound

Every clip is a studio recording of a prepared sentence read by a professional
dictionary voice. A learner's answer is a phone microphone, a room,
hesitation, false starts and an accent the model was not trained on. Nothing
here measures that case, and it is the only case the speaking module has.
Read 5.0% as "`base` is genuinely good at clean Luxembourgish", not as the
error rate a learner would see.

## How it fails still decides whether it is safe to show

Size does not fix this. From `base`, the best speed/accuracy trade:

```
truth: ech muss nach haut iwwer eng wichteg saach mat der schwätzen
heard: ech muss haut nach iwwer eng wichteg saach mat der schwätzen
```

Two words silently reordered into a more frequent pattern. This app teaches
word order, reserves session slots for it, and the interview is scored on it.
An ASR that quietly normalises a learner's correct ordering — or invents a
wrong one — is actively harmful feedback on the criterion that matters most.
`medium` made the same error on the same clip.

```
truth: duerch d'e-maile ginn ëmmer manner bréiwer geschriwwen
heard: duerch d'eeméile ginn ëmmer manner bréiwer geschriwwen

truth: säit de moie bléist en äiskale wand
heard: säit de moie bléist den äiskale wand
```

Rare words and unstressed function words come out as plausible neighbours —
and note the second one is an *n-rule* difference, another thing this app
explicitly teaches and marks.

So the conclusion from the first round stands whatever the model size: a
transcript is evidence for the learner to read, never a score, and it needs
saying on screen that a strange-looking word may be the machine rather than
them.

## Round 3 — the browser is out, and the fine-tune is mandatory

Two experiments closed the remaining questions.

### In-browser: ruled out on payload

`base` exported to ONNX cleanly (max logit diff 5e-05), but int8 quantisation
does not get it small enough for a phone to download:

| file | int8 |
| --- | --- |
| encoder | 23.2 MB |
| decoder | 79.1 MB |
| decoder_with_past (needed for usable speed) | 75.9 MB |
| tokenizer + config | 3.9 MB |
| **minimum, no KV cache** | **106 MB** |
| **realistic, with KV cache** | **182 MB** |

An offline-first PWA cannot ask for a 106–182 MB download, and that is before
asking whether WASM inference on a phone CPU would hit realtime — it almost
certainly would not, given 2.33× on four desktop cores.

One export note worth keeping: `decoder_model_merged.onnx` barely shrinks
under dynamic quantisation (315 MB → 314.8 MB) because its weights sit inside
`If` subgraphs that `quantize_dynamic` skips. The unmerged pair quantises
properly, which is why the realistic figure ships two decoders.

### Vanilla Whisper on Luxembourgish: unusable

Cloudflare Workers AI ships `@cf/openai/whisper`, which would have been a
near-zero-effort path since this app already runs a Worker. Measured on the
same 30 clips:

| model | WER | exact |
| --- | --- | --- |
| `unilux/whisper-base` (fine-tuned) | **5.0%** | 22/30 |
| `openai/whisper-base` (vanilla) | **143.5%** | 0/30 |

143.5% WER — worse than useless; it transcribes Luxembourgish into
German-ish approximations (`d'geessen` → `gesen`, `d'relève` → `trelef`). The
Luxembourgish fine-tune is not an optimisation, it is the whole thing, and
Workers AI is therefore not an option.

## Where that leaves it

Four paths were on the table. Three are now closed by measurement:

| path | verdict |
| --- | --- |
| In-browser (ONNX/transformers.js) | **out** — 106–182 MB download, and WASM on a phone would not hit realtime |
| Cloudflare Workers AI | **out** — vanilla Whisper is 143.5% WER on Luxembourgish |
| Self-host `base` on a CPU box | **works** — 5.0% WER at 2.33× realtime, no GPU, but a server to run and pay for |
| **LuxASR** (`luxasr.uni.lu`) | **the practical one** — free, purpose-built, no model hosting; needs written permission first |

The fine-tune being mandatory (5.0% vs 143.5%) is what removes the easy
option: there is no general-purpose ASR to lean on, so either the University
of Luxembourg hosts it or we do.

LuxASR is the same group's own service and almost certainly runs a model at
least as good as `medium` (3.8%). Its accuracy is **not** measured here: their
terms ask that you contact them before integrating, and sending a learner's
audio — or a batch of corpus clips — to evaluate it felt like the wrong side
of that line to cross unasked.

So the next step is an email, not a commit. Draft in `permission-email.md`.

Whichever host wins, the app-side design is already settled by the error
analysis above: an **opt-in** "what did the machine hear?" panel on the
speaking screen, showing the transcript as evidence next to the recording,
labelled as approximate, with the human rubric untouched as the actual score.

## Reproducing

Not part of `npm test` — needs Python and downloads model weights.

```sh
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers av numpy
python3 research/asr/benchmark.py 30 unilux/whisper-base-v1-luxembourgish
```

`benchmark.py` expects `/tmp/gt_all.json`, the (audio, text) pairs; build it
from the shipped deck with:

```sh
python3 -c "
import json, os
vocab = json.load(open('app/data/vocab.json'))['items']
pairs = [{'file': os.path.abspath(f\"app/assets/audio/{i['example']['audioId']}.m4a\"),
          'text': i['example']['lb'], 'level': i.get('level')}
         for i in vocab
         if (i.get('example') or {}).get('audioId') and i['example'].get('lb')
         and os.path.exists(f\"app/assets/audio/{i['example']['audioId']}.m4a\")]
json.dump(pairs, open('/tmp/gt_all.json','w'), ensure_ascii=False)
print(len(pairs), 'pairs')
"
```

`results-<model>-2026-08-11.{txt,json}` hold the raw log and per-clip rows for
each run; `comparison.json` holds the raw-vs-corrected scoring table.
