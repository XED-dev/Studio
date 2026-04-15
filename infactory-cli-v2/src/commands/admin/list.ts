/**
 * admin list <tld> — Alle User einer Studio-Payload Site anzeigen
 *
 * Ersetzt: payload.sh admin list (cmd_admin_list, Zeilen 601-620)
 */

import {Args, Command} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {listUsers} from '../../lib/admin.js'
import {findSite, SITE_BASE} from '../../lib/config.js'
import {color, icon} from '../../lib/output.js'

export default class AdminList extends Command {
  static args = {
    tld: Args.string({
      description: 'TLD der Site (z.B. steirischursprung.at)',
      required: true,
    }),
  }
static description = 'Alle User einer Studio-Payload Site anzeigen'
static examples = [
    '<%= config.bin %> admin list steirischursprung.at',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(AdminList)
    const {tld} = args

    this.log('')
    this.log(`  ${color.bold}Studio-Payload — User-Liste${color.nc} (${tld})`)
    this.log('')

    const site = findSite(tld)
    if (!site) {
      this.log(`  ${icon.err} Site ${tld} nicht gefunden in ${SITE_BASE}/`)
      this.log('')
      this.exit(1)
    }

    const dbPath = join(site.dir, 'payload.db')
    if (!existsSync(dbPath)) {
      this.log(`  ${icon.err} DB nicht gefunden: ${dbPath}`)
      this.log('')
      this.exit(1)
    }

    const users = listUsers(dbPath)
    if (users.length === 0) {
      this.log(`  ${icon.warn} Keine User in der DB.`)
      this.log('')
      return
    }

    this.log(`  ${color.bold}ID  | Rolle  | Email                        | Erstellt${color.nc}`)
    this.log('  ----|--------|------------------------------|--------------------')
    for (const u of users) {
      this.log(`  ${u.id.padEnd(4)}| ${u.role.padEnd(7)}| ${u.email.padEnd(29)}| ${u.createdAt}`)
    }

    this.log('')
  }
}
