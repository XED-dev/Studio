/**
 * site create <tld> — Per-Site-Setup für eine neue Studio-Payload-Instanz
 *
 * Ersetzt: payload.sh setup <tld> (Zeilen 86-253 der Bash-Vorlage)
 *
 * Ablauf:
 *   1. Voraussetzungen prüfen (Code installed, NGINX-Proxy-Config vorhanden)
 *   2. Site-Verzeichnis /var/xed/<tld>/ anlegen (g-host ownership)
 *   3. Secrets generieren ODER fehlende Env-Vars in bestehender Datei ergänzen
 *   4. pnpm payload migrate → DB-Tabellen anlegen
 *   5. DB-Permissions setzen (SQLite WAL-Mode braucht g-host-Schreibrechte)
 *   6. systemd-Unit schreiben + daemon-reload + enable + restart
 *   7. NGINX-Snippet als Tooltip ausgeben (User hängt es manuell in wo site edit)
 *   8. Zusammenfassung
 */

import {Args, Command} from '@oclif/core'
import {execSync} from 'node:child_process'
import {existsSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'

import {
  computePayloadPort,
  INSTALL_DIR_PAYLOAD,
  SERVICE_PREFIX_PAYLOAD,
  SITE_BASE,
  tldToServiceName,
} from '../../lib/config.js'
import {renderLocationsSnippet} from '../../lib/nginx.js'
import {color, icon} from '../../lib/output.js'
import {headShort, runMigrate} from '../../lib/payload.js'
import {
  defaultSiteEnv,
  patchMissingEnvVars,
  setDbPermissions,
  writeEnv,
} from '../../lib/site.js'
import {
  enableService,
  isServiceActive,
  restartService,
  writePayloadUnit,
} from '../../lib/systemd.js'

const PROXY_PAYLOAD_CONF = '/etc/nginx/proxy/xed.conf'

export default class SiteCreate extends Command {
  static args = {
    tld: Args.string({
      description: 'TLD der Site (z.B. steirischursprung.at)',
      required: true,
    }),
  }
static description = 'Per-Site Setup: Secrets, DB, systemd-Unit, NGINX-Snippet'
static examples = [
    '<%= config.bin %> site create steirischursprung.at',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(SiteCreate)
    const {tld} = args

    this.log('')
    this.log(`  ${color.bold}Studio-Payload Setup${color.nc} — ${tld}`)
    this.log('')

    // ── 1. Voraussetzungen ─────────────────────────────────────────────
    if (!existsSync(join(INSTALL_DIR_PAYLOAD, 'package.json'))) {
      this.log(`  ${icon.err} Studio-Payload nicht installiert: ${INSTALL_DIR_PAYLOAD}`)
      this.log(`  Zuerst ausführen: ${color.bold}infactory site update${color.nc}`)
      this.log('')
      this.exit(1)
    }

    // ── 2. Site-Verzeichnis ────────────────────────────────────────────
    const siteDir = join(SITE_BASE, tld)
    const envFile = join(siteDir, 'studio-payload.env')
    const service = tldToServiceName(SERVICE_PREFIX_PAYLOAD, tld)
    const port = computePayloadPort(tld)

    if (!existsSync(siteDir)) {
      this.log(`  ${icon.info} Erstelle ${siteDir}...`)
      mkdirSync(siteDir, {recursive: true})
      try {
        execSync(`chown g-host:g-host "${siteDir}"`, {stdio: 'pipe'})
      } catch { /* nicht kritisch */ }

      this.log(`  ${icon.ok} ${siteDir} erstellt`)
    }

    // ── 3. Secrets ─────────────────────────────────────────────────────
    if (existsSync(envFile)) {
      this.log(`  ${icon.ok} Secrets existieren bereits: ${envFile} (nicht überschrieben)`)
      const patched = patchMissingEnvVars(envFile, tld)
      if (patched > 0) {
        this.log(`  ${icon.ok} ${patched} fehlende Env-Var(s) ergänzt`)
      }
    } else {
      this.log(`  ${icon.info} Generiere Secrets...`)
      writeEnv(envFile, defaultSiteEnv(tld, siteDir))
      this.log(`  ${icon.ok} Secrets generiert: ${envFile}`)
    }

    // ── 4. Payload Migrate ─────────────────────────────────────────────
    this.log(`  ${icon.info} Payload Migrations...`)
    if (runMigrate(INSTALL_DIR_PAYLOAD, envFile)) {
      this.log(`  ${icon.ok} Migrations erfolgreich`)
    } else {
      this.log(`  ${icon.err} Migrations fehlgeschlagen`)
      this.log('')
      this.exit(1)
    }

    // ── 5. DB-Permissions ──────────────────────────────────────────────
    setDbPermissions(siteDir)
    this.log(`  ${icon.ok} DB-Permissions: ${siteDir} 775, payload.db g-host:g-host 664`)

    // ── 6. systemd-Unit ────────────────────────────────────────────────
    this.log(`  ${icon.info} Schreibe systemd Service auf Port ${port}...`)
    const unitPath = writePayloadUnit(service, {
      envFile,
      installDir: INSTALL_DIR_PAYLOAD,
      port,
      tld,
    })
    enableService(service)
    this.log(`  ${icon.ok} Service geschrieben: ${unitPath}`)

    this.log(`  ${icon.info} Starte ${service}...`)
    if (restartService(service, 2)) {
      this.log(`  ${icon.ok} ${service} läuft (Port ${port})`)
    } else {
      this.log(`  ${icon.err} ${service} startet nicht — prüfe: journalctl -u ${service} -n 30`)
      this.log('')
      this.exit(1)
    }

    // ── 7. NGINX-Snippet ───────────────────────────────────────────────
    if (!existsSync(PROXY_PAYLOAD_CONF)) {
      this.log('')
      this.log(`  ${icon.warn} NGINX Proxy-Config fehlt: ${PROXY_PAYLOAD_CONF}`)
      this.log(`  Zuerst ausführen: ${color.bold}curl -fsSL https://studio.xed.dev/install.sh | bash${color.nc}`)
    }

    this.log('')
    this.log(`  ${color.yellow}NGINX-Routen einrichten${color.nc} (falls noch nicht vorhanden):`)
    this.log(`  Füge in die jam.${tld} Config diese zwei Locations ein:`)
    this.log('')
    for (const line of renderLocationsSnippet(port).split('\n')) {
      this.log(`    ${color.bold}${line}${color.nc}`)
    }

    this.log('')
    this.log(`  ${color.yellow}Wichtig:${color.nc} Der ${color.bold}$${color.nc}-Anker in ^/studio(/|$) ist kritisch — er fängt`)
    this.log(`  ${color.bold}/studio${color.nc} ohne trailing slash ab, das sonst in try_files fallen und einen`)
    this.log(`  301-Redirect-Loop mit Next.js' 308 erzeugen würde (Session 24/25 Fix).`)
    this.log('')
    this.log(`  Dann: ${color.bold}nginx -t && systemctl reload nginx${color.nc}`)
    this.log('')

    // ── 8. Zusammenfassung ─────────────────────────────────────────────
    const commit = headShort(INSTALL_DIR_PAYLOAD)
    const active = isServiceActive(service)

    this.log(`  ${color.green}${color.bold}Setup abgeschlossen!${color.nc}`)
    this.log('')
    this.log(`  TLD:       ${tld}`)
    this.log(`  Port:      ${port}`)
    this.log(`  Service:   ${service}  [${active ? 'active' : 'inactive'}]`)
    this.log(`  Secrets:   ${envFile}`)
    this.log(`  DB:        ${join(siteDir, 'payload.db')}`)
    this.log(`  Commit:    ${commit}`)
    this.log('')
    this.log(`  Nächster Schritt — ersten Admin-User anlegen:`)
    this.log(`    ${color.bold}infactory admin create ${tld} <email>${color.nc}`)
    this.log('')
  }
}
