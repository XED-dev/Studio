/**
 * commands/deploy.ts — `infactory deploy --preset=<id>`
 *
 * Nativer oclif-Command (ersetzt den Legacy-Delegation-Stub in CLI-M5.3).
 *
 * Flag-Aliases für User-Continuity zur Legacy-CLI:
 *   --ghost-url (alias: --url)
 *   --admin-key (alias: --key)
 * Die alten Kurzformen bleiben bis M6 gültig. Help zeigt die neuen Namen.
 *
 * Credential-Safety: Diese Command-Schicht darf `flags['admin-key']` in
 * keinem Log-Output erwähnen — nur an deployTheme() durchreichen. Die
 * Lib selbst loggt nur die public key-ID (Teil vor ':') und niemals den
 * kompletten Key oder den JWT.
 */

import {Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {DeployError} from '../lib/deploy-error.js'
import {deployTheme} from '../lib/deploy.js'
import {color, icon} from '../lib/output.js'

export default class Deploy extends Command {
  static description = 'Ghost-Theme deployen: Build → Upload → Activate (Admin API)'
  static examples = [
    '<%= config.bin %> deploy --preset=agency --ghost-url=https://mein.blog --admin-key=<id:secret>',
    '<%= config.bin %> deploy --preset=agency --skip-activate        # Upload only, manuelle Aktivierung',
    '<%= config.bin %> deploy --preset=agency --skip-build --zip-path=./dist/infactory-agency.zip',
    '<%= config.bin %> deploy --preset=agency --dry-run               # Build+Validate, kein Upload',
  ]
  static flags = {
    'admin-key': Flags.string({
      aliases: ['key'],
      description: 'Ghost Admin API Key im Format <id:secret> (oder ENV INFACTORY_GHOST_KEY)',
      env: 'INFACTORY_GHOST_KEY',
    }),
    'base-theme': Flags.string({
      description: 'Pfad zu base-theme/ (ohne Flag: CWD → /opt/infactory/infactory-cli)',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Build + ZIP, aber kein Upload zu Ghost',
    }),
    'ghost-url': Flags.string({
      aliases: ['url'],
      description: 'Ghost-Instanz-URL, z.B. https://mein.blog (oder ENV INFACTORY_GHOST_URL)',
      env: 'INFACTORY_GHOST_URL',
    }),
    out: Flags.string({
      char: 'o',
      default: './dist',
      description: 'Build-Ausgabeverzeichnis',
    }),
    preset: Flags.string({
      char: 'p',
      description: 'Preset-ID (z.B. agency, saas, blog, studio, steirischursprung)',
      required: true,
    }),
    presets: Flags.string({
      description: 'Pfad zum presets/ Verzeichnis (ohne Flag: CWD → /opt/infactory/infactory-cli)',
    }),
    registry: Flags.string({
      description: 'Pfad zur sections/registry.json (ohne Flag: CWD → /opt/infactory/infactory-cli)',
    }),
    'skip-activate': Flags.boolean({
      default: false,
      description: 'Theme hochladen, aber nicht aktivieren (manuelle Aktivierung in Ghost Admin)',
    }),
    'skip-build': Flags.boolean({
      default: false,
      description: 'Existierendes ZIP verwenden (kein Rebuild)',
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Detaillierte Ausgabe pro Pipeline-Schritt',
    }),
    'zip-path': Flags.string({
      description: 'Expliziter ZIP-Pfad (überschreibt <out>/infactory-<preset>.zip)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Deploy)

    this.log('')
    this.log(`  ${color.bold}inFactory Deploy${color.nc} — Preset: ${flags.preset}`)
    if (flags['dry-run']) this.log(`  ${icon.info} Dry-Run-Modus (kein Upload)`)
    if (flags['skip-activate']) this.log(`  ${icon.info} --skip-activate: Theme wird nicht aktiviert`)
    this.log('')

    try {
      const result = await deployTheme({
        adminKey: flags['admin-key'],
        baseThemeDir: flags['base-theme'] ? resolve(flags['base-theme']) : undefined,
        dryRun: flags['dry-run'],
        ghostUrl: flags['ghost-url'],
        outputDir: resolve(flags.out),
        preset: flags.preset,
        presetsDir: flags.presets ? resolve(flags.presets) : undefined,
        registryPath: flags.registry ? resolve(flags.registry) : undefined,
        skipActivate: flags['skip-activate'],
        skipBuild: flags['skip-build'],
        verbose: flags.verbose,
        zipPath: flags['zip-path'] ? resolve(flags['zip-path']) : undefined,
      })

      const seconds = (result.elapsed / 1000).toFixed(2)

      this.log('')
      if (result.dryRun) {
        this.log(`  ${icon.ok} Dry Run fertig in ${seconds}s`)
        this.log(`  ZIP:      ${result.zipPath}`)
      } else {
        this.log(`  ${icon.ok} Deploy fertig in ${seconds}s`)
        this.log(`  Theme:    ${result.themeName}`)
        this.log(`  ZIP:      ${result.zipPath}`)
        this.log(`  Ghost:    ${result.ghostUrl}`)
        if (result.activated) {
          this.log(`  ${icon.ok} Theme aktiv`)
        } else {
          this.log(`  ${icon.info} Theme hochgeladen — manuell aktivieren:`)
          this.log(`          ${result.ghostUrl}/ghost/#/settings/design`)
        }
      }

      this.log('')
    } catch (error) {
      if (error instanceof DeployError) {
        this.log('')
        this.log(`  ${icon.err} ${error.message}`)
        this.log('')
        this.exit(1)
      }

      throw error
    }
  }
}
