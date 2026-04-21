/**
 * commands/images/upload.ts — `infactory images upload <files...>`
 *
 * Schreibender Sub-Command (CLI-M5.5). Lädt N lokale Bilder zu Ghost hoch.
 *
 * Files als variadische positional-Args. Sequentiell (Rate-Limit-Schutz).
 * Einzelne Fehler sind non-fatal — gehen in errors[]. Exit 1 wenn alle
 * Uploads fehlschlugen ODER ok=0.
 */

import {Args, Command, Flags} from '@oclif/core'
import {basename} from 'node:path'

import {resolveGhostConfig} from '../../lib/ghost-config.js'
import {ImagesError} from '../../lib/images-error.js'
import {publicKeyId, uploadImages, validateImagesOptions} from '../../lib/images.js'
import {color, icon} from '../../lib/output.js'

export default class ImagesUpload extends Command {
  static args = {
    files: Args.string({
      description: 'Pfade zu lokalen Bilddateien',
      required: true,
    }),
  }
  static description = 'Bilder zu Ghost hochladen (Admin API)'
  static examples = [
    '<%= config.bin %> images upload logo.png',
    '<%= config.bin %> images upload header.jpg footer.png hero.webp',
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
  }
  static strict = false  // erlaube N positional Args (variadisch)

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(ImagesUpload)
    const files = argv as string[]

    if (files.length === 0) {
      this.log('')
      this.log(`  ${icon.err} Mindestens eine Datei angeben`)
      this.log('')
      this.exit(1)
    }

    try {
      const resolved = resolveGhostConfig({adminKey: flags['admin-key'], ghostUrl: flags['ghost-url']})
      const ghostConfig = validateImagesOptions(resolved)

      this.log('')
      this.log(`  ${color.bold}Image Upload${color.nc} — ${files.length} Datei${files.length === 1 ? '' : 'en'}`)
      this.log(`  Ghost:  ${ghostConfig.url}`)
      this.log(`  Key-ID: ${publicKeyId(ghostConfig.adminKey)}`)
      this.log('')

      const result = await uploadImages(ghostConfig, files)

      for (const ok of result.ok) {
        this.log(`  ${icon.ok} ${basename(ok.file)} → ${ok.url}`)
      }

      for (const err of result.errors) {
        this.log(`  ${icon.err} ${basename(err.file)} — ${err.message}`)
      }

      this.log('')
      this.log(`  ${result.ok.length} hochgeladen, ${result.errors.length} fehlgeschlagen`)
      this.log('')

      if (result.ok.length === 0) this.exit(1)
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
