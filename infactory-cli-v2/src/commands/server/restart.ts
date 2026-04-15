/**
 * server restart [tld] — startet konfigurierte infactory-Services neu
 *
 * Ersetzt: infactory-cli/src/server-manager.js:restart() (Zeilen 662-670).
 *
 * Semantik:
 *   - Ohne [tld]:  alle Sites mit infactory.json in /var/xed/ neustarten
 *   - Mit  [tld]:  nur diese eine Site neustarten
 *   - systemctl restart akzeptiert aktive + gestoppte Services gleichermaßen
 *   - Exit 1:      wenn mindestens ein Service nicht neugestartet werden konnte
 */

import {Args, Command} from '@oclif/core'

import {color, icon} from '../../lib/output.js'
import {performServerAction, resolveInfactoryTargets} from '../../lib/services.js'

export default class ServerRestart extends Command {
  static args = {
    tld: Args.string({
      description: 'TLD der Site (optional — ohne Arg alle konfigurierten)',
      required: false,
    }),
  }
static description = 'Infactory-Service(s) neustarten'
static examples = [
    '<%= config.bin %> server restart',
    '<%= config.bin %> server restart steirischursprung.at',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(ServerRestart)
    const log = {log: (msg: string) => this.log(msg)}

    this.log('')
    this.log(`  ${color.bold}inFactory Server — Restart${color.nc}`)
    this.log('')

    const targets = resolveInfactoryTargets(args.tld)
    if (targets === null) {
      this.log(`  ${icon.err} Site ${args.tld} nicht gefunden oder ohne infactory.json in /var/xed/`)
      this.log('')
      this.exit(1)
    }

    if (targets.length === 0) {
      this.log(`  ${icon.warn} Keine konfigurierten Sites mit infactory.json in /var/xed/`)
      this.log('')
      return
    }

    const result = performServerAction('restart', targets, log)
    this.log('')
    this.log(`  ${result.success} neugestartet · ${result.failed} fehlgeschlagen`)
    this.log('')

    if (result.failed > 0) this.exit(1)
  }
}
