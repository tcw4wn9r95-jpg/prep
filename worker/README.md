# /worker

The shared scoreboard, and nothing else. Cloudflare Worker + KV.

All progress lives in IndexedDB on each phone. This holds only what has to be
shared: both players' totals, the weekly seed, and speaking submissions waiting
to be scored. **If this is down, solo practice is unaffected** — the app queues
writes locally and pushes them on the next sync.

## Deploy

```bash
npx wrangler kv namespace create DUEL     # paste the id into wrangler.toml
npx wrangler secret put SHARED_SECRET     # the same string both phones enter
# set ALLOWED_ORIGIN in wrangler.toml to your Pages origin
npx wrangler deploy
```

Then open the app, tap through to **Duel settings** on the first screen, and
enter the Worker URL and the same secret on both phones.

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
