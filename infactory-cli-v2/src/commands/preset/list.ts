import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class PresetList extends Command {
  static description = 'Verfügbare Presets auflisten (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['preset', 'list', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
