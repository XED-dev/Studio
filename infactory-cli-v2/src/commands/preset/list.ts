/**
 * commands/preset/list.ts — `infactory preset list`
 *
 * Read-only Subcommand (CLI-M5.6). Listet alle Presets mit Metadaten.
 */

import {Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {color, icon} from '../../lib/output.js'
import {PresetError} from '../../lib/preset-error.js'
import {listPresetDetails} from '../../lib/preset.js'
import {resolveResourcePath} from '../../lib/resolve-resources.js'

export default class PresetList extends Command {
  static description = 'Alle Presets mit Details auflisten (Name, Sections-Zähler, Klon-Origin)'
  static examples = [
    '<%= config.bin %> preset list',
    '<%= config.bin %> preset list --presets=/var/presets',
  ]
  static flags = {
    presets: Flags.string({
      description: 'Pfad zum presets/ Verzeichnis (ohne Flag: Resolver)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PresetList)

    try {
      const presetsDir = resolveResourcePath(flags.presets ? resolve(flags.presets) : undefined, 'presets')
      const presets = listPresetDetails(presetsDir)

      this.log('')
      if (presets.length === 0) {
        this.log(`  ${icon.info} Keine Presets in ${presetsDir}`)
        this.log('')
        return
      }

      this.log(`  ${color.bold}Presets${color.nc} (${presets.length})`)
      this.log('')

      for (const p of presets) {
        const origin = p.clonedFrom ? ` ← ${p.clonedFrom}` : ''
        this.log(`  ${p.icon}  ${p.id.padEnd(22)} ${p.name.padEnd(22)} ${String(p.sections).padStart(2)} Sections${origin}`)
      }

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
