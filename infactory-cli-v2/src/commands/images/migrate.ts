/**
 * commands/images/migrate.ts — `infactory images migrate`
 *
 * Schreibender Sub-Command (CLI-M5.5). Lädt Bilder aus lokalem Archiv zu
 * Ghost hoch und rewritet die URL-Referenzen in den Pages.
 *
 * SAFETY:
 *   - `--dry-run` als Default-Empfehlung für ersten Lauf (kein Upload, keine
 *     Page-Updates).
 *   - Bei Upload-Fehlern wird Phase 3 (Page-Updates) ÜBERSPRUNGEN — partielle
 *     Migrationen würden Pages inkonsistent lassen.
 *   - Optional `--slug` filtert auf eine einzelne Page (kontrollierbarer Test).
 *   - Path-Traversal-Schutz in urlToLocalPath (Härtung vs. Legacy).
 */

import {Command, Flags} from '@oclif/core'

import {resolveGhostConfig} from '../../lib/ghost-config.js'
import {ImagesError} from '../../lib/images-error.js'
import {migrateImages, publicKeyId, validateImagesOptions} from '../../lib/images.js'
import {color, icon} from '../../lib/output.js'

export default class ImagesMigrate extends Command {
  static description = 'Image-Migration: Bilder aus lokalem Archiv zu Ghost hochladen + Pages rewriten'
  static examples = [
    '<%= config.bin %> images migrate --hostname=alt.at --archive=/var/img --dry-run',
    '<%= config.bin %> images migrate --hostname=alt.at --archive=/var/img --slug=home',
    '<%= config.bin %> images migrate --hostname=alt.at --archive=/var/img',
  ]
  static flags = {
    'admin-key': Flags.string({
      aliases: ['key'],
      description: 'Ghost Admin API Key <id:secret> (oder ENV INFACTORY_GHOST_KEY)',
      env: 'INFACTORY_GHOST_KEY',
    }),
    archive: Flags.string({
      description: 'Lokales Archiv-Verzeichnis mit den Bildern',
      required: true,
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Kein Upload, keine Page-Updates — zeigt nur was passieren würde',
    }),
    'ghost-url': Flags.string({
      aliases: ['url'],
      description: 'Ghost-Instanz-URL (oder ENV INFACTORY_GHOST_URL)',
      env: 'INFACTORY_GHOST_URL',
    }),
    hostname: Flags.string({
      char: 'h',
      description: 'Hostname-Pattern für externe URLs (z.B. alt-host.at)',
      required: true,
    }),
    slug: Flags.string({
      description: 'Nur eine bestimmte Page migrieren (Page-Slug)',
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Detaillierte Ausgabe pro Upload',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ImagesMigrate)

    try {
      const resolved = resolveGhostConfig({adminKey: flags['admin-key'], ghostUrl: flags['ghost-url']})
      const ghostConfig = validateImagesOptions(resolved)

      this.log('')
      this.log(`  ${color.bold}Image Migration${color.nc}${flags['dry-run'] ? ' (DRY-RUN)' : ''}`)
      this.log(`  Ghost:    ${ghostConfig.url}`)
      this.log(`  Hostname: ${flags.hostname}`)
      this.log(`  Archive:  ${flags.archive}`)
      this.log(`  Key-ID:   ${publicKeyId(ghostConfig.adminKey)}`)
      if (flags.slug) this.log(`  Slug:     ${flags.slug} (gefiltert)`)
      this.log('')

      const report = await migrateImages({
        archiveDir: flags.archive,
        dryRun: flags['dry-run'],
        ghostConfig,
        hostname: flags.hostname,
        slug: flags.slug,
      })

      // Upload-Phase
      this.log(`  ${color.bold}Phase 2: Upload${color.nc}`)
      for (const entry of report.uploadEntries) {
        if (entry.error) {
          this.log(`  ${icon.err} ${entry.fileName} — ${entry.error}`)
        } else {
          const target = report.dryRun ? '[dry-run]' : entry.newUrl
          this.log(`  ${icon.ok} ${entry.fileName} → ${target}`)
        }
      }

      this.log('')
      this.log(`  Upload: ${report.uploadOk} OK, ${report.uploadErrors} Fehler`)

      if (report.uploadErrors > 0 && !report.dryRun) {
        this.log('')
        this.log(`  ${icon.warn} Migration abgebrochen wegen Upload-Fehlern.`)
        this.log(`     Bereits hochgeladene Bilder bleiben in Ghost (Re-Upload via ref-Header dedupliziert).`)
        this.log('')
        this.exit(1)
      }

      // Update-Phase
      this.log('')
      this.log(`  ${color.bold}Phase 3: Page-Updates${color.nc}`)
      this.log(`  ${icon.ok} ${report.pagesUpdated} Page${report.pagesUpdated === 1 ? '' : 's'} aktualisiert`)
      this.log('')

      if (report.dryRun) {
        this.log(`  ${icon.info} Dry-Run abgeschlossen. Realer Lauf: gleiches Kommando ohne --dry-run.`)
        this.log('')
      }
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
