#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory — AI-Agent-First Ghost Theme Factory
#
# Verwendung:
#   curl -fsSL https://studio.xed.dev/install.sh | bash              # Install/Update
#   curl -fsSL https://studio.xed.dev/install.sh | bash -s status    # Status aller Services
#
# Health-Check fuer ALLE Services (infactory + studio-payload + nginx):
#   curl -fsSL https://studio.xed.dev/health.sh | bash               # Pruefen
#   curl -fsSL https://studio.xed.dev/health.sh | bash -s fix        # Pruefen + Auto-Fix
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="https://github.com/XED-dev/Studio.git"
INSTALL_DIR="/opt/infactory"
BIN_LINK="/usr/local/bin/infactory"
VENV_DIR="$INSTALL_DIR/venv"
REFERENCES_DIR="$INSTALL_DIR/references"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

YELLOW='\033[0;33m'

info()  { echo -e "  ${BLUE}→${NC} $1"; }
ok()    { echo -e "  ${GREEN}✔${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
err()   { echo -e "  ${RED}✗${NC} $1" >&2; }

SITE_BASE="/var/xed"

# ── Subcommand: status ───────────────────────────────────────────────────────

if [ "${1:-}" = "status" ]; then
  echo ""
  echo -e "  ${BOLD}inFactory Status${NC}"
  echo ""

  if [ -d "$INSTALL_DIR" ]; then
    CLI_VER=$(node -p "require('$INSTALL_DIR/infactory-cli/package.json').version" 2>/dev/null || echo "?")
    SRV_VER=$(node -p "require('$INSTALL_DIR/infactory-server/package.json').version" 2>/dev/null || echo "?")
    HEAD=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
    echo "  Code: CLI v${CLI_VER}, Server v${SRV_VER} (${HEAD})"
  else
    err "Nicht installiert: $INSTALL_DIR"
    exit 1
  fi
  echo ""

  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    [ -f "$SITE_BASE/$d/infactory.json" ] || continue
    local_port=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$SITE_BASE/$d/infactory.json')).port||4368)}catch{console.log(4368)}" 2>/dev/null || echo "4368")
    svc="infactory-${d//./-}"
    status="${RED}DOWN${NC}"
    systemctl is-active --quiet "$svc" 2>/dev/null && status="${GREEN}active${NC}"
    echo -e "  ${BOLD}$d${NC}  Port $local_port  [$status]  $svc"

    # Health-Check
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
      health=$(curl -sf "http://127.0.0.1:$local_port/xed/api/health" 2>/dev/null)
      if [ $? -eq 0 ]; then
        version=$(echo "$health" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).server.version)}catch{console.log('?')}})" 2>/dev/null || echo "?")
        ok "  /xed/api/health → v$version"
      else
        warn "  /xed/api/health nicht erreichbar"
      fi
    fi
  done
  echo ""
  echo -e "  Vollstaendiger Health-Check (alle Services):"
  echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/health.sh | bash${NC}"
  echo ""
  exit 0
fi

# ── Hauptprogramm: Install/Update ────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}inFactory${NC} — Studio.XED.dev"
echo -e "  ${BLUE}https://studio.xed.dev${NC}"
echo ""

# ─── Prerequisites ────────────────────────────────────────────────────────────

# Node.js
if ! command -v node &>/dev/null; then
  err "Node.js nicht gefunden."
  echo "     Install: https://nodejs.org/ (v18+)"
  echo "     Oder:    curl -sL https://deb.nodesource.com/setup_22.x | sudo -E bash && sudo apt install -y nodejs"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js $NODE_MAJOR gefunden — mindestens v18 erforderlich."
  exit 1
fi
ok "Node.js $(node --version)"

# Git
if ! command -v git &>/dev/null; then
  err "Git nicht gefunden. Install: sudo apt install -y git"
  exit 1
fi
ok "Git $(git --version | cut -d' ' -f3)"

# npm
if ! command -v npm &>/dev/null; then
  err "npm nicht gefunden."
  exit 1
fi
ok "npm $(npm --version)"

# ─── Install ──────────────────────────────────────────────────────────────────

# Check if already installed
if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/infactory-cli/bin/infactory.js" ]; then
  info "Bestehende Installation gefunden — Update..."
  cd "$INSTALL_DIR"

  # Server-Deploy-Pattern: fetch + reset --hard origin/main.
  # Kein merge, kein rebase — lokale Mods an getrackten Files sind unerwuenscht und werden verworfen.
  # Untracked files (venv/, browsers/, references/, package-lock.json) bleiben unberuehrt.
  if ! git fetch --quiet origin main; then
    err "git fetch origin main fehlgeschlagen — ist $INSTALL_DIR noch ein git repo?"
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

  cd infactory-cli && npm install --omit=dev --silent 2>/dev/null
  cd ../infactory-server && npm install --omit=dev --silent 2>/dev/null
  cd ..
  ok "Dependencies installiert"
else
  info "Installiere nach $INSTALL_DIR..."

  # Create directory (may need sudo)
  if [ ! -d "$INSTALL_DIR" ]; then
    if [ -w "$(dirname $INSTALL_DIR)" ]; then
      mkdir -p "$INSTALL_DIR"
    else
      sudo mkdir -p "$INSTALL_DIR"
      sudo chown "$(whoami):$(id -gn)" "$INSTALL_DIR"
    fi
  fi

  # Clone
  git clone --depth 1 "$REPO" "$INSTALL_DIR" 2>/dev/null
  ok "Code geklont"

  # npm install
  info "Dependencies installieren..."
  cd "$INSTALL_DIR/infactory-cli" && npm install --omit=dev --silent 2>/dev/null
  cd "$INSTALL_DIR/infactory-server" && npm install --omit=dev --silent 2>/dev/null
  ok "Dependencies installiert"
fi

# ─── Python venv (QA-Tools) ───────────────────────────────────────────────────

info "Python venv für QA-Tools..."

if ! command -v python3 &>/dev/null; then
  err "Python3 nicht gefunden. Install: sudo apt install -y python3 python3-venv python3-pip"
  echo "     QA-Tools (shot-scraper, crawl4ai) werden NICHT installiert."
  echo "     Der Server funktioniert ohne QA — QA-Endpunkte geben Fehler zurück."
else
  PYTHON_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
  PYTHON_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
  if [ "$PYTHON_MAJOR" -lt 3 ] || [ "$PYTHON_MINOR" -lt 9 ]; then
    err "Python ${PYTHON_MAJOR}.${PYTHON_MINOR} gefunden — mindestens 3.9 erforderlich für crawl4ai."
  else
    ok "Python $(python3 --version | cut -d' ' -f2)"

    if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/python3" ]; then
      info "Bestehendes venv gefunden — aktualisiere..."
      "$VENV_DIR/bin/pip" install --upgrade --quiet shot-scraper crawl4ai 2>/dev/null
      ok "Python-Pakete aktualisiert"
    else
      info "Erstelle venv in $VENV_DIR..."
      python3 -m venv "$VENV_DIR"
      "$VENV_DIR/bin/pip" install --upgrade pip --quiet 2>/dev/null
      "$VENV_DIR/bin/pip" install shot-scraper crawl4ai --quiet 2>/dev/null
      ok "shot-scraper + crawl4ai installiert"
    fi

    # Playwright Browser in gemeinsames Verzeichnis installieren
    # PLAYWRIGHT_BROWSERS_PATH sorgt dafuer dass ALLE User (root, g-host, etc.)
    # die gleichen Browser finden — unabhaengig davon wer install.sh ausfuehrt.
    export PLAYWRIGHT_BROWSERS_PATH="$INSTALL_DIR/browsers"
    mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

    info "Playwright Browser installieren (nach $PLAYWRIGHT_BROWSERS_PATH)..."
    "$VENV_DIR/bin/python3" -m playwright install chromium 2>/dev/null && ok "Playwright Chromium installiert" || {
      echo "     ⚠  Playwright-Installation fehlgeschlagen."
      echo "     Manuell: PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH $VENV_DIR/bin/python3 -m playwright install chromium"
    }

    # Lesbar fuer alle User (Ghost-User braucht Zugriff)
    chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH"

    # Playwright System-Dependencies (braucht root)
    info "Playwright System-Dependencies..."
    "$VENV_DIR/bin/python3" -m playwright install-deps chromium 2>/dev/null && ok "System-Dependencies installiert" || {
      if command -v npx &>/dev/null; then
        npx playwright install-deps chromium 2>/dev/null && ok "System-Dependencies installiert" || {
          echo "     ⚠  Einige System-Dependencies fehlen evtl."
          echo "     Manuell: sudo npx playwright install-deps chromium"
        }
      fi
    }
  fi
fi

# ─── Referenz-Themes (MIT) ────────────────────────────────────────────────────

info "Referenz-Themes (MIT-Bibliothek)..."

mkdir -p "$REFERENCES_DIR/mit"

# MIT-Themes: Offizielle TryGhost-Themes + Community-Highlights
MIT_THEMES=(
  "TryGhost/Casper"
  "TryGhost/Starter"
  "TryGhost/Edition"
  "TryGhost/Solo"
  "TryGhost/Taste"
  "TryGhost/Digest"
  "TryGhost/Bulletin"
  "TryGhost/Alto"
  "TryGhost/Dope"
  "TryGhost/Wave"
  "TryGhost/London"
  "TryGhost/Ease"
  "TryGhost/Ruby"
  "TryGhost/Headline"
  "TryGhost/Edge"
  "TryGhost/Dawn"
  "TryGhost/Journal"
  "TryGhost/Massively"
  "zutrinken/attila"
  "eddiesigner/liebling"
)

# Kein interaktives Credential-Prompt bei fehlenden Repos
export GIT_TERMINAL_PROMPT=0

CLONED=0
UPDATED=0
SKIPPED=0
for theme in "${MIT_THEMES[@]}"; do
  name=$(basename "$theme")
  dir="$REFERENCES_DIR/mit/$name"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull --ff-only --quiet 2>/dev/null && ((UPDATED++)) || true
  else
    if git clone --depth 1 --quiet "https://github.com/$theme.git" "$dir" 2>/dev/null; then
      ((CLONED++))
    else
      ((SKIPPED++))
      [ -d "$dir" ] && rm -rf "$dir"  # Leere Verzeichnisse aufräumen
    fi
  fi
done
ok "MIT-Themes: $CLONED neu, $UPDATED aktualisiert, $SKIPPED übersprungen (${#MIT_THEMES[@]} gesamt)"

# Themex-Verzeichnis vorbereiten (wird manuell befüllt via infactory import-references)
mkdir -p "$REFERENCES_DIR/themex"
if [ ! -f "$REFERENCES_DIR/themex/.gitkeep" ]; then
  touch "$REFERENCES_DIR/themex/.gitkeep"
fi

# ─── Symlink ──────────────────────────────────────────────────────────────────

CLI_BIN="$INSTALL_DIR/infactory-cli/bin/infactory.js"

if [ -L "$BIN_LINK" ] || [ -f "$BIN_LINK" ]; then
  info "Symlink existiert — aktualisiere..."
  sudo rm -f "$BIN_LINK"
fi

sudo ln -s "$CLI_BIN" "$BIN_LINK"
# Kein chmod +x — der Mode 100755 ist jetzt im git index verankert,
# sonst wuerde git pull / reset bei jedem Run einen dirty working tree produzieren.
ok "infactory → $BIN_LINK"

# ─── Done ─────────────────────────────────────────────────────────────────────

# Versionen aus package.json lesen (lebt im Repo, statt im install.sh hardcoded).
CLI_VERSION=$(node -p "require('$INSTALL_DIR/infactory-cli/package.json').version" 2>/dev/null || echo "?")
SERVER_VERSION=$(node -p "require('$INSTALL_DIR/infactory-server/package.json').version" 2>/dev/null || echo "?")
HEAD_SHORT=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")

# ─── Restart laufende infactory-Services ─────────────────────────────────────

RESTARTED=0
for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
  [ -f "$SITE_BASE/$d/infactory.json" ] || continue
  svc="infactory-${d//./-}"
  # Restart aktive Services ODER starte gestoppte/enabled Services
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    info "Restart: $svc..."
    systemctl restart "$svc" 2>/dev/null
  elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    info "Start: $svc (war gestoppt)..."
    systemctl start "$svc" 2>/dev/null
  else
    continue
  fi
  sleep 1
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    ok "$svc laeuft"
    ((RESTARTED++))
  else
    warn "$svc Start fehlgeschlagen — journalctl -u $svc -n 20"
  fi
done

echo ""
echo -e "  ${GREEN}${BOLD}Installation abgeschlossen!${NC}"
echo ""
echo "  CLI:     v${CLI_VERSION}"
echo "  Server:  v${SERVER_VERSION}"
echo "  Commit:  ${HEAD_SHORT}"
echo "  Pfad:    $INSTALL_DIR/"
[ -d "$VENV_DIR/bin" ] && echo "  Venv:    $VENV_DIR/"
echo "  Refs:    $REFERENCES_DIR/"
[ "$RESTARTED" -gt 0 ] && echo "  Restart: $RESTARTED Service(s) neugestartet"
echo ""
echo -e "  ${BOLD}Nächster Schritt — pro Site:${NC}"
echo ""
echo "  Track A (LEMP Section-Renderer — aktiv):"
echo -e "    ${BOLD}mkdir -p /var/xed/<tld> && chown -R g-host:g-host /var/xed/<tld>${NC}"
echo -e "    ${BOLD}su - g-host -c 'cd /var/xed/<tld> && infactory install'${NC}"
echo ""
echo "  Track B (Ghost Theme Factory — eingefroren):"
echo -e "    ${BOLD}cd /var/ghost/<domain> && infactory install${NC}"
echo ""
echo "  Lizenzierte Themes importieren:"
echo -e "    ${BOLD}infactory import-references --url=https://nextcloud.example.com/s/abc/download${NC}"
echo ""
echo -e "  Docs:   ${BLUE}https://studio.xed.dev${NC}"
echo -e "  GitHub: ${BLUE}https://github.com/XED-dev/Studio${NC}"
echo ""
echo -e "  ${BOLD}Studio-Payload (Puck Visual Editor):${NC}"
echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh | bash${NC}"
echo ""
