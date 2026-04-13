#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory Payload — Puck Visual Editor + Payload CMS + Next.js
#
# Verwendung:
#   curl -fsSL https://studio.xed.dev/payload.sh | bash                    # Install/Update
#   curl -fsSL https://studio.xed.dev/payload.sh | bash -s setup <tld>     # Per-Site Setup
#   curl -fsSL https://studio.xed.dev/payload.sh | bash -s status          # Status aller Sites
#
# Beispiel (Erstinstallation + Site-Setup):
#   curl -fsSL https://studio.xed.dev/payload.sh | bash
#   curl -fsSL https://studio.xed.dev/payload.sh | bash -s setup steirischursprung.at
#
# Beispiel (Update — Code + Deps + Migrate + Build + Restart):
#   curl -fsSL https://studio.xed.dev/payload.sh | bash
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="https://github.com/XED-dev/Studio-Payload.git"
INSTALL_DIR="/opt/studio-payload"
SITE_BASE="/var/xed"
PORT_BASE=5368       # Erster Studio-Payload-Port (Track-A + 1000)
SERVICE_PREFIX="studio-payload"
PROXY_INCLUDE="/etc/nginx/proxy/xed.conf"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "  ${BLUE}→${NC} $1"; }
ok()    { echo -e "  ${GREEN}✔${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
err()   { echo -e "  ${RED}✗${NC} $1" >&2; }

# ── Dependency Check ─────────────────────────────────────────────────────────

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    info "$1 nicht gefunden — installiere..."
    eval "$2"
    command -v "$1" &>/dev/null || { err "$1 Installation fehlgeschlagen"; exit 1; }
    ok "$1 installiert"
  fi
}

check_deps() {
  require_cmd node  "err 'Node.js fehlt — bitte manuell installieren (v18+)'; exit 1"
  require_cmd git   "err 'Git fehlt — bitte manuell installieren'; exit 1"
  require_cmd pnpm  "corepack enable && corepack prepare pnpm@latest --activate 2>/dev/null || npm install -g pnpm"

  NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
  if [ "$NODE_MAJOR" -lt 18 ]; then
    err "Node.js $NODE_MAJOR gefunden — mindestens v18 erforderlich."
    exit 1
  fi
  ok "Node.js $(node --version)"
  ok "pnpm $(pnpm --version)"
  ok "Git $(git --version | cut -d' ' -f3)"
}

# ── Helpers ──────────────────────────────────────────────────────────────────

tld_to_service() { echo "${SERVICE_PREFIX}-$(echo "$1" | tr '.' '-')"; }
tld_to_port() {
  # Port = PORT_BASE + Index der TLD (alphabetisch sortiert)
  local idx=0
  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
      if [ "$d" = "$1" ]; then echo $((PORT_BASE + idx)); return; fi
      idx=$((idx + 1))
    fi
  done
  # Neue TLD: naechster freier Port
  echo $((PORT_BASE + idx))
}

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: setup <tld>
# ══════════════════════════════════════════════════════════════════════════════

cmd_setup() {
  local TLD="$1"
  local SITE_DIR="$SITE_BASE/$TLD"
  local ENV_FILE="$SITE_DIR/studio-payload.env"
  local SERVICE_NAME=$(tld_to_service "$TLD")
  local PORT=$(tld_to_port "$TLD")

  echo ""
  echo -e "  ${BOLD}Studio-Payload Setup${NC} — $TLD"
  echo ""

  # Voraussetzung: Code muss installiert sein
  if [ ! -f "$INSTALL_DIR/package.json" ]; then
    err "Studio-Payload nicht installiert. Zuerst ausfuehren:"
    echo -e "     ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh | bash${NC}"
    exit 1
  fi

  # Voraussetzung: Site-Verzeichnis muss existieren
  if [ ! -d "$SITE_DIR" ]; then
    info "Erstelle $SITE_DIR..."
    mkdir -p "$SITE_DIR"
    chown g-host:g-host "$SITE_DIR"
    ok "$SITE_DIR erstellt"
  fi

  # ── Secrets (nur bei Erstinstallation) ──
  if [ -f "$ENV_FILE" ]; then
    ok "Secrets existieren bereits: $ENV_FILE (nicht ueberschrieben)"
  else
    info "Generiere Secrets..."
    node -e "
const c = require('crypto');
const lines = [
  'PAYLOAD_SECRET=' + c.randomBytes(32).toString('hex'),
  'BETTER_AUTH_SECRET=' + c.randomBytes(32).toString('hex'),
  'BETTER_AUTH_URL=https://jam.$TLD/studio',
  'DATABASE_URI=file://$SITE_DIR/payload.db',
  'NEXT_PUBLIC_SERVER_URL=https://jam.$TLD/studio',
  'NEXT_PUBLIC_BASE_PATH=/studio'
];
require('fs').writeFileSync('$ENV_FILE', lines.join('\\n') + '\\n');
"
    chmod 600 "$ENV_FILE"
    chown g-host:g-host "$ENV_FILE"
    ok "Secrets generiert: $ENV_FILE"
  fi

  # ── Payload Migrate (DB-Tabellen erstellen) ──
  info "Payload Migrations..."
  cd "$INSTALL_DIR"
  # Secrets fuer migrate laden (ohne sie im Prozessbaum sichtbar zu machen)
  set -a; source "$ENV_FILE"; set +a
  pnpm payload migrate && ok "Migrations erfolgreich" || {
    err "Migrations fehlgeschlagen"
    exit 1
  }

  # ── systemd Service ──
  local SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  info "Schreibe systemd Service auf Port $PORT..."
  cat > "$SERVICE_FILE" << UNIT
[Unit]
Description=Studio-Payload — Puck Editor ($TLD)
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $INSTALL_DIR/node_modules/next/dist/bin/next start -p $PORT
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" 2>/dev/null
  ok "Service geschrieben: $SERVICE_NAME (Port $PORT)"

  # ── Service starten ──
  info "Starte $SERVICE_NAME..."
  systemctl restart "$SERVICE_NAME"
  sleep 2

  if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "$SERVICE_NAME laeuft (Port $PORT)"
  else
    err "$SERVICE_NAME startet nicht — pruefe: journalctl -u $SERVICE_NAME -n 30"
    exit 1
  fi

  # ── NGINX Hinweis ──
  echo ""
  echo -e "  ${YELLOW}NGINX-Route manuell einrichten${NC} (falls noch nicht vorhanden):"
  echo ""
  echo "  In der jam.$TLD NGINX-Config:"
  echo ""
  echo -e "    ${BOLD}location /studio/ {"
  echo -e "        proxy_pass http://127.0.0.1:${PORT}/;"
  if [ -f "$PROXY_INCLUDE" ]; then
    echo -e "        include $PROXY_INCLUDE;"
  fi
  echo -e "    }${NC}"
  echo ""
  echo -e "  Dann: ${BOLD}nginx -t && systemctl reload nginx${NC}"
  echo ""

  # ── Zusammenfassung ──
  local HEAD_SHORT=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
  echo -e "  ${GREEN}${BOLD}Setup abgeschlossen!${NC}"
  echo ""
  echo "  TLD:       $TLD"
  echo "  Port:      $PORT"
  echo "  Service:   $SERVICE_NAME"
  echo "  Secrets:   $ENV_FILE"
  echo "  DB:        $SITE_DIR/payload.db"
  echo "  Commit:    $HEAD_SHORT"
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: status
# ══════════════════════════════════════════════════════════════════════════════

cmd_status() {
  echo ""
  echo -e "  ${BOLD}Studio-Payload Status${NC}"
  echo ""

  if [ ! -d "$INSTALL_DIR" ]; then
    err "Nicht installiert."
    return
  fi

  local HEAD_SHORT=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
  local PKG_VERSION=$(node -p "require('$INSTALL_DIR/package.json').version" 2>/dev/null || echo "?")
  echo "  Code:    v${PKG_VERSION} (${HEAD_SHORT}) in $INSTALL_DIR/"
  echo ""

  local found=0
  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
      local svc=$(tld_to_service "$d")
      local port=$(tld_to_port "$d")
      local status="stopped"
      systemctl is-active --quiet "$svc" 2>/dev/null && status="${GREEN}running${NC}" || status="${RED}stopped${NC}"
      echo -e "  $d  Port $port  [$status]  $svc"
      found=$((found + 1))
    fi
  done

  if [ "$found" -eq 0 ]; then
    echo "  Keine Sites konfiguriert."
    echo -e "  Setup: ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh | bash -s setup <tld>${NC}"
  fi
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: install/update (default, kein Argument)
# ══════════════════════════════════════════════════════════════════════════════

cmd_install() {
  echo ""
  echo -e "  ${BOLD}inFactory Payload${NC} — Studio.XED.dev"
  echo -e "  ${BLUE}Puck Visual Editor + Payload CMS + Next.js${NC}"
  echo ""

  check_deps

  # ── Install / Update Code ──
  local IS_UPDATE=false
  if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
    IS_UPDATE=true
    info "Bestehende Installation gefunden — Update..."
    cd "$INSTALL_DIR"

    if ! git fetch --quiet origin main; then
      err "git fetch origin main fehlgeschlagen"
      exit 1
    fi

    OLD_HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
    NEW_HEAD=$(git rev-parse --short origin/main)

    if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
      git reset --hard --quiet origin/main
      ok "Code aktualisiert: $OLD_HEAD → $NEW_HEAD"
    else
      ok "Bereits aktuell: $NEW_HEAD"
    fi

    pnpm install --frozen-lockfile --silent 2>/dev/null || pnpm install --silent 2>/dev/null
    ok "Dependencies installiert"
  else
    info "Installiere nach $INSTALL_DIR..."

    if [ ! -d "$INSTALL_DIR" ]; then
      if [ -w "$(dirname $INSTALL_DIR)" ]; then
        mkdir -p "$INSTALL_DIR"
      else
        sudo mkdir -p "$INSTALL_DIR"
        sudo chown "$(whoami):$(id -gn)" "$INSTALL_DIR"
      fi
    fi

    git clone --depth 1 "$REPO" "$INSTALL_DIR" 2>/dev/null
    ok "Code geklont"

    info "Dependencies installieren..."
    cd "$INSTALL_DIR"
    pnpm install --frozen-lockfile --silent 2>/dev/null || pnpm install --silent 2>/dev/null
    ok "Dependencies installiert"
  fi

  # ── Migrate alle bestehenden Sites ──
  local migrated=0
  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
      info "Migrate: $d..."
      cd "$INSTALL_DIR"
      set -a; source "$SITE_BASE/$d/studio-payload.env"; set +a
      pnpm payload migrate 2>/dev/null && ok "Migrate $d erfolgreich" || warn "Migrate $d fehlgeschlagen"
      migrated=$((migrated + 1))
    fi
  done

  if [ "$migrated" -eq 0 ]; then
    # Kein Site-Setup vorhanden — Build mit Dummy-Secrets fuer Static Pages
    info "Keine Sites konfiguriert — Build mit temporaeren Secrets..."
    export PAYLOAD_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    export BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    export DATABASE_URI="file:./data/payload.db"
    mkdir -p "$INSTALL_DIR/data"

    info "Payload Migrations (temporaere DB)..."
    cd "$INSTALL_DIR"
    pnpm payload migrate 2>/dev/null && ok "Migrations erfolgreich" || warn "Migrations fehlgeschlagen"
  fi

  # ── Build ──
  info "Next.js Build..."
  cd "$INSTALL_DIR"
  pnpm build && ok "Next.js Build erfolgreich" || {
    err "Next.js Build fehlgeschlagen"
    echo "     Manuell: cd $INSTALL_DIR && pnpm build"
    exit 1
  }

  # ── Restart/Start Services nach Update ──
  if [ "$IS_UPDATE" = true ]; then
    for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
      if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
        local svc=$(tld_to_service "$d")
        if systemctl is-active --quiet "$svc" 2>/dev/null; then
          info "Restart: $svc..."
          systemctl restart "$svc"
        elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
          info "Start: $svc (war gestoppt)..."
          systemctl start "$svc"
        else
          continue
        fi
        sleep 1
        if systemctl is-active --quiet "$svc"; then
          ok "$svc laeuft"
        else
          warn "$svc Start fehlgeschlagen — pruefe: journalctl -u $svc -n 30"
        fi
      fi
    done
  fi

  # ── Done ──
  local HEAD_SHORT=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
  local PKG_VERSION=$(node -p "require('$INSTALL_DIR/package.json').version" 2>/dev/null || echo "?")

  echo ""
  echo -e "  ${GREEN}${BOLD}Installation abgeschlossen!${NC}"
  echo ""
  echo "  Version: v${PKG_VERSION}"
  echo "  Commit:  ${HEAD_SHORT}"
  echo "  Pfad:    $INSTALL_DIR/"
  echo ""

  # Sites-Status anzeigen
  local found=0
  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
      local svc=$(tld_to_service "$d")
      local port=$(tld_to_port "$d")
      local status="stopped"
      systemctl is-active --quiet "$svc" 2>/dev/null && status="${GREEN}active${NC}" || status="${YELLOW}stopped${NC}"
      echo -e "  ${BOLD}$d${NC}  Port $port  [$status]"
      found=$((found + 1))
    fi
  done

  if [ "$found" -eq 0 ]; then
    echo -e "  ${BOLD}Naechster Schritt — Site einrichten:${NC}"
    echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh | bash -s setup <tld>${NC}"
  fi

  echo ""
  echo -e "  Docs:   ${BLUE}https://studio.xed.dev${NC}"
  echo -e "  GitHub: ${BLUE}https://github.com/XED-dev/Studio-Payload${NC}"
  echo ""
  echo -e "  ${BOLD}inFactory Server (Express, Track A):${NC}"
  echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/install.sh | bash${NC}"
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN — Dispatcher
# ══════════════════════════════════════════════════════════════════════════════

case "${1:-}" in
  setup)
    if [ -z "${2:-}" ]; then
      err "TLD fehlt. Verwendung: bash -s setup <tld>"
      echo -e "     Beispiel: ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh | bash -s setup steirischursprung.at${NC}"
      exit 1
    fi
    check_deps
    cmd_setup "$2"
    ;;
  status)
    cmd_status
    ;;
  *)
    cmd_install
    ;;
esac
