#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory — Hybrid Bootstrap (CLI-M4 e)
#
# Dieses Skript ist BEWUSST NICHT rein Bootstrap-Wrapper. Es kann nicht, weil
# Teile der Install-Logik die CLI selbst installieren (Chicken-and-egg): git-clone,
# npm install, Python venv, Playwright, MIT-Theme-Import. Diese Bootstrap-Arbeit
# bleibt in Bash.
#
# Was an die oclif-CLI (infactory-cli-v2/) delegiert wird:
#   - `install.sh status`               → infactory health
#   - Service-Restart nach Update       → infactory server restart
#
# Was in Bash bleibt:
#   - Dependency-Check (node/git/npm)
#   - git clone + npm install für BEIDE CLIs (alt für Track-B, neu für Track-A)
#   - Symlink /usr/local/bin/infactory → infactory-cli-v2/bin/run.js
#   - Python venv + Playwright (Track-B QA-Tools)
#   - MIT-Theme-Referenzbibliothek (Track-B)
#   - NGINX xed.conf kopieren
#   - `install.sh setup <tld>`          — Track-A infactory-Setup
#                                         (Portierung offen als CLI-M3.6)
#
# Verwendung (unverändert zur Bash-Vorgängerversion):
#   curl -fsSL https://studio.xed.dev/install.sh | bash              # Install/Update
#   curl -fsSL https://studio.xed.dev/install.sh | bash -s status    # Status (→ v2 health)
#   curl -fsSL https://studio.xed.dev/install.sh | bash -s setup <tld>   # Track-A Setup
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="https://github.com/XED-dev/Studio.git"
INSTALL_DIR="/opt/infactory"
BIN_LINK="/usr/local/bin/infactory"
INFACTORY_V2_BIN="$INSTALL_DIR/infactory-cli-v2/bin/run.js"
NODE_BIN="/usr/bin/node"
VENV_DIR="$INSTALL_DIR/venv"
REFERENCES_DIR="$INSTALL_DIR/references"
SITE_BASE="/var/xed"

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

# ── Subcommand: status → Delegation an v2 ───────────────────────────────────

if [ "${1:-}" = "status" ]; then
  if [ ! -f "$INFACTORY_V2_BIN" ]; then
    err "inFactory CLI v2 nicht gefunden: $INFACTORY_V2_BIN"
    echo ""
    echo "  Zuerst installieren:"
    echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/install.sh | bash${NC}"
    echo ""
    exit 1
  fi
  # exec ersetzt Bash-Prozess durch node — Exit-Code + Signals propagieren 1:1
  exec "$NODE_BIN" "$INFACTORY_V2_BIN" health
fi

# ── Subcommand: setup <tld> — Track-A infactory-Setup (bleibt Bash) ─────────
# Portierung zu `infactory site create-infactory <tld>` oder ähnlich ist ein
# eigener Roadmap-Punkt CLI-M3.6. Die Logik hat genug Besonderheiten
# (nginx_sites-JSON, Subdomain-Autodetect, WordOps-ACLs) dass eine eigene
# Scope-Entscheidung sinnvoll ist.

if [ "${1:-}" = "setup" ]; then
  TLD="${2:-}"
  if [ -z "$TLD" ]; then
    err "TLD fehlt. Verwendung: bash -s setup <tld>"
    echo -e "     Beispiel: ${BOLD}curl -fsSL https://studio.xed.dev/install.sh | bash -s setup steirischursprung.at${NC}"
    exit 1
  fi

  SITE_DIR="$SITE_BASE/$TLD"
  SVC_NAME="infactory-${TLD//./-}"
  CFG_FILE="$SITE_DIR/infactory.json"
  SVC_FILE="/etc/systemd/system/${SVC_NAME}.service"
  INF_PORT=4368

  echo ""
  echo -e "  ${BOLD}inFactory Setup${NC} — Track A — $TLD"
  echo ""

  # Voraussetzung: Code muss installiert sein
  if [ ! -f "$INSTALL_DIR/infactory-cli/bin/infactory.js" ]; then
    err "inFactory nicht installiert. Zuerst:"
    echo -e "     ${BOLD}curl -fsSL https://studio.xed.dev/install.sh | bash${NC}"
    exit 1
  fi
  ok "Code vorhanden: $INSTALL_DIR/"

  # Site-Verzeichnis
  if [ ! -d "$SITE_DIR" ]; then
    info "Erstelle $SITE_DIR..."
    mkdir -p "$SITE_DIR"
    chown g-host:g-host "$SITE_DIR"
    ok "$SITE_DIR erstellt"
  else
    ok "$SITE_DIR existiert"
  fi

  # Port (bestehende Config reuse, sonst Default 4368)
  if [ -f "$CFG_FILE" ]; then
    INF_PORT=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$CFG_FILE')).infactory_port||4368)}catch{console.log(4368)}" 2>/dev/null || echo "4368")
  fi

  # API-Key (bestehenden reuse, sonst neu generieren)
  API_KEY=""
  if [ -f "$CFG_FILE" ]; then
    API_KEY=$(node -e "try{const c=JSON.parse(require('fs').readFileSync('$CFG_FILE'));if(/^[0-9a-f]{64}$/.test(c.api_key))console.log(c.api_key)}catch{}" 2>/dev/null || echo "")
  fi
  if [ -z "$API_KEY" ]; then
    API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    info "API-Key: neu generiert (${API_KEY:0:8}...)"
  else
    ok "API-Key: reuse aus bestehender Config (${API_KEY:0:8}...)"
  fi

  # Subdomain-Autodetect: /var/www/*.<tld>/htdocs/
  SITE_COUNT=0
  for wwwdir in /var/www/*."$TLD"/htdocs /var/www/"$TLD"/htdocs; do
    [ -d "$wwwdir" ] || continue
    dn=$(basename "$(dirname "$wwwdir")")
    if [ "$dn" = "$TLD" ]; then sl="root"; else sl=$(echo "$dn" | sed "s/\\.${TLD}$//;s/\\./_/g"); fi
    ok "Site: $sl → $wwwdir/"
    SITE_COUNT=$((SITE_COUNT + 1))
  done

  if [ "$SITE_COUNT" -eq 0 ]; then
    warn "Keine WordOps-Sites fuer $TLD gefunden."
    warn "Erwartet: /var/www/<sub>.$TLD/htdocs/"
  fi

  # infactory.json schreiben (idempotent — bestehende Keys behalten)
  info "Schreibe $CFG_FILE..."

  VENV_PATH=""
  [ -f "/opt/infactory/venv/bin/python3" ] && VENV_PATH="/opt/infactory/venv"
  REFS_PATH=""
  [ -d "/opt/infactory/references" ] && REFS_PATH="/opt/infactory/references"

  SITES_JSON="{"
  SITES_IDX=0
  for wwwdir in /var/www/*."$TLD"/htdocs /var/www/"$TLD"/htdocs; do
    [ -d "$wwwdir" ] || continue
    dn=$(basename "$(dirname "$wwwdir")")
    if [ "$dn" = "$TLD" ]; then sl="root"; else sl=$(echo "$dn" | sed "s/\\.${TLD}$//;s/\\./_/g"); fi
    [ "$SITES_IDX" -gt 0 ] && SITES_JSON="${SITES_JSON},"
    SITES_JSON="${SITES_JSON}
    \"${sl}\": { \"webroot\": \"${wwwdir}/\" }"
    SITES_IDX=$((SITES_IDX + 1))
  done
  SITES_JSON="${SITES_JSON}
  }"

  cat > "$CFG_FILE" << CFGEOF
{
  "version": "1.3.0",
  "domain": "$TLD",
  "infactory_port": $INF_PORT,
  "api_key": "$API_KEY",
  "auto_sleep_minutes": 360,
  "ghost_url": "",
  "ghost_admin_key": "",
  "nginx_sites": $SITES_JSON,
  "venv_path": "$VENV_PATH",
  "references_path": "$REFS_PATH",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
CFGEOF
  chmod 600 "$CFG_FILE"
  chown g-host:g-host "$CFG_FILE"
  ok "$CFG_FILE geschrieben"

  # systemd-Service (idempotent — immer neu schreiben)
  info "Schreibe systemd Service auf Port $INF_PORT..."
  cat > "$SVC_FILE" << UNIT
[Unit]
Description=inFactory Server — Track A ($TLD)
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=$SITE_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/infactory-server/src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=INFACTORY_CONFIG=$CFG_FILE
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/infactory/browsers

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable "$SVC_NAME" 2>/dev/null
  ok "Service: $SVC_NAME (Port $INF_PORT)"

  # ACLs fuer WordOps-Webroots
  for wwwdir in /var/www/*."$TLD"/htdocs /var/www/"$TLD"/htdocs; do
    [ -d "$wwwdir" ] || continue
    setfacl -R -m  u:g-host:rwx "$wwwdir" 2>/dev/null
    setfacl -R -dm u:g-host:rwx "$wwwdir" 2>/dev/null
  done
  ok "ACLs fuer WordOps-Webroots gesetzt"

  # Service starten
  info "Starte $SVC_NAME..."
  systemctl restart "$SVC_NAME"
  sleep 2

  if systemctl is-active --quiet "$SVC_NAME"; then
    ok "$SVC_NAME laeuft (Port $INF_PORT)"
  else
    err "$SVC_NAME startet nicht — pruefe: journalctl -u $SVC_NAME -n 30"
    exit 1
  fi

  # Health-Check
  if health=$(curl -sf "http://127.0.0.1:$INF_PORT/xed/api/health" 2>/dev/null); then
    version=$(echo "$health" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).server.version)}catch{console.log('?')}})" 2>/dev/null || echo "?")
    ok "/xed/api/health → v$version"
  else
    warn "/xed/api/health nicht erreichbar (pruefe: curl -v http://127.0.0.1:$INF_PORT/xed/api/health)"
  fi

  # NGINX Hinweis
  echo ""
  echo -e "  ${YELLOW}NGINX-Route manuell einrichten${NC} (falls noch nicht vorhanden):"
  echo ""
  echo -e "    ${BOLD}location /xed/ {"
  echo -e "        proxy_pass http://127.0.0.1:${INF_PORT}/;"
  [ -f "/etc/nginx/proxy/xed.conf" ] && echo -e "        include /etc/nginx/proxy/xed.conf;"
  echo -e "    }${NC}"
  echo ""
  echo -e "  Dann: ${BOLD}nginx -t && systemctl reload nginx${NC}"
  echo ""

  HEAD_SHORT=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
  echo -e "  ${GREEN}${BOLD}Setup abgeschlossen!${NC}"
  echo ""
  echo "  TLD:       $TLD"
  echo "  Port:      $INF_PORT"
  echo "  Service:   $SVC_NAME"
  echo "  Config:    $CFG_FILE"
  echo "  Sites:     $SITE_COUNT Webroot(s)"
  echo "  Commit:    $HEAD_SHORT"
  echo ""
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# Hauptprogramm: Install/Update
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "  ${BOLD}inFactory${NC} — Studio.XED.dev"
echo -e "  ${BLUE}https://studio.xed.dev${NC}"
echo ""

# ─── Prerequisites ────────────────────────────────────────────────────────────

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

if ! command -v git &>/dev/null; then
  err "Git nicht gefunden. Install: sudo apt install -y git"
  exit 1
fi
ok "Git $(git --version | cut -d' ' -f3)"

if ! command -v npm &>/dev/null; then
  err "npm nicht gefunden."
  exit 1
fi
ok "npm $(npm --version)"

# ─── Install / Update Code ────────────────────────────────────────────────────

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/infactory-cli/bin/infactory.js" ]; then
  info "Bestehende Installation gefunden — Update..."
  cd "$INSTALL_DIR"

  # Server-Deploy-Pattern: fetch + reset --hard origin/main.
  # Kein merge, kein rebase. Untracked files (venv/, browsers/, references/,
  # package-lock.json) bleiben unberuehrt.
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
fi

# ─── npm install für alle drei Code-Bases ────────────────────────────────────
# alte CLI (Track-B Legacy): infactory-cli/  + infactory-server/
# neue CLI (Track-A aktiv):   infactory-cli-v2/

info "Dependencies installieren..."
cd "$INSTALL_DIR/infactory-cli" && npm install --omit=dev --silent 2>/dev/null
ok "infactory-cli (alt, Track-B Legacy)"
cd "$INSTALL_DIR/infactory-server" && npm install --omit=dev --silent 2>/dev/null
ok "infactory-server"

if [ -d "$INSTALL_DIR/infactory-cli-v2" ] && [ -f "$INSTALL_DIR/infactory-cli-v2/package.json" ]; then
  cd "$INSTALL_DIR/infactory-cli-v2"
  # v2 braucht devDependencies (typescript, oclif) fuer den Build
  npm install --silent 2>/dev/null
  # tsc-Build fuer dist/
  if npm run build --silent 2>/dev/null; then
    ok "infactory-cli-v2 (neu, Track-A aktiv — Build: dist/ erzeugt)"
  else
    warn "infactory-cli-v2 Build fehlgeschlagen — CLI läuft im ts-node Modus"
  fi
else
  warn "infactory-cli-v2/ nicht im Repo — nur alte CLI installiert"
fi

# ─── Python venv (QA-Tools für Track-B) ──────────────────────────────────────

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

    export PLAYWRIGHT_BROWSERS_PATH="$INSTALL_DIR/browsers"
    mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

    info "Playwright Browser installieren..."
    "$VENV_DIR/bin/python3" -m playwright install chromium 2>/dev/null && ok "Playwright Chromium installiert" || {
      echo "     ⚠  Playwright-Installation fehlgeschlagen."
      echo "     Manuell: PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH $VENV_DIR/bin/python3 -m playwright install chromium"
    }

    chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH"

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

# ─── Referenz-Themes (MIT, Track-B) ──────────────────────────────────────────

info "Referenz-Themes (MIT-Bibliothek)..."

mkdir -p "$REFERENCES_DIR/mit"

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

export GIT_TERMINAL_PROMPT=0

CLONED=0
UPDATED=0
SKIPPED=0
for theme in "${MIT_THEMES[@]}"; do
  name=$(basename "$theme")
  dir="$REFERENCES_DIR/mit/$name"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull --ff-only --quiet 2>/dev/null && UPDATED=$((UPDATED + 1)) || true
  else
    if git clone --depth 1 --quiet "https://github.com/$theme.git" "$dir" 2>/dev/null; then
      CLONED=$((CLONED + 1))
    else
      SKIPPED=$((SKIPPED + 1))
      [ -d "$dir" ] && rm -rf "$dir"  # NUR leere Clone-Verzeichnisse aufräumen
    fi
  fi
done
ok "MIT-Themes: $CLONED neu, $UPDATED aktualisiert, $SKIPPED übersprungen (${#MIT_THEMES[@]} gesamt)"

mkdir -p "$REFERENCES_DIR/themex"
if [ ! -f "$REFERENCES_DIR/themex/.gitkeep" ]; then
  touch "$REFERENCES_DIR/themex/.gitkeep"
fi

# ─── Symlink: zeigt auf v2 (CLI-M4 Cut-Over) ─────────────────────────────────

if [ -f "$INFACTORY_V2_BIN" ]; then
  CLI_TARGET="$INFACTORY_V2_BIN"
  CLI_LABEL="v2 (oclif, Track-A aktiv)"
else
  # Fallback: wenn v2-Build fehlschlug, alte CLI als Symlink
  CLI_TARGET="$INSTALL_DIR/infactory-cli/bin/infactory.js"
  CLI_LABEL="v1 (alte CLI — v2 nicht verfuegbar)"
fi

# Test-Modus: INFACTORY_KEEP_SYMLINK=1 überspringt den Symlink-Cut-Over.
# Sinn: CLI-M4 Server-Test kann v2 zusätzlich installieren, ohne dass der
# globale `infactory`-Command sofort auf die neue CLI zeigt. So bleibt der
# produktive Pfad intakt bis zum expliziten Cut-Over durch den Human DevOps.
if [ "${INFACTORY_KEEP_SYMLINK:-}" = "1" ]; then
  CURRENT=$(readlink "$BIN_LINK" 2>/dev/null || echo "?")
  warn "INFACTORY_KEEP_SYMLINK=1 — Symlink unverändert: $BIN_LINK → $CURRENT"
  warn "CLI-M4 Test-Modus. Cut-Over manuell mit: sudo ln -sf \"$CLI_TARGET\" \"$BIN_LINK\""
else
  if [ -L "$BIN_LINK" ] || [ -f "$BIN_LINK" ]; then
    info "Symlink existiert — aktualisiere..."
    sudo rm -f "$BIN_LINK"
  fi

  sudo ln -s "$CLI_TARGET" "$BIN_LINK"
  ok "infactory → $BIN_LINK  [$CLI_LABEL]"
fi

# ─── NGINX Proxy-Configs ─────────────────────────────────────────────────────

PROXY_DIR="/etc/nginx/proxy"
if [ -d "$PROXY_DIR" ] && [ -f "$INSTALL_DIR/infactory-server/nginx/xed.conf" ]; then
  cp "$INSTALL_DIR/infactory-server/nginx/xed.conf" "$PROXY_DIR/xed.conf"
  ok "NGINX Proxy-Config: $PROXY_DIR/xed.conf"
fi

# ─── Service-Restart → Delegation an v2 ──────────────────────────────────────
# `infactory server restart` iteriert alle konfigurierten infactory-Services
# (Multi-Site) und startet sie neu. Aktive Services: restart. Gestoppte aber
# enabled: startet via systemctl restart (akzeptiert beide Zustaende).

RESTARTED=0
if [ -f "$INFACTORY_V2_BIN" ]; then
  info "Service-Restart via 'infactory server restart'..."
  # Einmal aufrufen; Exit-Code nicht propagieren (Update soll trotz einzelner
  # Failures abschliessen — Fehler werden in der CLI-Ausgabe gezeigt).
  "$NODE_BIN" "$INFACTORY_V2_BIN" server restart || true
  RESTARTED=1
else
  warn "v2-CLI nicht verfuegbar — Service-Restart uebersprungen."
fi

# ─── Zusammenfassung ─────────────────────────────────────────────────────────

CLI_VERSION=$(node -p "require('$INSTALL_DIR/infactory-cli/package.json').version" 2>/dev/null || echo "?")
SERVER_VERSION=$(node -p "require('$INSTALL_DIR/infactory-server/package.json').version" 2>/dev/null || echo "?")
CLI_V2_VERSION=$(node -p "require('$INSTALL_DIR/infactory-cli-v2/package.json').version" 2>/dev/null || echo "-")
HEAD_SHORT=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")

echo ""
echo -e "  ${GREEN}${BOLD}Installation abgeschlossen!${NC}"
echo ""
echo "  CLI:       v${CLI_VERSION} (alt, Track-B)"
echo "  CLI v2:    v${CLI_V2_VERSION} (neu, Track-A aktiv)"
echo "  Server:    v${SERVER_VERSION}"
echo "  Commit:    ${HEAD_SHORT}"
echo "  Pfad:      $INSTALL_DIR/"
[ -d "$VENV_DIR/bin" ] && echo "  Venv:      $VENV_DIR/"
echo "  Refs:      $REFERENCES_DIR/"
echo "  Symlink:   $BIN_LINK → $CLI_TARGET"
[ "$RESTARTED" = "1" ] && echo "  Restart:   via 'infactory server restart' (siehe Ausgabe oben)"
echo ""
echo -e "  ${BOLD}Nächste Schritte:${NC}"
echo ""
echo "  Status (alle Services):"
echo -e "    ${BOLD}infactory health${NC}"
echo ""
echo "  Track A — Site einrichten:"
echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/install.sh | bash -s setup <tld>${NC}"
echo ""
echo "  Studio-Payload (Puck Visual Editor):"
echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh | bash${NC}"
echo ""
echo -e "  Docs:   ${BLUE}https://studio.xed.dev${NC}"
echo -e "  GitHub: ${BLUE}https://github.com/XED-dev/Studio${NC}"
echo ""
