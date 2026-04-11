/**
 * server-manager.js — inFactory Server Lifecycle Management
 *
 * Befehle: install, start, stop, restart, status, update
 *
 * install() erkennt Track anhand cwd:
 *   - cwd unter /var/ghost/<domain>/  → Track A (Ghost Theme Factory, eingefroren)
 *     .infactory/ Verzeichnis, Port = Ghost-Port + 1000
 *   - cwd unter /var/xed/<tld>/       → Track B (LEMP Section-Renderer)
 *     infactory.json direkt in cwd, Port 3370 default, nginx_sites Allowlist,
 *     zentraler Code in /opt/infactory/ (nicht kopiert)
 *
 * Track A ist eingefroren — siehe docs/AGENTS.md Abschnitt 15 und 3.1
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const INFACTORY_DIR = '.infactory';
const CONFIG_FILE   = 'infactory.json';
const REPO_URL      = 'https://github.com/XED-dev/Studio.git';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ghostDir() {
  return process.cwd();
}

function infactoryDir() {
  return path.join(ghostDir(), INFACTORY_DIR);
}

function configPath() {
  return path.join(infactoryDir(), CONFIG_FILE);
}

/**
 * Ghost config.production.json lesen.
 * Gibt URL, Port und andere Ghost-Konfiguration zurück.
 */
function readGhostConfig() {
  const candidates = ['config.production.json', 'config.development.json'];
  for (const name of candidates) {
    const p = path.join(ghostDir(), name);
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const url  = cfg.url || '';
      const port = cfg.server?.port || 2368;
      return {
        configFile: name,
        url,
        port,
        database: cfg.database?.connection?.database || null,
      };
    }
  }
  return null;
}

/**
 * inFactory Config lesen.
 */
function readConfig() {
  const p = configPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * systemd Service-Name aus Ghost-Verzeichnis ableiten.
 * /var/ghost/steirischursprung.at → infactory-steirischursprung-at
 */
function serviceName() {
  const dir = path.basename(ghostDir());
  const slug = dir.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `infactory-${slug}`;
}

// ─── install ──────────────────────────────────────────────────────────────────

async function install(opts = {}) {
  // Track-B Auto-Detect: cwd ist direktes Kind von /var/xed/
  // → kein Ghost-Kontext, nginx_sites Allowlist, zentraler Code in /opt/infactory/
  if (path.dirname(process.cwd()) === '/var/xed') {
    return installTrackB(opts);
  }

  const { verbose = false } = opts;
  const info = (m) => console.log(m);

  info('\n  inFactory Install\n');

  // 1. Ghost erkennen
  const ghost = readGhostConfig();
  if (!ghost) {
    console.error(
      '  ✗  Kein Ghost-Verzeichnis erkannt.\n' +
      '     config.production.json oder config.development.json nicht gefunden.\n\n' +
      '     Wechsle in dein Ghost-Verzeichnis:\n' +
      '     cd /var/ghost/mein-blog && infactory install\n'
    );
    process.exit(1);
  }

  info(`  Ghost erkannt:`);
  info(`     Config:   ${ghost.configFile}`);
  info(`     URL:      ${ghost.url}`);
  info(`     Port:     ${ghost.port}`);
  info(`     Database: ${ghost.database || '(nicht gefunden)'}`);
  info('');

  // 2. inFactory-Port berechnen
  const infactoryPort = ghost.port + 1000;
  info(`  inFactory Port: ${infactoryPort} (Ghost ${ghost.port} + 1000)`);

  // 3. API-Key generieren
  const apiKey = crypto.randomBytes(32).toString('hex');
  info(`  API-Key generiert: ${apiKey.substring(0, 8)}...`);

  // 4. .infactory/ Verzeichnis erstellen
  const ifDir = infactoryDir();
  if (fs.existsSync(ifDir)) {
    info(`\n  .infactory/ existiert bereits — Update-Modus.`);
  } else {
    fs.mkdirSync(ifDir, { recursive: true });
    info(`\n  .infactory/ erstellt`);
  }

  // 5. Code herunterladen (git clone oder Update)
  const serverDir = path.join(ifDir, 'server');
  const cliDir    = path.join(ifDir, 'cli');

  if (!fs.existsSync(path.join(ifDir, '.git'))) {
    info(`  Code klonen von ${REPO_URL}...`);
    try {
      execSync(`git clone --depth 1 ${REPO_URL} _tmp_clone`, {
        cwd: ifDir, stdio: verbose ? 'inherit' : 'pipe',
      });
      // Dateien aus dem Klon in .infactory/ verschieben
      const tmpDir = path.join(ifDir, '_tmp_clone');
      copyDir(path.join(tmpDir, 'infactory-server'), serverDir);
      copyDir(path.join(tmpDir, 'infactory-cli'), cliDir);
      // .git behalten für Updates
      fs.renameSync(path.join(tmpDir, '.git'), path.join(ifDir, '.git'));
      fs.rmSync(tmpDir, { recursive: true, force: true });
      info('  Code installiert');
    } catch (err) {
      console.error(`  ✗  git clone fehlgeschlagen: ${err.message}`);
      process.exit(1);
    }
  } else {
    info('  Code bereits vorhanden — überspringe Clone');
  }

  // 6. npm install
  for (const dir of [serverDir, cliDir]) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      info(`  npm install in ${path.basename(dir)}/...`);
      try {
        execSync('npm install --omit=dev', {
          cwd: dir, stdio: verbose ? 'inherit' : 'pipe',
        });
      } catch (err) {
        console.error(`  ✗  npm install fehlgeschlagen in ${dir}: ${err.message}`);
        process.exit(1);
      }
    }
  }

  // 7. infactory.json schreiben
  const domain = ghost.url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Prüfe ob globale Installation (install.sh) venv + references hat
  const globalVenv = '/opt/infactory/venv';
  const globalRefs = '/opt/infactory/references';
  const hasVenv = fs.existsSync(path.join(globalVenv, 'bin', 'python3'));
  const hasRefs = fs.existsSync(globalRefs);

  if (hasVenv) info(`  Python venv: ${globalVenv} ✔`);
  else info(`  Python venv: NICHT gefunden (QA deaktiviert)`);
  if (hasRefs) info(`  Referenzen:  ${globalRefs} ✔`);
  else info(`  Referenzen:  NICHT gefunden`);

  const config = {
    version: '1.1.0',
    ghost_url: `http://localhost:${ghost.port}`,
    ghost_port: ghost.port,
    infactory_port: infactoryPort,
    content_path: path.join(ghostDir(), 'content'),
    domain: domain,
    auto_sleep_minutes: 360,
    api_key: apiKey,
    ghost_admin_key: '',  // Muss manuell eingetragen werden
    venv_path: hasVenv ? globalVenv : '',
    references_path: hasRefs ? globalRefs : '',
    installed_at: new Date().toISOString(),
  };

  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
  info(`  infactory.json geschrieben`);

  // 8. Presets-Verzeichnis
  const presetsDir = path.join(ifDir, 'presets');
  if (!fs.existsSync(presetsDir)) {
    fs.mkdirSync(presetsDir, { recursive: true });
    // Default-Presets aus CLI kopieren
    const srcPresets = path.join(cliDir, 'presets');
    if (fs.existsSync(srcPresets)) {
      for (const f of fs.readdirSync(srcPresets).filter(f => f.endsWith('.yaml'))) {
        fs.copyFileSync(path.join(srcPresets, f), path.join(presetsDir, f));
      }
      info(`  Presets kopiert`);
    }
  }

  // 9. dist-Verzeichnis
  const distDir = path.join(ifDir, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  // 10. systemd Service
  const svcName = serviceName();
  const serviceFile = `/etc/systemd/system/${svcName}.service`;
  const serviceContent = `[Unit]
Description=inFactory Server (${domain})
After=network.target

[Service]
Type=simple
User=${process.env.USER || 'g-host'}
WorkingDirectory=${ghostDir()}
ExecStart=/usr/bin/node ${serverDir}/src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=INFACTORY_CONFIG=${configPath()}
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/infactory/browsers

[Install]
WantedBy=multi-user.target
`;

  // Service-Datei schreiben + systemd Setup (wie ghost install)
  info(`\n  systemd Setup...`);

  const tmpService = path.join(ifDir, `${svcName}.service`);
  fs.writeFileSync(tmpService, serviceContent, 'utf8');

  try {
    execSync(`sudo cp ${tmpService} ${serviceFile}`, { stdio: 'inherit' });
    execSync('sudo systemctl daemon-reload', { stdio: 'inherit' });
    execSync(`sudo systemctl enable ${svcName}`, { stdio: 'inherit' });
    execSync(`sudo systemctl start ${svcName}`, { stdio: 'inherit' });
    info(`  ✔  Service ${svcName} installiert und gestartet`);
  } catch (err) {
    // Fallback: Anleitung ausgeben wenn sudo fehlschlägt
    console.warn(`\n  ⚠  systemd Setup fehlgeschlagen (sudo nötig).`);
    console.warn(`     Manuell ausführen:\n`);
    console.warn(`     sudo cp ${tmpService} ${serviceFile}`);
    console.warn(`     sudo systemctl daemon-reload`);
    console.warn(`     sudo systemctl enable ${svcName}`);
    console.warn(`     sudo systemctl start ${svcName}\n`);
  }

  info(`\n  ═══════════════════════════════════════════════════`);
  info(`  Installation abgeschlossen!`);
  info(`  ═══════════════════════════════════════════════════`);

  // Ghost Admin Key prüfen
  if (!config.ghost_admin_key) {
    info(`\n  Die nächsten SysOps Schritte:\n`);
    info(`  1. Ghost Admin API Key eintragen:`);
    info(`     Ghost Admin → Settings → Integrations → Add custom integration → Name: inFactory Studio`);
    info(`       Content API Key: * (wird automatisch erstellt)`);
    info(`       Admin API Key: * (wird automatisch erstellt)`);
    info(`       API URL: * (wird automatisch erstellt)\n`);
    info(`     Dann eintragen: nano ${configPath()}`);
    info(`     "ghost_admin_key": "<Admin-API-Key>",\n`);
  }

  info(`  API-Key (für AI Agent): ${apiKey}`);
  info(`  Server: http://localhost:${infactoryPort}/api/health`);
  info(`  Status: infactory status\n`);
}

// ─── installTrackB (LEMP Section-Renderer) ──────────────────────────────────
//
// Track B unterscheidet sich von Track A grundlegend:
//   - cwd ist /var/xed/<tld>/ (nicht /var/ghost/<domain>/)
//   - kein Ghost-Kontext, kein config.production.json
//   - Code zentral in /opt/infactory/ (nicht kopiert pro Site wie Track A)
//   - infactory.json direkt in cwd (nicht in .infactory/)
//   - nginx_sites Allowlist für POST /xed/api/nginx/write
//   - setfacl auf WordOps-Webroots
//
// Siehe dev/bin/XED-Studio/docs/WHITEPAPER.md Abschnitt 13.6 + 21

async function installTrackB(opts = {}) {
  const { verbose = false } = opts;
  const info = (m) => console.log(m);
  const warn = (m) => console.warn(m);
  const fail = (m) => { console.error(m); process.exit(1); };

  const cwd    = process.cwd();
  const domain = path.basename(cwd);

  info('\n  inFactory Install — Track B (LEMP Section-Renderer)\n');
  info(`  Domain:   ${domain}`);
  info(`  Source:   ${cwd}`);

  // 0. Schreibrechte auf cwd prüfen
  try { fs.accessSync(cwd, fs.constants.W_OK); }
  catch {
    fail(
      `\n  ✗  ${cwd} ist nicht beschreibbar.\n` +
      `     Setup als root:\n` +
      `     mkdir -p ${cwd} && chown -R g-host:g-host ${cwd}\n`
    );
  }

  // 1. Port (Default 3370, überschreibbar via --port=)
  const infactoryPort = opts.port ? parseInt(opts.port, 10) : 3370;
  info(`  Port:     ${infactoryPort}`);

  // Port-Kollision (best effort; ss optional)
  try {
    const out = execSync('ss -ltn 2>/dev/null', { encoding: 'utf8' });
    const blocked = out.split('\n').some(line => {
      const m = line.match(/:(\d+)\s/);
      return m && parseInt(m[1], 10) === infactoryPort;
    });
    if (blocked) {
      fail(
        `\n  ✗  Port ${infactoryPort} ist bereits belegt.\n` +
        `     Blockierenden Prozess stoppen oder --port=<anderer-port> nutzen.\n`
      );
    }
  } catch { /* ss nicht verfügbar → weiter */ }

  // 2. API-Key — /var/xed/<tld>/infactory.json ist Single-Source-of-Truth.
  //    Re-Install: bestehenden Key weiterverwenden (Idempotenz — curl-Kommandos
  //                des Users bleiben gültig).
  //    Erst-Install: frisch generieren.
  //
  //    /tmp/.infactory.api.key wird bewusst NICHT als Cache verwendet. In Session 19
  //    lag dort ein Ghost-Admin-Key im Format <id>:<secret> und unser Code hat ihn als
  //    "nicht 64-hex" ignoriert — das führte nur zu Verwirrung. Ein "irgendwo im /tmp"
  //    Cache ist ohnehin nicht multi-site-fähig. Die Wahrheit ist die infactory.json.
  const cfgPath = path.join(cwd, 'infactory.json');
  let apiKey = null;
  if (fs.existsSync(cfgPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (existing.api_key && /^[0-9a-f]{64}$/.test(existing.api_key)) {
        apiKey = existing.api_key;
        info(`  API-Key:  reuse aus ${cfgPath} (${apiKey.substring(0, 8)}…)`);
      }
    } catch { /* korrupte config → neu generieren */ }
  }
  if (!apiKey) {
    apiKey = crypto.randomBytes(32).toString('hex');
    info(`  API-Key:  neu generiert (${apiKey.substring(0, 8)}…)`);
  }

  // 3. Subdomain-Autodetect: /var/www/*.<domain>/htdocs/ + /var/www/<domain>/htdocs/
  const siteEntries = [];
  try {
    const wwwDirs = fs.readdirSync('/var/www', { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    for (const name of wwwDirs) {
      const isSubOfDomain = name.endsWith('.' + domain);
      const isDomainItself = name === domain;
      if (!isSubOfDomain && !isDomainItself) continue;
      const htdocs = path.join('/var/www', name, 'htdocs');
      if (!fs.existsSync(htdocs)) continue;
      const slug = isDomainItself
        ? 'root'
        : name.slice(0, -(domain.length + 1)).replace(/\./g, '_');
      siteEntries.push({ slug, webroot: htdocs + '/' });
    }
  } catch (err) {
    fail(`\n  ✗  /var/www nicht lesbar: ${err.message}\n`);
  }

  if (siteEntries.length === 0) {
    fail(
      `\n  ✗  Keine WordOps-Sites für ${domain} gefunden.\n` +
      `     Erwartet: /var/www/<sub>.${domain}/htdocs/\n` +
      `     Prüfe:    ls -d /var/www/*.${domain}/htdocs/ 2>/dev/null\n`
    );
  }

  const nginxSites = {};
  for (const { slug, webroot } of siteEntries) {
    nginxSites[slug] = { webroot };
    info(`  Site:     ${slug.padEnd(10)} → ${webroot}`);
  }

  // 4. Globale venv/references-Verzeichnisse (install.sh)
  const globalVenv = '/opt/infactory/venv';
  const globalRefs = '/opt/infactory/references';
  const hasVenv = fs.existsSync(path.join(globalVenv, 'bin', 'python3'));
  const hasRefs = fs.existsSync(globalRefs);
  info(`  Venv:     ${hasVenv ? globalVenv + ' ✔' : '(nicht gefunden, QA deaktiviert)'}`);
  info(`  Refs:     ${hasRefs ? globalRefs + ' ✔' : '(nicht gefunden)'}`);

  // 5. infactory.json schreiben (mode 0600)
  const config = {
    version: '1.2.0',
    domain,
    infactory_port: infactoryPort,
    api_key: apiKey,
    auto_sleep_minutes: 360,
    ghost_url: '',
    ghost_admin_key: '',
    nginx_sites: nginxSites,
    venv_path: hasVenv ? globalVenv : '',
    references_path: hasRefs ? globalRefs : '',
    installed_at: new Date().toISOString(),
  };
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  info(`\n  ✔  ${cfgPath}`);

  // 6. systemd-Service
  const svcName = serviceName();
  const svcFile = `/etc/systemd/system/${svcName}.service`;
  const svcContent = `[Unit]
Description=inFactory Server — Track B (${domain})
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=${cwd}
ExecStart=/usr/bin/node /opt/infactory/infactory-server/src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=INFACTORY_CONFIG=${cfgPath}
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/infactory/browsers

[Install]
WantedBy=multi-user.target
`;
  const tmpSvc = path.join(cwd, `${svcName}.service`);
  fs.writeFileSync(tmpSvc, svcContent, 'utf8');
  info(`  ✔  ${tmpSvc}`);

  // 7. finish-install-as-root.sh — sammelt ALLE Root-Operationen in EIN Script.
  //    Rationale: g-host hat in der Regel kein passwortloses sudo. Anstatt den User
  //    mit 4+ verstreuten "sudo Befehl"-Zeilen zu bombardieren, bekommt er EINE
  //    klare Aktion: `sudo bash <pfad>`. Open-Source-Support-fähig.
  //    Das Script räumt sich nach Erfolg selbst auf (rm -f am Ende).
  const finishScript = path.join(cwd, 'finish-install-as-root.sh');
  const aclLines = siteEntries.map(({ slug, webroot }) => {
    const wr = webroot.replace(/\/$/, '');
    return `setfacl -R -m  u:g-host:rwx ${wr}   # ${slug}\n` +
           `setfacl -R -dm u:g-host:rwx ${wr}   # ${slug} (default)`;
  }).join('\n');

  const finishContent = `#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-generiert von 'infactory install' (Track B) — ${domain}
# ${new Date().toISOString()}
#
# Diese Operationen benoetigen root. Ausfuehren als:
#   sudo bash ${finishScript}
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SVC="${svcName}"
SVC_SRC="${tmpSvc}"
SVC_DST="${svcFile}"

echo '→ systemd-Service installieren'
cp "$SVC_SRC" "$SVC_DST"
systemctl daemon-reload
systemctl enable "$SVC"

echo '→ ACL fuer WordOps-Webroots'
${aclLines}

echo '→ Service (re)starten'
systemctl restart "$SVC"
sleep 1

if ! systemctl is-active --quiet "$SVC"; then
  echo "  ✗  $SVC ist nicht active"
  journalctl -u "$SVC" -n 30 --no-pager
  exit 1
fi
echo "  ✔  $SVC active"

echo '→ Health-Check'
if curl -sf -o /dev/null "http://localhost:${infactoryPort}/api/health"; then
  echo "  ✔  http://localhost:${infactoryPort}/api/health"
else
  echo "  ✗  Health-Check fehlgeschlagen"
  echo "     curl -v http://localhost:${infactoryPort}/api/health"
  exit 1
fi

echo ''
echo '════════════════════════════════════════════════════'
echo '  Track-B Finish abgeschlossen — ${domain}'
echo '════════════════════════════════════════════════════'

# Selbstaufraeumung nach Erfolg
rm -f "$SVC_SRC" "${finishScript}"
`;
  fs.writeFileSync(finishScript, finishContent, { mode: 0o755 });
  info(`  ✔  ${finishScript}`);

  // 8. Root-Operationen ausfuehren. Drei-Stufen-Logik (Ghost-kompatible UX):
  //
  //    Stufe 1: NOPASSWD-Probe via `sudo -n true`.
  //             `-n` = non-interactive; unterdrueckt nur den Prompt, bypassed
  //             KEINE Permissions. Erfolgt dieser Probe, existiert eine explizite
  //             NOPASSWD-Regel in sudoers → Script laeuft still durch.
  //
  //    Stufe 2: Kein NOPASSWD, aber interaktives Terminal vorhanden
  //             (process.stdin.isTTY) → `sudo bash ...` ohne `-n`, sudo prompted
  //             den User normal nach Passwort. Gleiche UX wie `ghost install`.
  //
  //    Stufe 3: Kein NOPASSWD, kein TTY (z.B. bei `su - g-host -c 'infactory install'`
  //             ohne echtes Terminal im Subprozess) → direkt Fallback auf die
  //             manuelle Ausfuehrung des finish-Scripts.
  info(`\n  Root-Operationen …`);
  let finishOk = false;

  let canSudoSilent = false;
  try {
    execSync('sudo -n true', { stdio: 'pipe' });
    canSudoSilent = true;
  } catch { /* NOPASSWD nicht verfuegbar */ }

  if (canSudoSilent) {
    try {
      execSync(`sudo -n bash ${finishScript}`, { stdio: 'inherit' });
      finishOk = true;
    } catch { finishOk = false; }
  } else if (process.stdin.isTTY) {
    info(`  sudo-Passwort-Prompt erwartet (interaktiv) …\n`);
    try {
      execSync(`sudo bash ${finishScript}`, { stdio: 'inherit' });
      finishOk = true;
    } catch { finishOk = false; }
  } else {
    // Kein TTY, kein NOPASSWD → nicht versuchen, sauber auf Fallback verweisen
    finishOk = false;
  }

  // 9. Zusammenfassung
  info(`\n  ═══════════════════════════════════════════════════`);
  if (finishOk) {
    info(`  Track-B Installation abgeschlossen`);
  } else {
    info(`  Track-B Installation vorbereitet (root-Schritt ausstehend)`);
  }
  info(`  ═══════════════════════════════════════════════════`);
  info(`  Domain:   ${domain}`);
  info(`  Config:   ${cfgPath}`);
  info(`  Service:  ${svcName}`);
  info(`  Port:     ${infactoryPort}`);
  info(`  Sites:    ${siteEntries.map(s => s.slug).join(', ')}`);
  info(``);

  if (!finishOk) {
    warn(`  Root-Operationen konnten nicht automatisch ausgefuehrt werden`);
    warn(`  (g-host hat kein passwortloses sudo — auf vielen Systemen normal).`);
    warn(``);
    warn(`  Naechster Schritt — EINMALIG als root:`);
    warn(``);
    warn(`      sudo bash ${finishScript}`);
    warn(``);
    warn(`  Das Script installiert den systemd-Service, setzt die ACLs,`);
    warn(`  startet den Service und verifiziert den Health-Endpoint.`);
    warn(`  Nach Erfolg raeumt es sich selbst auf.`);
    warn(``);
  }

  info(`  Test via curl (API-Key aus infactory.json extrahieren):`);
  info(``);
  info(`    KEY=\$(python3 -c 'import json; print(json.load(open("${cfgPath}"))["api_key"])')`);
  info(`    curl -s https://<sub>.${domain}/xed/api/health`);
  info(`    curl -s https://<sub>.${domain}/xed/api/nginx/sites -H "X-API-Key: \$KEY"`);
  info(``);
}

// ─── start / stop / restart ───────────────────────────────────────────────────

function start() {
  const svc = serviceName();
  try {
    execSync(`sudo systemctl start ${svc}`, { stdio: 'inherit' });
    console.log(`\n  ✔  ${svc} gestartet\n`);
  } catch {
    // Fallback: direkt starten
    console.log(`\n  systemd nicht verfügbar — starte direkt...\n`);
    const cfg = readConfig();
    if (!cfg) { console.error('  ✗  infactory.json nicht gefunden. Zuerst: infactory install'); process.exit(1); }
    const serverIndex = path.join(infactoryDir(), 'server', 'src', 'index.js');
    if (!fs.existsSync(serverIndex)) { console.error(`  ✗  Server nicht gefunden: ${serverIndex}`); process.exit(1); }
    const child = spawn('node', [serverIndex], {
      cwd: ghostDir(),
      env: { ...process.env, INFACTORY_CONFIG: configPath() },
      stdio: 'inherit',
      detached: true,
    });
    child.unref();
    console.log(`  PID: ${child.pid}`);
    console.log(`  http://localhost:${cfg.infactory_port}/api/health\n`);
  }
}

function stop() {
  const svc = serviceName();
  try {
    execSync(`sudo systemctl stop ${svc}`, { stdio: 'inherit' });
    console.log(`\n  ✔  ${svc} gestoppt\n`);
  } catch {
    console.error(`  ✗  Konnte ${svc} nicht stoppen. Manuell: sudo systemctl stop ${svc}`);
  }
}

function restart() {
  const svc = serviceName();
  try {
    execSync(`sudo systemctl restart ${svc}`, { stdio: 'inherit' });
    console.log(`\n  ✔  ${svc} neugestartet\n`);
  } catch {
    console.error(`  ✗  Konnte ${svc} nicht restarten.`);
  }
}

// ─── status ───────────────────────────────────────────────────────────────────

function status() {
  const cfg = readConfig();
  if (!cfg) {
    console.log('\n  inFactory ist nicht installiert.');
    console.log('  → cd /var/ghost/mein-blog && infactory install\n');
    return;
  }

  console.log(`\n  inFactory Status — ${cfg.domain}\n`);
  console.log(`  Ghost:      ${cfg.ghost_url} (Port ${cfg.ghost_port})`);
  console.log(`  inFactory:  Port ${cfg.infactory_port}`);
  console.log(`  Auto-Sleep: ${cfg.auto_sleep_minutes} Minuten`);
  console.log(`  Admin-Key:  ${cfg.ghost_admin_key ? cfg.ghost_admin_key.split(':')[0] + ':••••' : '(NICHT GESETZT!)'}`);
  console.log();

  // Ghost Status
  try {
    const ghostStatus = execSync('ghost status', { cwd: ghostDir(), encoding: 'utf8', timeout: 5000 });
    const running = ghostStatus.includes('running');
    console.log(`  Ghost Service:     ${running ? '● running' : '○ stopped'}`);
  } catch {
    console.log(`  Ghost Service:     ? (ghost-cli nicht verfügbar)`);
  }

  // inFactory Service
  const svc = serviceName();
  try {
    const result = execSync(`systemctl is-active ${svc}`, { encoding: 'utf8', timeout: 3000 }).trim();
    console.log(`  inFactory Service: ${result === 'active' ? '● running' : '○ ' + result} (${svc})`);
  } catch {
    console.log(`  inFactory Service: ○ nicht installiert (${svc})`);
  }

  console.log();
}

// ─── update ───────────────────────────────────────────────────────────────────

function update(opts = {}) {
  const { verbose = false } = opts;
  const ifDir = infactoryDir();
  const gitDir = path.join(ifDir, '.git');

  if (!fs.existsSync(gitDir)) {
    console.error('\n  ✗  Kein .git im .infactory/ — Update nicht möglich.');
    console.error('     Führe `infactory install` erneut aus.\n');
    process.exit(1);
  }

  console.log('\n  Update...');

  try {
    // Pull latest ins .infactory/ (enthält das geklonte Repo)
    execSync('git pull --ff-only', {
      cwd: ifDir,
      stdio: verbose ? 'inherit' : 'pipe',
    });

    // Code aus dem geklonten Repo nach server/ und cli/ kopieren
    const serverDir = path.join(ifDir, 'server');
    const cliDir    = path.join(ifDir, 'cli');
    const repoServer = path.join(ifDir, 'infactory-server');
    const repoCli    = path.join(ifDir, 'infactory-cli');

    if (fs.existsSync(repoServer)) {
      copyDir(repoServer, serverDir);
      console.log('  ✔  Server aktualisiert');
    }
    if (fs.existsSync(repoCli)) {
      copyDir(repoCli, cliDir);
      console.log('  ✔  CLI aktualisiert');
    }

    // npm install
    for (const dir of [serverDir, cliDir]) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        execSync('npm install --omit=dev', { cwd: dir, stdio: verbose ? 'inherit' : 'pipe' });
      }
    }

    console.log('  ✔  Update abgeschlossen');
    console.log('  → infactory restart\n');
  } catch (err) {
    console.error(`  ✗  Update fehlgeschlagen: ${err.message}`);
    process.exit(1);
  }
}

// ─── ghost restart ────────────────────────────────────────────────────────────

function ghostRestart() {
  console.log('\n  Ghost Restart...');
  try {
    execSync('ghost restart', { cwd: ghostDir(), stdio: 'inherit', timeout: 60000 });
    console.log('  ✔  Ghost neugestartet\n');
  } catch (err) {
    console.error(`  ✗  Ghost Restart fehlgeschlagen: ${err.message}`);
    process.exit(1);
  }
}

// ─── copyDir helper ──────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.env') continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = { install, start, stop, restart, status, update, ghostRestart, readConfig, infactoryDir };
