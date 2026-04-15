/**
 * lib/config.ts — Zentrale Config-Verwaltung für inFactory CLI
 *
 * Lädt Config aus /var/xed/<tld>/infactory.json und studio-payload.env.
 * TLD-Discovery: alle Verzeichnisse in /var/xed/ mit den erwarteten Config-Dateien.
 */

import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'

// SITE_BASE ist konfigurierbar via Env — für Tests gegen ein tmp-Verzeichnis.
// Im Produktiv-Betrieb auf dem Server bleibt der Default /var/xed/.
//
// HINWEIS: `SITE_BASE` const ist ein Load-Time-Snapshot (für Rückwärts-Kompat mit
// bestehenden Imports). Interne Funktionen nutzen `siteBase()` — das liest die
// ENV bei jedem Aufruf, damit Tests die ENV pro Test-Case setzen können.
export const SITE_BASE = process.env.INFACTORY_SITE_BASE ?? '/var/xed'

export function siteBase(): string {
  return process.env.INFACTORY_SITE_BASE ?? '/var/xed'
}

export const INSTALL_DIR_INFACTORY = '/opt/infactory'
export const INSTALL_DIR_PAYLOAD = '/opt/studio-payload'
export const SERVICE_PREFIX_INFACTORY = 'infactory'
export const SERVICE_PREFIX_PAYLOAD = 'studio-payload'
export const PORT_INFACTORY = 4368
export const PORT_PAYLOAD = 5368

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface InfactoryConfig {
  [key: string]: unknown
  api_key?: string
  nginx_sites?: Array<{name: string; webroot: string}>
  port: number
}

export interface SiteInfo {
  dir: string
  hasInfactory: boolean
  hasPayload: boolean
  infactoryPort: number
  infactoryService: string
  payloadPort: number
  payloadService: string
  tld: string
}

// ── TLD-Helpers ────────────────────────────────────────────────────────────

export function tldToServiceName(prefix: string, tld: string): string {
  return `${prefix}-${tld.replaceAll('.', '-')}`
}

export function readInfactoryConfig(tld: string): InfactoryConfig | null {
  const configPath = join(siteBase(), tld, 'infactory.json')
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as InfactoryConfig
  } catch {
    return null
  }
}

/**
 * Ermittelt den Payload-Port aus der systemd-Unit-Datei.
 * Fallback: PORT_PAYLOAD + Index der TLD (alphabetisch sortiert, wie payload.sh).
 */
export function readPayloadPort(tld: string, index: number): number {
  const svcName = tldToServiceName(SERVICE_PREFIX_PAYLOAD, tld)
  const svcPath = `/etc/systemd/system/${svcName}.service`
  try {
    const content = readFileSync(svcPath, 'utf8')
    const match = content.match(/-p\s+(\d+)/)
    if (match) return Number.parseInt(match[1], 10)
  } catch { /* fallthrough */ }

  return PORT_PAYLOAD + index
}

// ── TLD-Discovery ──────────────────────────────────────────────────────────

export function discoverSites(): SiteInfo[] {
  const base = siteBase()
  if (!existsSync(base)) return []

  const sites: SiteInfo[] = []
  const dirs = readdirSync(base).sort()
  let payloadIndex = 0

  for (const d of dirs) {
    const dirPath = join(base, d)
    if (!statSync(dirPath).isDirectory()) continue

    const hasInfactory = existsSync(join(dirPath, 'infactory.json'))
    const hasPayload = existsSync(join(dirPath, 'studio-payload.env'))

    if (!hasInfactory && !hasPayload) continue

    const infactoryConfig = hasInfactory ? readInfactoryConfig(d) : null
    const infactoryPort = infactoryConfig?.port ?? PORT_INFACTORY
    const payloadPort = hasPayload ? readPayloadPort(d, payloadIndex) : PORT_PAYLOAD

    if (hasPayload) payloadIndex++

    sites.push({
      dir: dirPath,
      hasInfactory,
      hasPayload,
      infactoryPort,
      infactoryService: tldToServiceName(SERVICE_PREFIX_INFACTORY, d),
      payloadPort,
      payloadService: tldToServiceName(SERVICE_PREFIX_PAYLOAD, d),
      tld: d,
    })
  }

  return sites
}

/**
 * Findet eine einzelne Site anhand der TLD.
 * Gibt null zurück wenn die TLD nicht existiert oder nicht konfiguriert ist.
 */
export function findSite(tld: string): null | SiteInfo {
  const sites = discoverSites()
  return sites.find((s) => s.tld === tld) ?? null
}

/**
 * Berechnet den Payload-Port für eine TLD — bestehend oder neu.
 *
 * Logik identisch zu payload.sh tld_to_port (Bash-Original):
 *   - Alphabetisch sortiertes TLD-Listing von /var/xed/ durchlaufen,
 *     nur TLDs mit studio-payload.env zählen.
 *   - Existierende TLD: PORT_PAYLOAD + index (alphabetischer Index).
 *   - Neue TLD: PORT_PAYLOAD + gesamt_anzahl (nächster freier Port).
 *
 * Hinweis: Das Schema ist nicht reorder-stabil — wird eine TLD alphabetisch
 * dazwischen eingefügt, verschieben sich die Ports späterer TLDs. Das ist
 * der Status quo aus payload.sh, hier unverändert übernommen (bei CLI-M6
 * kann man das mit einem festen Port-Mapping pro TLD lösen).
 */
export function computePayloadPort(tld: string): number {
  const base = siteBase()
  if (!existsSync(base)) return PORT_PAYLOAD

  const dirs = readdirSync(base).sort()
  let idx = 0
  for (const d of dirs) {
    const dirPath = join(base, d)
    if (!statSync(dirPath).isDirectory()) continue
    if (!existsSync(join(dirPath, 'studio-payload.env'))) continue

    if (d === tld) return PORT_PAYLOAD + idx
    idx++
  }

  // TLD nicht gefunden — nächster freier Port
  return PORT_PAYLOAD + idx
}
