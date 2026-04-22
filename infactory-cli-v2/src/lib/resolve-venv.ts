/**
 * lib/resolve-venv.ts — Python-venv- und Legacy-Script-Lookup
 *
 * Hintergrund (CLI-M5.4): qa nutzt Python-Tools (shot-scraper, crawl4ai) im
 * venv unter `/opt/infactory/venv/`. Die Legacy-CLI hatte crawler/bin/.venv
 * hartcodiert (Workstation-only, auf dem Server unbrauchbar). Dieser
 * Resolver fixt das mit einer Priority-Kette analog zu resolve-resources.ts.
 *
 * Zusätzlich: `resolvePythonScript()` findet Legacy-Python-Helper wie
 * `extract-structure.py`, die bis M6 in `/opt/infactory/infactory-cli/src/`
 * verbleiben — gleicher Resolver-Pattern, anderer Asset-Typ.
 *
 * UX-Verbesserung vs. Legacy:
 *   Legacy: `path.resolve(__dirname, '../../../../../crawler/bin/.venv')` —
 *   implicit, Workstation-spezifisch, schweigend falsch auf dem Server.
 *   V2: explicit Priority-Kette, klare Fehlermeldung wenn nichts greift.
 */

import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {QaError} from './qa-error.js'

export interface ResolveVenvOptions {
  /** CWD-Override (Tests). Default: process.cwd(). */
  cwd?: string
  /** ENV-Override (Tests). Default: process.env. */
  env?: NodeJS.ProcessEnv
  /** Legacy-CLI-Verzeichnis (für resolvePythonScript). Default: '/opt/infactory/infactory-cli'. */
  legacyCliDir?: string
  /** Playwright-Browsers-Verzeichnis auf dem Server. Default: '/opt/infactory/browsers'. */
  serverBrowsersDir?: string
  /** Standard-venv-Pfad auf dem Server. Default: '/opt/infactory/venv'. */
  serverVenvDir?: string
}

const DEFAULT_SERVER_VENV = '/opt/infactory/venv'
const DEFAULT_SERVER_BROWSERS = '/opt/infactory/browsers'
const DEFAULT_LEGACY_CLI_DIR = '/opt/infactory/infactory-cli'

/**
 * Resolved venv — enthält sowohl Root-Pfad als auch die wichtigsten Binaries.
 */
export interface ResolvedVenv {
  /** Pfad zu `<venv>/bin/python3`. */
  python: string
  /** Root-Verzeichnis des venv. */
  root: string
  /** Pfad zu `<venv>/bin/shot-scraper`. */
  shotScraper: string
}

function venvBinaries(root: string): ResolvedVenv {
  return {
    python: join(root, 'bin', 'python3'),
    root,
    shotScraper: join(root, 'bin', 'shot-scraper'),
  }
}

/**
 * Löst den Python-venv-Pfad auf.
 *
 * Priority:
 *   1. `ENV INFACTORY_VENV` (expliziter Override)
 *   2. `<cwd>/venv` (Dev-Setup)
 *   3. `/opt/infactory/venv` (Server-Standard)
 *   4. Throw QaError mit allen geprüften Pfaden
 *
 * Validiert zusätzlich, dass `<venv>/bin/python3` existiert — ein nacktes
 * venv-Verzeichnis ohne python3-Binary ist nutzlos.
 *
 * @throws QaError wenn kein passender venv gefunden wird.
 */
export function resolveVenv(opts: ResolveVenvOptions = {}): ResolvedVenv {
  const cwd = opts.cwd ?? process.cwd()
  const env = opts.env ?? process.env
  const serverVenvDir = opts.serverVenvDir ?? DEFAULT_SERVER_VENV

  const candidates: string[] = [
    ...(env.INFACTORY_VENV ? [env.INFACTORY_VENV] : []),
    join(cwd, 'venv'),
    serverVenvDir,
  ]

  for (const candidate of candidates) {
    const binaries = venvBinaries(candidate)
    if (existsSync(binaries.python)) return binaries
  }

  throw new QaError(
    `Kein Python-venv mit python3 gefunden. Geprüft:\n`
    + candidates.map((c) => `  - ${join(c, 'bin', 'python3')}`).join('\n')
    + `\nAbhilfe: ENV INFACTORY_VENV=<pfad> setzen oder venv unter <cwd>/venv anlegen.`,
  )
}

/**
 * Löst den Pfad zu einem Python-Helper-Script.
 *
 * Priority:
 *   1. `<cwd>/src/<name>` (Dev-Setup in Workstation-CLI-Repo)
 *   2. `<legacyCliDir>/src/<name>` (Server: /opt/infactory/infactory-cli/src/<name>)
 *   3. Throw QaError
 *
 * Wird für `extract-structure.py` u.ä. genutzt, die bis M6 in der Legacy-CLI
 * verbleiben. Gleicher Pattern wie resolveResourcePath, nur für Script-Dateien.
 *
 * @throws QaError wenn das Script nirgendwo gefunden wird.
 */
export function resolvePythonScript(name: string, opts: ResolveVenvOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd()
  const legacyCliDir = opts.legacyCliDir ?? DEFAULT_LEGACY_CLI_DIR

  const candidates = [
    join(cwd, 'src', name),
    join(legacyCliDir, 'src', name),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new QaError(
    `Python-Helper-Script "${name}" nicht gefunden. Geprüft:\n`
    + candidates.map((c) => `  - ${c}`).join('\n')
    + `\nDieses Script lebt bis CLI-M6 in der Legacy-CLI (${legacyCliDir}/src/).`,
  )
}

/**
 * Löst den Pfad zum Playwright-Browsers-Verzeichnis auf.
 *
 * Priority:
 *   1. `ENV PLAYWRIGHT_BROWSERS_PATH` — wenn gesetzt + existiert
 *   2. `<cwd>/browsers` — Workstation-Dev-Pattern
 *   3. `/opt/infactory/browsers` — Server-Standard
 *   4. `undefined` — kein expliziter Pfad gesetzt, Playwright nutzt seinen
 *      Default (`~/.cache/ms-playwright/`). Das ist KEIN Fehler — auf
 *      Workstations ohne Custom-Setup funktioniert das.
 *
 * Rückgabe: der gefundene Pfad oder `undefined`. Der Caller setzt das
 * optional in der spawnSync-env; `undefined` → env-var wird nicht gesetzt
 * → Playwright-Default greift.
 *
 * Hintergrund (M5.4.1): Der Server hat Chromium explizit unter
 * `/opt/infactory/browsers/` installiert (per install.sh), nicht im
 * User-Default-Pfad. Wenn `PLAYWRIGHT_BROWSERS_PATH` nicht in der User-Shell
 * gesetzt ist, crasht shot-scraper mit "Executable doesn't exist". Dieser
 * Resolver macht das Setzen zur CLI-Verantwortung — unabhängig von der Shell-
 * Konfiguration des aufrufenden Users.
 */
export function resolvePlaywrightBrowsersPath(opts: ResolveVenvOptions = {}): string | undefined {
  const cwd = opts.cwd ?? process.cwd()
  const env = opts.env ?? process.env
  const serverBrowsersDir = opts.serverBrowsersDir ?? DEFAULT_SERVER_BROWSERS

  const explicit = env.PLAYWRIGHT_BROWSERS_PATH
  if (explicit && existsSync(explicit)) return explicit

  const cwdCandidate = join(cwd, 'browsers')
  if (existsSync(cwdCandidate)) return cwdCandidate

  if (existsSync(serverBrowsersDir)) return serverBrowsersDir

  return undefined
}
