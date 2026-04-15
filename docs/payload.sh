#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory Payload — Bootstrap-Wrapper (CLI-M4)
#
# Delegiert vollständig an die oclif-CLI unter /opt/infactory/infactory-cli-v2/.
# Keine Bash-Logik mehr für Setup, Status, Update, Admin-Management.
#
# Command-Mapping (Bash → oclif):
#   payload.sh                                    → infactory site update
#   payload.sh setup <tld>                        → infactory site create <tld>
#   payload.sh status                             → infactory site status
#   payload.sh create-admin <tld> <email>         → infactory admin create <tld> <email>
#   payload.sh admin list <tld>                   → infactory admin list <tld>
#   payload.sh admin set-role <tld> <e> <role>    → infactory admin set-role <tld> <e> <role>
#   payload.sh admin reset-password <tld> <e>     → infactory admin reset-password <tld> <e>
#   payload.sh admin delete <tld> <email>         → infactory admin delete <tld> <email>
#
# Verwendung (unverändert zur Bash-Vorgängerversion):
#   curl -fsSL https://studio.xed.dev/payload.sh | bash                    # Install/Update
#   curl -fsSL https://studio.xed.dev/payload.sh | bash -s setup <tld>     # Per-Site Setup
#   curl -fsSL https://studio.xed.dev/payload.sh | bash -s status          # Status
#   bash /tmp/payload.sh create-admin <tld> <email>                        # Admin anlegen
#   bash /tmp/payload.sh admin list <tld>                                  # User-Liste
# ──────────────────────────────────────────────────────────────────────────────

set -uo pipefail

# ── Konfiguration ────────────────────────────────────────────────────────────

INSTALL_DIR="/opt/infactory"
INFACTORY_BIN="$INSTALL_DIR/infactory-cli-v2/bin/run.js"
NODE_BIN="/usr/bin/node"

# Colors (disable in pipe)
if [ -t 1 ]; then
  RED='\033[0;31m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED='' BOLD='' NC=''
fi

err() { echo -e "  ${RED}✗${NC} $1" >&2; }

# ── Bootstrap-Check ──────────────────────────────────────────────────────────

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

# ── Command-Dispatch ─────────────────────────────────────────────────────────

# Helper: exec CLI mit Delegation (ersetzt Bash-Prozess → Exit-Code propagiert 1:1)
infactory() {
  exec "$NODE_BIN" "$INFACTORY_BIN" "$@"
}

ACTION="${1:-}"

case "$ACTION" in
  # ── Site-Management ──
  "")
    # Kein Arg = install/update (site update ist idempotent: Install ODER Update)
    infactory site update
    ;;

  setup)
    if [ -z "${2:-}" ]; then
      err "Verwendung: bash -s setup <tld>"
      echo -e "     Beispiel: ${BOLD}bash /tmp/payload.sh setup steirischursprung.at${NC}"
      exit 1
    fi
    infactory site create "$2"
    ;;

  status)
    infactory site status
    ;;

  # ── Admin-Commands ──
  create-admin)
    if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
      err "Verwendung: bash -s create-admin <tld> <email>"
      echo -e "     Beispiel: ${BOLD}bash /tmp/payload.sh create-admin steirischursprung.at admin@example.com${NC}"
      exit 1
    fi
    infactory admin create "$2" "$3"
    ;;

  admin)
    SUBCMD="${2:-}"
    case "$SUBCMD" in
      list)
        if [ -z "${3:-}" ]; then
          err "Verwendung: bash -s admin list <tld>"
          exit 1
        fi
        infactory admin list "$3"
        ;;
      set-role)
        if [ -z "${3:-}" ] || [ -z "${4:-}" ] || [ -z "${5:-}" ]; then
          err "Verwendung: bash -s admin set-role <tld> <email> <admin|user>"
          echo -e "     Beispiel: ${BOLD}bash /tmp/payload.sh admin set-role steirischursprung.at user@example.com admin${NC}"
          exit 1
        fi
        infactory admin set-role "$3" "$4" "$5"
        ;;
      reset-password)
        if [ -z "${3:-}" ] || [ -z "${4:-}" ]; then
          err "Verwendung: bash -s admin reset-password <tld> <email>"
          echo -e "     Beispiel: ${BOLD}bash /tmp/payload.sh admin reset-password steirischursprung.at admin@example.com${NC}"
          exit 1
        fi
        infactory admin reset-password "$3" "$4"
        ;;
      delete)
        if [ -z "${3:-}" ] || [ -z "${4:-}" ]; then
          err "Verwendung: bash -s admin delete <tld> <email>"
          exit 1
        fi
        infactory admin delete "$3" "$4"
        ;;
      *)
        err "Unbekannter admin-Subcommand: ${SUBCMD:-(kein)}"
        echo ""
        echo "  Verfügbare admin-Commands:"
        echo "    bash /tmp/payload.sh admin list <tld>"
        echo "    bash /tmp/payload.sh admin set-role <tld> <email> <admin|user>"
        echo "    bash /tmp/payload.sh admin reset-password <tld> <email>"
        echo "    bash /tmp/payload.sh admin delete <tld> <email>"
        echo ""
        exit 1
        ;;
    esac
    ;;

  *)
    err "Unbekannter Command: $ACTION"
    echo ""
    echo "  Verfügbare Commands:"
    echo "    curl -fsSL https://studio.xed.dev/payload.sh | bash                          # Install/Update"
    echo "    curl -fsSL https://studio.xed.dev/payload.sh | bash -s setup <tld>           # Per-Site Setup"
    echo "    curl -fsSL https://studio.xed.dev/payload.sh | bash -s status                # Status aller Sites"
    echo "    bash /tmp/payload.sh create-admin <tld> <email>                              # Ersten Admin anlegen"
    echo "    bash /tmp/payload.sh admin list <tld>                                        # Alle User anzeigen"
    echo "    bash /tmp/payload.sh admin set-role <tld> <email> <admin|user>               # Rolle ändern"
    echo "    bash /tmp/payload.sh admin reset-password <tld> <email>                      # Passwort zurücksetzen"
    echo "    bash /tmp/payload.sh admin delete <tld> <email>                              # User löschen"
    echo ""
    echo -e "  Alle Befehle werden an die oclif-CLI unter ${BOLD}$INFACTORY_BIN${NC} delegiert."
    echo ""
    exit 1
    ;;
esac
