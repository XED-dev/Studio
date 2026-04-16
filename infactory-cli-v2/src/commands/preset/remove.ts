import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class PresetRemove extends Command {
  static description = 'Preset entfernen (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['preset', 'remove', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
