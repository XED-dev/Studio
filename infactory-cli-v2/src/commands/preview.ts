import {Command} from '@oclif/core'

import {runLegacyCommand} from '../lib/legacy.js'

export default class Preview extends Command {
  static description = 'Preview-Server für Theme-Entwicklung (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['preview', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
