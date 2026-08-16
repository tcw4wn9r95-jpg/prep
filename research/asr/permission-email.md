# Permission request for LuxASR — ready to send

**To:** peter.gilles@uni.lu
**Subject:** LuxASR API — permission request for a non-commercial Sproochentest study app

Before sending, check the three bracketed items at the bottom. Everything else
is factually accurate as written and was verified against the repo and the
benchmark output in this directory.

---

Dear Professor Gilles,

I am writing to ask permission to use the LuxASR API, as your terms request
that integrations make contact first.

I have built a small Luxembourgish trainer that my partner and I use to
prepare for the Sproochentest. It has two users — the two of us — with no
accounts, no signup, no advertising and nothing for sale. The source is open
on GitHub and the app is served from GitHub Pages, so it is technically
reachable, but it is not promoted or offered as a product.

The app already has a speaking section: it records a spoken answer to an
exam-style question, and the two of us score each other against the INLL
criteria. What is missing is any feedback between those reviews. A transcript
of what was actually said would provide exactly that — not a mark, but a way
for the speaker to see which words came out clearly and which did not.

What I would like permission to do, concretely:

- **Volume.** A handful of clips a day at most, each roughly 30–60 seconds.
  Two users, requested one at a time, no batch processing and no bulk
  transcription of anything.
- **Trigger.** Only when the user explicitly taps to ask for a transcript. It
  would be off by default, and the app would state plainly that the audio is
  sent to LuxASR at the University of Luxembourg before anything is sent.
- **Use of the result.** Shown to the speaker as an indication of what a
  machine heard, labelled as approximate. Never used as a score: the human
  scoring against the INLL criteria stays exactly as it is. I would also flag
  on screen that an unexpected word may be the transcription rather than the
  speaker.
- **Attribution.** The app credits its sources on screen — it is built on
  LOD's open data and links to INLL for the exam material. LuxASR would be
  credited the same way, in whatever wording you prefer.

Before writing to you I benchmarked your open-weights models from Hugging Face
to check that this was worth asking about at all. I used LOD's own example
recordings as ground truth, since the corpus publishes the exact transcript of
each. Over 30 clips, `unilux/whisper-base-v1-luxembourgish` came out at 5.0%
word error rate and `whisper-medium` at 3.8%, while stock `openai/whisper-base`
scored 143.5% on the same audio. That last number is the reason I am writing
rather than reaching for a general-purpose service: the Luxembourgish
fine-tuning is doing all of the work. Thank you for publishing those models
openly — they are genuinely impressive, and better than I expected.

I note from the model cards that the flagship model behind the webservice and
the API is a larger one that stays closed, which is precisely why I would
rather send requests to your API than run one of the open checkpoints myself.

If opening the hosted API for this is not something you can do, I would
equally welcome your view on whether self-hosting one of the open checkpoints
for personal use is within the spirit of the open-mdw licence they carry, and
how you would like it credited in that case.

I am happy to work within any rate limit or conditions you would like to set,
and glad to share more detail on the app if it is useful.

With thanks and best regards,

Diego Casares Silva
dcasares.silva@gmail.com

---

## Check before sending

1. **Your name.** Written above as *Diego Casares Silva*, inferred from your
   git email and the app's own player name. Correct it if that is not how you
   would sign.
2. **"my partner and I".** The repo names the two users Diego and Diana.
   Change the wording if that is not the right description of the second user.
3. **The GitHub link.** Not included deliberately — add
   `https://github.com/tcw4wn9r95-jpg/prep` if you are happy for him to see
   the source. It supports the request (it shows the benchmark and that the
   app credits its sources), but it is your call.

## Why the email is honest about the repo being public

An earlier draft said the tool was not distributed. That is not true: both the
GitHub repository and the GitHub Pages deployment are publicly reachable —
checked, not assumed. Telling a university that it is private, and having him
find the public URL, would be a bad way to open. The wording above is accurate
and still an easy request to grant. (The project README also says "deployed
privately", which is worth correcting separately.)

## If the answer is no, or slow

**Self-hosting.** `unilux/whisper-base-v1-luxembourgish` is licensed
**open-mdw** (stated in the model card's frontmatter, though Hugging Face's
API does not surface it), so running it needs no permission. It measured 5.0%
WER at 2.33× realtime on four CPU cores — a small always-on VM, no GPU. The
cost is a server to run and pay for, which is why it is the fallback.

**Meanwhile, today.** The model cards note that LuxASR ships official iOS and
Android apps. If you want to hear what a machine makes of your speaking
answers before any of this is built, you can record in the app and run the
clip through theirs by hand. No integration, no permission needed, and it will
tell you quickly whether the feature is worth having at all.

**One thing the model cards changed.** The flagship model behind the
webservice and API is larger and closed-source, so LuxASR's accuracy is
probably better than the 3.8% I measured on `medium` — which is an argument
for the API over self-hosting, and worth knowing before settling for the
fallback.
