/**
 * lib/site.ts — Site-bezogene Operationen für inFactory CLI
 *
 * Bündelt drei eng verwandte Themen:
 *   - Secrets: Kryptografisch sichere Random-Hex-Strings
 *   - Env-File: Lesen, Schreiben, Patchen von studio-payload.env
 *   - DB-Permissions: chown/chmod-Logik für SQLite WAL-Mode
 *
 * Wird hauptsächlich von `site create` und `site update` genutzt.
 */

import {execSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {chmodSync, existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

// ── Secrets ────────────────────────────────────────────────────────────────

/**
 * Erzeugt einen kryptografisch sicheren Hex-String.
 * Standardlänge: 64 Zeichen (32 Bytes) — wie PAYLOAD_SECRET, BETTER_AUTH_SECRET, API-Keys.
 */
export function genSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

// ── Env-File ───────────────────────────────────────────────────────────────

export type EnvVars = Record<string, string>

/**
 * Liest eine .env-Datei und gibt alle KEY=VALUE Paare als Record zurück.
 * Kommentare (#) und Leerzeilen werden ignoriert. Quoting wird nicht aufgelöst
 * (die Datei wird so erzeugt, dass keine Quotes gebraucht werden).
 */
export function readEnv(path: string): EnvVars {
  if (!existsSync(path)) return {}

  const result: EnvVars = {}
  const content = readFileSync(path, 'utf8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eqIdx = line.indexOf('=')
    if (eqIdx < 1) continue

    const key = line.slice(0, eqIdx).trim()
    const value = line.slice(eqIdx + 1).trim()
    result[key] = value
  }

  return result
}

/**
 * Schreibt Env-Vars in eine Datei. Alphabetisch sortiert für stabile Diffs.
 * Setzt die Datei-Permissions auf 600 (nur Owner lesen/schreiben — es sind Secrets).
 */
export function writeEnv(path: string, vars: EnvVars): void {
  const lines = Object.keys(vars)
    .sort()
    .map((k) => `${k}=${vars[k]}`)
  writeFileSync(path, lines.join('\n') + '\n', {mode: 0o600})
  // Ownership setzen (falls als root aufgerufen) — g-host ist der Service-User
  try {
    execSync(`chown g-host:g-host "${path}"`, {stdio: 'pipe'})
  } catch { /* nicht kritisch — ownership bleibt wie sie ist */ }
}

/**
 * Erzeugt das komplette Env-Set für eine neue Site.
 * Nur beim Ersteinrichten aufrufen — überschreibt keine bestehenden Secrets.
 */
export function defaultSiteEnv(tld: string, siteDir: string): EnvVars {
  return {
    BETTER_AUTH_SECRET: genSecret(),
    BETTER_AUTH_URL: `https://jam.${tld}/studio`,
    DATABASE_URI: `file://${siteDir}/payload.db`,
    NEXT_PUBLIC_BASE_PATH: '/studio',
    NEXT_PUBLIC_SERVER_URL: `https://jam.${tld}/studio`,
    PAYLOAD_SECRET: genSecret(),
  }
}

/**
 * Ergänzt fehlende Nicht-Secret-Env-Vars in einer bestehenden Datei,
 * ohne existierende Werte zu überschreiben.
 *
 * Gibt die Anzahl der hinzugefügten Keys zurück.
 */
export function patchMissingEnvVars(path: string, tld: string): number {
  if (!existsSync(path)) return 0

  const current = readEnv(path)
  const required: EnvVars = {
    BETTER_AUTH_URL: `https://jam.${tld}/studio`,
    NEXT_PUBLIC_BASE_PATH: '/studio',
    NEXT_PUBLIC_SERVER_URL: `https://jam.${tld}/studio`,
  }

  let patched = 0
  for (const [key, value] of Object.entries(required)) {
    if (!(key in current)) {
      current[key] = value
      patched++
    }
  }

  if (patched > 0) {
    writeEnv(path, current)
  }

  return patched
}

// ── DB-Permissions ─────────────────────────────────────────────────────────

/**
 * Setzt die Permissions für SQLite WAL-Mode:
 *   - Verzeichnis 775 (Service-User g-host braucht Schreibrechte für WAL/SHM-Dateien)
 *   - payload.db + optional .db-wal / .db-shm auf g-host:g-host, 664
 *
 * Idempotent — kann nach jedem Migrate/Build aufgerufen werden.
 */
export function setDbPermissions(siteDir: string): void {
  if (!existsSync(siteDir)) return

  // Verzeichnis 775 — g-host muss WAL/SHM schreiben können
  try {
    chmodSync(siteDir, 0o775)
  } catch { /* nicht kritisch */ }

  const dbFile = join(siteDir, 'payload.db')
  if (!existsSync(dbFile)) return

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbFile}${suffix}`
    if (!existsSync(file)) continue
    try {
      execSync(`chown g-host:g-host "${file}"`, {stdio: 'pipe'})
      chmodSync(file, 0o664)
    } catch { /* nicht kritisch */ }
  }
}
