import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class QaBatch extends Command {
  static description = 'Visual QA: Batch-Vergleich mehrerer Slugs (Legacy → CLI-M5.4)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['qa', 'batch', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
