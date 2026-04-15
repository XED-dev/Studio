/**
 * site status — Status-Übersicht aller konfigurierten Sites
 *
 * Ersetzt: payload.sh status (Zeilen 257-289 der Bash-Vorlage)
 *
 * Reine Lesevorgänge: keine Service-Starts, keine Datei-Writes.
 */

import {Command} from '@oclif/core'
import {existsSync} from 'node:fs'

import {discoverSites, INSTALL_DIR_PAYLOAD} from '../../lib/config.js'
import {color, icon} from '../../lib/output.js'
import {headShort, packageVersion} from '../../lib/payload.js'
import {isServiceActive} from '../../lib/systemd.js'

export default class SiteStatus extends Command {
  static description = 'Status aller konfigurierten Sites (Code-Version + Service-Zustand pro TLD)'
static examples = [
    '<%= config.bin %> site status',
  ]

  async run(): Promise<void> {
    this.log('')
    this.log(`  ${color.bold}Studio-Payload Status${color.nc}`)
    this.log('')

    // ── Code-Version ───────────────────────────────────────────────────
    if (!existsSync(INSTALL_DIR_PAYLOAD)) {
      this.log(`  ${icon.err} Nicht installiert: ${INSTALL_DIR_PAYLOAD}`)
      this.log(`  Setup: ${color.bold}infactory site update${color.nc}`)
      this.log('')
      this.exit(1)
    }

    const version = packageVersion(INSTALL_DIR_PAYLOAD)
    const commit = headShort(INSTALL_DIR_PAYLOAD)
    this.log(`  Code:    v${version} (${commit}) in ${INSTALL_DIR_PAYLOAD}/`)
    this.log('')

    // ── Sites ──────────────────────────────────────────────────────────
    const sites = discoverSites().filter((s) => s.hasPayload)

    if (sites.length === 0) {
      this.log(`  ${icon.warn} Keine Sites konfiguriert.`)
      this.log(`  Setup: ${color.bold}infactory site create <tld>${color.nc}`)
      this.log('')
      return
    }

    for (const site of sites) {
      const active = isServiceActive(site.payloadService)
      const statusLabel = active
        ? `${color.green}running${color.nc}`
        : `${color.red}stopped${color.nc}`
      this.log(`  ${site.tld}  Port ${site.payloadPort}  [${statusLabel}]  ${site.payloadService}`)
    }

    this.log('')
  }
}
