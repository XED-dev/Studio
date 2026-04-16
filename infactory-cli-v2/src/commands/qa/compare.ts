import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class QaCompare extends Command {
  static description = 'Visual QA: Screenshot-Vergleich zweier URLs (Legacy → CLI-M5.4)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['qa', 'compare', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
