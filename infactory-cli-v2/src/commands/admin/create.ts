import {Args, Command, Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {countAdmins, setUserRole, sqlite3Query} from '../../lib/admin.js'
import {findSite, SITE_BASE} from '../../lib/config.js'
import {httpPostJson} from '../../lib/http.js'
import {color, icon} from '../../lib/output.js'
import {readPassword} from '../../lib/password.js'
import {isServiceActive} from '../../lib/systemd.js'

// ── Command ────────────────────────────────────────────────────────────────

export default class AdminCreate extends Command {
  /* eslint-disable perfectionist/sort-objects -- CLI-arg order is semantic: tld > email */
  static args = {
    tld: Args.string({
      description: 'TLD der Site (z.B. steirischursprung.at)',
      required: true,
    }),
    email: Args.string({
      description: 'E-Mail-Adresse des Admin-Users',
      required: true,
    }),
  }
  /* eslint-enable perfectionist/sort-objects */
  static description = 'Ersten Admin-User für eine Studio-Payload Site anlegen'
  static examples = [
    '<%= config.bin %> admin create steirischursprung.at admin@example.com',
  ]
  static flags = {
    force: Flags.boolean({
      default: false,
      description: 'Existierenden User zum Admin befördern (ohne Neuanlage)',
    }),
  }

  // eslint-disable-next-line complexity -- Command orchestriert mehrere Prüf- und Mutationsstufen
  async run(): Promise<void> {
    const {args, flags} = await this.parse(AdminCreate)
    const {email, tld} = args

    this.log('')
    this.log(`  ${color.bold}Studio-Payload — Admin-User anlegen${color.nc}`)
    this.log('')

    // ── Voraussetzungen prüfen ─────────────────────────────────────────

    const site = findSite(tld)
    if (!site) {
      this.log(`  ${icon.err} Site ${tld} nicht gefunden in ${SITE_BASE}/`)
      this.log(`  Zuerst einrichten: ${color.bold}infactory site create ${tld}${color.nc}`)
      this.log('')
      this.exit(1)
    }

    if (!site.hasPayload) {
      this.log(`  ${icon.err} Site ${tld} hat kein studio-payload.env`)
      this.log(`  Zuerst: ${color.bold}infactory site create ${tld}${color.nc}`)
      this.log('')
      this.exit(1)
    }

    const dbPath = join(site.dir, 'payload.db')
    if (!existsSync(dbPath)) {
      this.log(`  ${icon.err} DB nicht gefunden: ${dbPath}`)
      this.log(`  Zuerst Install/Update ausführen`)
      this.log('')
      this.exit(1)
    }

    // ── Admin-Count prüfen (nur Ersteinrichtung, außer --force) ────────
    const adminCount = countAdmins(dbPath)
    if (adminCount > 0 && !flags.force) {
      this.log(`  ${icon.err} Es existiert bereits ein Admin-User (${adminCount} gefunden).`)
      this.log(`  Dieser Befehl ist nur für die Ersteinrichtung.`)
      this.log(`  Mit ${color.bold}--force${color.nc} kann ein bestehender User zum Admin befördert werden.`)
      this.log('')
      this.exit(1)
    }

    // ── Service prüfen ─────────────────────────────────────────────────
    if (!isServiceActive(site.payloadService)) {
      this.log(`  ${icon.err} ${site.payloadService} läuft nicht.`)
      this.log(`  Zuerst: ${color.bold}systemctl start ${site.payloadService}${color.nc}`)
      this.log('')
      this.exit(1)
    }

    // ── Interaktive Passwort-Eingabe ───────────────────────────────────
    if (!process.stdin.isTTY) {
      this.log(`  ${icon.err} Dieser Befehl benötigt interaktive Eingabe.`)
      this.log(`  Bitte direkt ausführen (nicht über curl|bash Pipe).`)
      this.log('')
      this.exit(1)
    }

    const password = await readPassword(`  Passwort für ${email}: `)
    if (password.length < 8) {
      this.log(`  ${icon.err} Passwort muss mindestens 8 Zeichen haben.`)
      this.log('')
      this.exit(1)
    }

    const password2 = await readPassword('  Passwort wiederholen: ')
    if (password !== password2) {
      this.log(`  ${icon.err} Passwörter stimmen nicht überein.`)
      this.log('')
      this.exit(1)
    }

    // ── User via better-auth API anlegen ───────────────────────────────
    this.log(`  ${icon.info} Erstelle Admin-User: ${email}...`)

    const response = httpPostJson(
      `http://127.0.0.1:${site.payloadPort}/api/auth/sign-up/email`,
      {email, name: 'Admin', password},
    )

    let userId = ''
    if (response) {
      try {
        const parsed = JSON.parse(response)
        userId = parsed?.user?.id ?? ''
      } catch { /* ignore */ }
    }

    if (userId) {
      this.log(`  ${icon.ok} User erstellt: ID ${userId}`)
    } else if (response?.includes('ALREADY_EXISTS')) {
      this.log(`  ${icon.warn} User ${email} existiert bereits — setze Rolle auf admin`)
    } else if (flags.force) {
      this.log(`  ${icon.warn} User-Erstellung fehlgeschlagen — versuche Rolle direkt zu setzen`)
    } else {
      this.log(`  ${icon.err} User-Erstellung fehlgeschlagen`)
      if (response) this.log(`  Response: ${response}`)
      this.log('')
      this.exit(1)
    }

    // ── Rolle auf admin setzen (SQLite) ────────────────────────────────
    setUserRole(dbPath, email, 'admin')
    const role = sqlite3Query(dbPath, `SELECT role FROM users WHERE email='${email.replaceAll("'", "''")}';`)
    if (role === 'admin') {
      this.log(`  ${icon.ok} Rolle gesetzt: admin`)
    } else {
      this.log(`  ${icon.err} Rolle konnte nicht gesetzt werden (aktuell: ${role || 'nicht gefunden'})`)
      this.log('')
      this.exit(1)
    }

    // ── Zusammenfassung ────────────────────────────────────────────────
    this.log('')
    this.log(`  ${color.green}${color.bold}Admin-User angelegt!${color.nc}`)
    this.log('')
    this.log(`  Email:    ${email}`)
    this.log(`  Rolle:    admin`)
    this.log(`  Login:    https://jam.${tld}/studio/admin/login`)
    this.log('')
  }
}
