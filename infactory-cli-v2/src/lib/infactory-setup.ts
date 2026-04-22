/**
 * lib/infactory-setup.ts — Track-A infactory-Server Setup-Logik
 *
 * Pure Functions für `infactory site init <tld>`: WordOps-Site-Detection,
 * infactory.json-Generierung, systemd-Unit-Rendering, ACL-Setup.
 * Portiert aus install.sh setup <tld> (Bash, ~190 Zeilen).
 */

import {execSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface WordOpsSite {
  name: string
  webroot: string
}

export interface InfactoryJsonConfig {
  api_key: string
  auto_sleep_minutes: number
  domain: string
  ghost_admin_key: string
  ghost_url: string
  infactory_port: number
  installed_at: string
  nginx_sites: Record<string, {webroot: string}>
  references_path: string
  venv_path: string
  version: string
}

export interface InfactoryUnitParams {
  cfgFile: string
  installDir: string
  siteDir: string
  tld: string
}

// ── WordOps Site Detection ─────────────────────────────────────────────────

/**
 * Scannt /var/www/ nach WordOps-Webroots für eine TLD.
 * Erkennt sowohl Subdomains (z.B. /var/www/jam.example.at/htdocs/)
 * als auch die Root-Domain (/var/www/example.at/htdocs/).
 *
 * @param tld - Die TLD (z.B. "steirischursprung.at")
 * @param wwwBase - Basis-Verzeichnis (default /var/www/, testbar mit tmp-dir)
 */
export function detectWordOpsSites(tld: string, wwwBase = '/var/www'): WordOpsSite[] {
  if (!existsSync(wwwBase)) return []

  const sites: WordOpsSite[] = []
  const entries = readdirSync(wwwBase).sort()

  for (const entry of entries) {
    const htdocs = join(wwwBase, entry, 'htdocs')
    if (!existsSync(htdocs) || !statSync(htdocs).isDirectory()) continue

    if (entry === tld) {
      sites.push({name: 'root', webroot: `${htdocs}/`})
    } else if (entry.endsWith(`.${tld}`)) {
      const sub = entry.slice(0, -(tld.length + 1)).replaceAll('.', '_')
      sites.push({name: sub, webroot: `${htdocs}/`})
    }
  }

  return sites
}

// ── infactory.json Generierung ─────────────────────────────────────────────

/**
 * Generiert einen 64-Hex-Zeichen API-Key.
 */
export function generateApiKey(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Liest einen bestehenden API-Key aus einer infactory.json, falls gültig (64 hex chars).
 * Gibt null zurück wenn die Datei fehlt, ungültig ist, oder der Key nicht dem Format entspricht.
 */
export function readExistingApiKey(cfgPath: string): null | string {
  try {
    const config = JSON.parse(readFileSync(cfgPath, 'utf8'))
    const key = config.api_key
    if (typeof key === 'string' && /^[\da-f]{64}$/.test(key)) return key
  } catch { /* ignore */ }

  return null
}

/**
 * Erzeugt das infactory.json-Objekt. Reused bestehenden API-Key wenn gültig.
 */
export function generateInfactoryConfig(params: {
  existingApiKey?: null | string
  installDir: string
  port: number
  sites: WordOpsSite[]
  tld: string
}): InfactoryJsonConfig {
  const {existingApiKey, installDir, port, sites, tld} = params
  // eslint-disable-next-line camelcase -- matches real infactory.json schema
  const api_key = existingApiKey ?? generateApiKey()

  const nginxSites: Record<string, {webroot: string}> = {}
  for (const s of sites) {
    nginxSites[s.name] = {webroot: s.webroot}
  }

  /* eslint-disable camelcase -- infactory.json schema uses snake_case (Python legacy) */
  return {
    api_key,
    auto_sleep_minutes: 360,
    domain: tld,
    ghost_admin_key: '',
    ghost_url: '',
    infactory_port: port,
    installed_at: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    nginx_sites: nginxSites,
    references_path: existsSync(join(installDir, 'references')) ? join(installDir, 'references') : '',
    venv_path: existsSync(join(installDir, 'venv', 'bin', 'python3')) ? join(installDir, 'venv') : '',
    version: '1.3.0',
  }
  /* eslint-enable camelcase */
}

/**
 * Schreibt infactory.json nach /var/xed/<tld>/infactory.json.
 * Setzt chmod 600 + chown g-host:g-host.
 * Gibt true zurück wenn Permissions gesetzt werden konnten, false wenn nicht (z.B. kein root).
 * Der JSON-Write selbst wirft bei Fehler (Caller muss try-catch nutzen).
 */
export function writeInfactoryConfig(cfgPath: string, config: InfactoryJsonConfig): boolean {
  writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n')
  try {
    execSync(`chmod 600 "${cfgPath}"`, {stdio: 'pipe'})
    execSync(`chown g-host:g-host "${cfgPath}"`, {stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

// ── systemd Unit Rendering ─────────────────────────────────────────────────

/**
 * Erzeugt das systemd-Unit-File für einen infactory-Server-Service.
 * User g-host, ENV INFACTORY_CONFIG + PLAYWRIGHT_BROWSERS_PATH.
 */
export function renderInfactoryUnit(params: InfactoryUnitParams): string {
  const {cfgFile, installDir, siteDir, tld} = params
  return `[Unit]
Description=inFactory Server — Track A (${tld})
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=${siteDir}
ExecStart=/usr/bin/node ${installDir}/infactory-server/src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=INFACTORY_CONFIG=${cfgFile}
Environment=PLAYWRIGHT_BROWSERS_PATH=${installDir}/browsers

[Install]
WantedBy=multi-user.target
`
}

// ── ACL Setup ──────────────────────────────────────────────────────────────

/**
 * Setzt ACLs auf WordOps-Webroots damit g-host schreiben kann.
 * Gibt die Anzahl erfolgreich gesetzter Webroots zurück.
 */
export function setWebRootAcls(sites: WordOpsSite[], user = 'g-host'): number {
  let count = 0
  for (const site of sites) {
    try {
      execSync(`setfacl -R -m  u:${user}:rwx "${site.webroot}"`, {stdio: 'pipe'})
      execSync(`setfacl -R -dm u:${user}:rwx "${site.webroot}"`, {stdio: 'pipe'})
      count++
    } catch { /* ignore — wird im Command geloggt */ }
  }

  return count
}
