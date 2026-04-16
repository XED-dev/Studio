import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class ImagesMigrate extends Command {
  static description = 'Image-Migration: Bilder von Quelle nach Ghost (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['images', 'migrate', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
