import {Command} from '@oclif/core'

import {runLegacyCommand} from '../lib/legacy.js'

export default class Deploy extends Command {
  static description = 'Ghost-Theme deployen via Admin API (Legacy → CLI-M5.3)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['deploy', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
