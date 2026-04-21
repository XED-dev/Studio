/**
 * commands/qa/compare.ts — `infactory qa compare --source=<url> --target=<url>`
 *
 * Nativer oclif-Subcommand (ersetzt Legacy-Delegation für `qa compare` in
 * CLI-M5.4). Drei-Sensoren-Architektur (Pixel + CSS + Struktur), gewichteter
 * Gesamt-Score, Ziel 99%.
 *
 * `infactory qa batch` bleibt Legacy bis zur nächsten Session — batch ist
 * nur eine Schleife über compare, kann jederzeit nachgezogen werden.
 */

import {Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {color, icon} from '../../lib/output.js'
import {QaError} from '../../lib/qa-error.js'
import {compareQa} from '../../lib/qa.js'

export default class QaCompare extends Command {
  static description = 'Visual QA: Source vs. Target auf Pixel + CSS + Struktur vergleichen'
  static examples = [
    '<%= config.bin %> qa compare --source=https://orig.at/home --target=https://new.at/home',
    '<%= config.bin %> qa compare --source=https://a.at/x --target=https://b.at/x --width=1920',
    '<%= config.bin %> qa compare --source=https://a.at --target=https://b.at --out=/var/qa',
  ]
  static flags = {
    out: Flags.string({
      char: 'o',
      default: '/tmp/infactory-qa',
      description: 'Ausgabeverzeichnis für PNGs + report.json',
    }),
    source: Flags.string({
      char: 's',
      description: 'Quell-URL (Original, Referenz)',
      required: true,
    }),
    target: Flags.string({
      char: 't',
      description: 'Ziel-URL (Nachbau, wird gegen Source geprüft)',
      required: true,
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Detaillierte Ausgabe pro Sensor',
    }),
    width: Flags.integer({
      char: 'w',
      default: 1440,
      description: 'Viewport-Breite für Screenshots in px',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(QaCompare)

    this.log('')
    this.log(`  ${color.bold}Visual QA${color.nc} — Source vs. Target`)
    this.log(`  Source: ${flags.source}`)
    this.log(`  Target: ${flags.target}`)
    this.log('')

    try {
      const report = await compareQa({
        outputDir: resolve(flags.out),
        sourceUrl: flags.source,
        targetUrl: flags.target,
        width: flags.width,
      })

      this.log(`  ${icon.ok} Slug: ${report.slug}`)
      this.log('')

      if (report.pixel) {
        const marker = report.pixel.layoutDiff ? icon.warn : icon.ok
        this.log(`  ${marker} Sensor 1 (Pixel):    ${report.pixel.similarity}%`
          + (report.pixel.layoutDiff ? ' — LAYOUT-DIFF (Bilder haben verschiedene Dimensionen)' : ''))
      } else {
        this.log(`  ${icon.err} Sensor 1 (Pixel):    fehlgeschlagen`)
      }

      if (report.css) {
        this.log(`  ${icon.ok} Sensor 2 (CSS):      ${report.css.score}% (${report.css.matches}/${report.css.total} identisch)`)
        if (flags.verbose && report.css.diffs.length > 0) {
          const maxShow = 15
          const shown = report.css.diffs.slice(0, maxShow)
          this.log('')
          for (const d of shown) {
            this.log(`     ${d.name.padEnd(15)} ${d.prop.padEnd(18)} `
              + `${d.source.slice(0, 26).padEnd(28)} ${d.target.slice(0, 26)}`)
          }

          if (report.css.diffs.length > maxShow) {
            this.log(`     … und ${report.css.diffs.length - maxShow} weitere`)
          }
        }
      } else {
        this.log(`  ${icon.err} Sensor 2 (CSS):      fehlgeschlagen`)
      }

      if (report.structure) {
        const srcS = report.structure.summary.sourceSections ?? 0
        const tgtS = report.structure.summary.targetSections ?? 0
        this.log(`  ${icon.ok} Sensor 3 (Struktur): ${report.structure.percentage}% (Sections: ${srcS}/${tgtS})`)
        if (flags.verbose && report.structure.diffs.length > 0) {
          this.log('')
          for (const d of report.structure.diffs) {
            const marker = d.type.includes('critical')
              ? icon.err
              : (d.type.includes('missing') ? icon.warn : icon.info)
            this.log(`     ${marker} ${d.detail ?? d.type}`)
          }
        }
      } else {
        this.log(`  ${icon.err} Sensor 3 (Struktur): fehlgeschlagen`)
      }

      this.log('')
      this.log(`  ${color.bold}Gesamt-Score: ${report.overall}%${color.nc}  (Ziel: 99%)`)
      this.log(`     Struktur: ${report.structure?.percentage ?? 0}%  × ${report.weights.structure}`)
      this.log(`     Pixel:    ${report.pixel?.similarity ?? 0}%  × ${report.weights.pixel}`)
      this.log(`     CSS:      ${report.css?.score ?? 0}%  × ${report.weights.css}`)
      this.log('')
      this.log(`  Report:  ${resolve(flags.out)}/${report.slug}-report.json`)
      this.log(`  PNGs:    ${resolve(flags.out)}/${report.slug}-{source,target,diff}.png`)
      this.log('')
    } catch (error) {
      if (error instanceof QaError) {
        this.log('')
        this.log(`  ${icon.err} ${error.message}`)
        this.log('')
        this.exit(1)
      }

      throw error
    }
  }
}
