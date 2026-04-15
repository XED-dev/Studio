/**
 * test/commands/admin/reset-password.test.ts — Smoke-Tests für `admin reset-password`
 *
 * Der Command öffnet eine interaktive Passwort-Eingabe — das lässt sich ohne
 * echten TTY nicht vollständig smoke-testen. Hier nur Help + Early-Exit vor
 * der TTY-Prüfung.
 */

import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

describe('admin reset-password', () => {
  it('rendert Help ohne Crash', async () => {
    const {stdout} = await runCommand('admin reset-password --help', undefined, {stripAnsi: true})
    expect(stdout).to.contain('Passwort eines Users zurücksetzen')
  })

  it('USAGE zeigt Args in Reihenfolge TLD EMAIL (Regression-Schutz)', async () => {
    const {stdout} = await runCommand('admin reset-password --help', undefined, {stripAnsi: true})
    expect(stdout).to.match(/admin reset-password\s+TLD\s+EMAIL/)
  })

  it('exited mit Fehler bei fehlenden Args', async () => {
    const {error} = await runCommand('admin reset-password', undefined, {stripAnsi: true})
    expect(error?.message).to.match(/missing|required/i)
  })

  it('exited mit "nicht gefunden" bei unbekannter TLD', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'infactory-admin-reset-password-'))
    process.env.INFACTORY_SITE_BASE = tmp
    try {
      const {error, stdout} = await runCommand(
        'admin reset-password unknown.at user@test.com',
        undefined, {stripAnsi: true},
      )
      expect(stdout).to.contain('nicht gefunden')
      expect(error?.oclif?.exit).to.equal(1)
    } finally {
      delete process.env.INFACTORY_SITE_BASE
      rmSync(tmp, {force: true, recursive: true})
    }
  })
})
