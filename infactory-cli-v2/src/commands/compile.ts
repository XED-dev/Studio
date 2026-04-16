import {Command} from '@oclif/core'

import {runLegacyCommand} from '../lib/legacy.js'

export default class Compile extends Command {
  static description = 'Track-A Compile-Engine: section.yaml + template.hbs → HTML (Legacy)'
  static strict = false

  async run() {
    const exitCode = runLegacyCommand(['compile', ...this.argv])
    if (exitCode !== 0) this.exit(exitCode)
  }
}
