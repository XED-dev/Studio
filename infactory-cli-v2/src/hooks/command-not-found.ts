/**
 * hooks/command-not-found.ts — Catch-All für nicht-native Commands
 *
 * oclif feuert diesen Hook wenn ein Command nicht in v2 existiert.
 * Wir delegieren an die alte CJS-CLI (infactory-cli/) — damit funktionieren
 * alle Track-B Commands (build, deploy, qa, images, preset, section, etc.)
 * sofort via den v2-Symlink, ohne einzelne Portierung.
 *
 * `process.argv.slice(2)` enthält die kompletten Args in der Original-Reihenfolge
 * (z.B. ['build', '--preset=agency', '--zip']). Die alte CLI parsed sie identisch.
 */

import {Hook} from '@oclif/core'

import {runLegacyCommand} from '../lib/legacy.js'

export const hook: Hook<'command_not_found'> = async function ({id}) {
  this.debug(`Command "${id}" nicht in v2 — delegiere an alte CLI`)

  const args = process.argv.slice(2)
  const exitCode = runLegacyCommand(args)

  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- Hook muss Exit-Code propagieren, throw trifft kein oclif-Command-Kontext
  process.exit(exitCode)
}
