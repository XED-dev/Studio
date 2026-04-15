/**
 * admin delete <tld> <email> — User (und seine Sessions/Accounts) löschen
 *
 * Ersetzt: payload.sh admin delete (cmd_admin_delete, Zeilen 787-828)
 *
 * Safety: Verhindert das Löschen des letzten Admin-Users.
 */

import {Args, Command} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {canDegradeOrDelete, deleteUserById, findUserByEmail} from '../../lib/admin.js'
import {findSite, SITE_BASE} from '../../lib/config.js'
import {color, icon} from '../../lib/output.js'

export default class AdminDelete extends Command {
  /* eslint-disable perfectionist/sort-objects -- CLI-arg order is semantic: tld > email */
  static args = {
    tld: Args.string({
      description: 'TLD der Site',
      required: true,
    }),
    email: Args.string({
      description: 'E-Mail-Adresse des zu löschenden Users',
      required: true,
    }),
  }
  /* eslint-enable perfectionist/sort-objects */
static description = 'User löschen (inkl. Sessions und Accounts)'
static examples = [
    '<%= config.bin %> admin delete steirischursprung.at alter-user@example.com',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(AdminDelete)
    const {email, tld} = args

    this.log('')
    this.log(`  ${color.bold}Studio-Payload — User löschen${color.nc}`)
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

    const user = findUserByEmail(dbPath, email)
    if (!user) {
      this.log(`  ${icon.err} User ${email} existiert nicht.`)
      this.log('')
      this.exit(1)
    }

    if (!canDegradeOrDelete(dbPath, email)) {
      this.log(`  ${icon.err} Kann den letzten Admin-User nicht löschen.`)
      this.log('')
      this.exit(1)
    }

    this.log(`  ${icon.info} Lösche User: ${email} (ID ${user.id}, Rolle ${user.role})...`)
    deleteUserById(dbPath, user.id)
    this.log(`  ${icon.ok} User gelöscht`)
    this.log('')
  }
}
