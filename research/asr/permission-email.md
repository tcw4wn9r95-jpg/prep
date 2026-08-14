# Draft: permission request for LuxASR

LuxASR's terms ask that you contact them before integrating the service into
another application. This is a draft to send to **peter.gilles@uni.lu**.

Worth knowing before sending: it is a small non-commercial two-person study
tool, which is the easiest kind of request to say yes to. Be concrete about
volume — "a handful of 30–60 second clips a day" is the honest number and it
is tiny.

Adjust the personal details; everything else is accurate as written.

---

**Subject:** LuxASR API — permission request for a non-commercial Sproochentest study app

Dear Professor Gilles,

I am building a small, non-commercial app for my partner and myself to
prepare for the Sproochentest. It is a personal two-person tool, not a product
— no accounts, no advertising, nothing for sale, and no plans to distribute it
more widely.

The app has a speaking section: it records a spoken answer to an exam-style
question so the two of us can score each other against the official INLL
criteria. What is missing between those reviews is any immediate feedback, and
a transcript of what was actually said would give exactly that — not as a
mark, but so the speaker can see which words came out clearly and which did
not.

I would like to ask permission to send those recordings to the LuxASR API for
transcription. Concretely:

- **Volume:** a handful of clips a day at most, each roughly 30–60 seconds.
  Two users, no batch processing, no scraping.
- **Trigger:** only when the user explicitly taps to request a transcript. It
  would be off by default and opt-in, with the app stating plainly that the
  audio is sent to LuxASR at the University of Luxembourg.
- **Use of the result:** shown to the speaker as an indication of what a
  machine heard, labelled as approximate. It is never used as a score — the
  human scoring against the INLL criteria stays exactly as it is.
- **Attribution:** the app credits its sources on screen (it is built on LOD's
  open data, and links to INLL for the exam material and podcast). LuxASR
  would be credited the same way, in whatever wording you prefer.

Before writing to you I benchmarked your open-weights models from Hugging Face
against a ground-truth set built from LOD's own example recordings, to check
this was even worth asking about. On 30 clips,
`unilux/whisper-base-v1-luxembourgish` came out at 5.0% WER and
`whisper-medium` at 3.8%, while stock `openai/whisper-base` was at 143.5% —
which makes very clear how much the Luxembourgish fine-tuning is doing. Thank
you for publishing those openly; they are genuinely impressive.

If a hosted API is not something you can open up for this, I would equally
welcome a pointer on whether self-hosting one of the published checkpoints for
personal use is acceptable to you, and how you would like it credited.

Happy to share more detail on the app, or to keep within any rate limit or
conditions you would like to set.

With thanks and best regards,

[name]
[email]

---

## If the answer is no, or slow

Self-hosting `unilux/whisper-base-v1-luxembourgish` needs no permission — the
weights are published openly — and it measured 5.0% WER at 2.33× realtime on
four CPU cores, so a small always-on VM is enough. The cost is a server to run
and pay for, which is why it is the fallback rather than the plan.
