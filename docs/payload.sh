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
    # Fehlende Nicht-Secret-Vars ergaenzen (ohne bestehende Werte zu ueberschreiben)
    local patched=0
    if ! grep -q 'NEXT_PUBLIC_BASE_PATH' "$ENV_FILE"; then
      echo 'NEXT_PUBLIC_BASE_PATH=/studio' >> "$ENV_FILE"
      patched=$((patched + 1))
    fi
    if ! grep -q 'NEXT_PUBLIC_SERVER_URL' "$ENV_FILE"; then
      echo "NEXT_PUBLIC_SERVER_URL=https://jam.$TLD/studio" >> "$ENV_FILE"
      patched=$((patched + 1))
    fi
    if ! grep -q 'BETTER_AUTH_URL' "$ENV_FILE"; then
      echo "BETTER_AUTH_URL=https://jam.$TLD/studio" >> "$ENV_FILE"
      patched=$((patched + 1))
    fi
    if [ "$patched" -gt 0 ]; then
      ok "$patched fehlende Env-Var(s) ergaenzt in $ENV_FILE"
    fi
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

  # ── DB-Permissions (migrate laeuft als root, Service als g-host) ──
  # SQLite WAL-Mode braucht Schreibrechte auf DB + Verzeichnis + WAL/SHM
  chmod 775 "$SITE_DIR"
  local DB_FILE="$SITE_DIR/payload.db"
  if [ -f "$DB_FILE" ]; then
    chown g-host:g-host "$DB_FILE"
    chmod 664 "$DB_FILE"
    for ext in -wal -shm; do
      [ -f "${DB_FILE}${ext}" ] && chown g-host:g-host "${DB_FILE}${ext}" && chmod 664 "${DB_FILE}${ext}"
    done
    ok "DB-Permissions: $SITE_DIR 775, payload.db g-host:g-host 664"
  fi

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

  # ── NGINX xed.conf prüfen ──
  if [ ! -f "/etc/nginx/proxy/xed.conf" ]; then
    warn "NGINX Proxy-Config fehlt: /etc/nginx/proxy/xed.conf"
    echo "  Zuerst ausführen: curl -fsSL https://studio.xed.dev/install.sh | bash"
  fi

  echo ""
  echo -e "  ${YELLOW}NGINX-Route einrichten${NC} (falls noch nicht vorhanden):"
  echo -e "  Füge in die jam.$TLD Config diesen Einzeiler ein:"
  echo ""
  echo -e "    ${BOLD}location ~ ^/(studio|_next|api|next|media)(/|\$) {"
  echo -e "        proxy_pass http://127.0.0.1:${PORT};"
  echo -e "        include /etc/nginx/proxy/xed.conf;"
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

  # ── Fehlende Env-Vars in bestehenden Sites ergaenzen ──
  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    local ENV_PATCH="$SITE_BASE/$d/studio-payload.env"
    if [ -f "$ENV_PATCH" ]; then
      local patched=0
      if ! grep -q 'NEXT_PUBLIC_BASE_PATH' "$ENV_PATCH"; then
        echo 'NEXT_PUBLIC_BASE_PATH=/studio' >> "$ENV_PATCH"
        patched=$((patched + 1))
      fi
      if ! grep -q 'NEXT_PUBLIC_SERVER_URL' "$ENV_PATCH"; then
        echo "NEXT_PUBLIC_SERVER_URL=https://jam.$d/studio" >> "$ENV_PATCH"
        patched=$((patched + 1))
      fi
      if ! grep -q 'BETTER_AUTH_URL' "$ENV_PATCH"; then
        echo "BETTER_AUTH_URL=https://jam.$d/studio" >> "$ENV_PATCH"
        patched=$((patched + 1))
      fi
      if [ "$patched" -gt 0 ]; then
        ok "$d: $patched fehlende Env-Var(s) ergaenzt"
      fi
    fi
  done

  # ── Migrate alle bestehenden Sites ──
  local migrated=0
  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
      info "Migrate: $d..."
      cd "$INSTALL_DIR"
      set -a; source "$SITE_BASE/$d/studio-payload.env"; set +a
      pnpm payload migrate 2>/dev/null && ok "Migrate $d erfolgreich" || warn "Migrate $d fehlgeschlagen"
      # DB-Permissions (migrate laeuft als root, Service als g-host)
      chmod 775 "$SITE_BASE/$d"
      local DB_UP="$SITE_BASE/$d/payload.db"
      if [ -f "$DB_UP" ]; then
        chown g-host:g-host "$DB_UP"
        chmod 664 "$DB_UP"
        for ext in -wal -shm; do
          [ -f "${DB_UP}${ext}" ] && chown g-host:g-host "${DB_UP}${ext}" && chmod 664 "${DB_UP}${ext}"
        done
      fi
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
  # Env-Vars laden (NEXT_PUBLIC_* werden zur Build-Zeit ausgewertet)
  for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
    if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
      set -a; source "$SITE_BASE/$d/studio-payload.env"; set +a
      break  # Erste Site fuer Build-Env reicht
    fi
  done
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
# COMMAND: create-admin — Ersten Admin-User anlegen
# ══════════════════════════════════════════════════════════════════════════════

cmd_create_admin() {
  local TLD="$1"
  local EMAIL="$2"
  local SITE_DIR="$SITE_BASE/$TLD"
  local ENV_FILE="$SITE_DIR/studio-payload.env"
  local DB_FILE="$SITE_DIR/payload.db"

  echo ""
  echo -e "  ${BOLD}Studio-Payload — Ersten Admin-User anlegen${NC}"
  echo ""

  if [ ! -f "$ENV_FILE" ]; then
    err "Site $TLD nicht eingerichtet. Zuerst: payload.sh setup $TLD"
    exit 1
  fi

  if [ ! -f "$DB_FILE" ]; then
    err "DB nicht gefunden: $DB_FILE — Zuerst: payload.sh (Install/Update)"
    exit 1
  fi

  # Sicherheitscheck: Nur wenn noch KEIN Admin-User existiert
  local ADMIN_COUNT
  ADMIN_COUNT=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM users WHERE role='admin';" 2>/dev/null || echo "0")
  if [ "$ADMIN_COUNT" -gt 0 ]; then
    err "Es existiert bereits ein Admin-User. Dieser Befehl ist nur fuer die Ersteinrichtung."
    echo "  Bestehende Admins: $ADMIN_COUNT"
    exit 1
  fi

  # Port ermitteln + Service pruefen
  local PORT=$(tld_to_port "$TLD")
  local SVC=$(tld_to_service "$TLD")
  if ! systemctl is-active --quiet "$SVC" 2>/dev/null; then
    err "$SVC laeuft nicht. Zuerst: systemctl start $SVC"
    exit 1
  fi

  # Passwort interaktiv abfragen (nicht in Kommandozeile/History)
  # Prüfen ob stdin ein Terminal ist (funktioniert nicht mit curl | bash)
  if [ ! -t 0 ]; then
    err "Dieser Befehl benötigt interaktive Eingabe."
    echo "  Bitte so ausführen (nicht über Pipe):"
    echo ""
    echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh -o /tmp/payload.sh${NC}"
    echo -e "    ${BOLD}bash /tmp/payload.sh create-admin $TLD $EMAIL${NC}"
    echo ""
    exit 1
  fi

  local PASSWORD
  read -s -p "  Passwort für $EMAIL: " PASSWORD
  echo ""
  if [ ${#PASSWORD} -lt 8 ]; then
    err "Passwort muss mindestens 8 Zeichen haben."
    exit 1
  fi
  local PASSWORD2
  read -s -p "  Passwort wiederholen: " PASSWORD2
  echo ""
  if [ "$PASSWORD" != "$PASSWORD2" ]; then
    err "Passwörter stimmen nicht überein."
    exit 1
  fi

  # User via better-auth API anlegen (localhost — kein externer Zugriff)
  info "Erstelle Admin-User: $EMAIL..."
  local RESPONSE
  RESPONSE=$(curl -sf "http://127.0.0.1:$PORT/api/auth/sign-up/email" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Admin\"}" 2>/dev/null) || true

  local USER_ID
  USER_ID=$(echo "$RESPONSE" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).user.id)}catch{console.log('')}})" 2>/dev/null)

  if [ -z "$USER_ID" ]; then
    if echo "$RESPONSE" | grep -q "ALREADY_EXISTS"; then
      warn "User $EMAIL existiert bereits — setze Rolle auf admin"
    else
      err "User-Erstellung fehlgeschlagen: $RESPONSE"
      exit 1
    fi
  else
    ok "User erstellt: ID $USER_ID"
  fi

  # Rolle auf admin setzen
  sqlite3 "$DB_FILE" "UPDATE users SET role='admin' WHERE email='$EMAIL';"
  local ROLE
  ROLE=$(sqlite3 "$DB_FILE" "SELECT role FROM users WHERE email='$EMAIL';")
  if [ "$ROLE" = "admin" ]; then
    ok "Rolle gesetzt: admin"
  else
    err "Rolle konnte nicht gesetzt werden (aktuell: $ROLE)"
    exit 1
  fi

  echo ""
  echo -e "  ${GREEN}${BOLD}Admin-User angelegt!${NC}"
  echo ""
  echo "  Email:    $EMAIL"
  echo "  Rolle:    admin"
  echo "  Login:    https://jam.$TLD/studio/admin/login"
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: admin list — Alle User anzeigen
# ══════════════════════════════════════════════════════════════════════════════

cmd_admin_list() {
  local TLD="$1"
  local DB_FILE="$SITE_BASE/$TLD/payload.db"

  echo ""
  echo -e "  ${BOLD}Studio-Payload — User-Liste${NC} ($TLD)"
  echo ""

  if [ ! -f "$DB_FILE" ]; then
    err "DB nicht gefunden: $DB_FILE"
    exit 1
  fi

  echo -e "  ${BOLD}ID  | Rolle  | Email                        | Erstellt${NC}"
  echo "  ----|--------|------------------------------|--------------------"
  sqlite3 "$DB_FILE" "SELECT id, role, email, created_at FROM users ORDER BY id;" | while IFS='|' read -r id role email created; do
    printf "  %-4s| %-7s| %-29s| %s\n" "$id" "$role" "$email" "$created"
  done
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: admin reset-password — Passwort zurücksetzen
# ══════════════════════════════════════════════════════════════════════════════

cmd_admin_reset_password() {
  local TLD="$1"
  local EMAIL="$2"
  local SITE_DIR="$SITE_BASE/$TLD"
  local DB_FILE="$SITE_DIR/payload.db"

  echo ""
  echo -e "  ${BOLD}Studio-Payload — Passwort zurücksetzen${NC}"
  echo ""

  if [ ! -f "$DB_FILE" ]; then
    err "DB nicht gefunden: $DB_FILE"
    exit 1
  fi

  # Prüfen ob User existiert
  local USER_EXISTS
  USER_EXISTS=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM users WHERE email='$EMAIL';")
  if [ "$USER_EXISTS" -eq 0 ]; then
    err "User $EMAIL existiert nicht."
    cmd_admin_list "$TLD"
    exit 1
  fi

  # Service prüfen
  local PORT=$(tld_to_port "$TLD")
  local SVC=$(tld_to_service "$TLD")
  if ! systemctl is-active --quiet "$SVC" 2>/dev/null; then
    err "$SVC läuft nicht. Zuerst: systemctl start $SVC"
    exit 1
  fi

  # Interaktive Eingabe prüfen
  if [ ! -t 0 ]; then
    err "Dieser Befehl benötigt interaktive Eingabe."
    echo "  Bitte so ausführen:"
    echo ""
    echo -e "    ${BOLD}curl -fsSL https://studio.xed.dev/payload.sh -o /tmp/payload.sh${NC}"
    echo -e "    ${BOLD}bash /tmp/payload.sh admin reset-password $TLD $EMAIL${NC}"
    echo ""
    exit 1
  fi

  local PASSWORD
  read -s -p "  Neues Passwort für $EMAIL: " PASSWORD
  echo ""
  if [ ${#PASSWORD} -lt 8 ]; then
    err "Passwort muss mindestens 8 Zeichen haben."
    exit 1
  fi
  local PASSWORD2
  read -s -p "  Passwort wiederholen: " PASSWORD2
  echo ""
  if [ "$PASSWORD" != "$PASSWORD2" ]; then
    err "Passwörter stimmen nicht überein."
    exit 1
  fi

  # Passwort-Hash über better-auth generieren:
  # User löschen und neu anlegen (better-auth hat keinen direkten Passwort-Update)
  info "Setze Passwort zurück..."

  # Aktuelle Rolle merken
  local CURRENT_ROLE
  CURRENT_ROLE=$(sqlite3 "$DB_FILE" "SELECT role FROM users WHERE email='$EMAIL';")

  # User und zugehörige Sessions/Accounts löschen
  local USER_ID
  USER_ID=$(sqlite3 "$DB_FILE" "SELECT id FROM users WHERE email='$EMAIL';")
  sqlite3 "$DB_FILE" "DELETE FROM sessions WHERE user_id='$USER_ID';"
  sqlite3 "$DB_FILE" "DELETE FROM accounts WHERE user_id='$USER_ID';"
  sqlite3 "$DB_FILE" "DELETE FROM users WHERE id='$USER_ID';"
  ok "Alter User entfernt (ID $USER_ID)"

  # Neu anlegen via API (erstellt korrekten Passwort-Hash)
  local RESPONSE
  RESPONSE=$(curl -sf "http://127.0.0.1:$PORT/api/auth/sign-up/email" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Admin\"}" 2>/dev/null) || true

  local NEW_ID
  NEW_ID=$(echo "$RESPONSE" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).user.id)}catch{console.log('')}})" 2>/dev/null)

  if [ -z "$NEW_ID" ]; then
    err "User-Erstellung fehlgeschlagen: $RESPONSE"
    exit 1
  fi

  # Rolle wiederherstellen
  sqlite3 "$DB_FILE" "UPDATE users SET role='$CURRENT_ROLE' WHERE id='$NEW_ID';"
  ok "Passwort zurückgesetzt, Rolle: $CURRENT_ROLE"

  echo ""
  echo -e "  ${GREEN}${BOLD}Passwort erfolgreich geändert!${NC}"
  echo ""
  echo "  Email:    $EMAIL"
  echo "  Rolle:    $CURRENT_ROLE"
  echo "  Login:    https://jam.$TLD/studio/admin/login"
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: admin set-role — Rolle ändern (user ↔ admin)
# ══════════════════════════════════════════════════════════════════════════════

cmd_admin_set_role() {
  local TLD="$1"
  local EMAIL="$2"
  local NEW_ROLE="$3"
  local DB_FILE="$SITE_BASE/$TLD/payload.db"

  echo ""
  echo -e "  ${BOLD}Studio-Payload — Rolle ändern${NC}"
  echo ""

  if [ ! -f "$DB_FILE" ]; then
    err "DB nicht gefunden: $DB_FILE"
    exit 1
  fi

  # Rolle validieren
  if [ "$NEW_ROLE" != "admin" ] && [ "$NEW_ROLE" != "user" ]; then
    err "Ungültige Rolle: $NEW_ROLE (erlaubt: admin, user)"
    exit 1
  fi

  # Prüfen ob User existiert
  local OLD_ROLE
  OLD_ROLE=$(sqlite3 "$DB_FILE" "SELECT role FROM users WHERE email='$EMAIL';")
  if [ -z "$OLD_ROLE" ]; then
    err "User $EMAIL existiert nicht."
    cmd_admin_list "$TLD"
    exit 1
  fi

  if [ "$OLD_ROLE" = "$NEW_ROLE" ]; then
    ok "User $EMAIL hat bereits die Rolle: $NEW_ROLE"
    return
  fi

  # Sicherheitscheck: Nicht den letzten Admin degradieren
  if [ "$OLD_ROLE" = "admin" ] && [ "$NEW_ROLE" = "user" ]; then
    local ADMIN_COUNT
    ADMIN_COUNT=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM users WHERE role='admin';")
    if [ "$ADMIN_COUNT" -le 1 ]; then
      err "Kann den letzten Admin-User nicht degradieren."
      exit 1
    fi
  fi

  sqlite3 "$DB_FILE" "UPDATE users SET role='$NEW_ROLE' WHERE email='$EMAIL';"
  ok "$EMAIL: $OLD_ROLE → $NEW_ROLE"

  echo ""
  cmd_admin_list "$TLD"
}

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: admin delete — User löschen
# ══════════════════════════════════════════════════════════════════════════════

cmd_admin_delete() {
  local TLD="$1"
  local EMAIL="$2"
  local DB_FILE="$SITE_BASE/$TLD/payload.db"

  echo ""
  echo -e "  ${BOLD}Studio-Payload — User löschen${NC}"
  echo ""

  if [ ! -f "$DB_FILE" ]; then
    err "DB nicht gefunden: $DB_FILE"
    exit 1
  fi

  local USER_ID
  USER_ID=$(sqlite3 "$DB_FILE" "SELECT id FROM users WHERE email='$EMAIL';")
  if [ -z "$USER_ID" ]; then
    err "User $EMAIL existiert nicht."
    exit 1
  fi

  local ROLE
  ROLE=$(sqlite3 "$DB_FILE" "SELECT role FROM users WHERE email='$EMAIL';")

  # Sicherheitscheck: Nicht den letzten Admin löschen
  if [ "$ROLE" = "admin" ]; then
    local ADMIN_COUNT
    ADMIN_COUNT=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM users WHERE role='admin';")
    if [ "$ADMIN_COUNT" -le 1 ]; then
      err "Kann den letzten Admin-User nicht löschen."
      exit 1
    fi
  fi

  info "Lösche User: $EMAIL (ID $USER_ID, Rolle $ROLE)..."
  sqlite3 "$DB_FILE" "DELETE FROM sessions WHERE user_id='$USER_ID';"
  sqlite3 "$DB_FILE" "DELETE FROM accounts WHERE user_id='$USER_ID';"
  sqlite3 "$DB_FILE" "DELETE FROM users WHERE id='$USER_ID';"
  ok "User gelöscht"

  echo ""
  cmd_admin_list "$TLD"
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
  create-admin)
    if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
      err "Verwendung: bash -s create-admin <tld> <email>"
      echo -e "     Beispiel: ${BOLD}bash /tmp/payload.sh create-admin steirischursprung.at admin@example.com${NC}"
      echo "  Passwort wird interaktiv abgefragt."
      exit 1
    fi
    cmd_create_admin "$2" "$3"
    ;;
  admin)
    case "${2:-}" in
      list)
        if [ -z "${3:-}" ]; then
          err "Verwendung: bash -s admin list <tld>"
          exit 1
        fi
        cmd_admin_list "$3"
        ;;
      reset-password)
        if [ -z "${3:-}" ] || [ -z "${4:-}" ]; then
          err "Verwendung: bash -s admin reset-password <tld> <email>"
          echo -e "     Beispiel: ${BOLD}bash /tmp/payload.sh admin reset-password steirischursprung.at admin@example.com${NC}"
          exit 1
        fi
        cmd_admin_reset_password "$3" "$4"
        ;;
      set-role)
        if [ -z "${3:-}" ] || [ -z "${4:-}" ] || [ -z "${5:-}" ]; then
          err "Verwendung: bash -s admin set-role <tld> <email> <admin|user>"
          echo -e "     Beispiel: ${BOLD}bash /tmp/payload.sh admin set-role steirischursprung.at user@example.com admin${NC}"
          exit 1
        fi
        cmd_admin_set_role "$3" "$4" "$5"
        ;;
      delete)
        if [ -z "${3:-}" ] || [ -z "${4:-}" ]; then
          err "Verwendung: bash -s admin delete <tld> <email>"
          exit 1
        fi
        cmd_admin_delete "$3" "$4"
        ;;
      *)
        echo ""
        echo -e "  ${BOLD}Studio-Payload Admin-Befehle:${NC}"
        echo ""
        echo "  bash /tmp/payload.sh create-admin <tld> <email>                    Ersten Admin anlegen"
        echo "  bash /tmp/payload.sh admin list <tld>                              Alle User anzeigen"
        echo "  bash /tmp/payload.sh admin set-role <tld> <email> <admin|user>     Rolle ändern"
        echo "  bash /tmp/payload.sh admin reset-password <tld> <email>            Passwort zurücksetzen"
        echo "  bash /tmp/payload.sh admin delete <tld> <email>                    User löschen"
        echo ""
        ;;
    esac
    ;;
  status)
    cmd_status
    ;;
  *)
    cmd_install
    ;;
esac
