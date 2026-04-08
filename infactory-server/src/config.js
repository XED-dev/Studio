/**
 * config.js — Konfiguration aus .env laden
 *
 * Keine externen Dependencies (kein dotenv).
 * Liest .env manuell, ENV-Variablen haben Vorrang.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// .env Datei laden (Key=Value, # Kommentare ignorieren)
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
    // ENV hat Vorrang — nur setzen wenn nicht bereits definiert
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

/**
 * Ghost-Site Konfiguration.
 * Unterstützt DEV + WEB Instanzen.
 */
function ghostSite(prefix) {
  const url  = process.env[`GHOST_${prefix}_URL`]  || '';
  const key  = process.env[`GHOST_${prefix}_KEY`]  || '';
  const contentPath = process.env[`GHOST_${prefix}_CONTENT_PATH`] || '';
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key, contentPath };
}

const config = {
  port:     parseInt(process.env.INFACTORY_PORT || '3333', 10),
  apiKey:   process.env.INFACTORY_API_KEY || '',
  cliPath:  path.resolve(__dirname, '..', process.env.INFACTORY_CLI_PATH || '../infactory-cli'),

  // Ghost Sites
  sites: {},

  // Bild-Archiv
  imageArchivePath: process.env.IMAGE_ARCHIVE_PATH || '',
};

// Sites dynamisch laden
const devSite = ghostSite('DEV');
const webSite = ghostSite('WEB');
if (devSite) config.sites.dev = devSite;
if (webSite) config.sites.web = webSite;

// Validierung
if (!config.apiKey) {
  console.error('\n  FEHLER: INFACTORY_API_KEY nicht gesetzt!\n');
  console.error('  Generiere einen Key:');
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('  Setze in .env: INFACTORY_API_KEY=<key>\n');
  process.exit(1);
}

if (Object.keys(config.sites).length === 0) {
  console.warn('\n  WARNUNG: Keine Ghost-Sites konfiguriert. Setze GHOST_DEV_URL + GHOST_DEV_KEY in .env.\n');
}

module.exports = config;
