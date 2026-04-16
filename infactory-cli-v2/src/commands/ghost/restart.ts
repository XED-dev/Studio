import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class GhostRestart extends Command {
  static description = 'Ghost CMS neustarten (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['ghost', 'restart', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
