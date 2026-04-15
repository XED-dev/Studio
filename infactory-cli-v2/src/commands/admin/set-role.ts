/**
 * admin set-role <tld> <email> <role> — Rolle eines Users ändern (user ↔ admin)
 *
 * Ersetzt: payload.sh admin set-role (cmd_admin_set_role, Zeilen 731-781)
 *
 * Safety: Verhindert Degradierung des letzten Admin-Users.
 */

import {Args, Command} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {canDegradeOrDelete, findUserByEmail, Role, setUserRole} from '../../lib/admin.js'
import {findSite, SITE_BASE} from '../../lib/config.js'
import {color, icon} from '../../lib/output.js'

const VALID_ROLES: Role[] = ['admin', 'user']

export default class AdminSetRole extends Command {
  /* eslint-disable perfectionist/sort-objects -- CLI-arg order is semantic: tld > email > role */
  static args = {
    tld: Args.string({
      description: 'TLD der Site',
      required: true,
    }),
    email: Args.string({
      description: 'E-Mail-Adresse des Users',
      required: true,
    }),
    role: Args.string({
      description: 'Neue Rolle (admin oder user)',
      options: VALID_ROLES,
      required: true,
    }),
  }
  /* eslint-enable perfectionist/sort-objects */
static description = 'Rolle eines Users auf admin oder user setzen'
static examples = [
    '<%= config.bin %> admin set-role steirischursprung.at user@example.com admin',
    '<%= config.bin %> admin set-role steirischursprung.at alt-admin@example.com user',
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(AdminSetRole)
    const {email, role, tld} = args
    const newRole = role as Role

    this.log('')
    this.log(`  ${color.bold}Studio-Payload — Rolle ändern${color.nc}`)
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
      this.log(`  Alle User anzeigen: ${color.bold}infactory admin list ${tld}${color.nc}`)
      this.log('')
      this.exit(1)
    }

    if (user.role === newRole) {
      this.log(`  ${icon.ok} User ${email} hat bereits die Rolle: ${newRole}`)
      this.log('')
      return
    }

    // Safety: Nicht den letzten Admin degradieren
    if (user.role === 'admin' && newRole === 'user' && !canDegradeOrDelete(dbPath, email)) {
      this.log(`  ${icon.err} Kann den letzten Admin-User nicht degradieren.`)
      this.log('')
      this.exit(1)
    }

    setUserRole(dbPath, email, newRole)
    this.log(`  ${icon.ok} ${email}: ${user.role} → ${newRole}`)
    this.log('')
  }
}
