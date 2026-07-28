#!/usr/bin/env bash
#
# One-command bootstrap for the shared scoreboard Worker.
#
#   cd worker && npm install && npm run setup
#
# Idempotent: re-running it reuses the existing KV namespace and only asks for
# secrets you choose to change. Nothing here writes a secret to disk — the KV
# namespace id is the only thing that lands in wrangler.toml, and that is not
# sensitive.

set -euo pipefail

cd "$(dirname "$0")"

WRANGLER="npx --yes wrangler"
TOML="wrangler.toml"
BINDING="DUEL"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m✓  %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- 1. account

step "Checking your Cloudflare login"
if ! $WRANGLER whoami >/dev/null 2>&1; then
  warn "Not logged in to Cloudflare."
  echo "   Run this first, then re-run setup:"
  echo "     npx wrangler login"
  echo "   (or export CLOUDFLARE_API_TOKEN if you'd rather use a token)"
  exit 1
fi
$WRANGLER whoami | sed 's/^/   /'
ok "Logged in"

# ------------------------------------------------------------ 2. KV namespace

step "Setting up the $BINDING KV namespace"

current_id=$(node -e '
  const fs = require("fs");
  const toml = fs.readFileSync(process.argv[1], "utf8");
  const match = toml.match(/\[\[kv_namespaces\]\][^[]*/);
  const id = match && match[0].match(/^\s*id\s*=\s*"([^"]*)"/m);
  process.stdout.write(id ? id[1] : "");
' "$TOML")

if [ -n "$current_id" ] && [ "$current_id" != "REPLACE_WITH_YOUR_KV_NAMESPACE_ID" ]; then
  ok "wrangler.toml already points at namespace $current_id — reusing it"
else
  echo "   Creating a new namespace..."
  create_output=$($WRANGLER kv namespace create "$BINDING" 2>&1 || true)
  echo "$create_output" | sed 's/^/   /'

  # wrangler prints the new id in its "add this to your config" block. The id is
  # a 32-char hex string; fall back to listing namespaces if the output format
  # has drifted.
  new_id=$(printf '%s' "$create_output" | grep -oE '[0-9a-f]{32}' | head -n1 || true)

  if [ -z "$new_id" ]; then
    echo "   Couldn't read the id from that output — looking it up instead..."
    new_id=$($WRANGLER kv namespace list 2>/dev/null | node -e '
      let raw = "";
      process.stdin.on("data", (chunk) => { raw += chunk; });
      process.stdin.on("end", () => {
        const start = raw.indexOf("[");
        let list = [];
        try { list = JSON.parse(raw.slice(start, raw.lastIndexOf("]") + 1)); } catch {}
        const wanted = list.find((entry) => (entry.title ?? "").endsWith("-" + process.argv[1]));
        process.stdout.write(wanted ? wanted.id : "");
      });
    ' "$BINDING" || true)
  fi

  if [ -z "$new_id" ]; then
    warn "Could not determine the namespace id automatically."
    echo "   Run 'npx wrangler kv namespace list', copy the id for the"
    echo "   *-$BINDING namespace into $TOML, and re-run setup."
    exit 1
  fi

  node -e '
    const fs = require("fs");
    const [file, id] = process.argv.slice(1);
    const toml = fs.readFileSync(file, "utf8");
    // Only the id inside the [[kv_namespaces]] block — never a stray match.
    const updated = toml.replace(/(\[\[kv_namespaces\]\][\s\S]*?^\s*id\s*=\s*)"[^"]*"/m, `$1"${id}"`);
    if (updated === toml) {
      console.error("could not rewrite the kv_namespaces id in " + file);
      process.exit(1);
    }
    fs.writeFileSync(file, updated);
  ' "$TOML" "$new_id"
  ok "Namespace $new_id created and written into $TOML"
  echo "   Commit that change so the id isn't lost — it is not a secret."
fi

# ------------------------------------------------------------ 3. CORS origin

step "Checking ALLOWED_ORIGIN"
origin=$(node -e '
  const fs = require("fs");
  const toml = fs.readFileSync(process.argv[1], "utf8");
  const match = toml.match(/^\s*ALLOWED_ORIGIN\s*=\s*"([^"]*)"/m);
  process.stdout.write(match ? match[1] : "");
' "$TOML")

if [ -z "$origin" ] || [[ "$origin" == *REPLACE* ]]; then
  warn "ALLOWED_ORIGIN is still a placeholder ($origin)."
  echo "   Set it to the origin the app is served from — scheme + host only,"
  echo "   no path — e.g. https://yourname.github.io"
  echo "   The app will be blocked by CORS until you do."
else
  ok "CORS pinned to $origin"
fi

# ----------------------------------------------------------------- 4. deploy

step "Deploying the Worker"
deploy_output=$($WRANGLER deploy 2>&1 | tee /dev/stderr)
worker_url=$(printf '%s' "$deploy_output" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -n1 || true)
ok "Deployed"

# ---------------------------------------------------------------- 5. secrets

step "Setting SHARED_SECRET"
echo "   This is the one string both phones type into Duel settings. The Worker"
echo "   refuses every request until it is set, and it travels in the URL — so"
echo "   make it long, and don't reuse it anywhere else."
printf '   Secret (leave blank to generate a random one): '
read -rs shared_secret
echo
if [ -z "$shared_secret" ]; then
  shared_secret=$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')
  echo
  bold "   Generated secret — copy it now, it is not stored anywhere:"
  bold "     $shared_secret"
  echo
fi
printf '%s' "$shared_secret" | $WRANGLER secret put SHARED_SECRET
ok "SHARED_SECRET set"

# ------------------------------------------------------- 6. optional AI keys

step "Optional: the AI endpoints"
echo "   /feedback (machine estimate) needs both OPENAI_API_KEY and"
echo "   ANTHROPIC_API_KEY. /explain (Learn sentence notes) needs only"
echo "   ANTHROPIC_API_KEY. Both return 503 until configured — everything"
echo "   else in the app works either way. Press enter to skip either one."

printf '   OPENAI_API_KEY (skip with enter): '
read -rs openai_key
echo
if [ -n "$openai_key" ]; then
  printf '%s' "$openai_key" | $WRANGLER secret put OPENAI_API_KEY
  ok "OPENAI_API_KEY set"
else
  echo "   Skipped — /feedback stays off."
fi

printf '   ANTHROPIC_API_KEY (skip with enter): '
read -rs anthropic_key
echo
if [ -n "$anthropic_key" ]; then
  printf '%s' "$anthropic_key" | $WRANGLER secret put ANTHROPIC_API_KEY
  ok "ANTHROPIC_API_KEY set"
else
  echo "   Skipped — /feedback and /explain stay off."
fi

# ------------------------------------------------------------------ 7. done

step "Done"
if [ -n "$worker_url" ]; then
  bold "Worker URL: $worker_url"
  echo
  echo "Check it (should return the scoreboard JSON):"
  echo "  curl \"$worker_url/state?k=YOUR_SECRET\""
else
  echo "Deployed. Find the URL in the wrangler output above, or in the"
  echo "Cloudflare dashboard under Workers & Pages."
fi
echo
echo "Then on both phones: open the app → Duel settings on the first screen →"
echo "enter that URL and the same secret."
echo
echo "Useful afterwards:"
echo "  npm run tail     # live request logs"
echo "  npm run deploy   # redeploy after a code change"
