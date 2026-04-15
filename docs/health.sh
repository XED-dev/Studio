#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory Health Check — Bootstrap-Wrapper (CLI-M4)
#
# Diese Datei ist ein dünner Bootstrap-Wrapper. Die eigentliche Health-Check-Logik
# lebt in der oclif-CLI unter /opt/infactory/infactory-cli-v2/.
#
# Was hier bleibt (in Bash):
#   - Cron-Setup (cron / uncron) — Plattform-Setup, gehört nicht in die CLI
#   - Bootstrap-Check: Wenn die CLI nicht installiert ist, klare Fehlermeldung
#
# Was an die CLI delegiert wird:
#   - Der eigentliche Health-Check (nginx + infactory-* + studio-payload-* + Health-Endpunkte)
#   - Auto-Fix-Modus (--fix)
#
# Verwendung (unverändert zur 1:1-Bash-Vorgängerversion):
#   curl -fsSL https://studio.xed.dev/health.sh | bash              # Pruefen
#   curl -fsSL https://studio.xed.dev/health.sh | bash -s fix       # Pruefen + Auto-Fix
#   curl -fsSL https://studio.xed.dev/health.sh | bash -s cron      # Crontab einrichten
#   curl -fsSL https://studio.xed.dev/health.sh | bash -s uncron    # Crontab entfernen
# ──────────────────────────────────────────────────────────────────────────────

set -uo pipefail

# ── Konfiguration ────────────────────────────────────────────────────────────

INSTALL_DIR="/opt/infactory"
INFACTORY_BIN="$INSTALL_DIR/infactory-cli-v2/bin/run.js"
NODE_BIN="/usr/bin/node"

LOG_FILE="/var/log/infactory-health.log"
CRON_COMMENT="# inFactory Health Check"
CRON_CMD="curl -fsSL https://studio.xed.dev/health.sh | bash -s fix"
CRON_LINE="*/5 * * * * $CRON_CMD >> $LOG_FILE 2>&1 $CRON_COMMENT"

# Colors (disable in cron/pipe)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  BLUE='\033[0;34m'
  YELLOW='\033[0;33m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED='' GREEN='' BLUE='' YELLOW='' BOLD='' NC=''
fi

ok()   { echo -e "  ${GREEN}✔${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
err()  { echo -e "  ${RED}✗${NC} $1" >&2; }
info() { echo -e "  ${BLUE}→${NC} $1"; }

ACTION="${1:-}"

# ══════════════════════════════════════════════════════════════════════════════
# Subcommand: cron — Crontab einrichten
# ══════════════════════════════════════════════════════════════════════════════

if [ "$ACTION" = "cron" ]; then
  echo ""
  echo -e "  ${BOLD}inFactory Health — Crontab Setup${NC}"
  echo ""

  if crontab -l 2>/dev/null | grep -q "infactory-health\|studio.xed.dev/health.sh"; then
    ok "Crontab bereits eingerichtet"
    crontab -l 2>/dev/null | grep "infactory-health\|studio.xed.dev/health.sh"
  else
    (crontab -l 2>/dev/null; echo ""; echo "$CRON_LINE") | crontab -
    ok "Crontab eingerichtet (alle 5 Minuten)"
    echo "  Log: $LOG_FILE"
  fi

  # Log-Datei vorbereiten
  touch "$LOG_FILE" 2>/dev/null || true
  chmod 644 "$LOG_FILE" 2>/dev/null || true

  echo ""
  echo "  Entfernen: curl -fsSL https://studio.xed.dev/health.sh | bash -s uncron"
  echo ""
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# Subcommand: uncron — Crontab entfernen
# ══════════════════════════════════════════════════════════════════════════════

if [ "$ACTION" = "uncron" ]; then
  echo ""
  echo -e "  ${BOLD}inFactory Health — Crontab entfernen${NC}"
  echo ""
  crontab -l 2>/dev/null \
    | grep -v "infactory-health" \
    | grep -v "studio.xed.dev/health.sh" \
    | crontab -
  ok "Crontab entfernt"
  echo ""
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# Default + fix: Delegation an die oclif-CLI
# ══════════════════════════════════════════════════════════════════════════════

# Bootstrap-Check: oclif-CLI muss installiert sein
if [ ! -f "$INFACTORY_BIN" ]; then
  err "inFactory CLI nicht gefunden: $INFACTORY_BIN"
  echo ""
  echo "  Zuerst installieren:"
  echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/install.sh | bash${NC}"
  echo ""
  exit 1
fi

if [ ! -x "$NODE_BIN" ]; then
  err "Node.js nicht gefunden: $NODE_BIN"
  exit 1
fi

# Argumente an die CLI durchreichen
ARGS=()
if [ "$ACTION" = "fix" ]; then
  ARGS=(--fix)
elif [ -n "$ACTION" ]; then
  err "Unbekannter Subcommand: $ACTION"
  echo "  Erlaubt: (kein Arg) | fix | cron | uncron"
  exit 1
fi

# exec → ersetzt den Bash-Prozess durch node, propagiert Exit-Code 1:1
exec "$NODE_BIN" "$INFACTORY_BIN" health "${ARGS[@]}"
