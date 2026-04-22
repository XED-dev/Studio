import {Args, Command, Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {INSTALL_DIR_INFACTORY, PORT_INFACTORY, siteBase, tldToServiceName} from '../../lib/config.js'
import {
  detectWordOpsSites,
  generateInfactoryConfig,
  readExistingApiKey,
  renderInfactoryUnit,
  setWebRootAcls,
  writeInfactoryConfig,
} from '../../lib/infactory-setup.js'
import {color, icon} from '../../lib/output.js'
import {daemonReload, enableService, isServiceActive, restartService} from '../../lib/systemd.js'

export default class SiteInit extends Command {
  static args = {
    tld: Args.string({
      description: 'TLD der Site (z.B. steirischursprung.at)',
      required: true,
    }),
  }
  static description = 'Track-A Foundation einrichten: infactory.json, systemd-Service, WordOps-ACLs'
  static examples = [
    '<%= config.bin %> site init steirischursprung.at',
    '<%= config.bin %> site init steirischursprung.at --port=4369',
  ]
  static flags = {
    force: Flags.boolean({
      default: false,
      description: 'Bestehende Config überschreiben',
    }),
    port: Flags.integer({
      default: PORT_INFACTORY,
      description: 'Port für den infactory-Server (Default 4368)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(SiteInit)
    const {tld} = args

    if (!/^[\da-z][\da-z.-]+[\da-z]$/i.test(tld)) {
      this.log(`  ${icon.err} Ungültige TLD: "${tld}" — nur Buchstaben, Ziffern, Punkte und Bindestriche erlaubt.`)
      this.log('')
      this.exit(1)
    }

    const base = siteBase()
    const siteDir = join(base, tld)
    const cfgFile = join(siteDir, 'infactory.json')
    const svcName = tldToServiceName('infactory', tld)
    const svcFile = `/etc/systemd/system/${svcName}.service`

    this.log('')
    this.log(`  ${color.bold}inFactory Setup${color.nc} — Track A — ${tld}`)
    this.log('')

    // ── Voraussetzung: Code installiert? ───────────────────────────────
    if (!existsSync(join(INSTALL_DIR_INFACTORY, 'infactory-server', 'src', 'index.js'))) {
      this.log(`  ${icon.err} inFactory-Server nicht installiert.`)
      this.log(`  Zuerst: ${color.bold}curl -fsSL https://studio.xed.dev/install.sh | bash${color.nc}`)
      this.log('')
      this.exit(1)
    }

    this.log(`  ${icon.ok} Code vorhanden: ${INSTALL_DIR_INFACTORY}/`)

    // ── Site-Verzeichnis ───────────────────────────────────────────────
    if (existsSync(siteDir)) {
      this.log(`  ${icon.ok} ${siteDir} existiert`)
    } else {
      this.log(`  ${icon.info} Erstelle ${siteDir}...`)
      mkdirSync(siteDir, {recursive: true})
      try {
        execSync(`chown g-host:g-host "${siteDir}"`, {stdio: 'pipe'})
      } catch { /* ignore */ }

      this.log(`  ${icon.ok} ${siteDir} erstellt`)
    }

    // ── Bestehende Config prüfen ───────────────────────────────────────
    if (existsSync(cfgFile) && !flags.force) {
      this.log(`  ${icon.ok} Config existiert bereits: ${cfgFile}`)
      this.log(`  Mit ${color.bold}--force${color.nc} überschreiben.`)
      this.log('')
      this.log(`  Service-Status: ${isServiceActive(svcName) ? 'active' : 'stopped'}`)
      this.log('')
      return
    }

    // ── WordOps-Sites erkennen ─────────────────────────────────────────
    const sites = detectWordOpsSites(tld)
    if (sites.length === 0) {
      this.log(`  ${icon.warn} Keine WordOps-Sites für ${tld} gefunden.`)
      this.log(`  Erwartet: /var/www/<sub>.${tld}/htdocs/`)
    } else {
      for (const s of sites) {
        this.log(`  ${icon.ok} Site: ${s.name} → ${s.webroot}`)
      }
    }

    // ── API-Key ────────────────────────────────────────────────────────
    const existingKey = readExistingApiKey(cfgFile)
    if (existingKey) {
      this.log(`  ${icon.ok} API-Key: reuse (${existingKey.slice(0, 8)}...)`)
    } else {
      this.log(`  ${icon.info} API-Key: neu generiert`)
    }

    // ── infactory.json schreiben ───────────────────────────────────────
    this.log(`  ${icon.info} Schreibe ${cfgFile}...`)
    const config = generateInfactoryConfig({
      existingApiKey: existingKey,
      installDir: INSTALL_DIR_INFACTORY,
      port: flags.port,
      sites,
      tld,
    })

    try {
      const permsOk = writeInfactoryConfig(cfgFile, config)
      this.log(`  ${icon.ok} ${cfgFile} geschrieben`)
      if (!permsOk) {
        this.log(`  ${icon.warn} chmod/chown fehlgeschlagen (kein root?) — Permissions manuell setzen`)
      }
    } catch (error) {
      this.log(`  ${icon.err} Konnte ${cfgFile} nicht schreiben: ${error}`)
      this.log('')
      this.exit(1)
    }

    // ── systemd-Unit schreiben ─────────────────────────────────────────
    this.log(`  ${icon.info} Schreibe systemd Service auf Port ${flags.port}...`)
    const unitContent = renderInfactoryUnit({
      cfgFile,
      installDir: INSTALL_DIR_INFACTORY,
      siteDir,
      tld,
    })

    try {
      writeFileSync(svcFile, unitContent)
    } catch (error) {
      this.log(`  ${icon.err} Konnte ${svcFile} nicht schreiben: ${error}`)
      this.log('')
      this.exit(1)
    }

    daemonReload()
    enableService(svcName)
    this.log(`  ${icon.ok} Service: ${svcName} (Port ${flags.port})`)

    // ── ACLs für WordOps-Webroots ──────────────────────────────────────
    if (sites.length > 0) {
      const aclCount = setWebRootAcls(sites)
      this.log(`  ${icon.ok} ACLs für ${aclCount} Webroot(s) gesetzt`)
    }

    // ── Service starten ────────────────────────────────────────────────
    this.log(`  ${icon.info} Starte ${svcName}...`)
    if (restartService(svcName, 2)) {
      this.log(`  ${icon.ok} ${svcName} läuft (Port ${flags.port})`)
    } else {
      this.log(`  ${icon.err} ${svcName} startet nicht — prüfe: journalctl -u ${svcName} -n 30`)
      this.log('')
      this.exit(1)
    }

    // ── NGINX-Hinweis ──────────────────────────────────────────────────
    this.log('')
    this.log(`  ${color.yellow}NGINX-Route manuell einrichten${color.nc} (falls noch nicht vorhanden):`)
    this.log('')
    this.log(`    ${color.bold}location /xed/ {`)
    this.log(`        proxy_pass http://127.0.0.1:${flags.port}/;`)
    if (existsSync('/etc/nginx/proxy/xed.conf')) {
      this.log('        include /etc/nginx/proxy/xed.conf;')
    }

    this.log(`    }${color.nc}`)
    this.log('')
    this.log(`  Dann: ${color.bold}nginx -t && systemctl reload nginx${color.nc}`)

    // ── Zusammenfassung ────────────────────────────────────────────────
    this.log('')
    this.log(`  ${color.green}${color.bold}Setup abgeschlossen!${color.nc}`)
    this.log('')
    this.log(`  TLD:       ${tld}`)
    this.log(`  Port:      ${flags.port}`)
    this.log(`  Service:   ${svcName}`)
    this.log(`  Config:    ${cfgFile}`)
    this.log(`  Sites:     ${sites.length} Webroot(s)`)
    this.log('')
  }
}
