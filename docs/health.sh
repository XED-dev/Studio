#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# inFactory Health Check — prueft ALLE Services auf 025-CBU-5025
#
# Verwendung:
#   curl -fsSL https://studio.xed.dev/health.sh | bash              # Pruefen
#   curl -fsSL https://studio.xed.dev/health.sh | bash -s fix       # Pruefen + Auto-Fix
#   curl -fsSL https://studio.xed.dev/health.sh | bash -s cron      # Crontab einrichten
#   curl -fsSL https://studio.xed.dev/health.sh | bash -s uncron    # Crontab entfernen
#
# Als Crontab (alle 5 Minuten, auto-fix):
#   */5 * * * * curl -fsSL https://studio.xed.dev/health.sh | bash -s fix >> /var/log/infactory-health.log 2>&1
# ──────────────────────────────────────────────────────────────────────────────

set -uo pipefail

SITE_BASE="/var/xed"
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
err()  { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
ERRORS=0
FIXES=0
AUTO_FIX="${1:-}"

# ══════════════════════════════════════════════════════════════════════════════
# COMMAND: cron — Crontab einrichten
# ══════════════════════════════════════════════════════════════════════════════

if [ "$AUTO_FIX" = "cron" ]; then
  echo ""
  echo -e "  ${BOLD}inFactory Health — Crontab Setup${NC}"
  echo ""

  # Pruefen ob bereits vorhanden
  if crontab -l 2>/dev/null | grep -q "infactory-health"; then
    ok "Crontab bereits eingerichtet"
    crontab -l 2>/dev/null | grep "infactory-health"
  else
    # Bestehende crontab + neue Zeile
    (crontab -l 2>/dev/null; echo ""; echo "$CRON_LINE") | crontab -
    ok "Crontab eingerichtet (alle 5 Minuten)"
    echo "  Log: $LOG_FILE"
  fi

  # Log-Datei vorbereiten
  touch "$LOG_FILE"
  chmod 644 "$LOG_FILE"

  echo ""
  echo "  Entfernen: curl -fsSL https://studio.xed.dev/health.sh | bash -s uncron"
  echo ""
  exit 0
fi

if [ "$AUTO_FIX" = "uncron" ]; then
  echo ""
  echo -e "  ${BOLD}inFactory Health — Crontab entfernen${NC}"
  echo ""
  crontab -l 2>/dev/null | grep -v "infactory-health" | grep -v "studio.xed.dev/health.sh" | crontab -
  ok "Crontab entfernt"
  echo ""
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "  ${BOLD}inFactory Health Check${NC} — $TIMESTAMP"
if [ "$AUTO_FIX" = "fix" ]; then
  echo -e "  Modus: ${BOLD}Auto-Fix${NC} (gestoppte Services werden neugestartet)"
fi
echo ""

# ── 1. infactory-server (Express, Track A) ──────────────────────────────────

check_infactory_service() {
  local svc="infactory-${1//./-}"
  local port="$2"
  local tld="$1"

  # systemd Status
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    ok "$svc (Port $port) — active"
  else
    err "$svc (Port $port) — DOWN"
    ((ERRORS++))
    if [ "$AUTO_FIX" = "fix" ]; then
      info "Restart: $svc..."
      systemctl restart "$svc" 2>/dev/null
      sleep 2
      if systemctl is-active --quiet "$svc" 2>/dev/null; then
        ok "$svc neugestartet"
        ((FIXES++))
      else
        err "$svc Restart fehlgeschlagen — journalctl -u $svc -n 20"
      fi
    fi
  fi

  # Health-Endpunkt (nur wenn Service aktiv)
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    local health
    health=$(curl -sf "http://127.0.0.1:$port/xed/api/health" 2>/dev/null)
    if [ $? -eq 0 ]; then
      local version
      version=$(echo "$health" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).server.version)}catch{console.log('?')}})" 2>/dev/null || echo "?")
      ok "  /xed/api/health → v$version"
    else
      warn "  /xed/api/health nicht erreichbar (Service laeuft, aber kein Response)"
    fi
  fi
}

# ── 2. studio-payload (Next.js + Puck) ──────────────────────────────────────

check_payload_service() {
  local svc="studio-payload-${1//./-}"
  local port="$2"
  local tld="$1"

  # systemd Status
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    ok "$svc (Port $port) — active"
  else
    err "$svc (Port $port) — DOWN"
    ((ERRORS++))
    if [ "$AUTO_FIX" = "fix" ]; then
      info "Restart: $svc..."
      systemctl restart "$svc" 2>/dev/null
      sleep 3
      if systemctl is-active --quiet "$svc" 2>/dev/null; then
        ok "$svc neugestartet"
        ((FIXES++))
      else
        err "$svc Restart fehlgeschlagen — journalctl -u $svc -n 20"
      fi
    fi
  fi

  # HTTP-Check (nur wenn Service aktiv)
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    local status_code
    status_code=$(curl -sf -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/" 2>/dev/null || echo "000")
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 400 ]; then
      ok "  HTTP localhost:$port → $status_code"
    else
      warn "  HTTP localhost:$port → $status_code"
    fi
  fi
}

# ── 3. NGINX ────────────────────────────────────────────────────────────────

check_nginx() {
  if systemctl is-active --quiet nginx 2>/dev/null; then
    ok "nginx — active"
  else
    err "nginx — DOWN"
    ((ERRORS++))
    if [ "$AUTO_FIX" = "fix" ]; then
      info "Restart: nginx..."
      systemctl restart nginx 2>/dev/null
      sleep 1
      if systemctl is-active --quiet nginx 2>/dev/null; then
        ok "nginx neugestartet"
        ((FIXES++))
      else
        err "nginx Restart fehlgeschlagen"
      fi
    fi
  fi
}

# ── Ausfuehren ──────────────────────────────────────────────────────────────

echo -e "  ${BOLD}NGINX${NC}"
check_nginx
echo ""

# Alle TLDs in /var/xed/ durchgehen
for d in $(ls -1 "$SITE_BASE" 2>/dev/null | sort); do
  [ -d "$SITE_BASE/$d" ] || continue

  echo -e "  ${BOLD}$d${NC}"

  # infactory-server (hat infactory.json)
  if [ -f "$SITE_BASE/$d/infactory.json" ]; then
    local_port=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$SITE_BASE/$d/infactory.json')).port||4368)}catch{console.log(4368)}" 2>/dev/null || echo "4368")
    check_infactory_service "$d" "$local_port"
  fi

  # studio-payload (hat studio-payload.env)
  if [ -f "$SITE_BASE/$d/studio-payload.env" ]; then
    # Port aus systemd Service lesen
    sp_svc_name="studio-payload-${d//./-}"
    sp_svc_port=$(grep -oP '(?<=-p )\d+' "/etc/systemd/system/${sp_svc_name}.service" 2>/dev/null || echo "5368")
    check_payload_service "$d" "$sp_svc_port"
  fi

  echo ""
done

# ── Zusammenfassung ──────────────────────────────────────────────────────────

if [ "$ERRORS" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}Alle Services gesund.${NC}"
else
  echo -e "  ${RED}${BOLD}$ERRORS Problem(e) gefunden.${NC}"
  if [ "$FIXES" -gt 0 ]; then
    echo -e "  ${GREEN}$FIXES davon automatisch behoben.${NC}"
  fi
  if [ "$AUTO_FIX" != "fix" ]; then
    echo -e "  Auto-Fix: ${BOLD}curl -fsSL https://studio.xed.dev/health.sh | bash -s fix${NC}"
  fi
fi
echo ""
