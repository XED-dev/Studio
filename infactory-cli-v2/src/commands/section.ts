import {Command} from '@oclif/core'

import {runLegacyCommand} from '../lib/legacy.js'

export default class Section extends Command {
  static description = 'Section-Layout-Editor: add/remove/move/layout/search (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['section', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
