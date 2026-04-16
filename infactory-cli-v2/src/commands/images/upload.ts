import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class ImagesUpload extends Command {
  static description = 'Bilder in Ghost hochladen (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['images', 'upload', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
