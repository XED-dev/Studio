/**
 * admin reset-password <tld> <email> — Passwort eines Users zurücksetzen
 *
 * Ersetzt: payload.sh admin reset-password (cmd_admin_reset_password, Zeilen 626-725)
 *
 * Verfahren: Da better-auth keinen direkten Passwort-Update exponiert, wird der
 * User gelöscht und unter gleicher Email via /api/auth/sign-up/email neu erstellt.
 * Die Rolle wird aus dem alten User übernommen und nach der Neu-Registrierung
 * wiederhergestellt.
 *
 * Sessions und Accounts werden beim Delete mit entfernt — der User muss sich
 * nach dem Reset neu einloggen.
 */

import {Args, Command} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {deleteUserById, findUserByEmail, Role, setUserRole} from '../../lib/admin.js'
import {findSite, SITE_BASE} from '../../lib/config.js'
import {httpPostJson} from '../../lib/http.js'
import {color, icon} from '../../lib/output.js'
import {readPassword} from '../../lib/password.js'
import {isServiceActive} from '../../lib/systemd.js'

export default class AdminResetPassword extends Command {
  /* eslint-disable perfectionist/sort-objects -- CLI-arg order is semantic: tld > email */
  static args = {
    tld: Args.string({
      description: 'TLD der Site',
      required: true,
    }),
    email: Args.string({
      description: 'E-Mail-Adresse des Users',
      required: true,
    }),
  }
  /* eslint-enable perfectionist/sort-objects */
static description = 'Passwort eines Users zurücksetzen (delete+recreate via better-auth)'
static examples = [
    '<%= config.bin %> admin reset-password steirischursprung.at admin@example.com',
  ]

   
  async run(): Promise<void> {
    const {args} = await this.parse(AdminResetPassword)
    const {email, tld} = args

    this.log('')
    this.log(`  ${color.bold}Studio-Payload — Passwort zurücksetzen${color.nc}`)
    this.log('')

    // ── Voraussetzungen ────────────────────────────────────────────────
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

    if (!isServiceActive(site.payloadService)) {
      this.log(`  ${icon.err} ${site.payloadService} läuft nicht.`)
      this.log(`  Zuerst: ${color.bold}infactory server start ${tld}${color.nc}`)
      this.log('')
      this.exit(1)
    }

    if (!process.stdin.isTTY) {
      this.log(`  ${icon.err} Dieser Befehl benötigt interaktive Eingabe.`)
      this.log(`  Bitte direkt ausführen (nicht über curl|bash Pipe).`)
      this.log('')
      this.exit(1)
    }

    // ── Passwort-Eingabe ───────────────────────────────────────────────
    const password = await readPassword(`  Neues Passwort für ${email}: `)
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

    // ── Reset-Verfahren: delete → recreate → Rolle wiederherstellen ────
    const savedRole = user.role as Role

    this.log(`  ${icon.info} Setze Passwort zurück...`)
    deleteUserById(dbPath, user.id)
    this.log(`  ${icon.ok} Alter User entfernt (ID ${user.id})`)

    const response = httpPostJson(
      `http://127.0.0.1:${site.payloadPort}/api/auth/sign-up/email`,
      {email, name: 'Admin', password},
    )

    let newId = ''
    if (response) {
      try {
        const parsed = JSON.parse(response)
        newId = parsed?.user?.id ?? ''
      } catch { /* ignore */ }
    }

    if (!newId) {
      this.log(`  ${icon.err} User-Neu-Erstellung fehlgeschlagen.`)
      if (response) this.log(`  Response: ${response}`)
      this.log('')
      this.exit(1)
    }

    // Rolle aus dem alten Datensatz wiederherstellen
    setUserRole(dbPath, email, savedRole)
    this.log(`  ${icon.ok} Passwort zurückgesetzt, Rolle: ${savedRole}`)

    this.log('')
    this.log(`  ${color.green}${color.bold}Passwort erfolgreich geändert!${color.nc}`)
    this.log('')
    this.log(`  Email:    ${email}`)
    this.log(`  Rolle:    ${savedRole}`)
    this.log(`  Login:    https://jam.${tld}/studio/admin/login`)
    this.log('')
  }
}
