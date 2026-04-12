#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory Payload — Puck Visual Editor + Payload CMS + Next.js
# One-liner: curl -fsSL https://studio.xed.dev/payload.sh | bash
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="https://github.com/XED-dev/Studio-Payload.git"
INSTALL_DIR="/opt/studio-payload"

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
echo -e "  ${BOLD}inFactory Payload${NC} — Studio.XED.dev"
echo -e "  ${BLUE}Puck Visual Editor + Payload CMS + Next.js${NC}"
echo ""

# ── Dependency Check ─────────────────────────────────────────────────────────

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "  ${BLUE}→${NC} $1 nicht gefunden — installiere..."
    eval "$2"
    command -v "$1" &>/dev/null || { err "$1 Installation fehlgeschlagen"; exit 1; }
    ok "$1 installiert"
  fi
}

require_cmd node  "err 'Node.js fehlt — bitte manuell installieren (v18+)'; exit 1"
require_cmd git   "err 'Git fehlt — bitte manuell installieren'; exit 1"
require_cmd pnpm  "corepack enable && corepack prepare pnpm@latest --activate 2>/dev/null || npm install -g pnpm"

# Version checks
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js $NODE_MAJOR gefunden — mindestens v18 erforderlich."
  exit 1
fi
ok "Node.js $(node --version)"
ok "pnpm $(pnpm --version)"
ok "Git $(git --version | cut -d' ' -f3)"

# ─── Install / Update ────────────────────────────────────────────────────────

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
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

  info "Dependencies installieren (pnpm install)..."
  cd "$INSTALL_DIR"
  pnpm install --frozen-lockfile --silent 2>/dev/null || pnpm install --silent 2>/dev/null
  ok "Dependencies installiert"
fi

# ─── Build ───────────────────────────────────────────────────────────────────

info "Build vorbereiten..."
cd "$INSTALL_DIR"

# Secrets generieren falls nicht in Umgebung
if [ -z "${PAYLOAD_SECRET:-}" ]; then
  export PAYLOAD_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fi
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  export BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fi

# DATABASE_URI (wird zur Runtime ueberschrieben via systemd Environment)
export DATABASE_URI="${DATABASE_URI:-file:./data/payload.db}"
mkdir -p data

# Payload Migrations ausfuehren (erstellt DB-Tabellen)
info "Payload Migrations..."
pnpm payload migrate && ok "Migrations erfolgreich" || {
  err "Payload Migrations fehlgeschlagen"
  echo "     Manuell: cd $INSTALL_DIR && pnpm payload migrate"
}

info "Next.js Build..."
pnpm build && ok "Next.js Build erfolgreich" || {
  err "Next.js Build fehlgeschlagen"
  echo "     Manuell: cd $INSTALL_DIR && pnpm build"
  echo "     Stellen Sie sicher dass PAYLOAD_SECRET gesetzt ist."
}

# ─── systemd Service Template ────────────────────────────────────────────────

# Dieses Script erzeugt KEIN systemd-Service automatisch.
# Stattdessen wird ein Template ausgegeben, das der Admin anpassen soll.

SERVICE_TEMPLATE="$INSTALL_DIR/studio-payload.service.template"
cat > "$SERVICE_TEMPLATE" << 'UNIT'
# ── studio-payload-<tld>.service ──────────────────────────────────────────
# Kopieren nach: /etc/systemd/system/studio-payload-<tld>.service
# Dann: systemctl daemon-reload && systemctl enable --now studio-payload-<tld>
[Unit]
Description=inFactory Payload — Puck Visual Editor (<tld>)
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=/opt/studio-payload
ExecStart=/usr/bin/node /opt/studio-payload/node_modules/.bin/next start -p 5368
Restart=on-failure
RestartSec=5

# ── Environment ──
Environment=NODE_ENV=production
Environment=DATABASE_URI=file:///var/xed/<tld>/payload.db
Environment=PAYLOAD_SECRET=<HIER_GENERIEREN>
Environment=BETTER_AUTH_SECRET=<HIER_GENERIEREN>
Environment=NEXT_PUBLIC_SERVER_URL=https://<subdomain>.<tld>

[Install]
WantedBy=multi-user.target
UNIT
ok "Service-Template: $SERVICE_TEMPLATE"

# ─── Done ────────────────────────────────────────────────────────────────────

HEAD_SHORT=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
PKG_VERSION=$(node -p "require('$INSTALL_DIR/package.json').version" 2>/dev/null || echo "?")

echo ""
echo -e "  ${GREEN}${BOLD}Installation abgeschlossen!${NC}"
echo ""
echo "  Version:  v${PKG_VERSION}"
echo "  Commit:   ${HEAD_SHORT}"
echo "  Pfad:     $INSTALL_DIR/"
echo "  Template: $SERVICE_TEMPLATE"
echo ""
echo -e "  ${BOLD}Naechster Schritt — pro Site:${NC}"
echo ""
echo "  1. Site-Verzeichnis anlegen:"
echo -e "     ${BOLD}mkdir -p /var/xed/<tld> && chown g-host:g-host /var/xed/<tld>${NC}"
echo ""
echo "  2. Service einrichten (Template anpassen + kopieren):"
echo -e "     ${BOLD}cp $SERVICE_TEMPLATE /etc/systemd/system/studio-payload-<tld>.service${NC}"
echo -e "     ${BOLD}# <tld>, Secrets und Port anpassen!${NC}"
echo -e "     ${BOLD}systemctl daemon-reload && systemctl enable --now studio-payload-<tld>${NC}"
echo ""
echo "  3. NGINX Route einrichten:"
echo -e "     ${BOLD}location /studio/ { proxy_pass http://127.0.0.1:5368/; }${NC}"
echo ""
echo -e "  Docs:   ${BLUE}https://studio.xed.dev${NC}"
echo -e "  GitHub: ${BLUE}https://github.com/XED-dev/Studio-Payload${NC}"
echo ""
echo -e "  ${BOLD}inFactory Server (Express, Track A):${NC}"
echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/install.sh | bash${NC}"
echo ""
