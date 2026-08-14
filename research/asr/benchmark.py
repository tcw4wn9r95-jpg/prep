"""
Does unilux/whisper-medium-v1-luxembourgish transcribe well enough to show a
learner what a machine heard?

Measured against ground truth rather than judged by eye: every clip here is a
LOD example recording the app already mirrors, and its exact transcript is the
`example.lb` string in vocab.json. So the reference is the corpus's own text,
not something written for this test.
"""
import json, random, re, sys, time
import av, numpy as np

N = int(sys.argv[1]) if len(sys.argv) > 1 else 30
MODEL = sys.argv[2] if len(sys.argv) > 2 else "unilux/whisper-medium-v1-luxembourgish"

def decode(path):
    container = av.open(path)
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks = []
    for frame in container.decode(audio=0):
        for out in resampler.resample(frame):
            chunks.append(out.to_ndarray().reshape(-1))
    container.close()
    return np.concatenate(chunks).astype(np.float32) / 32768.0

def norm(text):
    """Lowercase, strip punctuation, collapse space. Deliberately does NOT
    strip accents: ë/é are the letters, and an ASR that loses them is wrong in
    a way this app would care about."""
    text = text.lower().replace("’", "'")
    text = re.sub(r"[^\w\s'-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

def edits(a, b):
    """Levenshtein over token lists."""
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]

pairs = json.load(open("/tmp/gt_all.json"))
random.Random(20260727).shuffle(pairs)
sample = pairs[:N]

print(f"model: {MODEL}")
print(f"clips: {len(sample)} LOD recordings with known transcripts\n", flush=True)

from transformers import pipeline
t0 = time.time()
pipe = pipeline("automatic-speech-recognition", model=MODEL, device="cpu")
print(f"loaded in {time.time() - t0:.0f}s\n", flush=True)

ref_words = hyp_errors = 0
ref_chars = char_errors = 0
exact = 0
rows = []
total_audio = total_compute = 0.0

for i, item in enumerate(sample, 1):
    audio = decode(item["file"])
    total_audio += len(audio) / 16000
    t = time.time()
    out = pipe(audio, generate_kwargs={"language": "lb", "task": "transcribe"})
    total_compute += time.time() - t

    truth, guess = norm(item["text"]), norm(out["text"])
    tw, gw = truth.split(), guess.split()
    e = edits(tw, gw)
    ref_words += len(tw); hyp_errors += e
    ce = edits(list(truth), list(guess))
    ref_chars += len(truth); char_errors += ce
    if truth == guess: exact += 1
    rows.append({"level": item["level"], "truth": truth, "guess": guess, "wer": e / max(len(tw), 1)})
    print(f"[{i}/{len(sample)}] WER {e/max(len(tw),1):.0%}", flush=True)

wer = hyp_errors / ref_words
cer = char_errors / ref_chars
print("\n" + "=" * 70)
print(f"WER            {wer:.1%}   (word error rate, lower is better)")
print(f"CER            {cer:.1%}   (character error rate)")
print(f"exact match    {exact}/{len(sample)} sentences")
print(f"speed          {total_audio/total_compute:.2f}x realtime on 4 CPU cores")
print(f"               {total_compute/len(sample):.1f}s per clip, clips avg {total_audio/len(sample):.1f}s")
print("=" * 70)

for level in ("A1", "A2"):
    sub = [r for r in rows if r["level"] == level]
    if sub:
        print(f"{level}: mean per-sentence WER {sum(r['wer'] for r in sub)/len(sub):.1%} over {len(sub)} clips")

print("\n--- best ---")
for r in sorted(rows, key=lambda r: r["wer"])[:3]:
    print(f"  truth: {r['truth']}\n  heard: {r['guess']}\n")
print("--- worst ---")
for r in sorted(rows, key=lambda r: -r["wer"])[:4]:
    print(f"  truth: {r['truth']}\n  heard: {r['guess']}\n")

json.dump(rows, open("/tmp/asr_rows.json", "w"), ensure_ascii=False, indent=1)
