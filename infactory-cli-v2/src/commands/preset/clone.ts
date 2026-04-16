import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class PresetClone extends Command {
  static description = 'Preset klonen (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['preset', 'clone', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
