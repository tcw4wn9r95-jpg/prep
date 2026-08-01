# Working agreements

## Git

**Commit and push straight to `main`. Do not open pull requests.**

Requested 2026-08-01. This is a private two-person tool with no other
committers, and every PR so far has been merged unreviewed — the branch and
review step only delayed the deploy. Push to `main` when the work is verified.

`main` is the deploy trigger, so a push is a release:

| workflow | fires on | publishes |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | push to `main` | `/app` → GitHub Pages |
| `.github/workflows/deploy-worker.yml` | push to `main` touching `worker/` | the Cloudflare Worker |

So verify **before** pushing, not after. `npm test` is the minimum;
`npm run walkthrough` too when the change touches `/app`.
