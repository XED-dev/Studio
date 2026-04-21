/**
 * commands/preset/remove.ts — `infactory preset remove <id> [--force]`
 *
 * Schreibender Subcommand (CLI-M5.6). Löscht eine Preset-YAML.
 *
 * SAFETY-DEFAULT: Ohne `--force` wird NICHT gelöscht — der Command zeigt
 * stattdessen den zu löschenden Pfad und verlangt explizite Bestätigung.
 * Diese Mechanik existiert bewusst, weil die Workstation eine harte
 * No-Deletion-Regel für AI-Agenten hat (siehe ~/.claude/CLAUDE.md): die CLI
 * darf die Operation anbieten, der Human DevOps muss sie bewusst auslösen.
 */

import {Args, Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {color, icon} from '../../lib/output.js'
import {PresetError} from '../../lib/preset-error.js'
import {removePreset} from '../../lib/preset.js'
import {resolveResourcePath} from '../../lib/resolve-resources.js'

export default class PresetRemove extends Command {
  static args = {
    id: Args.string({
      description: 'Preset-ID die gelöscht werden soll',
      required: true,
    }),
  }
  static description = 'Preset löschen (Safety: --force benötigt)'
  static examples = [
    '<%= config.bin %> preset remove old-blog              # zeigt nur Pfad, löscht nicht',
    '<%= config.bin %> preset remove old-blog --force      # löscht tatsächlich',
  ]
  static flags = {
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Löschung explizit bestätigen (sonst nur Anzeige)',
    }),
    presets: Flags.string({
      description: 'Pfad zum presets/ Verzeichnis (ohne Flag: Resolver)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PresetRemove)

    try {
      const presetsDir = resolveResourcePath(flags.presets ? resolve(flags.presets) : undefined, 'presets')
      const result = removePreset({
        force: flags.force,
        presetId: args.id,
        presetsDir,
      })

      this.log('')
      if (result.reason === 'needs_force') {
        this.log(`  ${icon.warn} Preset "${args.id}" würde gelöscht:`)
        this.log(`     ${result.presetPath}`)
        this.log('')
        this.log(`  Zur Bestätigung: ${color.bold}--force${color.nc} hinzufügen`)
        this.log('')
        return
      }

      this.log(`  ${icon.ok} Preset "${args.id}" gelöscht`)
      this.log(`     ${result.presetPath}`)
      this.log('')
    } catch (error) {
      if (error instanceof PresetError) {
        this.log('')
        this.log(`  ${icon.err} ${error.message}`)
        this.log('')
        this.exit(1)
      }

      throw error
    }
  }
}
