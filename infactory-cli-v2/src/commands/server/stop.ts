/**
 * server stop [tld] — stoppt konfigurierte infactory-Services
 *
 * Ersetzt: infactory-cli/src/server-manager.js:stop() (Zeilen 652-660).
 *
 * Semantik:
 *   - Ohne [tld]:  alle Sites mit infactory.json in /var/xed/ stoppen
 *   - Mit  [tld]:  nur diese eine Site stoppen
 *   - Idempotent:  bereits gestoppte Services werden übersprungen (skipped)
 *   - Exit 1:      wenn mindestens ein Service nicht gestoppt werden konnte
 *
 * Sicherheits-Feature: Vor dem ersten Stop-Call werden alle Ziele aufgelistet
 * und eine Sekunde gewartet — so kann der User per Ctrl+C abbrechen, falls er
 * aus Versehen ohne [tld] aufgerufen hat und nur eine spezifische Site meinte.
 */

import {Args, Command, Flags} from '@oclif/core'
import {setTimeout as sleep} from 'node:timers/promises'

import {color, icon} from '../../lib/output.js'
import {listTargets, performServerAction, resolveInfactoryTargets} from '../../lib/services.js'

export default class ServerStop extends Command {
  static args = {
    tld: Args.string({
      description: 'TLD der Site (optional — ohne Arg alle konfigurierten)',
      required: false,
    }),
  }
static description = 'Infactory-Service(s) stoppen — idempotent, cron-tauglich'
static examples = [
    '<%= config.bin %> server stop',
    '<%= config.bin %> server stop steirischursprung.at',
    '<%= config.bin %> server stop --yes    # Stopp-Liste überspringen (Cron)',
  ]
static flags = {
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Keine Wartezeit vor Stop (für Cron/Scripts)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ServerStop)
    const log = {log: (msg: string) => this.log(msg)}

    this.log('')
    this.log(`  ${color.bold}inFactory Server — Stop${color.nc}`)
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

    // Ziele auflisten — User sieht, was betroffen ist
    listTargets(targets, 'stop', log)
    this.log('')

    // Eine Sekunde Wartezeit für Ctrl+C (außer --yes/Cron)
    if (!flags.yes && process.stdout.isTTY) {
      await sleep(1000)
    }

    const result = performServerAction('stop', targets, log)
    this.log('')
    this.log(`  ${result.success} gestoppt · ${result.skipped} bereits gestoppt · ${result.failed} fehlgeschlagen`)
    this.log('')

    if (result.failed > 0) this.exit(1)
  }
}
