/**
 * lib/deploy.ts — Ghost-Theme-Deploy-Pipeline für inFactory CLI
 *
 * TypeScript-Port von infactory-cli/src/deploy.js (CLI-M5.3).
 *
 * Pipeline:
 *   1. validate    — preset, ghostUrl, adminKey vorhanden + parseAdminKey OK
 *                    (fail-fast bevor Build startet)
 *   2. build       — buildTheme({zip: true, …}) via lib/build.ts
 *                    (übersprungen wenn skipBuild)
 *   3. zip-locate  — <outputDir>/infactory-<preset>.zip oder expliziter Pfad
 *   4. upload      — ghostApi.uploadTheme(…)
 *   5. activate    — ghostApi.activateTheme(…) — FATAL bei Failure
 *                    (übersprungen wenn skipActivate oder dryRun)
 *
 * Error-Semantik: throws DeployError. HTTP-Errors aus ghost-api.ts kommen
 * als {ok: false} zurück und werden hier in DeployError konvertiert.
 *
 * Credential-Safety:
 *   - adminKey wird NIE in Log-Output oder Error-Messages geschrieben
 *   - keyId (public-Teil vor ':') darf in verbose-Logs erscheinen
 *   - Upload-Response-Body wird NICHT in Error-Messages durchgereicht
 *   - JWT wird nirgends gelogt (auch nicht truncated)
 *
 * Config-Resolution für ghostUrl + adminKey (Priority):
 *   1. CLI-Flag (opts.ghostUrl / opts.adminKey)
 *   2. ENV: INFACTORY_GHOST_URL / INFACTORY_GHOST_KEY
 *   3. .infactory.json im CWD, Feld deploy.url / deploy.key
 *
 * NICHT aus preset.yaml — Presets sind potenziell teilbar/commitbar,
 * Admin-Keys dürfen dort nicht landen. Siehe CC §Design-Entscheidungen.
 */

import {existsSync, statSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {buildTheme} from './build.js'
import {DeployError} from './deploy-error.js'
import {
  activateTheme,
  parseAdminKey,
  uploadTheme,
} from './ghost-api.js'
import {requireValidCredentials, type ResolvedConfig, resolveGhostConfig} from './ghost-config.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeployOptions {
  /** Ghost Admin API Key (id:secret). Wenn unset → ENV/.infactory.json. */
  adminKey?: string
  baseThemeDir?: string
  /** CWD-Override (Tests). Default: process.cwd(). */
  cwd?: string
  /** Build + ZIP, kein Upload. */
  dryRun?: boolean
  /** Ghost-Instanz-URL. Wenn unset → ENV/.infactory.json. */
  ghostUrl?: string
  /** Deterministik für buildTheme (Tests). */
  now?: Date
  /** Build-Ausgabeverzeichnis. Default: `./dist`. */
  outputDir?: string
  /** Preset-ID (z.B. "agency"). Required. */
  preset: string
  presetsDir?: string
  registryPath?: string
  /** Theme hochladen aber nicht aktivieren. */
  skipActivate?: boolean
  /** Bestehendes ZIP nutzen, keinen Build ausführen. */
  skipBuild?: boolean
  verbose?: boolean
  /** Expliziter ZIP-Pfad. Override für `<outputDir>/infactory-<preset>.zip`. */
  zipPath?: string
}

export interface DeployResult {
  /** True wenn ein Aktivierungs-Request gesendet wurde. */
  activateAttempted: boolean
  /** True wenn Theme in Ghost aktiv. False bei skipActivate/dryRun. */
  activated: boolean
  /** True wenn dryRun-Modus (kein Upload erfolgt). */
  dryRun: boolean
  /** Build-+ Upload-Dauer in Millisekunden. */
  elapsed: number
  /** Ghost-URL ohne trailing slash. */
  ghostUrl: string
  /** Theme-Name aus Ghost-Upload-Response (z.B. "infactory-agency"). */
  themeName: string
  /** Absoluter Pfad zum hochgeladenen ZIP. */
  zipPath: string
}

/**
 * @deprecated Use `resolveGhostConfig` from `./ghost-config.js` directly.
 * Re-export for backward-compat in tests (`resolveDeployConfig` was the
 * original M5.3 export).
 */
export {resolveGhostConfig as resolveDeployConfig} from './ghost-config.js'

/**
 * Validiert DeployOptions nach Config-Resolution.
 * Wirft DeployError bei Fehlern — Key-Format wird via parseAdminKey geprüft
 * (fail-fast vor teurem Build).
 *
 * @returns GhostConfig mit normalisierter URL (trailing slash entfernt).
 * @throws DeployError bei fehlenden/invaliden Credentials.
 */
export function validateDeployOptions(
  preset: null | string | undefined,
  resolved: ResolvedConfig,
): import('./ghost-api.js').GhostConfig {
  if (!preset) {
    throw new DeployError(
      '--preset fehlt. Beispiel: infactory deploy --preset=agency --ghost-url=https://mein.blog --admin-key=<id:secret>',
    )
  }

  return requireValidCredentials(resolved, (msg) => new DeployError(msg))
}

/**
 * Lokalisiert das Theme-ZIP.
 * Priority: explicit `zipPath` > `<outputDir>/infactory-<preset>.zip`.
 *
 * @throws DeployError wenn weder explizit noch an Default-Location gefunden.
 */
export function findZipPath(
  preset: string,
  outputDir: string,
  explicit?: string,
): string {
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new DeployError(`ZIP nicht gefunden: ${explicit}`)
    }

    return explicit
  }

  const defaultPath = join(outputDir, `infactory-${preset}.zip`)
  if (!existsSync(defaultPath)) {
    throw new DeployError(
      `ZIP nicht gefunden: ${defaultPath}\n`
      + `  Führe zuerst aus: infactory build --preset=${preset} --zip\n`
      + `  Oder setze --zip-path=<pfad> bei vorhandenem Build.`,
    )
  }

  return defaultPath
}

/**
 * Extrahiert den Theme-Namen aus der Ghost-Upload-Response.
 * Fallback auf `infactory-<preset>` wenn Response kein Name-Feld hat
 * (defensive — Ghost v5 antwortet immer mit themes[0].name).
 */
export function extractThemeName(
  response: null | {themes?: Array<{name?: string}>},
  preset: string,
): string {
  const name = response?.themes?.[0]?.name
  return name ?? `infactory-${preset}`
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * Führt den vollständigen Deploy-Flow durch.
 *
 * @throws DeployError bei Validation-, Build-, Upload- oder Activate-Fehlern.
 */
export async function deployTheme(opts: DeployOptions): Promise<DeployResult> {
  const {
    cwd = process.cwd(),
    outputDir = resolve('./dist'),
    preset,
    skipActivate = false,
    skipBuild = false,
    verbose = false,
  } = opts
  const log = verbose ? (m: string) => console.log(m) : () => {}
  const startTime = Date.now()

  // 1. Validate (fail-fast vor Build)
  const resolvedConfig = resolveGhostConfig(
    {adminKey: opts.adminKey, ghostUrl: opts.ghostUrl},
    cwd,
  )
  const ghostConfig = validateDeployOptions(preset, resolvedConfig)
  const {keyId} = parseAdminKey(ghostConfig.adminKey)

  log(`  Preset:  ${preset}`)
  log(`  Ghost:   ${ghostConfig.url}`)
  log(`  Key-ID:  ${keyId}`)

  // 2. Build (optional)
  if (skipBuild) {
    log(`  [1/4] Build übersprungen (--skip-build)`)
  } else {
    log(`  [1/4] Build — Preset "${preset}" → ZIP`)
    await buildTheme({
      baseThemeDir: opts.baseThemeDir,
      cwd,
      now: opts.now,
      outputDir,
      preset,
      presetsDir: opts.presetsDir,
      registryPath: opts.registryPath,
      verbose,
      zip: true,
    })
    log(`        ✔ Build abgeschlossen`)
  }

  // 3. ZIP lokalisieren
  log(`  [2/4] ZIP lokalisieren`)
  const zipPath = findZipPath(preset, outputDir, opts.zipPath)
  const zipSize = (statSync(zipPath).size / 1024).toFixed(1)
  log(`        ✔ ZIP: ${zipPath} (${zipSize} KB)`)

  // 4. DryRun — Pipeline endet vor Upload
  if (opts.dryRun) {
    log(`  ✔ Dry Run — kein Upload.`)
    return {
      activateAttempted: false,
      activated: false,
      dryRun: true,
      elapsed: Date.now() - startTime,
      ghostUrl: ghostConfig.url,
      themeName: `infactory-${preset}`,
      zipPath,
    }
  }

  // 5. Upload — Response-Body NICHT in Error-Message durchreichen.
  log(`  [3/4] Upload`)
  const uploadResult = await uploadTheme(ghostConfig, zipPath)
  if (!uploadResult.ok) {
    throw new DeployError(
      `Upload fehlgeschlagen (HTTP ${uploadResult.status}).\n`
      + `  Ghost: ${ghostConfig.url}\n`
      + `  Tipps:\n`
      + `  • Ghost-URL korrekt?\n`
      + `  • Admin-Key gültig? (Ghost Admin → Settings → Integrations)\n`
      + `  • Ghost erreichbar? (DNS, Firewall, VPN)`,
    )
  }

  const themeName = extractThemeName(uploadResult.data, preset)
  log(`        ✔ Theme hochgeladen: "${themeName}"`)

  // 6. Activate — FATAL bei Failure (bewusste UX-Verbesserung vs. alter CLI).
  if (skipActivate) {
    log(`  [4/4] Aktivierung übersprungen (--skip-activate)`)
    log(`        Manuell: Ghost Admin → Design → "${themeName}" aktivieren`)
    return {
      activateAttempted: false,
      activated: false,
      dryRun: false,
      elapsed: Date.now() - startTime,
      ghostUrl: ghostConfig.url,
      themeName,
      zipPath,
    }
  }

  log(`  [4/4] Aktivierung`)
  const activateResult = await activateTheme(ghostConfig, themeName)
  if (!activateResult.ok) {
    throw new DeployError(
      `Theme "${themeName}" hochgeladen, aber Aktivierung fehlgeschlagen (HTTP ${activateResult.status}).\n`
      + `  Manuell aktivieren: ${ghostConfig.url}/ghost/#/settings/design`,
    )
  }

  log(`        ✔ Theme aktiviert: "${themeName}"`)

  return {
    activateAttempted: true,
    activated: true,
    dryRun: false,
    elapsed: Date.now() - startTime,
    ghostUrl: ghostConfig.url,
    themeName,
    zipPath,
  }
}
