import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class ImagesList extends Command {
  static description = 'Alle Bilder einer Ghost-Site auflisten (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['images', 'list', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
