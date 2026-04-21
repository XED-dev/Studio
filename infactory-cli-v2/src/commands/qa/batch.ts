/**
 * commands/qa/batch.ts — `infactory qa batch --source-base=<url> --target-base=<url> --slugs=a,b,c`
 *
 * Nativer oclif-Subcommand (ersetzt Legacy-Delegation für `qa batch` in
 * CLI-M5.4.1). Schleife über compareQa() pro Slug, aggregiert in
 * batch-report.json.
 */

import {Command, Flags} from '@oclif/core'
import {resolve} from 'node:path'

import {color, icon} from '../../lib/output.js'
import {QaError} from '../../lib/qa-error.js'
import {batchCompareQa, parseSlugsList} from '../../lib/qa.js'

export default class QaBatch extends Command {
  static description = 'Visual QA Batch: mehrere Slugs zwischen zwei Basis-URLs vergleichen'
  static examples = [
    '<%= config.bin %> qa batch --source-base=https://orig.at --target-base=https://new.at --slugs=home,about,team',
    '<%= config.bin %> qa batch --source-base=https://a.at --target-base=https://b.at --slugs=home --width=1920',
  ]
  static flags = {
    out: Flags.string({
      char: 'o',
      default: '/tmp/infactory-qa',
      description: 'Ausgabeverzeichnis für PNGs + JSON-Reports',
    }),
    slugs: Flags.string({
      description: 'Comma-separierte Slug-Liste, z.B. "home,about,news"',
      required: true,
    }),
    'source-base': Flags.string({
      char: 's',
      description: 'Quell-Basis-URL (wird mit `<base>/<slug>/` kombiniert)',
      required: true,
    }),
    'target-base': Flags.string({
      char: 't',
      description: 'Ziel-Basis-URL',
      required: true,
    }),
    verbose: Flags.boolean({
      char: 'v',
      default: false,
      description: 'Detaillierte Ausgabe pro Slug',
    }),
    width: Flags.integer({
      char: 'w',
      default: 1440,
      description: 'Viewport-Breite für Screenshots in px',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(QaBatch)
    const slugs = parseSlugsList(flags.slugs)

    if (slugs.length === 0) {
      this.log('')
      this.log(`  ${icon.err} --slugs enthält keine gültigen Einträge`)
      this.log('')
      this.exit(1)
    }

    this.log('')
    this.log(`  ${color.bold}Visual QA Batch${color.nc} — ${slugs.length} Slugs`)
    this.log(`  Source: ${flags['source-base']}`)
    this.log(`  Target: ${flags['target-base']}`)
    this.log('')

    try {
      const report = await batchCompareQa({
        outputDir: resolve(flags.out),
        slugs,
        sourceBase: flags['source-base'],
        targetBase: flags['target-base'],
        width: flags.width,
      })

      this.log('')
      this.log(`  ${color.bold}Ergebnisse${color.nc}`)
      this.log('')
      this.log(`  ${'Slug'.padEnd(30)} ${'Struktur'.padStart(9)} ${'Pixel'.padStart(7)} ${'CSS'.padStart(5)} ${'Gesamt'.padStart(8)}`)
      this.log(`  ${'─'.repeat(30)} ${'─'.repeat(9)} ${'─'.repeat(7)} ${'─'.repeat(5)} ${'─'.repeat(8)}`)

      for (const entry of report.entries) {
        if (entry.error) {
          this.log(`  ${entry.slug.padEnd(30)} ${'ERR'.padStart(9)} ${'—'.padStart(7)} ${'—'.padStart(5)} ${'—'.padStart(8)}`)
          if (flags.verbose) this.log(`     ${icon.err} ${entry.error.slice(0, 100)}`)
        } else {
          const r = entry.report
          const s = r?.structure ? `${r.structure.percentage}%` : '—'
          const p = r?.pixel ? `${r.pixel.similarity}%` : '—'
          const c = r?.css ? `${r.css.score}%` : '—'
          const o = entry.overall === null ? '—' : `${entry.overall}%`
          this.log(`  ${entry.slug.padEnd(30)} ${s.padStart(9)} ${p.padStart(7)} ${c.padStart(5)} ${o.padStart(8)}`)
        }
      }

      this.log('')
      this.log(`  ${color.bold}Durchschnitt: ${report.avgScore}%${color.nc}  (Ziel: 99%)`)
      this.log(`  Erfolg:       ${report.successCount}/${report.totalSlugs}`)
      this.log(`  Batch-Report: ${resolve(flags.out)}/batch-report.json`)
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
