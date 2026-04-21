/**
 * commands/preset/clone.ts — `infactory preset clone <source> --name=<id>`
 *
 * Nativer oclif-Subcommand (CLI-M5.6). Forkt ein bestehendes Preset.
 * Optionale Overrides: --color, --font-display, --font-body, --description, --sections.
 */

import {Args, Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {color, icon} from '../../lib/output.js'
import {PresetError} from '../../lib/preset-error.js'
import {clonePreset} from '../../lib/preset.js'
import {resolveRegistryPath, resolveResourcePath} from '../../lib/resolve-resources.js'

export default class PresetClone extends Command {
  static args = {
    source: Args.string({
      description: 'Quell-Preset-ID (z.B. "blog", "agency")',
      required: true,
    }),
  }
  static description = 'Preset forken: bestehendes Preset mit neuem Namen + optionalen Overrides klonen'
  static examples = [
    '<%= config.bin %> preset clone blog --name=recode-blog',
    '<%= config.bin %> preset clone agency --name=client-xyz --color=#e11d48',
    '<%= config.bin %> preset clone saas --name=my-saas --font-display="\'Boska\', serif"',
    '<%= config.bin %> preset clone blog --name=newsletter --sections=hero_centered,posts_featured,cta_newsletter',
  ]
  static flags = {
    color: Flags.string({
      char: 'c',
      description: 'Primärfarbe als #RRGGBB oder #RGB (auto-darkens für hover/active)',
    }),
    description: Flags.string({
      description: 'Beschreibung überschreiben',
    }),
    'font-body': Flags.string({
      description: 'Body-Font überschreiben (z.B. "\'Inter\', sans-serif")',
    }),
    'font-display': Flags.string({
      description: 'Display-Font überschreiben (z.B. "\'Boska\', serif")',
    }),
    name: Flags.string({
      char: 'n',
      description: 'Neuer Preset-Slug (kebab-case, ASCII)',
      required: true,
    }),
    presets: Flags.string({
      description: 'Pfad zum presets/ Verzeichnis (ohne Flag: CWD → /opt/infactory/infactory-cli)',
    }),
    registry: Flags.string({
      description: 'Pfad zur sections/registry.json (ohne Flag: Resolver)',
    }),
    sections: Flags.string({
      char: 's',
      description: 'Comma-separierte Section-IDs für layout.home (überschreibt Quelle)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PresetClone)

    try {
      const presetsDir = resolveResourcePath(flags.presets ? resolve(flags.presets) : undefined, 'presets')
      const registryPath = flags.sections
        ? resolveRegistryPath(flags.registry ? resolve(flags.registry) : undefined)
        : null

      const result = clonePreset({
        color: flags.color,
        description: flags.description,
        fontBody: flags['font-body'],
        fontDisplay: flags['font-display'],
        name: flags.name,
        presetsDir,
        registryPath,
        sections: flags.sections,
        sourceId: args.source,
      })

      this.log('')
      this.log(`  ${icon.ok} Preset geklont: ${args.source} → ${result.newId}`)
      this.log(`     Datei:  ${result.presetPath}`)
      this.log(`     Name:   ${result.cloned.name}`)
      if (result.cloned.tokens?.color?.primary) {
        this.log(`     Farbe:  ${result.cloned.tokens.color.primary} → hover ${result.cloned.tokens.color.primary_hover}`)
      }

      if (result.cloned.tokens?.font?.display) {
        this.log(`     Font:   ${result.cloned.tokens.font.display}`)
      }

      const layout = result.cloned.layout?.home
      if (layout && layout.length > 0) {
        this.log(`     Layout: ${layout.length} Sections (${layout.join(', ')})`)
      }

      this.log('')
      this.log(`  ${color.bold}Nächste Schritte:${color.nc}`)
      this.log(`    infactory build --preset=${result.newId}`)
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
