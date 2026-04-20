/**
 * commands/build.ts — `infactory build --preset=<id>`
 *
 * Nativer oclif-Command (ersetzt den Legacy-Delegation-Stub in CLI-M5.2).
 *
 * Nutzt lib/build.ts für die komplette Theme-Build-Pipeline.
 * Flag-Konvention (CC §Design-Entscheidungen): Preset-Operationen erwarten
 * `--preset=<id>`, nicht positional. User-Continuity zur Legacy-CLI.
 */

import {Command, Flags} from '@oclif/core'
import {statSync} from 'node:fs'
import {resolve} from 'node:path'

import {BuildError} from '../lib/build-error.js'
import {buildTheme, listPresets} from '../lib/build.js'
import {color, icon} from '../lib/output.js'

export default class Build extends Command {
  static description = 'Ghost-Theme aus Preset bauen (tokens.css + home.hbs + package.json + optional ZIP)'
  static examples = [
    '<%= config.bin %> build --preset=agency',
    '<%= config.bin %> build --preset=saas --out=./dist --zip',
    '<%= config.bin %> build --preset=blog --verbose',
  ]
  static flags = {
    'base-theme': Flags.string({
      default: './base-theme',
      description: 'Pfad zu base-theme/',
    }),
    out: Flags.string({
      char: 'o',
      default: './dist',
      description: 'Ausgabe-Basisverzeichnis (Theme landet in <out>/infactory-<preset>/)',
    }),
    preset: Flags.string({
      char: 'p',
      description: 'Preset-ID (z.B. agency, saas, blog, studio)',
      required: true,
    }),
    presets: Flags.string({
      default: './presets',
      description: 'Pfad zum presets/ Verzeichnis',
    }),
    registry: Flags.string({
      default: './sections/registry.json',
      description: 'Pfad zur sections/registry.json',
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Detaillierte Ausgabe pro Pipeline-Schritt',
    }),
    zip: Flags.boolean({
      default: false,
      description: 'ZIP-Archiv für Ghost Admin Upload erzeugen',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Build)

    this.log('')
    this.log(`  ${color.bold}inFactory Build${color.nc} — Preset: ${flags.preset}`)
    this.log('')

    try {
      const result = await buildTheme({
        baseThemeDir: resolve(flags['base-theme']),
        outputDir: resolve(flags.out),
        preset: flags.preset,
        presetsDir: resolve(flags.presets),
        registryPath: resolve(flags.registry),
        verbose: flags.verbose,
        zip: flags.zip,
      })

      const seconds = (result.elapsed / 1000).toFixed(2)
      this.log('')
      this.log(`  ${icon.ok} Build fertig in ${seconds}s`)
      this.log(`  ${icon.ok} Tokens:   ${result.tokensCount}`)
      this.log(`  ${icon.ok} Sections: ${result.sections.length} (${result.sections.join(', ')})`)

      if (result.warnings.length > 0) {
        this.log('')
        for (const w of result.warnings) this.log(`  ${icon.warn} ${w}`)
      }

      this.log('')
      this.log(`  Theme:    ${result.themeDir}`)
      if (result.zipPath) {
        const kb = (statSync(result.zipPath).size / 1024).toFixed(1)
        this.log(`  ZIP:      ${result.zipPath} (${kb} KB)`)
      }

      this.log(`  Upload:   Ghost Admin → Einstellungen → Design → Theme hochladen`)
      this.log('')
    } catch (error) {
      if (error instanceof BuildError) {
        this.log('')
        this.log(`  ${icon.err} ${error.message}`)
        const available = listPresets(resolve(flags.presets))
        if (available.length > 0) {
          this.log(`  Verfügbare Presets: ${available.join(', ')}`)
        }

        this.log('')
        this.exit(1)
      }

      throw error
    }
  }
}
