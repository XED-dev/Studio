/**
 * commands/images/list.ts — `infactory images list`
 *
 * Read-only Sub-Command (CLI-M5.5). Inventarisiert alle Image-Referenzen
 * in Ghost-Pages, gruppiert nach Ghost-lokal vs. extern (pro Hostname).
 */

import {Command, Flags} from '@oclif/core'
import {basename} from 'node:path'

import {resolveGhostConfig} from '../../lib/ghost-config.js'
import {ImagesError} from '../../lib/images-error.js'
import {listImages, publicKeyId, validateImagesOptions} from '../../lib/images.js'
import {color, icon} from '../../lib/output.js'

export default class ImagesList extends Command {
  static description = 'Image-Inventur: Ghost-lokale + externe Bilder gruppiert auflisten'
  static examples = [
    '<%= config.bin %> images list',
    '<%= config.bin %> images list --verbose',
  ]
  static flags = {
    'admin-key': Flags.string({
      aliases: ['key'],
      description: 'Ghost Admin API Key <id:secret> (oder ENV INFACTORY_GHOST_KEY)',
      env: 'INFACTORY_GHOST_KEY',
    }),
    'ghost-url': Flags.string({
      aliases: ['url'],
      description: 'Ghost-Instanz-URL (oder ENV INFACTORY_GHOST_URL)',
      env: 'INFACTORY_GHOST_URL',
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Einzelne URLs auflisten (statt nur Counts)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ImagesList)

    try {
      const resolved = resolveGhostConfig({adminKey: flags['admin-key'], ghostUrl: flags['ghost-url']})
      const ghostConfig = validateImagesOptions(resolved)

      this.log('')
      this.log(`  ${color.bold}Image Inventory${color.nc}`)
      this.log(`  Ghost:  ${ghostConfig.url}`)
      this.log(`  Key-ID: ${publicKeyId(ghostConfig.adminKey)}`)
      this.log('')

      const report = await listImages(ghostConfig)

      this.log(`  Ghost-lokal: ${report.ghostLocal.size} Bilder`)
      if (flags.verbose) {
        for (const url of report.ghostLocal) {
          this.log(`    ${basename(new URL(url).pathname)}`)
        }
      }

      let totalExternal = 0
      if (report.external.size > 0) {
        this.log('')
        for (const [host, urls] of report.external) {
          this.log(`  Extern (${host}): ${urls.size} Bilder`)
          totalExternal += urls.size
          if (flags.verbose) {
            for (const url of urls) {
              this.log(`    ${basename(new URL(url).pathname)}`)
            }
          }
        }
      }

      this.log('')
      this.log(`  Gesamt: ${report.ghostLocal.size} lokal, ${totalExternal} extern`)

      if (totalExternal > 0) {
        this.log('')
        this.log(`  → Externe migrieren: infactory images audit --hostname=<host> --archive=<dir>`)
      }

      this.log('')
    } catch (error) {
      if (error instanceof ImagesError) {
        this.log('')
        this.log(`  ${icon.err} ${error.message}`)
        this.log('')
        this.exit(1)
      }

      throw error
    }
  }
}
