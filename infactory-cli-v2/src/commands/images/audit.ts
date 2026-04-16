import {Command} from '@oclif/core'

import {runLegacyCommand} from '../../lib/legacy.js'

export default class ImagesAudit extends Command {
  static description = 'Image-Audit: fehlende/kaputte Bilder finden (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['images', 'audit', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
