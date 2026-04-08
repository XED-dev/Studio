/**
 * server-manager.js — inFactory Server Lifecycle Management
 *
 * Befehle: install, start, stop, restart, status, update
 *
 * inFactory installiert sich PRO Ghost-Instanz ins Ghost-Verzeichnis als .infactory/
 * Port-Schema: Ghost-Port + 1000 = inFactory-Port
 *
 * Voraussetzung: cwd = Ghost-Verzeichnis (z.B. /var/ghost/steirischursprung.at)
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
        execSync('npm install --production', {
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
  const config = {
    version: '1.0.0',
    ghost_url: `http://localhost:${ghost.port}`,
    ghost_port: ghost.port,
    infactory_port: infactoryPort,
    content_path: path.join(ghostDir(), 'content'),
    domain: domain,
    auto_sleep_minutes: 360,
    api_key: apiKey,
    ghost_admin_key: '',  // Muss manuell eingetragen werden
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
    // Pull latest
    execSync('git pull --ff-only', {
      cwd: ifDir, env: { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: ifDir },
      stdio: verbose ? 'inherit' : 'pipe',
    });

    // Code syncen
    const serverDir = path.join(ifDir, 'server');
    const cliDir    = path.join(ifDir, 'cli');
    const tmpDir    = path.join(ifDir, '_tmp_update');

    // Worktree checkout für sauberes Update
    execSync(`git --git-dir=${gitDir} --work-tree=${tmpDir} checkout HEAD -- infactory-server infactory-cli`, {
      cwd: ifDir, stdio: verbose ? 'inherit' : 'pipe',
    });

    if (fs.existsSync(path.join(tmpDir, 'infactory-server'))) {
      copyDir(path.join(tmpDir, 'infactory-server'), serverDir);
    }
    if (fs.existsSync(path.join(tmpDir, 'infactory-cli'))) {
      copyDir(path.join(tmpDir, 'infactory-cli'), cliDir);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // npm install
    for (const dir of [serverDir, cliDir]) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        execSync('npm install --production', { cwd: dir, stdio: verbose ? 'inherit' : 'pipe' });
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
