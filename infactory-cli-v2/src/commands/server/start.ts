/**
 * server start [tld] — startet konfigurierte infactory-Services
 *
 * Ersetzt: infactory-cli/src/server-manager.js:start() (alte CommonJS-Vorlage,
 * Zeilen 628-650; ohne sudo und ohne Spawn-Fallback — reiner systemd-Pfad).
 *
 * Semantik:
 *   - Ohne [tld]:  alle Sites mit infactory.json in /var/xed/ starten
 *   - Mit  [tld]:  nur diese eine Site starten
 *   - Idempotent:  aktive Services werden übersprungen (skipped)
 *   - Exit 1:      wenn mindestens ein Service nicht startete (cron-tauglich)
 */

import {Args, Command} from '@oclif/core'

import {color, icon} from '../../lib/output.js'
import {performServerAction, resolveInfactoryTargets} from '../../lib/services.js'

export default class ServerStart extends Command {
  static args = {
    tld: Args.string({
      description: 'TLD der Site (optional — ohne Arg alle konfigurierten)',
      required: false,
    }),
  }
static description = 'Infactory-Service(s) starten — idempotent, cron-tauglich'
static examples = [
    '<%= config.bin %> server start',
    '<%= config.bin %> server start steirischursprung.at',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(ServerStart)
    const log = {log: (msg: string) => this.log(msg)}

    this.log('')
    this.log(`  ${color.bold}inFactory Server — Start${color.nc}`)
    this.log('')

    const targets = resolveInfactoryTargets(args.tld)
    if (targets === null) {
      this.log(`  ${icon.err} Site ${args.tld} nicht gefunden oder ohne infactory.json in /var/xed/`)
      this.log(`  Konfigurierte Sites: ${color.bold}infactory site status${color.nc}`)
      this.log('')
      this.exit(1)
    }

    if (targets.length === 0) {
      this.log(`  ${icon.warn} Keine konfigurierten Sites mit infactory.json in /var/xed/`)
      this.log(`  Setup: ${color.bold}infactory site create <tld>${color.nc}`)
      this.log('')
      return
    }

    const result = performServerAction('start', targets, log)
    this.log('')
    this.log(`  ${result.success} gestartet · ${result.skipped} bereits aktiv · ${result.failed} fehlgeschlagen`)
    this.log('')

    if (result.failed > 0) this.exit(1)
  }
}
