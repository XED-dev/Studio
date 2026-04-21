/**
 * commands/images/audit.ts — `infactory images audit`
 *
 * Read-only Sub-Command (CLI-M5.5). Scannt Ghost-Pages nach externen
 * Image-URLs und prüft den lokalen Archiv-Status.
 *
 * Flag-Aliases analog deploy: --url → --ghost-url, --key → --admin-key.
 */

import {Command, Flags} from '@oclif/core'

import {resolveGhostConfig} from '../../lib/ghost-config.js'
import {ImagesError} from '../../lib/images-error.js'
import {auditImages, publicKeyId, validateImagesOptions} from '../../lib/images.js'
import {color, icon} from '../../lib/output.js'

export default class ImagesAudit extends Command {
  static description = 'Image-Audit: scannt Ghost-Pages nach externen Bildern + prüft Archiv-Status'
  static examples = [
    '<%= config.bin %> images audit --hostname=alt-host.at',
    '<%= config.bin %> images audit --hostname=alt.at --archive=/var/img-archive --verbose',
  ]
  static flags = {
    'admin-key': Flags.string({
      aliases: ['key'],
      description: 'Ghost Admin API Key <id:secret> (oder ENV INFACTORY_GHOST_KEY)',
      env: 'INFACTORY_GHOST_KEY',
    }),
    archive: Flags.string({
      description: 'Lokales Archiv-Verzeichnis für Verfügbarkeitsprüfung',
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
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Volle URLs anzeigen',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ImagesAudit)

    try {
      const resolved = resolveGhostConfig({adminKey: flags['admin-key'], ghostUrl: flags['ghost-url']})
      const ghostConfig = validateImagesOptions(resolved)

      this.log('')
      this.log(`  ${color.bold}Image Audit${color.nc} — Hostname: ${flags.hostname}`)
      this.log(`  Ghost:  ${ghostConfig.url}`)
      this.log(`  Key-ID: ${publicKeyId(ghostConfig.adminKey)}`)
      this.log('')

      const report = await auditImages({
        archiveDir: flags.archive,
        ghostConfig,
        hostname: flags.hostname,
      })

      if (report.external === 0) {
        this.log(`  ${icon.ok} Keine externen Bilder von ${flags.hostname} gefunden.`)
        this.log('')
        return
      }

      this.log(`  ${report.external} externe Bilder von ${flags.hostname}:`)
      this.log('')

      for (const entry of report.entries) {
        const sizeStr = entry.exists ? `${(entry.size / 1024).toFixed(0)} KB` : ''
        const marker = entry.exists ? icon.ok : icon.err
        const status = entry.exists ? sizeStr.padStart(8) : 'MISSING '.padStart(8)
        this.log(`  ${marker} ${entry.fileName.padEnd(45)} ${status}  ← ${entry.slugs.join(', ')}`)
        if (flags.verbose) this.log(`     ${entry.url}`)
      }

      this.log('')
      this.log(`  Ergebnis: ${report.available} verfügbar, ${report.missing} fehlend, ${report.external} gesamt`)

      if (report.missing > 0 && !flags.verbose) {
        this.log('')
        this.log(`  Fehlende Bilder:`)
        for (const e of report.entries.filter((x) => !x.exists)) {
          this.log(`    ${e.url}`)
        }
      }

      if (report.available === report.external && flags.archive) {
        this.log('')
        this.log(`  → Bereit für Migration: infactory images migrate --hostname=${flags.hostname} --archive=${flags.archive}`)
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
