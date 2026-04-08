#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory — AI-Agent-First Ghost Theme Factory
# One-liner: curl -fsSL https://studio.xed.dev/install.sh | bash
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

VERSION="1.0.0"
REPO="https://github.com/XED-dev/Studio.git"
INSTALL_DIR="/opt/infactory"
BIN_LINK="/usr/local/bin/infactory"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "  ${BLUE}→${NC} $1"; }
ok()    { echo -e "  ${GREEN}✔${NC} $1"; }
err()   { echo -e "  ${RED}✗${NC} $1" >&2; }

echo ""
echo -e "  ${BOLD}inFactory v${VERSION}${NC} — Ghost Theme Factory"
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
  git pull --ff-only 2>/dev/null || true
  cd infactory-cli && npm install --production --silent 2>/dev/null
  cd ../infactory-server && npm install --production --silent 2>/dev/null
  cd ..
  ok "Update abgeschlossen"
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
  cd "$INSTALL_DIR/infactory-cli" && npm install --production --silent 2>/dev/null
  cd "$INSTALL_DIR/infactory-server" && npm install --production --silent 2>/dev/null
  ok "Dependencies installiert"
fi

# ─── Symlink ──────────────────────────────────────────────────────────────────

CLI_BIN="$INSTALL_DIR/infactory-cli/bin/infactory.js"

if [ -L "$BIN_LINK" ] || [ -f "$BIN_LINK" ]; then
  info "Symlink existiert — aktualisiere..."
  sudo rm -f "$BIN_LINK"
fi

sudo ln -s "$CLI_BIN" "$BIN_LINK"
sudo chmod +x "$CLI_BIN"
ok "infactory → $BIN_LINK"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}${BOLD}Installation abgeschlossen!${NC}"
echo ""
echo "  Nächster Schritt — im Ghost-Verzeichnis:"
echo ""
echo -e "    ${BOLD}cd /var/ghost/mein-blog${NC}"
echo -e "    ${BOLD}infactory install${NC}"
echo ""
echo "  Das richtet den inFactory Server als Companion"
echo "  für diese Ghost-Instanz ein."
echo ""
echo -e "  Docs:   ${BLUE}https://studio.xed.dev${NC}"
echo -e "  GitHub: ${BLUE}https://github.com/XED-dev/Studio${NC}"
echo ""
