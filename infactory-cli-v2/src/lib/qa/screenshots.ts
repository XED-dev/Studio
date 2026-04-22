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

import {QaError} from '../qa-error.js'
import {type ResolvedVenv, resolvePlaywrightBrowsersPath, type ResolveVenvOptions} from '../resolve-venv.js'

const DEFAULT_TIMEOUT_MS = 30_000

const REMOVE_OVERLAYS_JS
  = "document.querySelectorAll('[class*=cookie],[id*=cookie],[class*=overlay],[class*=popup],[class*=consent]').forEach(e=>e.remove())"

export interface ScreenshotOptions {
  /** Optionen für `resolvePlaywrightBrowsersPath` (cwd/env/serverBrowsersDir-Overrides für Tests). */
  resolveOpts?: ResolveVenvOptions
  /** venv aus resolveVenv(). */
  venv: ResolvedVenv
  /** Wartezeit nach Load vor Screenshot in ms. Default 2000. */
  wait?: number
  /** Viewport-Breite in px. Default 1440. */
  width?: number
}

/**
 * Baut die env für shot-scraper-Subprozesse: process.env-Erbe + PATH-Prepend
 * mit venv/bin + auto-setting von PLAYWRIGHT_BROWSERS_PATH wenn ein
 * expliziter Pfad resolvebar ist.
 *
 * Kritisch für M5.4.1: User-Shells ohne PLAYWRIGHT_BROWSERS_PATH sehen sonst
 * "Executable doesn't exist" weil Chromium auf dem Server unter
 * `/opt/infactory/browsers/` statt `~/.cache/ms-playwright/` liegt.
 */
export function buildShotScraperEnv(
  venv: ResolvedVenv,
  opts: ResolveVenvOptions = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${dirname(venv.python)}:${process.env.PATH ?? ''}`,
  }
  const browsersPath = resolvePlaywrightBrowsersPath(opts)
  if (browsersPath) env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  return env
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
      env: buildShotScraperEnv(venv, opts.resolveOpts),
      timeout: DEFAULT_TIMEOUT_MS,
    },
  )

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').slice(0, 400)
    throw new QaError(buildShotScraperError(url, 'Screenshot', stderr))
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
export function runShotScraperJs(
  url: string,
  js: string,
  venv: ResolvedVenv,
  resolveOpts: ResolveVenvOptions = {},
): string {
  const result = spawnSync(
    venv.python,
    [venv.shotScraper, 'javascript', url, js],
    {
      encoding: 'utf8',
      env: buildShotScraperEnv(venv, resolveOpts),
      timeout: DEFAULT_TIMEOUT_MS,
    },
  )

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').slice(0, 400)
    throw new QaError(buildShotScraperError(url, 'JS', stderr))
  }

  let output = (result.stdout ?? '').trim()
  if (output.startsWith('"') && output.endsWith('"')) {
    output = JSON.parse(output) as string
  }

  return output
}

/**
 * Normalisiert Fehler-Messages aus shot-scraper-Exits zu Actionable-Hinweisen.
 * Erkennt bekannte Pattern (z.B. Playwright-Browser-Missing) und fügt den
 * Fix-Pfad direkt in die Exception-Message — AI-Agenten + Humans sehen im
 * Report, WAS zu tun ist, nicht nur DASS es kaputt ist.
 */
export function buildShotScraperError(url: string, mode: 'JS' | 'Screenshot', stderr: string): string {
  if (stderr.includes("Executable doesn't exist") || stderr.includes('playwright install')) {
    return (
      `shot-scraper ${mode} failed (${url}): Playwright-Chromium fehlt.\n`
      + `  Fix: curl -fsSL https://studio.xed.dev/install.sh | bash\n`
      + `  Das installiert Chromium in /opt/infactory/browsers/ und setzt\n`
      + `  PLAYWRIGHT_BROWSERS_PATH automatisch beim nächsten qa-Call.\n`
      + `  Original stderr (gekappt):\n  ${stderr.slice(0, 200)}`
    )
  }

  return `shot-scraper ${mode} failed (${url}): ${stderr}`
}
