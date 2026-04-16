/**
 * lib/legacy.ts — Delegation an die alte CommonJS-CLI (infactory-cli/)
 *
 * Die alte CLI unter /opt/infactory/infactory-cli/ enthält Track-B Commands
 * (build, deploy, qa, images, preset, section, etc.), die in der oclif-CLI
 * noch nicht nativ portiert sind.
 *
 * Dieser Helper delegiert an die alte CLI via spawnSync — stdout/stderr
 * werden durchgereicht (stdio: 'inherit'), Exit-Code propagiert.
 *
 * Wird vom `command_not_found` Hook aufgerufen: Jeder Command, den oclif
 * nicht kennt, wird automatisch an die alte CLI weitergeleitet.
 *
 * Lifecycle:
 *   CLI-M5(a): Hook + Delegation (dieses Modul) → alle alten Commands funktionieren via v2-Symlink
 *   CLI-M5.1-N: Schrittweise TS-Portierung einzelner Module → native oclif-Commands ersetzen Delegation
 *   CLI-M6: Alte CLI entfernen → legacy.ts + Hook entfernen
 */

import {spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

const LEGACY_CLI_DIR = process.env.INFACTORY_LEGACY_CLI_DIR ?? '/opt/infactory/infactory-cli'
const LEGACY_ENTRY = join(LEGACY_CLI_DIR, 'bin', 'infactory.js')

/**
 * Führt einen Command via die alte CJS-CLI aus.
 *
 * @param args — die kompletten CLI-Args (z.B. ['build', '--preset=agency', '--zip'])
 * @returns Exit-Code (0 = OK, sonst Fehler)
 */
export function runLegacyCommand(args: string[]): number {
  if (!existsSync(LEGACY_ENTRY)) {
    console.error(`\n  ✗ Alte CLI nicht gefunden: ${LEGACY_ENTRY}`)
    console.error(`    Track-B Commands (build/deploy/qa/images/...) werden noch über`)
    console.error(`    die alte CLI ausgeführt, die nicht installiert ist.`)
    console.error(`    Zuerst: curl -fsSL https://studio.xed.dev/install.sh | bash\n`)
    return 1
  }

  const result = spawnSync('node', [LEGACY_ENTRY, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })

  return result.status ?? 1
}
