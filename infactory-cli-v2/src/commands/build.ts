import {Command} from '@oclif/core'

import {runLegacyCommand} from '../lib/legacy.js'

export default class Build extends Command {
  static description = 'Ghost-Theme bauen (Legacy → CLI-M5.2)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['build', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
