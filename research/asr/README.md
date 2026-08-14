# Can Luxembourgish ASR give a learner feedback on their speaking?

The speaking module records an answer and hands it to a human partner to
score, so between recordings there is no feedback at all. An automatic
transcript would at least show the learner what a machine heard, which is the
closest thing to pronunciation feedback available without a teacher.

Two candidates were looked at: **LuxASR** (`luxasr.uni.lu`, the University of
Luxembourg's hosted service) and **`unilux/whisper-medium-v1-luxembourgish`**
(the same group's open-weights model on Hugging Face). This directory holds
the measurement of the second one.

## Why this could be measured rather than guessed at

The repo already mirrors 2,263 LOD example recordings, and the exact
transcript of each is the `example.lb` string in `app/data/vocab.json`. So
there are 2,010 (audio, known-correct text) pairs sitting on disk — a real
ground-truth test set that needed no annotation. `benchmark.py` samples from
them with a fixed seed, transcribes, and scores against the corpus's own text.

## Result — 30 clips, 2026-08-11

| metric | value |
| --- | --- |
| WER (word error rate) | **3.8%** |
| CER (character error rate) | **1.5%** |
| exact-match sentences | 22 / 30 |
| A1 clips / A2 clips | 3.9% / 4.1% mean per-sentence WER |
| speed | **0.20× realtime** on 4 CPU cores (14.6 s to transcribe a 3.0 s clip) |

That accuracy is far better than Luxembourgish ASR's reputation, and better
than the note this app currently shows under machine-made podcast questions
("Luxembourgish speech recognition is poor").

**But the number is an upper bound, and the gap matters.** Every clip here is
a studio recording of a prepared sentence read by a professional dictionary
voice. A learner's answer is a phone microphone, a room, hesitation, false
starts and an accent the model was not trained on. Nothing here measures that
case, and it is the only case the speaking module cares about. Treat 3.8% as
"the model is genuinely good at clean Luxembourgish", not as the error rate a
learner would see.

## The three errors worth reading

Accuracy aside, *how* it fails decides whether it is safe to show:

```
truth: ech muss nach haut iwwer eng wichteg saach mat der schwätzen
heard: ech muss haut nach iwwer eng wichteg saach mat der schwätzen
```

The model silently reordered two words into a more frequent pattern. This app
teaches word order and marks it — an ASR that quietly "corrects" a learner's
correct ordering, or invents a wrong one, is worse than no feedback at all on
exactly the criterion the interview scores.

```
truth: duerch d'e-maile ginn ëmmer manner bréiwer geschriwwen
heard: duerch déi maile ginn ëmmer manner bréiwer geschriwwen

truth: sinn är pijen och gutt säfteg
heard: sinn är pigen och gutt säfteg
```

Elided articles (`d'`) and rarer words come out as plausible neighbours. Both
are the kind of slip that reads as the *learner's* mistake if the transcript
is presented without caveat.

## Why it still is not deployable as things stand

- **Not on Hugging Face's serverless Inference API.** The model's API record
  returns `inferenceProviderMapping: null` with 128 downloads a month, so
  there is no free hosted endpoint to call. A dedicated HF Inference Endpoint
  is a paid, always-on instance.
- **Too slow to self-host on CPU.** 0.20× realtime means a 60-second exam
  answer costs about five minutes of CPU. Practical only on a GPU.
- **Nowhere to run it.** The app is a static GitHub Pages site plus a
  Cloudflare Worker. A Worker cannot hold a 2.9 GB PyTorch model, and
  Workers AI ships base Whisper, not this Luxembourgish fine-tune.

So the open-weights path removes LuxASR's permission and privacy questions
and replaces them with a hosting bill. `whisper-small`/`base` variants exist
and would be faster; they were not measured, and would be the next thing to
try if this is pursued.

## Reproducing

Not part of `npm test` — it needs Python and downloads 2.9 GB of weights.

```sh
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers av numpy
python3 research/asr/benchmark.py 30
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
