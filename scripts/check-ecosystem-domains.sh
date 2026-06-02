#!/usr/bin/env bash
#
# check-ecosystem-domains.sh — READ-ONLY ecosystem domain health check.
#
# Prints a "Domain | DNS Status | Resolved Target | HTTPS Status" table for
# every OperatorOS platform component domain and every module ecosystem
# domain. It performs NO infrastructure changes: no DNS edits, no redirects,
# no Cloudflare/Replit API calls. The only output is to the console.
#
# Domain source of truth: ecosystem.registry.json at the repo root
# (platformDomains.* + every module .ecosystemUrl, e.g. techdeck,
# tradeflowkit, torqueshed, ...). We parse it with `node` when available
# (most reliable). If node/JSON parsing is unavailable, we fall back to a
# minimal hard-coded domain list — NOTE: ecosystem.registry.json is the
# preferred source; the fallback only lists bare domain names and must not
# be treated as duplicated module metadata.
#
# Usage: bash scripts/check-ecosystem-domains.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$SCRIPT_DIR/../ecosystem.registry.json"

# ---------------------------------------------------------------------------
# Collect the domain list (bare hostnames, no scheme).
# ---------------------------------------------------------------------------
domains=()

if command -v node >/dev/null 2>&1 && [ -f "$REGISTRY" ]; then
  # Preferred path: read ecosystem.registry.json so the domain list can
  # never drift from the registry.
  while IFS= read -r line; do
    [ -n "$line" ] && domains+=("$line")
  done < <(node -e '
    const fs = require("fs");
    const reg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const out = [];
    const strip = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    for (const v of Object.values(reg.platformDomains || {})) out.push(strip(v));
    for (const m of reg.modules || []) if (m && m.ecosystemUrl) out.push(strip(m.ecosystemUrl));
    console.log([...new Set(out.filter(Boolean))].join("\n"));
  ' "$REGISTRY" 2>/dev/null)
fi

if [ "${#domains[@]}" -eq 0 ]; then
  echo "WARN: could not read ecosystem.registry.json via node; using minimal fallback list." >&2
  echo "      ecosystem.registry.json is the preferred source of truth." >&2
  # Minimal fallback — bare domain names only (NOT module metadata).
  domains=(
    operatoros.net
    app.operatoros.net
    api.operatoros.net
    admin.operatoros.net
    auth.operatoros.net
    docs.operatoros.net
    status.operatoros.net
    techdeck.operatoros.net
  )
fi

# ---------------------------------------------------------------------------
# Per-domain checks. Everything fails gracefully so one bad domain never
# aborts the run.
# ---------------------------------------------------------------------------
resolve_dns() {
  local host="$1" target=""
  if command -v dig >/dev/null 2>&1; then
    target="$(dig +short "$host" A 2>/dev/null | grep -v '\.$' | head -n1)"
    [ -z "$target" ] && target="$(dig +short "$host" CNAME 2>/dev/null | head -n1)"
  fi
  if [ -z "$target" ] && command -v nslookup >/dev/null 2>&1; then
    target="$(nslookup "$host" 2>/dev/null | awk '/^Address: /{print $2; exit}')"
  fi
  printf '%s' "$target"
}

check_https() {
  local host="$1" code=""
  if command -v curl >/dev/null 2>&1; then
    code="$(curl -s -o /dev/null -I -L --max-time 10 -w '%{http_code}' "https://$host" 2>/dev/null)"
  else
    printf 'no-curl'
    return
  fi
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    printf 'unreachable'
  else
    printf '%s' "$code"
  fi
}

# ---------------------------------------------------------------------------
# Render table.
# ---------------------------------------------------------------------------
printf '%-34s | %-10s | %-28s | %-12s\n' "Domain" "DNS Status" "Resolved Target" "HTTPS Status"
printf '%-34s-+-%-10s-+-%-28s-+-%-12s\n' "$(printf '%.0s-' {1..34})" "$(printf '%.0s-' {1..10})" "$(printf '%.0s-' {1..28})" "$(printf '%.0s-' {1..12})"

for d in "${domains[@]}"; do
  target="$(resolve_dns "$d")"
  if [ -n "$target" ]; then
    dns_status="resolved"
  else
    dns_status="no-record"
    target="-"
  fi
  https_status="$(check_https "$d")"
  printf '%-34s | %-10s | %-28s | %-12s\n' "$d" "$dns_status" "$target" "$https_status"
done
