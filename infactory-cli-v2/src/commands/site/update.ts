/**
 * site update — Install-OR-Update für das Studio-Payload Target-Projekt
 *
 * Ersetzt: payload.sh (ohne Argumente, Default-Modus, Zeilen 295-483)
 *
 * Idempotent: Erkennt automatisch ob Erstinstall oder Update und führt das Passende aus.
 *
 * Ablauf:
 *   1. Tool-Checks (node, pnpm, git — Versionen prüfen, nicht installieren)
 *   2. Code installieren ODER aktualisieren (git clone --depth 1 | git fetch+reset)
 *   3. pnpm install (lockfile bevorzugt)
 *   4. Für jede bestehende Site: fehlende Env-Vars ergänzen
 *   5. Für jede bestehende Site: pnpm payload migrate + DB-Permissions neu setzen
 *   6. Falls keine Sites: temporäre Secrets für Build setzen
 *   7. pnpm build (Next.js Production-Build)
 *   8. Falls Update: alle konfigurierten Services neustarten
 *   9. Zusammenfassung
 */

import {Command} from '@oclif/core'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {discoverSites, INSTALL_DIR_PAYLOAD, SiteInfo} from '../../lib/config.js'
import {color, icon} from '../../lib/output.js'
import {
  gitCloneShallow,
  gitFetchResetMain,
  gitVersion,
  headShort,
  nodeMajor,
  packageVersion,
  pnpmVersion,
  runBuild,
  runInstall,
  runMigrate,
} from '../../lib/payload.js'
import {genSecret, patchMissingEnvVars, setDbPermissions} from '../../lib/site.js'
import {isServiceActive, isServiceEnabled, restartService, startService} from '../../lib/systemd.js'

const REPO_URL = 'https://github.com/XED-dev/Studio-Payload.git'
const NODE_MIN = 18

// ── Phasen-Helper (extrahiert aus run() für niedrigere zyklomatische Komplexität) ───

interface Logger {
  log: (msg: string) => void
}

/**
 * Phase 1 — Tool-Check: node/pnpm/git müssen vorhanden sein.
 * Gibt true zurück wenn alle Tools passen, false sonst.
 */
function checkTools(log: Logger): boolean {
  const nMajor = nodeMajor()
  if (nMajor === 0) {
    log.log(`  ${icon.err} Node.js nicht gefunden`)
    return false
  }

  if (nMajor < NODE_MIN) {
    log.log(`  ${icon.err} Node.js v${nMajor} gefunden — mindestens v${NODE_MIN} erforderlich`)
    return false
  }

  log.log(`  ${icon.ok} Node.js v${nMajor}`)

  const pnpm = pnpmVersion()
  if (!pnpm) {
    log.log(`  ${icon.err} pnpm nicht gefunden`)
    log.log(`  Installation: ${color.bold}corepack enable && corepack prepare pnpm@latest --activate${color.nc}`)
    return false
  }

  log.log(`  ${icon.ok} pnpm ${pnpm}`)

  const git = gitVersion()
  if (!git) {
    log.log(`  ${icon.err} git nicht gefunden`)
    return false
  }

  log.log(`  ${icon.ok} git ${git}`)
  return true
}

/**
 * Phase 2 — Code installieren oder aktualisieren (git clone / git fetch+reset).
 * Gibt true bei Erfolg zurück, false bei Fehler.
 */
function installOrUpdateCode(isUpdate: boolean, log: Logger): boolean {
  if (isUpdate) {
    log.log(`  ${icon.info} Bestehende Installation gefunden — Update...`)
    const result = gitFetchResetMain(INSTALL_DIR_PAYLOAD)
    if (!result.ok) {
      log.log(`  ${icon.err} git fetch/reset fehlgeschlagen`)
      return false
    }

    log.log(result.changed
      ? `  ${icon.ok} Code aktualisiert: ${result.oldHead} → ${result.newHead}`
      : `  ${icon.ok} Bereits aktuell: ${result.newHead}`)
    return true
  }

  log.log(`  ${icon.info} Installiere nach ${INSTALL_DIR_PAYLOAD}...`)
  if (!existsSync(INSTALL_DIR_PAYLOAD)) {
    mkdirSync(INSTALL_DIR_PAYLOAD, {recursive: true})
  }

  if (!gitCloneShallow(REPO_URL, INSTALL_DIR_PAYLOAD)) {
    log.log(`  ${icon.err} git clone fehlgeschlagen (${REPO_URL})`)
    return false
  }

  log.log(`  ${icon.ok} Code geklont`)
  return true
}

/**
 * Phase 4-5 — Env-Vars patchen + Migrate für alle Sites + DB-Permissions setzen.
 */
function migrateAllSites(sites: SiteInfo[], log: Logger): void {
  for (const site of sites) {
    const envFile = join(site.dir, 'studio-payload.env')
    const patched = patchMissingEnvVars(envFile, site.tld)
    if (patched > 0) {
      log.log(`  ${icon.ok} ${site.tld}: ${patched} fehlende Env-Var(s) ergänzt`)
    }
  }

  for (const site of sites) {
    const envFile = join(site.dir, 'studio-payload.env')
    log.log(`  ${icon.info} Migrate: ${site.tld}...`)
    log.log(runMigrate(INSTALL_DIR_PAYLOAD, envFile)
      ? `  ${icon.ok} Migrate ${site.tld} erfolgreich`
      : `  ${icon.warn} Migrate ${site.tld} fehlgeschlagen`)
    setDbPermissions(site.dir)
  }
}

/**
 * Phase 6 — Temp-Env für Build erzeugen wenn keine Sites existieren.
 * Gibt den Pfad der Temp-Env-Datei zurück.
 */
function setupTempBuildEnv(log: Logger): string {
  log.log(`  ${icon.info} Keine Sites konfiguriert — Build mit temporären Secrets...`)
  const dataDir = join(INSTALL_DIR_PAYLOAD, 'data')
  mkdirSync(dataDir, {recursive: true})

  const tempEnvFile = join(dataDir, '.build-env')
  const tempEnvContent = [
    `PAYLOAD_SECRET=${genSecret()}`,
    `BETTER_AUTH_SECRET=${genSecret()}`,
    'DATABASE_URI=file:./data/payload.db',
  ].join('\n') + '\n'
  writeFileSync(tempEnvFile, tempEnvContent, {mode: 0o600})

  log.log(`  ${icon.info} Payload Migrations (temporäre DB)...`)
  log.log(runMigrate(INSTALL_DIR_PAYLOAD, tempEnvFile)
    ? `  ${icon.ok} Migrations erfolgreich`
    : `  ${icon.warn} Migrations fehlgeschlagen`)
  return tempEnvFile
}

/**
 * Phase 8 — Aktive Services neustarten (nur bei Update).
 */
function restartActiveSites(sites: SiteInfo[], log: Logger): void {
  for (const site of sites) {
    const svc = site.payloadService
    if (isServiceActive(svc)) {
      log.log(`  ${icon.info} Restart: ${svc}...`)
      log.log(restartService(svc, 1)
        ? `  ${icon.ok} ${svc} läuft`
        : `  ${icon.warn} ${svc} Start fehlgeschlagen — prüfe: journalctl -u ${svc} -n 30`)
    } else if (isServiceEnabled(svc)) {
      log.log(`  ${icon.info} Start: ${svc} (war gestoppt)...`)
      log.log(startService(svc, 1)
        ? `  ${icon.ok} ${svc} läuft`
        : `  ${icon.warn} ${svc} Start fehlgeschlagen — prüfe: journalctl -u ${svc} -n 30`)
    }
  }
}

/**
 * Phase 9 — Zusammenfassung mit Sites-Statustabelle.
 */
function printSummary(sites: SiteInfo[], log: Logger): void {
  const commit = headShort(INSTALL_DIR_PAYLOAD)
  const version = packageVersion(INSTALL_DIR_PAYLOAD)

  log.log(`  ${color.green}${color.bold}Installation abgeschlossen!${color.nc}`)
  log.log('')
  log.log(`  Version: v${version}`)
  log.log(`  Commit:  ${commit}`)
  log.log(`  Pfad:    ${INSTALL_DIR_PAYLOAD}/`)
  log.log('')

  if (sites.length > 0) {
    for (const site of sites) {
      const active = isServiceActive(site.payloadService)
      const statusLabel = active
        ? `${color.green}active${color.nc}`
        : `${color.yellow}stopped${color.nc}`
      log.log(`  ${color.bold}${site.tld}${color.nc}  Port ${site.payloadPort}  [${statusLabel}]`)
    }
  } else {
    log.log(`  ${color.bold}Nächster Schritt — Site einrichten:${color.nc}`)
    log.log(`    ${color.bold}infactory site create <tld>${color.nc}`)
  }

  log.log('')
  log.log(`  Docs:   ${color.blue}https://studio.xed.dev${color.nc}`)
  log.log(`  GitHub: ${color.blue}https://github.com/XED-dev/Studio-Payload${color.nc}`)
  log.log('')
}

export default class SiteUpdate extends Command {
  static description = 'Studio-Payload installieren oder aktualisieren (Code + Deps + Migrate + Build + Restart)'
static examples = [
    '<%= config.bin %> site update',
  ]

  async run(): Promise<void> {
    const log = {log: (msg: string) => this.log(msg)}

    this.log('')
    this.log(`  ${color.bold}inFactory Payload${color.nc} — Studio.XED.dev`)
    this.log(`  ${color.blue}Puck Visual Editor + Payload CMS + Next.js${color.nc}`)
    this.log('')

    // Phase 1 — Tool-Checks
    if (!checkTools(log)) this.exit(1)
    this.log('')

    // Phase 2 — Install ODER Update (auto-detect via package.json)
    const isUpdate = existsSync(join(INSTALL_DIR_PAYLOAD, 'package.json'))
    if (!installOrUpdateCode(isUpdate, log)) this.exit(1)

    // Phase 3 — Dependencies
    this.log(`  ${icon.info} Dependencies installieren...`)
    if (!runInstall(INSTALL_DIR_PAYLOAD)) {
      this.log(`  ${icon.err} pnpm install fehlgeschlagen`)
      this.exit(1)
    }

    this.log(`  ${icon.ok} Dependencies installiert`)
    this.log('')

    // Phase 4-5 — Env-Patch + Migrate-Loop (alle bestehenden Sites)
    const sites = discoverSites().filter((s) => s.hasPayload)
    migrateAllSites(sites, log)

    // Phase 6 — Keine Sites: Temp-Env für Build
    const tempEnvFile = sites.length === 0 ? setupTempBuildEnv(log) : undefined

    // Phase 7 — Next.js Build (Env-Vars aus erster Site oder Temp-Env)
    const buildEnvFile = sites.length > 0
      ? join(sites[0].dir, 'studio-payload.env')
      : tempEnvFile

    this.log(`  ${icon.info} Next.js Build...`)
    if (!runBuild(INSTALL_DIR_PAYLOAD, buildEnvFile)) {
      this.log(`  ${icon.err} Next.js Build fehlgeschlagen`)
      this.log(`     Manuell: cd ${INSTALL_DIR_PAYLOAD} && pnpm build`)
      this.exit(1)
    }

    this.log(`  ${icon.ok} Next.js Build erfolgreich`)
    this.log('')

    // Phase 8 — Services neustarten (nur bei Update)
    if (isUpdate && sites.length > 0) {
      restartActiveSites(sites, log)
      this.log('')
    }

    // Phase 9 — Zusammenfassung
    printSummary(sites, log)
  }
}
