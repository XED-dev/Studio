/**
 * lib/qa/screenshots.ts — shot-scraper-Wrapper (Python-venv-Subprozess)
 *
 * Stellt drei Primitives bereit:
 *   - `takeScreenshot()` — PNG eines URLs mit definierter Breite
 *   - `runShotScraperJs()` — JavaScript im Kontext einer Seite ausführen
 *                            (die shot-scraper `javascript` Subcommand)
 *   - `runShotScraperServerJs()` — wie oben aber Output parsen
 *
 * Cookie-/Overlay-Entfernung: kleines JS-Snippet räumt Consent-Layer weg
 * bevor Screenshots gezogen werden, analog Legacy.
 *
 * Alle Aufrufe sind blockierend via spawnSync (kein await-Overhead, einfache
 * Fehlerbehandlung, Timeout direkt via option). Exit-Codes 6= 0 werfen
 * QaError mit gekappter stderr-Message (Payload kann lang sein).
 */

import {spawnSync} from 'node:child_process'
import {dirname} from 'node:path'

import type {ResolvedVenv} from '../resolve-venv.js'

import {QaError} from '../qa-error.js'

const DEFAULT_TIMEOUT_MS = 30_000

const REMOVE_OVERLAYS_JS
  = "document.querySelectorAll('[class*=cookie],[id*=cookie],[class*=overlay],[class*=popup],[class*=consent]').forEach(e=>e.remove())"

export interface ScreenshotOptions {
  /** venv aus resolveVenv(). */
  venv: ResolvedVenv
  /** Wartezeit nach Load vor Screenshot in ms. Default 2000. */
  wait?: number
  /** Viewport-Breite in px. Default 1440. */
  width?: number
}

/**
 * PNG-Screenshot einer URL ziehen.
 *
 * @throws QaError bei Exit-Code ≠ 0 oder Timeout.
 */
export function takeScreenshot(url: string, outputPath: string, opts: ScreenshotOptions): string {
  const {venv, wait = 2000, width = 1440} = opts

  const result = spawnSync(
    venv.python,
    [
      venv.shotScraper, url,
      '-o', outputPath,
      '-w', String(width),
      '--wait', String(wait),
      '--javascript', REMOVE_OVERLAYS_JS,
    ],
    {
      encoding: 'utf8',
      env: {...process.env, PATH: `${dirname(venv.python)}:${process.env.PATH ?? ''}`},
      timeout: DEFAULT_TIMEOUT_MS,
    },
  )

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').slice(0, 200)
    throw new QaError(`shot-scraper Screenshot failed (${url}): ${stderr}`)
  }

  return outputPath
}

/**
 * JavaScript im Kontext einer URL ausführen, stdout als String zurückgeben.
 *
 * Automatisches Unwrap von doppelten JSON-Quotes: shot-scraper gibt JS-Strings
 * als JSON-encoded String zurück (`"[\"a\",\"b\"]"`). Wir unwrap'n das mit
 * einem JSON.parse wenn Output wie ein JSON-String aussieht.
 *
 * @throws QaError bei Exit-Code ≠ 0 oder Timeout.
 */
export function runShotScraperJs(url: string, js: string, venv: ResolvedVenv): string {
  const result = spawnSync(
    venv.python,
    [venv.shotScraper, 'javascript', url, js],
    {
      encoding: 'utf8',
      env: {...process.env, PATH: `${dirname(venv.python)}:${process.env.PATH ?? ''}`},
      timeout: DEFAULT_TIMEOUT_MS,
    },
  )

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').slice(0, 200)
    throw new QaError(`shot-scraper JS failed (${url}): ${stderr}`)
  }

  let output = (result.stdout ?? '').trim()
  if (output.startsWith('"') && output.endsWith('"')) {
    output = JSON.parse(output) as string
  }

  return output
}
