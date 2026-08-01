# /worker

The shared scoreboard, and nothing else. Cloudflare Worker + KV.

All progress lives in IndexedDB on each phone. This holds only what has to be
shared: both players' totals, the weekly seed, and speaking submissions waiting
to be scored. **If this is down, solo practice is unaffected** — the app queues
writes locally and pushes them on the next sync.

## Deploy

Two ways in, doing the same thing. Use CI if you don't have a machine with a
terminal to hand — it needs nothing but a browser.

### From CI (no computer needed)

`.github/workflows/deploy-worker.yml` runs the whole bootstrap on a GitHub
runner. Add these under **Settings → Secrets and variables → Actions**:

| secret | required | what it is |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | scoped token, see below |
| `CLOUDFLARE_ACCOUNT_ID` | if your token can see more than one account | from the Cloudflare dashboard sidebar |
| `DUEL_SHARED_SECRET` | yes | the string both phones type into Duel settings |
| `OPENAI_API_KEY` | no | enables `/feedback` |
| `ANTHROPIC_API_KEY` | no | enables `/feedback` and `/explain` |

Create the token at **My Profile → API Tokens → Create Token** using the
*Edit Cloudflare Workers* template — that grants Workers Scripts: Edit and
Workers KV Storage: Edit, which is all this needs. Don't use the Global API
Key; it has no scope limit.

Then run the **Deploy Worker** workflow from the Actions tab. It resolves (or
creates) the `DUEL` KV namespace, deploys, and pushes the secrets in — none of
which touch the repo or the build log. The Worker URL is printed in the run
summary. It's idempotent: re-run it any time. After the first run it also
redeploys automatically on any push to `main` that touches `worker/`.

### From a terminal

```bash
cd worker
npm install
npx wrangler login   # or export CLOUDFLARE_API_TOKEN
npm run setup
```

`npm run setup` does the whole bootstrap: creates the `DUEL` KV namespace and
writes its id into `wrangler.toml`, deploys, then prompts for `SHARED_SECRET`
(offering to generate one) and the optional AI keys. It is idempotent — re-run
it any time; it reuses the existing namespace. Commit the KV id it writes back;
that id is not a secret. Secrets are piped straight to `wrangler secret put`
and never written to disk.

Doing it by hand instead:

```bash
npx wrangler kv namespace create DUEL     # paste the id into wrangler.toml
npx wrangler secret put SHARED_SECRET     # the same string both phones enter
npx wrangler deploy
```

### Either way, afterwards

`ALLOWED_ORIGIN` in `wrangler.toml` is the origin the app is served from —
scheme and host only, no path. It is set to the GitHub Pages origin; change it
if you move the app to a custom domain. Note that CORS pins the origin, not the
path: it covers every project site on that `github.io` account, which is the
finest granularity CORS offers.

Then open the app, tap through to **Duel settings** on the first screen, and
enter the Worker URL and the same secret on both phones.

### Running it locally

```bash
cp .dev.vars.example .dev.vars   # gitignored; set a throwaway SHARED_SECRET
npm run dev
```

`wrangler dev` uses a local, simulated KV, so local runs never touch the pair's
real scoreboard. `npm run tail` streams live request logs from the deployed
Worker; `npm run deploy` pushes a code change.

### Optional: the machine estimate

`POST /feedback/:id` transcribes a speaking recording with Whisper and grades
it against the INLL rubric with Claude — the "Layer 2, instant machine
feedback" from the brief. It is entirely optional and off by default:

```bash
npx wrangler secret put OPENAI_API_KEY      # for Whisper transcription
npx wrangler secret put ANTHROPIC_API_KEY   # for grading the transcript
npx wrangler deploy
```

Without both secrets set, `/feedback/:id` returns `503` and the app's "Get a
machine estimate" button shows a plain "not configured" message — nothing
else about the app changes. This calls two paid third-party APIs per tap
(costs are per-request, not per-user), so it is opt-in on the client, not
automatic, and results are cached in KV so re-opening the same recording
doesn't re-bill it.

### Optional: sentence explanations in Learn

`POST /explain` gives a short, learner-focused explanation of a Learn
vocab/verb example sentence — not a translation, but a note on word order, an
idiom, or a false friend. It reuses `ANTHROPIC_API_KEY` above; no new secret.
Unlike the machine estimate, the result is the same for everyone who sees a
given sentence, so it's cached in KV by content and never re-billed once any
one player has seen it. Without `ANTHROPIC_API_KEY` set, it returns `503` and
the "Explain this sentence" button shows the same plain "not configured"
message.

### Optional: podcast comprehension questions

`POST /episode-questions` turns one INLL podcast episode into listening questions. It reuses
`ANTHROPIC_API_KEY`, and falls back to `OPENAI_API_KEY` for Whisper on episodes that publish
no transcript.

This has to live in the Worker rather than the app, and not because of the key: a podcast
feed and a transcript file send no CORS headers, so a browser cannot read either one. A
device API key would let the app call Claude and give it nothing to read.

The generation rule is enforced, not requested. The model writes the English question stem
and then **quotes** the options — every option must be a span copied verbatim from the
transcript. `verbatimOnly()` checks that server-side before anything is cached and drops any
option that is not literally in the text; if the *correct* answer fails the check the whole
question goes, rather than silently promoting a distractor. That keeps the project's founding
rule — no model ever authors Luxembourgish — true at runtime as well as at build time.

Results are cached in KV by episode id with **no expiry**, like `/explain`: an episode is
paid for once and the second listener gets it free. Cost is roughly $0.06 of Whisper for a
ten-minute episode plus a few cents of Claude, once, ever — and nothing at all for episodes
whose transcript INLL already publishes.

## Endpoints

| method | path | purpose |
| --- | --- | --- |
| GET | `/state` | both players' totals, per-topic breakdown, pending submissions |
| GET | `/seed` | the Monday-anchored Woch-Duell seed |
| POST | `/attempt` | a finished listening set (idempotent by attempt id) |
| POST | `/review` | a peer score; deletes the audio it scored |
| PUT | `/submission/:id` | upload a recording (≤20 MB) |
| GET | `/submission/:id` | fetch a recording to score |
| POST | `/feedback/:id` | optional machine estimate (Whisper + Claude); `503` if unconfigured |
| POST | `/explain` | optional Learn sentence explanation (Claude); `503` if unconfigured |
| POST | `/episode-questions` | optional podcast comprehension questions (Claude, + Whisper when needed); `503` if unconfigured |

## Security notes, stated plainly

- Auth is a **shared secret in a query parameter**. That is proportionate for
  two known users and no signup, but it means the secret is in the URL on every
  request: serve only over https, and do not reuse the value anywhere else.
- The secret is compared in constant time, and the Worker **refuses all traffic
  until `SHARED_SECRET` is set** rather than defaulting to open.
- CORS is pinned to `ALLOWED_ORIGIN`. A wildcard would let any site the pair
  visits read their scoreboard.
- Recordings expire after 30 days, and are deleted as soon as they are scored.
- If `/feedback/:id` is configured, a tap on "Get a machine estimate" sends
  that one recording's audio to OpenAI and the transcript to Anthropic —
  outside the pair's own Worker, unlike everything else here. It only happens
  on an explicit tap, never automatically.
- If `/explain` is configured, a tap on "Explain this sentence" sends that
  sentence's text (already public LOD content, no recordings involved) to
  Anthropic. Same explicit-tap-only rule.
