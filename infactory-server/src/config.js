/**
 * config.js — Konfiguration aus infactory.json laden
 *
 * Liest entweder:
 *   1. INFACTORY_CONFIG ENV → direkter Pfad zu infactory.json
 *   2. cwd/.infactory/infactory.json (wenn im Ghost-Verzeichnis gestartet)
 *   3. Fallback: ../.env (Legacy-Modus für Entwicklung)
 *
 * Keine externen Dependencies.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

let config;

// ─── Versuch 1: infactory.json (Produktiv-Modus) ─────────────────────────────

const configFromEnv  = process.env.INFACTORY_CONFIG;
const configFromCwd  = path.join(process.cwd(), '.infactory', 'infactory.json');
const configPath     = configFromEnv || (fs.existsSync(configFromCwd) ? configFromCwd : null);

if (configPath && fs.existsSync(configPath)) {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Track-Detection: Wenn ghost_url UND ghost_admin_key beide leer sind,
  // ist dies eine Track-A-Installation (LEMP ohne Ghost-Kopplung).
  // ghostDir/contentPath/cliPath sind dann null und sites.local wird nicht
  // angelegt — dadurch pingt /api/health auch keinen Phantom-Ghost.
  const isTrackA = !raw.ghost_url && !raw.ghost_admin_key;

  const ghostDir    = isTrackA ? null : path.dirname(path.dirname(configPath));
  const contentPath = isTrackA ? null : (raw.content_path || path.join(ghostDir, 'content'));
  const cliPath     = isTrackA ? null : path.join(path.dirname(configPath), 'cli');

  config = {
    port:     raw.infactory_port || 3333,
    apiKey:   raw.api_key || '',
    cliPath:  cliPath,
    autoSleepMinutes: raw.auto_sleep_minutes || 360,

    sites: isTrackA ? {} : {
      local: {
        url:         raw.ghost_url,
        key:         raw.ghost_admin_key,
        contentPath: contentPath,
      },
    },

    // NGINX-Target Allowlist (Track A) — explizit konfigurierte Webroots in
    // die der inFactory Server statisches HTML/CSS/JS schreiben darf.
    // Format: { "<site>": { "webroot": "/var/www/.../htdocs/" } }
    nginxSites: (raw.nginx_sites && typeof raw.nginx_sites === 'object') ? raw.nginx_sites : {},

    imageArchivePath: raw.image_archive_path || '',
    venvPath:         raw.venv_path || '/opt/infactory/venv',
    referencesPath:   raw.references_path || '/opt/infactory/references',
    ghostDir:         ghostDir,
    configPath:       configPath,
    domain:           raw.domain || '',
  };

} else {
  // ─── Versuch 2: .env Fallback (Entwicklung) ────────────────────────────────

  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }

  function ghostSite(prefix) {
    const url = process.env[`GHOST_${prefix}_URL`] || '';
    const key = process.env[`GHOST_${prefix}_KEY`] || '';
    const contentPath = process.env[`GHOST_${prefix}_CONTENT_PATH`] || '';
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key, contentPath };
  }

  // NGINX_SITES_JSON erlaubt im .env-Fallback ein JSON-String mit der gleichen
  // Struktur wie infactory.json#nginx_sites: {"jam":{"webroot":"/var/www/..."}}
  let nginxSitesEnv = {};
  if (process.env.NGINX_SITES_JSON) {
    try {
      const parsed = JSON.parse(process.env.NGINX_SITES_JSON);
      if (parsed && typeof parsed === 'object') nginxSitesEnv = parsed;
    } catch (e) {
      console.warn(`  WARNUNG: NGINX_SITES_JSON ist kein gültiges JSON: ${e.message}`);
    }
  }

  config = {
    port:     parseInt(process.env.INFACTORY_PORT || '3333', 10),
    apiKey:   process.env.INFACTORY_API_KEY || '',
    cliPath:  path.resolve(__dirname, '..', process.env.INFACTORY_CLI_PATH || '../infactory-cli'),
    autoSleepMinutes: parseInt(process.env.AUTO_SLEEP_MINUTES || '360', 10),
    sites:    {},
    nginxSites: nginxSitesEnv,
    imageArchivePath: process.env.IMAGE_ARCHIVE_PATH || '',
    venvPath:         process.env.INFACTORY_VENV_PATH || '/opt/infactory/venv',
    referencesPath:   process.env.INFACTORY_REFERENCES_PATH || '/opt/infactory/references',
    ghostDir: '',
    configPath: '',
    domain: '',
  };

  const devSite = ghostSite('DEV');
  const webSite = ghostSite('WEB');
  if (devSite) config.sites.dev = devSite;
  if (webSite) config.sites.web = webSite;
  // Alias: "local" zeigt auf erste verfügbare Site
  if (devSite) config.sites.local = devSite;
  else if (webSite) config.sites.local = webSite;
}

// ─── Validierung ──────────────────────────────────────────────────────────────

if (!config.apiKey) {
  console.error('\n  FEHLER: API-Key nicht gesetzt!\n');
  if (configPath) {
    console.error(`  Setze "api_key" in ${configPath}\n`);
  } else {
    console.error('  Generiere einen Key:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('  Setze in .env: INFACTORY_API_KEY=<key>\n');
  }
  process.exit(1);
}

if (Object.keys(config.sites).length === 0 && Object.keys(config.nginxSites).length === 0) {
  console.warn('\n  WARNUNG: Weder Ghost-Sites noch NGINX-Sites konfiguriert.\n');
}

module.exports = config;
